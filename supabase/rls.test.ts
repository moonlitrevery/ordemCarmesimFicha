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

describe('npcs', () => {
  const INSERT_NPC = `insert into public.npcs (table_id, name, plane, tier, nd)
    values ($1, $2, 'tartaro', 't9', 1) returning id, name`;
  const addNpc = (name: string) => insertOne(GM, INSERT_NPC, [openTable, name]);

  it('mestra recebe o NPC novo e lê os dela', async () => {
    const npc = await addNpc('Caranguejo');
    const rows = await asUser(GM, `select id from public.npcs where id = $1`, [npc.id]);
    expect(rows).toHaveLength(1);
  });

  it.each([
    ['jogador', () => PLAYER],
    ['espectador', () => SPECTATOR],
    ['quem não está na mesa', () => OUTSIDER],
  ])('%s não lê, não cria, não muda e não apaga', async (_label, user) => {
    const npc = await addNpc('Segredo');
    const id = user();
    expect(await asUser(id, `select * from public.npcs`)).toEqual([]);
    await expect(asUser(id, INSERT_NPC, [openTable, 'Forjado'])).rejects.toMatchObject({
      code: '42501',
    });
    expect(
      await asUser(id, `update public.npcs set hp_current = 0 where id = $1 returning id`, [npc.id])
    ).toEqual([]);
    expect(
      await asUser(id, `delete from public.npcs where id = $1 returning id`, [npc.id])
    ).toEqual([]);
  });

  it('anon não tem privilégio nenhum', async () => {
    await db.exec('set role anon');
    try {
      await expect(db.query('select * from public.npcs')).rejects.toMatchObject({
        code: '42501',
      });
    } finally {
      await db.exec('reset role');
    }
  });

  it('mestra de outra mesa não lê', async () => {
    const other = await db.query<{ id: string }>(
      `insert into auth.users (id, email) values (gen_random_uuid(), 'outra@teste') returning id`
    );
    const otherGm = other.rows[0].id;
    await db.query(`update public.profiles set role = 'mestre' where id = $1`, [otherGm]);
    await addNpc('Da outra mesa');
    expect(await asUser(otherGm, `select * from public.npcs`)).toEqual([]);
  });

  describe('vínculo com o token', () => {
    const LINK = `update public.scene_objects set npc_id = $1 where id = $2 returning id, npc_id`;

    it('só a mestra vincula', async () => {
      const npc = await addNpc('Vinculado');
      const object = await insertOne(PLAYER, INSERT_OBJECT, [defaultScene, approvedToken, PLAYER, false]);
      await expect(asUser(PLAYER, LINK, [npc.id, object.id])).rejects.toBeTruthy();
      expect(await asUser(GM, LINK, [npc.id, object.id])).toEqual([
        { id: object.id, npc_id: npc.id },
      ]);
    });

    it('apagar o NPC solta o token, que fica no mapa', async () => {
      const npc = await addNpc('Apagado');
      const object = await insertOne(GM, INSERT_OBJECT, [defaultScene, approvedToken, GM, false]);
      await asUser(GM, LINK, [npc.id, object.id]);
      await asUser(GM, `delete from public.npcs where id = $1`, [npc.id]);
      const { rows } = await db.query<{ npc_id: string | null }>(
        `select npc_id from public.scene_objects where id = $1`,
        [object.id]
      );
      expect(rows).toEqual([{ npc_id: null }]);
    });

    it('não vincula a um NPC que não existe', async () => {
      const object = await insertOne(GM, INSERT_OBJECT, [defaultScene, approvedToken, GM, false]);
      await expect(
        asUser(GM, LINK, ['99999999-9999-4999-8999-000000000abc', object.id])
      ).rejects.toMatchObject({ code: '23503' });
    });

    const restorable = (id: string, npcId: string | null, createdBy: string) =>
      JSON.stringify({
        id,
        scene_id: defaultScene,
        asset_id: approvedToken,
        kind: 'token',
        x: 0,
        y: 0,
        npc_id: npcId,
        created_by: createdBy,
      });
    const RESTORE = `select id, npc_id from public.restore_scene_object($1::jsonb)`;

    it('mestra desfaz com o vínculo; NPC apagado volta sem vínculo', async () => {
      const npc = await addNpc('Volta');
      const a = '99999999-9999-4999-8999-000000000a01';
      const b = '99999999-9999-4999-8999-000000000a02';
      expect(await asUser(GM, RESTORE, [restorable(a, npc.id, GM)])).toEqual([
        { id: a, npc_id: npc.id },
      ]);
      expect(
        await asUser(GM, RESTORE, [restorable(b, '99999999-9999-4999-8999-000000000abc', GM)])
      ).toEqual([{ id: b, npc_id: null }]);
    });

    it('jogador recupera o próprio token, sem o vínculo', async () => {
      const npc = await addNpc('Do jogador');
      const id = '99999999-9999-4999-8999-000000000a03';
      expect(await asUser(PLAYER, RESTORE, [restorable(id, npc.id, PLAYER)])).toEqual([
        { id, npc_id: null },
      ]);
    });
  });
});

describe('iniciativa e condições', () => {
  const UPDATE = `update public.tables set initiative = $1::jsonb where id = $2 returning id`;
  const value = JSON.stringify({ entries: [], current: 0, round: 3, notation: '1d20' });

  it('todos da mesa leem; só a mestra grava', async () => {
    expect(await asUser(GM, UPDATE, [value, openTable])).toHaveLength(1);
    for (const user of [PLAYER, SPECTATOR]) {
      expect(await asUser(user, UPDATE, [value, openTable])).toEqual([]);
      const rows = await asUser<{ initiative: { round: number } }>(
        user,
        `select initiative from public.tables where id = $1`,
        [openTable]
      );
      expect(rows[0].initiative.round).toBe(3);
    }
    expect(
      await asUser(OUTSIDER, `select initiative from public.tables where id = $1`, [openTable])
    ).toEqual([]);
  });

  it('jogador muda condição; espectador não', async () => {
    const object = await insertOne(GM, INSERT_OBJECT, [defaultScene, approvedToken, GM, false]);
    const SET = `update public.scene_objects set conditions = $1 where id = $2 returning conditions`;
    expect(await asUser(PLAYER, SET, [['queimando', 'custom:🔥:Marca'], object.id])).toEqual([
      { conditions: ['queimando', 'custom:🔥:Marca'] },
    ]);
    expect(await asUser(SPECTATOR, SET, [[], object.id])).toEqual([]);
  });
});

// Por último: as de cima precisam provar que o schema.sql já está certo sozinho.
describe('migração 014', () => {
  it('roda sobre o schema pronto e mantém o insert da mestra', async () => {
    await db.exec(readSql('migrations', '014_vtt_scenes_select_fix.sql'));
    await insertOne(GM, INSERT_SCENE, [closedTable]);
  });
});

describe('RLS da migração 017: o conjunto visível é o mesmo de can_view_scene', () => {
  const addAsset = async (name: string, visibility: string) =>
    (
      await db.query<{ id: string }>(
        `insert into public.assets (kind, name, storage_key, url, mime, size_bytes, status, visibility, uploaded_by)
         values ('token', $1, $1, 'https://abc.public.blob.vercel-storage.com/' || $1, 'image/webp', 1, 'approved', $2, $3)
         returning id`,
        [name, visibility, GM]
      )
    ).rows[0].id;
  const seen = async (user: string, id: string) =>
    (await asUser(user, `select id from public.assets where id = $1`, [id])).length === 1;

  it('asset da mestra: jogador só vê se estiver visível na cena dele', async () => {
    const secret = await addAsset('perf-segredo', 'mestre');
    const hidden = await addAsset('perf-oculto', 'mestre');
    const elsewhere = await addAsset('perf-outra-cena', 'mestre');
    const inScene = await addAsset('perf-em-cena', 'mestre');
    await insertOne(GM, INSERT_OBJECT, [defaultScene, inScene, GM, false]);
    await insertOne(GM, INSERT_OBJECT, [defaultScene, hidden, GM, true]);
    await insertOne(GM, INSERT_OBJECT, [otherScene, elsewhere, GM, false]);

    expect(await seen(PLAYER, secret)).toBe(false);
    expect(await seen(PLAYER, hidden)).toBe(false);
    expect(await seen(PLAYER, elsewhere)).toBe(false);
    expect(await seen(PLAYER, inScene)).toBe(true);
    expect(await seen(SPECTATOR, inScene)).toBe(true);
    expect(await seen(OUTSIDER, inScene)).toBe(false);
    expect(await seen(GM, secret)).toBe(true);
  });

  it('mapa da cena conta; sessão fechada e banido não veem', async () => {
    const map = await addAsset('perf-mapa', 'mestre');
    await db.query(`update public.scenes set map_asset_id = $1 where id = $2`, [map, defaultScene]);
    expect(await seen(PLAYER, map)).toBe(true);

    await db.query(`update public.tables set session_open = false where id = $1`, [openTable]);
    expect(await seen(PLAYER, map)).toBe(false);
    await db.query(`update public.tables set session_open = true where id = $1`, [openTable]);

    await db.query(`update public.table_members set banned = true where user_id = $1`, [PLAYER]);
    expect(await seen(PLAYER, map)).toBe(false);
    await db.query(`update public.table_members set banned = false where user_id = $1`, [PLAYER]);
    await db.query(`update public.scenes set map_asset_id = null where id = $1`, [defaultScene]);
  });

  it('jogador separado do grupo vê a cena dele, não a padrão', async () => {
    const object = await insertOne(GM, INSERT_OBJECT, [otherScene, approvedToken, GM, false]);
    const read = () =>
      asUser(PLAYER, `select id from public.scene_objects where id = $1`, [object.id]);
    expect(await read()).toEqual([]);
    await db.query(`update public.table_members set scene_id = $1 where user_id = $2`, [otherScene, PLAYER]);
    expect(await read()).toHaveLength(1);
    await db.query(`update public.table_members set scene_id = null where user_id = $1`, [PLAYER]);
  });

  it('objeto oculto continua só da mestra, mesmo na cena do jogador', async () => {
    const object = await insertOne(GM, INSERT_OBJECT, [defaultScene, approvedToken, GM, true]);
    const sql = `select id from public.scene_objects where id = $1`;
    expect(await asUser(PLAYER, sql, [object.id])).toEqual([]);
    expect(await asUser(SPECTATOR, sql, [object.id])).toEqual([]);
    expect(await asUser(GM, sql, [object.id])).toHaveLength(1);
  });

  it('fixo só conta em objeto da dona: jogador não libera adivinhando o id', async () => {
    const guess = '82c0bfbf-6ed0-505a-977c-6b7782140c99';
    await insertOne(PLAYER, INSERT_OBJECT, [defaultScene, guess, PLAYER, false]);
    const ids = await asUser<{ id: string }>(
      PLAYER,
      `select id from public.my_scene_static_asset_ids() id`
    );
    expect(ids.map((row) => row.id)).not.toContain(guess);
  });

  it('as funções novas não abrem para anon', async () => {
    await db.exec('set role anon');
    try {
      await expect(db.query('select * from public.my_visible_asset_ids()')).rejects.toMatchObject({
        code: '42501',
      });
    } finally {
      await db.exec('reset role');
    }
  });
});

describe('migrações 016 e 017', () => {
  it('rodam de novo sobre o schema pronto e mantêm o NPC fechado', async () => {
    await db.exec(readSql('migrations', '016_vtt_npcs.sql'));
    await db.exec(readSql('migrations', '017_vtt_library_perf.sql'));
    const npc = await insertOne(
      GM,
      `insert into public.npcs (table_id, name, plane, tier, nd)
       values ($1, 'Depois', 'astral', 'hilico', 1) returning id`,
      [openTable]
    );
    expect(await asUser(PLAYER, `select id from public.npcs where id = $1`, [npc.id])).toEqual([]);
  });
});
