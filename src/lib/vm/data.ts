import type { createClient } from '@/lib/supabase/client';

type SupabaseClient = ReturnType<typeof createClient>;
import type {
  Attributes,
  ElementType,
  ResourceMods,
} from '@/types/database';
import { ATTRIBUTE_KEYS } from '@/types/database';

/** V.M. (Visão da Mestra): leitura dos grupos e de quem está neles. */

export type VmSection = 'pj' | 'npc';

export interface VmGroup {
  id: string;
  name: string;
  sort_order: number;
}

export interface VmMember {
  id: string;
  section: VmSection;
  character_id: string | null;
  npc_id: string | null;
  sort_order: number;
}

export interface VmElement {
  id: string;
  element: ElementType;
  level: number;
}

/** Ficha do site. Um objeto novo a cada mudança: é o que o card memoizado compara. */
export interface VmCharacter {
  id: string;
  owner_id: string;
  ownerName: string | null;
  name: string;
  image_url: string | null;
  attributes: Attributes;
  hp_current: number;
  mana_current: number;
  sanity_current: number;
  resource_mods: ResourceMods | null;
  elements: VmElement[];
}

/** NPC da Mesa: sem mana, sanidade, foto nem elementos. */
export interface VmNpc {
  id: string;
  name: string;
  hp_current: number;
  hp_max: number;
  attributes: Attributes;
  tier: string;
  nd: number;
  tableName: string | null;
}

/** Colunas da ficha que o card usa. O payload do realtime traz a linha inteira. */
export const VM_CHARACTER_COLUMNS =
  'id, owner_id, name, image_url, attributes, hp_current, mana_current, sanity_current, resource_mods';

const CHARACTER_SELECT =
  VM_CHARACTER_COLUMNS + ', profiles(display_name), character_elements(id, element, level)';

export const VM_NPC_COLUMNS = 'id, name, hp_current, hp_max, attributes, tier, nd, table_id';

const NPC_SELECT = VM_NPC_COLUMNS + ', tables(name)';

type Row = Record<string, unknown>;

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function embeddedName(value: unknown, key: string): string | null {
  // PostgREST devolve objeto em FK many-to-one; array por precaução.
  const obj = Array.isArray(value) ? value[0] : value;
  if (obj && typeof obj === 'object' && key in obj) {
    const v = (obj as Row)[key];
    return typeof v === 'string' ? v : null;
  }
  return null;
}

export function normalizeElements(rows: unknown): VmElement[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r: Row) => ({
      id: String(r.id),
      element: r.element as ElementType,
      level: num(r.level),
    }))
    .filter((e) => e.id && e.element);
}

/** Linha de `characters` (do select ou do realtime) no formato do card. */
export function toVmCharacter(
  row: Row,
  prev?: Pick<VmCharacter, 'ownerName' | 'elements'>
): VmCharacter {
  const attrs = (row.attributes ?? {}) as Partial<Attributes>;
  const attributes = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) attributes[key] = num(attrs[key] ?? 10);
  return {
    id: String(row.id),
    owner_id: String(row.owner_id ?? ''),
    ownerName: 'profiles' in row ? embeddedName(row.profiles, 'display_name') : (prev?.ownerName ?? null),
    name: String(row.name ?? ''),
    image_url: (row.image_url as string | null) ?? null,
    attributes,
    hp_current: num(row.hp_current),
    mana_current: num(row.mana_current),
    sanity_current: num(row.sanity_current),
    resource_mods: (row.resource_mods as ResourceMods | null) ?? null,
    elements:
      'character_elements' in row ? normalizeElements(row.character_elements) : (prev?.elements ?? []),
  };
}

/** `npcs.attributes` é um array na ordem FOR, CON, DES, INT, EDU, CAR, POD. */
const NPC_ATTRIBUTE_ORDER: (keyof Attributes)[] = ['FOR', 'CON', 'DES', 'INT', 'EDU', 'CAR', 'POD'];

export function toVmNpc(row: Row, prev?: Pick<VmNpc, 'tableName'>): VmNpc {
  const values = Array.isArray(row.attributes) ? row.attributes : [];
  const attributes = {} as Attributes;
  NPC_ATTRIBUTE_ORDER.forEach((key, i) => {
    attributes[key] = num(values[i] ?? 10);
  });
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    hp_current: num(row.hp_current),
    hp_max: num(row.hp_max),
    attributes,
    tier: String(row.tier ?? ''),
    nd: num(row.nd),
    tableName: 'tables' in row ? embeddedName(row.tables, 'name') : (prev?.tableName ?? null),
  };
}

export interface VmGroupData {
  members: VmMember[];
  characters: Record<string, VmCharacter>;
  npcs: Record<string, VmNpc>;
}

export async function fetchGroups(supabase: SupabaseClient): Promise<VmGroup[]> {
  const { data, error } = await supabase
    .from('gm_groups')
    .select('id, name, sort_order')
    .order('sort_order')
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as VmGroup[];
}

export async function fetchGroupData(
  supabase: SupabaseClient,
  groupId: string
): Promise<VmGroupData> {
  const { data: rows, error } = await supabase
    .from('gm_group_members')
    .select('id, section, character_id, npc_id, sort_order')
    .eq('group_id', groupId)
    .order('sort_order')
    .order('created_at');
  if (error) throw error;
  const members = (rows ?? []) as VmMember[];

  const characterIds = members.flatMap((m) => (m.character_id ? [m.character_id] : []));
  const npcIds = members.flatMap((m) => (m.npc_id ? [m.npc_id] : []));

  const [chars, npcs] = await Promise.all([
    characterIds.length
      ? supabase.from('characters').select(CHARACTER_SELECT).in('id', characterIds)
      : Promise.resolve({ data: [], error: null }),
    npcIds.length
      ? supabase.from('npcs').select(NPC_SELECT).in('id', npcIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (chars.error) throw chars.error;
  if (npcs.error) throw npcs.error;

  const characters: Record<string, VmCharacter> = {};
  for (const row of (chars.data ?? []) as unknown as Row[]) {
    const c = toVmCharacter(row);
    characters[c.id] = c;
  }
  const npcMap: Record<string, VmNpc> = {};
  for (const row of (npcs.data ?? []) as unknown as Row[]) {
    const n = toVmNpc(row);
    npcMap[n.id] = n;
  }
  return { members, characters, npcs: npcMap };
}

/** Opção do seletor de membro. */
export interface VmPickOption {
  kind: 'character' | 'npc';
  id: string;
  name: string;
  imageUrl: string | null;
  subtitle: string | null;
}

export async function fetchPickOptions(
  supabase: SupabaseClient,
  section: VmSection,
  userId: string
): Promise<VmPickOption[]> {
  if (section === 'pj') {
    const { data, error } = await supabase
      .from('characters')
      .select('id, name, image_url, profiles(display_name)')
      .order('name');
    if (error) throw error;
    return ((data ?? []) as unknown as Row[]).map((r) => ({
      kind: 'character' as const,
      id: String(r.id),
      name: String(r.name ?? ''),
      imageUrl: (r.image_url as string | null) ?? null,
      subtitle: embeddedName(r.profiles, 'display_name'),
    }));
  }

  // NPCs: fichas do site da própria mestra e NPCs das mesas que ela mestra.
  const [own, mesa] = await Promise.all([
    supabase.from('characters').select('id, name, image_url').eq('owner_id', userId).order('name'),
    supabase.from('npcs').select('id, name, tier, nd, tables(name)').order('name'),
  ]);
  if (own.error) throw own.error;
  if (mesa.error) throw mesa.error;
  return [
    ...((own.data ?? []) as unknown as Row[]).map((r) => ({
      kind: 'character' as const,
      id: String(r.id),
      name: String(r.name ?? ''),
      imageUrl: (r.image_url as string | null) ?? null,
      subtitle: 'Ficha do site',
    })),
    ...((mesa.data ?? []) as unknown as Row[]).map((r) => ({
      kind: 'npc' as const,
      id: String(r.id),
      name: String(r.name ?? ''),
      imageUrl: null,
      subtitle: ['Mesa', embeddedName(r.tables, 'name')].filter(Boolean).join(': '),
    })),
  ];
}
