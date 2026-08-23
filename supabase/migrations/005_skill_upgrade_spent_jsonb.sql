-- Pools de upgrade de perícia (basico / medio / alto / expert).
-- Se skill_points_spent ainda for int (migração 004), converte para jsonb.

do $$
declare
  dtype text;
begin
  select data_type into dtype
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'characters'
    and column_name = 'skill_points_spent';

  if dtype is null then
    alter table public.characters
      add column skill_points_spent jsonb not null
      default '{"basico":0,"medio":0,"alto":0,"expert":0}'::jsonb;
  elsif dtype in ('integer', 'bigint', 'smallint') then
    alter table public.characters
      add column if not exists skill_upgrade_spent jsonb not null
      default '{"basico":0,"medio":0,"alto":0,"expert":0}'::jsonb;

    update public.characters
    set skill_upgrade_spent = jsonb_build_object(
      'basico', coalesce(skill_points_spent, 0),
      'medio', 0,
      'alto', 0,
      'expert', 0
    );

    alter table public.characters drop column skill_points_spent;
    alter table public.characters rename column skill_upgrade_spent to skill_points_spent;
  end if;
end $$;