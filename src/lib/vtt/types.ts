import type { AssetKind } from './assets/rules';
import type { Transform } from './transform';

export type TableMemberRole = 'jogador' | 'espectador';

export type TableRole = 'mestre' | TableMemberRole;

export interface InitiativeEntry {
  id: string;
  name: string;
  /** Sem valor até rolar ou digitar. */
  value: number | null;
  objectId: string | null;
  /** Criatura com mais de um turno por rodada aparece uma vez por turno. */
  turn: number;
  turns: number;
}

export interface InitiativeState {
  entries: InitiativeEntry[];
  current: number;
  round: number;
  /** Notação da rolagem: a fórmula oficial ainda vai ser definida. */
  notation: string;
}

/** Sem `code`: a coluna só é lida pela mestra, via get_my_table_codes. */
export interface VttTable {
  id: string;
  name: string;
  owner_id: string;
  session_open: boolean;
  default_scene_id: string | null;
  initiative: InitiativeState;
  created_at: string;
}

export interface VttMember {
  userId: string;
  name: string;
  role: TableMemberRole;
  sceneId: string | null;
  banned: boolean;
  joinedAt: string;
}

export interface VttMe {
  userId: string;
  name: string;
  role: TableRole;
  sceneId: string | null;
}

export interface VttPresence {
  userId: string;
  name: string;
  role: TableRole;
  sceneId: string | null;
}

export interface VttScene {
  id: string;
  table_id: string;
  name: string;
  folder: string;
  sort: number;
  map_asset_id: string | null;
  meters_per_px: number | null;
  /** Efeitos de tela salvos. Ler com `parseWeather`. */
  weather: unknown;
  created_at: string;
}

export type ObjectKind = 'token' | 'adereco' | 'addon';

export interface Caption {
  text: string;
  color: string;
  stroke: string;
  strokeWidth: number;
  glow: boolean;
  glowColor: string;
  obfuscated: boolean;
}

export interface SceneObject {
  id: string;
  scene_id: string;
  asset_id: string;
  kind: ObjectKind;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  flip_x: boolean;
  flip_y: boolean;
  z: number;
  parent_id: string | null;
  /** Transformação relativa ao pai; só vale enquanto `parent_id` existe. */
  local: Transform | null;
  caption: Caption | null;
  /** Magias e efeitos ligados. Qualquer jogador grava: ler com `parseEffects`. */
  effects: unknown[];
  /** Ver `conditions.ts`: id da lista padrão ou `custom:{emoji}:{texto}`. */
  conditions: string[];
  character_id: string | null;
  npc_id: string | null;
  hidden: boolean;
  created_by: string | null;
  updated_at: string;
}

export interface Drawing {
  id: string;
  scene_id: string;
  author_id: string | null;
  points: number[];
  color: string;
  width: number;
  created_at: string;
}

export interface PendingPlacement {
  id: string;
  asset_id: string;
  scene_id: string;
  x: number;
  y: number;
  scale: number;
  created_by: string;
  created_at: string;
}

/** O que o canvas precisa de um asset. */
export interface SceneAsset {
  id: string;
  kind: AssetKind;
  name: string;
  url: string;
  thumb_url: string | null;
  width: number | null;
  height: number | null;
}

export interface TableSnapshot {
  table: VttTable;
  ownerName: string;
  members: VttMember[];
  me: VttMe;
}
