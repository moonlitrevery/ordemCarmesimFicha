// Edificações: piso dos cômodos, paredes (externas do contorno, internas das divisas
// entre cômodos), portas e janelas recortando as paredes, e telhado quando visível.
import { createCanvas } from '@napi-rs/canvas';
import { blobPoly, dist, polyBounds, pointInPoly, rectPoly, segDist, type RectM, type Vec } from './geom';
import type { Rng } from './rng';
import { circlePath, polyPath, rectPath, type Scene } from './scene';
import type { BuildingSpec, DoorSpec, WindowSpec } from './schema';

export const WALL_HEIGHT = 2.8;
const DOOR_HEIGHT = 2.1;
const SILL_HEIGHT = 0.9;
const LINTEL_BOTTOM = 2.2;

export type Side = 'north' | 'south' | 'east' | 'west';

export interface WallSeg {
  a: Vec;
  b: Vec;
  thickness: number;
  exterior: boolean;
  side: Side | null;
  /** Aberturas ao longo do segmento, em metros a partir de `a`. */
  openings: { s0: number; s1: number; kind: 'door' | 'window'; door?: DoorSpec }[];
}

/** Retângulo de parede, para empurrar móveis para fora dela. */
export interface WallBox {
  poly: Vec[];
  seg: WallSeg;
}

function sideOf(normal: Vec): Side {
  const [nx, ny] = normal;
  if (Math.abs(nx) > Math.abs(ny)) return nx > 0 ? 'east' : 'west';
  return ny > 0 ? 'south' : 'north';
}

function centroid(points: Vec[]): Vec {
  const n = points.length;
  return [points.reduce((s, p) => s + p[0], 0) / n, points.reduce((s, p) => s + p[1], 0) / n];
}

/** Paredes: contorno (externas) + divisas entre cômodos que não estão no contorno (internas). */
export function deriveWalls(b: BuildingSpec): WallSeg[] {
  const t = b.wall?.thickness ?? 0.35;
  const tInner = Math.max(0.12, t * 0.6);
  const fp = b.footprint as Vec[];
  const c = centroid(fp);
  const walls: WallSeg[] = fp.map((a, i) => {
    const bb = fp[(i + 1) % fp.length];
    const len = dist(a, bb) || 1;
    let n: Vec = [(bb[1] - a[1]) / len, -(bb[0] - a[0]) / len];
    const mid: Vec = [(a[0] + bb[0]) / 2, (a[1] + bb[1]) / 2];
    if ((mid[0] - c[0]) * n[0] + (mid[1] - c[1]) * n[1] < 0) n = [-n[0], -n[1]];
    return { a, b: bb, thickness: t, exterior: true, side: sideOf(n), openings: [] };
  });

  const onFootprint = (p: Vec, q: Vec) =>
    fp.some((a, i) => {
      const bb = fp[(i + 1) % fp.length];
      return segDist(p, a, bb).d < 0.05 && segDist(q, a, bb).d < 0.05;
    });

  // Divisas: agrupa arestas colineares e une intervalos (a divisa aparece duas vezes).
  const lines = new Map<string, { horizontal: boolean; at: number; spans: [number, number][] }>();
  for (const room of b.rooms ?? []) {
    const [x0, y0, x1, y1] = room.rect;
    const edges: [Vec, Vec][] = [
      [[x0, y0], [x1, y0]],
      [[x0, y1], [x1, y1]],
      [[x0, y0], [x0, y1]],
      [[x1, y0], [x1, y1]],
    ];
    for (const [p, q] of edges) {
      if (onFootprint(p, q)) continue;
      const horizontal = Math.abs(p[1] - q[1]) < 1e-6;
      const at = horizontal ? p[1] : p[0];
      const key = `${horizontal ? 'h' : 'v'}:${at.toFixed(2)}`;
      const span: [number, number] = horizontal
        ? [Math.min(p[0], q[0]), Math.max(p[0], q[0])]
        : [Math.min(p[1], q[1]), Math.max(p[1], q[1])];
      const line = lines.get(key) ?? { horizontal, at, spans: [] };
      line.spans.push(span);
      lines.set(key, line);
    }
  }
  for (const line of lines.values()) {
    const spans = line.spans.sort((p, q) => p[0] - q[0]);
    const merged: [number, number][] = [];
    for (const s of spans) {
      const last = merged[merged.length - 1];
      if (last && s[0] <= last[1] + 0.01) last[1] = Math.max(last[1], s[1]);
      else merged.push([s[0], s[1]]);
    }
    for (const [s0, s1] of merged) {
      const a: Vec = line.horizontal ? [s0, line.at] : [line.at, s0];
      const bb: Vec = line.horizontal ? [s1, line.at] : [line.at, s1];
      walls.push({ a, b: bb, thickness: tInner, exterior: false, side: null, openings: [] });
    }
  }
  return walls;
}

/** Acha a parede de uma porta/janela e a posição dela no segmento. */
function locateOpening(walls: WallSeg[], o: DoorSpec | WindowSpec): { seg: WallSeg; s: number } | null {
  const candidates = walls.filter((w) => {
    if (o.wall) return w.exterior && w.side === o.wall;
    if (o.wall_y !== undefined) return Math.abs(w.a[1] - o.wall_y) < 0.05 && Math.abs(w.b[1] - o.wall_y) < 0.05;
    if (o.wall_x !== undefined) return Math.abs(w.a[0] - o.wall_x) < 0.05 && Math.abs(w.b[0] - o.wall_x) < 0.05;
    return false;
  });
  let best: { seg: WallSeg; s: number; d: number } | null = null;
  for (const seg of candidates) {
    const len = dist(seg.a, seg.b);
    const horizontal = Math.abs(seg.b[0] - seg.a[0]) >= Math.abs(seg.b[1] - seg.a[1]);
    // Posição ao longo: at_x em parede horizontal, at_y em vertical.
    const target = horizontal ? o.at_x : o.at_y;
    if (target === undefined) continue;
    const from = horizontal ? seg.a[0] : seg.a[1];
    const to = horizontal ? seg.b[0] : seg.b[1];
    const s = ((target - from) / (to - from || 1)) * len;
    const d = s < 0 ? -s : s > len ? s - len : 0;
    if (!best || d < best.d) best = { seg, s, d };
  }
  return best && best.d < 0.5 ? { seg: best.seg, s: best.s } : null;
}

export function placeOpenings(b: BuildingSpec, walls: WallSeg[], scene: Scene) {
  for (const door of b.doors ?? []) {
    const hit = locateOpening(walls, door);
    if (!hit) {
      scene.warn(`${b.id}: porta em ${door.wall ?? `x/y ${door.wall_x ?? door.wall_y}`} não caiu em nenhuma parede`);
      continue;
    }
    hit.seg.openings.push({ s0: hit.s - door.width / 2, s1: hit.s + door.width / 2, kind: 'door', door });
  }
  for (const win of b.windows ?? []) {
    const hit = locateOpening(walls, win);
    if (!hit) {
      scene.warn(`${b.id}: janela em ${win.wall ?? 'parede interna'} não caiu em nenhuma parede`);
      continue;
    }
    hit.seg.openings.push({ s0: hit.s - win.width / 2, s1: hit.s + win.width / 2, kind: 'window' });
  }
  for (const w of walls) w.openings.sort((p, q) => p.s0 - q.s0);
}

function segFrame(seg: WallSeg) {
  const len = dist(seg.a, seg.b);
  const angle = (Math.atan2(seg.b[1] - seg.a[1], seg.b[0] - seg.a[0]) * 180) / Math.PI;
  return { len, angle };
}

/** Polígono da parede (com aberturas incluídas), para os móveis não invadirem. */
export function wallBoxes(walls: WallSeg[]): WallBox[] {
  return walls.map((seg) => {
    const { len } = segFrame(seg);
    const ux = (seg.b[0] - seg.a[0]) / len;
    const uy = (seg.b[1] - seg.a[1]) / len;
    const nx = -uy;
    const ny = ux;
    const h = seg.thickness / 2;
    const ext = seg.exterior ? h : 0;
    const p = (s: number, o: number): Vec => [seg.a[0] + ux * s + nx * o, seg.a[1] + uy * s + ny * o];
    return { poly: [p(-ext, -h), p(len + ext, -h), p(len + ext, h), p(-ext, h)], seg };
  });
}

function drawWallPiece(scene: Scene, material: string, s0: number, s1: number, t: number, top = WALL_HEIGHT) {
  if (s1 - s0 < 0.01) return;
  const body = rectPath(s0, -t / 2, s1 - s0, t);
  // Corte da parede visto de cima: reboco claro no miolo, faces escuras dos dois
  // lados (o reboco velho e o tufo aparecendo), como nos mapas do Dungeon Alchemist.
  scene.pat(body, material, { brightness: 0.02 });
  scene.fill(body, 'rgba(70,58,44,0.25)');
  const edge = Math.min(0.05, t * 0.16);
  scene.fill(rectPath(s0, -t / 2, s1 - s0, edge), 'rgba(35,26,18,0.75)');
  scene.fill(rectPath(s0, t / 2 - edge, s1 - s0, edge), 'rgba(35,26,18,0.75)');
  scene.fill(rectPath(s0, -t / 2 + edge, s1 - s0, edge * 0.6), 'rgba(255,240,215,0.18)');
  scene.occlude(body, top);
}

function drawWindow(scene: Scene, s0: number, s1: number, t: number) {
  const w = s1 - s0;
  // Peitoril de pedra, caixilho de madeira e vidro com reflexo do céu.
  scene.fill(rectPath(s0, -t / 2, w, t), '#b9ad98');
  scene.fill(rectPath(s0, -t / 2, w, t * 0.18), '#8d8270');
  scene.fill(rectPath(s0, t / 2 - t * 0.18, w, t * 0.18), '#8d8270');
  const frame = rectPath(s0 + 0.04, -0.06, w - 0.08, 0.12);
  scene.fill(frame, '#5a3d26');
  const glass = scene.c.createLinearGradient(s0, 0, s1, 0);
  glass.addColorStop(0, 'rgba(150,180,200,0.95)');
  glass.addColorStop(0.45, 'rgba(205,225,235,0.95)');
  glass.addColorStop(1, 'rgba(120,150,170,0.95)');
  scene.fill(rectPath(s0 + 0.08, -0.035, w - 0.16, 0.07), glass);
  scene.fill(rectPath(s0 + w / 2 - 0.02, -0.06, 0.04, 0.12), '#4a321f');
  scene.occlude(rectPath(s0, -t / 2, w, t), SILL_HEIGHT);
  scene.occlude(rectPath(s0, -t / 2, w, t), WALL_HEIGHT, LINTEL_BOTTOM);
}

function doorLeaf(scene: Scene, x: number, w: number, glass: boolean, rng: Rng) {
  const leaf = rectPath(x, -0.03, w, 0.06);
  scene.pat(leaf, 'wood_weathered', { rot: 0, brightness: -0.12 });
  scene.stroke(leaf, 'rgba(30,18,10,0.7)', 0.012);
  if (glass) {
    scene.fill(rectPath(x + 0.06, -0.015, w - 0.12, 0.03), 'rgba(170,200,215,0.9)');
  }
  // Maçaneta de latão gasto.
  scene.fill(circlePath(x + (rng.chance(0.5) ? 0.08 : w - 0.08), 0, 0.022), '#b08a3e');
}

function drawDoor(scene: Scene, s0: number, s1: number, t: number, door: DoorSpec, rng: Rng) {
  const w = s1 - s0;
  // Soleira de pedra gasta.
  scene.fill(rectPath(s0 - 0.02, -t / 2 - 0.04, w + 0.04, t + 0.08), '#8f8576');
  scene.fill(rectPath(s0, -t / 2, w, t), '#a59a88');
  scene.stroke(rectPath(s0, -t / 2, w, t), 'rgba(50,40,30,0.4)', 0.015);
  scene.occlude(rectPath(s0, -t / 2, w, t), 0.03);
  if (door.type !== 'open') scene.occlude(rectPath(s0, -t / 2, w, t), WALL_HEIGHT, DOOR_HEIGHT);
  const leafTop = DOOR_HEIGHT;
  switch (door.type) {
    case 'open':
      break;
    case 'swing': {
      // Vaivém de cozinha: duas meias folhas encostadas, uma levemente aberta.
      const half = w / 2;
      scene.push(s0, 0, 0);
      doorLeaf(scene, 0, half, false, rng);
      scene.occlude(rectPath(0, -0.03, half, 0.06), leafTop - 0.6, 0.3);
      scene.pop();
      scene.push(s1, 0, 180 - 18);
      doorLeaf(scene, 0, half, false, rng);
      scene.occlude(rectPath(0, -0.03, half, 0.06), leafTop - 0.6, 0.3);
      scene.pop();
      break;
    }
    case 'wood_glass_double': {
      const half = w / 2;
      doorLeaf(scene, s0, half, true, rng);
      doorLeaf(scene, s0 + half, half, true, rng);
      scene.fill(rectPath(s0 + half - 0.012, -0.035, 0.024, 0.07), '#3a2616');
      scene.occlude(rectPath(s0, -0.03, w, 0.06), leafTop);
      break;
    }
    default: {
      doorLeaf(scene, s0, w, false, rng);
      scene.occlude(rectPath(s0, -0.03, w, 0.06), leafTop);
    }
  }
}

export function drawBuildingInterior(scene: Scene, b: BuildingSpec, walls: WallSeg[], rng: Rng) {
  const fp = b.footprint as Vec[];
  const fpPath = polyPath(fp);
  scene.markIndoor(fpPath);
  scene.clearHeights(fpPath, polyBounds(fp));
  scene.c.save();
  scene.c.clip(fpPath);
  for (const room of b.rooms ?? []) {
    const poly = rectPoly(room.rect);
    scene.material(polyPath(poly), polyBounds(poly), room.floor, { antiTile: true });
    // Encardido junto das paredes: canto de casa velha.
    scene.stain(room.rect as RectM, 'rgb(40,30,20)', 0.18, 0.35, { contrast: 1.6, bias: -0.2 });
  }
  scene.c.restore();

  const material = b.wall?.material ?? 'plaster_tufo_old';
  for (const seg of walls) {
    const { len, angle } = segFrame(seg);
    const t = seg.thickness;
    const ext = seg.exterior ? t / 2 : -0.0;
    scene.push(seg.a[0], seg.a[1], angle);
    let cursor = -ext;
    for (const o of seg.openings) {
      drawWallPiece(scene, material, cursor, o.s0, t);
      if (o.kind === 'window') drawWindow(scene, o.s0, o.s1, t);
      else drawDoor(scene, o.s0, o.s1, t, o.door!, rng);
      cursor = o.s1;
    }
    drawWallPiece(scene, material, cursor, len + ext, t);
    scene.pop();
  }
}

// ---------- Telhado ----------

/**
 * Telhado de quatro águas: a altura num ponto é a do beiral mais a distância até a
 * borda mais próxima vezes a inclinação (é o que o "esqueleto reto" dá em planta
 * ortogonal). A água de cada ponto é a da borda mais próxima.
 */
export function drawRoof(scene: Scene, b: BuildingSpec, rng: Rng) {
  const fp = b.footprint as Vec[];
  const roof = b.roof ?? { show: true };
  const material = roof.material ?? 'terracotta_roof_old';
  const pitch = Math.tan(((roof.pitch_deg ?? 24) * Math.PI) / 180);
  const eave = (b.floors ?? 2) * 3 + 0.4;
  const [x0, y0, x1, y1] = polyBounds(fp);
  const { ppm, W, H } = scene;
  const px0 = Math.max(0, Math.floor(x0 * ppm));
  const py0 = Math.max(0, Math.floor(y0 * ppm));
  const px1 = Math.min(W, Math.ceil(x1 * ppm));
  const py1 = Math.min(H, Math.ceil(y1 * ppm));
  const pw = px1 - px0;
  const ph = py1 - py0;
  if (pw <= 0 || ph <= 0) return;
  const edges = fp.map((a, i) => [a, fp[(i + 1) % fp.length]] as [Vec, Vec]);
  const model = roofModel(fp);

  // Uma camada de textura por água, girada para as telhas descerem até o beiral.
  const facetLayers = model.normals.map((n, i) => {
    const layer = createCanvas(pw, ph);
    const g = layer.getContext('2d');
    g.setTransform(ppm, 0, 0, ppm, -px0, -py0);
    const rot = (Math.atan2(n[1], n[0]) * 180) / Math.PI - 90;
    g.fillStyle = scene.tex.pattern(g, material, { rot, ox: x0, oy: y0, brightness: (i % 2) * 0.015 });
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    return g.getImageData(0, 0, pw, ph).data;
  });

  const out = createCanvas(pw, ph);
  const og = out.getContext('2d');
  const img = og.createImageData(pw, ph);
  const ridgeW = 0.13;
  const noise = scene.noise;
  for (let j = 0; j < ph; j++) {
    const y = (py0 + j + 0.5) / ppm;
    for (let i = 0; i < pw; i++) {
      const x = (px0 + i + 0.5) / ppm;
      if (!pointInPoly([x, y], fp)) continue;
      const hit = model.at([x, y]);
      if (!hit) continue;
      const d1 = hit.d;
      const e1 = hit.facet;
      const d2 = d1 + hit.gap;
      let eaveD = Infinity;
      for (const [ea, eb] of edges) eaveD = Math.min(eaveD, segDist([x, y], ea, eb).d);
      const k = (j * pw + i) * 4;
      const src = facetLayers[e1];
      let r = src[k];
      let g = src[k + 1];
      let bl = src[k + 2];
      // Cumeeira e espigões: fiada de telhas por cima, mais escura e grossa.
      const ridge = Math.max(0, 1 - (d2 - d1) / ridgeW);
      if (ridge > 0) {
        const v = 0.78 + noise.at(x * 9, y * 9) * 0.2;
        r = r * (1 - ridge) + 150 * v * ridge;
        g = g * (1 - ridge) + 72 * v * ridge;
        bl = bl * (1 - ridge) + 50 * v * ridge;
      }
      // Beiral: calha de zinco velha.
      if (eaveD < 0.06) {
        r = 112;
        g = 110;
        bl = 104;
      }
      // Liquens e encardido de telhado velho.
      const lich = noise.fbm(x * 2.2 + 50, y * 2.2, 3) * 0.6 + noise.at(x * 9, y * 9 + 40) * 0.4;
      if (lich > 0.6) {
        const a = Math.min(0.3, (lich - 0.6) * 1.6);
        r = r * (1 - a) + 128 * a;
        g = g * (1 - a) + 122 * a;
        bl = bl * (1 - a) + 92 * a;
      }
      img.data[k] = r;
      img.data[k + 1] = g;
      img.data[k + 2] = bl;
      img.data[k + 3] = 255;
      const hi = (py0 + j) * W + (px0 + i);
      const h = eave + d1 * pitch + ridge * 0.06;
      if (h > scene.hfield[hi]) scene.hfield[hi] = h;
    }
  }
  og.putImageData(img, 0, 0);
  scene.c.drawImage(out, px0 / ppm, py0 / ppm, pw / ppm, ph / ppm);

  const heightAt = (p: Vec) => eave + Math.min(...edges.map(([a, bb]) => segDist(p, a, bb).d)) * pitch;
  const inside = (p: Vec, margin: number) =>
    pointInPoly(p, fp) && Math.min(...edges.map(([a, bb]) => segDist(p, a, bb).d)) > margin;

  // Telhas trocadas (outro tom) e quebradas: telhado de verdade não é uniforme.
  const area = (x1 - x0) * (y1 - y0);
  for (let n = 0; n < area * 0.08; n++) {
    const p: Vec = [rng.range(x0, x1), rng.range(y0, y1)];
    if (!inside(p, 0.3)) continue;
    const s = rng.range(0.15, 0.3);
    scene.fill(rectPath(p[0], p[1], s * 0.6, s), rng.chance(0.6) ? 'rgba(190,96,58,0.55)' : 'rgba(60,40,30,0.45)');
  }

  if (roof.patch === 'blue_tarp') drawTarp(scene, fp, inside, heightAt, rng);

  // Chaminé e antena: ninguém tem telhado liso.
  const chimneys = rng.int(1, area > 80 ? 2 : 1);
  for (let n = 0, tries = 0; n < chimneys && tries < 40; tries++) {
    const p: Vec = [rng.range(x0, x1), rng.range(y0, y1)];
    if (!inside(p, 1.0)) continue;
    n++;
    const h = heightAt(p) + rng.range(0.8, 1.3);
    const w = rng.range(0.5, 0.75);
    const body = rectPath(p[0] - w / 2, p[1] - w / 2, w, w);
    scene.pat(body, 'plaster_tufo_old', { brightness: -0.12 });
    scene.fill(rectPath(p[0] - w / 2 - 0.05, p[1] - w / 2 - 0.05, w + 0.1, w + 0.1), 'rgba(140,70,46,0.9)');
    scene.fill(rectPath(p[0] - w / 2 + 0.08, p[1] - w / 2 + 0.08, w - 0.16, w - 0.16), '#2a221d');
    scene.stain([p[0] - w, p[1] - w, p[0] + w, p[1] + w], 'rgb(20,16,14)', 0.35, 0.2);
    scene.occlude(rectPath(p[0] - w / 2 - 0.05, p[1] - w / 2 - 0.05, w + 0.1, w + 0.1), h);
  }
  if (rng.chance(0.6)) {
    for (let tries = 0; tries < 30; tries++) {
      const p: Vec = [rng.range(x0, x1), rng.range(y0, y1)];
      if (!inside(p, 1.2)) continue;
      const h = heightAt(p) + 2.2;
      const rot = rng.range(0, 180);
      scene.push(p[0], p[1], rot);
      scene.fill(circlePath(0, 0, 0.03), '#6b6b68');
      for (let k = -2; k <= 2; k++) {
        const bar = rectPath(-0.5 + Math.abs(k) * 0.08, k * 0.14, 1 - Math.abs(k) * 0.16, 0.015);
        scene.fill(bar, '#8a8a86');
        scene.occlude(bar, h - Math.abs(k) * 0.05, h - 0.05 - Math.abs(k) * 0.05);
      }
      scene.fill(rectPath(-0.012, -0.32, 0.024, 0.64), '#777773');
      scene.occlude(circlePath(0, 0, 0.03), h);
      scene.pop();
      break;
    }
  }
}

interface RoofHit {
  /** Distância usada para a altura (beiral → cumeeira). */
  d: number;
  /** Água (índice em `normals`). */
  facet: number;
  /** Folga até a segunda água mais próxima: perto de 0 é cumeeira, espigão ou rincão. */
  gap: number;
}

function isConvex(fp: Vec[]): boolean {
  let sign = 0;
  for (let i = 0; i < fp.length; i++) {
    const [ax, ay] = fp[i];
    const [bx, by] = fp[(i + 1) % fp.length];
    const [cx, cy] = fp[(i + 2) % fp.length];
    const z = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (Math.abs(z) < 1e-9) continue;
    if (sign && Math.sign(z) !== sign) return false;
    sign = Math.sign(z);
  }
  return true;
}

/**
 * Modelo do telhado. Planta convexa: a água é a da borda mais próxima. Planta
 * ortogonal em L/T/U: união dos retângulos que cabem nela, e em cada ponto vale o
 * telhado mais alto entre eles; é isso que faz o rincão no canto côncavo.
 */
export function roofModel(fp: Vec[]): { normals: Vec[]; at: (p: Vec) => RoofHit | null } {
  const orthogonal = fp.every((a, i) => {
    const b = fp[(i + 1) % fp.length];
    return Math.abs(a[0] - b[0]) < 1e-6 || Math.abs(a[1] - b[1]) < 1e-6;
  });
  if (isConvex(fp) || !orthogonal) {
    const c = centroid(fp);
    const edges = fp.map((a, i) => [a, fp[(i + 1) % fp.length]] as [Vec, Vec]);
    const normals = edges.map(([a, b]) => {
      const len = dist(a, b) || 1;
      let n: Vec = [(b[1] - a[1]) / len, -(b[0] - a[0]) / len];
      const mid: Vec = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if ((mid[0] - c[0]) * n[0] + (mid[1] - c[1]) * n[1] < 0) n = [-n[0], -n[1]];
      return n;
    });
    return {
      normals,
      at(p) {
        let d1 = Infinity;
        let d2 = Infinity;
        let e1 = 0;
        edges.forEach(([a, b], e) => {
          const d = segDist(p, a, b).d;
          if (d < d1) {
            d2 = d1;
            d1 = d;
            e1 = e;
          } else if (d < d2) d2 = d;
        });
        return { d: d1, facet: e1, gap: d2 - d1 };
      },
    };
  }
  // Retângulos máximos da grade formada pelas coordenadas dos vértices.
  const xs = [...new Set(fp.map((p) => p[0]))].sort((a, b) => a - b);
  const ys = [...new Set(fp.map((p) => p[1]))].sort((a, b) => a - b);
  const cellIn = (i: number, j: number) => pointInPoly([(xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2], fp);
  const rects: [number, number, number, number][] = [];
  for (let i0 = 0; i0 < xs.length - 1; i0++) {
    for (let i1 = i0 + 1; i1 < xs.length; i1++) {
      for (let j0 = 0; j0 < ys.length - 1; j0++) {
        for (let j1 = j0 + 1; j1 < ys.length; j1++) {
          let full = true;
          for (let i = i0; i < i1 && full; i++) for (let j = j0; j < j1 && full; j++) full = cellIn(i, j);
          if (full) rects.push([xs[i0], ys[j0], xs[i1], ys[j1]]);
        }
      }
    }
  }
  const maximal = rects.filter(
    (r) => !rects.some((o) => o !== r && o[0] <= r[0] && o[1] <= r[1] && o[2] >= r[2] && o[3] >= r[3])
  );
  // Águas: norte, sul, leste, oeste.
  const normals: Vec[] = [
    [0, -1],
    [0, 1],
    [1, 0],
    [-1, 0],
  ];
  return {
    normals,
    at([x, y]) {
      let best: RoofHit | null = null;
      // Melhor altura de outro retângulo com outra água (mesma água = mesmo plano).
      const others: RoofHit[] = [];
      for (const [rx0, ry0, rx1, ry1] of maximal) {
        if (x < rx0 || x > rx1 || y < ry0 || y > ry1) continue;
        const ds = [y - ry0, ry1 - y, rx1 - x, x - rx0];
        let f = 0;
        for (let k = 1; k < 4; k++) if (ds[k] < ds[f]) f = k;
        const sorted = ds.slice().sort((a, b) => a - b);
        const hit = { d: ds[f], facet: f, gap: sorted[1] - sorted[0] };
        others.push(hit);
        if (!best || hit.d > best.d) best = hit;
      }
      // Rincão: outro retângulo dá quase a mesma altura, mas em outra água.
      if (best) {
        for (const o of others) if (o.facet !== best.facet) best.gap = Math.min(best.gap, best.d - o.d);
      }
      return best;
    },
  };
}

function drawTarp(scene: Scene, fp: Vec[], inside: (p: Vec, m: number) => boolean, heightAt: (p: Vec) => number, rng: Rng) {
  const [x0, y0, x1, y1] = polyBounds(fp);
  for (let tries = 0; tries < 60; tries++) {
    const p: Vec = [rng.range(x0, x1), rng.range(y0, y1)];
    const w = rng.range(2.4, 3.6);
    const h = rng.range(2.0, 3.0);
    if (!inside(p, Math.max(w, h) / 2 + 0.2)) continue;
    const rot = rng.range(-12, 12);
    scene.push(p[0], p[1], rot);
    const shape = polyPath([
      [-w / 2, -h / 2 + rng.range(-0.1, 0.1)],
      [w / 2, -h / 2 + rng.range(-0.1, 0.1)],
      [w / 2 + rng.range(-0.1, 0.1), h / 2],
      [-w / 2 + rng.range(-0.1, 0.1), h / 2],
    ]);
    scene.fill(shape, '#2f63a6');
    // Dobras: faixas claras e escuras na diagonal.
    scene.c.save();
    scene.c.clip(shape);
    for (let k = 0; k < 14; k++) {
      const x = rng.range(-w / 2, w / 2);
      const gw = rng.range(0.05, 0.22);
      const fold = polyPath([
        [x, -h / 2 - 0.2],
        [x + gw, -h / 2 - 0.2],
        [x + gw + rng.range(-0.6, 0.6), h / 2 + 0.2],
        [x + rng.range(-0.6, 0.6), h / 2 + 0.2],
      ]);
      scene.fill(fold, rng.chance(0.5) ? 'rgba(160,200,240,0.18)' : 'rgba(10,25,60,0.22)');
    }
    scene.c.restore();
    scene.stain([-w / 2, -h / 2, w / 2, h / 2], 'rgb(90,80,60)', 0.3, 0.4, { clip: shape });
    scene.stroke(shape, 'rgba(200,220,240,0.5)', 0.03);
    // Ilhoses e pesos (pneu velho, tijolo) segurando a lona.
    for (const [cx, cy] of [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ] as Vec[]) {
      scene.fill(circlePath(cx * 0.95, cy * 0.95, 0.03), '#c9c9c0');
    }
    const top = heightAt(p);
    for (let k = 0; k < rng.int(2, 4); k++) {
      const q: Vec = [rng.range(-w / 2, w / 2) * 0.8, rng.range(-h / 2, h / 2) * 0.8];
      if (rng.chance(0.5)) {
        scene.fill(circlePath(q[0], q[1], 0.3), '#1d1d1c');
        scene.fill(circlePath(q[0], q[1], 0.16), '#2f63a6');
        scene.stroke(circlePath(q[0], q[1], 0.27), 'rgba(80,80,80,0.6)', 0.02);
        scene.occlude(circlePath(q[0], q[1], 0.3), top + 0.18);
      } else {
        const brick = rectPath(q[0] - 0.12, q[1] - 0.06, 0.24, 0.12);
        scene.fill(brick, '#9b4a33');
        scene.occlude(brick, top + 0.1);
      }
    }
    scene.pop();
    return;
  }
}

/** Mancha de musgo/limo irregular, usada por vários objetos. */
export function mossBlob(scene: Scene, at: Vec, r: number, rng: Rng, alpha = 0.8) {
  const shape = polyPath(blobPoly(at, r, () => rng.next(), { rough: 0.5 }));
  scene.pat(shape, 'moss', { alpha });
}
