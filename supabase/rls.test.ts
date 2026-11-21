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
describe('som', () => {
  const SECRET_ASSET = '55555555-5555-4555-8555-555555555555';
  const SHARED_ASSET = '66666666-6666-4666-8666-666666666666';
  const CUE_ASSET = '77777777-7777-4777-8777-777777777777';

  const addAudio = async (id: string) =>
    db.query(
      `insert into public.assets (id, kind, name, storage_key, url, mime, size_bytes, status, visibility, uploaded_by)
       values ($1::uuid, 'audio_sfx', $2, $2, 'https://abc.public.blob.vercel-storage.com/' || $2, 'audio/ogg', 1, 'approved', 'mestre', $3)`,
      [id, id, GM]
    );

  const canRead = async (userId: string, id: string) =>
    (await asUser(userId, `select id from public.assets where id = $1`, [id])).length === 1;

  beforeAll(async () => {
    await Promise.all([SECRET_ASSET, SHARED_ASSET, CUE_ASSET].map(addAudio));
    await asUser(GM, `update public.scenes set ambient = $1 where id = $2`, [
      JSON.stringify([
        { id: 'a', assetId: SHARED_ASSET, volume: 50, target: null },
        { id: 'b', assetId: SECRET_ASSET, volume: 50, target: SPECTATOR },
      ]),
      defaultScene,
    ]);
  });

  it('ninguém lê a coluna ambient direto, nem a mestra', async () => {
    await expect(
      asUser(PLAYER, `select ambient from public.scenes where id = $1`, [defaultScene])
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(GM, `select ambient from public.scenes where id = $1`, [defaultScene])
    ).rejects.toThrow(/permission denied/);
  });

  it('a RPC tira a camada de outra pessoa e a mestra vê tudo', async () => {
    const ambient = async (userId: string) =>
      (
        await asUser<{ ambient: { id: string }[] | null }>(
          userId,
          `select public.my_scene_ambient($1) as ambient`,
          [defaultScene]
        )
      )[0].ambient;
    expect((await ambient(GM))?.map((layer) => layer.id)).toEqual(['a', 'b']);
    expect((await ambient(PLAYER))?.map((layer) => layer.id)).toEqual(['a']);
    expect((await ambient(SPECTATOR))?.map((layer) => layer.id)).toEqual(['a', 'b']);
    expect(await ambient(OUTSIDER)).toBeNull();
  });

  it('o arquivo só fica legível para quem vai ouvir', async () => {
    expect(await canRead(PLAYER, SHARED_ASSET)).toBe(true);
    expect(await canRead(PLAYER, SECRET_ASSET)).toBe(false);
    expect(await canRead(SPECTATOR, SECRET_ASSET)).toBe(true);
    expect(await canRead(OUTSIDER, SHARED_ASSET)).toBe(false);
  });

  it('só a mestra grava ambient, e com a forma certa', async () => {
    await asUser(PLAYER, `update public.scenes set ambient = '[]' where id = $1`, [defaultScene]);
    const layers = await asUser<{ ambient: unknown[] }>(
      GM,
      `select public.my_scene_ambient($1) as ambient`,
      [defaultScene]
    );
    expect(layers[0].ambient).toHaveLength(2);
    await expect(
      asUser(GM, `update public.scenes set ambient = $1 where id = $2`, [
        JSON.stringify([{ id: 'x', assetId: 'nope', volume: 50 }]),
        otherScene,
      ])
    ).rejects.toThrow(/scenes_ambient_check/);
  });

  it('SFX com alvo só aparece para o alvo e a mestra', async () => {
    const cue = await insertOne(
      GM,
      `insert into public.audio_cues (table_id, asset_id, target_user) values ($1, $2, $3) returning id`,
      [openTable, CUE_ASSET, SPECTATOR]
    );
    const sees = async (userId: string) =>
      (await asUser(userId, `select id from public.audio_cues where id = $1`, [cue.id])).length === 1;
    expect(await sees(GM)).toBe(true);
    expect(await sees(SPECTATOR)).toBe(true);
    expect(await sees(PLAYER)).toBe(false);
    expect(await sees(OUTSIDER)).toBe(false);
    expect(await canRead(SPECTATOR, CUE_ASSET)).toBe(true);
    expect(await canRead(PLAYER, CUE_ASSET)).toBe(false);
  });

  it('jogador não dispara SFX, e a data não é escolhida', async () => {
    await expect(
      asUser(PLAYER, `insert into public.audio_cues (table_id, asset_id) values ($1, $2)`, [
        openTable,
        CUE_ASSET,
      ])
    ).rejects.toThrow(/row-level security/);
    await expect(
      asUser(GM, `insert into public.audio_cues (table_id, asset_id, created_at) values ($1, $2, now())`, [
        openTable,
        CUE_ASSET,
      ])
    ).rejects.toThrow(/permission denied/);
  });

  it('só a mestra grava tables.audio', async () => {
    await asUser(PLAYER, `update public.tables set audio = '{"volume":1}' where id = $1`, [openTable]);
    const rows = await asUser<{ audio: { volume: number } }>(
      PLAYER,
      `select audio from public.tables where id = $1`,
      [openTable]
    );
    expect(rows[0].audio.volume).toBe(100);
  });

  it('apagar o arquivo o tira do ambiente e dos SFX', async () => {
    await asUser(GM, `delete from public.assets where id = $1`, [SHARED_ASSET]);
    const rows = await asUser<{ ambient: { id: string }[] }>(
      GM,
      `select public.my_scene_ambient($1) as ambient`,
      [defaultScene]
    );
    expect(rows[0].ambient.map((layer) => layer.id)).toEqual(['b']);
  });
});

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
  it('efeitos: jogador liga, mas a coluna tem formato e limite', async () => {
    const object = await insertOne(PLAYER, INSERT_OBJECT, [defaultScene, approvedToken, PLAYER, false]);
    const update = `update public.scene_objects set effects = $1::jsonb where id = $2 returning effects`;
    const effects = [{ type: 'spell', id: 'covardia' }];
    const [row] = await asUser<Record<string, unknown>>(PLAYER, update, [JSON.stringify(effects), object.id]);
    expect(row.effects).toEqual(effects);
    await expect(asUser(PLAYER, update, ['{"a":1}', object.id])).rejects.toThrow(/scene_objects_effects_check/);
    await expect(
      asUser(PLAYER, update, [JSON.stringify(Array.from({ length: 3000 }, (_, i) => `valor-${i}-${Math.sqrt(i)}`)), object.id])
    ).rejects.toThrow(/scene_objects_effects_check/);
  });

  it('clima: só a mestra grava, e jogador lê o da própria cena', async () => {
    const update = `update public.scenes set weather = $1::jsonb where id = $2 returning weather`;
    const weather = [{ type: 'chuva', on: true, intensity: 70 }];
    expect(await asUser(PLAYER, update, [JSON.stringify(weather), defaultScene])).toEqual([]);
    const [row] = await asUser<Record<string, unknown>>(GM, update, [JSON.stringify(weather), defaultScene]);
    expect(row.weather).toEqual(weather);
    const [read] = await asUser<Record<string, unknown>>(PLAYER, `select weather from public.scenes where id = $1`, [defaultScene]);
    expect(read.weather).toEqual(weather);
  });

  it('cor pessoal: cada um grava a sua, colega de mesa lê, formato é conferido', async () => {
    const update = `update public.profiles set color = $1 where id = $2 returning color`;
    expect(await asUser(PLAYER, update, ['#123abc', PLAYER])).toEqual([{ color: '#123abc' }]);
    expect(await asUser(PLAYER, update, ['#123abc', GM])).toEqual([]);
    await expect(asUser(PLAYER, update, ['vermelho', PLAYER])).rejects.toThrow(/profiles_color_check/);
    expect(await asUser(SPECTATOR, `select color from public.profiles where id = $1`, [PLAYER])).toEqual([
      { color: '#123abc' },
    ]);
  });

  it('iluminação: só a mestra grava, formato é conferido, duplicar leva junto', async () => {
    const update = `update public.scenes set lighting = $1::jsonb where id = $2 returning lighting`;
    const night = { on: true, preset: 'noite', color: '#000000', intensity: 60 };
    expect(await asUser(PLAYER, update, [JSON.stringify(night), defaultScene])).toEqual([]);
    expect(await asUser(GM, update, [JSON.stringify(night), defaultScene])).toEqual([{ lighting: night }]);
    expect(await asUser(PLAYER, `select lighting from public.scenes where id = $1`, [defaultScene])).toEqual([
      { lighting: night },
    ]);
    for (const bad of [
      { ...night, preset: 'sol' },
      { ...night, intensity: 101 },
      { ...night, color: 'azul' },
      { preset: 'noite' },
    ]) {
      await expect(asUser(GM, update, [JSON.stringify(bad), defaultScene])).rejects.toThrow(/scenes_lighting_check/);
    }
    const [{ duplicate_scene: copy }] = await asUser<{ duplicate_scene: string }>(
      GM,
      `select public.duplicate_scene($1)`,
      [defaultScene]
    );
    expect(await asUser(GM, `select lighting from public.scenes where id = $1`, [copy])).toEqual([
      { lighting: night },
    ]);
    await asUser(GM, `delete from public.scenes where id = $1`, [copy]);
  });

  it('transição: todos leem, só a mestra grava', async () => {
    const update = `update public.tables set scene_transition = $1 where id = $2 returning scene_transition`;
    expect(await asUser(PLAYER, update, ['corte', openTable])).toEqual([]);
    expect(await asUser(GM, update, ['simbolo', openTable])).toEqual([{ scene_transition: 'simbolo' }]);
    await expect(asUser(GM, update, ['girar', openTable])).rejects.toThrow(/tables_scene_transition_check/);
    expect(await asUser(PLAYER, `select scene_transition from public.tables where id = $1`, [openTable])).toEqual([
      { scene_transition: 'simbolo' },
    ]);
  });

  it('colar: jogador cola com anexo e efeitos, mas não oculto nem vínculo', async () => {
    const paste = `select id, parent_id, effects, conditions, npc_id, hidden from public.restore_scene_object($1::jsonb)`;
    const row = (id: string, extra: Record<string, unknown>) => ({
      id,
      scene_id: defaultScene,
      asset_id: approvedToken,
      kind: 'token',
      x: 1,
      y: 2,
      created_by: PLAYER,
      effects: [{ type: 'effect', id: 'brilho' }],
      conditions: ['arma-travada'],
      ...extra,
    });
    const parentId = '99999999-9999-4999-8999-000000000b01';
    const childId = '99999999-9999-4999-8999-000000000b02';
    await asUser(PLAYER, paste, [JSON.stringify(row(parentId, {}))]);
    const local = { x: 1, y: 1, rotation: 0, scale: 1, flipX: false, flipY: false };
    const [child] = await asUser<Record<string, unknown>>(PLAYER, paste, [
      JSON.stringify(row(childId, { parent_id: parentId, local })),
    ]);
    expect(child).toMatchObject({
      parent_id: parentId,
      effects: [{ type: 'effect', id: 'brilho' }],
      conditions: ['arma-travada'],
      npc_id: null,
    });
    await expect(
      asUser(PLAYER, paste, [
        JSON.stringify(row('99999999-9999-4999-8999-000000000b03', { hidden: true })),
      ])
    ).rejects.toThrow(/forbidden/);
    await expect(
      asUser(SPECTATOR, paste, [
        JSON.stringify(row('99999999-9999-4999-8999-000000000b04', { created_by: SPECTATOR })),
      ])
    ).rejects.toThrow(/forbidden/);
  });

  it('o /shiu não lê mais nomes de personagem', async () => {
    await expect(
      asUser(PLAYER, `select * from public.table_character_names($1)`, [openTable])
    ).rejects.toThrow(/does not exist/);
  });

  it('rodam de novo sobre o schema pronto e mantêm o NPC fechado', async () => {
    await db.exec(readSql('migrations', '019_vtt_playtest_fixes.sql'));
    await db.exec(readSql('migrations', '018_vtt_effects.sql'));
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

describe('documentos e relatórios', () => {
  const blob = (folder: string) =>
    `https://abc.public.blob.vercel-storage.com/${folder}/${crypto.randomUUID()}.pdf`;
  const INSERT_DOCUMENT = `insert into public.table_documents
      (table_id, category, title, storage_key, url, mime, size_bytes, status, uploaded_by)
    values ($1, $2, 'Doc', 'k', $3, 'application/pdf', 1, $4, $5) returning id, status`;
  const INSERT_REPORT = `insert into public.table_reports
      (table_id, title, storage_key, url, mime, size_bytes, author_id, character_id)
    values ($1, 'Rel', 'k', $2, 'application/pdf', 1, $3, $4) returning id, character_name`;
  const titles = (userId: string, id: string) =>
    asUser<{ id: string }>(userId, `select id from public.table_documents where id = $1`, [id]);

  it('mestra envia aprovado em qualquer categoria, mesmo com a sessão fechada', async () => {
    await insertOne(GM, INSERT_DOCUMENT, [closedTable, 'carta', blob('documento'), 'approved', GM]);
  });

  it('jogador só cria referência pendente', async () => {
    await insertOne(PLAYER, INSERT_DOCUMENT, [openTable, 'referencia', blob('documento'), 'pending', PLAYER]);
    await expect(
      asUser(PLAYER, INSERT_DOCUMENT, [openTable, 'carta', blob('documento'), 'pending', PLAYER])
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      asUser(PLAYER, INSERT_DOCUMENT, [openTable, 'referencia', blob('documento'), 'approved', PLAYER])
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('espectador e quem está fora não enviam', async () => {
    for (const user of [SPECTATOR, OUTSIDER]) {
      await expect(
        asUser(user, INSERT_DOCUMENT, [openTable, 'referencia', blob('documento'), 'pending', user])
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        asUser(user, INSERT_REPORT, [openTable, blob('relatorio'), user, null])
      ).rejects.toMatchObject({ code: '42501' });
    }
  });

  it('pendente só aparece para quem enviou e a mestra, até ser aprovado', async () => {
    const doc = await insertOne(PLAYER, INSERT_DOCUMENT, [
      openTable, 'referencia', blob('documento'), 'pending', PLAYER,
    ]);
    expect(await titles(SPECTATOR, doc.id)).toEqual([]);
    expect(await titles(PLAYER, doc.id)).toHaveLength(1);
    expect(await titles(GM, doc.id)).toHaveLength(1);

    await asUser(GM, `update public.table_documents set status = 'approved' where id = $1`, [doc.id]);
    expect(await titles(SPECTATOR, doc.id)).toHaveLength(1);
    expect(await titles(OUTSIDER, doc.id)).toEqual([]);
  });

  it('só a mestra aprova e mostra a todos', async () => {
    const doc = await insertOne(PLAYER, INSERT_DOCUMENT, [
      openTable, 'referencia', blob('documento'), 'pending', PLAYER,
    ]);
    await expect(
      asUser(PLAYER, `update public.table_documents set status = 'approved' where id = $1 returning id`, [doc.id])
    ).resolves.toEqual([]);
    await expect(
      asUser(GM, `update public.table_documents set shown_at = now() where id = $1`, [doc.id])
    ).rejects.toThrow(/check/);
    await asUser(GM, `update public.table_documents set status = 'approved', shown_at = now() where id = $1`, [doc.id]);
    await expect(
      asUser(PLAYER, `update public.table_documents set url = 'x' where id = $1`, [doc.id])
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('jogador apaga só o próprio, e a mestra apaga tudo', async () => {
    const gmDoc = await insertOne(GM, INSERT_DOCUMENT, [openTable, 'pista', blob('documento'), 'approved', GM]);
    const own = await insertOne(PLAYER, INSERT_DOCUMENT, [
      openTable, 'referencia', blob('documento'), 'pending', PLAYER,
    ]);
    const remove = `delete from public.table_documents where id = $1 returning id`;
    expect(await asUser(PLAYER, remove, [gmDoc.id])).toEqual([]);
    expect(await asUser(PLAYER, remove, [own.id])).toHaveLength(1);
    expect(await asUser(GM, remove, [gmDoc.id])).toHaveLength(1);
  });

  it('a linha não aponta para arquivo de outra pasta nem de outra linha', async () => {
    await expect(
      asUser(PLAYER, INSERT_DOCUMENT, [openTable, 'referencia', blob('mapa'), 'pending', PLAYER])
    ).rejects.toThrow(/check/);
    const url = blob('documento');
    await insertOne(PLAYER, INSERT_DOCUMENT, [openTable, 'referencia', url, 'pending', PLAYER]);
    await expect(
      asUser(PLAYER, INSERT_DOCUMENT, [openTable, 'referencia', url, 'pending', PLAYER])
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('todos da mesa leem os relatórios, sem aprovação e com a sessão fechada', async () => {
    await db.query(
      `insert into public.table_members (table_id, user_id, role) values ($1, $2, 'jogador')
       on conflict do nothing`,
      [closedTable, PLAYER]
    );
    const report = await insertOne(PLAYER, INSERT_REPORT, [closedTable, blob('relatorio'), PLAYER, null]);
    const read = `select id from public.table_reports where id = $1`;
    expect(await asUser(PLAYER, read, [report.id])).toHaveLength(1);
    expect(await asUser(GM, read, [report.id])).toHaveLength(1);
    expect(await asUser(OUTSIDER, read, [report.id])).toEqual([]);
    await db.query(`delete from public.table_members where table_id = $1 and user_id = $2`, [
      closedTable,
      PLAYER,
    ]);
  });

  it('o nome do personagem vem do banco, e só de ficha própria', async () => {
    const addCharacter = async (owner: string) =>
      (
        await db.query<{ id: string }>(
          `insert into public.characters (owner_id, name) values ($1, 'Ficha') returning id`,
          [owner]
        )
      ).rows[0].id;
    const mine = await addCharacter(PLAYER);
    const others = await addCharacter(SPECTATOR);

    const rows = await asUser<{ character_name: string }>(PLAYER, INSERT_REPORT, [
      openTable, blob('relatorio'), PLAYER, mine,
    ]);
    expect(rows[0].character_name).toBe('Ficha');

    await expect(
      asUser(PLAYER, INSERT_REPORT, [openTable, blob('relatorio'), PLAYER, others])
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      asUser(
        PLAYER,
        `insert into public.table_reports (table_id, title, storage_key, url, mime, size_bytes, author_id, character_name)
         values ($1, 'x', 'k', $2, 'text/plain', 1, $3, 'Forjado')`,
        [openTable, blob('relatorio'), PLAYER]
      )
    ).rejects.toMatchObject({ code: '42501' });

    await insertOne(GM, INSERT_REPORT, [openTable, blob('relatorio'), GM, others]);
  });

  it('a migração roda de novo sobre o schema pronto', async () => {
    await db.exec(readSql('migrations', '021_vtt_docs.sql'));
  });
});

describe('páginas (migração 022)', () => {
  const MAP = '9a1f3c2e-5b6d-4e7f-8a9b-0c1d2e3f4a5b';

  it('jogador lê arquivada e grade da própria página; só a mestra grava', async () => {
    const update = `update public.scenes set archived = $1, grid_visible = $1 where id = $2 returning archived`;
    expect(await asUser(PLAYER, update, [true, defaultScene])).toEqual([]);
    expect(await asUser(GM, update, [true, defaultScene])).toEqual([{ archived: true }]);
    expect(
      await asUser(PLAYER, `select archived, grid_visible from public.scenes where id = $1`, [defaultScene])
    ).toEqual([{ archived: true, grid_visible: true }]);
    await asUser(GM, update, [false, defaultScene]);
  });

  it('pastas: só a mestra grava, e o formato é conferido', async () => {
    const update = `update public.tables set scene_folders = $1::jsonb where id = $2 returning scene_folders`;
    expect(await asUser(PLAYER, update, ['["Hack"]', openTable])).toEqual([]);
    expect(await asUser(GM, update, ['["Cidade","Masmorra"]', openTable])).toEqual([
      { scene_folders: ['Cidade', 'Masmorra'] },
    ]);
    await expect(asUser(GM, update, ['[1]', openTable])).rejects.toThrow(/tables_scene_folders_check/);
    await expect(asUser(GM, update, ['[""]', openTable])).rejects.toThrow(/tables_scene_folders_check/);
    await expect(asUser(GM, update, ['{}', openTable])).rejects.toThrow(/tables_scene_folders_check/);
  });

  it('calibração do mapa: mestra grava e relê; jogador não lê nem grava', async () => {
    await insertOne(
      GM,
      `insert into public.map_calibrations (asset_id, meters_per_px) values ($1, 0.02)
       on conflict (asset_id) do update set meters_per_px = excluded.meters_per_px
       returning asset_id as id`,
      [MAP]
    );
    expect(
      await asUser(GM, `select meters_per_px from public.map_calibrations where asset_id = $1`, [MAP])
    ).toEqual([{ meters_per_px: 0.02 }]);
    expect(await asUser(PLAYER, `select * from public.map_calibrations`)).toEqual([]);
    await expect(
      asUser(PLAYER, `insert into public.map_calibrations (asset_id, meters_per_px) values ($1, 1)`, [
        crypto.randomUUID(),
      ])
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      asUser(GM, `insert into public.map_calibrations (asset_id, meters_per_px) values ($1, 0)`, [
        crypto.randomUUID(),
      ])
    ).rejects.toThrow(/check/);
  });

  it('duplicar leva a grade e a cópia nasce fora do arquivo', async () => {
    // Um teste acima roda a 019 de novo, que redefine duplicate_scene sem a grade.
    await db.exec(readSql('migrations', '022_vtt_pages.sql'));
    await asUser(GM, `update public.scenes set archived = true, grid_visible = true where id = $1`, [otherScene]);
    const [{ duplicate_scene: copy }] = await asUser<{ duplicate_scene: string }>(
      GM,
      `select public.duplicate_scene($1)`,
      [otherScene]
    );
    expect(
      await asUser(GM, `select archived, grid_visible from public.scenes where id = $1`, [copy])
    ).toEqual([{ archived: false, grid_visible: true }]);
    await asUser(GM, `delete from public.scenes where id = $1`, [copy]);
    await asUser(GM, `update public.scenes set archived = false, grid_visible = false where id = $1`, [otherScene]);
  });

  it('a migração roda de novo sobre o schema pronto', async () => {
    await db.exec(readSql('migrations', '022_vtt_pages.sql'));
  });
});

describe('V.M. (migração 023)', () => {
  let group: string;
  let pc: string;
  let npc: string;

  beforeAll(async () => {
    pc = (
      await db.query<{ id: string }>(
        `insert into public.characters (owner_id, name) values ($1, 'Julieta') returning id`,
        [PLAYER]
      )
    ).rows[0].id;
    npc = (
      await db.query<{ id: string }>(
        `insert into public.npcs (table_id, name, plane, tier, nd) values ($1, 'Cão', 'tartaro', 'ante', 1) returning id`,
        [openTable]
      )
    ).rows[0].id;
    group = (
      await insertOne(GM, `insert into public.gm_groups (name) values ('Teste') returning id, owner_id`, [])
    ).id;
  });

  it('só a mestra cria e lê os próprios grupos', async () => {
    await expect(
      asUser(PLAYER, `insert into public.gm_groups (name) values ('Hack')`)
    ).rejects.toMatchObject({ code: '42501' });
    expect(await asUser(PLAYER, `select id from public.gm_groups`)).toEqual([]);
    expect(await asUser(GM, `select name from public.gm_groups where id = $1`, [group])).toEqual([
      { name: 'Teste' },
    ]);
  });

  it('PJ e NPC entram; o mesmo personagem vai em dois grupos, mas uma vez em cada', async () => {
    const add = `insert into public.gm_group_members (group_id, section, character_id, npc_id)
      values ($1, $2, $3, $4) returning id, section`;
    await insertOne(GM, add, [group, 'pj', pc, null]);
    await insertOne(GM, add, [group, 'npc', null, npc]);
    await expect(asUser(GM, add, [group, 'pj', pc, null])).rejects.toThrow(/character_uniq/);
    await expect(asUser(GM, add, [group, 'pj', null, npc])).rejects.toThrow(/npc_section/);
    await expect(asUser(GM, add, [group, 'npc', pc, npc])).rejects.toThrow(/one_target/);

    const other = (
      await insertOne(GM, `insert into public.gm_groups (name) values ('Outro') returning id`, [])
    ).id;
    await insertOne(GM, add, [other, 'pj', pc, null]);
    expect(await asUser(PLAYER, `select id from public.gm_group_members`)).toEqual([]);
    await expect(asUser(PLAYER, add, [other, 'npc', pc, null])).rejects.toMatchObject({ code: '42501' });

    // Apagar grupo não apaga personagem.
    await asUser(GM, `delete from public.gm_groups where id = $1`, [other]);
    expect(await asUser(GM, `select id from public.characters where id = $1`, [pc])).toHaveLength(1);
  });

  it('apagar o personagem tira ele do grupo', async () => {
    await db.query(`delete from public.characters where id = $1`, [pc]);
    expect(
      await asUser(GM, `select section from public.gm_group_members where group_id = $1`, [group])
    ).toEqual([{ section: 'npc' }]);
  });

  it('a migração roda de novo sobre o schema pronto', async () => {
    await db.exec(readSql('migrations', '023_gm_view.sql'));
  });
});
