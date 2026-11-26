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

-- ========== MESA (VTT) — ver migrations/008_vtt_assets.sql ==========
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (
    kind in ('mapa', 'token', 'addon', 'adereco', 'audio_ambiente', 'audio_sfx', 'cutscene')
  ),
  name text not null check (char_length(trim(name)) > 0),
  storage_key text not null unique,
  -- Só arquivos do Blob: um insert direto não consegue apontar para outro site.
  url text not null check (url ~ '^https://[a-z0-9]+\.public\.blob\.vercel-storage\.com/'),
  mime text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  width int,
  height int,
  duration_s numeric,
  tags text[] not null default '{}',
  status text not null default 'pending' check (status in ('approved', 'pending', 'rejected')),
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists assets_status_kind_idx on public.assets (status, kind, created_at desc);

-- Espectador é papel por mesa: pode subir quem é jogador em alguma mesa (ou a mestra).
create or replace function public.can_upload_asset()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_mestre() or exists (
    select 1 from public.table_members
    where user_id = auth.uid() and role = 'jogador' and banned = false
  );
$$;

revoke all on function public.can_upload_asset() from public, anon;
grant execute on function public.can_upload_asset() to authenticated;

revoke all on public.assets from anon;

alter table public.assets enable row level security;

drop policy if exists "assets_select" on public.assets;
create policy "assets_select" on public.assets
  for select to authenticated
  using (
    public.is_mestre()
    or status = 'approved'
    or (status = 'pending' and uploaded_by = auth.uid())
  );

drop policy if exists "assets_insert" on public.assets;
create policy "assets_insert" on public.assets
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and (
      public.is_mestre()
      or (
        status = 'pending'
        and kind in ('mapa', 'token', 'addon', 'adereco')
        and public.can_upload_asset()
      )
    )
  );

drop policy if exists "assets_update" on public.assets;
create policy "assets_update" on public.assets
  for update to authenticated
  using (public.is_mestre())
  with check (public.is_mestre());

drop policy if exists "assets_delete" on public.assets;
create policy "assets_delete" on public.assets
  for delete to authenticated
  using (
    public.is_mestre()
    or (status = 'pending' and uploaded_by = auth.uid())
  );

notify pgrst, 'reload schema';

-- ========== MESA (VTT) — ver migrations/009_vtt_asset_thumbs.sql ==========
alter table public.assets add column if not exists thumb_url text;

-- Apagar um asset apaga as URLs da linha no Blob. Sem estas regras, um insert
-- direto apontando para o arquivo de outra pessoa permitiria destruí-lo.
create unique index if not exists assets_url_key on public.assets (url);
create unique index if not exists assets_thumb_url_key on public.assets (thumb_url);

alter table public.assets drop constraint if exists assets_thumb_url_check;
alter table public.assets add constraint assets_thumb_url_check check (
  thumb_url ~ '^https://[a-z0-9]+\.public\.blob\.vercel-storage\.com/thumbs/'
);

alter table public.assets drop constraint if exists assets_url_not_thumb_check;
alter table public.assets add constraint assets_url_not_thumb_check check (
  url !~ '^https://[a-z0-9]+\.public\.blob\.vercel-storage\.com/thumbs/'
);

notify pgrst, 'reload schema';

-- ========== MESA (VTT) — ver migrations/010_vtt_scenes.sql ==========
create table if not exists public.scenes (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  folder text not null default '' check (char_length(folder) <= 80),
  sort int not null default 0,
  map_asset_id uuid references public.assets(id) on delete set null,
  meters_per_px double precision check (meters_per_px > 0),
  ambient jsonb not null default '[]'::jsonb,
  weather jsonb not null default '[]'::jsonb,
  fog jsonb,
  created_at timestamptz not null default now()
);

create index if not exists scenes_table_id_idx on public.scenes (table_id, sort);

alter table public.tables drop constraint if exists tables_default_scene_id_fkey;
alter table public.tables add constraint tables_default_scene_id_fkey
  foreign key (default_scene_id) references public.scenes(id) on delete set null;

alter table public.table_members drop constraint if exists table_members_scene_id_fkey;
alter table public.table_members add constraint table_members_scene_id_fkey
  foreign key (scene_id) references public.scenes(id) on delete set null;

create table if not exists public.scene_objects (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.scenes(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  kind text not null check (kind in ('token', 'adereco', 'addon')),
  x double precision not null default 0 check (abs(x) <= 1000000),
  y double precision not null default 0 check (abs(y) <= 1000000),
  rotation double precision not null default 0 check (abs(rotation) <= 1000),
  scale double precision not null default 1 check (scale between 0.001 and 1000),
  flip_x boolean not null default false,
  flip_y boolean not null default false,
  z int not null default 0,
  -- set null é só a rede de proteção: quem apaga o pai desanexa os filhos antes.
  parent_id uuid references public.scene_objects(id) on delete set null,
  local jsonb,
  caption jsonb check (caption is null or pg_column_size(caption) <= 4096),
  effects jsonb not null default '[]'::jsonb,
  conditions text[] not null default '{}',
  character_id uuid references public.characters(id) on delete set null,
  -- A FK para npcs fica na seção da migração 016: a tabela nasce depois.
  npc_id uuid,
  hidden boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists scene_objects_scene_id_idx on public.scene_objects (scene_id);
create index if not exists scene_objects_parent_id_idx on public.scene_objects (parent_id);
create index if not exists scene_objects_asset_id_idx on public.scene_objects (asset_id);

create table if not exists public.drawings (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.scenes(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  points double precision[] not null check (
    cardinality(points) between 4 and 8000 and cardinality(points) % 2 = 0
  ),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  width double precision not null check (width > 0 and width <= 200),
  created_at timestamptz not null default now()
);

create index if not exists drawings_scene_id_idx on public.drawings (scene_id);

-- Arquivo solto no mapa por jogador: só ele vê até a mestra aprovar o asset.
-- Recusar apaga o asset, e o cascade leva a colocação junto.
create table if not exists public.pending_placements (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  scene_id uuid not null references public.scenes(id) on delete cascade,
  x double precision not null check (abs(x) <= 1000000),
  y double precision not null check (abs(y) <= 1000000),
  scale double precision not null check (scale between 0.001 and 1000),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists pending_placements_scene_id_idx on public.pending_placements (scene_id);
create index if not exists pending_placements_asset_id_idx on public.pending_placements (asset_id);

-- ========== FUNÇÕES AUXILIARES ==========
-- A cena em que este usuário está. Só jogador pode estar separado; sessão
-- fechada não mostra cena nenhuma. A mestra não passa por aqui.
create or replace function public.my_scene(p_table uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when m.role = 'jogador' then coalesce(m.scene_id, t.default_scene_id)
    else t.default_scene_id
  end
  from public.tables t
  join public.table_members m on m.table_id = t.id
  where t.id = p_table
    and t.session_open
    and m.user_id = auth.uid()
    and m.banned = false;
$$;

create or replace function public.is_scene_gm(p_scene uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.scenes s
    where s.id = p_scene and public.is_table_gm(s.table_id)
  );
$$;

create or replace function public.can_view_scene(p_scene uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.scenes s
    where s.id = p_scene
      and (public.is_table_gm(s.table_id) or public.my_scene(s.table_id) = s.id)
  );
$$;

-- Espectador vê a cena, mas não mexe nela.
create or replace function public.can_edit_scene(p_scene uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.scenes s
    where s.id = p_scene
      and (
        public.is_table_gm(s.table_id)
        or (
          public.my_scene(s.table_id) = s.id
          and exists (
            select 1 from public.table_members m
            where m.table_id = s.table_id
              and m.user_id = auth.uid()
              and m.role = 'jogador'
              and m.banned = false
          )
        )
      )
  );
$$;

-- ========== REGRAS QUE O RLS NÃO ALCANÇA ==========
-- RLS não compara valor antigo com novo: aqui ficam os campos só da mestra,
-- o updated_at do servidor e o bloqueio de ciclos em anexos.
create or replace function public.guard_scene_object()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cursor uuid;
  v_depth int := 0;
begin
  if not public.is_scene_gm(new.scene_id) then
    if tg_op = 'INSERT' then
      if new.hidden or new.character_id is not null or new.npc_id is not null then
        raise exception 'forbidden';
      end if;
    elsif new.hidden is distinct from old.hidden
      or new.character_id is distinct from old.character_id
      or new.npc_id is distinct from old.npc_id then
      raise exception 'forbidden';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if new.parent_id is distinct from old.parent_id and new.parent_id is not null then
      v_cursor := new.parent_id;
      while v_cursor is not null loop
        v_depth := v_depth + 1;
        if v_cursor = new.id or v_depth > 32 then
          raise exception 'attach_cycle';
        end if;
        -- Pai de outra cena cai em new.id: conta como anexo inválido.
        select case when o.scene_id = new.scene_id then o.parent_id else new.id end
        into v_cursor
        from public.scene_objects o
        where o.id = v_cursor;
      end loop;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists scene_objects_guard on public.scene_objects;
create trigger scene_objects_guard
  before insert or update on public.scene_objects
  for each row execute function public.guard_scene_object();

-- ========== RPCs ==========
create or replace function public.duplicate_scene(p_scene uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new uuid := gen_random_uuid();
  v_table uuid;
begin
  if not public.is_scene_gm(p_scene) then
    raise exception 'forbidden';
  end if;

  select table_id into v_table from public.scenes where id = p_scene;

  insert into public.scenes (id, table_id, name, folder, sort, map_asset_id, meters_per_px, ambient, weather, fog)
  select v_new, table_id, left(name || ' (cópia)', 120), folder,
    (select coalesce(max(sort), 0) + 1 from public.scenes where table_id = v_table),
    map_asset_id, meters_per_px, ambient, weather, fog
  from public.scenes
  where id = p_scene;

  with ids as (
    select id as old_id, gen_random_uuid() as new_id
    from public.scene_objects
    where scene_id = p_scene
  )
  insert into public.scene_objects (
    id, scene_id, asset_id, kind, x, y, rotation, scale, flip_x, flip_y, z,
    parent_id, local, caption, effects, conditions, character_id, npc_id, hidden, created_by
  )
  select
    ids.new_id, v_new, o.asset_id, o.kind, o.x, o.y, o.rotation, o.scale, o.flip_x, o.flip_y, o.z,
    parents.new_id, o.local, o.caption, o.effects, o.conditions, o.character_id, o.npc_id, o.hidden, o.created_by
  from public.scene_objects o
  join ids on ids.old_id = o.id
  left join ids parents on parents.old_id = o.parent_id;

  insert into public.drawings (scene_id, author_id, points, color, width)
  select v_new, author_id, points, color, width
  from public.drawings
  where scene_id = p_scene;

  return v_new;
end;
$$;

-- Aprova o asset e transforma as colocações pendentes em objetos de verdade.
-- Devolve as cenas que ganharam objeto, para a mestra avisar quem está nelas.
create or replace function public.approve_asset(p_asset uuid)
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
begin
  if not public.is_mestre() then
    raise exception 'forbidden';
  end if;

  update public.assets set status = 'approved'
  where id = p_asset
  returning kind into v_kind;

  if v_kind is null then
    raise exception 'not_found';
  end if;

  if v_kind in ('token', 'adereco', 'addon') then
    return query
    with moved as (
      delete from public.pending_placements p
      where p.asset_id = p_asset
      returning p.scene_id, p.x, p.y, p.scale, p.created_by
    ),
    created as (
      insert into public.scene_objects (scene_id, asset_id, kind, x, y, scale, z, created_by)
      select m.scene_id, p_asset, v_kind, m.x, m.y, m.scale,
        (select coalesce(max(o.z), 0) + 1 from public.scene_objects o where o.scene_id = m.scene_id),
        m.created_by
      from moved m
      returning scene_objects.scene_id
    )
    select distinct c.scene_id from created c;
  else
    delete from public.pending_placements p where p.asset_id = p_asset;
  end if;
end;
$$;

revoke all on function public.my_scene(uuid) from public, anon;
revoke all on function public.is_scene_gm(uuid) from public, anon;
revoke all on function public.can_view_scene(uuid) from public, anon;
revoke all on function public.can_edit_scene(uuid) from public, anon;
revoke all on function public.guard_scene_object() from public, anon;
revoke all on function public.duplicate_scene(uuid) from public, anon;
revoke all on function public.approve_asset(uuid) from public, anon;

grant execute on function public.my_scene(uuid) to authenticated;
grant execute on function public.is_scene_gm(uuid) to authenticated;
grant execute on function public.can_view_scene(uuid) to authenticated;
grant execute on function public.can_edit_scene(uuid) to authenticated;
grant execute on function public.duplicate_scene(uuid) to authenticated;
grant execute on function public.approve_asset(uuid) to authenticated;

-- ========== PRIVILÉGIOS POR COLUNA ==========
-- Cena, asset, tipo e autor de um objeto não mudam. Objeto nasce solto: anexar
-- é um update, onde o trigger confere ciclo e cena do pai.
revoke all on public.scene_objects from anon, authenticated;
grant select, delete on public.scene_objects to authenticated;
grant insert (scene_id, asset_id, kind, x, y, rotation, scale, flip_x, flip_y, z, caption, hidden, created_by)
  on public.scene_objects to authenticated;
grant update (x, y, rotation, scale, flip_x, flip_y, z, parent_id, local, caption, effects, conditions, character_id, npc_id, hidden)
  on public.scene_objects to authenticated;

revoke all on public.drawings from anon, authenticated;
grant select, delete on public.drawings to authenticated;
grant insert (scene_id, author_id, points, color, width) on public.drawings to authenticated;

revoke all on public.pending_placements from anon, authenticated;
grant select, delete on public.pending_placements to authenticated;
grant insert (asset_id, scene_id, x, y, scale, created_by) on public.pending_placements to authenticated;

revoke all on public.scenes from anon;

-- ========== RLS ==========
alter table public.scenes enable row level security;
alter table public.scene_objects enable row level security;
alter table public.drawings enable row level security;
alter table public.pending_placements enable row level security;

drop policy if exists "scenes_select" on public.scenes;
create policy "scenes_select" on public.scenes
  for select to authenticated
  using (public.is_table_gm(table_id) or public.can_view_scene(id));

drop policy if exists "scenes_insert" on public.scenes;
create policy "scenes_insert" on public.scenes
  for insert to authenticated
  with check (public.is_table_gm(table_id));

drop policy if exists "scenes_update" on public.scenes;
create policy "scenes_update" on public.scenes
  for update to authenticated
  using (public.is_table_gm(table_id))
  with check (public.is_table_gm(table_id));

drop policy if exists "scenes_delete" on public.scenes;
create policy "scenes_delete" on public.scenes
  for delete to authenticated
  using (public.is_table_gm(table_id));

drop policy if exists "scene_objects_select" on public.scene_objects;
create policy "scene_objects_select" on public.scene_objects
  for select to authenticated
  using (
    public.is_scene_gm(scene_id)
    or (hidden = false and public.can_view_scene(scene_id))
  );

drop policy if exists "scene_objects_insert" on public.scene_objects;
create policy "scene_objects_insert" on public.scene_objects
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.can_edit_scene(scene_id)
    and exists (
      select 1 from public.assets a
      where a.id = asset_id and a.kind = scene_objects.kind and a.status = 'approved'
    )
  );

drop policy if exists "scene_objects_update" on public.scene_objects;
create policy "scene_objects_update" on public.scene_objects
  for update to authenticated
  using (
    public.is_scene_gm(scene_id)
    or (hidden = false and public.can_edit_scene(scene_id))
  )
  with check (public.can_edit_scene(scene_id));

drop policy if exists "scene_objects_delete" on public.scene_objects;
create policy "scene_objects_delete" on public.scene_objects
  for delete to authenticated
  using (
    public.is_scene_gm(scene_id)
    or (created_by = auth.uid() and hidden = false and public.can_edit_scene(scene_id))
  );

drop policy if exists "drawings_select" on public.drawings;
create policy "drawings_select" on public.drawings
  for select to authenticated
  using (public.can_view_scene(scene_id));

drop policy if exists "drawings_insert" on public.drawings;
create policy "drawings_insert" on public.drawings
  for insert to authenticated
  with check (author_id = auth.uid() and public.can_edit_scene(scene_id));

drop policy if exists "drawings_delete" on public.drawings;
create policy "drawings_delete" on public.drawings
  for delete to authenticated
  using (
    public.is_scene_gm(scene_id)
    or (author_id = auth.uid() and public.can_edit_scene(scene_id))
  );

drop policy if exists "pending_placements_select" on public.pending_placements;
create policy "pending_placements_select" on public.pending_placements
  for select to authenticated
  using (created_by = auth.uid() or public.is_mestre());

drop policy if exists "pending_placements_insert" on public.pending_placements;
create policy "pending_placements_insert" on public.pending_placements
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.can_edit_scene(scene_id)
    and exists (
      select 1 from public.assets a
      where a.id = asset_id and a.uploaded_by = auth.uid() and a.status = 'pending'
    )
  );

drop policy if exists "pending_placements_delete" on public.pending_placements;
create policy "pending_placements_delete" on public.pending_placements
  for delete to authenticated
  using (created_by = auth.uid() or public.is_mestre());

notify pgrst, 'reload schema';

-- ========== MESA (VTT) — ver migrations/011_vtt_chat.sql ==========
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

-- ========== MESA (VTT) — ver migrations/012_vtt_static_assets.sql ==========
-- Cena e objeto podem apontar para um id do manifest, que não existe em assets.
alter table public.scenes drop constraint if exists scenes_map_asset_id_fkey;
alter table public.scene_objects drop constraint if exists scene_objects_asset_id_fkey;

-- Faz o que as FKs faziam quando um asset do Blob é apagado.
create or replace function public.detach_deleted_asset()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.scene_objects where asset_id = old.id;
  update public.scenes set map_asset_id = null where map_asset_id = old.id;
  return old;
end;
$$;

drop trigger if exists assets_detach_deleted on public.assets;
create trigger assets_detach_deleted
  after delete on public.assets
  for each row execute function public.detach_deleted_asset();

-- Security definer: pelo RLS o jogador não enxerga pendente alheio e o passaria
-- como "não existe em assets", isto é, como arquivo estático.
create or replace function public.can_place_asset(p_asset uuid, p_kind text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.assets a
    where a.id = p_asset and (a.kind <> p_kind or a.status <> 'approved')
  );
$$;

revoke all on function public.detach_deleted_asset() from public, anon;
revoke all on function public.can_place_asset(uuid, text) from public, anon;
grant execute on function public.can_place_asset(uuid, text) to authenticated;

drop policy if exists "scene_objects_insert" on public.scene_objects;
create policy "scene_objects_insert" on public.scene_objects
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.can_edit_scene(scene_id)
    and public.can_place_asset(asset_id, kind)
  );

-- ========== MESA (VTT) — ver migrations/013_vtt_asset_visibility.sql ==========
alter table public.assets add column if not exists visibility text not null default 'mestre'
  check (visibility in ('mestre', 'jogadores'));

-- Enviado por jogador não é segredo da mestra: continua visível como antes.
update public.assets a set visibility = 'jogadores'
from public.profiles p
where a.uploaded_by = p.id and a.status = 'approved' and p.role <> 'mestre';

-- Objeto oculto não conta: senão o jogador descobriria o token antes da hora.
create or replace function public.is_asset_in_my_scene(p_asset uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.scenes s
    where s.map_asset_id = p_asset and public.can_view_scene(s.id)
  ) or exists (
    select 1 from public.scene_objects o
    where o.asset_id = p_asset and o.hidden = false and public.can_view_scene(o.scene_id)
  );
$$;

-- Arquivos fixos em uso nas cenas que este usuário vê. Só conta objeto da dona:
-- o id vem do caminho, e um jogador que o adivinhasse não pode liberar o arquivo
-- inserindo um objeto com ele (o banco não conhece o manifest para recusar).
create or replace function public.my_scene_static_asset_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.map_asset_id
  from public.scenes s
  where s.map_asset_id is not null and public.can_view_scene(s.id)
  union
  select o.asset_id
  from public.scene_objects o
  join public.scenes s on s.id = o.scene_id
  join public.tables t on t.id = s.table_id
  where o.hidden = false and o.created_by = t.owner_id and public.can_view_scene(o.scene_id);
$$;

revoke all on function public.is_asset_in_my_scene(uuid) from public, anon;
revoke all on function public.my_scene_static_asset_ids() from public, anon;
grant execute on function public.is_asset_in_my_scene(uuid) to authenticated;
grant execute on function public.my_scene_static_asset_ids() to authenticated;

drop policy if exists "assets_select" on public.assets;
create policy "assets_select" on public.assets
  for select to authenticated
  using (
    public.is_mestre()
    or (status = 'pending' and uploaded_by = auth.uid())
    or (
      status = 'approved'
      and (visibility = 'jogadores' or public.is_asset_in_my_scene(id))
    )
  );

-- Sem isso, colocar um asset escondido pelo id o liberaria ("em uso").
create or replace function public.can_place_asset(p_asset uuid, p_kind text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.assets a
    where a.id = p_asset and (
      a.kind <> p_kind
      or a.status <> 'approved'
      or not (
        public.is_mestre()
        or a.visibility = 'jogadores'
        or public.is_asset_in_my_scene(a.id)
      )
    )
  );
$$;

-- Aprovar libera: o arquivo veio de um jogador.
create or replace function public.approve_asset(p_asset uuid)
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
begin
  if not public.is_mestre() then
    raise exception 'forbidden';
  end if;

  update public.assets set status = 'approved', visibility = 'jogadores'
  where id = p_asset
  returning kind into v_kind;

  if v_kind is null then
    raise exception 'not_found';
  end if;

  if v_kind in ('token', 'adereco', 'addon') then
    return query
    with moved as (
      delete from public.pending_placements p
      where p.asset_id = p_asset
      returning p.scene_id, p.x, p.y, p.scale, p.created_by
    ),
    created as (
      insert into public.scene_objects (scene_id, asset_id, kind, x, y, scale, z, created_by)
      select m.scene_id, p_asset, v_kind, m.x, m.y, m.scale,
        (select coalesce(max(o.z), 0) + 1 from public.scene_objects o where o.scene_id = m.scene_id),
        m.created_by
      from moved m
      returning scene_objects.scene_id
    )
    select distinct c.scene_id from created c;
  else
    delete from public.pending_placements p where p.asset_id = p_asset;
  end if;
end;
$$;

-- ========== MESA (VTT) — ver migrations/015_vtt_undo.sql ==========
-- Desenho é só do autor (RLS) e não tem filhos: basta aceitar o id de volta.
grant insert (id) on public.drawings to authenticated;

-- Objeto tem campos sem privilégio de insert (id, anexo, efeitos, condições), e a
-- mestra pode restaurar o que era de outra pessoa: por isso a RPC, com as mesmas
-- regras do insert normal. O trigger guard_scene_object continua valendo.
create or replace function public.restore_scene_object(p_object jsonb)
returns public.scene_objects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := (p_object->>'id')::uuid;
  v_scene uuid := (p_object->>'scene_id')::uuid;
  v_asset uuid := (p_object->>'asset_id')::uuid;
  v_kind text := p_object->>'kind';
  v_created_by uuid := (p_object->>'created_by')::uuid;
  v_parent uuid := (p_object->>'parent_id')::uuid;
  v_is_gm boolean;
  v_row public.scene_objects;
begin
  if not public.can_edit_scene(v_scene) then
    raise exception 'forbidden';
  end if;
  v_is_gm := public.is_scene_gm(v_scene);
  if not v_is_gm and v_created_by is distinct from auth.uid() then
    raise exception 'forbidden';
  end if;
  if not public.can_place_asset(v_asset, v_kind) then
    raise exception 'forbidden';
  end if;

  -- Já voltou (duas abas, refazer repetido): devolve o que existe.
  select * into v_row from public.scene_objects where id = v_id;
  if found then
    if v_row.scene_id <> v_scene or (v_row.hidden and not v_is_gm) then
      raise exception 'forbidden';
    end if;
    return v_row;
  end if;

  -- Pai que sumiu, ou que este usuário não enxerga: volta solto, onde estava.
  if v_parent is not null and not exists (
    select 1 from public.scene_objects o
    where o.id = v_parent and o.scene_id = v_scene and (v_is_gm or not o.hidden)
  ) then
    v_parent := null;
  end if;

  insert into public.scene_objects (
    id, scene_id, asset_id, kind, x, y, rotation, scale, flip_x, flip_y, z,
    parent_id, local, caption, effects, conditions, character_id, npc_id, hidden, created_by
  )
  values (
    v_id, v_scene, v_asset, v_kind,
    (p_object->>'x')::double precision,
    (p_object->>'y')::double precision,
    coalesce((p_object->>'rotation')::double precision, 0),
    coalesce((p_object->>'scale')::double precision, 1),
    coalesce((p_object->>'flip_x')::boolean, false),
    coalesce((p_object->>'flip_y')::boolean, false),
    coalesce((p_object->>'z')::int, 0),
    v_parent,
    case when v_parent is null then null else nullif(p_object->'local', 'null'::jsonb) end,
    nullif(p_object->'caption', 'null'::jsonb),
    coalesce(nullif(p_object->'effects', 'null'::jsonb), '[]'::jsonb),
    coalesce(
      array(select jsonb_array_elements_text(nullif(p_object->'conditions', 'null'::jsonb))),
      '{}'
    ),
    (p_object->>'character_id')::uuid,
    (p_object->>'npc_id')::uuid,
    coalesce((p_object->>'hidden')::boolean, false),
    v_created_by
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.restore_scene_object(jsonb) from public, anon;
grant execute on function public.restore_scene_object(jsonb) to authenticated;

-- ========== MESA (VTT) — ver migrations/016_vtt_npcs.sql ==========
create table if not exists public.npcs (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  plane text not null check (plane in ('tartaro', 'purgatorio', 'astral', 'celestial')),
  tier text not null,
  nd int not null,
  attributes jsonb not null default '[]'::jsonb,
  hp_max int not null default 0 check (hp_max >= 0),
  hp_current int not null default 0 check (hp_current >= 0),
  damage_die text not null default 'd6',
  x_bonus int not null default 0,
  attack_slots jsonb not null default '[]'::jsonb check (pg_column_size(attack_slots) <= 8192),
  turns int not null default 1 check (turns between 1 and 20),
  xp int not null default 0,
  notes text not null default '' check (char_length(notes) <= 8000),
  created_at timestamptz not null default now()
);

create index if not exists npcs_table_id_idx on public.npcs (table_id);

revoke all on public.npcs from anon, authenticated;
grant select, insert, update, delete on public.npcs to authenticated;

alter table public.npcs enable row level security;

-- Nem leitura para jogadores: HP, ataques e notas não saem do navegador da mestra.
drop policy if exists "npcs_gm_all" on public.npcs;
create policy "npcs_gm_all" on public.npcs
  for all to authenticated
  using (public.is_table_gm(table_id))
  with check (public.is_table_gm(table_id));

alter table public.scene_objects drop constraint if exists scene_objects_npc_id_fkey;
alter table public.scene_objects
  add constraint scene_objects_npc_id_fkey
  foreign key (npc_id) references public.npcs(id) on delete set null;

-- Vínculo é só da mestra (guard_scene_object) e o alvo pode ter sumido: quem desfaz
-- recupera o objeto mesmo assim, sem o vínculo.
create or replace function public.restore_scene_object(p_object jsonb)
returns public.scene_objects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := (p_object->>'id')::uuid;
  v_scene uuid := (p_object->>'scene_id')::uuid;
  v_asset uuid := (p_object->>'asset_id')::uuid;
  v_kind text := p_object->>'kind';
  v_created_by uuid := (p_object->>'created_by')::uuid;
  v_parent uuid := (p_object->>'parent_id')::uuid;
  v_character uuid := (p_object->>'character_id')::uuid;
  v_npc uuid := (p_object->>'npc_id')::uuid;
  v_is_gm boolean;
  v_row public.scene_objects;
begin
  if not public.can_edit_scene(v_scene) then
    raise exception 'forbidden';
  end if;
  v_is_gm := public.is_scene_gm(v_scene);
  if not v_is_gm and v_created_by is distinct from auth.uid() then
    raise exception 'forbidden';
  end if;
  if not public.can_place_asset(v_asset, v_kind) then
    raise exception 'forbidden';
  end if;

  -- Já voltou (duas abas, refazer repetido): devolve o que existe.
  select * into v_row from public.scene_objects where id = v_id;
  if found then
    if v_row.scene_id <> v_scene or (v_row.hidden and not v_is_gm) then
      raise exception 'forbidden';
    end if;
    return v_row;
  end if;

  -- Pai que sumiu, ou que este usuário não enxerga: volta solto, onde estava.
  if v_parent is not null and not exists (
    select 1 from public.scene_objects o
    where o.id = v_parent and o.scene_id = v_scene and (v_is_gm or not o.hidden)
  ) then
    v_parent := null;
  end if;

  if not v_is_gm or not exists (select 1 from public.npcs n where n.id = v_npc) then
    v_npc := null;
  end if;
  if not v_is_gm or not exists (select 1 from public.characters c where c.id = v_character) then
    v_character := null;
  end if;

  insert into public.scene_objects (
    id, scene_id, asset_id, kind, x, y, rotation, scale, flip_x, flip_y, z,
    parent_id, local, caption, effects, conditions, character_id, npc_id, hidden, created_by
  )
  values (
    v_id, v_scene, v_asset, v_kind,
    (p_object->>'x')::double precision,
    (p_object->>'y')::double precision,
    coalesce((p_object->>'rotation')::double precision, 0),
    coalesce((p_object->>'scale')::double precision, 1),
    coalesce((p_object->>'flip_x')::boolean, false),
    coalesce((p_object->>'flip_y')::boolean, false),
    coalesce((p_object->>'z')::int, 0),
    v_parent,
    case when v_parent is null then null else nullif(p_object->'local', 'null'::jsonb) end,
    nullif(p_object->'caption', 'null'::jsonb),
    coalesce(nullif(p_object->'effects', 'null'::jsonb), '[]'::jsonb),
    coalesce(
      array(select jsonb_array_elements_text(nullif(p_object->'conditions', 'null'::jsonb))),
      '{}'
    ),
    v_character,
    v_npc,
    coalesce((p_object->>'hidden')::boolean, false),
    v_created_by
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.restore_scene_object(jsonb) from public, anon;
grant execute on function public.restore_scene_object(jsonb) to authenticated;

-- ========== MESA (VTT) — ver migrations/017_vtt_library_perf.sql ==========
-- Sem stable, o Postgres não pode tratar a chamada como constante da consulta.
create or replace function public.is_mestre()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'mestre'
  );
$$;

create or replace function public.my_gm_scene_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from public.tables t
  join public.scenes s on s.table_id = t.id
  where t.owner_id = auth.uid();
$$;

-- O mesmo que can_view_scene, mas o conjunto inteiro de uma vez: as políticas
-- usam `in (select ...)`, que roda uma vez por consulta em vez de uma por linha.
create or replace function public.my_visible_scene_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select public.my_gm_scene_ids()
  union
  select s.id
  from public.table_members m
  join public.tables t on t.id = m.table_id
  join public.scenes s on s.table_id = t.id
  where m.user_id = auth.uid()
    and m.banned = false
    and t.session_open
    and s.id = case
      when m.role = 'jogador' then coalesce(m.scene_id, t.default_scene_id)
      else t.default_scene_id
    end;
$$;

-- Objeto oculto não conta: senão o jogador descobriria o token antes da hora.
create or replace function public.my_visible_asset_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.map_asset_id
  from public.scenes s
  where s.map_asset_id is not null
    and s.id in (select public.my_visible_scene_ids())
  union
  select o.asset_id
  from public.scene_objects o
  where o.hidden = false
    and o.scene_id in (select public.my_visible_scene_ids());
$$;

create or replace function public.is_asset_in_my_scene(p_asset uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_asset in (select public.my_visible_asset_ids());
$$;

-- Só conta objeto da dona: ver o comentário na migração 012.
create or replace function public.my_scene_static_asset_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.map_asset_id
  from public.scenes s
  where s.map_asset_id is not null
    and s.id in (select public.my_visible_scene_ids())
  union
  select o.asset_id
  from public.scene_objects o
  join public.scenes s on s.id = o.scene_id
  join public.tables t on t.id = s.table_id
  where o.hidden = false
    and o.created_by = t.owner_id
    and o.scene_id in (select public.my_visible_scene_ids());
$$;

revoke all on function public.my_gm_scene_ids() from public, anon;
revoke all on function public.my_visible_scene_ids() from public, anon;
revoke all on function public.my_visible_asset_ids() from public, anon;
grant execute on function public.my_gm_scene_ids() to authenticated;
grant execute on function public.my_visible_scene_ids() to authenticated;
grant execute on function public.my_visible_asset_ids() to authenticated;

drop policy if exists "assets_select" on public.assets;
create policy "assets_select" on public.assets
  for select to authenticated
  using (
    (select public.is_mestre())
    or (status = 'pending' and uploaded_by = (select auth.uid()))
    or (
      status = 'approved'
      and (
        visibility = 'jogadores'
        or id in (select public.my_visible_asset_ids())
      )
    )
  );

drop policy if exists "assets_insert" on public.assets;
create policy "assets_insert" on public.assets
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and (
      (select public.is_mestre())
      or (
        status = 'pending'
        and kind in ('mapa', 'token', 'addon', 'adereco')
        and (select public.can_upload_asset())
      )
    )
  );

drop policy if exists "assets_update" on public.assets;
create policy "assets_update" on public.assets
  for update to authenticated
  using ((select public.is_mestre()))
  with check ((select public.is_mestre()));

drop policy if exists "assets_delete" on public.assets;
create policy "assets_delete" on public.assets
  for delete to authenticated
  using (
    (select public.is_mestre())
    or (status = 'pending' and uploaded_by = (select auth.uid()))
  );

drop policy if exists "scene_objects_select" on public.scene_objects;
create policy "scene_objects_select" on public.scene_objects
  for select to authenticated
  using (
    scene_id in (select public.my_gm_scene_ids())
    or (hidden = false and scene_id in (select public.my_visible_scene_ids()))
  );

drop policy if exists "drawings_select" on public.drawings;
create policy "drawings_select" on public.drawings
  for select to authenticated
  using (scene_id in (select public.my_visible_scene_ids()));

drop policy if exists "pending_placements_select" on public.pending_placements;
create policy "pending_placements_select" on public.pending_placements
  for select to authenticated
  using (created_by = (select auth.uid()) or (select public.is_mestre()));

drop policy if exists "pending_placements_delete" on public.pending_placements;
create policy "pending_placements_delete" on public.pending_placements
  for delete to authenticated
  using (created_by = (select auth.uid()) or (select public.is_mestre()));

create index if not exists scenes_map_asset_id_idx on public.scenes (map_asset_id);
create index if not exists assets_visibility_status_kind_idx on public.assets (visibility, status, kind);

notify pgrst, 'reload schema';

-- ========== MESA (VTT) — ver migrations/018_vtt_effects.sql ==========
alter table public.scene_objects drop constraint if exists scene_objects_effects_check;
alter table public.scene_objects add constraint scene_objects_effects_check
  check (jsonb_typeof(effects) = 'array' and pg_column_size(effects) <= 4096);

alter table public.scenes drop constraint if exists scenes_weather_check;
alter table public.scenes add constraint scenes_weather_check
  check (jsonb_typeof(weather) = 'array' and pg_column_size(weather) <= 4096);

notify pgrst, 'reload schema';

-- ========== MESA (VTT) — ver migrations/019_vtt_playtest_fixes.sql ==========
-- Cor pessoal. Nula = a gerada a partir do id. Quem divide mesa já lê `profiles`.
alter table public.profiles add column if not exists color text;
alter table public.profiles drop constraint if exists profiles_color_check;
alter table public.profiles add constraint profiles_color_check
  check (color is null or color ~ '^#[0-9a-fA-F]{6}$');

-- O /shiu agora é só para membros: os nomes de personagem não têm mais quem leia.
drop function if exists public.table_character_names(uuid);

-- Iluminação da cena. Nula = nenhuma. A intensidade fica guardada com ela desligada.
alter table public.scenes add column if not exists lighting jsonb;
alter table public.scenes drop constraint if exists scenes_lighting_check;
alter table public.scenes add constraint scenes_lighting_check
  check (
    -- coalesce: campo ausente dá NULL, e NULL passaria em um check.
    lighting is null or coalesce(
      jsonb_typeof(lighting) = 'object'
      and pg_column_size(lighting) <= 512
      and lighting->>'preset' in ('noite', 'escuridao', 'crepusculo', 'penumbra', 'custom')
      and jsonb_typeof(lighting->'on') = 'boolean'
      and jsonb_typeof(lighting->'intensity') = 'number'
      and (lighting->>'intensity')::numeric between 0 and 100
      and coalesce(lighting->>'color', '#000000') ~ '^#[0-9a-fA-F]{6}$',
      false
    )
  );

-- Estilo da transição entre cenas, da mesa inteira.
alter table public.tables add column if not exists scene_transition text not null default 'fade';
alter table public.tables drop constraint if exists tables_scene_transition_check;
alter table public.tables add constraint tables_scene_transition_check
  check (scene_transition in ('corte', 'fade', 'simbolo'));

-- `tables` tem privilégio por coluna: coluna nova não entra sozinha.
grant select (scene_transition) on public.tables to authenticated;
grant update (scene_transition) on public.tables to authenticated;

-- Duplicar a cena leva também a iluminação.
create or replace function public.duplicate_scene(p_scene uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new uuid := gen_random_uuid();
  v_table uuid;
begin
  if not public.is_scene_gm(p_scene) then
    raise exception 'forbidden';
  end if;

  select table_id into v_table from public.scenes where id = p_scene;

  insert into public.scenes (id, table_id, name, folder, sort, map_asset_id, meters_per_px, ambient, weather, lighting, fog)
  select v_new, table_id, left(name || ' (cópia)', 120), folder,
    (select coalesce(max(sort), 0) + 1 from public.scenes where table_id = v_table),
    map_asset_id, meters_per_px, ambient, weather, lighting, fog
  from public.scenes
  where id = p_scene;

  with ids as (
    select id as old_id, gen_random_uuid() as new_id
    from public.scene_objects
    where scene_id = p_scene
  )
  insert into public.scene_objects (
    id, scene_id, asset_id, kind, x, y, rotation, scale, flip_x, flip_y, z,
    parent_id, local, caption, effects, conditions, character_id, npc_id, hidden, created_by
  )
  select
    ids.new_id, v_new, o.asset_id, o.kind, o.x, o.y, o.rotation, o.scale, o.flip_x, o.flip_y, o.z,
    parents.new_id, o.local, o.caption, o.effects, o.conditions, o.character_id, o.npc_id, o.hidden, o.created_by
  from public.scene_objects o
  join ids on ids.old_id = o.id
  left join ids parents on parents.old_id = o.parent_id;

  insert into public.drawings (scene_id, author_id, points, color, width)
  select v_new, author_id, points, color, width
  from public.drawings
  where scene_id = p_scene;

  return v_new;
end;
$$;


-- Mesa (VTT) — Fase 7: som
-- Volume geral, fade e contador de "parar todos os SFX": só a mestra grava.
alter table public.tables add column if not exists audio jsonb not null
  default '{"volume":100,"fadeMs":2000,"sfxStop":0}'::jsonb;
alter table public.tables drop constraint if exists tables_audio_check;
alter table public.tables add constraint tables_audio_check
  check (jsonb_typeof(audio) = 'object' and pg_column_size(audio) <= 512);

-- `tables` tem privilégio por coluna: coluna nova não entra sozinha.
grant select (audio) on public.tables to authenticated;
grant update (audio) on public.tables to authenticated;

-- A leitura de `ambient` depende desta forma: um uuid inválido derrubaria o cast.
create or replace function public.is_valid_ambient(p_ambient jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when jsonb_typeof(p_ambient) <> 'array' then false
    else pg_column_size(p_ambient) <= 4096 and not exists (
      select 1 from jsonb_array_elements(p_ambient) layer
      where not coalesce(
        jsonb_typeof(layer) = 'object'
        and jsonb_typeof(layer->'id') = 'string'
        and layer->>'assetId' ~ '^[0-9a-fA-F-]{36}$'
        and jsonb_typeof(layer->'volume') = 'number'
        and (layer->>'volume')::numeric between 0 and 100
        and (layer->>'target' is null or layer->>'target' ~ '^[0-9a-fA-F-]{36}$'),
        false
      )
    )
  end;
$$;

alter table public.scenes drop constraint if exists scenes_ambient_check;
alter table public.scenes add constraint scenes_ambient_check
  check (public.is_valid_ambient(ambient));

-- `ambient` guarda camada para um jogador só: quem está na cena lê pela RPC, que filtra.
revoke select on public.scenes from authenticated;
grant select (id, table_id, name, folder, sort, map_asset_id, meters_per_px, weather, lighting, fog, created_at)
  on public.scenes to authenticated;

create or replace function public.my_scene_ambient(p_scene uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_scene_gm(p_scene) then s.ambient
    when public.can_view_scene(p_scene) then (
      select coalesce(jsonb_agg(layer order by position), '[]'::jsonb)
      from jsonb_array_elements(s.ambient) with ordinality as item(layer, position)
      where layer->>'target' is null or layer->>'target' = auth.uid()::text
    )
  end
  from public.scenes s
  where s.id = p_scene;
$$;

-- Cada SFX disparado é uma linha: o broadcast só avisa, e o RLS decide quem ouve.
create table if not exists public.audio_cues (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  -- Sem FK: id de `assets` ou do manifest, como `scene_objects.asset_id`.
  asset_id uuid not null,
  target_user uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists audio_cues_table_created_idx
  on public.audio_cues (table_id, created_at desc);

revoke all on public.audio_cues from anon, authenticated;
grant select on public.audio_cues to authenticated;
grant insert (table_id, asset_id, target_user) on public.audio_cues to authenticated;

alter table public.audio_cues enable row level security;

drop policy if exists "audio_cues_select" on public.audio_cues;
create policy "audio_cues_select" on public.audio_cues
  for select to authenticated
  using (
    public.is_table_gm(table_id)
    or (
      public.is_table_member(table_id)
      and (target_user is null or target_user = (select auth.uid()))
    )
  );

drop policy if exists "audio_cues_insert" on public.audio_cues;
create policy "audio_cues_insert" on public.audio_cues
  for insert to authenticated
  with check (
    public.is_table_gm(table_id)
    and public.can_place_asset(asset_id, 'audio_sfx')
  );

-- A linha só serve para o aviso que acabou de sair: a tabela não cresce.
create or replace function public.prune_audio_cues()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.audio_cues
  where table_id = new.table_id and created_at < now() - interval '2 minutes';
  return new;
end;
$$;

drop trigger if exists audio_cues_prune on public.audio_cues;
create trigger audio_cues_prune
  after insert on public.audio_cues
  for each row execute function public.prune_audio_cues();

-- Som da cena e SFX recente, sempre gravados pela mestra: nenhum jogador força esta lista.
create or replace function public.my_audio_asset_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select (layer->>'assetId')::uuid
  from public.scenes s
  cross join lateral jsonb_array_elements(s.ambient) layer
  where s.id in (select public.my_visible_scene_ids())
    and (layer->>'target' is null or layer->>'target' = auth.uid()::text)
  union
  select c.asset_id
  from public.audio_cues c
  where c.created_at > now() - interval '2 minutes'
    and (c.target_user is null or c.target_user = auth.uid())
    and c.table_id in (
      select m.table_id from public.table_members m
      where m.user_id = auth.uid() and m.banned = false
    );
$$;

create or replace function public.my_visible_asset_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.map_asset_id
  from public.scenes s
  where s.map_asset_id is not null
    and s.id in (select public.my_visible_scene_ids())
  union
  select o.asset_id
  from public.scene_objects o
  where o.hidden = false
    and o.scene_id in (select public.my_visible_scene_ids())
  union
  select public.my_audio_asset_ids();
$$;

create or replace function public.my_scene_static_asset_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.map_asset_id
  from public.scenes s
  where s.map_asset_id is not null
    and s.id in (select public.my_visible_scene_ids())
  union
  select o.asset_id
  from public.scene_objects o
  join public.scenes s on s.id = o.scene_id
  join public.tables t on t.id = s.table_id
  where o.hidden = false
    and o.created_by = t.owner_id
    and o.scene_id in (select public.my_visible_scene_ids())
  union
  select public.my_audio_asset_ids();
$$;

-- Apagar o arquivo também o tira do ambiente das cenas.
create or replace function public.detach_deleted_asset()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.scene_objects where asset_id = old.id;
  delete from public.audio_cues where asset_id = old.id;
  update public.scenes set map_asset_id = null where map_asset_id = old.id;
  update public.scenes s
  set ambient = (
    select coalesce(jsonb_agg(layer order by position), '[]'::jsonb)
    from jsonb_array_elements(s.ambient) with ordinality as item(layer, position)
    where layer->>'assetId' <> old.id::text
  )
  where s.ambient @> jsonb_build_array(jsonb_build_object('assetId', old.id::text));
  return old;
end;
$$;

revoke all on function public.my_scene_ambient(uuid) from public, anon;
revoke all on function public.my_audio_asset_ids() from public, anon;
revoke all on function public.prune_audio_cues() from public, anon;
grant execute on function public.my_scene_ambient(uuid) to authenticated;
grant execute on function public.my_audio_asset_ids() to authenticated;

-- ========== MESA (VTT) — ver migrations/021_vtt_docs.sql ==========
-- 'gm' (dona), 'player' (jogador não banido) ou nulo: espectador lê, mas não envia.
create or replace function public.table_upload_role(p_table uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_table_gm(p_table) then 'gm'
    when exists (
      select 1 from public.table_members
      where table_id = p_table and user_id = auth.uid()
        and role = 'jogador' and banned = false
    ) then 'player'
  end;
$$;

revoke all on function public.table_upload_role(uuid) from public, anon;
grant execute on function public.table_upload_role(uuid) to authenticated;

create table if not exists public.table_documents (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  category text not null check (category in ('carta', 'prova', 'pista', 'referencia')),
  title text not null check (char_length(title) between 1 and 120),
  storage_key text not null,
  -- Presa à pasta e única: apagar a linha apaga o arquivo, então ela nunca pode
  -- apontar para o arquivo de outra, nem de `assets`.
  url text not null unique
    check (url ~ '^https://[a-z0-9]+\.public\.blob\.vercel-storage\.com/documento/'),
  mime text not null check (mime in (
    'application/pdf', 'image/webp', 'image/png', 'image/jpeg',
    'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a'
  )),
  size_bytes bigint not null check (size_bytes > 0),
  status text not null default 'pending' check (status in ('approved', 'pending')),
  uploaded_by uuid references public.profiles(id) on delete set null,
  -- "Mostrar a todos": o broadcast é só aviso, e quem recebe confere aqui.
  shown_at timestamptz,
  created_at timestamptz not null default now(),
  check (shown_at is null or status = 'approved')
);

create index if not exists table_documents_table_created_idx
  on public.table_documents (table_id, created_at desc);

create table if not exists public.table_reports (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  storage_key text not null,
  url text not null unique
    check (url ~ '^https://[a-z0-9]+\.public\.blob\.vercel-storage\.com/relatorio/'),
  mime text not null check (mime in (
    'application/pdf', 'text/markdown', 'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  size_bytes bigint not null check (size_bytes > 0),
  author_id uuid references public.profiles(id) on delete set null,
  character_id uuid references public.characters(id) on delete set null,
  -- Copiado do banco pelo trigger: jogador não lê a ficha dos outros, e o nome fica
  -- mesmo se a ficha for apagada.
  character_name text,
  created_at timestamptz not null default now()
);

create index if not exists table_reports_table_created_idx
  on public.table_reports (table_id, created_at desc);

create or replace function public.guard_table_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.character_name := null;
  if new.character_id is not null then
    select c.name into new.character_name
    from public.characters c
    where c.id = new.character_id
      and (c.owner_id = auth.uid() or public.is_table_gm(new.table_id));
    if not found then
      raise exception 'forbidden character' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_table_report() from public, anon, authenticated;

drop trigger if exists guard_table_report on public.table_reports;
create trigger guard_table_report
  before insert on public.table_reports
  for each row execute function public.guard_table_report();

-- Privilégio por coluna: `url` e `uploaded_by` nunca mudam, e jogador não grava `shown_at`.
revoke all on public.table_documents from anon, authenticated;
grant select, delete on public.table_documents to authenticated;
grant insert (table_id, category, title, storage_key, url, mime, size_bytes, status, uploaded_by)
  on public.table_documents to authenticated;
grant update (status, shown_at) on public.table_documents to authenticated;

revoke all on public.table_reports from anon, authenticated;
grant select, delete on public.table_reports to authenticated;
grant insert (table_id, title, storage_key, url, mime, size_bytes, author_id, character_id)
  on public.table_reports to authenticated;

alter table public.table_documents enable row level security;
alter table public.table_reports enable row level security;

-- Nada aqui olha `session_open`: documentos e relatórios valem com a sessão fechada.
drop policy if exists "table_documents_select" on public.table_documents;
create policy "table_documents_select" on public.table_documents
  for select to authenticated using (
    public.is_table_gm(table_id)
    or (
      public.is_table_member(table_id)
      and (status = 'approved' or uploaded_by = (select auth.uid()))
    )
  );

drop policy if exists "table_documents_insert" on public.table_documents;
create policy "table_documents_insert" on public.table_documents
  for insert to authenticated with check (
    uploaded_by = (select auth.uid())
    and case public.table_upload_role(table_id)
      when 'gm' then status = 'approved'
      when 'player' then category = 'referencia' and status = 'pending'
      else false
    end
  );

drop policy if exists "table_documents_update" on public.table_documents;
create policy "table_documents_update" on public.table_documents
  for update to authenticated
  using (public.is_table_gm(table_id))
  with check (public.is_table_gm(table_id));

drop policy if exists "table_documents_delete" on public.table_documents;
create policy "table_documents_delete" on public.table_documents
  for delete to authenticated using (
    public.is_table_gm(table_id) or uploaded_by = (select auth.uid())
  );

drop policy if exists "table_reports_select" on public.table_reports;
create policy "table_reports_select" on public.table_reports
  for select to authenticated using (
    public.is_table_gm(table_id) or public.is_table_member(table_id)
  );

drop policy if exists "table_reports_insert" on public.table_reports;
create policy "table_reports_insert" on public.table_reports
  for insert to authenticated with check (
    author_id = (select auth.uid())
    and public.table_upload_role(table_id) is not null
  );

drop policy if exists "table_reports_delete" on public.table_reports;
create policy "table_reports_delete" on public.table_reports
  for delete to authenticated using (
    public.is_table_gm(table_id) or author_id = (select auth.uid())
  );


-- Mesa (VTT) — Fase 12: Páginas no estilo Roll20.
-- No banco continua "scene"; na interface é "Página".

-- Arquivar tira a página da grade sem apagar nada.
alter table public.scenes add column if not exists archived boolean not null default false;
-- Grade de quadrados de 1,5 m (padrão do Dungeon Alchemist) por cima do mapa.
alter table public.scenes add column if not exists grid_visible boolean not null default false;

-- `scenes` tem privilégio de leitura por coluna: coluna nova não entra sozinha.
grant select (archived, grid_visible) on public.scenes to authenticated;

-- Pastas das páginas, na ordem da mestra. Guardadas na mesa para existir pasta vazia;
-- `scenes.folder` continua sendo o nome da pasta de cada página (um nível só).
alter table public.tables add column if not exists scene_folders jsonb not null default '[]'::jsonb;
-- Check não aceita subconsulta: a forma é conferida por uma função imutável.
create or replace function public.is_valid_scene_folders(p_folders jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when jsonb_typeof(p_folders) <> 'array' then false
    else pg_column_size(p_folders) <= 4096 and not exists (
      select 1 from jsonb_array_elements(p_folders) folder
      where jsonb_typeof(folder) <> 'string' or length(folder #>> '{}') not between 1 and 80
    )
  end;
$$;

alter table public.tables drop constraint if exists tables_scene_folders_check;
alter table public.tables add constraint tables_scene_folders_check
  check (public.is_valid_scene_folders(scene_folders));

-- `tables` tem privilégio por coluna: coluna nova não entra sozinha.
grant select (scene_folders) on public.tables to authenticated;
grant update (scene_folders) on public.tables to authenticated;

-- Calibração da régua guardada no próprio mapa: toda página futura com ele nasce
-- calibrada. Sem FK, como `scenes.map_asset_id`: vale para id de `assets` e para
-- id do manifest (biblioteca fixa de public/vtt/, que não tem linha no banco).
create table if not exists public.map_calibrations (
  asset_id uuid primary key,
  meters_per_px double precision not null check (meters_per_px > 0 and meters_per_px < 100),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

revoke all on public.map_calibrations from anon;
alter table public.map_calibrations enable row level security;

-- Só quem cria páginas (a mestra) lê e grava. Jogador recebe a escala pela página.
drop policy if exists "map_calibrations_select" on public.map_calibrations;
create policy "map_calibrations_select" on public.map_calibrations
  for select to authenticated using ((select public.is_mestre()));

drop policy if exists "map_calibrations_insert" on public.map_calibrations;
create policy "map_calibrations_insert" on public.map_calibrations
  for insert to authenticated with check ((select public.is_mestre()));

drop policy if exists "map_calibrations_update" on public.map_calibrations;
create policy "map_calibrations_update" on public.map_calibrations
  for update to authenticated
  using ((select public.is_mestre()))
  with check ((select public.is_mestre()));

drop policy if exists "map_calibrations_delete" on public.map_calibrations;
create policy "map_calibrations_delete" on public.map_calibrations
  for delete to authenticated using ((select public.is_mestre()));

-- Duplicar leva a grade; a cópia nasce fora do arquivo.
create or replace function public.duplicate_scene(p_scene uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new uuid := gen_random_uuid();
  v_table uuid;
begin
  if not public.is_scene_gm(p_scene) then
    raise exception 'forbidden';
  end if;

  select table_id into v_table from public.scenes where id = p_scene;

  insert into public.scenes (id, table_id, name, folder, sort, map_asset_id, meters_per_px, ambient, weather, lighting, fog, grid_visible)
  select v_new, table_id, left(name || ' (cópia)', 120), folder,
    (select coalesce(max(sort), 0) + 1 from public.scenes where table_id = v_table),
    map_asset_id, meters_per_px, ambient, weather, lighting, fog, grid_visible
  from public.scenes
  where id = p_scene;

  with ids as (
    select id as old_id, gen_random_uuid() as new_id
    from public.scene_objects
    where scene_id = p_scene
  )
  insert into public.scene_objects (
    id, scene_id, asset_id, kind, x, y, rotation, scale, flip_x, flip_y, z,
    parent_id, local, caption, effects, conditions, character_id, npc_id, hidden, created_by
  )
  select
    ids.new_id, v_new, o.asset_id, o.kind, o.x, o.y, o.rotation, o.scale, o.flip_x, o.flip_y, o.z,
    parents.new_id, o.local, o.caption, o.effects, o.conditions, o.character_id, o.npc_id, o.hidden, o.created_by
  from public.scene_objects o
  join ids on ids.old_id = o.id
  left join ids parents on parents.old_id = o.parent_id;

  insert into public.drawings (scene_id, author_id, points, color, width)
  select v_new, author_id, points, color, width
  from public.drawings
  where scene_id = p_scene;

  return v_new;
end;
$$;


-- ========== V.M. (VISÃO DA MESTRA) — ver migrations/023_gm_view.sql ==========
create table if not exists public.gm_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists gm_groups_owner_idx on public.gm_groups (owner_id, sort_order);

-- Um membro é uma ficha do site ou um NPC da Mesa, nunca os dois. Apagar o
-- personagem (ou o NPC) tira ele de todos os grupos; apagar o grupo não apaga ninguém.
create table if not exists public.gm_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.gm_groups(id) on delete cascade,
  section text not null check (section in ('pj', 'npc')),
  character_id uuid references public.characters(id) on delete cascade,
  npc_id uuid references public.npcs(id) on delete cascade,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint gm_group_members_one_target check ((character_id is null) <> (npc_id is null)),
  -- NPC da Mesa só entra na seção de NPCs.
  constraint gm_group_members_npc_section check (npc_id is null or section = 'npc')
);

create index if not exists gm_group_members_group_idx
  on public.gm_group_members (group_id, section, sort_order);
create index if not exists gm_group_members_character_idx
  on public.gm_group_members (character_id) where character_id is not null;
create index if not exists gm_group_members_npc_idx
  on public.gm_group_members (npc_id) where npc_id is not null;

-- O mesmo personagem pode estar em vários grupos, mas só uma vez em cada.
create unique index if not exists gm_group_members_character_uniq
  on public.gm_group_members (group_id, character_id) where character_id is not null;
create unique index if not exists gm_group_members_npc_uniq
  on public.gm_group_members (group_id, npc_id) where npc_id is not null;

revoke all on public.gm_groups from anon;
revoke all on public.gm_group_members from anon;
grant select, insert, update, delete on public.gm_groups to authenticated;
grant select, insert, update, delete on public.gm_group_members to authenticated;

alter table public.gm_groups enable row level security;
alter table public.gm_group_members enable row level security;

-- Cada mestra vê e mexe só nos próprios grupos.
drop policy if exists "gm_groups_owner_all" on public.gm_groups;
create policy "gm_groups_owner_all" on public.gm_groups
  for all to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_mestre()))
  with check (owner_id = (select auth.uid()) and (select public.is_mestre()));

-- O exists passa pelo RLS de gm_groups (grupo dela), de characters (mestra lê
-- todas) e de npcs (só NPC de mesa que ela mestra).
drop policy if exists "gm_group_members_owner_all" on public.gm_group_members;
create policy "gm_group_members_owner_all" on public.gm_group_members
  for all to authenticated
  using (
    exists (select 1 from public.gm_groups g where g.id = group_id)
  )
  with check (
    exists (select 1 from public.gm_groups g where g.id = group_id)
    and (character_id is null or exists (select 1 from public.characters c where c.id = character_id))
    and (npc_id is null or exists (select 1 from public.npcs n where n.id = npc_id))
  );

-- Realtime da V.M.: `characters` já está na publication. O RLS de cada tabela
-- decide o que cada um recebe (ignore se já estiver).
do $$
begin
  alter publication supabase_realtime add table public.character_elements;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.npcs;
exception
  when duplicate_object then null;
end $$;


-- Mesa (VTT) — Fase 12b: seleção múltipla.
-- Mover, girar, ocultar ou marcar condição em vários objetos numa chamada só.
-- `security invoker`: roda com as permissões de quem chama. O RLS de `scene_objects`,
-- o privilégio por coluna e o trigger `guard_scene_object` valem como num update
-- normal; nenhuma regra muda. Linha que o RLS não deixa mudar simplesmente não volta.
create or replace function public.patch_scene_objects(p_patches jsonb)
returns setof public.scene_objects
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
  v_patch jsonb;
  v_row public.scene_objects;
begin
  if jsonb_typeof(p_patches) <> 'array' or jsonb_array_length(p_patches) > 50 then
    raise exception 'invalid_patches';
  end if;

  for v_item in select value from jsonb_array_elements(p_patches) loop
    v_patch := v_item->'patch';
    if jsonb_typeof(v_patch) <> 'object' then
      raise exception 'invalid_patches';
    end if;

    update public.scene_objects o set
      x = case when v_patch ? 'x' then (v_patch->>'x')::double precision else o.x end,
      y = case when v_patch ? 'y' then (v_patch->>'y')::double precision else o.y end,
      rotation = case when v_patch ? 'rotation' then (v_patch->>'rotation')::double precision else o.rotation end,
      scale = case when v_patch ? 'scale' then (v_patch->>'scale')::double precision else o.scale end,
      flip_x = case when v_patch ? 'flip_x' then (v_patch->>'flip_x')::boolean else o.flip_x end,
      flip_y = case when v_patch ? 'flip_y' then (v_patch->>'flip_y')::boolean else o.flip_y end,
      local = case when v_patch ? 'local' then nullif(v_patch->'local', 'null'::jsonb) else o.local end,
      hidden = case when v_patch ? 'hidden' then (v_patch->>'hidden')::boolean else o.hidden end,
      conditions = case
        when v_patch ? 'conditions' then array(select jsonb_array_elements_text(v_patch->'conditions'))
        else o.conditions
      end
    where o.id = (v_item->>'id')::uuid
    returning o.* into v_row;

    if found then
      return next v_row;
    end if;
  end loop;
end;
$$;

revoke all on function public.patch_scene_objects(jsonb) from public, anon;
grant execute on function public.patch_scene_objects(jsonb) to authenticated;


-- ========== MESA (VTT) — ver migrations/024_vtt_fog.sql ==========
-- A coluna `scenes.fog` existe desde a 010, e já tem tudo de que a névoa precisa:
-- todo membro lê (privilégio por coluna da 020), só a mestra grava (`scenes_update`)
-- e `duplicate_scene` copia. Esta migração só confere o formato e cria o canal
-- `nevoa:{mesa}`, em que todo membro lê e só a mestra escreve.

-- Formato: { v: 1, w, h, bits }, uma grade de 1/8 do mapa, 1 bit por célula
-- (1 = revelado) em base64 com padding. Nula = névoa desligada.
create or replace function public.is_valid_fog(p_fog jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_w int;
  v_h int;
  v_bytes int;
  v_pad int;
begin
  if p_fog is null then
    return true;
  end if;
  if jsonb_typeof(p_fog) <> 'object'
    or p_fog->>'v' is distinct from '1'
    or jsonb_typeof(p_fog->'w') <> 'number'
    or jsonb_typeof(p_fog->'h') <> 'number'
    or jsonb_typeof(p_fog->'bits') <> 'string'
    or (p_fog->>'w') !~ '^[0-9]{1,4}$'
    or (p_fog->>'h') !~ '^[0-9]{1,4}$' then
    return false;
  end if;
  v_w := (p_fog->>'w')::int;
  v_h := (p_fog->>'h')::int;
  if v_w not between 1 and 1024 or v_h not between 1 and 1024 then
    return false;
  end if;
  -- base64 de ceil(w*h/8) bytes: 4 caracteres a cada 3 bytes, e o padding exato
  -- (só o tamanho deixaria passar 3 bytes onde cabe 1).
  v_bytes := (v_w * v_h + 7) / 8;
  v_pad := (3 - v_bytes % 3) % 3;
  return length(p_fog->>'bits') = ((v_bytes + 2) / 3) * 4
    and (p_fog->>'bits') ~ ('^[A-Za-z0-9+/]*' || repeat('=', v_pad) || '$');
end;
$$;

revoke all on function public.is_valid_fog(jsonb) from public, anon;
grant execute on function public.is_valid_fog(jsonb) to authenticated;

-- `not valid`: só confere o que for gravado daqui em diante (a coluna nunca foi usada).
alter table public.scenes drop constraint if exists scenes_fog_check;
alter table public.scenes add constraint scenes_fog_check
  check (public.is_valid_fog(fog)) not valid;

-- Canal da névoa. Ler: quem lê o canal da mesa. Escrever: só a mestra da mesa,
-- então um `fog:patch` forjado por jogador é recusado pelo Realtime.
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
  if p_topic ~ '^mesa:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_table := substr(p_topic, 6)::uuid;
  elsif p_topic ~ '^nevoa:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_table := substr(p_topic, 7)::uuid;
  else
    return false;
  end if;
  return public.is_table_gm(v_table) or public.is_table_member(v_table);
end;
$$;

create or replace function public.can_write_table_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_topic ~ '^nevoa:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return public.is_table_gm(substr(p_topic, 7)::uuid);
  end if;
  return public.can_access_table_topic(p_topic);
end;
$$;

revoke all on function public.can_access_table_topic(text) from public, anon;
revoke all on function public.can_write_table_topic(text) from public, anon;
grant execute on function public.can_access_table_topic(text) to authenticated;
grant execute on function public.can_write_table_topic(text) to authenticated;

drop policy if exists "vtt_channel_write" on realtime.messages;
create policy "vtt_channel_write" on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and public.can_write_table_topic(realtime.topic())
  );


notify pgrst, 'reload schema';

-- ========== FICHA + PARTY — ver migrations/025_party_and_money.sql ==========
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

