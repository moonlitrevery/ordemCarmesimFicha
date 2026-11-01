-- Mesa (VTT) — Fase 5.5: desfazer devolve objeto e desenho com o mesmo id
-- Rode no SQL Editor do Supabase (depois da 014)

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

notify pgrst, 'reload schema';
