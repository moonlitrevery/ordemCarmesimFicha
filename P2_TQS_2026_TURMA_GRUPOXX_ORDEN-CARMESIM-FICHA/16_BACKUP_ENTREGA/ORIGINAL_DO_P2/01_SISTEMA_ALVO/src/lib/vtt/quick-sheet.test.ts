import { describe, expect, it } from 'vitest';
import { getSkillRollModifier, getSkillTotal } from '../calculations';
import { DEFAULT_ATTRIBUTES, type Skill } from '@/types/database';
import {
  attributeBonus,
  clampResource,
  d20Notation,
  skillBonus,
  skillRollLabel,
  sortSkills,
} from './quick-sheet';

const attributes = { ...DEFAULT_ATTRIBUTES, DES: 16, FOR: 8 };
const skill: Skill = { name: 'Furtividade', attribute: 'DES', specialization: 'basico' };

describe('rolagens da Ficha Rápida', () => {
  it('perícia dá o mesmo valor da ficha', () => {
    expect(skillBonus(skill, attributes)).toBe(
      getSkillRollModifier(getSkillTotal(skill, attributes))
    );
  });

  it('trocar o atributo muda a conta e não a perícia', () => {
    const swapped = skillBonus(skill, attributes, 'FOR');
    expect(swapped).toBe(
      getSkillRollModifier(getSkillTotal({ ...skill, attribute: 'FOR' }, attributes))
    );
    expect(swapped).not.toBe(skillBonus(skill, attributes));
    expect(skill.attribute).toBe('DES');
  });

  it('rótulo mostra o atributo só quando foi trocado', () => {
    expect(skillRollLabel(skill, 'DES')).toBe('Furtividade');
    expect(skillRollLabel(skill, 'FOR')).toBe('Furtividade (FOR)');
  });

  it('notação com bônus positivo, zero e negativo', () => {
    expect(d20Notation(2)).toBe('1d20+2');
    expect(d20Notation(0)).toBe('1d20+0');
    expect(d20Notation(-1)).toBe('1d20-1');
    expect(attributeBonus(attributes, 'DES')).toBeGreaterThan(0);
  });

  it('perícias em ordem alfabética com acento, sem mexer na lista', () => {
    const list: Skill[] = [
      { ...skill, name: 'Ótica' },
      { ...skill, name: 'Zoologia' },
      { ...skill, name: 'Atletismo' },
    ];
    expect(sortSkills(list).map((s) => s.name)).toEqual([
      'Atletismo',
      'Ótica',
      'Zoologia',
    ]);
    expect(list[0].name).toBe('Ótica');
  });
});

describe('clampResource', () => {
  it('fica entre 0 e o máximo', () => {
    expect(clampResource(-3, 10)).toBe(0);
    expect(clampResource(99, 10)).toBe(10);
    expect(clampResource(4.7, 10)).toBe(4);
    expect(clampResource(Number.NaN, 10)).toBe(0);
  });
});
