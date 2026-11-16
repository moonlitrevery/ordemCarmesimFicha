// Vegetação: árvores com copa irregular em camadas de folhas (luz e sombra interna saem
// do mapa de alturas), moitas de amora-brava e arvoretas. Copas ficam por cima de tudo.
import { createCanvas, DOMMatrix, type Canvas } from '@napi-rs/canvas';
import { blobPoly, dist, pointInPoly, segDist, type Vec } from './geom';
import type { Rng } from './rng';
import { circlePath, ellipsePath, polyPath, type Scene } from './scene';
import type { VegetationSpec } from './schema';
import { jitter, rgb, shadeRgb, type RGB } from './props/kit';

interface Species {
  /** Diâmetro de copa padrão (m). */
  size: [number, number];
  /** Altura = diâmetro × fator. */
  heightK: [number, number];
  /** Altura da base da copa, fração da altura. */
  baseK: number;
  palette: RGB[];
  /** Folhas de outono misturadas (castanheiro em outubro). */
  autumn?: RGB[];
  autumnRate?: number;
  leaf: [number, number];
  needles?: boolean;
  clumps: [number, number];
  rough: number;
  /** Arbusto: coluna cheia até o chão. */
  shrub?: boolean;
  berries?: RGB;
}

const SPECIES: Record<string, Species> = {
  chestnut_tree: {
    size: [7, 11],
    heightK: [1.15, 1.45],
    baseK: 0.32,
    palette: [
      [44, 66, 28],
      [58, 84, 34],
      [74, 100, 42],
      [52, 76, 30],
    ],
    autumn: [
      [150, 124, 46],
      [170, 132, 52],
      [132, 96, 40],
    ],
    autumnRate: 0.16,
    leaf: [0.16, 0.055],
    clumps: [9, 15],
    rough: 0.28,
  },
  oak_tree: {
    size: [6, 10],
    heightK: [1.1, 1.35],
    baseK: 0.3,
    palette: [
      [56, 74, 32],
      [70, 88, 38],
      [86, 102, 46],
      [64, 80, 36],
    ],
    autumn: [
      [120, 100, 46],
      [104, 84, 40],
    ],
    autumnRate: 0.08,
    leaf: [0.08, 0.05],
    clumps: [10, 18],
    rough: 0.4,
  },
  maritime_pine: {
    size: [7, 11],
    heightK: [1.5, 1.9],
    baseK: 0.55,
    palette: [
      [36, 58, 42],
      [48, 72, 50],
      [62, 86, 58],
    ],
    leaf: [0.12, 0.012],
    needles: true,
    clumps: [7, 11],
    rough: 0.45,
  },
  young_tree: {
    size: [2.5, 4.5],
    heightK: [1.2, 1.6],
    baseK: 0.3,
    palette: [
      [72, 104, 44],
      [90, 122, 52],
      [62, 92, 40],
    ],
    autumn: [[150, 140, 60]],
    autumnRate: 0.1,
    leaf: [0.09, 0.04],
    clumps: [4, 7],
    rough: 0.35,
  },
  shrub_bramble: {
    size: [1.6, 4],
    heightK: [0.35, 0.55],
    baseK: 0,
    palette: [
      [40, 58, 30],
      [54, 72, 36],
      [70, 74, 40],
      [64, 50, 44],
    ],
    leaf: [0.06, 0.04],
    clumps: [3, 7],
    rough: 0.5,
    shrub: true,
    berries: [36, 20, 34],
  },
};

export const VEGETATION = Object.keys(SPECIES);

/** Ladrilho de folhagem (repetível) de uma espécie, já na escala do mapa. */
function foliageTile(sc: Scene, sp: Species, rng: Rng, autumn: boolean): Canvas {
  const sizeM = 2.4;
  const px = Math.max(16, Math.round(sizeM * sc.ppm));
  const c = createCanvas(px, px);
  const g = c.getContext('2d');
  g.setTransform(sc.ppm, 0, 0, sc.ppm, 0, 0);
  g.fillStyle = rgb(shadeRgb(sp.palette[0], 0.5));
  g.fillRect(0, 0, sizeM, sizeM);
  const [ll, lw] = sp.leaf;
  const n = Math.round(((sizeM * sizeM) / (ll * Math.max(lw, 0.03))) * (sp.needles ? 0.35 : 1.3));
  for (let k = 0; k < n; k++) {
    const x = rng.range(0, sizeM);
    const y = rng.range(0, sizeM);
    const layer = k / n;
    const useAutumn = autumn && sp.autumn && rng.chance(sp.autumnRate ?? 0);
    const base = useAutumn ? rng.pick(sp.autumn!) : rng.pick(sp.palette);
    const col = rgb(shadeRgb(jitter(rng, base, 0.08), 0.62 + layer * 0.45));
    const a = rng.angle();
    for (const [ox, oy] of [
      [0, 0],
      [-sizeM, 0],
      [sizeM, 0],
      [0, -sizeM],
      [0, sizeM],
    ]) {
      if (ox && Math.abs(x + ox - sizeM / 2) > sizeM / 2 + ll) continue;
      if (oy && Math.abs(y + oy - sizeM / 2) > sizeM / 2 + ll) continue;
      if (sp.needles) {
        // Tufo de agulhas: traços finos saindo de um ponto.
        g.strokeStyle = col;
        g.lineWidth = lw;
        g.beginPath();
        for (let t = 0; t < 7; t++) {
          const b = a + (t / 7) * Math.PI * 2;
          g.moveTo(x + ox, y + oy);
          g.lineTo(x + ox + Math.cos(b) * ll, y + oy + Math.sin(b) * ll);
        }
        g.stroke();
      } else {
        g.fillStyle = col;
        g.beginPath();
        g.ellipse(x + ox, y + oy, ll * rng.range(0.7, 1.2), lw * rng.range(0.8, 1.2), a, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  return c;
}

const tiles = new WeakMap<Scene, Map<string, Canvas[]>>();

function tilesFor(sc: Scene, type: string, sp: Species, rng: Rng): Canvas[] {
  let bySpecies = tiles.get(sc);
  if (!bySpecies) {
    bySpecies = new Map();
    tiles.set(sc, bySpecies);
  }
  let list = bySpecies.get(type);
  if (!list) {
    list = [foliageTile(sc, sp, rng.fork('tile0'), false), foliageTile(sc, sp, rng.fork('tile1'), true)];
    bySpecies.set(type, list);
  }
  return list;
}

/** Uma planta: tufos de copa (do mais baixo e de fora para o mais alto e central). */
export function drawPlant(sc: Scene, type: string, at: Vec, diameter: number, rng: Rng) {
  const sp = SPECIES[type];
  const R = diameter / 2;
  const H = diameter * rng.range(sp.heightK[0], sp.heightK[1]);
  const bottom = sp.shrub ? 0 : H * sp.baseK;
  const [t0, t1] = tilesFor(sc, type, sp, rng);
  const n = rng.int(sp.clumps[0], sp.clumps[1]);
  const clumps: { c: Vec; r: number; top: number }[] = [];
  // Tufos em volta (mais baixos) e no meio (mais altos), raio ~ R·(0,35..0,55).
  for (let k = 0; k < n; k++) {
    const ring = k === 0 ? 0 : Math.sqrt(rng.next()) * 0.62;
    const a = rng.angle();
    const r = R * (k === 0 ? rng.range(0.5, 0.62) : rng.range(0.3, 0.5));
    const c: Vec = [at[0] + Math.cos(a) * R * ring, at[1] + Math.sin(a) * R * ring];
    const top = H - ring * R * rng.range(0.5, 0.9);
    clumps.push({ c, r, top });
  }
  clumps.sort((p, q) => p.top - q.top);
  // Galhos aparecendo entre os tufos do pinheiro.
  if (sp.needles) {
    for (let k = 0; k < 7; k++) {
      const a = rng.angle();
      sc.c.strokeStyle = 'rgba(80,58,40,0.9)';
      sc.c.lineWidth = rng.range(0.08, 0.16);
      sc.c.beginPath();
      sc.c.moveTo(at[0], at[1]);
      sc.c.quadraticCurveTo(at[0] + Math.cos(a + 0.3) * R * 0.4, at[1] + Math.sin(a + 0.3) * R * 0.4, at[0] + Math.cos(a) * R * 0.85, at[1] + Math.sin(a) * R * 0.85);
      sc.c.stroke();
    }
    sc.fill(circlePath(at[0], at[1], 0.25), '#5a4030');
    sc.occlude(circlePath(at[0], at[1], 0.25), bottom);
  }
  for (const cl of clumps) {
    const outline = polyPath(blobPoly(cl.c, cl.r, () => rng.next(), { rough: sp.rough, points: 22 }));
    const tile = rng.chance(sp.autumn ? 0.45 : 0) ? t1 : t0;
    const pat = sc.c.createPattern(tile, 'repeat');
    const ang = rng.range(0, 360);
    pat.setTransform(new DOMMatrix().translate(rng.range(0, 3), rng.range(0, 3)).rotate(ang).scale(1 / sc.ppm));
    sc.c.fillStyle = pat;
    sc.c.fill(outline);
    // Borda recortada de folhas soltas: a copa não termina numa linha.
    const edgeLeaves = Math.round(cl.r * 40);
    for (let k = 0; k < edgeLeaves; k++) {
      const a = rng.angle();
      const rr = cl.r * rng.range(0.92, 1.12);
      const col = rgb(shadeRgb(jitter(rng, rng.pick(sp.palette), 0.08), rng.range(0.75, 1.15)));
      sc.fill(ellipsePath(cl.c[0] + Math.cos(a) * rr, cl.c[1] + Math.sin(a) * rr, sp.leaf[0] * 0.9, Math.max(sp.leaf[1], 0.025), a), col);
    }
    // Miolo mais escuro e borda virada para fora mais clara (volume da folhagem).
    const g = sc.c.createRadialGradient(cl.c[0], cl.c[1], cl.r * 0.1, cl.c[0], cl.c[1], cl.r * 1.05);
    g.addColorStop(0, 'rgba(255,255,220,0.06)');
    g.addColorStop(0.75, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.25)');
    sc.fill(outline, g);
    if (sp.berries) {
      for (let k = 0; k < cl.r * cl.r * 40; k++) {
        const a = rng.angle();
        const rr = Math.sqrt(rng.next()) * cl.r * 0.9;
        sc.fill(circlePath(cl.c[0] + Math.cos(a) * rr, cl.c[1] + Math.sin(a) * rr, 0.018), rgb(jitter(rng, sp.berries, 0.2)));
      }
      // Ramos espinhosos arroxeados saindo da moita.
      for (let k = 0; k < cl.r * 6; k++) {
        const a = rng.angle();
        const p0: Vec = [cl.c[0] + Math.cos(a) * cl.r * 0.6, cl.c[1] + Math.sin(a) * cl.r * 0.6];
        sc.c.strokeStyle = 'rgba(110,60,70,0.8)';
        sc.c.lineWidth = 0.02;
        sc.c.beginPath();
        sc.c.moveTo(p0[0], p0[1]);
        sc.c.quadraticCurveTo(p0[0] + Math.cos(a + 0.5) * 0.4, p0[1] + Math.sin(a + 0.5) * 0.4, p0[0] + Math.cos(a) * cl.r * 0.8, p0[1] + Math.sin(a) * cl.r * 0.8);
        sc.c.stroke();
      }
    }
    sc.dome(cl.c[0], cl.c[1], cl.r * 1.02, cl.top, Math.max(bottom + 0.3, cl.top - cl.r * 0.55), bottom, outline);
  }
}

const DENSITY_COVER = { low: 0.18, medium: 0.5, high: 0.95 } as const;
/** Moita cobre bem menos: "medium" é mancha aqui e ali, não um tapete. */
const SHRUB_COVER = { low: 0.04, medium: 0.1, high: 0.22 } as const;
const DENSITY_OVERLAP = { low: 1.2, medium: 0.8, high: 0.58 } as const;

interface Placed {
  at: Vec;
  r: number;
}

/**
 * Espalha uma entrada de vegetação (disco de Poisson por arremesso de dardos), um
 * dardo por vez: entradas do mesmo tipo de vegetação avançam intercaladas, então a
 * última da lista não fica só com as sobras.
 */
function* scatter(sc: Scene, v: VegetationSpec, placed: Placed[], rng: Rng): Generator<{ at: Vec; d: number } | null, void> {
  const sp = SPECIES[v.type];
  const [dmin, dmax] = (v.size_m as [number, number]) ?? sp.size;
  let x0 = 0;
  let y0 = 0;
  let x1 = sc.widthM;
  let y1 = sc.heightM;
  let inside: (p: Vec) => boolean;
  let area: number;
  if (v.scatter_area) {
    [x0, y0, x1, y1] = v.scatter_area;
    inside = () => true;
    area = (x1 - x0) * (y1 - y0);
  } else {
    const [cx, cy, r] = (v.scatter_outside ?? v.scatter_inside)!;
    const out = Boolean(v.scatter_outside);
    inside = (p) => (Math.hypot(p[0] - cx, p[1] - cy) > r) === out;
    if (!out) {
      x0 = cx - r;
      y0 = cy - r;
      x1 = cx + r;
      y1 = cy + r;
    }
    area = out ? sc.widthM * sc.heightM - Math.PI * r * r : Math.PI * r * r;
  }
  const density = v.density ?? 'medium';
  const avg = (dmin + dmax) / 2;
  const cover = sp.shrub ? SHRUB_COVER[density] : DENSITY_COVER[density];
  const target = v.count ?? Math.round((area * cover) / (Math.PI * (avg / 2) ** 2));
  const overlap = DENSITY_OVERLAP[density];
  let made = 0;
  for (let tries = 0; made < target && tries < target * 60; tries++) {
    const d = rng.range(dmin, dmax);
    const r = d / 2;
    const at: Vec = [rng.range(x0, x1), rng.range(y0, y1)];
    // A borda do mapa pode cortar copa, mas o tronco fica dentro.
    const ok =
      inside(at) &&
      at[0] >= 0.5 && at[1] >= 0.5 && at[0] <= sc.widthM - 0.5 && at[1] <= sc.heightM - 0.5 &&
      !placed.some((p) => dist(p.at, at) < (p.r + r) * overlap) &&
      !sc.occupied.some((o) => pointInPoly(at, o.poly) || nearPoly(o.poly, at, sp.shrub ? r + 0.3 : 1.2)) &&
      !sc.paths.some((path) => pathDistance(path.points, at) < (sp.shrub ? r + path.width : 1.2 + path.width));
    if (!ok) {
      yield null;
      continue;
    }
    placed.push({ at, r });
    made++;
    yield { at, d };
  }
  if (made < target * 0.8) sc.warn(`${v.type}: coube ${made} de ${target} (área cheia)`);
}

function nearPoly(poly: Vec[], p: Vec, margin: number) {
  for (let i = 0; i < poly.length; i++) {
    if (segDist(p, poly[i], poly[(i + 1) % poly.length]).d < margin) return true;
  }
  return false;
}

function pathDistance(points: Vec[], p: Vec) {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) best = Math.min(best, segDist(p, points[i - 1], points[i]).d);
  return best;
}

export function drawVegetation(sc: Scene, list: VegetationSpec[], rng: Rng) {
  const pools = { tree: [] as Placed[], shrub: [] as Placed[] };
  const all: { type: string; at: Vec; d: number }[] = [];
  const running = list.map((v, i) => ({
    type: v.type,
    it: scatter(sc, v, SPECIES[v.type].shrub ? pools.shrub : pools.tree, rng.fork(`scatter:${i}`)),
  }));
  let active = running;
  while (active.length) {
    active = active.filter(({ type, it }) => {
      // Um dardo por entrada por rodada; quem acabou sai.
      const step = it.next();
      if (step.done) return false;
      if (step.value) all.push({ type, ...step.value });
      return true;
    });
  }
  // Moitas primeiro, depois as árvores da mais baixa para a mais alta.
  all.sort((a, b) => {
    const ha = SPECIES[a.type].shrub ? 0 : a.d * SPECIES[a.type].heightK[1];
    const hb = SPECIES[b.type].shrub ? 0 : b.d * SPECIES[b.type].heightK[1];
    return ha - hb;
  });
  all.forEach((p, i) => drawPlant(sc, p.type, p.at, p.d, rng.fork(`plant:${i}`)));
}
