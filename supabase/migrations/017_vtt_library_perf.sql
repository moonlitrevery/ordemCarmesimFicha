-- Mesa (VTT) — Fase 5.6: RLS sem função por linha na biblioteca e nas cenas
-- Rode no SQL Editor do Supabase (depois da 016)

-- Sem stable, o Postgres não pode tratar a chamada como constante da consulta.
create or replace function public.is_mestre()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'mestre'
  );
$$;

create or replace function public.my_gm_scene_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from public.tables t
  join public.scenes s on s.table_id = t.id
  where t.owner_id = auth.uid();
$$;

-- O mesmo que can_view_scene, mas o conjunto inteiro de uma vez: as políticas
-- usam `in (select ...)`, que roda uma vez por consulta em vez de uma por linha.
create or replace function public.my_visible_scene_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select public.my_gm_scene_ids()
  union
  select s.id
  from public.table_members m
  join public.tables t on t.id = m.table_id
  join public.scenes s on s.table_id = t.id
  where m.user_id = auth.uid()
    and m.banned = false
    and t.session_open
    and s.id = case
      when m.role = 'jogador' then coalesce(m.scene_id, t.default_scene_id)
      else t.default_scene_id
    end;
$$;

-- Objeto oculto não conta: senão o jogador descobriria o token antes da hora.
create or replace function public.my_visible_asset_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.map_asset_id
  from public.scenes s
  where s.map_asset_id is not null
    and s.id in (select public.my_visible_scene_ids())
  union
  select o.asset_id
  from public.scene_objects o
  where o.hidden = false
    and o.scene_id in (select public.my_visible_scene_ids());
$$;

create or replace function public.is_asset_in_my_scene(p_asset uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_asset in (select public.my_visible_asset_ids());
$$;

-- Só conta objeto da dona: ver o comentário na migração 012.
create or replace function public.my_scene_static_asset_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.map_asset_id
  from public.scenes s
  where s.map_asset_id is not null
    and s.id in (select public.my_visible_scene_ids())
  union
  select o.asset_id
  from public.scene_objects o
  join public.scenes s on s.id = o.scene_id
  join public.tables t on t.id = s.table_id
  where o.hidden = false
    and o.created_by = t.owner_id
    and o.scene_id in (select public.my_visible_scene_ids());
$$;

revoke all on function public.my_gm_scene_ids() from public, anon;
revoke all on function public.my_visible_scene_ids() from public, anon;
revoke all on function public.my_visible_asset_ids() from public, anon;
grant execute on function public.my_gm_scene_ids() to authenticated;
grant execute on function public.my_visible_scene_ids() to authenticated;
grant execute on function public.my_visible_asset_ids() to authenticated;

drop policy if exists "assets_select" on public.assets;
create policy "assets_select" on public.assets
  for select to authenticated
  using (
    (select public.is_mestre())
    or (status = 'pending' and uploaded_by = (select auth.uid()))
    or (
      status = 'approved'
      and (
        visibility = 'jogadores'
        or id in (select public.my_visible_asset_ids())
      )
    )
  );

drop policy if exists "assets_insert" on public.assets;
create policy "assets_insert" on public.assets
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and (
      (select public.is_mestre())
      or (
        status = 'pending'
        and kind in ('mapa', 'token', 'addon', 'adereco')
        and (select public.can_upload_asset())
      )
    )
  );

drop policy if exists "assets_update" on public.assets;
create policy "assets_update" on public.assets
  for update to authenticated
  using ((select public.is_mestre()))
  with check ((select public.is_mestre()));

drop policy if exists "assets_delete" on public.assets;
create policy "assets_delete" on public.assets
  for delete to authenticated
  using (
    (select public.is_mestre())
    or (status = 'pending' and uploaded_by = (select auth.uid()))
  );

drop policy if exists "scene_objects_select" on public.scene_objects;
create policy "scene_objects_select" on public.scene_objects
  for select to authenticated
  using (
    scene_id in (select public.my_gm_scene_ids())
    or (hidden = false and scene_id in (select public.my_visible_scene_ids()))
  );

drop policy if exists "drawings_select" on public.drawings;
create policy "drawings_select" on public.drawings
  for select to authenticated
  using (scene_id in (select public.my_visible_scene_ids()));

drop policy if exists "pending_placements_select" on public.pending_placements;
create policy "pending_placements_select" on public.pending_placements
  for select to authenticated
  using (created_by = (select auth.uid()) or (select public.is_mestre()));

drop policy if exists "pending_placements_delete" on public.pending_placements;
create policy "pending_placements_delete" on public.pending_placements
  for delete to authenticated
  using (created_by = (select auth.uid()) or (select public.is_mestre()));

create index if not exists scenes_map_asset_id_idx on public.scenes (map_asset_id);
create index if not exists assets_visibility_status_kind_idx on public.assets (visibility, status, kind);

notify pgrst, 'reload schema';
