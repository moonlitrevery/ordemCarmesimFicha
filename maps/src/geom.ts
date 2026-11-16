// Geometria em metros. Origem no canto superior esquerdo, x → leste, y → sul.

export type Vec = [number, number];
export type RectM = [number, number, number, number]; // x0, y0, x1, y1

export const DEG = Math.PI / 180;

export function rectNorm([a, b, c, d]: RectM): RectM {
  return [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)];
}

export function rectPoly(r: RectM): Vec[] {
  const [x0, y0, x1, y1] = rectNorm(r);
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

export function dist(a: Vec, b: Vec): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

export function lerpVec(a: Vec, b: Vec, t: number): Vec {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export function polyBounds(points: Vec[]): RectM {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of points) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}

export function pointInPoly([x, y]: Vec, poly: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInRect([x, y]: Vec, r: RectM): boolean {
  const [x0, y0, x1, y1] = rectNorm(r);
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

/** Distância de um ponto a um segmento, e o parâmetro t da projeção. */
export function segDist(p: Vec, a: Vec, b: Vec): { d: number; t: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy || 1e-9;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return { d: Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t)), t };
}

export function polylineLength(points: Vec[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  return total;
}

/** Ponto e direção (unitária) a uma distância `s` ao longo da polilinha. */
export function alongPolyline(points: Vec[], s: number): { p: Vec; dir: Vec } {
  let left = s;
  for (let i = 1; i < points.length; i++) {
    const seg = dist(points[i - 1], points[i]);
    if (left <= seg || i === points.length - 1) {
      const t = seg > 0 ? Math.min(1, left / seg) : 0;
      const dx = (points[i][0] - points[i - 1][0]) / (seg || 1);
      const dy = (points[i][1] - points[i - 1][1]) / (seg || 1);
      return { p: lerpVec(points[i - 1], points[i], t), dir: [dx, dy] };
    }
    left -= seg;
  }
  return { p: points[0], dir: [1, 0] };
}

/** Catmull-Rom: deixa uma trilha desenhada à mão em vez de quebrada em retas. */
export function smoothPolyline(points: Vec[], perSegment = 8): Vec[] {
  if (points.length < 3) return points.slice();
  const out: Vec[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let k = 0; k < perSegment; k++) {
      const t = k / perSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Retângulo girado (centro, tamanho, rotação em graus) como polígono. */
export function orientedRect(center: Vec, w: number, h: number, rotDeg = 0): Vec[] {
  const a = rotDeg * DEG;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([x, y]) => [center[0] + x * c - y * s, center[1] + x * s + y * c] as Vec);
}

/** Interseção de dois retângulos alinhados, ou null. */
export function rectIntersect(a: RectM, b: RectM): RectM | null {
  const [ax0, ay0, ax1, ay1] = rectNorm(a);
  const [bx0, by0, bx1, by1] = rectNorm(b);
  const x0 = Math.max(ax0, bx0);
  const y0 = Math.max(ay0, by0);
  const x1 = Math.min(ax1, bx1);
  const y1 = Math.min(ay1, by1);
  return x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : null;
}

/** Contorno irregular de uma mancha (pedra, moita, copa): raio modulado por ruído. */
export function blobPoly(
  center: Vec,
  radius: number,
  rand: () => number,
  opts: { points?: number; rough?: number; stretch?: number; rot?: number } = {}
): Vec[] {
  const n = opts.points ?? 18;
  const rough = opts.rough ?? 0.25;
  const stretch = opts.stretch ?? 1;
  const rot = opts.rot ?? 0;
  // Harmônicos aleatórios dão contorno orgânico sem picos.
  const harmonics = [2, 3, 5].map((k) => ({ k, amp: rand() * rough, ph: rand() * Math.PI * 2 }));
  const out: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    let r = 1;
    for (const h of harmonics) r += h.amp * Math.sin(h.k * a + h.ph) * 0.6;
    r += (rand() - 0.5) * rough * 0.5;
    const x = Math.cos(a) * radius * r * stretch;
    const y = Math.sin(a) * radius * r;
    out.push([
      center[0] + x * Math.cos(rot) - y * Math.sin(rot),
      center[1] + x * Math.sin(rot) + y * Math.cos(rot),
    ]);
  }
  return out;
}
