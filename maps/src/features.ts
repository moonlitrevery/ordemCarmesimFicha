// Features de terreno: afloramento de basalto (com fio d'água e musgo), trilha,
// marcas de arrasto, pegadas e a fenda da variante.
import { blobPoly, orientedRect, polyBounds, pointInPoly, segDist, smoothPolyline, type Vec } from './geom';
import type { Rng } from './rng';
import { circlePath, ellipsePath, polyPath, type Scene } from './scene';
import type { FeatureSpec } from './schema';
import { dragMarks, footpath, footprints } from './decals';

export interface FeatureDef {
  needs: readonly (keyof FeatureSpec)[];
  decal?(sc: Scene, f: FeatureSpec, rng: Rng): void;
  object?(sc: Scene, f: FeatureSpec, rng: Rng): void;
}

const SIDE_VEC: Record<string, Vec> = { east: [1, 0], west: [-1, 0], north: [0, -1], south: [0, 1] };

function outcropOutline(f: FeatureSpec, rng: Rng): Vec[] {
  const [w, h] = (f.size as [number, number]) ?? [6, 4];
  return blobPoly(f.at as Vec, h / 2, () => rng.next(), {
    rough: 0.22,
    points: 30,
    stretch: w / h,
    rot: ((f.rot ?? 0) * Math.PI) / 180,
  });
}

/** Tapete de musgo vivo e úmido em volta da pedra. */
function mossGround(sc: Scene, f: FeatureSpec, rng: Rng) {
  const m = f.moss_ground;
  if (!m) return;
  const [x, y] = f.at as Vec;
  const shape = polyPath(blobPoly([x, y], m.radius + ((f.size?.[0] ?? 6) / 2) * 0.6, () => rng.next(), { rough: 0.35, points: 26, stretch: 1.15 }));
  const b = m.radius * 2 + (f.size?.[0] ?? 6);
  sc.material(shape, [x - b, y - b, x + b, y + b], 'moss', {
    feather: 1.2,
    brightness: m.color === 'vivid_green' ? 0.06 : m.color === 'dark_green' ? -0.08 : 0,
  });
  if (m.color === 'vivid_green') sc.stain([x - b, y - b, x + b, y + b], 'rgb(90,170,40)', 0.25, 0.6, { clip: shape, blend: 'soft-light' });
  if (m.always_wet) sc.stain([x - b, y - b, x + b, y + b], 'rgb(10,24,12)', 0.3, 0.5, { clip: shape });
}

function outcropObject(sc: Scene, f: FeatureSpec, rng: Rng) {
  const outline = outcropOutline(f, rng.fork('outline'));
  const path = polyPath(outline);
  const [x0, y0, x1, y1] = polyBounds(outline);
  const [cx, cy] = f.at as Vec;
  const rot = ((f.rot ?? 0) * Math.PI) / 180;
  const smooth = SIDE_VEC[f.smooth_side ?? 'west'];
  const cracked = SIDE_VEC[f.cracked_side ?? 'east'];
  const size = (f.size as [number, number]) ?? [6, 4];
  const Hmax = Math.min(3.2, Math.min(size[0], size[1]) * 0.45);

  // Base: basalto quase preto. Lado rachado com textura de rocha fraturada.
  sc.pat(path, 'basalt_rock', { brightness: 0.04 });
  sc.c.save();
  sc.c.clip(path);
  const g = sc.c.createLinearGradient(cx + smooth[0] * size[0] * 0.5, cy + smooth[1] * size[1] * 0.5, cx + cracked[0] * size[0] * 0.5, cy + cracked[1] * size[1] * 0.5);
  g.addColorStop(0, 'rgba(12,14,16,0.55)');
  g.addColorStop(0.45, 'rgba(12,14,16,0.25)');
  g.addColorStop(0.55, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  sc.fill(path, g);
  // Lado rachado: textura fraturada e juntas poligonais (colunas de basalto).
  const crackedClip = polyPath([
    [cx, cy],
    [cx + cracked[0] * 20 - cracked[1] * 20, cy + cracked[1] * 20 + cracked[0] * 20],
    [cx + cracked[0] * 20 + cracked[1] * 20, cy + cracked[1] * 20 - cracked[0] * 20],
  ]);
  sc.c.save();
  sc.c.clip(crackedClip);
  sc.pat(path, 'basalt_cracked', { alpha: 0.85 });
  for (let k = 0; k < 26; k++) {
    let p: Vec = [cx + cracked[0] * rng.range(0, size[0] * 0.5) + rng.range(-size[1] / 2, size[1] / 2) * Math.abs(cracked[1] || 1) * 0.6, cy + rng.range(-size[1] / 2, size[1] / 2)];
    let a = rng.angle();
    sc.c.strokeStyle = 'rgba(0,0,0,0.85)';
    sc.c.lineWidth = rng.range(0.02, 0.05);
    sc.c.beginPath();
    sc.c.moveTo(p[0], p[1]);
    for (let s = 0; s < 4; s++) {
      a += rng.range(-1.1, 1.1);
      p = [p[0] + Math.cos(a) * rng.range(0.25, 0.6), p[1] + Math.sin(a) * rng.range(0.25, 0.6)];
      sc.c.lineTo(p[0], p[1]);
    }
    sc.c.stroke();
  }
  sc.c.restore();
  // Lado liso: brilho de pedra molhada, polida pela água.
  const sheen = sc.c.createRadialGradient(cx + smooth[0] * size[0] * 0.25 + 0.6, cy + smooth[1] * size[1] * 0.25 + 0.6, 0.2, cx + smooth[0] * size[0] * 0.25, cy + smooth[1] * size[1] * 0.25, size[1] * 0.6);
  sheen.addColorStop(0, 'rgba(170,190,200,0.28)');
  sheen.addColorStop(1, 'rgba(170,190,200,0)');
  sc.fill(path, sheen);
  // Líquen claro em poucos pontos do topo.
  for (let k = 0; k < 18; k++) {
    const p: Vec = [cx + rng.gauss() * size[0] * 0.18, cy + rng.gauss() * size[1] * 0.18];
    sc.fill(polyPath(blobPoly(p, rng.range(0.05, 0.18), () => rng.next(), { rough: 0.6, points: 9 })), `rgba(150,156,120,${rng.range(0.25, 0.5)})`);
  }
  sc.c.restore();
  sc.stroke(path, 'rgba(0,0,0,0.6)', 0.04);

  // Altura analítica: sobe da borda ao topo, lisa de um lado, áspera do outro.
  const { ppm, W } = sc;
  const px0 = Math.max(0, Math.floor(x0 * ppm));
  const py0 = Math.max(0, Math.floor(y0 * ppm));
  const px1 = Math.min(sc.W, Math.ceil(x1 * ppm));
  const py1 = Math.min(sc.H, Math.ceil(y1 * ppm));
  const n = sc.noise;
  const segs = outline.map((p, i) => [p, outline[(i + 1) % outline.length]] as [Vec, Vec]);
  for (let j = py0; j < py1; j++) {
    for (let i = px0; i < px1; i++) {
      const p: Vec = [(i + 0.5) / ppm, (j + 0.5) / ppm];
      if (!pointInPoly(p, outline)) continue;
      let d = Infinity;
      for (const [a, b] of segs) d = Math.min(d, segDist(p, a, b).d);
      const lx = (p[0] - cx) * Math.cos(-rot) - (p[1] - cy) * Math.sin(-rot);
      const side = (lx / (size[0] / 2)) * (cracked[0] || 1);
      const ramp = Math.min(1, d / (Math.min(size[0], size[1]) * 0.42));
      const rough = side > 0 ? (n.at(p[0] * 3, p[1] * 3) - 0.5) * 0.35 * side + (n.at(p[0] * 9, p[1] * 9) - 0.5) * 0.12 : (n.at(p[0] * 0.8, p[1] * 0.8) - 0.5) * 0.15;
      const h = Hmax * Math.pow(ramp, 0.6) * (0.85 + n.fbm(p[0] * 0.4, p[1] * 0.4, 2) * 0.3) + rough * Math.min(1, d * 2);
      const k = j * W + i;
      if (h > sc.hfield[k]) sc.hfield[k] = h;
    }
  }
  sc.occupied.push({ poly: outline, kind: 'outcrop' });

  // Fio d'água: do alto da pedra até o chão, molhando por onde passa.
  const water = f.water;
  if (water) {
    const from = water.from as Vec;
    const to = water.trickle_to as Vec;
    const pts: Vec[] = [from];
    for (let k = 1; k < 6; k++) {
      const t = k / 6;
      pts.push([from[0] + (to[0] - from[0]) * t + rng.range(-0.5, 0.5), from[1] + (to[1] - from[1]) * t + rng.range(-0.5, 0.5)]);
    }
    pts.push(to);
    const smoothPts = smoothPolyline(pts, 10);
    const line = (width: number, style: string) => {
      sc.c.strokeStyle = style;
      sc.c.lineWidth = width;
      sc.c.lineCap = 'round';
      sc.c.lineJoin = 'round';
      sc.c.beginPath();
      smoothPts.forEach(([x, y], i) => (i ? sc.c.lineTo(x, y) : sc.c.moveTo(x, y)));
      sc.c.stroke();
    };
    line(water.width_m * 3.2, 'rgba(6,10,10,0.45)');
    line(water.width_m * 1.6, 'rgba(10,16,18,0.6)');
    if (water.wet_glow) line(water.width_m * 1.2, `rgba(150,200,210,${water.wet_glow === 'subtle' ? 0.16 : 0.3})`);
    line(water.width_m * 0.45, 'rgba(160,195,205,0.55)');
    for (let k = 0; k < smoothPts.length; k += 4) {
      const [x, y] = smoothPts[k];
      sc.fill(circlePath(x + rng.range(-0.05, 0.05), y + rng.range(-0.05, 0.05), water.width_m * 0.12), 'rgba(235,245,250,0.7)');
    }
    // Poça rasa onde o fio termina.
    sc.fill(ellipsePath(to[0], to[1], 0.7, 0.45, rng.angle()), 'rgba(20,34,32,0.65)');
    sc.fill(ellipsePath(to[0] - 0.12, to[1] - 0.1, 0.35, 0.18, -0.6), 'rgba(170,200,210,0.25)');
  }
}

/** Fenda na rocha: escura, descendo, borda quebrada, ar morno tremulando. */
function fissureObject(sc: Scene, f: FeatureSpec, rng: Rng) {
  const [w, h] = (f.size as [number, number]) ?? [1, 2];
  const [x, y] = f.at as Vec;
  const rot = f.rot ?? 0;
  const outer = blobPoly([0, 0], h / 2, () => rng.next(), { rough: 0.35, points: 22, stretch: w / h * 0.75 + 0.05 }).map(([px, py]) => [py, px] as Vec);
  sc.push(x, y, rot);
  // Entulho e lascas em volta da boca.
  for (let k = 0; k < 40; k++) {
    const a = rng.angle();
    const r = rng.range(0.55, 1.3);
    const p: Vec = [Math.cos(a) * r * w * 0.6, Math.sin(a) * r * h * 0.55];
    const chip = polyPath(blobPoly(p, rng.range(0.03, 0.12), () => rng.next(), { rough: 0.4, points: 6 }));
    sc.pat(chip, 'basalt_cracked', { brightness: rng.range(-0.1, 0.1) });
    sc.dome(p[0], p[1], 0.1, 0.12, 0.02, 0, chip);
  }
  const lip = polyPath(outer.map(([px, py]) => [px * 1.25, py * 1.12] as Vec));
  sc.fill(lip, 'rgba(30,28,26,0.85)');
  const inner = polyPath(outer);
  const g = sc.c.createRadialGradient(0, 0, 0.02, 0, 0, Math.max(w, h) * 0.5);
  g.addColorStop(0, '#000000');
  g.addColorStop(0.55, '#050505');
  g.addColorStop(0.85, '#1b1714');
  g.addColorStop(1, '#3a332c');
  sc.fill(inner, g);
  // Paredes da fenda descendo: faixas mais claras na borda de cima (luz rasante).
  sc.stroke(polyPath(outer.map(([px, py]) => [px * 0.92, py * 0.95] as Vec)), 'rgba(90,80,70,0.35)', 0.05);
  sc.pop();
  // O fundo é um buraco: zera a altura dentro (o relevo vira um degrau fundo).
  const cosr = Math.cos((rot * Math.PI) / 180);
  const sinr = Math.sin((rot * Math.PI) / 180);
  const world = outer.map(([px, py]) => [x + px * cosr - py * sinr, y + px * sinr + py * cosr] as Vec);
  const [bx0, by0, bx1, by1] = polyBounds(world);
  for (let j = Math.floor(by0 * sc.ppm); j < Math.ceil(by1 * sc.ppm); j++) {
    for (let i = Math.floor(bx0 * sc.ppm); i < Math.ceil(bx1 * sc.ppm); i++) {
      if (i < 0 || j < 0 || i >= sc.W || j >= sc.H) continue;
      if (pointInPoly([(i + 0.5) / sc.ppm, (j + 0.5) / sc.ppm], world)) sc.hfield[j * sc.W + i] = 0;
    }
  }
  sc.clearHeights(polyPath(world), polyBounds(world));
  // Ar morno subindo: véu quente e translúcido, levado pelo vento.
  if (f.warm_air_haze) {
    const a = f.warm_air_haze === 'subtle' ? 0.05 : 0.1;
    sc.c.save();
    sc.c.filter = `blur(${sc.blurM(0.5)}px)`;
    for (let k = 0; k < 5; k++) {
      sc.fill(ellipsePath(x - k * 0.35, y - k * 0.3, w * (0.7 + k * 0.25), h * (0.4 + k * 0.12), 0.6), `rgba(255,214,170,${a * (1 - k * 0.15)})`);
    }
    sc.c.restore();
  }
  sc.occupied.push({ poly: orientedRect([x, y], w * 1.4, h * 1.2, rot), kind: 'fissure' });
}

export const FEATURES: Record<string, FeatureDef> = {
  basalt_outcrop: { needs: ['at', 'size'], decal: mossGround, object: outcropObject },
  footpath_faint: {
    needs: ['path'],
    decal(sc, f, rng) {
      const width = f.width_m ?? 0.6;
      footpath(sc, f.path as Vec[], width, rng, f.intensity ?? 'subtle');
      sc.paths.push({ points: f.path as Vec[], width });
    },
  },
  drag_marks: {
    needs: ['path'],
    decal(sc, f, rng) {
      dragMarks(sc, f.path as Vec[], rng, f.intensity ?? 'subtle');
      sc.paths.push({ points: f.path as Vec[], width: 0.5 });
    },
  },
  footprints_bare: {
    needs: ['path'],
    decal(sc, f, rng) {
      footprints(sc, f.path as Vec[], rng, f.intensity ?? 'subtle');
    },
  },
  rock_fissure: { needs: ['at', 'size'], object: fissureObject },
};
