// Primitivas de desenho reaproveitadas pelos objetos. Tudo em metros, no referencial atual.
import type { Path2D } from '@napi-rs/canvas';
import { blobPoly, type Vec } from '../geom';
import type { Rng } from '../rng';
import { circlePath, ellipsePath, polyPath, rectPath, type Scene } from '../scene';

export type RGB = [number, number, number];

export const rgb = ([r, g, b]: RGB, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;

export function shadeRgb([r, g, b]: RGB, k: number): RGB {
  return [Math.min(255, r * k), Math.min(255, g * k), Math.min(255, b * k)];
}

export function jitter(rng: Rng, [r, g, b]: RGB, amount = 0.08): RGB {
  const k = 1 + rng.gauss() * amount;
  return [r * k * (1 + rng.gauss() * amount * 0.3), g * k, b * k * (1 + rng.gauss() * amount * 0.3)];
}

/** Tampo/placa de madeira: grão, borda chanfrada escura, brilho leve no meio. */
export function woodTop(sc: Scene, path: Path2D, w: number, d: number, opts: { material?: string; rot?: number; brightness?: number; worn?: Rng } = {}) {
  sc.pat(path, opts.material ?? 'wood_oak', { rot: opts.rot ?? 0, brightness: opts.brightness ?? 0 });
  const g = sc.c.createLinearGradient(-w / 2, -d / 2, w / 2, d / 2);
  g.addColorStop(0, 'rgba(255,240,215,0.10)');
  g.addColorStop(0.5, 'rgba(255,240,215,0.0)');
  g.addColorStop(1, 'rgba(30,15,5,0.14)');
  sc.fill(path, g);
  sc.stroke(path, 'rgba(25,14,6,0.75)', 0.018);
  if (opts.worn) {
    // Marcas de copo e arranhões.
    const rng = opts.worn;
    for (let k = 0; k < 3; k++) {
      sc.stroke(circlePath(rng.range(-0.3, 0.3) * w, rng.range(-0.3, 0.3) * d, 0.035), 'rgba(40,20,10,0.18)', 0.006);
    }
    for (let k = 0; k < w * d * 30; k++) {
      const x = rng.range(-w / 2, w / 2);
      const y = rng.range(-d / 2, d / 2);
      sc.stroke(polyPath([[x, y], [x + rng.range(-0.08, 0.08), y + rng.range(-0.03, 0.03)]]), 'rgba(255,235,200,0.12)', 0.003);
    }
  }
}

/** Metal escovado: gradiente + riscos finos. */
export function metal(sc: Scene, path: Path2D, w: number, d: number, base: RGB, rng: Rng, opts: { streaks?: boolean; angle?: number } = {}) {
  const g = sc.c.createLinearGradient(-w / 2, -d / 2, w / 2, d / 2);
  g.addColorStop(0, rgb(shadeRgb(base, 1.18)));
  g.addColorStop(0.35, rgb(base));
  g.addColorStop(0.7, rgb(shadeRgb(base, 0.86)));
  g.addColorStop(1, rgb(shadeRgb(base, 1.05)));
  sc.fill(path, g);
  if (opts.streaks !== false) {
    sc.c.save();
    sc.c.clip(path);
    for (let k = 0; k < Math.max(6, w * d * 120); k++) {
      const x = rng.range(-w / 2, w / 2);
      const y = rng.range(-d / 2, d / 2);
      const len = rng.range(0.03, 0.25);
      sc.c.strokeStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
      sc.c.lineWidth = rng.range(0.002, 0.006);
      sc.c.beginPath();
      sc.c.moveTo(x, y);
      sc.c.lineTo(x + len, y + rng.range(-0.01, 0.01));
      sc.c.stroke();
    }
    sc.c.restore();
  }
}

/** Tecido: cor + trama + dobras (vincos de dobrado e amassado). */
export function fabric(sc: Scene, path: Path2D, w: number, d: number, color: RGB, rng: Rng, opts: { creases?: number; check?: RGB; checkCell?: number; folds?: boolean } = {}) {
  sc.fill(path, rgb(color));
  if (opts.check) {
    sc.c.save();
    sc.c.clip(path);
    const cell = opts.checkCell ?? 0.06;
    for (let x = -w / 2; x < w / 2; x += cell) {
      sc.fill(rectPath(x, -d / 2, cell / 2, d), rgb(opts.check, 0.55));
    }
    for (let y = -d / 2; y < d / 2; y += cell) {
      sc.fill(rectPath(-w / 2, y, w, cell / 2), rgb(opts.check, 0.55));
    }
    sc.c.restore();
  }
  sc.c.save();
  sc.c.globalCompositeOperation = 'multiply';
  sc.pat(path, 'linen', { alpha: 0.35 });
  sc.c.restore();
  sc.c.save();
  sc.c.clip(path);
  // Vincos de dobra (linhas retas, sutis) e amassados (curvas).
  const creases = opts.creases ?? 2;
  for (let k = 1; k <= creases; k++) {
    const x = -w / 2 + (w * k) / (creases + 1);
    sc.fill(rectPath(x - 0.004, -d / 2, 0.008, d), 'rgba(0,0,0,0.07)');
    sc.fill(rectPath(x + 0.004, -d / 2, 0.006, d), 'rgba(255,255,255,0.08)');
    const y = -d / 2 + (d * k) / (creases + 1);
    sc.fill(rectPath(-w / 2, y - 0.004, w, 0.008), 'rgba(0,0,0,0.06)');
  }
  if (opts.folds !== false) {
    for (let k = 0; k < 4 + w * d * 10; k++) {
      const x = rng.range(-w / 2, w / 2);
      const y = rng.range(-d / 2, d / 2);
      sc.c.strokeStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
      sc.c.lineWidth = rng.range(0.006, 0.02);
      sc.c.beginPath();
      sc.c.moveTo(x, y);
      sc.c.quadraticCurveTo(x + rng.range(-0.15, 0.15), y + rng.range(-0.15, 0.15), x + rng.range(-0.25, 0.25), y + rng.range(-0.25, 0.25));
      sc.c.stroke();
    }
  }
  sc.c.restore();
}

/** Garrafa vista de cima: corpo, ombro, gargalo e tampinha. */
export function bottleTop(sc: Scene, x: number, y: number, r: number, color: RGB, cap: RGB, rng: Rng) {
  const g = sc.c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, rgb(shadeRgb(color, 1.6), 0.95));
  g.addColorStop(0.6, rgb(color, 0.95));
  g.addColorStop(1, rgb(shadeRgb(color, 0.5), 0.95));
  sc.fill(circlePath(x, y, r), g);
  sc.fill(circlePath(x, y, r * 0.42), rgb(shadeRgb(color, 0.8)));
  sc.fill(circlePath(x, y, r * 0.3), rgb(cap));
  if (rng.chance(0.7)) sc.fill(circlePath(x - r * 0.35, y - r * 0.35, r * 0.15), 'rgba(255,255,255,0.45)');
}

export function glassTop(sc: Scene, x: number, y: number, r: number, fill?: RGB) {
  sc.fill(circlePath(x, y, r), 'rgba(220,235,240,0.35)');
  if (fill) sc.fill(circlePath(x, y, r * 0.8), rgb(fill, 0.8));
  sc.stroke(circlePath(x, y, r), 'rgba(255,255,255,0.7)', r * 0.15);
  sc.fill(circlePath(x - r * 0.35, y - r * 0.35, r * 0.18), 'rgba(255,255,255,0.7)');
}

/** Cadeira de madeira: assento, encosto no lado +y (atrás), pernas aparecendo. */
export function woodChair(sc: Scene, rng: Rng, opts: { color?: RGB; seat?: RGB } = {}) {
  const w = 0.42;
  const d = 0.42;
  const wood = opts.color ?? jitter(rng, [92, 58, 34], 0.06);
  // Pernas que aparecem nos cantos.
  for (const [x, y] of [
    [-w / 2 + 0.03, -d / 2 + 0.03],
    [w / 2 - 0.03, -d / 2 + 0.03],
  ] as Vec[]) {
    sc.fill(rectPath(x - 0.02, y - 0.02, 0.04, 0.04), rgb(shadeRgb(wood, 0.6)));
  }
  const seat = rectPath(-w / 2, -d / 2, w, d, 0.03);
  if (opts.seat) {
    sc.fill(seat, rgb(opts.seat));
    sc.pat(seat, 'linen', { alpha: 0.25 });
  } else {
    sc.pat(seat, 'wood_oak', { rot: 90, brightness: -0.18 });
    sc.fill(seat, rgb(wood, 0.45));
  }
  sc.stroke(seat, 'rgba(20,10,4,0.7)', 0.014);
  sc.occlude(seat, 0.47, 0.42);
  // Encosto: travessa grossa atrás, mais alta.
  const back = rectPath(-w / 2, d / 2 - 0.06, w, 0.06, 0.02);
  sc.fill(back, rgb(shadeRgb(wood, 1.1)));
  sc.stroke(back, 'rgba(20,10,4,0.8)', 0.012);
  sc.occlude(back, 0.95);
  for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) sc.occlude(rectPath(x - 0.02, -d / 2 + 0.01, 0.04, 0.04), 0.45);
}

/** Cadeira de plástico (monobloco) branca encardida. */
export function plasticChair(sc: Scene, rng: Rng) {
  const c: RGB = jitter(rng, [228, 226, 216], 0.03);
  const seat = rectPath(-0.24, -0.22, 0.48, 0.46, 0.08);
  const g = sc.c.createRadialGradient(0, 0, 0.05, 0, 0, 0.35);
  g.addColorStop(0, rgb(shadeRgb(c, 0.92)));
  g.addColorStop(1, rgb(c));
  sc.fill(seat, g);
  sc.stroke(seat, 'rgba(120,120,110,0.8)', 0.012);
  // Encosto curvo com frisos.
  const arc = polyPath([
    [-0.27, 0.12],
    [-0.22, 0.27],
    [0.22, 0.27],
    [0.27, 0.12],
    [0.21, 0.17],
    [-0.21, 0.17],
  ]);
  sc.fill(arc, rgb(shadeRgb(c, 1.03)));
  sc.stroke(arc, 'rgba(110,110,100,0.8)', 0.01);
  for (let k = -2; k <= 2; k++) sc.fill(rectPath(k * 0.07 - 0.008, 0.18, 0.016, 0.07), 'rgba(90,90,80,0.35)');
  sc.stain([-0.25, -0.22, 0.25, 0.25], 'rgb(110,100,70)', 0.25, 0.08, { clip: seat });
  sc.occlude(seat, 0.45, 0.4);
  sc.occlude(arc, 0.82);
}

/** Moita de folhas: muitas folhinhas com variação de cor, e volume no mapa de alturas. */
export function leafCluster(
  sc: Scene,
  cx: number,
  cy: number,
  r: number,
  palette: RGB[],
  rng: Rng,
  opts: { leaf?: number; count?: number; height?: number; base?: number; bottom?: number; elong?: number; flowers?: RGB[]; flowerRate?: number } = {}
) {
  const leaf = opts.leaf ?? r * 0.18;
  const count = opts.count ?? Math.round((r * r) / (leaf * leaf) * 3.2);
  const outline = blobPoly([cx, cy], r, () => rng.next(), { rough: 0.35, points: 20 });
  // Fundo escuro (o miolo da moita), depois folhas de fora para dentro mais claras.
  sc.fill(polyPath(outline), rgb(shadeRgb(palette[0], 0.45)));
  for (let k = 0; k < count; k++) {
    const t = Math.sqrt(rng.next());
    const a = rng.angle();
    const x = cx + Math.cos(a) * r * t * 0.95;
    const y = cy + Math.sin(a) * r * t * 0.95;
    const col = shadeRgb(rng.pick(palette), 0.75 + (1 - t) * 0.4 + rng.gauss() * 0.06);
    const s = leaf * rng.range(0.7, 1.25);
    sc.fill(ellipsePath(x, y, s, s * (opts.elong ?? 0.55), rng.angle()), rgb(col));
  }
  if (opts.flowers) {
    const n = Math.round(count * (opts.flowerRate ?? 0.08));
    for (let k = 0; k < n; k++) {
      const t = Math.sqrt(rng.next()) * 0.85;
      const a = rng.angle();
      sc.fill(circlePath(cx + Math.cos(a) * r * t, cy + Math.sin(a) * r * t, leaf * rng.range(0.45, 0.7)), rgb(jitter(rng, rng.pick(opts.flowers), 0.1)));
    }
  }
  const base = opts.base ?? 0;
  const top = base + (opts.height ?? r * 0.9);
  sc.dome(cx, cy, r * 1.05, top, base + (top - base) * 0.35, opts.bottom ?? 0, polyPath(outline));
}

/** Pedra irregular com textura e volume. */
export function rock(sc: Scene, cx: number, cy: number, r: number, rng: Rng, opts: { material?: string; height?: number; moss?: number } = {}) {
  const shape = polyPath(blobPoly([cx, cy], r, () => rng.next(), { rough: 0.3, points: 12, stretch: rng.range(0.8, 1.3), rot: rng.angle() }));
  sc.pat(shape, opts.material ?? 'stone_grey', { brightness: rng.range(-0.1, 0.05) });
  sc.stroke(shape, 'rgba(20,20,18,0.5)', Math.max(0.01, r * 0.06));
  if (opts.moss) sc.pat(shape, 'moss', { alpha: opts.moss });
  sc.dome(cx, cy, r, opts.height ?? r * 0.8, 0.02, 0, shape);
}

export { circlePath, ellipsePath, polyPath, rectPath };
