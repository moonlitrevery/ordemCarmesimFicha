import {
  PLANE_X_DIVISOR,
  xpForNd,
  type CreatureTier,
  type Plane,
} from './creature-tiers';

export const ATTRIBUTE_LABELS = ['FOR', 'CON', 'DES', 'INT', 'EDU', 'CAR', 'POD'];

export interface AttackSlot {
  name: string;
  damage: string;
}

/** O que a tabela preenche. Depois de criado, tudo é editável. */
export interface NpcDraft {
  plane: Plane;
  tier: string;
  nd: number;
  attributes: number[];
  hp_max: number;
  hp_current: number;
  damage_die: string;
  x_bonus: number;
  attack_slots: AttackSlot[];
  turns: number;
  xp: number;
}

export interface Npc extends NpcDraft {
  id: string;
  table_id: string;
  name: string;
  notes: string;
  created_at: string;
}

export type NpcPatch = Partial<Omit<Npc, 'id' | 'table_id' | 'created_at'>>;

export function clampNd(tier: CreatureTier, nd: number): number {
  const whole = Number.isFinite(nd) ? Math.round(nd) : tier.ndMin;
  return Math.min(tier.ndMax, Math.max(tier.ndMin, whole));
}

/** X por rodada. Fora dos Celestiais, ND dividido pelo divisor do plano. */
export function xForTier(tier: CreatureTier, nd: number): number {
  if (!tier.hasX) return 0;
  if (tier.xMode === 'nd' || tier.plane === 'celestial') return nd;
  return Math.round(nd / PLANE_X_DIVISOR[tier.plane]);
}

export function damageNotation(die: string, x: number): string {
  if (x === 0) return die;
  return x > 0 ? `${die}+${x}` : `${die}${x}`;
}

/** O X da tabela é por rodada: quem age mais de uma vez divide entre os turnos. */
export function xPerTurn(x: number, turns: number): number {
  return Math.round((x / Math.max(1, turns)) * 10) / 10;
}

export function buildNpcFromTier(tier: CreatureTier, nd: number): NpcDraft {
  const level = clampNd(tier, nd);
  const hp = level * tier.hpPerNd;
  const x = xForTier(tier, level);
  const damage = damageNotation(tier.damageDie, x);
  return {
    plane: tier.plane,
    tier: tier.id,
    nd: level,
    attributes: [...tier.attributes],
    hp_max: hp,
    hp_current: hp,
    damage_die: tier.damageDie,
    x_bonus: x,
    attack_slots: Array.from({ length: tier.attacks }, (_unused, index) => ({
      name: tier.attacks === 1 ? 'Ataque' : `Ataque ${index + 1}`,
      damage,
    })),
    turns: tier.turns,
    xp: xpForNd(level),
  };
}

export function clampHp(current: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(current)));
}

/**
 * Mudar dado ou X leva junto só os golpes que ainda seguiam a fórmula: dano
 * escrito à mão continua como está.
 */
export function retuneAttacks(
  npc: Pick<Npc, 'damage_die' | 'x_bonus' | 'attack_slots'>,
  die: string,
  x: number
): AttackSlot[] {
  const before = damageNotation(npc.damage_die, npc.x_bonus);
  const after = damageNotation(die, x);
  return npc.attack_slots.map((slot) =>
    slot.damage === before ? { ...slot, damage: after } : slot
  );
}
