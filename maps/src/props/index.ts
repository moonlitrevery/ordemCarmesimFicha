// Registro de objetos. Cada tipo diz o que exige do YAML e como se desenha.
// Se existir maps/assets/props/<tipo>.png, ele entra no lugar do desenho procedural.
import fs from 'fs';
import path from 'path';
import { createCanvas, loadImage, type Image } from '@napi-rs/canvas';
import { orientedRect, polyBounds, type Vec } from '../geom';
import type { Rng } from '../rng';
import { polyPath, type Scene } from '../scene';
import type { PropSpec } from '../schema';
import { ASSETS_DIR } from '../textures';
import { INTERIOR_PROPS } from './interior';
import { OUTDOOR_PROPS } from './outdoor';
import { STREET_PROPS } from './street';
import { CLUTTER_PROPS } from './clutter';

export interface PropDef {
  needs: readonly (keyof PropSpec)[];
  /** Pegada [largura, profundidade] em metros, no referencial do objeto (rot 0 = frente para o norte). */
  size?: (p: PropSpec) => [number, number];
  /** Altura para o PNG de pack projetar sombra. */
  height?: number;
  /** Encosta na parede e não pode cobrir janela/porta. */
  wallMounted?: boolean;
  /** Ordem: 0 piso (tapete, canteiro), 1 móveis, 2 em cima de outros, 3 por último (bagunça). */
  phase?: number;
  /** Não empurrar para fora da parede (fica em cima de outro objeto). */
  noNudge?: boolean;
  draw(sc: Scene, p: PropSpec, rng: Rng): void;
}

export const PROPS: Record<string, PropDef> = {
  ...INTERIOR_PROPS,
  ...OUTDOOR_PROPS,
  ...STREET_PROPS,
  ...CLUTTER_PROPS,
};

const PROPS_DIR = path.join(ASSETS_DIR, 'props');
const pngCache = new Map<string, Promise<Image | null>>();

function packImage(type: string): Promise<Image | null> {
  let cached = pngCache.get(type);
  if (!cached) {
    const file = path.join(PROPS_DIR, `${type}.png`);
    cached = fs.existsSync(file) ? loadImage(file).then((img) => img as Image) : Promise.resolve(null);
    pngCache.set(type, cached);
  }
  return cached;
}

// ---------- Ajuste fino: nada atravessa parede nem cobre janela ----------

function project(poly: Vec[], axis: Vec): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const [x, y] of poly) {
    const v = x * axis[0] + y * axis[1];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

/** Vetor mínimo para separar dois polígonos convexos (SAT), ou null se não se tocam. */
export function separation(a: Vec[], b: Vec[]): Vec | null {
  let best: Vec | null = null;
  let bestLen = Infinity;
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      const axis: Vec = [-(q[1] - p[1]) / len, (q[0] - p[0]) / len];
      const [a0, a1] = project(a, axis);
      const [b0, b1] = project(b, axis);
      const overlap = Math.min(a1, b1) - Math.max(a0, b0);
      if (overlap <= 0) return null;
      if (overlap < bestLen) {
        bestLen = overlap;
        // Empurra `a` para o lado de onde ele está.
        const dir = (a0 + a1) / 2 < (b0 + b1) / 2 ? -1 : 1;
        best = [axis[0] * overlap * dir, axis[1] * overlap * dir];
      }
    }
  }
  return best;
}

function footprintOf(def: PropDef, p: PropSpec): Vec[] | null {
  if (p.at && def.size) {
    const [w, d] = def.size(p);
    return orientedRect(p.at as Vec, w, d, p.rot ?? 0);
  }
  if (p.rect) {
    const [x0, y0, x1, y1] = p.rect;
    return [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ];
  }
  return null;
}

function shift(p: PropSpec, d: Vec): PropSpec {
  const add = (v?: number[]) => (v ? ([v[0] + d[0], v[1] + d[1]] as [number, number]) : undefined);
  return {
    ...p,
    at: add(p.at),
    rect: p.rect ? [p.rect[0] + d[0], p.rect[1] + d[1], p.rect[2] + d[0], p.rect[3] + d[1]] : undefined,
    path: p.path?.map((v) => add(v)!),
  };
}

/** Faixa do balcão (path + depth) como polígonos convexos, para o ajuste fino. */
function bandPolys(p: PropSpec): Vec[][] {
  if (!p.path || !p.depth) return [];
  const out: Vec[][] = [];
  for (let i = 1; i < p.path.length; i++) {
    const a = p.path[i - 1] as Vec;
    const b = p.path[i] as Vec;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = (-(b[1] - a[1]) / len) * (p.depth / 2);
    const ny = ((b[0] - a[0]) / len) * (p.depth / 2);
    out.push([
      [a[0] + nx, a[1] + ny],
      [b[0] + nx, b[1] + ny],
      [b[0] - nx, b[1] - ny],
      [a[0] - nx, a[1] - ny],
    ]);
  }
  return out;
}

export function nudge(scene: Scene, def: PropDef, p: PropSpec): PropSpec {
  if (def.noNudge || !scene.walls.length) return p;
  let current = p;
  let moved: Vec = [0, 0];
  for (let iter = 0; iter < 4; iter++) {
    const polys = current.path ? bandPolys(current) : [footprintOf(def, current)].filter(Boolean) as Vec[][];
    let push: Vec | null = null;
    for (const poly of polys) {
      for (const wall of scene.walls) {
        const sep = separation(poly, wall.poly);
        if (sep && (!push || Math.hypot(...sep) > Math.hypot(...push))) push = sep;
      }
    }
    if (!push) break;
    const len = Math.hypot(push[0], push[1]);
    const d: Vec = [(push[0] / len) * (len + 0.015), (push[1] / len) * (len + 0.015)];
    current = shift(current, d);
    moved = [moved[0] + d[0], moved[1] + d[1]];
  }
  // Na parede: corre ao longo dela até sair de janelas e portas.
  if (def.wallMounted && current.at) {
    const fp = footprintOf(def, current)!;
    for (const wall of scene.walls) {
      const { seg } = wall;
      const len = Math.hypot(seg.b[0] - seg.a[0], seg.b[1] - seg.a[1]);
      const u: Vec = [(seg.b[0] - seg.a[0]) / len, (seg.b[1] - seg.a[1]) / len];
      const nrm: Vec = [-u[1], u[0]];
      const [n0, n1] = project(fp, nrm);
      const off = seg.a[0] * nrm[0] + seg.a[1] * nrm[1];
      if (Math.min(Math.abs(n0 - off), Math.abs(n1 - off)) > seg.thickness / 2 + 0.3) continue;
      const [s0, s1] = project(fp, u).map((v) => v - (seg.a[0] * u[0] + seg.a[1] * u[1]));
      for (const o of seg.openings) {
        if (s1 <= o.s0 || s0 >= o.s1) continue;
        const left = o.s0 - s1 - 0.05;
        const right = o.s1 - s0 + 0.05;
        const by = Math.abs(left) < Math.abs(right) ? left : right;
        const d: Vec = [u[0] * by, u[1] * by];
        current = shift(current, d);
        moved = [moved[0] + d[0], moved[1] + d[1]];
        break;
      }
    }
  }
  const total = Math.hypot(moved[0], moved[1]);
  if (total > 0.03) {
    scene.warn(`ajuste fino: ${p.type}${p.at ? ` em [${p.at.join(', ')}]` : ''} movido ${total.toFixed(2)} m (${moved[0] >= 0 ? '+' : ''}${moved[0].toFixed(2)}, ${moved[1] >= 0 ? '+' : ''}${moved[1].toFixed(2)}) para não invadir parede/abertura`);
  }
  return current;
}

async function drawPack(scene: Scene, def: PropDef, p: PropSpec, img: Image) {
  const fp = footprintOf(def, p);
  if (!fp) return false;
  const [w, d] = def.size ? def.size(p) : [p.rect![2] - p.rect![0], p.rect![3] - p.rect![1]];
  const center: Vec = p.at ? (p.at as Vec) : [(p.rect![0] + p.rect![2]) / 2, (p.rect![1] + p.rect![3]) / 2];
  scene.push(center[0], center[1], p.rot ?? 0);
  scene.c.drawImage(img, -w / 2, -d / 2, w, d);
  // Silhueta do PNG no mapa de alturas: o pack também projeta sombra.
  const sil = createCanvas(img.width, img.height);
  const g = sil.getContext('2d');
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = scene.gray(def.height ?? 0.8);
  g.fillRect(0, 0, img.width, img.height);
  scene.s.drawImage(sil, -w / 2, -d / 2, w, d);
  scene.pop();
  return true;
}

export async function drawProps(scene: Scene, props: PropSpec[], rng: Rng) {
  const ordered = props
    .map((p, i) => ({ p, i, def: PROPS[p.type] }))
    .filter((x) => x.def)
    .sort((a, b) => (a.def.phase ?? 1) - (b.def.phase ?? 1) || a.i - b.i);
  for (const { p, i, def } of ordered) {
    const placed = nudge(scene, def, p);
    const pr = rng.fork(`${p.type}:${i}`);
    const img = await packImage(p.type);
    if (img && (await drawPack(scene, def, placed, img))) continue;
    def.draw(scene, placed, pr);
    const fp = footprintOf(def, placed);
    if (fp) scene.occupied.push({ poly: fp, kind: p.type });
  }
}

/** Polígono → bounds, atalho dos desenhistas. */
export function boundsOf(points: Vec[]) {
  return polyBounds(points);
}

export { polyPath };
