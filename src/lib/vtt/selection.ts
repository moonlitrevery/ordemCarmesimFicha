import type { Point } from './transform';

/**
 * Seleção múltipla (Fase 12b). Puro: o `EngineInput` e o `SceneSync` chamam estas
 * funções. Um lote grava numa chamada só (`patch_scene_objects`), que recusa mais de 50.
 */
export const MAX_SELECTION = 50;

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Retângulo normalizado entre dois cantos, em qualquer ordem. */
export function boxFrom(a: Point, b: Point): Box {
  return {
    x0: Math.min(a.x, b.x),
    y0: Math.min(a.y, b.y),
    x1: Math.max(a.x, b.x),
    y1: Math.max(a.y, b.y),
  };
}

/**
 * O retângulo (girado) de um objeto encosta na caixa? Separação de eixos: os dois
 * eixos da caixa e os dois lados do objeto. `corners` em ordem (nw, ne, se, sw).
 */
export function polygonTouchesBox(corners: Point[], box: Box): boolean {
  if (corners.length < 3) return false;
  const boxCorners: Point[] = [
    { x: box.x0, y: box.y0 },
    { x: box.x1, y: box.y0 },
    { x: box.x1, y: box.y1 },
    { x: box.x0, y: box.y1 },
  ];
  const axes: Point[] = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    // Normal do lado: basta a direção, sem normalizar.
    axes.push({ x: b.y - a.y, y: a.x - b.x });
  }
  for (const axis of axes) {
    if (axis.x === 0 && axis.y === 0) continue;
    const project = (points: Point[]) => {
      let min = Infinity;
      let max = -Infinity;
      for (const point of points) {
        const value = point.x * axis.x + point.y * axis.y;
        if (value < min) min = value;
        if (value > max) max = value;
      }
      return { min, max };
    };
    const p = project(corners);
    const q = project(boxCorners);
    if (p.max < q.min || q.max < p.min) return false;
  }
  return true;
}

/** Shift/Ctrl + clique: tira se já está, põe no fim se não está. */
export function toggleInSelection(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

/** Soma sem repetir, na ordem: primeiro o que já estava. */
export function mergeSelection(base: string[], extra: string[]): string[] {
  const seen = new Set(base);
  const result = base.slice();
  for (const id of extra) {
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

/** Corta em 50 e diz quantos havia, para o aviso. */
export function limitSelection(ids: string[]): { ids: string[]; total: number; truncated: boolean } {
  return {
    ids: ids.slice(0, MAX_SELECTION),
    total: ids.length,
    truncated: ids.length > MAX_SELECTION,
  };
}

export function selectionLimitMessage(total: number): string {
  return `Seleção limitada a ${MAX_SELECTION} objetos (havia ${total}).`;
}

/**
 * Quem se move de fato num grupo: objeto anexado a outro que também está na
 * seleção vai junto com o pai, e mover os dois o deslocaria duas vezes.
 * `parentOf` devolve o pai efetivo (anexo válido), ou nulo.
 */
export function selectionRoots(ids: string[], parentOf: (id: string) => string | null): string[] {
  const selected = new Set(ids);
  return ids.filter((id) => {
    const seen = new Set<string>([id]);
    let cursor = parentOf(id);
    while (cursor && !seen.has(cursor)) {
      if (selected.has(cursor)) return false;
      seen.add(cursor);
      cursor = parentOf(cursor);
    }
    return true;
  });
}

/**
 * Passo das setinhas, em pixels do mapa: 1 quadrado de 1,5 m com a régua
 * calibrada, 10 px de tela sem ela. Shift dá o passo fino (2 px de tela).
 */
export function nudgeStep(metersPerPx: number | null | undefined, zoom: number, fine: boolean): number {
  const safeZoom = zoom > 0 ? zoom : 1;
  if (fine) return 2 / safeZoom;
  if (metersPerPx && metersPerPx > 0) return 1.5 / metersPerPx;
  return 10 / safeZoom;
}

/** Seta do teclado → direção. Outra tecla: nulo. */
export function arrowDirection(key: string): Point | null {
  switch (key) {
    case 'ArrowLeft':
      return { x: -1, y: 0 };
    case 'ArrowRight':
      return { x: 1, y: 0 };
    case 'ArrowUp':
      return { x: 0, y: -1 };
    case 'ArrowDown':
      return { x: 0, y: 1 };
    default:
      return null;
  }
}

/** Condição em grupo: liga em todos se algum não tem; desliga se todos têm. */
export function groupConditionTarget(lists: string[][], key: string): boolean {
  return !lists.every((list) => list.includes(key));
}
