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
