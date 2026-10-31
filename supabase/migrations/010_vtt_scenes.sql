-- Mesa (VTT) — Fase 3: cenas, objetos, desenhos e colocações pendentes
-- Rode no SQL Editor do Supabase (depois da 009)

create table if not exists public.scenes (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  folder text not null default '' check (char_length(folder) <= 80),
  sort int not null default 0,
  map_asset_id uuid references public.assets(id) on delete set null,
  meters_per_px double precision check (meters_per_px > 0),
  ambient jsonb not null default '[]'::jsonb,
  weather jsonb not null default '[]'::jsonb,
  fog jsonb,
  created_at timestamptz not null default now()
);

create index if not exists scenes_table_id_idx on public.scenes (table_id, sort);

alter table public.tables drop constraint if exists tables_default_scene_id_fkey;
alter table public.tables add constraint tables_default_scene_id_fkey
  foreign key (default_scene_id) references public.scenes(id) on delete set null;

alter table public.table_members drop constraint if exists table_members_scene_id_fkey;
alter table public.table_members add constraint table_members_scene_id_fkey
  foreign key (scene_id) references public.scenes(id) on delete set null;

create table if not exists public.scene_objects (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.scenes(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  kind text not null check (kind in ('token', 'adereco', 'addon')),
  x double precision not null default 0 check (abs(x) <= 1000000),
  y double precision not null default 0 check (abs(y) <= 1000000),
  rotation double precision not null default 0 check (abs(rotation) <= 1000),
  scale double precision not null default 1 check (scale between 0.001 and 1000),
  flip_x boolean not null default false,
  flip_y boolean not null default false,
  z int not null default 0,
  -- set null é só a rede de proteção: quem apaga o pai desanexa os filhos antes.
  parent_id uuid references public.scene_objects(id) on delete set null,
  local jsonb,
  caption jsonb check (caption is null or pg_column_size(caption) <= 4096),
  effects jsonb not null default '[]'::jsonb,
  conditions text[] not null default '{}',
  character_id uuid references public.characters(id) on delete set null,
  -- FK para npcs entra na fase 5
  npc_id uuid,
  hidden boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists scene_objects_scene_id_idx on public.scene_objects (scene_id);
create index if not exists scene_objects_parent_id_idx on public.scene_objects (parent_id);
create index if not exists scene_objects_asset_id_idx on public.scene_objects (asset_id);

create table if not exists public.drawings (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.scenes(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  points double precision[] not null check (
    cardinality(points) between 4 and 8000 and cardinality(points) % 2 = 0
  ),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  width double precision not null check (width > 0 and width <= 200),
  created_at timestamptz not null default now()
);

create index if not exists drawings_scene_id_idx on public.drawings (scene_id);

-- Arquivo solto no mapa por jogador: só ele vê até a mestra aprovar o asset.
-- Recusar apaga o asset, e o cascade leva a colocação junto.
create table if not exists public.pending_placements (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  scene_id uuid not null references public.scenes(id) on delete cascade,
  x double precision not null check (abs(x) <= 1000000),
  y double precision not null check (abs(y) <= 1000000),
  scale double precision not null check (scale between 0.001 and 1000),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists pending_placements_scene_id_idx on public.pending_placements (scene_id);
create index if not exists pending_placements_asset_id_idx on public.pending_placements (asset_id);

-- ========== FUNÇÕES AUXILIARES ==========
-- A cena em que este usuário está. Só jogador pode estar separado; sessão
-- fechada não mostra cena nenhuma. A mestra não passa por aqui.
create or replace function public.my_scene(p_table uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when m.role = 'jogador' then coalesce(m.scene_id, t.default_scene_id)
    else t.default_scene_id
  end
  from public.tables t
  join public.table_members m on m.table_id = t.id
  where t.id = p_table
    and t.session_open
    and m.user_id = auth.uid()
    and m.banned = false;
$$;

create or replace function public.is_scene_gm(p_scene uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.scenes s
    where s.id = p_scene and public.is_table_gm(s.table_id)
  );
$$;

create or replace function public.can_view_scene(p_scene uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.scenes s
    where s.id = p_scene
      and (public.is_table_gm(s.table_id) or public.my_scene(s.table_id) = s.id)
  );
$$;

-- Espectador vê a cena, mas não mexe nela.
create or replace function public.can_edit_scene(p_scene uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.scenes s
    where s.id = p_scene
      and (
        public.is_table_gm(s.table_id)
        or (
          public.my_scene(s.table_id) = s.id
          and exists (
            select 1 from public.table_members m
            where m.table_id = s.table_id
              and m.user_id = auth.uid()
              and m.role = 'jogador'
              and m.banned = false
          )
        )
      )
  );
$$;

-- ========== REGRAS QUE O RLS NÃO ALCANÇA ==========
-- RLS não compara valor antigo com novo: aqui ficam os campos só da mestra,
-- o updated_at do servidor e o bloqueio de ciclos em anexos.
create or replace function public.guard_scene_object()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cursor uuid;
  v_depth int := 0;
begin
  if not public.is_scene_gm(new.scene_id) then
    if tg_op = 'INSERT' then
      if new.hidden or new.character_id is not null or new.npc_id is not null then
        raise exception 'forbidden';
      end if;
    elsif new.hidden is distinct from old.hidden
      or new.character_id is distinct from old.character_id
      or new.npc_id is distinct from old.npc_id then
      raise exception 'forbidden';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if new.parent_id is distinct from old.parent_id and new.parent_id is not null then
      v_cursor := new.parent_id;
      while v_cursor is not null loop
        v_depth := v_depth + 1;
        if v_cursor = new.id or v_depth > 32 then
          raise exception 'attach_cycle';
        end if;
        -- Pai de outra cena cai em new.id: conta como anexo inválido.
        select case when o.scene_id = new.scene_id then o.parent_id else new.id end
        into v_cursor
        from public.scene_objects o
        where o.id = v_cursor;
      end loop;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists scene_objects_guard on public.scene_objects;
create trigger scene_objects_guard
  before insert or update on public.scene_objects
  for each row execute function public.guard_scene_object();

-- ========== RPCs ==========
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

  insert into public.scenes (id, table_id, name, folder, sort, map_asset_id, meters_per_px, ambient, weather, fog)
  select v_new, table_id, left(name || ' (cópia)', 120), folder,
    (select coalesce(max(sort), 0) + 1 from public.scenes where table_id = v_table),
    map_asset_id, meters_per_px, ambient, weather, fog
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

-- Aprova o asset e transforma as colocações pendentes em objetos de verdade.
-- Devolve as cenas que ganharam objeto, para a mestra avisar quem está nelas.
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

  update public.assets set status = 'approved'
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

revoke all on function public.my_scene(uuid) from public, anon;
revoke all on function public.is_scene_gm(uuid) from public, anon;
revoke all on function public.can_view_scene(uuid) from public, anon;
revoke all on function public.can_edit_scene(uuid) from public, anon;
revoke all on function public.guard_scene_object() from public, anon;
revoke all on function public.duplicate_scene(uuid) from public, anon;
revoke all on function public.approve_asset(uuid) from public, anon;

grant execute on function public.my_scene(uuid) to authenticated;
grant execute on function public.is_scene_gm(uuid) to authenticated;
grant execute on function public.can_view_scene(uuid) to authenticated;
grant execute on function public.can_edit_scene(uuid) to authenticated;
grant execute on function public.duplicate_scene(uuid) to authenticated;
grant execute on function public.approve_asset(uuid) to authenticated;

-- ========== PRIVILÉGIOS POR COLUNA ==========
-- Cena, asset, tipo e autor de um objeto não mudam. Objeto nasce solto: anexar
-- é um update, onde o trigger confere ciclo e cena do pai.
revoke all on public.scene_objects from anon, authenticated;
grant select, delete on public.scene_objects to authenticated;
grant insert (scene_id, asset_id, kind, x, y, rotation, scale, flip_x, flip_y, z, caption, hidden, created_by)
  on public.scene_objects to authenticated;
grant update (x, y, rotation, scale, flip_x, flip_y, z, parent_id, local, caption, effects, conditions, character_id, npc_id, hidden)
  on public.scene_objects to authenticated;

revoke all on public.drawings from anon, authenticated;
grant select, delete on public.drawings to authenticated;
grant insert (scene_id, author_id, points, color, width) on public.drawings to authenticated;

revoke all on public.pending_placements from anon, authenticated;
grant select, delete on public.pending_placements to authenticated;
grant insert (asset_id, scene_id, x, y, scale, created_by) on public.pending_placements to authenticated;

revoke all on public.scenes from anon;

-- ========== RLS ==========
alter table public.scenes enable row level security;
alter table public.scene_objects enable row level security;
alter table public.drawings enable row level security;
alter table public.pending_placements enable row level security;

drop policy if exists "scenes_select" on public.scenes;
create policy "scenes_select" on public.scenes
  for select to authenticated
  using (public.can_view_scene(id));

drop policy if exists "scenes_insert" on public.scenes;
create policy "scenes_insert" on public.scenes
  for insert to authenticated
  with check (public.is_table_gm(table_id));

drop policy if exists "scenes_update" on public.scenes;
create policy "scenes_update" on public.scenes
  for update to authenticated
  using (public.is_table_gm(table_id))
  with check (public.is_table_gm(table_id));

drop policy if exists "scenes_delete" on public.scenes;
create policy "scenes_delete" on public.scenes
  for delete to authenticated
  using (public.is_table_gm(table_id));

drop policy if exists "scene_objects_select" on public.scene_objects;
create policy "scene_objects_select" on public.scene_objects
  for select to authenticated
  using (
    public.is_scene_gm(scene_id)
    or (hidden = false and public.can_view_scene(scene_id))
  );

drop policy if exists "scene_objects_insert" on public.scene_objects;
create policy "scene_objects_insert" on public.scene_objects
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.can_edit_scene(scene_id)
    and exists (
      select 1 from public.assets a
      where a.id = asset_id and a.kind = scene_objects.kind and a.status = 'approved'
    )
  );

drop policy if exists "scene_objects_update" on public.scene_objects;
create policy "scene_objects_update" on public.scene_objects
  for update to authenticated
  using (
    public.is_scene_gm(scene_id)
    or (hidden = false and public.can_edit_scene(scene_id))
  )
  with check (public.can_edit_scene(scene_id));

drop policy if exists "scene_objects_delete" on public.scene_objects;
create policy "scene_objects_delete" on public.scene_objects
  for delete to authenticated
  using (
    public.is_scene_gm(scene_id)
    or (created_by = auth.uid() and hidden = false and public.can_edit_scene(scene_id))
  );

drop policy if exists "drawings_select" on public.drawings;
create policy "drawings_select" on public.drawings
  for select to authenticated
  using (public.can_view_scene(scene_id));

drop policy if exists "drawings_insert" on public.drawings;
create policy "drawings_insert" on public.drawings
  for insert to authenticated
  with check (author_id = auth.uid() and public.can_edit_scene(scene_id));

drop policy if exists "drawings_delete" on public.drawings;
create policy "drawings_delete" on public.drawings
  for delete to authenticated
  using (
    public.is_scene_gm(scene_id)
    or (author_id = auth.uid() and public.can_edit_scene(scene_id))
  );

drop policy if exists "pending_placements_select" on public.pending_placements;
create policy "pending_placements_select" on public.pending_placements
  for select to authenticated
  using (created_by = auth.uid() or public.is_mestre());

drop policy if exists "pending_placements_insert" on public.pending_placements;
create policy "pending_placements_insert" on public.pending_placements
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.can_edit_scene(scene_id)
    and exists (
      select 1 from public.assets a
      where a.id = asset_id and a.uploaded_by = auth.uid() and a.status = 'pending'
    )
  );

drop policy if exists "pending_placements_delete" on public.pending_placements;
create policy "pending_placements_delete" on public.pending_placements
  for delete to authenticated
  using (created_by = auth.uid() or public.is_mestre());

notify pgrst, 'reload schema';
