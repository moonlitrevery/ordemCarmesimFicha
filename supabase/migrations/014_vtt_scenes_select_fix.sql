-- Mesa (VTT) — corrige INSERT ... RETURNING em scenes (erro 42501)
-- Rode no SQL Editor do Supabase (depois da 013)

-- can_view_scene procura a cena em public.scenes, mas função stable usa o snapshot
-- do início do comando e não enxerga a linha que o próprio comando inseriu. O teste
-- direto de is_table_gm olha só para tables, então a mestra recebe a linha de volta.
drop policy if exists "scenes_select" on public.scenes;
create policy "scenes_select" on public.scenes
  for select to authenticated
  using (public.is_table_gm(table_id) or public.can_view_scene(id));

notify pgrst, 'reload schema';
