-- Rolagens de dados (feed da mestra em tempo real)
-- Rode no SQL Editor do Supabase

create table if not exists public.dice_rolls (
  id uuid primary key default gen_random_uuid(),
  character_id uuid references public.characters(id) on delete set null,
  character_name text not null,
  roller_id uuid not null references public.profiles(id) on delete cascade,
  roller_name text,
  label text not null,
  notation text not null,
  die_result int,
  bonus int not null default 0,
  total int not null,
  breakdown text,
  created_at timestamptz not null default now()
);

create index if not exists dice_rolls_created_at_idx
  on public.dice_rolls (created_at desc);

alter table public.dice_rolls enable row level security;

create policy "dice_rolls_insert_own"
  on public.dice_rolls for insert
  with check (roller_id = auth.uid());

create policy "dice_rolls_select"
  on public.dice_rolls for select
  using (
    roller_id = auth.uid()
    or public.is_mestre()
  );

-- Realtime (ignore erro se já estiver na publication)
do $$
begin
  alter publication supabase_realtime add table public.dice_rolls;
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
