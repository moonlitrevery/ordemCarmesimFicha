// Decalques: o que faz o chão parecer usado (tufos, flores, folhas, ervas nas juntas,
// limo, poças, trilha pisada, marcas de arrasto, pegadas).
import type { Path2D } from '@napi-rs/canvas';
import { alongPolyline, blobPoly, pointInRect, polylineLength, smoothPolyline, type RectM, type Vec } from './geom';
import type { Rng } from './rng';
import { circlePath, ellipsePath, polyPath, type Scene } from './scene';
import { jitter, rgb, shadeRgb, type RGB } from './props/kit';

let exclusion: Path2D[] = [];

/** Áreas onde o espalhamento não põe nada (camadas de chão que vêm depois). */
export function setScatterExclusion(paths: Path2D[]) {
  exclusion = paths;
}

/** Pontos aleatórios dentro de um caminho (rejeição pelo `isPointInPath`). */
function* scatter(sc: Scene, path: Path2D, bounds: RectM, count: number, rng: Rng): Generator<Vec> {
  const [x0, y0, x1, y1] = bounds;
  const bx0 = Math.max(0, x0);
  const by0 = Math.max(0, y0);
  const bx1 = Math.min(sc.widthM, x1);
  const by1 = Math.min(sc.heightM, y1);
  let made = 0;
  for (let tries = 0; made < count && tries < count * 4; tries++) {
    const p: Vec = [rng.range(bx0, bx1), rng.range(by0, by1)];
    // isPointInPath usa coordenadas de dispositivo.
    if (!sc.c.isPointInPath(path, p[0] * sc.ppm, p[1] * sc.ppm)) continue;
    if (exclusion.some((e) => sc.c.isPointInPath(e, p[0] * sc.ppm, p[1] * sc.ppm))) continue;
    if (sc.keepClear.some((f) => f(p))) continue;
    made++;
    yield p;
  }
}

function areaOf(bounds: RectM, sc: Scene) {
  const w = Math.min(sc.widthM, bounds[2]) - Math.max(0, bounds[0]);
  const h = Math.min(sc.heightM, bounds[3]) - Math.max(0, bounds[1]);
  return Math.max(0, w) * Math.max(0, h);
}

/** Tufo de capim: folhas finas saindo de um centro, com volume. */
export function grassTuft(sc: Scene, [x, y]: Vec, r: number, palette: RGB[], rng: Rng, height: number) {
  const blades = Math.max(6, Math.round(r * 110));
  // Miolo escuro irregular (não um círculo): é a sombra entre as folhas.
  sc.fill(polyPath(blobPoly([x, y], r * 0.45, () => rng.next(), { rough: 0.6, points: 9 })), rgb(shadeRgb(palette[0], 0.6), 0.35));
  for (let k = 0; k < blades; k++) {
    const a = rng.angle();
    const len = r * rng.range(0.35, 1.35);
    const bend = rng.range(-0.4, 0.4);
    sc.c.strokeStyle = rgb(shadeRgb(rng.pick(palette), rng.range(0.75, 1.25)), 0.9);
    sc.c.lineWidth = r * rng.range(0.05, 0.1);
    sc.c.beginPath();
    sc.c.moveTo(x + Math.cos(a) * r * 0.1, y + Math.sin(a) * r * 0.1);
    sc.c.quadraticCurveTo(
      x + Math.cos(a + bend) * len * 0.6,
      y + Math.sin(a + bend) * len * 0.6,
      x + Math.cos(a + bend * 1.5) * len,
      y + Math.sin(a + bend * 1.5) * len
    );
    sc.c.stroke();
  }
  sc.dome(x, y, r, height, height * 0.2);
}

const CLOVER: RGB[] = [
  [62, 104, 38],
  [74, 118, 44],
  [54, 92, 34],
];
const MEADOW_FLOWERS: RGB[] = [
  [238, 236, 220],
  [236, 206, 70],
  [200, 170, 220],
];

function decorateGrass(sc: Scene, path: Path2D, bounds: RectM, rng: Rng) {
  const area = areaOf(bounds, sc);
  // Manchas mais escuras (trevo) e mais secas, flores miúdas, ervas.
  for (const p of scatter(sc, path, bounds, area * 0.9, rng)) {
    const r = rng.range(0.08, 0.25);
    const shape = polyPath(blobPoly(p, r, () => rng.next(), { rough: 0.5, points: 10 }));
    sc.fill(shape, rng.chance(0.7) ? 'rgba(40,70,20,0.28)' : 'rgba(150,140,70,0.22)');
  }
  for (const p of scatter(sc, path, bounds, area * 5, rng)) {
    const c = jitter(rng, rng.pick(CLOVER), 0.1);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + rng.range(0, 1);
      sc.fill(circlePath(p[0] + Math.cos(a) * 0.012, p[1] + Math.sin(a) * 0.012, 0.011), rgb(c));
    }
  }
  for (const p of scatter(sc, path, bounds, area * 1.6, rng)) {
    sc.fill(circlePath(p[0], p[1], rng.range(0.008, 0.014)), rgb(jitter(rng, rng.pick(MEADOW_FLOWERS), 0.05)));
  }
  for (const p of scatter(sc, path, bounds, area * 0.5, rng)) {
    grassTuft(sc, p, rng.range(0.06, 0.12), [[70, 104, 40], [96, 124, 52], [58, 86, 32]], rng, 0.025);
  }
}

const DRY_GRASS: RGB[] = [
  [150, 138, 84],
  [126, 120, 66],
  [170, 154, 100],
  [104, 110, 58],
  [138, 128, 70],
];

function decorateTallGrass(sc: Scene, path: Path2D, bounds: RectM, rng: Rng) {
  const area = areaOf(bounds, sc);
  // Capim alto em touceiras com volume (o relevo e a sombra interna fazem o resto).
  for (const p of scatter(sc, path, bounds, area * 1.3, rng)) {
    grassTuft(sc, p, rng.range(0.16, 0.4), DRY_GRASS, rng, rng.range(0.06, 0.16));
  }
  for (const p of scatter(sc, path, bounds, area * 0.2, rng)) {
    sc.fill(circlePath(p[0], p[1], rng.range(0.015, 0.025)), rgb(jitter(rng, [236, 226, 196], 0.05)));
  }
  // Espigas/sementes claras e cardos secos.
  for (const p of scatter(sc, path, bounds, area * 0.05, rng)) {
    sc.fill(circlePath(p[0], p[1], 0.04), 'rgba(120,80,110,0.8)');
    sc.stroke(circlePath(p[0], p[1], 0.06), 'rgba(160,150,100,0.6)', 0.01);
  }
}

const LEAVES: RGB[] = [
  [120, 70, 34],
  [150, 96, 44],
  [96, 58, 30],
  [168, 120, 56],
  [84, 60, 38],
  [140, 110, 50],
];

/** Folha caída: elipse com nervura, cor de outono. */
export function fallenLeaf(sc: Scene, [x, y]: Vec, size: number, rng: Rng, palette = LEAVES) {
  const a = rng.angle();
  const c = jitter(rng, rng.pick(palette), 0.12);
  sc.fill(ellipsePath(x, y, size, size * 0.45, a), rgb(c));
  sc.c.strokeStyle = rgb(shadeRgb(c, 0.6), 0.7);
  sc.c.lineWidth = size * 0.08;
  sc.c.beginPath();
  sc.c.moveTo(x - Math.cos(a) * size, y - Math.sin(a) * size);
  sc.c.lineTo(x + Math.cos(a) * size, y + Math.sin(a) * size);
  sc.c.stroke();
}

function decorateForest(sc: Scene, path: Path2D, bounds: RectM, rng: Rng) {
  const area = areaOf(bounds, sc);
  for (const p of scatter(sc, path, bounds, area * 4, rng)) fallenLeaf(sc, p, rng.range(0.04, 0.08), rng);
  // Gravetos e ouriços de castanha.
  for (const p of scatter(sc, path, bounds, area * 0.3, rng)) {
    const a = rng.angle();
    const len = rng.range(0.2, 0.8);
    sc.stroke(polyPath([p, [p[0] + Math.cos(a) * len, p[1] + Math.sin(a) * len]]), 'rgba(70,50,30,0.8)', rng.range(0.01, 0.03));
  }
  for (const p of scatter(sc, path, bounds, area * 0.15, rng)) {
    sc.fill(circlePath(p[0], p[1], 0.035), '#6f6a2c');
    sc.stroke(circlePath(p[0], p[1], 0.04), 'rgba(140,140,70,0.7)', 0.012);
  }
  // Samambaias e mato baixo em manchas.
  for (const p of scatter(sc, path, bounds, area * 0.12, rng)) {
    grassTuft(sc, p, rng.range(0.3, 0.6), [[70, 90, 40], [90, 104, 48], [60, 74, 34]], rng, 0.5);
  }
}

function decorateSoil(sc: Scene, path: Path2D, bounds: RectM, rng: Rng) {
  const area = areaOf(bounds, sc);
  for (const p of scatter(sc, path, bounds, area * 6, rng)) {
    const r = rng.range(0.01, 0.035);
    sc.fill(polyPath(blobPoly(p, r, () => rng.next(), { points: 7 })), rgb(jitter(rng, rng.chance(0.5) ? [70, 52, 38] : [120, 100, 80], 0.15)));
  }
  for (const p of scatter(sc, path, bounds, area * 0.6, rng)) {
    grassTuft(sc, p, rng.range(0.04, 0.1), [[80, 110, 44], [96, 120, 50]], rng, 0.08);
  }
}

/** Ervas nas juntas e encardido de calçada/rua de pedra. */
function decorateCobble(sc: Scene, path: Path2D, bounds: RectM, rng: Rng) {
  const area = areaOf(bounds, sc);
  sc.stain(bounds, 'rgb(30,28,24)', 0.25, 1.2, { clip: path, contrast: 2, bias: -0.1 });
  for (const p of scatter(sc, path, bounds, area * 0.25, rng)) {
    grassTuft(sc, p, rng.range(0.03, 0.08), [[78, 100, 44], [96, 116, 52]], rng, 0.03);
  }
  for (const p of scatter(sc, path, bounds, area * 0.05, rng)) {
    sc.fill(polyPath(blobPoly(p, rng.range(0.1, 0.4), () => rng.next(), { rough: 0.5 })), 'rgba(90,96,60,0.18)');
  }
}

function decorateAsphalt(sc: Scene, path: Path2D, bounds: RectM, rng: Rng) {
  const area = areaOf(bounds, sc);
  // Remendos: retângulos mais escuros com borda de piche.
  for (const p of scatter(sc, path, bounds, Math.max(2, area * 0.02), rng)) {
    const w = rng.range(0.6, 2.2);
    const h = rng.range(0.5, 1.6);
    sc.push(p[0], p[1], rng.range(-20, 20));
    // Remendo de asfalto mais novo: um pouco mais escuro, borda de piche irregular.
    const patch = polyPath([
      [-w / 2 + rng.range(-0.1, 0.1), -h / 2],
      [w / 2, -h / 2 + rng.range(-0.1, 0.1)],
      [w / 2 + rng.range(-0.1, 0.1), h / 2],
      [-w / 2, h / 2 + rng.range(-0.1, 0.1)],
    ]);
    sc.pat(patch, 'asphalt_patched', { brightness: -0.06, alpha: 0.85 });
    sc.stroke(patch, 'rgba(18,18,18,0.45)', 0.03);
    sc.pop();
  }
  // Rachaduras.
  for (const p of scatter(sc, path, bounds, area * 0.04, rng)) {
    let a = rng.angle();
    let q = p;
    sc.c.strokeStyle = 'rgba(25,25,25,0.6)';
    sc.c.lineWidth = rng.range(0.01, 0.025);
    sc.c.beginPath();
    sc.c.moveTo(q[0], q[1]);
    for (let k = 0; k < 6; k++) {
      a += rng.range(-0.6, 0.6);
      q = [q[0] + Math.cos(a) * 0.25, q[1] + Math.sin(a) * 0.25];
      sc.c.lineTo(q[0], q[1]);
    }
    sc.c.stroke();
  }
  sc.stain(bounds, 'rgb(30,30,32)', 0.2, 1.5, { clip: path });
}

export const GROUND_DECOR: Record<string, (sc: Scene, path: Path2D, bounds: RectM, rng: Rng) => void> = {
  grass_short: decorateGrass,
  tall_grass_dry_mixed: decorateTallGrass,
  forest_floor_leaves: decorateForest,
  garden_soil: decorateSoil,
  cobblestone_basalt: decorateCobble,
  cobblestone_basalt_irregular: decorateCobble,
  asphalt_patched: decorateAsphalt,
};

// ---------- Decalques de trilha ----------

const INTENSITY = { subtle: 0.55, medium: 0.8, strong: 1 } as const;

/** Trilha pisada: mato amassado nas bordas e terra exposta no meio. */
export function footpath(sc: Scene, points: Vec[], width: number, rng: Rng, intensity: keyof typeof INTENSITY = 'medium') {
  const k = INTENSITY[intensity];
  const smooth = smoothPolyline(points, 10);
  const len = polylineLength(smooth);
  for (let s = 0; s < len; s += width * 0.25) {
    const { p, dir } = alongPolyline(smooth, s);
    const wob = (sc.noise.at(s * 0.3, 7.1) - 0.5) * width * 0.8;
    const c: Vec = [p[0] - dir[1] * wob, p[1] + dir[0] * wob];
    const w = width * (0.75 + sc.noise.at(s * 0.7, 3.3) * 0.6);
    sc.fill(ellipsePath(c[0], c[1], w * 0.95, w * 0.6, Math.atan2(dir[1], dir[0])), `rgba(158,146,112,${0.3 * k})`);
    sc.c.save();
    sc.c.globalAlpha = 0.5 * k;
    sc.pat(ellipsePath(c[0], c[1], w * 0.55, w * 0.32, Math.atan2(dir[1], dir[0])), 'soil', { brightness: 0.08, alpha: 0.55 * k });
    sc.c.restore();
  }
  // Pedrinhas soltas na trilha.
  for (let s = 0; s < len; s += rng.range(0.3, 0.9)) {
    const { p, dir } = alongPolyline(smooth, s);
    const o = rng.gauss() * width * 0.3;
    sc.fill(circlePath(p[0] - dir[1] * o, p[1] + dir[0] * o, rng.range(0.012, 0.03)), rgb(jitter(rng, [130, 124, 110], 0.15)));
  }
}

/** Marcas de arrasto: dois sulcos paralelos e mato tombado no sentido do arrasto. */
export function dragMarks(sc: Scene, points: Vec[], rng: Rng, intensity: keyof typeof INTENSITY = 'subtle') {
  const k = INTENSITY[intensity];
  const smooth = smoothPolyline(points, 12);
  const len = polylineLength(smooth);
  for (const side of [-0.18, 0.18]) {
    sc.c.strokeStyle = `rgba(70,56,40,${0.35 * k})`;
    sc.c.lineWidth = 0.07;
    sc.c.beginPath();
    for (let s = 0; s <= len; s += 0.15) {
      const { p, dir } = alongPolyline(smooth, s);
      const o = side + (sc.noise.at(s * 0.8, side * 10) - 0.5) * 0.08;
      const q: Vec = [p[0] - dir[1] * o, p[1] + dir[0] * o];
      if (s === 0) sc.c.moveTo(q[0], q[1]);
      else sc.c.lineTo(q[0], q[1]);
    }
    sc.c.stroke();
  }
  for (let s = 0; s < len; s += 0.12) {
    const { p, dir } = alongPolyline(smooth, s);
    const o = rng.range(-0.3, 0.3);
    const q: Vec = [p[0] - dir[1] * o, p[1] + dir[0] * o];
    sc.stroke(polyPath([q, [q[0] + dir[0] * 0.18, q[1] + dir[1] * 0.18]]), `rgba(190,180,120,${0.3 * k})`, 0.012);
  }
}

/** Pegadas de pé descalço alternando esquerdo e direito. */
export function footprints(sc: Scene, points: Vec[], rng: Rng, intensity: keyof typeof INTENSITY = 'subtle') {
  const k = INTENSITY[intensity];
  const len = polylineLength(points);
  let left = true;
  for (let s = 0.2; s < len; s += 0.36 + rng.range(-0.03, 0.03)) {
    const { p, dir } = alongPolyline(points, s);
    const side = left ? -0.09 : 0.09;
    const c: Vec = [p[0] - dir[1] * side, p[1] + dir[0] * side];
    const rot = (Math.atan2(dir[1], dir[0]) * 180) / Math.PI + 90 + rng.range(-8, 8);
    sc.push(c[0], c[1], rot);
    const col = `rgba(40,32,22,${0.45 * k})`;
    sc.fill(ellipsePath(0, -0.04, 0.045, 0.07), col);
    sc.fill(ellipsePath(left ? 0.01 : -0.01, 0.06, 0.035, 0.04), col);
    for (let t = 0; t < 5; t++) {
      sc.fill(circlePath((left ? 1 : -1) * (-0.03 + t * 0.016), -0.125 + Math.abs(t - 1) * 0.006, 0.011 - t * 0.0012), col);
    }
    sc.pop();
    left = !left;
  }
}

/** Poça rasa: escura, com reflexo do céu e borda molhada. */
export function puddle(sc: Scene, at: Vec, r: number, rng: Rng) {
  const outline = blobPoly(at, r, () => rng.next(), { rough: 0.45, points: 16, stretch: rng.range(1, 1.8), rot: rng.angle() });
  const wet = blobPoly(at, r * 1.35, () => rng.next(), { rough: 0.45, points: 16, stretch: 1.4 });
  sc.fill(polyPath(wet), 'rgba(15,15,15,0.22)');
  const g = sc.c.createLinearGradient(at[0] - r, at[1] - r, at[0] + r, at[1] + r);
  g.addColorStop(0, 'rgba(110,126,138,0.55)');
  g.addColorStop(0.5, 'rgba(30,36,40,0.6)');
  g.addColorStop(1, 'rgba(80,96,108,0.5)');
  sc.fill(polyPath(outline), g);
}

export function inRect(p: Vec, r: RectM) {
  return pointInRect(p, r);
}
