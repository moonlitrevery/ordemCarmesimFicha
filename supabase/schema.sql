-- ========== Ordem Carmesim — Schema completo ==========
-- Rode no SQL Editor do Supabase na ordem abaixo.

-- ========== TIPOS ==========
create type user_role as enum ('mestre', 'jogador');

create type element_type as enum (
  'fogo', 'agua', 'terra', 'ar', 'sangue',
  'encantamento', 'veneno', 'gelo', 'eletricidade',
  'luz', 'sombra'
);

-- ========== PROFILES ==========
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  display_name text not null,
  role user_role not null default 'jogador',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', new.email),
    'jogador'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.is_mestre()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'mestre'
  );
$$;

-- ========== CHARACTERS ==========
create table public.characters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,

  name text not null,
  occupation text,
  age int,
  pronouns text,
  birthplace text,
  residence text,
  image_url text,

  arcana text,
  subarcana text,

  attributes jsonb not null default '{"FOR":10,"CON":10,"DES":10,"INT":10,"EDU":10,"CAR":10,"POD":10}'::jsonb,

  hp_current int not null default 0,
  hp_max int not null default 0,
  mana_current int not null default 0,
  mana_max int not null default 0,
  sanity_current int not null default 0,
  sanity_max int not null default 0,

  skills jsonb not null default '[]'::jsonb,
  spells jsonb not null default '[]'::jsonb,
  weapons jsonb not null default '[]'::jsonb,
  inventory jsonb not null default '[]'::jsonb,
  money numeric(14,2) not null default 0,
  armor jsonb not null default '[]'::jsonb,
  curses jsonb not null default '[]'::jsonb,
  historical_feats jsonb not null default '[]'::jsonb,
  milestone_notes jsonb not null default '{}'::jsonb,
  resource_mods jsonb not null default '{"hp":0,"mana":0,"sanity":0}'::jsonb,

  notes text,
  backstory text,

  is_order_agent boolean not null default true,
  order_rank text default 'Agente Principiante',

  attribute_points_spent int not null default 0,
  skill_points_spent jsonb not null default '{"basico":0,"medio":0,"alto":0,"expert":0}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ========== CHARACTER ELEMENTS ==========
create table public.character_elements (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  element element_type not null,
  level int not null default 0 check (level >= 0 and level <= 20),
  fragments_current int not null default 0 check (fragments_current >= 0),
  unique (character_id, element)
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger characters_set_updated_at
  before update on public.characters
  for each row execute procedure public.set_updated_at();

-- ========== RLS ==========
alter table public.profiles enable row level security;
alter table public.characters enable row level security;
alter table public.character_elements enable row level security;

create policy "profiles_select" on public.profiles
  for select using (auth.uid() = id or public.is_mestre());

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

create policy "characters_select" on public.characters
  for select using (owner_id = auth.uid() or public.is_mestre());

create policy "characters_insert" on public.characters
  for insert with check (owner_id = auth.uid());

create policy "characters_update" on public.characters
  for update using (owner_id = auth.uid() or public.is_mestre());

create policy "characters_delete" on public.characters
  for delete using (owner_id = auth.uid());

create policy "character_elements_select" on public.character_elements
  for select using (
    exists (
      select 1 from public.characters c
      where c.id = character_elements.character_id
        and (c.owner_id = auth.uid() or public.is_mestre())
    )
  );

create policy "character_elements_write" on public.character_elements
  for all using (
    exists (
      select 1 from public.characters c
      where c.id = character_elements.character_id
        and (c.owner_id = auth.uid() or public.is_mestre())
    )
  );

-- ========== MESA (VTT) — ver migrations/007_vtt_tables.sql ==========
create table if not exists public.tables (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  code text not null unique,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  session_open boolean not null default false,
  -- FK para scenes entra na fase em que a tabela de cenas for criada
  default_scene_id uuid,
  initiative jsonb not null default '{"entries":[],"current":0,"round":1}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.table_members (
  table_id uuid not null references public.tables(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'jogador' check (role in ('jogador', 'espectador')),
  -- FK para scenes entra na fase em que a tabela de cenas for criada
  scene_id uuid,
  banned boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (table_id, user_id)
);

create index if not exists tables_owner_id_idx on public.tables (owner_id);
create index if not exists table_members_user_id_idx on public.table_members (user_id);

-- ========== CÓDIGO ==========
-- 32 símbolos (sem 0/O/1/I): byte % 32 não tem viés.
create or replace function public.gen_table_code()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  random_bytes bytea;
  candidate text;
begin
  loop
    random_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    candidate := '';
    for i in 0..5 loop
      candidate := candidate || substr(alphabet, (get_byte(random_bytes, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.tables where code = candidate);
  end loop;
  return candidate;
end;
$$;

alter table public.tables alter column code set default public.gen_table_code();

-- ========== FUNÇÕES AUXILIARES ==========
create or replace function public.is_table_member(p_table uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.table_members
    where table_id = p_table and user_id = auth.uid() and banned = false
  );
$$;

create or replace function public.is_table_gm(p_table uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tables
    where id = p_table and owner_id = auth.uid()
  );
$$;

-- Permite ver nome de quem divide mesa comigo (profiles só libera a si mesmo e à mestra).
create or replace function public.shares_table_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select id as table_id from public.tables where owner_id = auth.uid()
    union
    select table_id from public.table_members
    where user_id = auth.uid() and banned = false
  )
  select
    exists (
      select 1 from public.tables t
      join mine on mine.table_id = t.id
      where t.owner_id = p_user
    )
    or exists (
      select 1 from public.table_members m
      join mine on mine.table_id = m.table_id
      where m.user_id = p_user and m.banned = false
    );
$$;

create or replace function public.can_access_table_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_table uuid;
begin
  if p_topic !~ '^mesa:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_table := substr(p_topic, 6)::uuid;
  return public.is_table_gm(v_table) or public.is_table_member(v_table);
end;
$$;

-- ========== RPCs ==========
create or replace function public.join_table(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_table uuid;
  v_owner uuid;
  v_banned boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select id, owner_id into v_table, v_owner
  from public.tables
  where code = upper(trim(p_code));

  if v_table is null then
    raise exception 'invalid_code';
  end if;

  if v_owner = v_uid then
    return v_table;
  end if;

  select banned into v_banned
  from public.table_members
  where table_id = v_table and user_id = v_uid;

  if v_banned then
    raise exception 'banned';
  end if;

  -- do nothing: quem já é membro mantém o papel (espectador não vira jogador)
  insert into public.table_members (table_id, user_id)
  values (v_table, v_uid)
  on conflict (table_id, user_id) do nothing;

  return v_table;
end;
$$;

create or replace function public.regenerate_table_code(p_table uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if not public.is_table_gm(p_table) then
    raise exception 'forbidden';
  end if;

  loop
    begin
      update public.tables
      set code = public.gen_table_code()
      where id = p_table
      returning code into v_code;
      return v_code;
    exception
      when unique_violation then null;
    end;
  end loop;
end;
$$;

-- tables.code não é legível por coluna: a mestra lê os códigos por aqui.
create or replace function public.get_my_table_codes()
returns table (table_id uuid, code text)
language sql
stable
security definer
set search_path = public
as $$
  select id, code from public.tables where owner_id = auth.uid();
$$;

revoke all on function public.gen_table_code() from public, anon;
revoke all on function public.is_table_member(uuid) from public, anon;
revoke all on function public.is_table_gm(uuid) from public, anon;
revoke all on function public.shares_table_with(uuid) from public, anon;
revoke all on function public.can_access_table_topic(text) from public, anon;
revoke all on function public.join_table(text) from public, anon;
revoke all on function public.regenerate_table_code(uuid) from public, anon;
revoke all on function public.get_my_table_codes() from public, anon;

grant execute on function public.gen_table_code() to authenticated;
grant execute on function public.is_table_member(uuid) to authenticated;
grant execute on function public.is_table_gm(uuid) to authenticated;
grant execute on function public.shares_table_with(uuid) to authenticated;
grant execute on function public.can_access_table_topic(text) to authenticated;
grant execute on function public.join_table(text) to authenticated;
grant execute on function public.regenerate_table_code(uuid) to authenticated;
grant execute on function public.get_my_table_codes() to authenticated;

-- ========== PRIVILÉGIOS POR COLUNA ==========
-- RLS filtra linhas, não colunas: sem isto todo membro leria tables.code.
-- Consequência: select('*') em tables falha; liste as colunas.
revoke all on public.tables from anon, authenticated;
grant select (id, name, owner_id, session_open, default_scene_id, initiative, created_at)
  on public.tables to authenticated;
grant insert (name, owner_id) on public.tables to authenticated;
grant update (name, session_open, default_scene_id, initiative) on public.tables to authenticated;
grant delete on public.tables to authenticated;

-- Entrada só via join_table: sem insert. table_id/user_id são imutáveis.
revoke all on public.table_members from anon, authenticated;
grant select, delete on public.table_members to authenticated;
grant update (role, scene_id, banned) on public.table_members to authenticated;

-- ========== RLS ==========
alter table public.tables enable row level security;
alter table public.table_members enable row level security;

drop policy if exists "tables_select" on public.tables;
create policy "tables_select" on public.tables
  for select to authenticated
  using (owner_id = auth.uid() or public.is_table_member(id));

drop policy if exists "tables_insert" on public.tables;
create policy "tables_insert" on public.tables
  for insert to authenticated
  with check (owner_id = auth.uid() and public.is_mestre());

drop policy if exists "tables_update" on public.tables;
create policy "tables_update" on public.tables
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "tables_delete" on public.tables;
create policy "tables_delete" on public.tables
  for delete to authenticated
  using (owner_id = auth.uid());

drop policy if exists "table_members_select" on public.table_members;
create policy "table_members_select" on public.table_members
  for select to authenticated
  using (
    public.is_table_gm(table_id)
    or (banned = false and public.is_table_member(table_id))
  );

drop policy if exists "table_members_update" on public.table_members;
create policy "table_members_update" on public.table_members
  for update to authenticated
  using (public.is_table_gm(table_id))
  with check (public.is_table_gm(table_id));

drop policy if exists "table_members_delete" on public.table_members;
create policy "table_members_delete" on public.table_members
  for delete to authenticated
  using (public.is_table_gm(table_id));

drop policy if exists "profiles_select_table_peers" on public.profiles;
create policy "profiles_select_table_peers" on public.profiles
  for select to authenticated
  using (public.shares_table_with(id));

-- ========== REALTIME AUTHORIZATION ==========
-- Canal privado mesa:{id}: só a dona e membros não banidos entram e enviam.
drop policy if exists "vtt_channel_read" on realtime.messages;
create policy "vtt_channel_read" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and public.can_access_table_topic(realtime.topic())
  );

drop policy if exists "vtt_channel_write" on realtime.messages;
create policy "vtt_channel_write" on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and public.can_access_table_topic(realtime.topic())
  );

notify pgrst, 'reload schema';
