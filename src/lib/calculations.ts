import {
  ATTRIBUTE_POINTS_BY_LEVEL,
  ELEMENT_COLORS,
  FRAGMENT_COST,
  HP_BASE,
  HP_PER_LEVEL_BASE,
  HP_PER_LEVEL_PER_CON,
  LEVEL_MILESTONES,
  MAX_CHARACTER_LEVEL,
  MAX_ELEMENT_LEVEL,
  PER_LEVEL_GROWTH,
  SKILL_ALTO_GRANT_LEVELS,
  SKILL_BASIC_GRANT_LEVELS,
  SKILL_EXPERT_GRANT_LEVELS,
  SKILL_MEDIO_GRANT_LEVELS,
  SPECIALIZATION_BONUS,
  SPECIALIZATION_ORDER,
} from '@/lib/constants';
import type { LevelMilestone } from '@/lib/constants';
import type {
  Attributes,
  CharacterElementRow,
  ElementType,
  Skill,
  SkillSpecialization,
  SkillUpgradeKey,
  SkillUpgradeSpent,
} from '@/types/database';
import { DEFAULT_SKILL_UPGRADE_SPENT } from '@/types/database';

export function getAttributeModifier(value: number): number {
  return Math.floor((value - 10) / 2);
}

export function getTotalLevel(elements: CharacterElementRow[]): number {
  return elements.reduce((sum, el) => sum + (el.level || 0), 0);
}

/**
 * Nível usado só para recompensas de atributo/perícia.
 * A criação conta como nível 1 — a soma dos elementos pode ser 0 até o primeiro up.
 */
export function getProgressionLevel(totalLevel: number): number {
  return Math.max(1, Math.min(Math.max(0, totalLevel), MAX_CHARACTER_LEVEL));
}

export function getAttributePointsEarned(totalLevel: number): number {
  const cap = getProgressionLevel(totalLevel);
  let sum = 0;
  for (let lvl = 1; lvl <= cap; lvl++) {
    sum += ATTRIBUTE_POINTS_BY_LEVEL[lvl] ?? 0;
  }
  return sum;
}

export function getAttributePointsAvailable(
  totalLevel: number,
  attributePointsSpent: number
): number {
  return Math.max(0, getAttributePointsEarned(totalLevel) - (attributePointsSpent || 0));
}

export function normalizeSkillUpgradeSpent(
  raw: unknown
): SkillUpgradeSpent {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    return {
      basico: Math.max(0, Number(o.basico) || 0),
      medio: Math.max(0, Number(o.medio) || 0),
      alto: Math.max(0, Number(o.alto) || 0),
      expert: Math.max(0, Number(o.expert) || 0),
    };
  }
  // legado: int único contava como treinamentos básicos
  if (typeof raw === 'number') {
    return { ...DEFAULT_SKILL_UPGRADE_SPENT, basico: Math.max(0, raw) };
  }
  return { ...DEFAULT_SKILL_UPGRADE_SPENT };
}

/** Treinamentos/upgrades ganhos por marco de nível (ainda não descontando gastos). */
export function getSkillUpgradesEarned(
  totalLevel: number,
  intelligence: number
): SkillUpgradeSpent {
  const level = getProgressionLevel(totalLevel);
  const intMod = getAttributeModifier(intelligence);
  const half = Math.floor(intMod / 2);

  let basico = 0;
  for (const lvl of SKILL_BASIC_GRANT_LEVELS) {
    if (level < lvl) continue;
    if (lvl === 1) {
      // Pacote de criação / nível 1: 1 + modificador de INT
      basico += Math.max(0, 1 + intMod);
    } else {
      // níveis 3 e 5: 1 + (mod INT / 2)
      basico += Math.max(0, 1 + half);
    }
  }

  let medio = 0;
  for (const grant of SKILL_MEDIO_GRANT_LEVELS) {
    if (level >= grant.level) medio += grant.amount;
  }

  let alto = 0;
  for (const lvl of SKILL_ALTO_GRANT_LEVELS) {
    if (level >= lvl) alto += 1;
  }

  let expert = 0;
  for (const lvl of SKILL_EXPERT_GRANT_LEVELS) {
    if (level >= lvl) expert += 1;
  }

  return { basico, medio, alto, expert };
}

/**
 * Quantos upgrades de cada tipo as perícias já consomem
 * (Básico→…→Expert conta todos os degraus até o atual).
 * Fonte da verdade do gasto — evita o int legado zerar o pool Básico.
 */
export function getSkillUpgradesUsedBySkills(skills: Skill[]): SkillUpgradeSpent {
  const used: SkillUpgradeSpent = { ...DEFAULT_SKILL_UPGRADE_SPENT };
  for (const skill of skills) {
    const idx = SPECIALIZATION_ORDER.indexOf(skill.specialization);
    if (idx >= 1) used.basico += 1;
    if (idx >= 2) used.medio += 1;
    if (idx >= 3) used.alto += 1;
    if (idx >= 4) used.expert += 1;
  }
  return used;
}

export function getSkillUpgradesAvailable(
  totalLevel: number,
  intelligence: number,
  skills: Skill[]
): SkillUpgradeSpent {
  const earned = getSkillUpgradesEarned(totalLevel, intelligence);
  const used = getSkillUpgradesUsedBySkills(skills);
  return {
    basico: Math.max(0, earned.basico - used.basico),
    medio: Math.max(0, earned.medio - used.medio),
    alto: Math.max(0, earned.alto - used.alto),
    expert: Math.max(0, earned.expert - used.expert),
  };
}

export function getTotalSkillUpgradesAvailable(pools: SkillUpgradeSpent): number {
  return pools.basico + pools.medio + pools.alto + pools.expert;
}

export function getNextSpecialization(
  current: SkillSpecialization
): SkillSpecialization | null {
  const i = SPECIALIZATION_ORDER.indexOf(current);
  if (i < 0 || i >= SPECIALIZATION_ORDER.length - 1) return null;
  return SPECIALIZATION_ORDER[i + 1];
}

/** Pool gasto ao promover para o próximo degrau. */
export function getUpgradeKeyForNext(
  current: SkillSpecialization
): SkillUpgradeKey | null {
  const next = getNextSpecialization(current);
  if (!next || next === 'none') return null;
  return next;
}

export function getFragmentCostForLevel(level: number): number {
  if (level < 0 || level >= FRAGMENT_COST.length) return Infinity;
  return FRAGMENT_COST[level];
}

/**
 * HP máximo derivado de CON + nível. Ponto único de verdade do HP.
 * HP = round(10 + floor(CON/2) + nível × (0.6 + 0.4 × CON))
 */
export function getMaxHp(totalLevel: number, constitution: number): number {
  const level = Math.min(totalLevel, MAX_CHARACTER_LEVEL);
  const perLevel = HP_PER_LEVEL_BASE + HP_PER_LEVEL_PER_CON * constitution;
  return Math.max(
    1,
    Math.round(HP_BASE + Math.floor(constitution / 2) + level * perLevel)
  );
}

export function computeDerivedMaxes(
  totalLevel: number,
  attributes: Attributes
): { hpMax: number; manaMax: number; sanityMax: number } {
  const level = Math.min(totalLevel, MAX_CHARACTER_LEVEL);
  const baseMana = 10 + Math.floor(attributes.POD / 2);
  const baseSanity = 10 + Math.floor(attributes.POD / 2);

  const hpMax = getMaxHp(totalLevel, attributes.CON);
  const manaMax = Math.max(
    1,
    Math.round(
      baseMana + PER_LEVEL_GROWTH.manaPerLevel * level * (attributes.POD / 10)
    )
  );
  const sanityMax = Math.max(1, baseSanity + level);

  return { hpMax, manaMax, sanityMax };
}

/** Máximos que a ficha mostra: derivados + ajuste manual, nunca abaixo de 1. */
export function getEffectiveMaxes(
  totalLevel: number,
  attributes: Attributes,
  mods: { hp?: number; mana?: number; sanity?: number }
): { hp: number; mana: number; sanity: number } {
  const derived = computeDerivedMaxes(totalLevel, attributes);
  return {
    hp: Math.max(1, derived.hpMax + (mods.hp || 0)),
    mana: Math.max(1, derived.manaMax + (mods.mana || 0)),
    sanity: Math.max(1, derived.sanityMax + (mods.sanity || 0)),
  };
}

/** Valor da perícia = 10 + MOD do atributo + treinamento */
export function getSkillTotal(skill: Skill, attributes: Attributes): number {
  const attrValue = attributes[skill.attribute] ?? 10;
  const attrMod = getAttributeModifier(attrValue);
  const training = SPECIALIZATION_BONUS[skill.specialization] ?? 0;
  return 10 + attrMod + training;
}

/** Modificador de rolagem = ceil((valor - 10) / 2) */
export function getSkillRollModifier(skillTotal: number): number {
  return Math.ceil((skillTotal - 10) / 2);
}

export function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : String(mod);
}

export function getCarryLimit(attributes: Attributes): number {
  return attributes.FOR / 2;
}

export function itemQty(item: { qty?: number }): number {
  const qty = Math.trunc(Number(item.qty));
  return Number.isFinite(qty) && qty >= 1 ? qty : 1;
}

/** Carga: peso por unidade × quantidade. Item de peso negativo desconta; nunca abaixo de 0. */
export function getInventoryWeight(items: { weight: number; qty?: number }[]): number {
  const total = items.reduce(
    (sum, item) => sum + (Number(item.weight) || 0) * itemQty(item),
    0
  );
  return Math.max(0, Math.round(total * 100) / 100);
}

export function getApplicableMilestones(
  isOrderAgent: boolean
): LevelMilestone[] {
  return LEVEL_MILESTONES.filter(
    (m) => !m.requiresOrderAgent || isOrderAgent
  );
}

export function getNextMilestone(
  totalLevel: number,
  isOrderAgent: boolean
): LevelMilestone | null {
  return (
    getApplicableMilestones(isOrderAgent).find((m) => m.level > totalLevel) ??
    null
  );
}

export function getReachedMilestones(
  totalLevel: number,
  isOrderAgent: boolean
): LevelMilestone[] {
  return getApplicableMilestones(isOrderAgent).filter(
    (m) => m.level <= totalLevel
  );
}

export interface FragmentAddResult {
  elements: CharacterElementRow[];
  leveledUp: boolean;
  blockedByCap: boolean;
  levelsGained: number;
}

export interface FragmentRemoveResult {
  elements: CharacterElementRow[];
  leveledDown: boolean;
  levelsLost: number;
}

export function addFragmentsToElement(
  elements: CharacterElementRow[],
  element: CharacterElementRow['element'],
  amount: number
): FragmentAddResult {
  if (amount <= 0) {
    return { elements, leveledUp: false, blockedByCap: false, levelsGained: 0 };
  }

  const next = elements.map((el) => ({ ...el }));
  let row = next.find((el) => el.element === element);

  if (!row) {
    row = { element, level: 0, fragments_current: 0 };
    next.push(row);
  }

  row.fragments_current += amount;
  let leveledUp = false;
  let blockedByCap = false;
  let levelsGained = 0;

  while (row.level < MAX_ELEMENT_LEVEL) {
    const cost = getFragmentCostForLevel(row.level);
    if (row.fragments_current < cost) break;

    const totalLevel = getTotalLevel(next);
    if (totalLevel >= MAX_CHARACTER_LEVEL) {
      blockedByCap = true;
      break;
    }

    row.fragments_current -= cost;
    row.level += 1;
    leveledUp = true;
    levelsGained += 1;
  }

  return { elements: next, leveledUp, blockedByCap, levelsGained };
}

export function removeFragmentsFromElement(
  elements: CharacterElementRow[],
  element: CharacterElementRow['element'],
  amount: number
): FragmentRemoveResult {
  if (amount <= 0) {
    return { elements, leveledDown: false, levelsLost: 0 };
  }

  const next = elements.map((el) => ({ ...el }));
  const row = next.find((el) => el.element === element);
  if (!row) {
    return { elements, leveledDown: false, levelsLost: 0 };
  }

  let remaining = amount;
  let leveledDown = false;
  let levelsLost = 0;

  while (remaining > 0) {
    if (row.fragments_current > 0) {
      const take = Math.min(remaining, row.fragments_current);
      row.fragments_current -= take;
      remaining -= take;
      continue;
    }
    if (row.level > 0) {
      row.level -= 1;
      row.fragments_current = getFragmentCostForLevel(row.level);
      leveledDown = true;
      levelsLost += 1;
      continue;
    }
    break;
  }

  return { elements: next, leveledDown, levelsLost };
}

export function getDominantElements(
  elements: CharacterElementRow[],
  count = 2
): CharacterElementRow[] {
  return [...elements]
    .filter((el) => el.level > 0)
    .sort(
      (a, b) =>
        b.level - a.level || b.fragments_current - a.fragments_current
    )
    .slice(0, count);
}

export function getMosaicPieceColors(
  elements: CharacterElementRow[]
): ({ color: string; element: ElementType } | null)[] {
  const pieces: ({ color: string; element: ElementType } | null)[] = Array.from(
    { length: 20 },
    () => null
  );
  let i = 0;
  const ordered = [...elements]
    .filter((e) => e.level > 0)
    .sort((a, b) => a.element.localeCompare(b.element));

  for (const el of ordered) {
    for (let n = 0; n < el.level && i < 20; n += 1) {
      pieces[i] = {
        color: ELEMENT_COLORS[el.element],
        element: el.element,
      };
      i += 1;
    }
  }
  return pieces;
}
