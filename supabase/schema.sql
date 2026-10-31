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
  -- FK para npcs entra na fase 5
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
  using (public.can_view_scene(id));

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
