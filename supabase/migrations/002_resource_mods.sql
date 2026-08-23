-- Mods de HP/Mana/Sanidade máxima (ajuste manual pontual)
alter table public.characters
  add column if not exists resource_mods jsonb not null default '{"hp":0,"mana":0,"sanity":0}'::jsonb;

notify pgrst, 'reload schema';
