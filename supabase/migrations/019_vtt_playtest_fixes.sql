-- Fase 6.5: ajustes do primeiro teste com jogador.

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

notify pgrst, 'reload schema';
