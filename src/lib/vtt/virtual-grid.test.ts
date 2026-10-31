import { describe, expect, it } from 'vitest';
import { variableRange, visibleRange } from './virtual-grid';

const base = { rowHeight: 100, columns: 2, viewportHeight: 300, total: 1000 };

describe('visibleRange', () => {
  it('no topo renderiza só as linhas visíveis mais a folga', () => {
    expect(visibleRange({ ...base, scrollTop: 0 })).toEqual({
      start: 0,
      end: 8,
      startRow: 0,
      totalHeight: 50000,
    });
  });

  it('no meio começa antes da primeira linha visível', () => {
    const range = visibleRange({ ...base, scrollTop: 1000 });
    expect(range.startRow).toBe(9);
    expect(range.start).toBe(18);
    expect(range.end).toBe(28);
  });

  it('no fim não passa do total, mesmo com linha incompleta', () => {
    const range = visibleRange({ ...base, total: 5, scrollTop: 0 });
    expect(range.end).toBe(5);
    expect(range.totalHeight).toBe(300);
  });

  it('lista encolhida com scroll antigo não gera faixa inválida', () => {
    const range = visibleRange({ ...base, total: 2, scrollTop: 5000 });
    expect(range.start).toBeLessThanOrEqual(range.end);
    expect(range.end).toBeLessThanOrEqual(2);
  });

  it('lista vazia', () => {
    const range = visibleRange({ ...base, total: 0, scrollTop: 0 });
    expect(range).toEqual({ start: 0, end: 0, startRow: 0, totalHeight: 0 });
  });
});

describe('variableRange', () => {
  const heights = [10, 20, 30, 40, 50];

  it('corta o que está fora e soma o espaço', () => {
    const r = variableRange({ heights, scrollTop: 35, viewportHeight: 30, overscan: 0 });
    expect([r.start, r.end]).toEqual([2, 4]);
    expect(r.paddingTop).toBe(30);
    expect(r.paddingBottom).toBe(50);
    expect(r.totalHeight).toBe(150);
  });

  it('lista vazia e rolagem além do fim', () => {
    expect(variableRange({ heights: [], scrollTop: 0, viewportHeight: 100 }).end).toBe(0);
    const r = variableRange({ heights, scrollTop: 9999, viewportHeight: 10, overscan: 0 });
    expect([r.start, r.end]).toEqual([4, 5]);
  });

  it('padding + linhas = altura total', () => {
    const r = variableRange({ heights, scrollTop: 60, viewportHeight: 40, overscan: 1 });
    const rendered = heights.slice(r.start, r.end).reduce((a, b) => a + b, 0);
    expect(r.paddingTop + rendered + r.paddingBottom).toBe(r.totalHeight);
  });
});
