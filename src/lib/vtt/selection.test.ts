import { describe, expect, it } from 'vitest';
import {
  arrowDirection,
  boxFrom,
  groupConditionTarget,
  limitSelection,
  MAX_SELECTION,
  mergeSelection,
  nudgeStep,
  polygonTouchesBox,
  selectionLimitMessage,
  selectionRoots,
  toggleInSelection,
} from './selection';

const square = (cx: number, cy: number, half: number) => [
  { x: cx - half, y: cy - half },
  { x: cx + half, y: cy - half },
  { x: cx + half, y: cy + half },
  { x: cx - half, y: cy + half },
];

/** Losango: o quadrado girado 45°. */
const diamond = (cx: number, cy: number, r: number) => [
  { x: cx, y: cy - r },
  { x: cx + r, y: cy },
  { x: cx, y: cy + r },
  { x: cx - r, y: cy },
];

describe('caixa de seleção', () => {
  it('boxFrom normaliza os cantos', () => {
    expect(boxFrom({ x: 10, y: 0 }, { x: 0, y: 5 })).toEqual({ x0: 0, y0: 0, x1: 10, y1: 5 });
  });

  it('encostar basta; longe não entra', () => {
    const box = boxFrom({ x: 0, y: 0 }, { x: 10, y: 10 });
    expect(polygonTouchesBox(square(5, 5, 1), box)).toBe(true); // dentro
    expect(polygonTouchesBox(square(11, 5, 2), box)).toBe(true); // encostando
    expect(polygonTouchesBox(square(20, 20, 2), box)).toBe(false);
  });

  it('objeto girado: o canto vazio do retângulo envolvente não conta', () => {
    const box = boxFrom({ x: 0, y: 0 }, { x: 2, y: 2 });
    // Losango centrado em (4,4), raio 3: o retângulo envolvente cobre a caixa, o losango não.
    expect(polygonTouchesBox(diamond(4, 4, 3), box)).toBe(false);
    expect(polygonTouchesBox(diamond(4, 4, 5), box)).toBe(true);
  });

  it('caixa dentro do objeto também conta', () => {
    expect(polygonTouchesBox(square(0, 0, 100), boxFrom({ x: -1, y: -1 }, { x: 1, y: 1 }))).toBe(true);
  });
});

describe('seleção', () => {
  it('toggle e merge', () => {
    expect(toggleInSelection(['a', 'b'], 'a')).toEqual(['b']);
    expect(toggleInSelection(['a'], 'b')).toEqual(['a', 'b']);
    expect(mergeSelection(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('limite de 50 avisa quantos havia', () => {
    const ids = Array.from({ length: 60 }, (_, i) => String(i));
    const limited = limitSelection(ids);
    expect(limited.ids).toHaveLength(MAX_SELECTION);
    expect(limited).toMatchObject({ total: 60, truncated: true });
    expect(limitSelection(['a']).truncated).toBe(false);
    expect(selectionLimitMessage(60)).toBe('Seleção limitada a 50 objetos (havia 60).');
  });

  it('anexado a outro selecionado não se move sozinho', () => {
    const parents: Record<string, string | null> = { espada: 'mao', mao: 'heroi', heroi: null, outro: null };
    const parentOf = (id: string) => parents[id] ?? null;
    expect(selectionRoots(['heroi', 'espada', 'outro'], parentOf)).toEqual(['heroi', 'outro']);
    expect(selectionRoots(['espada'], parentOf)).toEqual(['espada']);
  });

  it('ciclo de anexo não trava', () => {
    const parents: Record<string, string> = { a: 'b', b: 'a' };
    expect(selectionRoots(['a'], (id) => parents[id] ?? null)).toEqual(['a']);
  });
});

describe('teclado e condições', () => {
  it('setinhas: 1 quadrado calibrado, 10 px de tela sem régua, Shift fino', () => {
    expect(nudgeStep(1.5 / 64, 2, false)).toBeCloseTo(64);
    expect(nudgeStep(null, 2, false)).toBe(5);
    expect(nudgeStep(1.5 / 64, 2, true)).toBe(1);
    expect(arrowDirection('ArrowUp')).toEqual({ x: 0, y: -1 });
    expect(arrowDirection('a')).toBeNull();
  });

  it('condição em grupo', () => {
    expect(groupConditionTarget([['caido'], []], 'caido')).toBe(true);
    expect(groupConditionTarget([['caido'], ['caido']], 'caido')).toBe(false);
  });
});
