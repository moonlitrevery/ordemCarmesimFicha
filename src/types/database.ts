export type UserRole = 'mestre' | 'jogador';

export type ElementType =
  | 'fogo'
  | 'agua'
  | 'terra'
  | 'ar'
  | 'sangue'
  | 'encantamento'
  | 'veneno'
  | 'gelo'
  | 'eletricidade'
  | 'luz'
  | 'sombra';

export interface Attributes {
  FOR: number;
  CON: number;
  DES: number;
  INT: number;
  EDU: number;
  CAR: number;
  POD: number;
}

export type SkillSpecialization =
  | 'none'
  | 'basico'
  | 'medio'
  | 'alto'
  | 'expert';

export type SkillUpgradeKey = 'basico' | 'medio' | 'alto' | 'expert';

export interface SkillUpgradeSpent {
  basico: number;
  medio: number;
  alto: number;
  expert: number;
}

export const DEFAULT_SKILL_UPGRADE_SPENT: SkillUpgradeSpent = {
  basico: 0,
  medio: 0,
  alto: 0,
  expert: 0,
};

export interface Skill {
  name: string;
  attribute: keyof Attributes;
  specialization: SkillSpecialization;
}

export interface Spell {
  name: string;
  element: ElementType | string;
  description: string;
  effect: string;
  range: string;
  manaCost: string;
}

export interface WeaponMod {
  name: string;
  description: string;
}

export interface Weapon {
  name: string;
  type: string;
  damage: string;
  ammo: string;
  hitsPerTurn: number;
  weight: number;
  range: string;
  flaw: string;
  area: string;
  /** Ausente em fichas antigas: tratar como []. */
  mods?: WeaponMod[];
}

export interface ArmorPiece {
  name: string;
  kind: 'fisica' | 'magica';
  reduction: string;
  notes: string;
}

export interface InventoryItem {
  name: string;
  description: string;
  weight: number;
}

export interface Curse {
  name: string;
  story: string;
  effect: string;
}

export interface HistoricalFeat {
  title: string;
  description: string;
  alignment: 'positivo' | 'negativo';
  dateOrSession?: string;
}

export interface CharacterElementRow {
  id?: string;
  character_id?: string;
  element: ElementType;
  level: number;
  fragments_current: number;
}

export type MilestoneNotes = Record<string, string>;

export interface ResourceMods {
  hp: number;
  mana: number;
  sanity: number;
}

export const DEFAULT_RESOURCE_MODS: ResourceMods = { hp: 0, mana: 0, sanity: 0 };

export interface Profile {
  id: string;
  display_name: string;
  role: UserRole;
  created_at: string;
}

export interface Character {
  id: string;
  owner_id: string;
  name: string;
  occupation: string | null;
  age: number | null;
  pronouns: string | null;
  birthplace: string | null;
  residence: string | null;
  image_url: string | null;
  arcana: string | null;
  subarcana: string | null;
  attributes: Attributes;
  hp_current: number;
  hp_max: number;
  mana_current: number;
  mana_max: number;
  sanity_current: number;
  sanity_max: number;
  skills: Skill[];
  spells: Spell[];
  weapons: Weapon[];
  inventory: InventoryItem[];
  money?: number | string;
  armor?: ArmorPiece[];
  curses: Curse[];
  historical_feats: HistoricalFeat[];
  milestone_notes: MilestoneNotes;
  resource_mods?: ResourceMods;
  notes: string | null;
  backstory: string | null;
  is_order_agent: boolean;
  order_rank: string | null;
  attribute_points_spent: number;
  skill_points_spent: SkillUpgradeSpent;
  created_at: string;
  updated_at: string;
}

export interface CharacterWithOwner extends Character {
  profiles?: Pick<Profile, 'display_name' | 'role'> | null;
}

export const DEFAULT_ATTRIBUTES: Attributes = {
  FOR: 10,
  CON: 10,
  DES: 10,
  INT: 10,
  EDU: 10,
  CAR: 10,
  POD: 10,
};

export const ATTRIBUTE_KEYS: (keyof Attributes)[] = [
  'FOR',
  'CON',
  'DES',
  'INT',
  'EDU',
  'CAR',
  'POD',
];

export const ATTRIBUTE_LABELS: Record<keyof Attributes, string> = {
  FOR: 'Força',
  CON: 'Constituição',
  DES: 'Destreza',
  INT: 'Inteligência',
  EDU: 'Educação',
  CAR: 'Carisma',
  POD: 'Poder',
};
