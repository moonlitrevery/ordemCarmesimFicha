/** Limite da coluna drawings.points (x e y contam separado). */
export const MAX_DRAWING_COORDS = 8000;

function pointSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Ramer–Douglas–Peucker sobre um array achatado [x0, y0, x1, y1, …]. */
export function simplifyStroke(points: number[], epsilon: number): number[] {
  const count = points.length / 2;
  if (count < 3) return points.slice();

  const keep = new Uint8Array(count);
  keep[0] = 1;
  keep[count - 1] = 1;
  const stack: [number, number][] = [[0, count - 1]];

  while (stack.length > 0) {
    const [start, end] = stack.pop() as [number, number];
    let farthest = -1;
    let farthestDistance = epsilon;
    for (let i = start + 1; i < end; i++) {
      const distance = pointSegmentDistance(
        points[i * 2],
        points[i * 2 + 1],
        points[start * 2],
        points[start * 2 + 1],
        points[end * 2],
        points[end * 2 + 1]
      );
      if (distance > farthestDistance) {
        farthest = i;
        farthestDistance = distance;
      }
    }
    if (farthest !== -1) {
      keep[farthest] = 1;
      stack.push([start, farthest], [farthest, end]);
    }
  }

  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    if (keep[i]) result.push(points[i * 2], points[i * 2 + 1]);
  }
  return result;
}

/** Simplifica e, se o traço ainda não couber na coluna, aumenta a tolerância. */
export function simplifyToLimit(
  points: number[],
  epsilon: number,
  maxCoords = MAX_DRAWING_COORDS
): number[] {
  let tolerance = epsilon;
  let result = simplifyStroke(points, tolerance);
  while (result.length > maxCoords) {
    tolerance *= 2;
    result = simplifyStroke(result, tolerance);
  }
  return result;
}

export function distanceToStroke(
  x: number,
  y: number,
  points: number[]
): number {
  let best = Infinity;
  for (let i = 0; i + 3 < points.length; i += 2) {
    best = Math.min(
      best,
      pointSegmentDistance(
        x,
        y,
        points[i],
        points[i + 1],
        points[i + 2],
        points[i + 3]
      )
    );
  }
  return best;
}

/** Texto da régua. Sem calibração não inventa número. */
export function formatRulerDistance(
  worldPixels: number,
  metersPerPx: number | null
): string {
  if (!metersPerPx) return 'calibre a régua';
  const meters = worldPixels * metersPerPx;
  return `${meters.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m`;
}

export function calibrate(worldPixels: number, meters: number): number | null {
  if (!(worldPixels > 0) || !(meters > 0)) return null;
  return meters / worldPixels;
}

/** Texto digitado em pt-BR: aceita "12,5". */
export function parseMeters(input: string): number | null {
  const value = Number(input.trim().replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}
