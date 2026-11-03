-- Mesa (VTT) — Fase 8: documentos (handouts) e relatórios
-- Rode no SQL Editor do Supabase (depois da 020)

-- 'gm' (dona), 'player' (jogador não banido) ou nulo: espectador lê, mas não envia.
create or replace function public.table_upload_role(p_table uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_table_gm(p_table) then 'gm'
    when exists (
      select 1 from public.table_members
      where table_id = p_table and user_id = auth.uid()
        and role = 'jogador' and banned = false
    ) then 'player'
  end;
$$;

revoke all on function public.table_upload_role(uuid) from public, anon;
grant execute on function public.table_upload_role(uuid) to authenticated;

create table if not exists public.table_documents (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  category text not null check (category in ('carta', 'prova', 'pista', 'referencia')),
  title text not null check (char_length(title) between 1 and 120),
  storage_key text not null,
  -- Presa à pasta e única: apagar a linha apaga o arquivo, então ela nunca pode
  -- apontar para o arquivo de outra, nem de `assets`.
  url text not null unique
    check (url ~ '^https://[a-z0-9]+\.public\.blob\.vercel-storage\.com/documento/'),
  mime text not null check (mime in (
    'application/pdf', 'image/webp', 'image/png', 'image/jpeg',
    'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a'
  )),
  size_bytes bigint not null check (size_bytes > 0),
  status text not null default 'pending' check (status in ('approved', 'pending')),
  uploaded_by uuid references public.profiles(id) on delete set null,
  -- "Mostrar a todos": o broadcast é só aviso, e quem recebe confere aqui.
  shown_at timestamptz,
  created_at timestamptz not null default now(),
  check (shown_at is null or status = 'approved')
);

create index if not exists table_documents_table_created_idx
  on public.table_documents (table_id, created_at desc);

create table if not exists public.table_reports (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  storage_key text not null,
  url text not null unique
    check (url ~ '^https://[a-z0-9]+\.public\.blob\.vercel-storage\.com/relatorio/'),
  mime text not null check (mime in (
    'application/pdf', 'text/markdown', 'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  size_bytes bigint not null check (size_bytes > 0),
  author_id uuid references public.profiles(id) on delete set null,
  character_id uuid references public.characters(id) on delete set null,
  -- Copiado do banco pelo trigger: jogador não lê a ficha dos outros, e o nome fica
  -- mesmo se a ficha for apagada.
  character_name text,
  created_at timestamptz not null default now()
);

create index if not exists table_reports_table_created_idx
  on public.table_reports (table_id, created_at desc);

create or replace function public.guard_table_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.character_name := null;
  if new.character_id is not null then
    select c.name into new.character_name
    from public.characters c
    where c.id = new.character_id
      and (c.owner_id = auth.uid() or public.is_table_gm(new.table_id));
    if not found then
      raise exception 'forbidden character' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_table_report() from public, anon, authenticated;

drop trigger if exists guard_table_report on public.table_reports;
create trigger guard_table_report
  before insert on public.table_reports
  for each row execute function public.guard_table_report();

-- Privilégio por coluna: `url` e `uploaded_by` nunca mudam, e jogador não grava `shown_at`.
revoke all on public.table_documents from anon, authenticated;
grant select, delete on public.table_documents to authenticated;
grant insert (table_id, category, title, storage_key, url, mime, size_bytes, status, uploaded_by)
  on public.table_documents to authenticated;
grant update (status, shown_at) on public.table_documents to authenticated;

revoke all on public.table_reports from anon, authenticated;
grant select, delete on public.table_reports to authenticated;
grant insert (table_id, title, storage_key, url, mime, size_bytes, author_id, character_id)
  on public.table_reports to authenticated;

alter table public.table_documents enable row level security;
alter table public.table_reports enable row level security;

-- Nada aqui olha `session_open`: documentos e relatórios valem com a sessão fechada.
drop policy if exists "table_documents_select" on public.table_documents;
create policy "table_documents_select" on public.table_documents
  for select to authenticated using (
    public.is_table_gm(table_id)
    or (
      public.is_table_member(table_id)
      and (status = 'approved' or uploaded_by = (select auth.uid()))
    )
  );

drop policy if exists "table_documents_insert" on public.table_documents;
create policy "table_documents_insert" on public.table_documents
  for insert to authenticated with check (
    uploaded_by = (select auth.uid())
    and case public.table_upload_role(table_id)
      when 'gm' then status = 'approved'
      when 'player' then category = 'referencia' and status = 'pending'
      else false
    end
  );

drop policy if exists "table_documents_update" on public.table_documents;
create policy "table_documents_update" on public.table_documents
  for update to authenticated
  using (public.is_table_gm(table_id))
  with check (public.is_table_gm(table_id));

drop policy if exists "table_documents_delete" on public.table_documents;
create policy "table_documents_delete" on public.table_documents
  for delete to authenticated using (
    public.is_table_gm(table_id) or uploaded_by = (select auth.uid())
  );

drop policy if exists "table_reports_select" on public.table_reports;
create policy "table_reports_select" on public.table_reports
  for select to authenticated using (
    public.is_table_gm(table_id) or public.is_table_member(table_id)
  );

drop policy if exists "table_reports_insert" on public.table_reports;
create policy "table_reports_insert" on public.table_reports
  for insert to authenticated with check (
    author_id = (select auth.uid())
    and public.table_upload_role(table_id) is not null
  );

drop policy if exists "table_reports_delete" on public.table_reports;
create policy "table_reports_delete" on public.table_reports
  for delete to authenticated using (
    public.is_table_gm(table_id) or author_id = (select auth.uid())
  );

notify pgrst, 'reload schema';
