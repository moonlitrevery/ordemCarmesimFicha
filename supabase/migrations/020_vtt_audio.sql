-- Mesa (VTT) — Fase 7: som em camadas, SFX e volume da mestra
-- Rode no SQL Editor do Supabase (depois da 019)

-- Volume geral, fade e contador de "parar todos os SFX": só a mestra grava.
alter table public.tables add column if not exists audio jsonb not null
  default '{"volume":100,"fadeMs":2000,"sfxStop":0}'::jsonb;
alter table public.tables drop constraint if exists tables_audio_check;
alter table public.tables add constraint tables_audio_check
  check (jsonb_typeof(audio) = 'object' and pg_column_size(audio) <= 512);

-- `tables` tem privilégio por coluna: coluna nova não entra sozinha.
grant select (audio) on public.tables to authenticated;
grant update (audio) on public.tables to authenticated;

-- A leitura de `ambient` depende desta forma: um uuid inválido derrubaria o cast.
create or replace function public.is_valid_ambient(p_ambient jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when jsonb_typeof(p_ambient) <> 'array' then false
    else pg_column_size(p_ambient) <= 4096 and not exists (
      select 1 from jsonb_array_elements(p_ambient) layer
      where not coalesce(
        jsonb_typeof(layer) = 'object'
        and jsonb_typeof(layer->'id') = 'string'
        and layer->>'assetId' ~ '^[0-9a-fA-F-]{36}$'
        and jsonb_typeof(layer->'volume') = 'number'
        and (layer->>'volume')::numeric between 0 and 100
        and (layer->>'target' is null or layer->>'target' ~ '^[0-9a-fA-F-]{36}$'),
        false
      )
    )
  end;
$$;

alter table public.scenes drop constraint if exists scenes_ambient_check;
alter table public.scenes add constraint scenes_ambient_check
  check (public.is_valid_ambient(ambient));

-- `ambient` guarda camada para um jogador só: quem está na cena lê pela RPC, que filtra.
revoke select on public.scenes from authenticated;
grant select (id, table_id, name, folder, sort, map_asset_id, meters_per_px, weather, lighting, fog, created_at)
  on public.scenes to authenticated;

create or replace function public.my_scene_ambient(p_scene uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_scene_gm(p_scene) then s.ambient
    when public.can_view_scene(p_scene) then (
      select coalesce(jsonb_agg(layer order by position), '[]'::jsonb)
      from jsonb_array_elements(s.ambient) with ordinality as item(layer, position)
      where layer->>'target' is null or layer->>'target' = auth.uid()::text
    )
  end
  from public.scenes s
  where s.id = p_scene;
$$;

-- Cada SFX disparado é uma linha: o broadcast só avisa, e o RLS decide quem ouve.
create table if not exists public.audio_cues (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  -- Sem FK: id de `assets` ou do manifest, como `scene_objects.asset_id`.
  asset_id uuid not null,
  target_user uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists audio_cues_table_created_idx
  on public.audio_cues (table_id, created_at desc);

revoke all on public.audio_cues from anon, authenticated;
grant select on public.audio_cues to authenticated;
grant insert (table_id, asset_id, target_user) on public.audio_cues to authenticated;

alter table public.audio_cues enable row level security;

drop policy if exists "audio_cues_select" on public.audio_cues;
create policy "audio_cues_select" on public.audio_cues
  for select to authenticated
  using (
    public.is_table_gm(table_id)
    or (
      public.is_table_member(table_id)
      and (target_user is null or target_user = (select auth.uid()))
    )
  );

drop policy if exists "audio_cues_insert" on public.audio_cues;
create policy "audio_cues_insert" on public.audio_cues
  for insert to authenticated
  with check (
    public.is_table_gm(table_id)
    and public.can_place_asset(asset_id, 'audio_sfx')
  );

-- A linha só serve para o aviso que acabou de sair: a tabela não cresce.
create or replace function public.prune_audio_cues()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.audio_cues
  where table_id = new.table_id and created_at < now() - interval '2 minutes';
  return new;
end;
$$;

drop trigger if exists audio_cues_prune on public.audio_cues;
create trigger audio_cues_prune
  after insert on public.audio_cues
  for each row execute function public.prune_audio_cues();

-- Som da cena e SFX recente, sempre gravados pela mestra: nenhum jogador força esta lista.
create or replace function public.my_audio_asset_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select (layer->>'assetId')::uuid
  from public.scenes s
  cross join lateral jsonb_array_elements(s.ambient) layer
  where s.id in (select public.my_visible_scene_ids())
    and (layer->>'target' is null or layer->>'target' = auth.uid()::text)
  union
  select c.asset_id
  from public.audio_cues c
  where c.created_at > now() - interval '2 minutes'
    and (c.target_user is null or c.target_user = auth.uid())
    and c.table_id in (
      select m.table_id from public.table_members m
      where m.user_id = auth.uid() and m.banned = false
    );
$$;

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
    and o.scene_id in (select public.my_visible_scene_ids())
  union
  select public.my_audio_asset_ids();
$$;

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
    and o.scene_id in (select public.my_visible_scene_ids())
  union
  select public.my_audio_asset_ids();
$$;

-- Apagar o arquivo também o tira do ambiente das cenas.
create or replace function public.detach_deleted_asset()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.scene_objects where asset_id = old.id;
  delete from public.audio_cues where asset_id = old.id;
  update public.scenes set map_asset_id = null where map_asset_id = old.id;
  update public.scenes s
  set ambient = (
    select coalesce(jsonb_agg(layer order by position), '[]'::jsonb)
    from jsonb_array_elements(s.ambient) with ordinality as item(layer, position)
    where layer->>'assetId' <> old.id::text
  )
  where s.ambient @> jsonb_build_array(jsonb_build_object('assetId', old.id::text));
  return old;
end;
$$;

revoke all on function public.my_scene_ambient(uuid) from public, anon;
revoke all on function public.my_audio_asset_ids() from public, anon;
revoke all on function public.prune_audio_cues() from public, anon;
grant execute on function public.my_scene_ambient(uuid) to authenticated;
grant execute on function public.my_audio_asset_ids() to authenticated;

notify pgrst, 'reload schema';
