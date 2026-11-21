/**
 * Névoa de guerra (Fase 11): uma grade de baixa resolução sobre o mapa, uma célula
 * a cada `FOG_CELL_PX` pixels da imagem. 1 = revelado, 0 = coberto. No banco vai
 * como 1 bit por célula em base64 (`scenes.fog`); na memória, um byte por célula,
 * mutável, para o pincel não alocar nada por movimento.
 */

export const FOG_CELL_PX = 8;
export const FOG_MAX_SIDE = 1024;

export interface FogMask {
  w: number;
  h: number;
  cells: Uint8Array;
}

/** O que fica em `scenes.fog`. */
export interface FogRecord {
  v: 1;
  w: number;
  h: number;
  bits: string;
}

/** Retângulo de células, fim exclusivo. */
export interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Recorte de uma máscara: o que um traço mudou, para desfazer e transmitir. */
export interface FogRegion extends CellRect {
  cells: Uint8Array;
}

export type FogMode = 'reveal' | 'cover';
export type FogShape = 'brush' | 'rect' | 'poly';

export function fogDims(mapWidth: number, mapHeight: number): { w: number; h: number } {
  const side = (value: number) =>
    Math.min(FOG_MAX_SIDE, Math.max(1, Math.ceil(value / FOG_CELL_PX)));
  return { w: side(mapWidth), h: side(mapHeight) };
}

export function createMask(w: number, h: number, revealed = false): FogMask {
  const cells = new Uint8Array(w * h);
  if (revealed) cells.fill(1);
  return { w, h, cells };
}

// ---------- Bits e base64 ----------

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array | null {
  try {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export function packBits(cells: Uint8Array): string {
  const bytes = new Uint8Array(Math.ceil(cells.length / 8));
  for (let i = 0; i < cells.length; i++) {
    if (cells[i]) bytes[i >> 3] |= 1 << (i & 7);
  }
  return toBase64(bytes);
}

/** `null` se o texto não tem o tamanho exato de `count` células. */
export function unpackBits(text: string, count: number): Uint8Array | null {
  const bytes = fromBase64(text);
  if (!bytes || bytes.length !== Math.ceil(count / 8)) return null;
  const cells = new Uint8Array(count);
  for (let i = 0; i < count; i++) cells[i] = (bytes[i >> 3] >> (i & 7)) & 1;
  return cells;
}

export function encodeMask(mask: FogMask): FogRecord {
  return { v: 1, w: mask.w, h: mask.h, bits: packBits(mask.cells) };
}

function isSide(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= FOG_MAX_SIDE;
}

/** Do banco: qualquer coisa fora do formato é "sem névoa". */
export function decodeMask(raw: unknown): FogMask | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Partial<FogRecord>;
  if (record.v !== 1 || !isSide(record.w) || !isSide(record.h) || typeof record.bits !== 'string') {
    return null;
  }
  const cells = unpackBits(record.bits, record.w * record.h);
  return cells ? { w: record.w, h: record.h, cells } : null;
}

// ---------- Recortes ----------

export function clampRect(mask: FogMask, rect: CellRect): CellRect | null {
  const x0 = Math.max(0, rect.x);
  const y0 = Math.max(0, rect.y);
  const x1 = Math.min(mask.w, rect.x + rect.w);
  const y1 = Math.min(mask.h, rect.y + rect.h);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function unionRect(a: CellRect | null, b: CellRect | null): CellRect | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

export function readRegion(mask: FogMask, rect: CellRect): FogRegion {
  const cells = new Uint8Array(rect.w * rect.h);
  for (let row = 0; row < rect.h; row++) {
    const start = (rect.y + row) * mask.w + rect.x;
    cells.set(mask.cells.subarray(start, start + rect.w), row * rect.w);
  }
  return { ...rect, cells };
}

/** Recorte de uma cópia antiga das células (o "antes" de um traço). */
export function readRegionFrom(cells: Uint8Array, maskWidth: number, rect: CellRect): FogRegion {
  return readRegion({ w: maskWidth, h: 0, cells }, rect);
}

/** Escreve o recorte. Devolve se algo mudou. Recorte fora da máscara é ignorado. */
export function writeRegion(mask: FogMask, region: FogRegion): boolean {
  if (region.x < 0 || region.y < 0 || region.x + region.w > mask.w || region.y + region.h > mask.h) {
    return false;
  }
  let changed = false;
  for (let row = 0; row < region.h; row++) {
    const start = (region.y + row) * mask.w + region.x;
    for (let col = 0; col < region.w; col++) {
      const value = region.cells[row * region.w + col];
      if (mask.cells[start + col] !== value) {
        mask.cells[start + col] = value;
        changed = true;
      }
    }
  }
  return changed;
}

export function sameRegion(a: FogRegion, b: FogRegion): boolean {
  if (a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h) return false;
  for (let i = 0; i < a.cells.length; i++) if (a.cells[i] !== b.cells[i]) return false;
  return true;
}

// ---------- Pintar (coordenadas em células, fracionárias) ----------

/** Círculo de raio `r` células. Devolve o retângulo mudado, ou nulo. */
export function stampCircle(
  mask: FogMask,
  cx: number,
  cy: number,
  r: number,
  value: 0 | 1
): CellRect | null {
  const rect = clampRect(mask, {
    x: Math.floor(cx - r),
    y: Math.floor(cy - r),
    w: Math.ceil(cx + r) - Math.floor(cx - r) + 1,
    h: Math.ceil(cy + r) - Math.floor(cy - r) + 1,
  });
  if (!rect) return null;
  // Célula conta se o centro dela cai no círculo; pincel minúsculo pega ao menos uma.
  const reach = Math.max(r, 0.5) ** 2;
  let changed: CellRect | null = null;
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    const dy = y + 0.5 - cy;
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      const dx = x + 0.5 - cx;
      if (dx * dx + dy * dy > reach) continue;
      const index = y * mask.w + x;
      if (mask.cells[index] === value) continue;
      mask.cells[index] = value;
      changed = unionRect(changed, { x, y, w: 1, h: 1 });
    }
  }
  return changed;
}

/** Traço do pincel entre dois pontos: carimbos a cada meio raio, sem buraco. */
export function stampSegment(
  mask: FogMask,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  value: 0 | 1
): CellRect | null {
  const length = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(length / Math.max(0.5, r / 2)));
  let changed: CellRect | null = null;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    changed = unionRect(changed, stampCircle(mask, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, value));
  }
  return changed;
}

export function fillRect(
  mask: FogMask,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  value: 0 | 1
): CellRect | null {
  const rect = clampRect(mask, {
    x: Math.floor(Math.min(x0, x1)),
    y: Math.floor(Math.min(y0, y1)),
    w: Math.ceil(Math.max(x0, x1)) - Math.floor(Math.min(x0, x1)),
    h: Math.ceil(Math.max(y0, y1)) - Math.floor(Math.min(y0, y1)),
  });
  if (!rect) return null;
  let changed = false;
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      const index = y * mask.w + x;
      if (mask.cells[index] !== value) {
        mask.cells[index] = value;
        changed = true;
      }
    }
  }
  return changed ? rect : null;
}

/** Polígono por varredura: célula conta se o centro dela está dentro (par-ímpar). */
export function fillPolygon(mask: FogMask, points: { x: number; y: number }[], value: 0 | 1): CellRect | null {
  if (points.length < 3) return null;
  const ys = points.map((p) => p.y);
  const yStart = Math.max(0, Math.floor(Math.min(...ys)));
  const yEnd = Math.min(mask.h - 1, Math.ceil(Math.max(...ys)));
  let changed: CellRect | null = null;
  for (let y = yStart; y <= yEnd; y++) {
    const scan = y + 0.5;
    const crossings: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if ((a.y <= scan && b.y > scan) || (b.y <= scan && a.y > scan)) {
        crossings.push(a.x + ((scan - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
    }
    crossings.sort((p, q) => p - q);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      // Centro da célula x é x + 0,5: entra se left <= x + 0,5 < right.
      const from = Math.max(0, Math.ceil(crossings[k] - 0.5));
      const to = Math.min(mask.w - 1, Math.ceil(crossings[k + 1] - 0.5) - 1);
      for (let x = from; x <= to; x++) {
        const index = y * mask.w + x;
        if (mask.cells[index] === value) continue;
        mask.cells[index] = value;
        changed = unionRect(changed, { x, y, w: 1, h: 1 });
      }
    }
  }
  return changed;
}

// ---------- Quem fica escondido ----------

/**
 * Algum pedaço da caixa (em células, fracionárias) está revelado? O que sai da
 * máscara conta como coberto: fora do mapa o jogador também vê preto.
 */
export function boxRevealed(mask: FogMask, x0: number, y0: number, x1: number, y1: number): boolean {
  const rect = clampRect(mask, {
    x: Math.floor(Math.min(x0, x1)),
    y: Math.floor(Math.min(y0, y1)),
    w: Math.ceil(Math.max(x0, x1)) - Math.floor(Math.min(x0, x1)),
    h: Math.ceil(Math.max(y0, y1)) - Math.floor(Math.min(y0, y1)),
  });
  if (!rect) return false;
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    const start = y * mask.w;
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      if (mask.cells[start + x]) return true;
    }
  }
  return false;
}

// ---------- Desenho (alpha por célula) ----------

/**
 * Alpha de cada célula do retângulo (0 revelado, 255 coberto), em `out` RGBA.
 * `soft`: média 3×3, uma borda mais macia antes do filtro linear da textura.
 */
export function paintAlpha(mask: FogMask, rect: CellRect, out: Uint8ClampedArray, soft: boolean) {
  const { w, h, cells } = mask;
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      let covered: number;
      if (soft) {
        let sum = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            // Fora da máscara é coberto: a borda do mapa escurece junto.
            sum += yy < 0 || yy >= h || xx < 0 || xx >= w ? 1 : 1 - cells[yy * w + xx];
            count++;
          }
        }
        covered = sum / count;
      } else {
        covered = 1 - cells[y * w + x];
      }
      const offset = ((y - rect.y) * rect.w + (x - rect.x)) * 4;
      // Branco: a cor vem do `tint` do sprite (preto para jogador, tom escuro para a mestra).
      out[offset] = 255;
      out[offset + 1] = 255;
      out[offset + 2] = 255;
      out[offset + 3] = Math.round(covered * 255);
    }
  }
}

// ---------- Rede ----------

export interface FogPatchPayload {
  x: number;
  y: number;
  w: number;
  h: number;
  bits: string;
}

export function regionToPayload(region: FogRegion): FogPatchPayload {
  return { x: region.x, y: region.y, w: region.w, h: region.h, bits: packBits(region.cells) };
}

/** Do canal: só aceita recorte inteiro, dentro da máscara e com o tamanho certo. */
export function payloadToRegion(mask: FogMask, payload: unknown): FogRegion | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Partial<FogPatchPayload>;
  const ints = [p.x, p.y, p.w, p.h].every((value) => Number.isInteger(value));
  if (!ints || typeof p.bits !== 'string') return null;
  const { x, y, w, h } = p as FogPatchPayload;
  if (x < 0 || y < 0 || w < 1 || h < 1 || x + w > mask.w || y + h > mask.h) return null;
  const cells = unpackBits(p.bits, w * h);
  return cells ? { x, y, w, h, cells } : null;
}
