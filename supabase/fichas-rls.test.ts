import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Testes de integração da camada de dados das fichas (P2 — Testes e Qualidade).
 *
 * Roda o schema.sql e a migração 003 (rolagens) num Postgres embutido (PGlite)
 * e executa as consultas como o PostgREST do Supabase faz: papel
 * `authenticated` ou `anon` e o id do usuário em `request.jwt.claim.sub`.
 * Assim a política RLS que protege cada operação é exercitada de verdade.
 *
 * Rastreabilidade: RF-04, RF-05, RF-06, RF-07, RF-10, RNF-01 (Apêndice B).
 */

const MESTRE = 'aaaaaaaa-0000-4000-8000-000000000001';
const JOGADOR = 'aaaaaaaa-0000-4000-8000-000000000002';
const OUTRO_JOGADOR = 'aaaaaaaa-0000-4000-8000-000000000003';

const SUPABASE_STUBS = `
  create role anon;
  create role authenticated;
  alter default privileges in schema public
    grant all on tables to anon, authenticated;
  create schema auth;
  create schema realtime;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create table realtime.messages (extension text, topic text);
  alter table realtime.messages enable row level security;
  create function realtime.topic() returns text language sql stable as $$ select '' $$;
  create publication supabase_realtime;
`;

let db: PGlite;

function readSql(...segments: string[]): string {
  return readFileSync(path.join(process.cwd(), 'supabase', ...segments), 'utf8');
}

/** Executa como o PostgREST: papel `authenticated` e o usuário na sessão. */
async function asUser<T>(userId: string, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
  await db.exec('set role authenticated');
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}

/** Executa sem login (chave anon do Supabase). */
async function asAnon<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  await db.exec('set role anon');
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}

async function criarFicha(dono: string, nome: string): Promise<string> {
  const rows = await asUser<{ id: string }>(
    dono,
    `insert into public.characters (owner_id, name) values ($1, $2) returning id`,
    [dono, nome]
  );
  expect(rows).toHaveLength(1);
  return rows[0].id;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  await db.exec(readSql('schema.sql'));
  await db.exec(readSql('migrations', '003_dice_rolls.sql'));

  for (const id of [MESTRE, JOGADOR, OUTRO_JOGADOR]) {
    await db.query(`insert into auth.users (id, email) values ($1::uuid, $1::text || '@teste')`, [id]);
  }
  await db.query(`update public.profiles set role = 'mestre' where id = $1`, [MESTRE]);
}, 60_000);

describe('cadastro → perfil (trigger handle_new_user)', () => {
  it('toda conta nova nasce com papel jogador', async () => {
    const [perfil] = await asUser<{ role: string }>(
      JOGADOR,
      `select role from public.profiles where id = $1`,
      [JOGADOR]
    );
    expect(perfil.role).toBe('jogador');
  });
});

describe('fichas: criar e listar (RF-04, RF-05)', () => {
  it('jogador cria a própria ficha e a recebe no retorno', async () => {
    const id = await criarFicha(JOGADOR, 'Personagem IT-01');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('jogador não cria ficha em nome de outra pessoa', async () => {
    await expect(
      asUser(JOGADOR, `insert into public.characters (owner_id, name) values ($1, 'Intrusa') returning id`, [
        OUTRO_JOGADOR,
      ])
    ).rejects.toThrow(/row-level security/);
  });

  it('ficha sem nome é recusada pelo banco', async () => {
    await expect(
      asUser(JOGADOR, `insert into public.characters (owner_id, name) values ($1, null) returning id`, [JOGADOR])
    ).rejects.toThrow(/null value in column "name"/);
  });

  it('jogador lista só as próprias fichas; mestre vê todas', async () => {
    await criarFicha(OUTRO_JOGADOR, 'Ficha do outro');
    const doJogador = await asUser<{ owner_id: string }>(JOGADOR, `select owner_id from public.characters`);
    expect(doJogador.length).toBeGreaterThan(0);
    expect(doJogador.every((f) => f.owner_id === JOGADOR)).toBe(true);

    const doMestre = await asUser<{ owner_id: string }>(MESTRE, `select owner_id from public.characters`);
    const donos = new Set(doMestre.map((f) => f.owner_id));
    expect(donos.has(JOGADOR)).toBe(true);
    expect(donos.has(OUTRO_JOGADOR)).toBe(true);
  });

  it('sem login (anon) nenhuma ficha é visível', async () => {
    const rows = await asAnon(`select id from public.characters`);
    expect(rows).toEqual([]);
  });
});

describe('fichas: editar e apagar (RF-06, RF-07)', () => {
  it('dono altera a ocupação e o valor persiste', async () => {
    const id = await criarFicha(JOGADOR, 'Personagem IT-02');
    await asUser(JOGADOR, `update public.characters set occupation = 'Teste IT' where id = $1`, [id]);
    const [ficha] = await asUser<{ occupation: string }>(
      JOGADOR,
      `select occupation from public.characters where id = $1`,
      [id]
    );
    expect(ficha.occupation).toBe('Teste IT');
  });

  it('outro jogador não altera ficha alheia (update sem efeito)', async () => {
    const id = await criarFicha(JOGADOR, 'Personagem IT-03');
    const alteradas = await asUser(
      OUTRO_JOGADOR,
      `update public.characters set occupation = 'Invasão' where id = $1 returning id`,
      [id]
    );
    expect(alteradas).toEqual([]);
  });

  it('outro jogador não apaga ficha alheia; o dono apaga', async () => {
    const id = await criarFicha(JOGADOR, 'Personagem IT-04');
    const apagadasPorOutro = await asUser(OUTRO_JOGADOR, `delete from public.characters where id = $1 returning id`, [
      id,
    ]);
    expect(apagadasPorOutro).toEqual([]);

    const apagadasPeloDono = await asUser(JOGADOR, `delete from public.characters where id = $1 returning id`, [id]);
    expect(apagadasPeloDono).toHaveLength(1);
    const restante = await asUser(MESTRE, `select id from public.characters where id = $1`, [id]);
    expect(restante).toEqual([]);
  });

  it('mestre não apaga ficha de jogador (só o dono apaga)', async () => {
    const id = await criarFicha(JOGADOR, 'Personagem IT-05');
    const apagadas = await asUser(MESTRE, `delete from public.characters where id = $1 returning id`, [id]);
    expect(apagadas).toEqual([]);
  });
});

describe('rolagens: feed da mestra (RF-10, RNF-01)', () => {
  const INSERT_ROLL = `insert into public.dice_rolls
    (character_name, roller_id, label, notation, total, breakdown)
    values ('Personagem', $1, 'FORÇA', '1d20', 12, '12') returning id`;

  it('jogador registra a própria rolagem', async () => {
    const rows = await asUser(JOGADOR, INSERT_ROLL, [JOGADOR]);
    expect(rows).toHaveLength(1);
  });

  it('jogador não registra rolagem em nome de outro', async () => {
    await expect(asUser(JOGADOR, INSERT_ROLL, [OUTRO_JOGADOR])).rejects.toThrow(/row-level security/);
  });

  it('jogador não vê rolagens de outros; mestre vê todas', async () => {
    await asUser(OUTRO_JOGADOR, INSERT_ROLL, [OUTRO_JOGADOR]);
    const doJogador = await asUser<{ roller_id: string }>(JOGADOR, `select roller_id from public.dice_rolls`);
    expect(doJogador.every((r) => r.roller_id === JOGADOR)).toBe(true);

    const doMestre = await asUser<{ roller_id: string }>(MESTRE, `select roller_id from public.dice_rolls`);
    expect(new Set(doMestre.map((r) => r.roller_id))).toEqual(new Set([JOGADOR, OUTRO_JOGADOR]));
  });

  it('jogador não se promove a mestre pelo próprio perfil', async () => {
    // profiles_update_own permite editar o próprio perfil; o papel não pode mudar por aí.
    let promoveu = false;
    try {
      await asUser(JOGADOR, `update public.profiles set role = 'mestre' where id = $1`, [JOGADOR]);
      const [perfil] = await asUser<{ role: string }>(JOGADOR, `select role from public.profiles where id = $1`, [
        JOGADOR,
      ]);
      promoveu = perfil.role === 'mestre';
    } catch {
      promoveu = false;
    }
    expect(promoveu).toBe(false);
  });
});
