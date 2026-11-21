-- V.M. (Visão da Mestra): grupos de personagens para acompanhar em tempo real.
-- Rode no SQL Editor do Supabase (depois da 022). Pode rodar de novo.

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

notify pgrst, 'reload schema';
