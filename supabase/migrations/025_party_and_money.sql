-- Fase 14: dinheiro com histórico, inventário e caixa da party, URL de foto longa.
--
-- Tudo que mexe em dois lugares (ficha + party, saldo + histórico) passa por RPC
-- `security definer`, numa transação só. As RPCs travam sempre a ficha primeiro e
-- depois a linha da party, então duas delas nunca esperam uma pela outra em ciclo.

-- ========== FICHA: FOTO ==========
-- A coluna sempre foi `text` sem limite. O teto é só pra ninguém gravar um megabyte ali.
alter table public.characters drop constraint if exists characters_image_url_length;
alter table public.characters add constraint characters_image_url_length
  check (image_url is null or char_length(image_url) <= 2048);

-- ========== FICHA: VERSÃO DA MOCHILA ==========
-- Sobe a cada mudança de `inventory` ou `money`, venha de onde vier. O save automático
-- só grava a mochila com `.eq('backpack_rev', <a que ele leu>)`: se uma RPC (ou outra
-- aba) mexeu antes, o update não pega linha nenhuma e o cliente relê, em vez de
-- regravar o valor velho por cima.
alter table public.characters
  add column if not exists backpack_rev int not null default 0;

create or replace function public.bump_backpack_rev()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.inventory is distinct from old.inventory or new.money is distinct from old.money then
    new.backpack_rev := old.backpack_rev + 1;
  else
    -- Quem manda o número não escolhe a versão.
    new.backpack_rev := old.backpack_rev;
  end if;
  return new;
end;
$$;

drop trigger if exists characters_backpack_rev on public.characters;
create trigger characters_backpack_rev
  before update on public.characters
  for each row execute function public.bump_backpack_rev();

-- ========== AUXILIARES ==========
create or replace function public.can_edit_character(p_character uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.characters
    where id = p_character and (owner_id = auth.uid() or public.is_mestre())
  );
$$;

-- Peso de um item do jsonb da ficha. Aceita negativo (mochila militar: −2).
create or replace function public.inventory_weight_of(p_item jsonb)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when (p_item->>'weight') ~ '^-?[0-9]+([.][0-9]+)?$' then (p_item->>'weight')::numeric
    else 0
  end;
$$;

-- Item antigo não tem `qty`: conta como 1.
create or replace function public.inventory_qty_of(p_item jsonb)
returns int
language sql
immutable
set search_path = public
as $$
  select case
    when (p_item->>'qty') ~ '^[0-9]{1,6}$' then greatest(1, (p_item->>'qty')::int)
    else 1
  end;
$$;

create or replace function public.my_display_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select display_name from public.profiles where id = auth.uid()), 'Alguém');
$$;

revoke all on function public.can_edit_character(uuid) from public, anon;
revoke all on function public.my_display_name() from public, anon;
grant execute on function public.can_edit_character(uuid) to authenticated;
grant execute on function public.my_display_name() to authenticated;
grant execute on function public.inventory_weight_of(jsonb) to authenticated;
grant execute on function public.inventory_qty_of(jsonb) to authenticated;

-- ========== TABELAS ==========
create table if not exists public.character_money_log (
  id bigint generated always as identity primary key,
  character_id uuid not null references public.characters(id) on delete cascade,
  delta numeric(14,2) not null,
  balance numeric(14,2) not null,
  reason text check (char_length(reason) <= 80),
  author_id uuid references public.profiles(id) on delete set null,
  author_name text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists character_money_log_character_idx
  on public.character_money_log (character_id, id desc);

create table if not exists public.party_items (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  qty int not null default 1 check (qty between 1 and 9999),
  -- Só informativo: não conta pra carga de ninguém. Nulo = sem peso informado.
  weight numeric(8,2) check (weight between -9999 and 9999),
  note text not null default '' check (char_length(note) <= 200),
  added_by uuid references public.profiles(id) on delete set null,
  added_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists party_items_table_idx on public.party_items (table_id, created_at);

create table if not exists public.party_cash (
  table_id uuid primary key references public.tables(id) on delete cascade,
  money numeric(14,2) not null default 0 check (money >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.party_money_log (
  id bigint generated always as identity primary key,
  table_id uuid not null references public.tables(id) on delete cascade,
  delta numeric(14,2) not null,
  balance numeric(14,2) not null,
  reason text check (char_length(reason) <= 80),
  author_id uuid references public.profiles(id) on delete set null,
  author_name text not null default '',
  -- Depósito/saque: de qual ficha saiu ou pra qual foi.
  character_name text,
  created_at timestamptz not null default now()
);
create index if not exists party_money_log_table_idx on public.party_money_log (table_id, id desc);

-- Quem adicionou vem da sessão, nunca do cliente.
create or replace function public.stamp_party_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.added_by := auth.uid();
    new.added_by_name := public.my_display_name();
  else
    new.table_id := old.table_id;
    new.added_by := old.added_by;
    new.added_by_name := old.added_by_name;
  end if;
  new.name := trim(new.name);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists party_items_stamp on public.party_items;
create trigger party_items_stamp
  before insert or update on public.party_items
  for each row execute function public.stamp_party_item();

revoke all on function public.stamp_party_item() from public, anon;

-- ========== RPCs ==========
-- Gastar/Receber da ficha. Gastar não deixa o saldo ficar negativo; dívida se
-- digita direto no campo.
create or replace function public.move_character_money(
  p_character uuid,
  p_delta numeric,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta numeric := round(p_delta, 2);
  v_row public.characters%rowtype;
begin
  if v_delta is null or v_delta = 0 or abs(v_delta) > 100000000000 then
    raise exception 'quantia_invalida';
  end if;
  select * into v_row from public.characters where id = p_character for update;
  if not found or not (v_row.owner_id = auth.uid() or public.is_mestre()) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if v_delta < 0 and v_row.money + v_delta < 0 then
    raise exception 'saldo_insuficiente';
  end if;

  update public.characters set money = money + v_delta
  where id = p_character
  returning * into v_row;

  insert into public.character_money_log (character_id, delta, balance, reason, author_id, author_name)
  values (p_character, v_delta, v_row.money, nullif(left(trim(p_reason), 80), ''), auth.uid(), public.my_display_name());

  delete from public.character_money_log
  where character_id = p_character
    and id not in (
      select id from public.character_money_log
      where character_id = p_character order by id desc limit 20
    );

  return jsonb_build_object(
    'inventory', v_row.inventory, 'money', v_row.money, 'backpack_rev', v_row.backpack_rev
  );
end;
$$;

-- Gastar/Receber do caixa e, com `p_character`, Depositar (delta > 0: sai da ficha,
-- entra no caixa) e Sacar (delta < 0: sai do caixa, entra na ficha).
create or replace function public.party_cash_move(
  p_table uuid,
  p_delta numeric,
  p_reason text default null,
  p_character uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta numeric := round(p_delta, 2);
  v_reason text := nullif(left(trim(p_reason), 80), '');
  v_cash numeric;
  v_row public.characters%rowtype;
  v_name text := public.my_display_name();
begin
  if public.table_upload_role(p_table) is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if v_delta is null or v_delta = 0 or abs(v_delta) > 100000000000 then
    raise exception 'quantia_invalida';
  end if;

  if p_character is not null then
    select * into v_row from public.characters where id = p_character for update;
    if not found or not (v_row.owner_id = auth.uid() or public.is_mestre()) then
      raise exception 'sem_permissao' using errcode = '42501';
    end if;
    if v_delta > 0 and v_row.money - v_delta < 0 then
      raise exception 'saldo_insuficiente';
    end if;
  end if;

  insert into public.party_cash (table_id) values (p_table) on conflict do nothing;
  select money into v_cash from public.party_cash where table_id = p_table for update;
  if v_delta < 0 and v_cash + v_delta < 0 then
    raise exception 'caixa_insuficiente';
  end if;

  update public.party_cash set money = money + v_delta, updated_at = now()
  where table_id = p_table
  returning money into v_cash;

  if p_character is not null then
    update public.characters set money = money - v_delta
    where id = p_character
    returning * into v_row;
    insert into public.character_money_log (character_id, delta, balance, reason, author_id, author_name)
    values (
      p_character, -v_delta, v_row.money,
      coalesce(v_reason, case when v_delta > 0 then 'Depósito no caixa' else 'Saque do caixa' end),
      auth.uid(), v_name
    );
    delete from public.character_money_log
    where character_id = p_character
      and id not in (
        select id from public.character_money_log
        where character_id = p_character order by id desc limit 20
      );
  end if;

  insert into public.party_money_log (table_id, delta, balance, reason, author_id, author_name, character_name)
  values (p_table, v_delta, v_cash, v_reason, auth.uid(), v_name, v_row.name);

  delete from public.party_money_log
  where table_id = p_table
    and id not in (
      select id from public.party_money_log
      where table_id = p_table order by id desc limit 20
    );

  return jsonb_build_object(
    'cash', v_cash,
    'inventory', v_row.inventory,
    'money', v_row.money,
    'backpack_rev', v_row.backpack_rev
  );
end;
$$;

-- Mochila → party. `p_name` confere que o índice ainda é do mesmo item (a lista
-- pode ter mudado em outra aba).
create or replace function public.party_send_item(
  p_table uuid,
  p_character uuid,
  p_index int,
  p_name text,
  p_qty int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.characters%rowtype;
  v_inv jsonb;
  v_item jsonb;
  v_have int;
  v_name text;
  v_weight numeric;
  v_note text;
  v_existing uuid;
begin
  if public.table_upload_role(p_table) is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  select * into v_row from public.characters where id = p_character for update;
  if not found or not (v_row.owner_id = auth.uid() or public.is_mestre()) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  v_inv := case when jsonb_typeof(v_row.inventory) = 'array' then v_row.inventory else '[]'::jsonb end;
  if p_index is null or p_index < 0 or p_index >= jsonb_array_length(v_inv) then
    raise exception 'item_mudou';
  end if;
  v_item := v_inv -> p_index;
  if v_item->>'name' is distinct from p_name then
    raise exception 'item_mudou';
  end if;
  v_name := left(trim(coalesce(v_item->>'name', '')), 120);
  if v_name = '' then
    raise exception 'item_mudou';
  end if;
  v_have := public.inventory_qty_of(v_item);
  if p_qty is null or p_qty < 1 or p_qty > v_have or p_qty > 9999 then
    raise exception 'quantidade_invalida';
  end if;

  if p_qty = v_have then
    v_inv := v_inv - p_index;
  else
    v_inv := jsonb_set(v_inv, array[p_index::text], v_item || jsonb_build_object('qty', v_have - p_qty));
  end if;

  v_weight := greatest(-9999, least(9999, round(public.inventory_weight_of(v_item), 2)));
  v_note := left(coalesce(v_item->>'description', ''), 200);

  -- Mesmo item já na party: soma em vez de duplicar a linha.
  select id into v_existing from public.party_items
  where table_id = p_table
    and lower(name) = lower(v_name)
    and weight is not distinct from v_weight
    and note = v_note
    and qty + p_qty <= 9999
  limit 1
  for update;

  if v_existing is not null then
    update public.party_items set qty = qty + p_qty where id = v_existing;
  else
    insert into public.party_items (table_id, name, qty, weight, note)
    values (p_table, v_name, p_qty, v_weight, v_note);
  end if;

  update public.characters set inventory = v_inv
  where id = p_character
  returning * into v_row;

  return jsonb_build_object(
    'inventory', v_row.inventory, 'money', v_row.money, 'backpack_rev', v_row.backpack_rev
  );
end;
$$;

-- Party → mochila de quem clicou.
create or replace function public.party_take_item(
  p_item uuid,
  p_character uuid,
  p_qty int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table uuid;
  v_it public.party_items%rowtype;
  v_row public.characters%rowtype;
  v_inv jsonb;
  v_entry jsonb;
  v_idx int;
  i int;
begin
  -- Sem trava aqui: só pra saber a mesa. A ficha trava antes do item (ordem fixa).
  select table_id into v_table from public.party_items where id = p_item;
  if v_table is null then
    raise exception 'item_mudou';
  end if;
  if public.table_upload_role(v_table) is null then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  select * into v_row from public.characters where id = p_character for update;
  if not found or not (v_row.owner_id = auth.uid() or public.is_mestre()) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  select * into v_it from public.party_items where id = p_item for update;
  if not found then
    raise exception 'item_mudou';
  end if;
  if p_qty is null or p_qty < 1 or p_qty > v_it.qty then
    raise exception 'quantidade_invalida';
  end if;

  v_inv := case when jsonb_typeof(v_row.inventory) = 'array' then v_row.inventory else '[]'::jsonb end;
  v_idx := null;
  for i in 0 .. jsonb_array_length(v_inv) - 1 loop
    v_entry := v_inv -> i;
    if lower(coalesce(v_entry->>'name', '')) = lower(v_it.name)
      and public.inventory_weight_of(v_entry) = coalesce(v_it.weight, 0)
      and coalesce(v_entry->>'description', '') = v_it.note then
      v_idx := i;
      exit;
    end if;
  end loop;

  if v_idx is null then
    v_inv := v_inv || jsonb_build_array(jsonb_build_object(
      'name', v_it.name,
      'description', v_it.note,
      'weight', coalesce(v_it.weight, 0),
      'qty', p_qty
    ));
  else
    v_entry := v_inv -> v_idx;
    v_inv := jsonb_set(
      v_inv, array[v_idx::text],
      v_entry || jsonb_build_object('qty', public.inventory_qty_of(v_entry) + p_qty)
    );
  end if;

  if p_qty = v_it.qty then
    delete from public.party_items where id = p_item;
  else
    update public.party_items set qty = qty - p_qty where id = p_item;
  end if;

  update public.characters set inventory = v_inv
  where id = p_character
  returning * into v_row;

  return jsonb_build_object(
    'inventory', v_row.inventory, 'money', v_row.money, 'backpack_rev', v_row.backpack_rev
  );
end;
$$;

revoke all on function public.move_character_money(uuid, numeric, text) from public, anon;
revoke all on function public.party_cash_move(uuid, numeric, text, uuid) from public, anon;
revoke all on function public.party_send_item(uuid, uuid, int, text, int) from public, anon;
revoke all on function public.party_take_item(uuid, uuid, int) from public, anon;
grant execute on function public.move_character_money(uuid, numeric, text) to authenticated;
grant execute on function public.party_cash_move(uuid, numeric, text, uuid) to authenticated;
grant execute on function public.party_send_item(uuid, uuid, int, text, int) to authenticated;
grant execute on function public.party_take_item(uuid, uuid, int) to authenticated;

-- ========== PRIVILÉGIOS POR COLUNA ==========
-- Histórico e caixa só mudam pelas RPCs acima.
revoke all on public.character_money_log from anon, authenticated;
revoke all on public.party_cash from anon, authenticated;
revoke all on public.party_money_log from anon, authenticated;
revoke all on public.party_items from anon, authenticated;
grant select on public.character_money_log to authenticated;
grant select on public.party_cash to authenticated;
grant select on public.party_money_log to authenticated;
grant select, delete on public.party_items to authenticated;
grant insert (table_id, name, qty, weight, note) on public.party_items to authenticated;
grant update (name, qty, weight, note) on public.party_items to authenticated;

-- ========== RLS ==========
-- Ver: dona da mesa e todo membro (espectador incluído). Mexer: dona e jogadores.
alter table public.character_money_log enable row level security;
alter table public.party_items enable row level security;
alter table public.party_cash enable row level security;
alter table public.party_money_log enable row level security;

drop policy if exists "character_money_log_select" on public.character_money_log;
create policy "character_money_log_select" on public.character_money_log
  for select to authenticated
  using (
    exists (
      select 1 from public.characters c
      where c.id = character_money_log.character_id
        and (c.owner_id = (select auth.uid()) or (select public.is_mestre()))
    )
  );

drop policy if exists "party_items_select" on public.party_items;
create policy "party_items_select" on public.party_items
  for select to authenticated
  using (public.is_table_gm(table_id) or public.is_table_member(table_id));

drop policy if exists "party_items_insert" on public.party_items;
create policy "party_items_insert" on public.party_items
  for insert to authenticated
  with check (public.table_upload_role(table_id) is not null);

drop policy if exists "party_items_update" on public.party_items;
create policy "party_items_update" on public.party_items
  for update to authenticated
  using (public.table_upload_role(table_id) is not null)
  with check (public.table_upload_role(table_id) is not null);

drop policy if exists "party_items_delete" on public.party_items;
create policy "party_items_delete" on public.party_items
  for delete to authenticated
  using (public.table_upload_role(table_id) is not null);

drop policy if exists "party_cash_select" on public.party_cash;
create policy "party_cash_select" on public.party_cash
  for select to authenticated
  using (public.is_table_gm(table_id) or public.is_table_member(table_id));

drop policy if exists "party_money_log_select" on public.party_money_log;
create policy "party_money_log_select" on public.party_money_log
  for select to authenticated
  using (public.is_table_gm(table_id) or public.is_table_member(table_id));

-- ========== REALTIME ==========
do $$
begin
  alter publication supabase_realtime add table public.party_items;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.party_cash;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.party_money_log;
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
