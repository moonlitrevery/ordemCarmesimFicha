import {
  formatModifier,
  getAttributeModifier,
  getSkillRollModifier,
  getSkillTotal,
} from '../calculations';
import type { Attributes, Skill } from '@/types/database';

/** Mesmo sorteio da ficha: 1d20 + modificador. */
export function d20Notation(bonus: number): string {
  return `1d20${formatModifier(bonus)}`;
}

export function attributeBonus(attributes: Attributes, key: keyof Attributes): number {
  return getAttributeModifier(attributes[key]);
}

/** `attribute` troca só o cálculo desta rolagem; a perícia da ficha não muda. */
export function skillBonus(
  skill: Skill,
  attributes: Attributes,
  attribute: keyof Attributes = skill.attribute
): number {
  return getSkillRollModifier(getSkillTotal({ ...skill, attribute }, attributes));
}

export function skillRollLabel(skill: Skill, attribute: keyof Attributes): string {
  return attribute === skill.attribute ? skill.name : `${skill.name} (${attribute})`;
}

export function sortSkills(skills: Skill[]): Skill[] {
  return skills.slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/** Valor digitado ou somado, sempre dentro de 0 e o máximo. */
export function clampResource(value: number, max: number): number {
  return Math.max(0, Math.min(max, Math.trunc(value) || 0));
}
