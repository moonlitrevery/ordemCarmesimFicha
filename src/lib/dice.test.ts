import { describe, expect, it } from 'vitest';
import {
  d20Outcome,
  singleDieOutcome,
  parseDiceExpression,
  parseDiceNotation,
  rollDice,
  rollDiceExpression,
} from './dice';

describe('parseDiceExpression', () => {
  it('lê os formatos da Tabela de Armas', () => {
    expect(parseDiceExpression('2d6+1d4')).toEqual({
      groups: [
        { count: 2, sides: 6 },
        { count: 1, sides: 4 },
      ],
      modifier: 0,
    });
    expect(parseDiceExpression('3d6')?.groups).toEqual([{ count: 3, sides: 6 }]);
    expect(parseDiceExpression('4d6+10')).toEqual({
      groups: [{ count: 4, sides: 6 }],
      modifier: 10,
    });
    expect(parseDiceExpression('1d4+1')?.modifier).toBe(1);
  });

  it('aceita d20, negativo, espaços e maiúscula', () => {
    expect(parseDiceExpression('d20')?.groups).toEqual([{ count: 1, sides: 20 }]);
    expect(parseDiceExpression('1d20-1')?.modifier).toBe(-1);
    expect(parseDiceExpression(' 2D6 + 3 ')?.modifier).toBe(3);
    expect(parseDiceExpression('2d6+1d4+3-1')?.modifier).toBe(2);
  });

  it('recusa o que não é rolagem', () => {
    for (const bad of [
      '',
      '3',
      'abc',
      '2d',
      '2d6+',
      '2d6++1',
      '2d6x',
      'x2d6',
      '1d20-1d4',
      '0d6',
      '1d1',
      '1d1001',
      '101d6',
      '60d6+60d6',
      '1d6+999999',
    ]) {
      expect(parseDiceExpression(bad), bad).toBeNull();
    }
  });
});

describe('rollDiceExpression', () => {
  it('devolve cada grupo, o modificador, o total e a conta', () => {
    const faces: Record<number, number[]> = { 6: [3, 5], 4: [2] };
    const roll = rollDiceExpression('2d6+1d4+3', (s) => faces[s].shift() as number);
    expect(roll).toEqual({
      notation: '2d6+1d4+3',
      groups: [
        { sides: 6, results: [3, 5] },
        { sides: 4, results: [2] },
      ],
      modifier: 3,
      total: 13,
      math: '3 + 5 + 2 + 3',
    });
  });

  it('modificador negativo e zero na conta', () => {
    expect(rollDiceExpression('1d20-1', () => 10)?.math).toBe('10 - 1');
    expect(rollDiceExpression('1d20+0', () => 10)?.math).toBe('10');
    expect(rollDiceExpression('1d20-1', () => 10)?.total).toBe(9);
  });

  it('fica dentro das faces', () => {
    for (let i = 0; i < 200; i++) {
      const die = rollDiceExpression('1d4')?.groups[0].results[0] as number;
      expect(die).toBeGreaterThanOrEqual(1);
      expect(die).toBeLessThanOrEqual(4);
    }
  });

  it('notação inválida vira null', () => {
    expect(rollDiceExpression('oi')).toBeNull();
  });
});

describe('d20Outcome', () => {
  it('só em um único d20', () => {
    expect(d20Outcome([{ sides: 20, results: [20] }])).toBe('critical');
    expect(d20Outcome([{ sides: 20, results: [1] }])).toBe('disaster');
    expect(d20Outcome([{ sides: 20, results: [7] }])).toBeNull();
    expect(d20Outcome([{ sides: 20, results: [20, 20] }])).toBeNull();
    expect(d20Outcome([{ sides: 6, results: [1] }])).toBeNull();
    expect(
      d20Outcome([
        { sides: 20, results: [20] },
        { sides: 4, results: [1] },
      ])
    ).toBeNull();
  });
});

describe('API antiga', () => {
  it('continua igual', () => {
    expect(parseDiceNotation('2d6+3')).toEqual({ count: 2, sides: 6, modifier: 3 });
    expect(parseDiceNotation('2d6+1d4')).toBeNull();
    expect(rollDice('1d6')?.dice).toHaveLength(1);
  });
});

describe('singleDieOutcome (destaque no chat)', () => {
  it('máximo de qualquer dado é crítico; 1 é falha', () => {
    expect(singleDieOutcome([{ sides: 20, results: [20] }])).toBe('critical');
    expect(singleDieOutcome([{ sides: 6, results: [6] }])).toBe('critical');
    expect(singleDieOutcome([{ sides: 100, results: [1] }])).toBe('disaster');
    expect(singleDieOutcome([{ sides: 8, results: [5] }])).toBeNull();
  });

  it('mais de um dado não destaca', () => {
    expect(singleDieOutcome([{ sides: 6, results: [6, 6] }])).toBeNull();
    expect(singleDieOutcome([{ sides: 20, results: [20] }, { sides: 4, results: [4] }])).toBeNull();
  });
});
