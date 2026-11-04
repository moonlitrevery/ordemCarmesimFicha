import { describe, expect, it } from 'vitest';
import { parseDiceExpression } from '../dice';
import { CREATURE_TIERS, xpForNd } from './creature-tiers';
import {
  buildNpcFromTier,
  clampHp,
  clampNd,
  damageNotation,
  retuneAttacks,
  xPerTurn,
} from './npc-rules';

function tier(id: string) {
  const found = CREATURE_TIERS.find((t) => t.id === id);
  if (!found) throw new Error(id);
  return found;
}

describe('buildNpcFromTier', () => {
  it('Caranguejo: Purgatório/Antepurgatório ND 3', () => {
    const npc = buildNpcFromTier(tier('ante'), 3);
    expect(npc.hp_max).toBe(15);
    expect(npc.hp_current).toBe(15);
    expect(npc.attack_slots).toEqual([{ name: 'Ataque', damage: 'd6+1' }]);
    expect(npc.turns).toBe(1);
    expect(npc.xp).toBe(12);
    expect(npc.attributes).toEqual([12, 12, 10, 10, 8, 8, 6]);
  });

  it('Aberração Anciã: Tártaro/Judeca ND 40', () => {
    const npc = buildNpcFromTier(tier('judeca'), 40);
    expect(npc.hp_max).toBe(320);
    expect(npc.x_bonus).toBe(13);
    expect(npc.attack_slots).toHaveLength(5);
    expect(npc.attack_slots[4].damage).toBe('d12+13');
    expect(npc.turns).toBe(2);
    expect(npc.xp).toBe(240);
  });

  it('sem X: Tártaro 9º e Celestial Intermediário', () => {
    expect(buildNpcFromTier(tier('t9'), 2).attack_slots[0].damage).toBe('d6');
    const middle = buildNpcFromTier(tier('intermediario'), 65);
    expect(middle.x_bonus).toBe(0);
    expect(middle.attack_slots[0].damage).toBe('d20');
  });

  it('Celestiais com X igual ao ND', () => {
    expect(buildNpcFromTier(tier('inferior'), 55).x_bonus).toBe(55);
    expect(buildNpcFromTier(tier('superior'), 80).attack_slots).toHaveLength(7);
  });

  it('X do plano arredonda para o inteiro mais próximo', () => {
    expect(buildNpcFromTier(tier('hilico'), 2).x_bonus).toBe(0);
    expect(buildNpcFromTier(tier('hilico'), 3).x_bonus).toBe(1);
    expect(buildNpcFromTier(tier('t8'), 5).x_bonus).toBe(2);
  });

  it('ND fora da faixa do patamar volta para dentro', () => {
    expect(buildNpcFromTier(tier('t9'), 99).nd).toBe(3);
    expect(clampNd(tier('judeca'), 1)).toBe(36);
    expect(clampNd(tier('judeca'), Number.NaN)).toBe(36);
  });

  it('não compartilha os atributos com a tabela', () => {
    buildNpcFromTier(tier('ante'), 1).attributes[0] = 99;
    expect(tier('ante').attributes[0]).toBe(12);
  });

  it('toda linha da tabela gera dano que o rolador entende', () => {
    for (const row of CREATURE_TIERS) {
      expect(row.attributes).toHaveLength(7);
      expect(row.ndMin).toBeLessThanOrEqual(row.ndMax);
      for (const nd of [row.ndMin, row.ndMax]) {
        const npc = buildNpcFromTier(row, nd);
        expect(npc.attack_slots).toHaveLength(row.attacks);
        expect(parseDiceExpression(npc.attack_slots[0].damage)).not.toBeNull();
      }
    }
  });
});

describe('xpForNd', () => {
  it('muda de faixa em 15 e 27', () => {
    expect(xpForNd(14)).toBe(56);
    expect(xpForNd(15)).toBe(75);
    expect(xpForNd(26)).toBe(130);
    expect(xpForNd(27)).toBe(162);
  });
});

describe('ajustes', () => {
  it('X por turno divide o X da rodada', () => {
    expect(xPerTurn(13, 2)).toBe(6.5);
    expect(xPerTurn(9, 1)).toBe(9);
    expect(xPerTurn(10, 3)).toBe(3.3);
  });

  it('X negativo e zero viram notação válida', () => {
    expect(damageNotation('d6', 0)).toBe('d6');
    expect(damageNotation('d6', -2)).toBe('d6-2');
    expect(parseDiceExpression('d6-2')).not.toBeNull();
  });

  it('HP fica entre 0 e o máximo', () => {
    expect(clampHp(-3, 10)).toBe(0);
    expect(clampHp(12, 10)).toBe(10);
    expect(clampHp(7, 10)).toBe(7);
  });

  it('retuneAttacks não mexe em dano escrito à mão', () => {
    const slots = retuneAttacks(
      {
        damage_die: 'd6',
        x_bonus: 1,
        attack_slots: [
          { name: 'Garra', damage: 'd6+1' },
          { name: 'Veneno', damage: '2d4' },
        ],
      },
      'd8',
      3
    );
    expect(slots).toEqual([
      { name: 'Garra', damage: 'd8+3' },
      { name: 'Veneno', damage: '2d4' },
    ]);
  });
});
