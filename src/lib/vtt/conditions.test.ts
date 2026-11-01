import { describe, expect, it } from 'vitest';
import {
  conditionsForKind,
  conditionArc,
  customCondition,
  isValidConditionList,
  MAX_CUSTOM_CONDITION_LENGTH,
  resolveCondition,
  resolveConditions,
  sanitizeEmoji,
  splitVisibleConditions,
  STANDARD_CONDITIONS,
  toggleCondition,
} from './conditions';

describe('conditionsForKind', () => {
  it('addon só tem Arma travada, adereço nada, token tudo', () => {
    expect(conditionsForKind('addon').map((item) => item.id)).toEqual(['arma-travada']);
    expect(conditionsForKind('adereco')).toEqual([]);
    expect(conditionsForKind('token')).toEqual(STANDARD_CONDITIONS);
  });
});

describe('lista padrão', () => {
  it('tem as 11 condições das regras, cada uma com ícone', () => {
    expect(STANDARD_CONDITIONS.map((c) => c.label)).toEqual([
      'Queimando',
      'Envenenado',
      'Atordoado',
      'Sangrando',
      'Cegueira parcial',
      'Movimento dificultado',
      'Confuso',
      'Com medo',
      'Alucinando',
      'Arma travada',
      'Na fumaça',
    ]);
    STANDARD_CONDITIONS.forEach((c) => expect(c.path).toMatch(/^M/));
  });

  it('o nome mostrado leva o efeito', () => {
    expect(resolveCondition('atordoado')?.label).toBe(
      'Atordoado (perde o próximo turno)'
    );
    expect(resolveCondition('na-fumaca')?.label).toBe('Na fumaça (desvantagem)');
  });
});

describe('personalizada', () => {
  it('ida e volta com emoji e texto que tem dois-pontos', () => {
    const key = customCondition('  Marca: lua ', '🌑');
    expect(key).not.toBeNull();
    expect(resolveCondition(key as string)).toEqual({
      key,
      label: 'Marca: lua',
      emoji: '🌑',
    });
  });

  it('emoji composto conta como um só', () => {
    expect(sanitizeEmoji('👁️ abc')).toBe('👁️');
    expect(sanitizeEmoji('🧑‍🚀🔥')).toBe('🧑‍🚀');
  });

  it('recusa sem texto ou sem emoji', () => {
    expect(customCondition('   ', '🔥')).toBeNull();
    expect(customCondition('Marca', 'abc')).toBeNull();
    expect(customCondition('Marca', '')).toBeNull();
  });

  it('corta o texto no limite', () => {
    const key = customCondition('x'.repeat(100), '🔥') as string;
    expect(resolveCondition(key)?.label).toHaveLength(MAX_CUSTOM_CONDITION_LENGTH);
  });
});

describe('o que vem da coluna', () => {
  it('ignora o que não reconhece', () => {
    expect(resolveCondition('ferido')).toBeNull();
    expect(resolveCondition('custom:semdoispontos')).toBeNull();
    expect(resolveCondition('custom:abc:texto')).toBeNull();
    expect(resolveConditions(['ferido', 'confuso']).map((c) => c.key)).toEqual([
      'confuso',
    ]);
  });

  it('valida a lista que chega pelo canal', () => {
    expect(isValidConditionList(['confuso'])).toBe(true);
    expect(isValidConditionList(undefined)).toBe(false);
    expect(isValidConditionList([1])).toBe(false);
    expect(isValidConditionList(Array(41).fill('a'))).toBe(false);
    expect(isValidConditionList(['x'.repeat(121)])).toBe(false);
  });

  it('liga e desliga', () => {
    expect(toggleCondition(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleCondition(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('arco', () => {
  it('mostra 6 e guarda o resto para o +N', () => {
    const eight = STANDARD_CONDITIONS.slice(0, 8).map((c) => ({
      key: c.id,
      label: c.label,
    }));
    const { visible, overflow } = splitVisibleConditions(eight);
    expect(visible).toHaveLength(6);
    expect(overflow).toEqual([eight[6], eight[7]]);
  });

  it('um ícone fica bem em cima', () => {
    const [only] = conditionArc(1, 50, 24);
    expect(only.x).toBeCloseTo(0);
    expect(only.y).toBeCloseTo(-50);
  });

  it('é simétrico e ninguém desce abaixo do centro', () => {
    const points = conditionArc(7, 10, 24);
    expect(points[0].x).toBeCloseTo(-points[6].x);
    expect(points[0].y).toBeCloseTo(points[6].y);
    points.forEach((point) => expect(point.y).toBeLessThan(0));
  });

  it('em token pequeno o raio cresce e os ícones não se cobrem', () => {
    const points = conditionArc(7, 4, 24);
    for (let i = 1; i < points.length; i++) {
      const gap = Math.hypot(
        points[i].x - points[i - 1].x,
        points[i].y - points[i - 1].y
      );
      expect(gap).toBeGreaterThan(22);
    }
  });

  it('sem condição, sem ponto', () => {
    expect(conditionArc(0, 50, 24)).toEqual([]);
  });
});
