import { describe, expect, it } from 'vitest';
import { visibleRange } from './virtual-grid';

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
