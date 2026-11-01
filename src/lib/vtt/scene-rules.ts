import { isValidConditionList } from './conditions';
import type {
  Caption,
  Drawing,
  ObjectKind,
  PendingPlacement,
  SceneAsset,
  SceneObject,
  TableRole,
  VttMember,
} from './types';
import {
  localFromWorld,
  multiply,
  toMatrix,
  worldFromLocal,
  type Matrix,
  type Transform,
} from './transform';

export const MAX_CAPTION_LENGTH = 120;

export function isPlaceableKind(kind: string): kind is ObjectKind {
  return kind === 'token' || kind === 'adereco' || kind === 'addon';
}

export function canEditObjects(role: TableRole): boolean {
  return role !== 'espectador';
}

export function canDeleteObject(
  object: Pick<SceneObject, 'created_by'>,
  role: TableRole,
  userId: string
): boolean {
  if (role === 'mestre') return true;
  return role === 'jogador' && object.created_by === userId;
}

/**
 * Qual cena esta pessoa vê. A mestra escolhe livremente (a escolha é local);
 * só jogador pode estar separado; sessão fechada não mostra nada.
 */
export function resolveViewedScene(input: {
  role: TableRole;
  sessionOpen: boolean;
  memberSceneId: string | null;
  defaultSceneId: string | null;
  gmChoice: string | null;
  sceneIds: string[];
}): string | null {
  const { role, sessionOpen, memberSceneId, defaultSceneId, gmChoice, sceneIds } =
    input;
  if (role === 'mestre') {
    if (gmChoice && sceneIds.includes(gmChoice)) return gmChoice;
    if (defaultSceneId && sceneIds.includes(defaultSceneId)) return defaultSceneId;
    return sceneIds[0] ?? null;
  }
  if (!sessionOpen) return null;
  return role === 'jogador' ? memberSceneId ?? defaultSceneId : defaultSceneId;
}

/** Quem está em cada cena, contando quem ficou com o grupo na cena padrão. */
export function membersInScene(
  sceneId: string,
  members: VttMember[],
  defaultSceneId: string | null
): VttMember[] {
  return members.filter((member) => {
    if (member.banned) return false;
    if (member.role === 'espectador') return sceneId === defaultSceneId;
    return (member.sceneId ?? defaultSceneId) === sceneId;
  });
}

/**
 * Cena que tem alguém além da mestra olhando. Mudança em cena sem plateia não
 * sai com dados no canal: quem prepara em segredo manda só um aviso.
 */
export function isSceneLive(
  sceneId: string,
  members: VttMember[],
  defaultSceneId: string | null,
  sessionOpen: boolean
): boolean {
  return sessionOpen && membersInScene(sceneId, members, defaultSceneId).length > 0;
}

// ---------- Anexos ----------

/** Pai válido: existe nesta cena e subir por ele nunca volta ao objeto. */
export function effectiveParent(
  object: SceneObject,
  objects: Record<string, SceneObject>
): SceneObject | null {
  if (!object.parent_id || !object.local) return null;
  const parent = objects[object.parent_id];
  if (!parent) return null;
  return wouldCreateCycle(object.id, parent.id, objects) ? null : parent;
}

export function wouldCreateCycle(
  childId: string,
  parentId: string,
  objects: Record<string, SceneObject>
): boolean {
  const seen = new Set<string>();
  let cursor: string | null = parentId;
  while (cursor) {
    if (cursor === childId || seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = objects[cursor]?.parent_id ?? null;
  }
  return false;
}

export function descendantsOf(
  id: string,
  objects: Record<string, SceneObject>
): SceneObject[] {
  const found: SceneObject[] = [];
  const queue = [id];
  const seen = new Set(queue);
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const object of Object.values(objects)) {
      if (object.parent_id === current && !seen.has(object.id)) {
        seen.add(object.id);
        found.push(object);
        queue.push(object.id);
      }
    }
  }
  return found;
}

/** A transformação guardada: relativa ao pai se anexado, do mundo se solto. */
export function ownTransform(
  object: SceneObject,
  objects: Record<string, SceneObject>
): Transform {
  if (effectiveParent(object, objects) && object.local) return object.local;
  return {
    x: object.x,
    y: object.y,
    rotation: object.rotation,
    scale: object.scale,
    flipX: object.flip_x,
    flipY: object.flip_y,
  };
}

export function worldMatrix(
  object: SceneObject,
  objects: Record<string, SceneObject>
): Matrix {
  const own = toMatrix(ownTransform(object, objects));
  const parent = effectiveParent(object, objects);
  return parent ? multiply(worldMatrix(parent, objects), own) : own;
}

export function worldTransform(
  object: SceneObject,
  objects: Record<string, SceneObject>
): Transform {
  const own = ownTransform(object, objects);
  const parent = effectiveParent(object, objects);
  return parent ? worldFromLocal(own, worldMatrix(parent, objects)) : own;
}

export type ObjectPatch = Partial<
  Pick<
    SceneObject,
    | 'x'
    | 'y'
    | 'rotation'
    | 'scale'
    | 'flip_x'
    | 'flip_y'
    | 'z'
    | 'parent_id'
    | 'local'
    | 'caption'
    | 'effects'
    | 'conditions'
    | 'npc_id'
    | 'hidden'
  >
>;

/** Grava a transformação no campo certo para o estado de anexo atual. */
export function patchFromOwn(
  object: SceneObject,
  objects: Record<string, SceneObject>,
  own: Transform
): ObjectPatch {
  if (effectiveParent(object, objects)) return { local: own };
  return rootPatch(own);
}

function rootPatch(t: Transform): ObjectPatch {
  return {
    x: t.x,
    y: t.y,
    rotation: t.rotation,
    scale: t.scale,
    flip_x: t.flipX,
    flip_y: t.flipY,
  };
}

/** Mesma coisa a partir da posição no mundo (arrastar, handles). */
export function patchFromWorld(
  object: SceneObject,
  objects: Record<string, SceneObject>,
  world: Transform
): ObjectPatch {
  const parent = effectiveParent(object, objects);
  if (!parent) return rootPatch(world);
  return { local: localFromWorld(world, worldMatrix(parent, objects)) };
}

export function attachPatch(
  child: SceneObject,
  parent: SceneObject,
  objects: Record<string, SceneObject>
): ObjectPatch {
  return {
    parent_id: parent.id,
    local: localFromWorld(
      worldTransform(child, objects),
      worldMatrix(parent, objects)
    ),
  };
}

/** Volta às coordenadas do mundo sem sair do lugar. */
export function detachPatch(
  child: SceneObject,
  objects: Record<string, SceneObject>
): ObjectPatch {
  return {
    ...rootPatch(worldTransform(child, objects)),
    parent_id: null,
    local: null,
  };
}

// ---------- Copiar e colar ----------

/** O objeto e o que está anexado nele, como eram na hora de copiar. */
export interface ObjectCopy {
  sceneId: string;
  /** Onde o objeto estava no mundo: anexado, a cópia nasce solta nesse lugar. */
  world: Transform;
  rows: SceneObject[];
  assets: Record<string, SceneAsset>;
}

export function copyFamily(
  id: string,
  objects: Record<string, SceneObject>,
  sceneAssets: Record<string, SceneAsset>
): ObjectCopy | null {
  const root = objects[id];
  if (!root) return null;
  const rows = [root, ...descendantsOf(id, objects)];
  const assets: Record<string, SceneAsset> = {};
  for (const row of rows) {
    if (sceneAssets[row.asset_id]) assets[row.asset_id] = sceneAssets[row.asset_id];
  }
  return { sceneId: root.scene_id, world: worldTransform(root, objects), rows, assets };
}

/**
 * Linhas novas, pais antes dos filhos. Não leva vínculo com ficha nem NPC. Jogador
 * não vê oculto, então só a mestra chega aqui com um; mesmo assim, nasce visível.
 */
export function buildPastedRows(
  copy: ObjectCopy,
  target: {
    sceneId: string;
    x: number;
    y: number;
    z: number;
    userId: string;
    isGm: boolean;
    newId: () => string;
  }
): SceneObject[] {
  const ids = new Map(copy.rows.map((row) => [row.id, target.newId()]));
  return copy.rows.map((row, index) => {
    const pasted: SceneObject = {
      ...row,
      id: ids.get(row.id) as string,
      scene_id: target.sceneId,
      parent_id: row.parent_id ? ids.get(row.parent_id) ?? null : null,
      character_id: null,
      npc_id: null,
      hidden: target.isGm && row.hidden,
      created_by: target.userId,
    };
    if (index > 0) return pasted;
    return {
      ...pasted,
      ...rootPatch({ ...copy.world, x: target.x, y: target.y }),
      parent_id: null,
      local: null,
      z: target.z,
    };
  });
}

// ---------- Ordem ----------

/** A imagem do pai fica em z 0: um anexo pode ir para a frente ou para trás dela. */
export function frontZ(
  object: SceneObject,
  objects: Record<string, SceneObject>
): number {
  const zs = siblings(object, objects).map((other) => other.z);
  return Math.max(object.z, ...zs, ...(object.parent_id ? [0] : [])) + 1;
}

export function backZ(
  object: SceneObject,
  objects: Record<string, SceneObject>
): number {
  const zs = siblings(object, objects).map((other) => other.z);
  return Math.min(object.z, ...zs, ...(object.parent_id ? [0] : [])) - 1;
}

function siblings(
  object: SceneObject,
  objects: Record<string, SceneObject>
): SceneObject[] {
  return Object.values(objects).filter(
    (other) => other.id !== object.id && other.parent_id === object.parent_id
  );
}

// ---------- Tamanho inicial ----------

/** Token nasce com ~1/20 do mapa e adereço com ~1/8, seja qual for o arquivo. */
export function defaultObjectScale(
  kind: ObjectKind,
  asset: { width: number | null; height: number | null },
  mapSide: number | null
): number {
  const side = Math.max(asset.width ?? 256, asset.height ?? 256);
  const reference = mapSide ?? 2000;
  const target = kind === 'adereco' ? reference / 8 : reference / 20;
  return target / side;
}

// ---------- Legenda ----------

const SCRAMBLE_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#$%&@?!';

/** Como o §k do Minecraft: mesmo comprimento, espaços ficam no lugar. */
export function scrambleText(
  text: string,
  random: () => number = Math.random
): string {
  return Array.from(text)
    .map((char) =>
      /\s/.test(char)
        ? char
        : SCRAMBLE_CHARS[Math.floor(random() * SCRAMBLE_CHARS.length)]
    )
    .join('');
}

export const DEFAULT_CAPTION: Caption = {
  text: '',
  color: '#f5e6c8',
  stroke: '#000000',
  strokeWidth: 3,
  glow: false,
  glowColor: '#8b1e2d',
  obfuscated: false,
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Legenda vazia vira `null`; o resto entra no limite do modal. */
export function sanitizeCaption(caption: Caption): Caption | null {
  const text = caption.text.trim().slice(0, MAX_CAPTION_LENGTH);
  if (!text) return null;
  return {
    text,
    color: HEX_COLOR.test(caption.color) ? caption.color : DEFAULT_CAPTION.color,
    stroke: HEX_COLOR.test(caption.stroke) ? caption.stroke : DEFAULT_CAPTION.stroke,
    strokeWidth: Math.max(0, Math.min(8, caption.strokeWidth || 0)),
    glow: Boolean(caption.glow),
    glowColor: HEX_COLOR.test(caption.glowColor)
      ? caption.glowColor
      : DEFAULT_CAPTION.glowColor,
    obfuscated: Boolean(caption.obfuscated),
  };
}

// ---------- Cor por pessoa ----------

const USER_COLORS = [
  '#e0525f',
  '#e8a33d',
  '#7bc950',
  '#3dc1d3',
  '#5d8bf4',
  '#b57edc',
  '#f07bb5',
  '#f5e6c8',
];

export function userColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return USER_COLORS[hash % USER_COLORS.length];
}

/** As cores geradas e mais quatro, para quem escolhe a própria. */
export const PERSONAL_COLORS = [
  ...USER_COLORS,
  '#c4374a',
  '#2fb98a',
  '#8a94a6',
  '#ffffff',
];

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

/** A cor escolhida é livre: a inicial no avatar precisa continuar legível nela. */
export function readableTextOn(color: string): string {
  const channel = (start: number) => Number.parseInt(color.slice(start, start + 2), 16);
  const luminance = 0.299 * channel(1) + 0.587 * channel(3) + 0.114 * channel(5);
  return luminance > 140 ? '#0c0a0d' : '#f5e6c8';
}

/** Limite por chave (ping: 1 por segundo por pessoa, inclusive quem recebe). */
export function allowPerKey(
  last: Map<string, number>,
  key: string,
  now: number,
  intervalMs: number
): boolean {
  const previous = last.get(key);
  if (previous !== undefined && now - previous < intervalMs) return false;
  last.set(key, now);
  return true;
}

// ---------- O que chega pelo canal ----------
// Qualquer membro envia no canal: um payload torto não pode derrubar o canvas.

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isTransform(value: unknown): value is Transform {
  const t = value as Transform | null;
  return (
    !!t &&
    isFiniteNumber(t.x) &&
    isFiniteNumber(t.y) &&
    isFiniteNumber(t.rotation) &&
    isFiniteNumber(t.scale) &&
    t.scale > 0 &&
    typeof t.flipX === 'boolean' &&
    typeof t.flipY === 'boolean'
  );
}

export function isValidObject(value: unknown): value is SceneObject {
  const o = value as SceneObject | null;
  return (
    !!o &&
    typeof o.id === 'string' &&
    typeof o.scene_id === 'string' &&
    typeof o.asset_id === 'string' &&
    isPlaceableKind(o.kind) &&
    isFiniteNumber(o.x) &&
    isFiniteNumber(o.y) &&
    isFiniteNumber(o.rotation) &&
    isFiniteNumber(o.scale) &&
    o.scale > 0 &&
    isFiniteNumber(o.z) &&
    typeof o.updated_at === 'string' &&
    (o.local === null || isTransform(o.local)) &&
    (o.caption === null || isValidCaption(o.caption)) &&
    Array.isArray(o.effects) &&
    isValidConditionList(o.conditions)
  );
}

function isValidCaption(value: unknown): value is Caption {
  const c = value as Caption | null;
  return (
    !!c &&
    typeof c.text === 'string' &&
    typeof c.color === 'string' &&
    typeof c.stroke === 'string' &&
    isFiniteNumber(c.strokeWidth) &&
    typeof c.glowColor === 'string'
  );
}

export function isValidDrawing(value: unknown): value is Drawing {
  const d = value as Drawing | null;
  return (
    !!d &&
    typeof d.id === 'string' &&
    typeof d.scene_id === 'string' &&
    Array.isArray(d.points) &&
    d.points.length >= 4 &&
    d.points.length % 2 === 0 &&
    d.points.every(isFiniteNumber) &&
    typeof d.color === 'string' &&
    HEX_COLOR.test(d.color) &&
    isFiniteNumber(d.width) &&
    d.width > 0
  );
}

/** Colocação pendente desenhada como objeto, só para quem soltou o arquivo. */
export function placementAsObject(placement: PendingPlacement): SceneObject {
  return {
    id: `pending:${placement.id}`,
    scene_id: placement.scene_id,
    asset_id: placement.asset_id,
    kind: 'token',
    x: placement.x,
    y: placement.y,
    rotation: 0,
    scale: placement.scale,
    flip_x: false,
    flip_y: false,
    z: Number.MAX_SAFE_INTEGER,
    parent_id: null,
    local: null,
    caption: null,
    effects: [],
    conditions: [],
    character_id: null,
    npc_id: null,
    hidden: false,
    created_by: placement.created_by,
    updated_at: placement.created_at,
  };
}
