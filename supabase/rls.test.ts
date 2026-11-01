import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Roda o schema.sql de verdade num Postgres embutido. Cobre o `.insert().select()`
 * do cliente: o RETURNING passa pela política de SELECT, e função stable que
 * consulta a própria tabela não enxerga a linha nova (42501).
 */

const GM = '11111111-1111-4111-8111-111111111111';
const PLAYER = '22222222-2222-4222-8222-222222222222';
const SPECTATOR = '33333333-3333-4333-8333-333333333333';
const OUTSIDER = '44444444-4444-4444-8444-444444444444';
const STATIC_ASSET = '82c0bfbf-6ed0-505a-977c-6b7782140ce1';

// O que o Supabase já traz pronto e o schema.sql assume que existe.
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
let openTable: string;
let closedTable: string;
let defaultScene: string;
let otherScene: string;
let closedScene: string;
let approvedToken: string;
let pendingToken: string;

function readSql(...segments: string[]): string {
  return readFileSync(path.join(process.cwd(), 'supabase', ...segments), 'utf8');
}

/** Como o PostgREST: papel `authenticated` e o usuário nas configurações da sessão. */
async function asUser<T>(
  userId: string,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
  await db.exec('set role authenticated');
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}

async function insertOne(
  userId: string,
  sql: string,
  params: unknown[]
): Promise<{ id: string }> {
  const rows = await asUser<{ id: string }>(userId, sql, params);
  expect(rows).toHaveLength(1);
  return rows[0];
}

const INSERT_SCENE = `insert into public.scenes (table_id, name) values ($1, 'Cena') returning id, table_id, name`;
const INSERT_OBJECT = `insert into public.scene_objects (scene_id, asset_id, kind, created_by, hidden)
  values ($1, $2, 'token', $3, $4) returning id, scene_id, asset_id, hidden`;
const INSERT_DRAWING = `insert into public.drawings (scene_id, author_id, points, color, width)
  values ($1, $2, '{0,0,1,1}', '#ff0000', 2) returning id, scene_id, author_id`;
const INSERT_PLACEMENT = `insert into public.pending_placements (asset_id, scene_id, x, y, scale, created_by)
  values ($1, $2, 0, 0, 1, $3) returning id, asset_id, scene_id, x, y, scale, created_by, created_at`;
const INSERT_MESSAGE = `insert into public.chat_messages (table_id, author_id, kind, body, roll, hidden, whisper_to)
  values ($1, $2, $3, $4, $5, $6, $7) returning id, author_name, kind, body`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  await db.exec(readSql('schema.sql'));

  for (const id of [GM, PLAYER, SPECTATOR, OUTSIDER]) {
    await db.query(`insert into auth.users (id, email) values ($1::uuid, $1::text || '@teste')`, [id]);
  }
  await db.query(`update public.profiles set role = 'mestre' where id = $1`, [GM]);

  const addTable = async (open: boolean) =>
    (
      await db.query<{ id: string }>(
        `insert into public.tables (name, owner_id, session_open) values ('Mesa', $1, $2) returning id`,
        [GM, open]
      )
    ).rows[0].id;
  openTable = await addTable(true);
  closedTable = await addTable(false);

  await db.query(
    `insert into public.table_members (table_id, user_id, role)
     values ($1, $2, 'jogador'), ($1, $3, 'espectador')`,
    [openTable, PLAYER, SPECTATOR]
  );

  const addScene = async (tableId: string) =>
    (
      await db.query<{ id: string }>(
        `insert into public.scenes (table_id, name) values ($1, 'Base') returning id`,
        [tableId]
      )
    ).rows[0].id;
  defaultScene = await addScene(openTable);
  otherScene = await addScene(openTable);
  closedScene = await addScene(closedTable);
  await db.query(`update public.tables set default_scene_id = $1 where id = $2`, [
    defaultScene,
    openTable,
  ]);

  const addAsset = async (
    name: string,
    status: string,
    visibility: string,
    uploadedBy: string
  ) =>
    (
      await db.query<{ id: string }>(
        `insert into public.assets (kind, name, storage_key, url, mime, size_bytes, status, visibility, uploaded_by)
         values ('token', $1, $1, 'https://abc.public.blob.vercel-storage.com/' || $1, 'image/webp', 1, $2, $3, $4)
         returning id`,
        [name, status, visibility, uploadedBy]
      )
    ).rows[0].id;
  approvedToken = await addAsset('aprovado', 'approved', 'jogadores', GM);
  pendingToken = await addAsset('pendente', 'pending', 'mestre', PLAYER);
}, 60_000);

describe('INSERT com retorno', () => {
  describe('tables', () => {
    it('mestra recebe a mesa nova', async () => {
      await insertOne(
        GM,
        `insert into public.tables (name, owner_id) values ('Nova', $1) returning id, owner_id`,
        [GM]
      );
    });
  });

  describe('scenes', () => {
    it('mestra recebe a cena nova com a sessão aberta', async () => {
      await insertOne(GM, INSERT_SCENE, [openTable]);
    });

    it('mestra recebe a primeira cena de uma mesa com sessão fechada', async () => {
      await insertOne(GM, INSERT_SCENE, [closedTable]);
    });

    it('jogador não cria cena', async () => {
      await expect(asUser(PLAYER, INSERT_SCENE, [openTable])).rejects.toMatchObject({
        code: '42501',
      });
    });
  });

  describe('scene_objects', () => {
    it('mestra recebe objeto oculto, mesmo com a sessão fechada', async () => {
      await insertOne(GM, INSERT_OBJECT, [closedScene, approvedToken, GM, true]);
    });

    it('jogador recebe o objeto que colocou na cena dele', async () => {
      await insertOne(PLAYER, INSERT_OBJECT, [defaultScene, approvedToken, PLAYER, false]);
    });

    it('jogador recebe o objeto de um arquivo fixo, que não tem linha em assets', async () => {
      await insertOne(PLAYER, INSERT_OBJECT, [defaultScene, STATIC_ASSET, PLAYER, false]);
    });

    it('jogador não coloca em cena que não vê', async () => {
      await expect(
        asUser(PLAYER, INSERT_OBJECT, [otherScene, approvedToken, PLAYER, false])
      ).rejects.toMatchObject({ code: '42501' });
    });
  });

  describe('drawings', () => {
    it('mestra recebe o desenho, mesmo com a sessão fechada', async () => {
      await insertOne(GM, INSERT_DRAWING, [closedScene, GM]);
    });

    it('jogador recebe o desenho na cena dele', async () => {
      await insertOne(PLAYER, INSERT_DRAWING, [defaultScene, PLAYER]);
    });

    it('espectador não desenha', async () => {
      await expect(
        asUser(SPECTATOR, INSERT_DRAWING, [defaultScene, SPECTATOR])
      ).rejects.toMatchObject({ code: '42501' });
    });
  });

  describe('pending_placements', () => {
    it('jogador recebe a colocação do próprio arquivo pendente', async () => {
      await insertOne(PLAYER, INSERT_PLACEMENT, [pendingToken, defaultScene, PLAYER]);
    });

    it('jogador não usa arquivo já aprovado', async () => {
      await expect(
        asUser(PLAYER, INSERT_PLACEMENT, [approvedToken, defaultScene, PLAYER])
      ).rejects.toMatchObject({ code: '42501' });
    });
  });

  describe('chat_messages', () => {
    const roll = JSON.stringify({ total: 7 });

    it('mestra recebe a própria mensagem, mesmo com a sessão fechada', async () => {
      await insertOne(GM, INSERT_MESSAGE, [closedTable, GM, 'text', 'oi', null, false, null]);
    });

    it('jogador recebe a própria mensagem', async () => {
      await insertOne(PLAYER, INSERT_MESSAGE, [openTable, PLAYER, 'text', 'oi', null, false, null]);
    });

    it('espectador recebe a própria mensagem', async () => {
      await insertOne(SPECTATOR, INSERT_MESSAGE, [
        openTable,
        SPECTATOR,
        'text',
        'oi',
        null,
        false,
        null,
      ]);
    });

    it('jogador recebe a própria rolagem oculta', async () => {
      await insertOne(PLAYER, INSERT_MESSAGE, [openTable, PLAYER, 'roll', '', roll, true, null]);
    });

    it('jogador recebe o próprio sussurro', async () => {
      await insertOne(PLAYER, INSERT_MESSAGE, [openTable, PLAYER, 'whisper', 'psiu', null, false, GM]);
    });

    it('quem não está na mesa não escreve', async () => {
      await expect(
        asUser(OUTSIDER, INSERT_MESSAGE, [openTable, OUTSIDER, 'text', 'oi', null, false, null])
      ).rejects.toMatchObject({ code: '42501' });
    });
  });

  describe('assets', () => {
    const insertAsset = `insert into public.assets (kind, name, storage_key, url, mime, size_bytes, status, uploaded_by)
      values ('token', $1, $1, 'https://abc.public.blob.vercel-storage.com/' || $1, 'image/webp', 1, $2, $3)
      returning *`;

    it('mestra recebe o asset aprovado que subiu', async () => {
      await insertOne(GM, insertAsset, ['da-mestra', 'approved', GM]);
    });

    it('jogador recebe o próprio asset pendente', async () => {
      await insertOne(PLAYER, insertAsset, ['do-jogador', 'pending', PLAYER]);
    });
  });
});

describe('apagar arquivo da biblioteca', () => {
  const addAsset = async (name: string, kind = 'token') =>
    (
      await db.query<{ id: string }>(
        `insert into public.assets (kind, name, storage_key, url, mime, size_bytes, status, uploaded_by)
         values ($1, $2, $2, 'https://abc.public.blob.vercel-storage.com/' || $2, 'image/webp', 1, 'approved', $3)
         returning id`,
        [kind, name, GM]
      )
    ).rows[0].id;

  it('mestra apaga arquivo em cena: leva os objetos e solta o anexo', async () => {
    const parentAsset = await addAsset('apagar-pai');
    const parent = await insertOne(GM, INSERT_OBJECT, [defaultScene, parentAsset, GM, false]);
    const child = await insertOne(GM, INSERT_OBJECT, [defaultScene, approvedToken, GM, false]);
    await asUser(GM, `update public.scene_objects set parent_id = $1 where id = $2`, [
      parent.id,
      child.id,
    ]);

    const removed = await asUser(GM, `delete from public.assets where id = $1 returning id`, [
      parentAsset,
    ]);
    expect(removed).toHaveLength(1);

    const { rows } = await db.query<{ id: string; parent_id: string | null }>(
      `select id, parent_id from public.scene_objects where id = any($1::uuid[])`,
      [[parent.id, child.id]]
    );
    expect(rows).toEqual([{ id: child.id, parent_id: null }]);
  });

  it('mestra apaga mapa em uso: a cena fica sem mapa', async () => {
    const map = await addAsset('apagar-mapa', 'mapa');
    await db.query(`update public.scenes set map_asset_id = $1 where id = $2`, [map, otherScene]);
    await asUser(GM, `delete from public.assets where id = $1`, [map]);
    const { rows } = await db.query<{ map_asset_id: string | null }>(
      `select map_asset_id from public.scenes where id = $1`,
      [otherScene]
    );
    expect(rows[0].map_asset_id).toBeNull();
  });

  it('jogador não apaga arquivo aprovado', async () => {
    const asset = await addAsset('apagar-jogador');
    const removed = await asUser(PLAYER, `delete from public.assets where id = $1 returning id`, [
      asset,
    ]);
    expect(removed).toHaveLength(0);
  });
});

describe('desfazer', () => {
  const RESTORE = `select * from public.restore_scene_object($1::jsonb)`;
  const row = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    scene_id: defaultScene,
    asset_id: approvedToken,
    kind: 'token',
    x: 12,
    y: 34,
    rotation: 1,
    scale: 2,
    flip_x: true,
    flip_y: false,
    z: 7,
    parent_id: null,
    local: null,
    caption: null,
    effects: [],
    conditions: [],
    hidden: false,
    created_by: PLAYER,
    ...extra,
  });
  const uuid = (n: number) => `99999999-9999-4999-8999-${String(n).padStart(12, '0')}`;
  const caption = { text: 'Guarda', color: '#fff', stroke: '#000', strokeWidth: 1, glow: false, glowColor: '#fff', obfuscated: false };

  it('jogador restaura o próprio objeto com o mesmo id, legenda, efeitos e condições', async () => {
    const [restored] = await asUser<Record<string, unknown>>(PLAYER, RESTORE, [
      JSON.stringify(
        row(uuid(1), { caption, effects: [{ id: 'fogo' }], conditions: ['ferido', 'caido'] })
      ),
    ]);
    expect(restored).toMatchObject({
      id: uuid(1),
      x: 12,
      z: 7,
      flip_x: true,
      caption,
      effects: [{ id: 'fogo' }],
      conditions: ['ferido', 'caido'],
      created_by: PLAYER,
    });
  });

  it('restaura o anexo se o pai ainda existe', async () => {
    const parent = await insertOne(GM, INSERT_OBJECT, [defaultScene, approvedToken, GM, false]);
    const local = { x: 1, y: 2, rotation: 0, scale: 1, flipX: false, flipY: false };
    const [restored] = await asUser<Record<string, unknown>>(GM, RESTORE, [
      JSON.stringify(row(uuid(2), { parent_id: parent.id, local, created_by: GM })),
    ]);
    expect(restored).toMatchObject({ parent_id: parent.id, local });
  });

  it('pai que sumiu: volta solto, nas coordenadas guardadas', async () => {
    const [restored] = await asUser<Record<string, unknown>>(GM, RESTORE, [
      JSON.stringify(
        row(uuid(3), { parent_id: uuid(999), local: { x: 1 }, created_by: GM })
      ),
    ]);
    expect(restored).toMatchObject({ parent_id: null, local: null, x: 12, y: 34 });
  });

  it('mestra restaura objeto de outra pessoa mantendo o autor, e oculto', async () => {
    const [restored] = await asUser<Record<string, unknown>>(GM, RESTORE, [
      JSON.stringify(row(uuid(4), { hidden: true })),
    ]);
    expect(restored).toMatchObject({ created_by: PLAYER, hidden: true });
  });

  it('repetir devolve o que já existe, sem duplicar', async () => {
    const [again] = await asUser<Record<string, unknown>>(PLAYER, RESTORE, [
      JSON.stringify(row(uuid(1), { x: 500 })),
    ]);
    expect(again).toMatchObject({ id: uuid(1), x: 12 });
  });

  it.each([
    ['em nome de outra pessoa', () => row(uuid(10), { created_by: GM })],
    ['em cena que não vê', () => row(uuid(11), { scene_id: otherScene })],
    ['oculto', () => row(uuid(12), { hidden: true })],
    ['arquivo pendente', () => row(uuid(13), { asset_id: pendingToken })],
  ])('jogador não restaura %s', async (_label, build) => {
    await expect(asUser(PLAYER, RESTORE, [JSON.stringify(build())])).rejects.toBeTruthy();
  });

  it('espectador não restaura', async () => {
    await expect(
      asUser(SPECTATOR, RESTORE, [JSON.stringify(row(uuid(14), { created_by: SPECTATOR }))])
    ).rejects.toBeTruthy();
  });

  it('objeto oculto já existente não é devolvido a jogador', async () => {
    await expect(
      asUser(PLAYER, RESTORE, [JSON.stringify(row(uuid(4)))])
    ).rejects.toBeTruthy();
  });

  it('autor recoloca o próprio desenho com o mesmo id; ninguém recoloca em nome de outro', async () => {
    const insert = `insert into public.drawings (id, scene_id, author_id, points, color, width)
      values ($1, $2, $3, '{0,0,1,1}', '#ff0000', 2) returning id, scene_id, author_id`;
    const drawing = await insertOne(PLAYER, insert, [uuid(20), defaultScene, PLAYER]);
    expect(drawing.id).toBe(uuid(20));
    await expect(asUser(PLAYER, insert, [uuid(21), defaultScene, GM])).rejects.toMatchObject({
      code: '42501',
    });
  });
});

// Por último: as de cima precisam provar que o schema.sql já está certo sozinho.
describe('migração 014', () => {
  it('roda sobre o schema pronto e mantém o insert da mestra', async () => {
    await db.exec(readSql('migrations', '014_vtt_scenes_select_fix.sql'));
    await insertOne(GM, INSERT_SCENE, [closedTable]);
  });
});
