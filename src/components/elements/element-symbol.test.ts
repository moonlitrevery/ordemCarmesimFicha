import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ALL_ELEMENTS, ELEMENT_COLORS } from '@/lib/constants';
import { ElementSymbol, glowFilter } from './ElementSymbol';
import type { ElementType } from '@/types/database';

const OUT_DIR = path.resolve(__dirname, '../../../public/simbolos');

/** O SVG solto de `public/simbolos/`: mesmo desenho, cor fixa, fundo transparente. */
function standaloneSvg(element: ElementType): string {
  const markup = renderToStaticMarkup(
    createElement(ElementSymbol, { element, size: 256 })
  );
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    markup
      .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
      .replace(/ class="[^"]*"/, '')
      .replace(/ style="[^"]*"/, '')
      .replace(/ role="img"/, '')
      .replace(/currentColor/g, ELEMENT_COLORS[element]) +
    '\n'
  );
}

describe('ElementSymbol', () => {
  it('desenha os 11 elementos', () => {
    for (const el of ALL_ELEMENTS) {
      const markup = renderToStaticMarkup(createElement(ElementSymbol, { element: el }));
      expect(markup).toMatch(/^<svg [^>]*viewBox="0 0 100 100"/);
      expect(markup).toContain('aria-label=');
    }
  });

  it('decorativo some do leitor de tela', () => {
    const markup = renderToStaticMarkup(
      createElement(ElementSymbol, { element: 'fogo', decorative: true })
    );
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain('<title>');
  });

  it('cores escuras ganham halo claro', () => {
    for (const el of ['sombra', 'sangue', 'agua', 'terra'] as const) {
      expect(glowFilter(el)).toContain('rgba(255,255,255');
    }
    expect(glowFilter('fogo')).not.toContain('rgba(255,255,255');
  });

  // UPDATE_SYMBOLS=1 npm test regrava os arquivos.
  it('public/simbolos está igual ao componente', () => {
    if (process.env.UPDATE_SYMBOLS) mkdirSync(OUT_DIR, { recursive: true });
    for (const el of ALL_ELEMENTS) {
      const file = path.join(OUT_DIR, el + '.svg');
      const expected = standaloneSvg(el);
      if (process.env.UPDATE_SYMBOLS) writeFileSync(file, expected);
      expect(readFileSync(file, 'utf8')).toBe(expected);
    }
  });
});
