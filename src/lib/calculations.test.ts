import { describe, expect, it } from 'vitest';
import { computeDerivedMaxes, getInventoryWeight, getMaxHp } from '@/lib/calculations';
import { DEFAULT_ATTRIBUTES } from '@/types/database';

/** HP = round(10 + floor(CON/2) + nível × (0.6 + 0.4 × CON)) */
describe('getMaxHp', () => {
  const cases: [con: number, level: number, expected: number][] = [
    [1, 1, 11],
    [1, 20, 30],
    [5, 3, 20],
    [10, 1, 20],
    [10, 3, 29],
    [10, 20, 107],
    [12, 3, 32],
    [15, 10, 83],
    [20, 1, 29],
    [20, 20, 192],
  ];

  for (const [con, level, expected] of cases) {
    it(`CON ${con} no nível ${level} → ${expected} HP`, () => {
      expect(getMaxHp(level, con)).toBe(expected);
    });
  }

  it('nunca desce abaixo de 1', () => {
    expect(getMaxHp(0, 0)).toBeGreaterThanOrEqual(1);
  });

  it('trava o nível no máximo do sistema (20)', () => {
    expect(getMaxHp(25, 10)).toBe(getMaxHp(20, 10));
  });

  it('ganho por nível vai de 1 HP (CON 1) a 8,6 HP (CON 20)', () => {
    expect(getMaxHp(2, 1) - getMaxHp(1, 1)).toBe(1);
    expect(getMaxHp(10, 20) - getMaxHp(9, 20)).toBe(9); // 8,6 arredondado
    expect(getMaxHp(20, 20) - getMaxHp(10, 20)).toBe(86);
  });
});

describe('computeDerivedMaxes', () => {
  it('usa getMaxHp como fonte única do HP máximo', () => {
    const attributes = { ...DEFAULT_ATTRIBUTES, CON: 15 };
    expect(computeDerivedMaxes(10, attributes).hpMax).toBe(getMaxHp(10, 15));
  });
});

describe('getInventoryWeight', () => {
  it('peso × quantidade, e item de peso negativo desconta', () => {
    expect(
      getInventoryWeight([
        { weight: 1.5, qty: 2 },
        { weight: 4 },
        { weight: -2 },
      ])
    ).toBe(5);
  });

  it('nunca fica abaixo de 0', () => {
    expect(getInventoryWeight([{ weight: -2 }, { weight: 1 }])).toBe(0);
  });
});
