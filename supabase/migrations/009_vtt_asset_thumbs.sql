-- Mesa (VTT) — Fase 2: miniatura de mapas e adereços + proteção dos arquivos
-- Rode no SQL Editor do Supabase (depois da 008)

alter table public.assets add column if not exists thumb_url text;

-- Apagar um asset apaga as URLs da linha no Blob. Sem estas regras, um insert
-- direto apontando para o arquivo de outra pessoa permitiria destruí-lo.
create unique index if not exists assets_url_key on public.assets (url);
create unique index if not exists assets_thumb_url_key on public.assets (thumb_url);

alter table public.assets drop constraint if exists assets_thumb_url_check;
alter table public.assets add constraint assets_thumb_url_check check (
  thumb_url ~ '^https://[a-z0-9]+\.public\.blob\.vercel-storage\.com/thumbs/'
);

alter table public.assets drop constraint if exists assets_url_not_thumb_check;
alter table public.assets add constraint assets_url_not_thumb_check check (
  url !~ '^https://[a-z0-9]+\.public\.blob\.vercel-storage\.com/thumbs/'
);

notify pgrst, 'reload schema';
