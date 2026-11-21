import { describe, expect, it } from 'vitest';
import {
  boxRevealed,
  createMask,
  decodeMask,
  encodeMask,
  fillPolygon,
  fillRect,
  fogDims,
  paintAlpha,
  payloadToRegion,
  readRegion,
  regionToPayload,
  stampCircle,
  stampSegment,
  unionRect,
  writeRegion,
} from './mask';

function revealedCount(cells: Uint8Array): number {
  return cells.reduce((sum, value) => sum + value, 0);
}

describe('dimensões', () => {
  it('1/8 do mapa, arredondando para cima e com teto', () => {
    expect(fogDims(4096, 2309)).toEqual({ w: 512, h: 289 });
    expect(fogDims(2000, 2000)).toEqual({ w: 250, h: 250 });
    expect(fogDims(1, 1)).toEqual({ w: 1, h: 1 });
    expect(fogDims(100_000, 10)).toEqual({ w: 1024, h: 2 });
  });
});

describe('codificar', () => {
  it('ida e volta mantém cada célula', () => {
    const mask = createMask(13, 7);
    fillRect(mask, 2, 1, 9, 5, 1);
    mask.cells[13 * 7 - 1] = 1;
    const record = encodeMask(mask);
    expect(record.v).toBe(1);
    // ceil(91 / 8) = 12 bytes → 16 caracteres de base64.
    expect(record.bits).toHaveLength(16);
    const back = decodeMask(record);
    expect(back?.w).toBe(13);
    expect(Array.from(back?.cells ?? [])).toEqual(Array.from(mask.cells));
  });

  it('formato errado vira "sem névoa"', () => {
    expect(decodeMask(null)).toBeNull();
    expect(decodeMask({ v: 2, w: 1, h: 1, bits: 'AA==' })).toBeNull();
    expect(decodeMask({ v: 1, w: 0, h: 1, bits: 'AA==' })).toBeNull();
    expect(decodeMask({ v: 1, w: 2000, h: 1, bits: 'AA==' })).toBeNull();
    expect(decodeMask({ v: 1, w: 100, h: 100, bits: 'AA==' })).toBeNull();
    expect(decodeMask({ v: 1, w: 4, h: 2, bits: '%%%' })).toBeNull();
  });
});

describe('pincel', () => {
  it('círculo revela e devolve só o retângulo mudado', () => {
    const mask = createMask(20, 20);
    const rect = stampCircle(mask, 10, 10, 3, 1);
    expect(rect).not.toBeNull();
    expect(mask.cells[10 * 20 + 10]).toBe(1);
    expect(mask.cells[0]).toBe(0);
    expect(rect!.x).toBeGreaterThanOrEqual(7);
    expect(rect!.x + rect!.w).toBeLessThanOrEqual(14);
    // Carimbar de novo no mesmo lugar não muda nada.
    expect(stampCircle(mask, 10, 10, 3, 1)).toBeNull();
  });

  it('pincel minúsculo pega ao menos a célula do ponto', () => {
    const mask = createMask(4, 4);
    stampCircle(mask, 1.5, 1.5, 0.1, 1);
    expect(revealedCount(mask.cells)).toBe(1);
  });

  it('traço rápido não deixa buraco entre os pontos', () => {
    const mask = createMask(100, 10);
    stampSegment(mask, 2, 5, 97, 5, 2, 1);
    for (let x = 2; x < 97; x++) expect(mask.cells[5 * 100 + x]).toBe(1);
  });

  it('cobrir apaga o que estava revelado', () => {
    const mask = createMask(10, 10, true);
    stampCircle(mask, 5, 5, 2, 0);
    expect(mask.cells[5 * 10 + 5]).toBe(0);
    expect(mask.cells[0]).toBe(1);
  });

  it('fora da máscara não quebra nem muda nada', () => {
    const mask = createMask(10, 10);
    expect(stampCircle(mask, -50, -50, 3, 1)).toBeNull();
    expect(revealedCount(mask.cells)).toBe(0);
  });
});

describe('retângulo e polígono', () => {
  it('retângulo em qualquer direção, recortado na borda', () => {
    const mask = createMask(10, 10);
    expect(fillRect(mask, 8, 8, 3, 2, 1)).toEqual({ x: 3, y: 2, w: 5, h: 6 });
    expect(revealedCount(mask.cells)).toBe(30);
    const edge = createMask(10, 10);
    expect(fillRect(edge, -5, -5, 2, 2, 1)).toEqual({ x: 0, y: 0, w: 2, h: 2 });
  });

  it('triângulo (parede diagonal) pega só o lado de dentro', () => {
    const mask = createMask(10, 10);
    fillPolygon(
      mask,
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 10 },
      ],
      1
    );
    expect(mask.cells[0]).toBe(1);
    expect(mask.cells[9 * 10 + 9]).toBe(0);
    // Metade, mais ou menos: a diagonal corta as células do meio.
    const count = revealedCount(mask.cells);
    expect(count).toBeGreaterThan(40);
    expect(count).toBeLessThan(60);
  });

  it('polígono com menos de 3 pontos não faz nada', () => {
    const mask = createMask(5, 5);
    expect(fillPolygon(mask, [{ x: 0, y: 0 }, { x: 4, y: 4 }], 1)).toBeNull();
  });

  it('quadrado alinhado à grade pega exatamente as células de dentro', () => {
    const mask = createMask(10, 10);
    fillPolygon(
      mask,
      [
        { x: 2, y: 2 },
        { x: 6, y: 2 },
        { x: 6, y: 5 },
        { x: 2, y: 5 },
      ],
      1
    );
    expect(revealedCount(mask.cells)).toBe(12);
  });
});

describe('recortes e rede', () => {
  it('ler e escrever um recorte desfaz o traço', () => {
    const mask = createMask(16, 16);
    const before = mask.cells.slice();
    const rect = fillRect(mask, 3, 3, 9, 7, 1)!;
    const after = readRegion(mask, rect);
    const old = readRegion({ ...mask, cells: before }, rect);
    expect(writeRegion(mask, old)).toBe(true);
    expect(revealedCount(mask.cells)).toBe(0);
    expect(writeRegion(mask, after)).toBe(true);
    expect(revealedCount(mask.cells)).toBe(24);
    expect(writeRegion(mask, after)).toBe(false);
  });

  it('recorte transmitido volta igual, e o malformado é recusado', () => {
    const mask = createMask(32, 32);
    const rect = stampCircle(mask, 10, 10, 4, 1)!;
    const payload = regionToPayload(readRegion(mask, rect));
    const region = payloadToRegion(mask, payload);
    expect(region).not.toBeNull();
    const other = createMask(32, 32);
    writeRegion(other, region!);
    expect(Array.from(other.cells)).toEqual(Array.from(mask.cells));

    expect(payloadToRegion(mask, { ...payload, x: 30 })).toBeNull();
    expect(payloadToRegion(mask, { ...payload, w: 1.5 })).toBeNull();
    expect(payloadToRegion(mask, { ...payload, bits: 'AA==' })).toBeNull();
    expect(payloadToRegion(mask, 'oi')).toBeNull();
    expect(payloadToRegion(createMask(4, 4), payload)).toBeNull();
  });

  it('união de retângulos', () => {
    expect(unionRect(null, { x: 1, y: 1, w: 1, h: 1 })).toEqual({ x: 1, y: 1, w: 1, h: 1 });
    expect(unionRect({ x: 0, y: 0, w: 2, h: 2 }, { x: 5, y: 1, w: 1, h: 4 })).toEqual({ x: 0, y: 0, w: 6, h: 5 });
  });
});

describe('escondido sob a névoa', () => {
  it('basta uma célula revelada na caixa', () => {
    const mask = createMask(20, 20);
    expect(boxRevealed(mask, 2, 2, 8, 8)).toBe(false);
    mask.cells[7 * 20 + 7] = 1;
    expect(boxRevealed(mask, 2, 2, 8, 8)).toBe(true);
    expect(boxRevealed(mask, 2, 2, 7, 7)).toBe(false);
  });

  it('fora do mapa conta como coberto', () => {
    const mask = createMask(10, 10, true);
    expect(boxRevealed(mask, -20, -20, -5, -5)).toBe(false);
    expect(boxRevealed(mask, -5, -5, 1, 1)).toBe(true);
  });
});

describe('alpha da textura', () => {
  it('duro: 255 coberto, 0 revelado', () => {
    const mask = createMask(3, 1);
    mask.cells[1] = 1;
    const out = new Uint8ClampedArray(3 * 4);
    paintAlpha(mask, { x: 0, y: 0, w: 3, h: 1 }, out, false);
    expect([out[3], out[7], out[11]]).toEqual([255, 0, 255]);
  });

  it('macio: a borda fica no meio-termo', () => {
    const mask = createMask(5, 5, true);
    mask.cells[2 * 5 + 2] = 0;
    const out = new Uint8ClampedArray(5 * 5 * 4);
    paintAlpha(mask, { x: 0, y: 0, w: 5, h: 5 }, out, true);
    const alphaAt = (x: number, y: number) => out[(y * 5 + x) * 4 + 3];
    expect(alphaAt(2, 2)).toBe(Math.round(255 / 9));
    expect(alphaAt(1, 1)).toBe(Math.round(255 / 9));
    // Canto: 5 dos 9 vizinhos estão fora da máscara, e fora conta como coberto.
    expect(alphaAt(0, 0)).toBe(Math.round((255 * 5) / 9));
  });
});
