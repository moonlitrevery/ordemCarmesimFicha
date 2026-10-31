-- Mesa (VTT) — biblioteca estática: public/vtt/, listada pelo manifest, sem linha em assets
-- Rode no SQL Editor do Supabase (depois da 011)

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

notify pgrst, 'reload schema';
