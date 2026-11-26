-- Rolagem do chat sorteada no banco: o cliente manda a notação, não o resultado.
-- Rode no SQL Editor do Supabase DEPOIS do deploy do site que chama `chat_roll`
-- (o site novo cai no insert antigo enquanto a função não existe; o antigo para de
-- rolar quando esta migração roda).

-- Mesma gramática de `parseDiceExpression` (src/lib/dice.ts): termos `NdM` ou número,
-- com sinal a partir do segundo, dado nunca negativo, até 100 dados, d2–d1000 e
-- modificador até ±100000. Inválida = null.
create or replace function public.roll_dice_expression(p_notation text)
returns jsonb
language plpgsql
volatile
set search_path = public
as $$
declare
  v_clean text := regexp_replace(coalesce(p_notation, ''), '\s+', '', 'g');
  v_rest text;
  v_term text;
  v_m text[];
  v_first boolean := true;
  v_count int;
  v_sides int;
  v_value int;
  v_modifier int := 0;
  v_dice int := 0;
  v_results int[];
  v_all int[] := '{}';
  v_groups jsonb := '[]'::jsonb;
  v_math text;
begin
  if v_clean = '' or length(v_clean) > 200 then
    return null;
  end if;
  v_rest := v_clean;

  while v_rest <> '' loop
    v_term := substring(v_rest from '^[+-]?(?:[0-9]*[dD][0-9]+|[0-9]+)');
    if v_term is null then
      return null;
    end if;
    v_rest := substr(v_rest, length(v_term) + 1);
    v_m := regexp_match(v_term, '^([+-]?)(?:([0-9]*)[dD]([0-9]+)|([0-9]+))$');
    if not v_first and v_m[1] = '' then
      return null;
    end if;
    v_first := false;

    if v_m[3] is null then
      if length(v_m[4]) > 6 then
        return null;
      end if;
      v_value := v_m[4]::int;
      v_modifier := v_modifier + case when v_m[1] = '-' then -v_value else v_value end;
      continue;
    end if;

    if v_m[1] = '-' or length(v_m[2]) > 3 or length(v_m[3]) > 4 then
      return null;
    end if;
    v_count := case when v_m[2] = '' then 1 else v_m[2]::int end;
    v_sides := v_m[3]::int;
    if v_count < 1 or v_sides < 2 or v_sides > 1000 then
      return null;
    end if;
    v_dice := v_dice + v_count;
    if v_dice > 100 then
      return null;
    end if;

    select array_agg(floor(random() * v_sides)::int + 1) into v_results
    from generate_series(1, v_count);
    v_all := v_all || v_results;
    v_groups := v_groups || jsonb_build_array(
      jsonb_build_object('sides', v_sides, 'results', to_jsonb(v_results))
    );
  end loop;

  if jsonb_array_length(v_groups) = 0 or abs(v_modifier) > 100000 then
    return null;
  end if;

  v_math := array_to_string(v_all, ' + ');
  if v_modifier <> 0 then
    v_math := v_math || case when v_modifier > 0 then ' + ' else ' - ' end || abs(v_modifier)::text;
  end if;

  return jsonb_build_object(
    'notation', v_clean,
    'groups', v_groups,
    'modifier', v_modifier,
    'total', (select coalesce(sum(x), 0) from unnest(v_all) x) + v_modifier,
    'math', v_math
  );
end;
$$;

revoke all on function public.roll_dice_expression(text) from public, anon;
grant execute on function public.roll_dice_expression(text) to authenticated;

-- Insert de rolagem só por aqui. As regras de membro valem como no insert do
-- cliente (`chat_messages_insert`), e o trigger `guard_chat_message` continua
-- conferindo personagem e oculto. `p_actor`: nome no log quando quem age não é a
-- ficha (NPC, iniciativa).
create or replace function public.chat_roll(
  p_table uuid,
  p_notation text,
  p_label text default '',
  p_hidden boolean default false,
  p_character uuid default null,
  p_actor text default null
)
returns public.chat_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_roll jsonb;
  v_row public.chat_messages;
  v_single boolean;
begin
  if v_uid is null or not (public.is_table_gm(p_table) or public.is_table_member(p_table)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_roll := public.roll_dice_expression(p_notation);
  if v_roll is null then
    raise exception 'invalid_notation';
  end if;
  v_roll := v_roll || jsonb_build_object('label', left(coalesce(p_label, ''), 200));

  -- Só vale nesta transação: o cliente não tem como ligar isto pelo PostgREST.
  perform set_config('app.server_roll', 'on', true);
  insert into public.chat_messages (table_id, author_id, character_id, kind, body, roll, hidden)
  values (p_table, v_uid, p_character, 'roll', '', v_roll, coalesce(p_hidden, false))
  returning * into v_row;
  perform set_config('app.server_roll', 'off', true);

  v_single := jsonb_array_length(v_roll->'groups') = 1
    and jsonb_array_length(v_roll->'groups'->0->'results') = 1;
  -- Log antigo (sem leitor desde a Fase 13): banco sem a migração 003 só pula.
  begin
    insert into public.dice_rolls (
      character_id, character_name, roller_id, roller_name, label, notation,
      die_result, bonus, total, breakdown
    )
    values (
      v_row.character_id,
      left(coalesce(nullif(trim(p_actor), ''), v_row.character_name, v_row.author_name), 120),
      v_uid,
      v_row.author_name,
      coalesce(nullif(v_roll->>'label', ''), v_roll->>'notation'),
      v_roll->>'notation',
      case when v_single then (v_roll->'groups'->0->'results'->>0)::int end,
      (v_roll->>'modifier')::int,
      (v_roll->>'total')::int,
      (v_roll->>'math') || ' = ' || (v_roll->>'total')
    );
  exception
    when undefined_table then null;
  end;

  return v_row;
end;
$$;

revoke all on function public.chat_roll(uuid, text, text, boolean, uuid, text) from public, anon;
grant execute on function public.chat_roll(uuid, text, text, boolean, uuid, text) to authenticated;

-- Rolagem inserida direto pelo cliente (com resultado inventado) é recusada.
create or replace function public.guard_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_character_name text;
begin
  if tg_op = 'UPDATE' then
    -- Apagar apaga mesmo: o RLS deixaria o autor ler o texto antigo.
    if new.deleted then
      new.body := '';
      new.roll := null;
    end if;
    return new;
  end if;

  if new.kind = 'roll' and current_setting('app.server_roll', true) is distinct from 'on' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select display_name into new.author_name from public.profiles where id = new.author_id;
  if new.author_name is null then
    raise exception 'forbidden';
  end if;

  new.character_name := null;
  if new.character_id is not null then
    select name into v_character_name
    from public.characters
    where id = new.character_id
      and (owner_id = new.author_id or public.is_table_gm(new.table_id));
    if v_character_name is null then
      raise exception 'forbidden';
    end if;
    new.character_name := v_character_name;
  end if;

  if new.kind = 'system' and not public.is_table_gm(new.table_id) then
    raise exception 'forbidden';
  end if;
  if (new.kind = 'roll') <> (new.roll is not null) then
    raise exception 'invalid_message';
  end if;
  if new.hidden and new.kind <> 'roll' then
    raise exception 'invalid_message';
  end if;
  if (new.kind = 'whisper') <> (new.whisper_to is not null) then
    raise exception 'invalid_message';
  end if;
  if new.whisper_to is not null and not exists (
    select 1 from public.tables where id = new.table_id and owner_id = new.whisper_to
    union all
    select 1 from public.table_members
    where table_id = new.table_id and user_id = new.whisper_to and banned = false
  ) then
    raise exception 'invalid_whisper';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_chat_message() from public, anon;

notify pgrst, 'reload schema';
