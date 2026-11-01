-- Mesa (VTT) — Fase 5: mini-fichas de NPC, só da mestra
-- Rode no SQL Editor do Supabase (depois da 015)

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

notify pgrst, 'reload schema';
