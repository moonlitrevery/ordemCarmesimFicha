-- Pontos de atributo/perícia gastos por nível (pools independentes da edição manual).
alter table public.characters
  add column if not exists attribute_points_spent int not null default 0,
  add column if not exists skill_points_spent int not null default 0;
