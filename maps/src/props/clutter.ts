// Bagunça: miudezas espalhadas por mesas e balcões (interior) ou pelo chão (rua).
import { pointInPoly, polyBounds, type Vec } from '../geom';
import type { Rng } from '../rng';
import type { Scene, Surface } from '../scene';
import type { PropSpec } from '../schema';
import { fallenLeaf, puddle } from '../decals';
import type { PropDef } from './index';
import { bottleTop, circlePath, ellipsePath, fabric, glassTop, jitter, metal, polyPath, rectPath, rgb, shadeRgb, woodTop } from './kit';

type ItemDraw = (sc: Scene, rng: Rng, top: number) => number; // devolve o raio ocupado

const ITEMS: Record<string, ItemDraw> = {
  ashtray(sc, rng, top) {
    const tray = circlePath(0, 0, 0.06);
    sc.fill(tray, 'rgba(180,195,200,0.85)');
    sc.stroke(tray, 'rgba(90,100,105,0.9)', 0.008);
    sc.fill(circlePath(0, 0, 0.042), 'rgba(90,85,80,0.9)');
    for (let k = 0; k < rng.int(1, 4); k++) {
      sc.push(rng.range(-0.02, 0.02), rng.range(-0.02, 0.02), rng.range(0, 360));
      sc.fill(rectPath(-0.02, -0.004, 0.04, 0.008, 0.003), '#e8e0d0');
      sc.fill(rectPath(0.01, -0.004, 0.012, 0.008), '#c98a4a');
      sc.pop();
    }
    sc.occlude(tray, top + 0.03, top);
    return 0.07;
  },
  newspaper(sc, rng, top) {
    // Jornal dobrado: blocos cinza no lugar das colunas, nada legível.
    const w = 0.3;
    const h = 0.21;
    const sheet = rectPath(-w / 2, -h / 2, w, h);
    sc.fill(sheet, '#ddd6c4');
    sc.fill(rectPath(-w / 2 + 0.015, -h / 2 + 0.015, w - 0.03, 0.03), 'rgba(40,40,40,0.55)');
    sc.fill(rectPath(-w / 2 + 0.015, -h / 2 + 0.055, 0.11, 0.08), 'rgba(80,80,80,0.5)');
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 3; c++) {
        if (c === 0 && r < 5) continue;
        const len = 0.075 * rng.range(0.6, 1);
        sc.fill(rectPath(-w / 2 + 0.015 + c * 0.09, -h / 2 + 0.06 + r * 0.014, len, 0.005), 'rgba(70,70,70,0.32)');
      }
    }
    sc.fill(rectPath(-0.002, -h / 2, 0.004, h), 'rgba(0,0,0,0.12)');
    sc.stroke(sheet, 'rgba(90,85,75,0.6)', 0.004);
    sc.occlude(sheet, top + 0.008, top);
    return 0.18;
  },
  wine_bottle(sc, rng, top) {
    if (rng.chance(0.5)) {
      bottleTop(sc, 0, 0, 0.038, [40, 60, 34], [120, 30, 36], rng);
      sc.occlude(circlePath(0, 0, 0.038), top + 0.3, top);
      return 0.05;
    }
    // Deitada.
    const body = rectPath(-0.13, -0.038, 0.2, 0.076, 0.035);
    const g = sc.c.createLinearGradient(0, -0.038, 0, 0.038);
    g.addColorStop(0, '#5d7a52');
    g.addColorStop(0.5, '#2c3e26');
    g.addColorStop(1, '#152012');
    sc.fill(body, g);
    sc.fill(rectPath(0.07, -0.015, 0.09, 0.03, 0.01), '#2c3e26');
    sc.fill(rectPath(-0.08, -0.03, 0.08, 0.06), 'rgba(220,210,180,0.75)');
    sc.occlude(body, top + 0.08, top);
    return 0.16;
  },
  glass(sc, rng, top) {
    glassTop(sc, 0, 0, 0.033, rng.chance(0.5) ? [110, 20, 30] : undefined);
    sc.occlude(circlePath(0, 0, 0.033), top + 0.12, top);
    return 0.04;
  },
  napkin_holder(sc, rng, top) {
    const box = rectPath(-0.06, -0.03, 0.12, 0.06, 0.008);
    metal(sc, box, 0.12, 0.06, [190, 192, 194], rng, { streaks: false });
    sc.fill(rectPath(-0.05, -0.008, 0.1, 0.016), '#f4f2ec');
    sc.occlude(box, top + 0.1, top);
    return 0.07;
  },
  salt_pepper(sc, _rng, top) {
    sc.fill(circlePath(-0.02, 0, 0.018), '#f0eee8');
    sc.fill(circlePath(0.02, 0, 0.018), '#3a3632');
    sc.fill(circlePath(-0.02, 0, 0.01), '#c8c8c8');
    sc.fill(circlePath(0.02, 0, 0.01), '#9a9a9a');
    sc.occlude(circlePath(0, 0, 0.03), top + 0.09, top);
    return 0.04;
  },
  cutting_board(sc, rng, top) {
    const board = rectPath(-0.2, -0.13, 0.4, 0.26, 0.02);
    woodTop(sc, board, 0.4, 0.26, { material: 'wood_oak', brightness: 0.08, worn: rng });
    sc.fill(rectPath(0.2, -0.03, 0.07, 0.06, 0.02), '#a77b4f');
    // Uma faca.
    sc.push(rng.range(-0.05, 0.05), rng.range(-0.05, 0.05), rng.range(-30, 30));
    sc.fill(rectPath(-0.12, -0.012, 0.14, 0.024, 0.01), '#cfd3d5');
    sc.fill(rectPath(0.02, -0.014, 0.09, 0.028, 0.008), '#2a1e16');
    sc.pop();
    sc.occlude(board, top + 0.02, top);
    return 0.24;
  },
  tomatoes(sc, rng, top) {
    for (let k = 0; k < rng.int(3, 6); k++) {
      const x = rng.range(-0.06, 0.06);
      const y = rng.range(-0.06, 0.06);
      const c = jitter(rng, [196, 40, 28], 0.1);
      const g = sc.c.createRadialGradient(x - 0.012, y - 0.012, 0, x, y, 0.036);
      g.addColorStop(0, rgb(shadeRgb(c, 1.6)));
      g.addColorStop(1, rgb(shadeRgb(c, 0.7)));
      sc.fill(circlePath(x, y, 0.034), g);
      sc.fill(circlePath(x, y, 0.008), '#3e6a2a');
    }
    sc.occlude(circlePath(0, 0, 0.09), top + 0.06, top);
    return 0.1;
  },
  garlic(sc, rng, top) {
    for (let k = 0; k < rng.int(2, 4); k++) {
      const x = rng.range(-0.04, 0.04);
      const y = rng.range(-0.04, 0.04);
      sc.fill(circlePath(x, y, 0.024), '#ede6d6');
      sc.stroke(circlePath(x, y, 0.016), 'rgba(170,150,130,0.6)', 0.003);
    }
    sc.occlude(circlePath(0, 0, 0.06), top + 0.04, top);
    return 0.07;
  },
  bread(sc, rng, top) {
    for (let k = 0; k < rng.int(1, 2); k++) {
      sc.push(k * 0.09, k * 0.05, rng.range(-30, 30));
      const loaf = ellipsePath(0, 0, 0.15, 0.06);
      const g = sc.c.createRadialGradient(-0.03, -0.02, 0.01, 0, 0, 0.15);
      g.addColorStop(0, '#e2b06a');
      g.addColorStop(1, '#8e5a26');
      sc.fill(loaf, g);
      for (let s = -2; s <= 2; s++) sc.stroke(polyPath([[s * 0.045 - 0.015, -0.035], [s * 0.045 + 0.015, 0.035]]), 'rgba(250,230,180,0.6)', 0.008);
      sc.dome(0, 0, 0.15, top + 0.08, top + 0.02, top, loaf);
      sc.pop();
    }
    return 0.18;
  },
  cloth(sc, rng, top) {
    const towel = rectPath(-0.15, -0.1, 0.3, 0.2, 0.01);
    fabric(sc, towel, 0.3, 0.2, [236, 232, 222], rng, { check: [170, 40, 40], checkCell: 0.04, creases: 1 });
    sc.occlude(towel, top + 0.01, top);
    return 0.17;
  },
  wooden_spoon(sc, _rng, top) {
    sc.fill(rectPath(-0.12, -0.01, 0.2, 0.02, 0.01), '#b88b58');
    sc.fill(ellipsePath(0.1, 0, 0.04, 0.028), '#a57a48');
    sc.occlude(rectPath(-0.12, -0.03, 0.27, 0.06), top + 0.02, top);
    return 0.15;
  },
};

const STREET_ITEMS: Record<string, (sc: Scene, at: Vec, rng: Rng) => void> = {
  cigarette_butts(sc, [x, y], rng) {
    sc.push(x, y, rng.range(0, 360));
    sc.fill(rectPath(-0.014, -0.004, 0.028, 0.008, 0.003), '#e6ddc8');
    sc.fill(rectPath(0.006, -0.004, 0.01, 0.008), '#c4844a');
    sc.pop();
  },
  leaves(sc, at, rng) {
    for (let k = 0; k < rng.int(2, 6); k++) fallenLeaf(sc, [at[0] + rng.range(-0.3, 0.3), at[1] + rng.range(-0.3, 0.3)], rng.range(0.04, 0.07), rng);
  },
  pigeon_droppings(sc, [x, y], rng) {
    for (let k = 0; k < rng.int(1, 3); k++) {
      const p: Vec = [x + rng.range(-0.1, 0.1), y + rng.range(-0.1, 0.1)];
      sc.fill(circlePath(p[0], p[1], rng.range(0.008, 0.016)), 'rgba(235,235,225,0.85)');
      sc.fill(circlePath(p[0] + 0.004, p[1], 0.005), 'rgba(80,80,70,0.7)');
    }
  },
  puddle_small(sc, at, rng) {
    puddle(sc, at, rng.range(0.25, 0.6), rng);
  },
};

const PER_SURFACE = { low: 0.6, medium: 1.4, high: 3 } as const;
const STREET_DENSITY = { low: 0.04, medium: 0.1, high: 0.25 } as const;

function surfacesIn(sc: Scene, area: number[]): Surface[] {
  return sc.surfaces.filter((s) => {
    const [x0, y0, x1, y1] = polyBounds(s.poly);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    return cx >= area[0] && cx <= area[2] && cy >= area[1] && cy <= area[3];
  });
}

/** Objetos pequenos já em cima da superfície (máquina, caixa, pia): a bagunça desvia. */
function blocked(sc: Scene, p: Vec, r: number, placed: { p: Vec; r: number }[]) {
  if (placed.some((q) => Math.hypot(q.p[0] - p[0], q.p[1] - p[1]) < q.r + r)) return true;
  return sc.occupied.some((o) => {
    const [x0, y0, x1, y1] = polyBounds(o.poly);
    if ((x1 - x0) * (y1 - y0) > 0.6) return false;
    return pointInPoly(p, o.poly);
  });
}

const clutter: PropDef = {
  needs: ['area', 'items'],
  phase: 3,
  draw(sc, p, rng) {
    const surfaces = surfacesIn(sc, p.area!);
    if (!surfaces.length) {
      sc.warn(`clutter em [${p.area!.join(', ')}]: nenhuma mesa/balcão na área, nada espalhado`);
      return;
    }
    const items = (p.items ?? []).filter((i) => ITEMS[i]);
    for (const unknown of (p.items ?? []).filter((i) => !ITEMS[i])) sc.warn(`clutter: item desconhecido "${unknown}"`);
    if (!items.length) return;
    const total = Math.round(surfaces.length * PER_SURFACE[p.density ?? 'medium'] + items.length * 0.5);
    const placed: { p: Vec; r: number }[] = [];
    for (let n = 0, tries = 0; n < total && tries < total * 30; tries++) {
      const surface = rng.pick(surfaces);
      const [x0, y0, x1, y1] = polyBounds(surface.poly);
      const at: Vec = [rng.range(x0 + 0.08, x1 - 0.08), rng.range(y0 + 0.08, y1 - 0.08)];
      if (!pointInPoly(at, surface.poly)) continue;
      const item = items[n % items.length];
      if (blocked(sc, at, 0.08, placed)) continue;
      sc.push(at[0], at[1], rng.range(0, 360));
      const r = ITEMS[item](sc, rng, surface.top);
      sc.pop();
      placed.push({ p: at, r });
      n++;
    }
  },
};

const clutterStreet: PropDef = {
  needs: ['area', 'items'],
  phase: 0,
  draw(sc, p, rng) {
    const [x0, y0, x1, y1] = p.area!;
    const area = (x1 - x0) * (y1 - y0);
    const density = STREET_DENSITY[p.density ?? 'low'];
    for (const item of p.items ?? []) {
      const fn = STREET_ITEMS[item];
      if (!fn) {
        sc.warn(`clutter_street: item desconhecido "${item}"`);
        continue;
      }
      const count = Math.round(area * density * (item === 'puddle_small' ? 0.08 : item === 'leaves' ? 0.6 : 1));
      for (let n = 0, tries = 0; n < count && tries < count * 10; tries++) {
        // Sujeira junta perto das paredes: metade das tentativas puxa para a borda dos prédios.
        const at: Vec = [rng.range(x0, x1), rng.range(y0, y1)];
        if (sc.occupied.some((o) => pointInPoly(at, o.poly))) continue;
        fn(sc, at, rng);
        n++;
      }
    }
  },
};

export const CLUTTER_PROPS: Record<string, PropDef> = {
  clutter,
  clutter_street: clutterStreet,
};

export type { PropSpec };
