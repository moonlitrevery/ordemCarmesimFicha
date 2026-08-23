import {
  ATTRIBUTE_POINTS_PER_LEVEL,
  ELEMENT_COLORS,
  FRAGMENT_COST,
  LEVEL_MILESTONES,
  MAX_CHARACTER_LEVEL,
  MAX_ELEMENT_LEVEL,
  PER_LEVEL_GROWTH,
  SKILL_POINTS_PER_LEVEL,
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
} from '@/types/database';

export function getAttributeModifier(value: number): number {
  return Math.floor((value - 10) / 2);
}

export function getTotalLevel(elements: CharacterElementRow[]): number {
  return elements.reduce((sum, el) => sum + (el.level || 0), 0);
}

export function getAttributePointsAvailable(
  totalLevel: number,
  attributePointsSpent: number
): number {
  const earned = totalLevel * ATTRIBUTE_POINTS_PER_LEVEL;
  return Math.max(0, earned - (attributePointsSpent || 0));
}

export function getSkillPointsAvailable(
  totalLevel: number,
  skillPointsSpent: number
): number {
  const earned = totalLevel * SKILL_POINTS_PER_LEVEL;
  return Math.max(0, earned - (skillPointsSpent || 0));
}

export function getNextSpecialization(
  current: SkillSpecialization
): SkillSpecialization | null {
  const i = SPECIALIZATION_ORDER.indexOf(current);
  if (i < 0 || i >= SPECIALIZATION_ORDER.length - 1) return null;
  return SPECIALIZATION_ORDER[i + 1];
}

export function getFragmentCostForLevel(level: number): number {
  if (level < 0 || level >= FRAGMENT_COST.length) return Infinity;
  return FRAGMENT_COST[level];
}

export function computeDerivedMaxes(
  totalLevel: number,
  attributes: Attributes
): { hpMax: number; manaMax: number; sanityMax: number } {
  const level = Math.min(totalLevel, MAX_CHARACTER_LEVEL);
  const baseHp = 10 + Math.floor(attributes.CON / 2);
  const baseMana = 10 + Math.floor(attributes.POD / 2);
  const baseSanity = 10 + Math.floor(attributes.POD / 2);

  const hpMax = Math.max(
    1,
    Math.round(
      baseHp + PER_LEVEL_GROWTH.hpPerLevel * level * (attributes.CON / 10)
    )
  );
  const manaMax = Math.max(
    1,
    Math.round(
      baseMana + PER_LEVEL_GROWTH.manaPerLevel * level * (attributes.POD / 10)
    )
  );
  const sanityMax = Math.max(1, baseSanity + level);

  return { hpMax, manaMax, sanityMax };
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

export function getInventoryWeight(items: { weight: number }[]): number {
  return items.reduce((sum, item) => sum + (Number(item.weight) || 0), 0);
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
