-- Auditoria de segurança: papel e arquivos alheios.
-- Rode no SQL Editor do Supabase.

-- 1) Papel só muda pelo SQL Editor. Sem isto, `profiles_update_own` deixava qualquer
--    conta fazer `update profiles set role = 'mestre'` em si mesma.
--    `select` de anon continua: o keep-alive do GitHub lê `profiles`.
revoke insert, update, delete, truncate, references, trigger on public.profiles from anon, authenticated;
grant update (display_name, color) on public.profiles to authenticated;

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- 2) `assets` não aponta para arquivo de documento ou relatório: apagar o asset
--    (DELETE /api/upload/[id]) apagaria o arquivo da mesa no Blob.
alter table public.assets drop constraint if exists assets_url_not_table_file_check;
alter table public.assets add constraint assets_url_not_table_file_check
  check (url !~ '^https://[a-z0-9]+\.public\.blob\.vercel-storage\.com/(documento|relatorio)/');

notify pgrst, 'reload schema';
