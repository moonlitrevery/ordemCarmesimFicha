-- Mesa (VTT) — Fase 11: névoa de guerra.
-- A coluna `scenes.fog` existe desde a 010, e já tem tudo de que a névoa precisa:
-- todo membro lê (privilégio por coluna da 020), só a mestra grava (`scenes_update`)
-- e `duplicate_scene` copia. Esta migração só confere o formato e cria o canal
-- `nevoa:{mesa}`, em que todo membro lê e só a mestra escreve.

-- Formato: { v: 1, w, h, bits }, uma grade de 1/8 do mapa, 1 bit por célula
-- (1 = revelado) em base64 com padding. Nula = névoa desligada.
create or replace function public.is_valid_fog(p_fog jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_w int;
  v_h int;
  v_bytes int;
  v_pad int;
begin
  if p_fog is null then
    return true;
  end if;
  if jsonb_typeof(p_fog) <> 'object'
    or p_fog->>'v' is distinct from '1'
    or jsonb_typeof(p_fog->'w') <> 'number'
    or jsonb_typeof(p_fog->'h') <> 'number'
    or jsonb_typeof(p_fog->'bits') <> 'string'
    or (p_fog->>'w') !~ '^[0-9]{1,4}$'
    or (p_fog->>'h') !~ '^[0-9]{1,4}$' then
    return false;
  end if;
  v_w := (p_fog->>'w')::int;
  v_h := (p_fog->>'h')::int;
  if v_w not between 1 and 1024 or v_h not between 1 and 1024 then
    return false;
  end if;
  -- base64 de ceil(w*h/8) bytes: 4 caracteres a cada 3 bytes, e o padding exato
  -- (só o tamanho deixaria passar 3 bytes onde cabe 1).
  v_bytes := (v_w * v_h + 7) / 8;
  v_pad := (3 - v_bytes % 3) % 3;
  return length(p_fog->>'bits') = ((v_bytes + 2) / 3) * 4
    and (p_fog->>'bits') ~ ('^[A-Za-z0-9+/]*' || repeat('=', v_pad) || '$');
end;
$$;

revoke all on function public.is_valid_fog(jsonb) from public, anon;
grant execute on function public.is_valid_fog(jsonb) to authenticated;

-- `not valid`: só confere o que for gravado daqui em diante (a coluna nunca foi usada).
alter table public.scenes drop constraint if exists scenes_fog_check;
alter table public.scenes add constraint scenes_fog_check
  check (public.is_valid_fog(fog)) not valid;

-- Canal da névoa. Ler: quem lê o canal da mesa. Escrever: só a mestra da mesa,
-- então um `fog:patch` forjado por jogador é recusado pelo Realtime.
create or replace function public.can_access_table_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_table uuid;
begin
  if p_topic ~ '^mesa:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_table := substr(p_topic, 6)::uuid;
  elsif p_topic ~ '^nevoa:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_table := substr(p_topic, 7)::uuid;
  else
    return false;
  end if;
  return public.is_table_gm(v_table) or public.is_table_member(v_table);
end;
$$;

create or replace function public.can_write_table_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_topic ~ '^nevoa:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return public.is_table_gm(substr(p_topic, 7)::uuid);
  end if;
  return public.can_access_table_topic(p_topic);
end;
$$;

revoke all on function public.can_access_table_topic(text) from public, anon;
revoke all on function public.can_write_table_topic(text) from public, anon;
grant execute on function public.can_access_table_topic(text) to authenticated;
grant execute on function public.can_write_table_topic(text) to authenticated;

drop policy if exists "vtt_channel_write" on realtime.messages;
create policy "vtt_channel_write" on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and public.can_write_table_topic(realtime.topic())
  );

notify pgrst, 'reload schema';
