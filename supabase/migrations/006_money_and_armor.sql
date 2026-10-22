alter table public.characters
  add column if not exists money numeric(14,2) not null default 0,
  add column if not exists armor jsonb not null default '[]'::jsonb;
