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

notify pgrst, 'reload schema';
