-- Fase 6: efeitos e clima usam as colunas que já existem. Qualquer jogador grava
-- `scene_objects.effects`, então ela ganha o mesmo limite da legenda.
alter table public.scene_objects drop constraint if exists scene_objects_effects_check;
alter table public.scene_objects add constraint scene_objects_effects_check
  check (jsonb_typeof(effects) = 'array' and pg_column_size(effects) <= 4096);

alter table public.scenes drop constraint if exists scenes_weather_check;
alter table public.scenes add constraint scenes_weather_check
  check (jsonb_typeof(weather) = 'array' and pg_column_size(weather) <= 4096);

notify pgrst, 'reload schema';
