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

notify pgrst, 'reload schema';
