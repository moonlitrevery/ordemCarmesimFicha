-- Mesa (VTT) — Fase 4: chat da sessão, rolagens e tempo real das fichas
-- Rode no SQL Editor do Supabase (depois da 010)

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  author_name text not null,
  character_id uuid references public.characters(id) on delete set null,
  character_name text,
  kind text not null default 'text' check (kind in ('text', 'roll', 'whisper', 'system')),
  body text not null default '' check (char_length(body) <= 2000),
  roll jsonb check (
    roll is null or (jsonb_typeof(roll) = 'object' and pg_column_size(roll) <= 8192)
  ),
  hidden boolean not null default false,
  whisper_to uuid references public.profiles(id) on delete set null,
  deleted boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_table_created_idx
  on public.chat_messages (table_id, created_at desc);

-- ========== REGRAS QUE O RLS NÃO ALCANÇA ==========
-- Nome do autor e do personagem vêm do banco: ninguém escreve em nome de outro.
create or replace function public.guard_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_character_name text;
begin
  if tg_op = 'UPDATE' then
    -- Apagar apaga mesmo: o RLS deixaria o autor ler o texto antigo.
    if new.deleted then
      new.body := '';
      new.roll := null;
    end if;
    return new;
  end if;

  select display_name into new.author_name from public.profiles where id = new.author_id;
  if new.author_name is null then
    raise exception 'forbidden';
  end if;

  new.character_name := null;
  if new.character_id is not null then
    select name into v_character_name
    from public.characters
    where id = new.character_id
      and (owner_id = new.author_id or public.is_table_gm(new.table_id));
    if v_character_name is null then
      raise exception 'forbidden';
    end if;
    new.character_name := v_character_name;
  end if;

  if new.kind = 'system' and not public.is_table_gm(new.table_id) then
    raise exception 'forbidden';
  end if;
  if (new.kind = 'roll') <> (new.roll is not null) then
    raise exception 'invalid_message';
  end if;
  if new.hidden and new.kind <> 'roll' then
    raise exception 'invalid_message';
  end if;
  if (new.kind = 'whisper') <> (new.whisper_to is not null) then
    raise exception 'invalid_message';
  end if;
  if new.whisper_to is not null and not exists (
    select 1 from public.tables where id = new.table_id and owner_id = new.whisper_to
    union all
    select 1 from public.table_members
    where table_id = new.table_id and user_id = new.whisper_to and banned = false
  ) then
    raise exception 'invalid_whisper';
  end if;

  return new;
end;
$$;

drop trigger if exists chat_messages_guard on public.chat_messages;
create trigger chat_messages_guard
  before insert or update on public.chat_messages
  for each row execute function public.guard_chat_message();

-- ========== RPCs ==========
-- `characters` só mostra as próprias fichas ao jogador. O /shiu precisa só dos
-- nomes dos personagens de quem divide esta mesa.
create or replace function public.table_character_names(p_table uuid)
returns table (owner_id uuid, name text)
language sql
stable
security definer
set search_path = public
as $$
  select c.owner_id, c.name
  from public.characters c
  where (public.is_table_gm(p_table) or public.is_table_member(p_table))
    and (
      c.owner_id = (select t.owner_id from public.tables t where t.id = p_table)
      or exists (
        select 1 from public.table_members m
        where m.table_id = p_table and m.user_id = c.owner_id and m.banned = false
      )
    );
$$;

revoke all on function public.guard_chat_message() from public, anon;
revoke all on function public.table_character_names(uuid) from public, anon;
grant execute on function public.table_character_names(uuid) to authenticated;

-- ========== PRIVILÉGIOS POR COLUNA ==========
-- Depois de criada, a mensagem só muda para apagada.
revoke all on public.chat_messages from anon, authenticated;
grant select on public.chat_messages to authenticated;
grant insert (table_id, author_id, character_id, kind, body, roll, hidden, whisper_to)
  on public.chat_messages to authenticated;
grant update (deleted) on public.chat_messages to authenticated;

-- ========== RLS ==========
alter table public.chat_messages enable row level security;

drop policy if exists "chat_messages_select" on public.chat_messages;
create policy "chat_messages_select" on public.chat_messages
  for select to authenticated
  using (
    public.is_table_gm(table_id)
    or (
      public.is_table_member(table_id)
      and (hidden = false or author_id = auth.uid())
      and (whisper_to is null or whisper_to = auth.uid() or author_id = auth.uid())
    )
  );

drop policy if exists "chat_messages_insert" on public.chat_messages;
create policy "chat_messages_insert" on public.chat_messages
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and (public.is_table_gm(table_id) or public.is_table_member(table_id))
  );

drop policy if exists "chat_messages_update" on public.chat_messages;
create policy "chat_messages_update" on public.chat_messages
  for update to authenticated
  using (
    public.is_table_gm(table_id)
    or (author_id = auth.uid() and public.is_table_member(table_id))
  )
  with check (deleted = true);

-- ========== REALTIME ==========
-- O RLS acima vale também para o que cada um recebe (ignore se já estiver).
do $$
begin
  alter publication supabase_realtime add table public.chat_messages;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.characters;
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
