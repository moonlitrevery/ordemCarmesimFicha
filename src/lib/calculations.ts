import {
  FRAGMENT_COST,
  LEVEL_MILESTONES,
  MAX_CHARACTER_LEVEL,
  MAX_ELEMENT_LEVEL,
  PER_LEVEL_GROWTH,
  SPECIALIZATION_BONUS,
} from '@/lib/constants';
import type { LevelMilestone } from '@/lib/constants';
import type { Attributes, CharacterElementRow, Skill } from '@/types/database';

export function getAttributeModifier(value: number): number {
  return Math.floor((value - 10) / 2);
}

export function getTotalLevel(elements: CharacterElementRow[]): number {
  return elements.reduce((sum, el) => sum + (el.level || 0), 0);
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

export function getSkillTotal(skill: Skill, attributes: Attributes): number {
  const attr = attributes[skill.attribute] ?? 10;
  const bonus = SPECIALIZATION_BONUS[skill.specialization] ?? 0;
  return attr + bonus;
}

export function getCarryLimit(attributes: Attributes): number {
  return attributes.FOR / 2;
}

export function getInventoryWeight(
  items: { weight: number }[]
): number {
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

/**
 * Adiciona fragmentos a um elemento, subindo de nÃ­vel automaticamente
 * enquanto houver fragmentos suficientes e o nÃ­vel total nÃ£o ultrapassar 20.
 * Excedente Ã© mantido quando sobe de nÃ­vel.
 */
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

export function getDominantElements(
  elements: CharacterElementRow[],
  count = 2
): CharacterElementRow[] {
  return [...elements]
    .filter((el) => el.level > 0)
    .sort((a, b) => b.level - a.level || b.fragments_current - a.fragments_current)
    .slice(0, count);
}

