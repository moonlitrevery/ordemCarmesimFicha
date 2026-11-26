-- Limites de tentativa: código de mesa e cota de envio de jogador.
-- Rode no SQL Editor do Supabase ANTES do deploy: o site novo recusa envio de
-- jogador sem `reserve_upload`. O site antigo continua funcionando com esta migração.

-- ========== CÓDIGO DE MESA ==========
-- Tentativas erradas por conta. Só as funções abaixo leem e gravam (sem policy).
create table if not exists public.table_join_failures (
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists table_join_failures_user_idx
  on public.table_join_failures (user_id, attempted_at desc);
revoke all on public.table_join_failures from anon, authenticated;
alter table public.table_join_failures enable row level security;

-- 8 símbolos: 32^8 ≈ 1,1 trilhão. Mesa existente fica com o código de 6 até a
-- mestra gerar um novo (botão de regenerar).
create or replace function public.gen_table_code()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  random_bytes bytea;
  candidate text;
begin
  loop
    random_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    candidate := '';
    for i in 0..7 loop
      candidate := candidate || substr(alphabet, (get_byte(random_bytes, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.tables where code = candidate);
  end loop;
  return candidate;
end;
$$;

-- Código errado devolve null em vez de erro: um `raise` desfaria o registro da tentativa.
-- 10 erros em 15 minutos bloqueiam a conta até a janela passar.
create or replace function public.join_table(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_table uuid;
  v_owner uuid;
  v_banned boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if (
    select count(*) from public.table_join_failures
    where user_id = v_uid and attempted_at > now() - interval '15 minutes'
  ) >= 10 then
    raise exception 'too_many_attempts';
  end if;

  select id, owner_id into v_table, v_owner
  from public.tables
  where code = upper(trim(p_code));

  if v_table is null then
    insert into public.table_join_failures (user_id) values (v_uid);
    delete from public.table_join_failures
    where user_id = v_uid and attempted_at < now() - interval '1 day';
    return null;
  end if;

  if v_owner = v_uid then
    return v_table;
  end if;

  select banned into v_banned
  from public.table_members
  where table_id = v_table and user_id = v_uid;

  if v_banned then
    raise exception 'banned';
  end if;

  -- do nothing: quem já é membro mantém o papel (espectador não vira jogador)
  insert into public.table_members (table_id, user_id)
  values (v_table, v_uid)
  on conflict (table_id, user_id) do nothing;

  return v_table;
end;
$$;

revoke all on function public.gen_table_code() from public, anon;
revoke all on function public.join_table(text) from public, anon;
grant execute on function public.gen_table_code() to authenticated;
grant execute on function public.join_table(text) to authenticated;

-- ========== COTA DE ENVIO ==========
-- Cada token de upload de jogador reserva o tamanho máximo do arquivo. A mestra
-- não tem cota. 300 MB e 60 tokens por 24 h (imagem = arquivo + miniatura).
create table if not exists public.upload_reservations (
  user_id uuid not null references auth.users (id) on delete cascade,
  bytes bigint not null check (bytes > 0),
  created_at timestamptz not null default now()
);
create index if not exists upload_reservations_user_idx
  on public.upload_reservations (user_id, created_at desc);
revoke all on public.upload_reservations from anon, authenticated;
alter table public.upload_reservations enable row level security;

create or replace function public.reserve_upload(p_bytes bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_bytes bigint;
  v_count int;
begin
  if v_uid is null or p_bytes is null or p_bytes <= 0 or p_bytes > 50 * 1024 * 1024 then
    return false;
  end if;
  if public.is_mestre() then
    return true;
  end if;

  -- Dois pedidos ao mesmo tempo não passam juntos do limite.
  perform pg_advisory_xact_lock(hashtext('reserve_upload:' || v_uid::text));

  select coalesce(sum(bytes), 0), count(*) into v_bytes, v_count
  from public.upload_reservations
  where user_id = v_uid and created_at > now() - interval '24 hours';

  if v_count >= 60 or v_bytes + p_bytes > 300 * 1024 * 1024 then
    return false;
  end if;

  insert into public.upload_reservations (user_id, bytes) values (v_uid, p_bytes);
  delete from public.upload_reservations
  where user_id = v_uid and created_at < now() - interval '2 days';
  return true;
end;
$$;

revoke all on function public.reserve_upload(bigint) from public, anon;
grant execute on function public.reserve_upload(bigint) to authenticated;

notify pgrst, 'reload schema';
