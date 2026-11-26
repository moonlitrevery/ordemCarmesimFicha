import { describe, expect, it } from 'vitest';
import { safeNextPath } from './safe-redirect';

describe('safeNextPath', () => {
  it('mantém caminho interno com busca e âncora', () => {
    expect(safeNextPath('/mesa/abc?x=1#y')).toBe('/mesa/abc?x=1#y');
    expect(safeNextPath('/vm')).toBe('/vm');
  });

  it('cai em /fichas sem destino', () => {
    expect(safeNextPath(null)).toBe('/fichas');
    expect(safeNextPath('')).toBe('/fichas');
  });

  it('recusa outra origem e esquemas perigosos', () => {
    for (const next of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      '/\t/evil.example',
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,x',
      ' /fichas',
      'fichas',
    ]) {
      expect(safeNextPath(next)).toBe('/fichas');
    }
  });
});
