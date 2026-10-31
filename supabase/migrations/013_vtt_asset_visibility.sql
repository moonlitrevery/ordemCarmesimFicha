-- Mesa (VTT) — visibilidade da biblioteca: o que a mestra sobe fica escondido até liberar
-- Rode no SQL Editor do Supabase (depois da 012)

alter table public.assets add column if not exists visibility text not null default 'mestre'
  check (visibility in ('mestre', 'jogadores'));

-- Enviado por jogador não é segredo da mestra: continua visível como antes.
update public.assets a set visibility = 'jogadores'
from public.profiles p
where a.uploaded_by = p.id and a.status = 'approved' and p.role <> 'mestre';

-- Objeto oculto não conta: senão o jogador descobriria o token antes da hora.
create or replace function public.is_asset_in_my_scene(p_asset uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.scenes s
    where s.map_asset_id = p_asset and public.can_view_scene(s.id)
  ) or exists (
    select 1 from public.scene_objects o
    where o.asset_id = p_asset and o.hidden = false and public.can_view_scene(o.scene_id)
  );
$$;

-- Arquivos fixos em uso nas cenas que este usuário vê. Só conta objeto da dona:
-- o id vem do caminho, e um jogador que o adivinhasse não pode liberar o arquivo
-- inserindo um objeto com ele (o banco não conhece o manifest para recusar).
create or replace function public.my_scene_static_asset_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.map_asset_id
  from public.scenes s
  where s.map_asset_id is not null and public.can_view_scene(s.id)
  union
  select o.asset_id
  from public.scene_objects o
  join public.scenes s on s.id = o.scene_id
  join public.tables t on t.id = s.table_id
  where o.hidden = false and o.created_by = t.owner_id and public.can_view_scene(o.scene_id);
$$;

revoke all on function public.is_asset_in_my_scene(uuid) from public, anon;
revoke all on function public.my_scene_static_asset_ids() from public, anon;
grant execute on function public.is_asset_in_my_scene(uuid) to authenticated;
grant execute on function public.my_scene_static_asset_ids() to authenticated;

drop policy if exists "assets_select" on public.assets;
create policy "assets_select" on public.assets
  for select to authenticated
  using (
    public.is_mestre()
    or (status = 'pending' and uploaded_by = auth.uid())
    or (
      status = 'approved'
      and (visibility = 'jogadores' or public.is_asset_in_my_scene(id))
    )
  );

-- Sem isso, colocar um asset escondido pelo id o liberaria ("em uso").
create or replace function public.can_place_asset(p_asset uuid, p_kind text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.assets a
    where a.id = p_asset and (
      a.kind <> p_kind
      or a.status <> 'approved'
      or not (
        public.is_mestre()
        or a.visibility = 'jogadores'
        or public.is_asset_in_my_scene(a.id)
      )
    )
  );
$$;

-- Aprovar libera: o arquivo veio de um jogador.
create or replace function public.approve_asset(p_asset uuid)
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
begin
  if not public.is_mestre() then
    raise exception 'forbidden';
  end if;

  update public.assets set status = 'approved', visibility = 'jogadores'
  where id = p_asset
  returning kind into v_kind;

  if v_kind is null then
    raise exception 'not_found';
  end if;

  if v_kind in ('token', 'adereco', 'addon') then
    return query
    with moved as (
      delete from public.pending_placements p
      where p.asset_id = p_asset
      returning p.scene_id, p.x, p.y, p.scale, p.created_by
    ),
    created as (
      insert into public.scene_objects (scene_id, asset_id, kind, x, y, scale, z, created_by)
      select m.scene_id, p_asset, v_kind, m.x, m.y, m.scale,
        (select coalesce(max(o.z), 0) + 1 from public.scene_objects o where o.scene_id = m.scene_id),
        m.created_by
      from moved m
      returning scene_objects.scene_id
    )
    select distinct c.scene_id from created c;
  else
    delete from public.pending_placements p where p.asset_id = p_asset;
  end if;
end;
$$;

notify pgrst, 'reload schema';
