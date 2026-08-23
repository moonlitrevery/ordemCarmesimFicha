-- Rode no SQL Editor do Supabase se a coluna ainda não existir
alter table public.characters
  add column if not exists milestone_notes jsonb not null default '{}'::jsonb;

-- Atualiza o cache de schema da API (às vezes necessário após ALTER)
notify pgrst, 'reload schema';
