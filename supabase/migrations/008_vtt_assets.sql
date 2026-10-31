-- Mesa (VTT) — Fase 2: biblioteca global de arquivos e aprovação
-- Rode no SQL Editor do Supabase (depois da 007)

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (
    kind in ('mapa', 'token', 'addon', 'adereco', 'audio_ambiente', 'audio_sfx', 'cutscene')
  ),
  name text not null check (char_length(trim(name)) > 0),
  storage_key text not null unique,
  -- Só arquivos do Blob: um insert direto não consegue apontar para outro site.
  url text not null check (url ~ '^https://[a-z0-9]+\.public\.blob\.vercel-storage\.com/'),
  mime text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  width int,
  height int,
  duration_s numeric,
  tags text[] not null default '{}',
  status text not null default 'pending' check (status in ('approved', 'pending', 'rejected')),
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists assets_status_kind_idx on public.assets (status, kind, created_at desc);

-- Espectador é papel por mesa: pode subir quem é jogador em alguma mesa (ou a mestra).
create or replace function public.can_upload_asset()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_mestre() or exists (
    select 1 from public.table_members
    where user_id = auth.uid() and role = 'jogador' and banned = false
  );
$$;

revoke all on function public.can_upload_asset() from public, anon;
grant execute on function public.can_upload_asset() to authenticated;

revoke all on public.assets from anon;

alter table public.assets enable row level security;

drop policy if exists "assets_select" on public.assets;
create policy "assets_select" on public.assets
  for select to authenticated
  using (
    public.is_mestre()
    or status = 'approved'
    or (status = 'pending' and uploaded_by = auth.uid())
  );

drop policy if exists "assets_insert" on public.assets;
create policy "assets_insert" on public.assets
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and (
      public.is_mestre()
      or (
        status = 'pending'
        and kind in ('mapa', 'token', 'addon', 'adereco')
        and public.can_upload_asset()
      )
    )
  );

drop policy if exists "assets_update" on public.assets;
create policy "assets_update" on public.assets
  for update to authenticated
  using (public.is_mestre())
  with check (public.is_mestre());

drop policy if exists "assets_delete" on public.assets;
create policy "assets_delete" on public.assets
  for delete to authenticated
  using (
    public.is_mestre()
    or (status = 'pending' and uploaded_by = auth.uid())
  );

notify pgrst, 'reload schema';
