// Objetos de quintal, calçada e praça.
import { blobPoly, dist, type Vec } from '../geom';
import type { Rng } from '../rng';
import type { Scene } from '../scene';
import type { PropSpec } from '../schema';
import type { PropDef } from './index';
import {
  circlePath,
  ellipsePath,
  fabric,
  jitter,
  leafCluster,
  metal,
  plasticChair,
  polyPath,
  rectPath,
  rgb,
  shadeRgb,
  type RGB,
} from './kit';
import { mossBlob } from '../buildings';

/** Folhagem de cada erva: cor, tamanho da folha, formato. */
const HERBS: Record<string, { palette: RGB[]; leaf: number; elong: number; height: number; flowers?: RGB[] }> = {
  manjericao: { palette: [[70, 130, 44], [88, 148, 52], [60, 112, 38]], leaf: 0.035, elong: 0.65, height: 0.4 },
  alecrim: { palette: [[70, 96, 70], [86, 110, 82], [60, 84, 62]], leaf: 0.025, elong: 0.18, height: 0.55, flowers: [[150, 160, 220]] },
  oregano: { palette: [[84, 116, 52], [96, 128, 60]], leaf: 0.014, elong: 0.8, height: 0.3, flowers: [[230, 210, 230]] },
  salsa: { palette: [[52, 120, 40], [64, 136, 46], [44, 104, 34]], leaf: 0.02, elong: 0.9, height: 0.3 },
  salvia: { palette: [[122, 138, 112], [138, 150, 126], [110, 124, 100]], leaf: 0.035, elong: 0.5, height: 0.4 },
  tomilho: { palette: [[90, 110, 70], [104, 122, 80]], leaf: 0.01, elong: 0.7, height: 0.2, flowers: [[210, 180, 220]] },
};

const herbBed: PropDef = {
  needs: ['rect'],
  phase: 0,
  draw(sc, p, rng) {
    const [x0, y0, x1, y1] = p.rect!;
    const w = x1 - x0;
    const d = y1 - y0;
    // Caixa de tábua velha com terra escura revolvida.
    const frame = rectPath(x0, y0, w, d);
    sc.pat(frame, 'wood_weathered', { rot: 0, brightness: -0.05 });
    sc.stroke(frame, 'rgba(30,20,10,0.8)', 0.02);
    const soil = rectPath(x0 + 0.07, y0 + 0.07, w - 0.14, d - 0.14);
    sc.pat(soil, 'soil', { brightness: -0.05 });
    sc.occlude(frame, 0.28);
    sc.clearHeights(soil, [x0, y0, x1, y1]);
    sc.occlude(soil, 0.22);
    const plants = p.plants?.length ? p.plants : ['manjericao'];
    const part = (w - 0.2) / plants.length;
    plants.forEach((name, i) => {
      const herb = HERBS[name] ?? HERBS.manjericao;
      const cx0 = x0 + 0.1 + part * i;
      // Mudas em fileira, cada uma uma moita.
      const cols = Math.max(1, Math.round(part / 0.32));
      const rows = Math.max(1, Math.round((d - 0.2) / 0.32));
      for (let a = 0; a < cols; a++) {
        for (let b = 0; b < rows; b++) {
          if (rng.chance(0.08)) continue;
          const cx = cx0 + (part / cols) * (a + 0.5) + rng.range(-0.04, 0.04);
          const cy = y0 + 0.1 + ((d - 0.2) / rows) * (b + 0.5) + rng.range(-0.04, 0.04);
          leafCluster(sc, cx, cy, rng.range(0.11, 0.15), herb.palette, rng, {
            leaf: herb.leaf,
            elong: herb.elong,
            height: herb.height,
            base: 0.22,
            flowers: herb.flowers,
            flowerRate: 0.05,
          });
        }
      }
    });
  },
};

const POT_PLANTS: { palette: RGB[]; flowers?: RGB[]; leaf: number }[] = [
  { palette: [[60, 110, 40], [80, 130, 50]], flowers: [[200, 40, 40], [220, 60, 60]], leaf: 0.03 },
  { palette: [[50, 100, 40], [70, 120, 50]], flowers: [[230, 230, 240]], leaf: 0.025 },
  { palette: [[90, 120, 60], [70, 100, 50]], leaf: 0.04 },
  { palette: [[46, 96, 44], [60, 116, 52]], flowers: [[220, 120, 170]], leaf: 0.03 },
];

export function terracottaPot(sc: Scene, [x, y]: Vec, r: number, rng: Rng, plant = true) {
  const g = sc.c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
  const c = jitter(rng, [176, 92, 58], 0.08);
  g.addColorStop(0, rgb(shadeRgb(c, 1.15)));
  g.addColorStop(1, rgb(shadeRgb(c, 0.7)));
  const pot = circlePath(x, y, r);
  sc.fill(pot, g);
  sc.stroke(circlePath(x, y, r * 0.88), rgb(shadeRgb(c, 0.6), 0.8), r * 0.06);
  // Crosta branca de calcário e limo na borda.
  sc.stroke(circlePath(x, y, r * 0.95), 'rgba(230,225,200,0.25)', r * 0.05);
  sc.fill(circlePath(x, y, r * 0.82), '#3b2b20');
  sc.occlude(pot, r * 1.4);
  if (plant && rng.chance(0.9)) {
    const kind = rng.pick(POT_PLANTS);
    leafCluster(sc, x + rng.range(-0.02, 0.02), y + rng.range(-0.02, 0.02), r * rng.range(0.9, 1.25), kind.palette, rng, {
      leaf: kind.leaf,
      height: r * 1.4 + 0.25,
      base: r * 1.4,
      flowers: kind.flowers,
      flowerRate: 0.12,
    });
  }
}

const terracottaPots: PropDef = {
  needs: ['area'],
  phase: 1,
  draw(sc, p, rng) {
    const [x0, y0, x1, y1] = p.area!;
    const count = p.count ?? 6;
    const placed: { at: Vec; r: number }[] = [];
    for (let tries = 0; placed.length < count && tries < count * 60; tries++) {
      // Vasos tendem a ficar em grupos e junto das bordas.
      const r = rng.range(0.15, 0.3);
      const at: Vec = [rng.range(x0 + r, x1 - r), rng.range(y0 + r, y1 - r)];
      if (placed.some((q) => dist(q.at, at) < q.r + r + 0.06)) continue;
      if (sc.occupied.some((o) => pointNear(o.poly, at, r))) continue;
      if (placed.length && rng.chance(0.6) && !placed.some((q) => dist(q.at, at) < q.r + r + 0.6)) continue;
      placed.push({ at, r });
    }
    for (const q of placed) terracottaPot(sc, q.at, q.r, rng);
    for (const q of placed) sc.occupied.push({ poly: circlePoly(q.at, q.r), kind: 'pot' });
  },
};

function circlePoly([x, y]: Vec, r: number): Vec[] {
  return Array.from({ length: 8 }, (_, i) => [x + Math.cos((i / 8) * Math.PI * 2) * r, y + Math.sin((i / 8) * Math.PI * 2) * r] as Vec);
}

function pointNear(poly: Vec[], [x, y]: Vec, r: number) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return x > Math.min(...xs) - r && x < Math.max(...xs) + r && y > Math.min(...ys) - r && y < Math.max(...ys) + r;
}

const CLOTHES: RGB[] = [
  [236, 234, 226],
  [200, 60, 50],
  [60, 90, 150],
  [230, 200, 90],
  [120, 150, 110],
  [240, 240, 240],
  [90, 70, 110],
];

/** Varal: fio entre dois pontos a `height`, com roupa pendurada (lençol, camisa, toalha). */
export function hangLine(sc: Scene, a: Vec, b: Vec, height: number, rng: Rng, clothes: boolean, posts: boolean) {
  const len = dist(a, b);
  const angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  sc.push(a[0], a[1], angle);
  if (posts) {
    for (const x of [0, len]) {
      sc.fill(circlePath(x, 0, 0.05), '#5b4a3a');
      sc.fill(rectPath(x - 0.25, -0.02, 0.5, 0.04), '#5b4a3a');
      sc.occlude(circlePath(x, 0, 0.05), height + 0.1);
      sc.occlude(rectPath(x - 0.25, -0.02, 0.5, 0.04), height + 0.1, height);
    }
  }
  sc.stroke(polyPath([[0, 0], [len, 0]]), 'rgba(220,220,210,0.85)', 0.012);
  sc.occlude(rectPath(0, -0.006, len, 0.012), height, height - 0.02);
  if (clothes) {
    let x = rng.range(0.3, 0.8);
    while (x < len - 0.4) {
      const kind = rng.int(0, 3);
      const w = kind === 0 ? rng.range(1.2, 1.8) : kind === 1 ? rng.range(0.45, 0.6) : rng.range(0.3, 0.5);
      if (x + w > len - 0.2) break;
      // Vista de cima a roupa é uma faixa fina dobrada no fio; um pouco de vento a abre.
      const open = rng.range(0.06, 0.16);
      const piece = polyPath([
        [x, -0.02],
        [x + w, -0.02],
        [x + w + rng.range(-0.03, 0.03), open],
        [x + rng.range(-0.03, 0.03), open],
      ]);
      fabric(sc, piece, w, open, jitter(rng, rng.pick(CLOTHES), 0.06), rng, { creases: 0, folds: true });
      sc.stroke(piece, 'rgba(0,0,0,0.25)', 0.006);
      for (const px of [x + 0.03, x + w - 0.03]) sc.fill(rectPath(px - 0.012, -0.02, 0.024, 0.03), rgb(rng.pick(CLOTHES)));
      const drop = kind === 0 ? 1.0 : kind === 1 ? 0.65 : 0.4;
      sc.occlude(piece, height, height - drop);
      x += w + rng.range(0.1, 0.5);
    }
  }
  sc.pop();
}

const clothesline: PropDef = {
  needs: ['from', 'to'],
  phase: 3,
  draw(sc, p, rng) {
    hangLine(sc, p.from as Vec, p.to as Vec, 1.85, rng, p.clothes ?? true, true);
  },
};

const plasticChairProp: PropDef = {
  needs: ['at'],
  size: () => [0.55, 0.55],
  draw(sc, p, rng) {
    sc.frame(p.at![0], p.at![1], p.rot ?? rng.range(0, 360), () => plasticChair(sc, rng));
  },
};

const bistroTable: PropDef = {
  needs: ['at'],
  size: () => [0.62, 0.62],
  draw(sc, p, rng) {
    const [x, y] = p.at!;
    sc.fill(circlePath(x, y, 0.22), '#3a3a3a');
    const top = circlePath(x, y, 0.31);
    metal(sc, top, 0.62, 0.62, [70, 82, 76], rng, { streaks: false });
    sc.stroke(circlePath(x, y, 0.29), 'rgba(30,34,32,0.9)', 0.02);
    // Ferrugem e marca de copo.
    sc.stain([x - 0.3, y - 0.3, x + 0.3, y + 0.3], 'rgb(120,70,40)', 0.35, 0.06, { clip: top });
    sc.stroke(circlePath(x + rng.range(-0.1, 0.1), y + rng.range(-0.1, 0.1), 0.035), 'rgba(40,30,20,0.25)', 0.006);
    sc.occlude(top, 0.74, 0.7);
    sc.occlude(circlePath(x, y, 0.04), 0.7);
    sc.surfaces.push({ poly: circlePoly([x, y], 0.22), top: 0.74, kind: 'table' });
  },
};

/** Placa esmaltada velha encostada na fachada: cores lascadas, sem letra nenhuma. */
const signEnamelOld: PropDef = {
  needs: ['at'],
  size: () => [0.7, 0.3],
  draw(sc, p, rng) {
    sc.frame(p.at![0], p.at![1], p.rot ?? rng.range(-6, 6), () => {
      const plate = rectPath(-0.35, -0.12, 0.7, 0.24, 0.02);
      sc.fill(plate, '#e8dfc8');
      sc.stroke(rectPath(-0.32, -0.095, 0.64, 0.19, 0.015), '#9b2a24', 0.025);
      // Faixas de cor no lugar das letras (só manchas, nada legível).
      sc.fill(rectPath(-0.24, -0.04, 0.48, 0.03), 'rgba(40,60,110,0.55)');
      sc.fill(rectPath(-0.16, 0.02, 0.32, 0.02), 'rgba(40,60,110,0.35)');
      // Lascas de esmalte com ferrugem por baixo.
      for (let k = 0; k < 9; k++) {
        const c: Vec = [rng.range(-0.33, 0.33), rng.range(-0.11, 0.11)];
        const chip = polyPath(blobPoly(c, rng.range(0.01, 0.04), () => rng.next(), { rough: 0.6, points: 8 }));
        sc.fill(chip, rng.chance(0.6) ? '#6e3a1e' : '#2a2a2a');
      }
      sc.stain([-0.35, -0.12, 0.35, 0.12], 'rgb(110,70,40)', 0.35, 0.05, { clip: plate });
      sc.stroke(plate, 'rgba(30,20,10,0.7)', 0.01);
      sc.occlude(plate, 0.7, 0.05);
    });
  },
};

const pottedPlants: PropDef = {
  needs: ['along'],
  draw(sc, p, rng) {
    const pts = p.along as Vec[];
    const count = p.count ?? 3;
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const seg = t * (pts.length - 1);
      const k = Math.min(pts.length - 2, Math.floor(seg));
      const f = seg - k;
      const at: Vec = [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f];
      terracottaPot(sc, at, rng.range(0.22, 0.32), rng);
    }
  },
};

/** Banco de pedra com assento de ripas de madeira, sem encosto. */
const benchStoneWood: PropDef = {
  needs: ['at'],
  size: () => [1.9, 0.55],
  draw(sc, p, rng) {
    sc.frame(p.at![0], p.at![1], p.rot ?? 0, () => {
      for (const x of [-0.75, 0.75]) {
        const leg = rectPath(x - 0.18, -0.27, 0.36, 0.54, 0.03);
        sc.pat(leg, 'basalt_rock', { brightness: 0.05 });
        sc.stroke(leg, 'rgba(15,15,15,0.7)', 0.015);
        sc.occlude(leg, 0.42);
      }
      for (let k = 0; k < 4; k++) {
        const slat = rectPath(-0.95, -0.24 + k * 0.125, 1.9, 0.1, 0.015);
        sc.pat(slat, 'wood_weathered', { rot: 0, brightness: 0.05 + rng.range(-0.05, 0.05) });
        sc.stroke(slat, 'rgba(30,20,10,0.75)', 0.01);
        sc.occlude(slat, 0.46, 0.4);
      }
      sc.stain([-0.95, -0.27, 0.95, 0.27], 'rgb(200,200,190)', 0.15, 0.08);
    });
  },
};

/** Fonte de pedra vulcânica: bacia com água, coluna e bica, musgo, gotejando. */
const fountainVolcanic: PropDef = {
  needs: ['at'],
  size: (p) => [(p.basin_radius ?? 1.5) * 2 + 0.7, (p.basin_radius ?? 1.5) * 2 + 0.7],
  draw(sc, p, rng) {
    const [x, y] = p.at!;
    const R = p.basin_radius ?? 1.5;
    const moss = p.moss === 'heavy' ? 0.85 : p.moss === 'medium' ? 0.55 : p.moss === 'light' ? 0.3 : 0;
    // Chão molhado e limo em volta (pisoteado onde a água respinga).
    sc.stain([x - R - 1.2, y - R - 1.2, x + R + 1.2, y + R + 1.2], 'rgb(20,22,20)', 0.35, 0.3, { clip: circlePath(x, y, R + 1.1), bias: 0.05 });
    for (let k = 0; k < 6 * moss; k++) mossBlob(sc, [x + Math.cos(rng.angle()) * (R + 0.4), y + Math.sin(rng.angle()) * (R + 0.4)], rng.range(0.15, 0.4), rng, 0.6);
    // Degrau octogonal e borda da bacia em blocos de basalto.
    const step = polyPath(Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      return [x + Math.cos(a) * (R + 0.55), y + Math.sin(a) * (R + 0.55)] as Vec;
    }));
    sc.pat(step, 'basalt_rock', { brightness: 0.02 });
    sc.stroke(step, 'rgba(10,10,10,0.6)', 0.03);
    sc.occlude(step, 0.18);
    const rim = circlePath(x, y, R + 0.3);
    sc.pat(rim, 'basalt_rock', { brightness: -0.04 });
    const blocks = 16;
    for (let i = 0; i < blocks; i++) {
      const a = (i / blocks) * Math.PI * 2;
      sc.stroke(polyPath([[x + Math.cos(a) * (R - 0.02), y + Math.sin(a) * (R - 0.02)], [x + Math.cos(a) * (R + 0.3), y + Math.sin(a) * (R + 0.3)]]), 'rgba(10,10,10,0.6)', 0.015);
    }
    sc.occlude(rim, 0.6);
    if (moss) {
      for (let k = 0; k < 28 * moss; k++) {
        const a = rng.angle();
        mossBlob(sc, [x + Math.cos(a) * (R + 0.15), y + Math.sin(a) * (R + 0.15)], rng.range(0.06, 0.2), rng, 0.85);
      }
    }
    // Água: escura no fundo, céu refletido, ondas concêntricas do gotejar.
    const water = circlePath(x, y, R);
    sc.clearHeights(water, [x - R, y - R, x + R, y + R]);
    sc.occlude(water, 0.45);
    // Água parada: plana, escura, um pouco mais clara do lado que reflete o céu.
    const g = sc.c.createLinearGradient(x - R, y - R, x + R, y + R);
    g.addColorStop(0, '#3e5856');
    g.addColorStop(0.5, '#2a403e');
    g.addColorStop(1, '#22322f');
    sc.fill(water, g);
    sc.stroke(circlePath(x, y, R - 0.04), 'rgba(10,16,14,0.6)', 0.08);
    sc.stain([x - R, y - R, x + R, y + R], 'rgb(60,90,40)', 0.35, 0.25, { clip: water, bias: -0.1 });
    sc.c.save();
    sc.c.clip(water);
    for (let k = 1; k <= 6; k++) sc.stroke(circlePath(x + 0.05, y - 0.05, 0.25 + k * 0.22), `rgba(200,220,225,${0.16 - k * 0.02})`, 0.015);
    // Reflexo do céu na diagonal.
    for (let k = 0; k < 14; k++) {
      const a = rng.angle();
      const rr = Math.sqrt(rng.next()) * R * 0.85;
      sc.fill(ellipsePath(x + Math.cos(a) * rr, y + Math.sin(a) * rr, rng.range(0.03, 0.1), 0.008, rng.range(-0.3, 0.3)), 'rgba(220,235,240,0.25)');
    }
    sc.c.restore();
    // Coluna central com taça e bica.
    const col = circlePath(x, y, 0.32);
    sc.pat(col, 'basalt_rock', { brightness: 0.04 });
    sc.stroke(col, 'rgba(10,10,10,0.7)', 0.02);
    sc.dome(x, y, 0.32, 1.3, 1.1, 0, col);
    const bowl = circlePath(x, y, 0.55);
    sc.pat(bowl, 'basalt_rock', { brightness: -0.06 });
    sc.fill(circlePath(x, y, 0.42), '#2d4140');
    sc.fill(circlePath(x, y, 0.18), '#3a3c3a');
    sc.stroke(circlePath(x, y, 0.55), 'rgba(10,10,10,0.6)', 0.02);
    if (moss) for (let k = 0; k < 8; k++) mossBlob(sc, [x + rng.range(-0.45, 0.45), y + rng.range(-0.45, 0.45)], rng.range(0.04, 0.1), rng, 0.8);
    sc.occlude(bowl, 1.35, 1.1);
    sc.occlude(circlePath(x, y, 0.18), 1.6);
    if (p.drip) {
      // Fio d'água da taça e manchas escuras de molhado na borda.
      for (let k = 0; k < 4; k++) {
        const a = rng.angle();
        sc.fill(circlePath(x + Math.cos(a) * 0.58, y + Math.sin(a) * 0.58, 0.03), 'rgba(200,225,230,0.5)');
        sc.stroke(circlePath(x + Math.cos(a) * 0.62, y + Math.sin(a) * 0.62, 0.08), 'rgba(200,225,230,0.3)', 0.008);
      }
    }
  },
};

const FRUIT: RGB[] = [
  [230, 130, 40],
  [200, 40, 30],
  [240, 200, 60],
  [120, 160, 50],
  [150, 30, 60],
];

/** Caixote de fruta na calçada: ripas de madeira ou plástico verde, cheio. */
export function fruitCrate(sc: Scene, rng: Rng) {
  const plastic = rng.chance(0.35);
  const crate = rectPath(-0.3, -0.2, 0.6, 0.4, 0.02);
  if (plastic) sc.fill(crate, rgb(jitter(rng, [50, 110, 60], 0.08)));
  else sc.pat(crate, 'wood_oak', { brightness: 0.05 });
  sc.stroke(crate, 'rgba(30,20,10,0.8)', 0.02);
  const fruit = rng.pick(FRUIT);
  const leafy = rng.chance(0.2);
  if (leafy) {
    leafCluster(sc, 0, 0, 0.22, [[90, 150, 60], [110, 170, 70]], rng, { leaf: 0.05, height: 0.42, base: 0.3 });
  } else {
    const r = rng.range(0.035, 0.045);
    for (let i = -0.25 + r; i < 0.26 - r; i += r * 2.05) {
      for (let j = -0.16 + r; j < 0.17 - r; j += r * 2.05) {
        const c = jitter(rng, fruit, 0.1);
        const g = sc.c.createRadialGradient(i - r * 0.3, j - r * 0.3, 0, i, j, r);
        g.addColorStop(0, rgb(shadeRgb(c, 1.4)));
        g.addColorStop(1, rgb(shadeRgb(c, 0.7)));
        sc.fill(circlePath(i + rng.range(-0.005, 0.005), j + rng.range(-0.005, 0.005), r), g);
      }
    }
  }
  sc.occlude(crate, 0.32);
}

const fruitCrates: PropDef = {
  needs: ['area'],
  draw(sc, p, rng) {
    const [x0, y0, x1, y1] = p.area!;
    const count = p.count ?? 4;
    // Em fileira ao longo da área, alguns empilhados.
    const horizontal = x1 - x0 >= y1 - y0;
    const span = horizontal ? x1 - x0 : y1 - y0;
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const at: Vec = horizontal
        ? [x0 + span * t + rng.range(-0.05, 0.05), (y0 + y1) / 2 + rng.range(-0.08, 0.08)]
        : [(x0 + x1) / 2 + rng.range(-0.08, 0.08), y0 + span * t];
      sc.frame(at[0], at[1], (horizontal ? 0 : 90) + rng.range(-6, 6), () => fruitCrate(sc, rng));
    }
  },
};

export const OUTDOOR_PROPS: Record<string, PropDef> = {
  herb_bed: herbBed,
  terracotta_pots: terracottaPots,
  clothesline,
  plastic_chair: plasticChairProp,
  bistro_table: bistroTable,
  sign_enamel_old: signEnamelOld,
  potted_plants: pottedPlants,
  bench_stone_wood: benchStoneWood,
  fountain_volcanic_stone: fountainVolcanic,
  fruit_crates: fruitCrates,
};

export type { PropSpec };
