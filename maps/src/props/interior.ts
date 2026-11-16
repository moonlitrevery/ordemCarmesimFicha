// Móveis e objetos de interior (bar, salão, cozinha, despensa, escada).
import type { Vec } from '../geom';
import type { Scene } from '../scene';
import type { PropSpec } from '../schema';
import type { PropDef } from './index';
import {
  bottleTop,
  circlePath,
  ellipsePath,
  fabric,
  glassTop,
  jitter,
  metal,
  polyPath,
  rectPath,
  rgb,
  shadeRgb,
  woodChair,
  woodTop,
  type RGB,
} from './kit';

const ZINC: RGB = [150, 156, 160];
const STEEL: RGB = [176, 180, 182];

/** Polilinha com largura → polígono (juntas em meia-esquadria). */
export function bandPolygon(path: Vec[], depth: number): Vec[] {
  const h = depth / 2;
  const normals = path.slice(1).map((b, i) => {
    const a = path[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [-(b[1] - a[1]) / len, (b[0] - a[0]) / len] as Vec;
  });
  const offsetAt = (i: number, sign: number): Vec => {
    const p = path[i];
    if (i === 0) return [p[0] + normals[0][0] * h * sign, p[1] + normals[0][1] * h * sign];
    if (i === path.length - 1) {
      const n = normals[normals.length - 1];
      return [p[0] + n[0] * h * sign, p[1] + n[1] * h * sign];
    }
    const n0 = normals[i - 1];
    const n1 = normals[i];
    const mx = n0[0] + n1[0];
    const my = n0[1] + n1[1];
    const ml = Math.hypot(mx, my) || 1;
    const cos = (mx / ml) * n0[0] + (my / ml) * n0[1];
    const k = (h / Math.max(0.2, cos)) * sign;
    return [p[0] + (mx / ml) * k, p[1] + (my / ml) * k];
  };
  const left = path.map((_, i) => offsetAt(i, 1));
  const right = path.map((_, i) => offsetAt(i, -1)).reverse();
  return [...left, ...right];
}

function centerOfRect(r: number[]): Vec {
  return [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];
}

/** Gira um objeto sem `rot` para ficar de costas para a parede mais próxima. */
export function faceAwayFromWall(sc: Scene, at: Vec): number {
  let best = { d: Infinity, rot: 0 };
  for (const w of sc.walls) {
    const { a, b } = w.seg;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const u: Vec = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const t = Math.max(0, Math.min(len, (at[0] - a[0]) * u[0] + (at[1] - a[1]) * u[1]));
    const q: Vec = [a[0] + u[0] * t, a[1] + u[1] * t];
    const d = Math.hypot(at[0] - q[0], at[1] - q[1]);
    if (d < best.d) {
      // Frente (rot 0 = norte, −y) aponta da parede para o objeto.
      const fx = at[0] - q[0];
      const fy = at[1] - q[1];
      best = { d, rot: (Math.atan2(fx, -fy) * 180) / Math.PI };
    }
  }
  return Math.round(best.rot / 90) * 90;
}

// ---------- Bar ----------

const barCounter: PropDef = {
  needs: ['path'],
  phase: 1,
  draw(sc, p, rng) {
    const depth = p.depth ?? 0.6;
    const poly = bandPolygon(p.path as Vec[], depth);
    const top = polyPath(poly);
    // Frente de madeira escura aparece como friso; tampo de zinco com borda boleada.
    sc.pat(polyPath(bandPolygon(p.path as Vec[], depth + 0.06)), 'wood_planks_dark', { brightness: -0.15 });
    metal(sc, top, 8, depth, ZINC, rng);
    sc.stain([-1, -1, 20, 20], 'rgb(80,86,88)', 0.35, 0.25, { clip: top });
    sc.stroke(top, 'rgba(225,230,232,0.65)', 0.02);
    sc.stroke(polyPath(bandPolygon(p.path as Vec[], depth - 0.05)), 'rgba(60,64,66,0.5)', 0.01);
    // Marcas de copo molhado.
    const path = p.path as Vec[];
    for (let k = 0; k < 10; k++) {
      const i = rng.int(0, path.length - 2);
      const t = rng.next();
      const x = path[i][0] + (path[i + 1][0] - path[i][0]) * t + rng.range(-0.15, 0.15);
      const y = path[i][1] + (path[i + 1][1] - path[i][1]) * t + rng.range(-0.15, 0.15);
      sc.stroke(circlePath(x, y, rng.range(0.03, 0.045)), 'rgba(70,76,80,0.35)', 0.008);
    }
    sc.occlude(top, 1.05);
    sc.surfaces.push({ poly, top: 1.05, kind: 'counter' });
  },
};

const shelfBottles: PropDef = {
  needs: ['rect'],
  phase: 1,
  draw(sc, p, rng) {
    const [x0, y0, x1, y1] = p.rect!;
    const shelf = rectPath(x0, y0, x1 - x0, y1 - y0);
    sc.pat(shelf, 'wood_planks_dark', { brightness: -0.05 });
    sc.stroke(shelf, 'rgba(20,10,5,0.8)', 0.02);
    // Espelho no fundo e fileiras de garrafas e copos.
    sc.fill(rectPath(x0, y0, x1 - x0, 0.05), 'rgba(190,205,210,0.5)');
    const colors: RGB[] = [
      [30, 70, 35],
      [110, 60, 20],
      [170, 120, 50],
      [200, 210, 200],
      [60, 20, 20],
      [40, 50, 80],
    ];
    const caps: RGB[] = [
      [180, 150, 70],
      [160, 30, 30],
      [30, 30, 30],
      [200, 200, 200],
    ];
    for (let x = x0 + 0.06; x < x1 - 0.05; x += rng.range(0.075, 0.1)) {
      if (rng.chance(0.12)) continue;
      const y = y0 + (y1 - y0) * rng.range(0.35, 0.6);
      bottleTop(sc, x, y, rng.range(0.03, 0.04), rng.pick(colors), rng.pick(caps), rng);
    }
    for (let x = x0 + 0.1; x < x1 - 0.1; x += rng.range(0.09, 0.14)) {
      if (rng.chance(0.3)) continue;
      glassTop(sc, x, y1 - 0.06, 0.028);
    }
    sc.occlude(shelf, 1.9);
  },
};

const espressoMachine: PropDef = {
  needs: ['at'],
  size: () => [0.7, 0.48],
  noNudge: true,
  phase: 2,
  draw(sc, p, rng) {
    sc.frame(p.at![0], p.at![1], p.rot ?? 0, () => {
      const body = rectPath(-0.35, -0.24, 0.7, 0.48, 0.05);
      metal(sc, body, 0.7, 0.48, [196, 198, 200], rng, { streaks: false });
      sc.stroke(body, 'rgba(60,60,60,0.8)', 0.012);
      // Grelha de aquecer xícaras com xícaras emborcadas.
      const grid = rectPath(-0.3, -0.19, 0.6, 0.3, 0.02);
      sc.fill(grid, '#4a4a4a');
      for (let x = -0.28; x < 0.3; x += 0.03) sc.fill(rectPath(x, -0.19, 0.012, 0.3), '#8a8a8a');
      for (let k = 0; k < 5; k++) {
        const cx = -0.22 + k * 0.11 + rng.range(-0.01, 0.01);
        sc.fill(circlePath(cx, -0.05 + rng.range(-0.05, 0.05), 0.04), '#f1ede4');
        sc.stroke(circlePath(cx, -0.05, 0.04), 'rgba(120,110,100,0.6)', 0.006);
      }
      // Grupos e alavancas na frente (lado do barista).
      for (const x of [-0.17, 0.17]) {
        sc.fill(rectPath(x - 0.05, 0.15, 0.1, 0.07, 0.02), '#2a2a2a');
        sc.fill(rectPath(x - 0.012, 0.2, 0.024, 0.12), '#1b1b1b');
      }
      sc.occlude(body, 1.55);
    });
  },
};

const cashRegister: PropDef = {
  needs: ['at'],
  size: () => [0.4, 0.42],
  noNudge: true,
  phase: 2,
  draw(sc, p, rng) {
    sc.frame(p.at![0], p.at![1], p.rot ?? 0, () => {
      const body = rectPath(-0.2, -0.21, 0.4, 0.42, 0.04);
      metal(sc, body, 0.4, 0.42, [150, 140, 120], rng, { streaks: false });
      sc.stroke(body, 'rgba(40,35,30,0.8)', 0.01);
      // Teclas sem nada escrito.
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 3; j++) {
          sc.fill(rectPath(-0.14 + i * 0.07, 0.0 + j * 0.055, 0.05, 0.04, 0.008), j === 2 && i === 3 ? '#8f2a22' : '#d9d3c4');
        }
      }
      sc.fill(rectPath(-0.12, -0.17, 0.24, 0.09, 0.01), '#2c3a33');
      sc.occlude(body, 1.35);
    });
  },
};

const barStool: PropDef = {
  needs: ['at'],
  size: () => [0.38, 0.38],
  draw(sc, p, rng) {
    const [x, y] = p.at!;
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      sc.fill(circlePath(x + Math.cos(a) * 0.2, y + Math.sin(a) * 0.2, 0.018), '#4b4b4b');
    }
    sc.stroke(circlePath(x, y, 0.17), 'rgba(170,170,170,0.9)', 0.015);
    const seat = circlePath(x, y, 0.19);
    const g = sc.c.createRadialGradient(x - 0.05, y - 0.05, 0.02, x, y, 0.19);
    const c = jitter(rng, [128, 32, 28], 0.06);
    g.addColorStop(0, rgb(shadeRgb(c, 1.35)));
    g.addColorStop(0.7, rgb(c));
    g.addColorStop(1, rgb(shadeRgb(c, 0.55)));
    sc.fill(seat, g);
    sc.stroke(seat, 'rgba(20,10,10,0.7)', 0.01);
    // Vinil rachado.
    for (let k = 0; k < 3; k++) {
      const a = rng.angle();
      sc.stroke(polyPath([[x + Math.cos(a) * 0.05, y + Math.sin(a) * 0.05], [x + Math.cos(a) * 0.15, y + Math.sin(a) * 0.15]]), 'rgba(240,200,180,0.3)', 0.004);
    }
    sc.dome(x, y, 0.19, 0.8, 0.74, 0.7, seat);
    sc.occlude(circlePath(x, y, 0.03), 0.72);
  },
};

const tvWall: PropDef = {
  needs: ['at'],
  size: () => [1.0, 0.1],
  wallMounted: true,
  draw(sc, p) {
    sc.frame(p.at![0], p.at![1], p.rot ?? 0, () => {
      sc.fill(rectPath(-0.12, 0.0, 0.24, 0.05), '#2a2a2a');
      const tv = rectPath(-0.5, -0.04, 1.0, 0.06, 0.01);
      sc.fill(tv, '#151515');
      sc.fill(rectPath(-0.48, -0.035, 0.96, 0.015), 'rgba(120,130,140,0.4)');
      sc.occlude(tv, 2.1, 1.5);
    });
  },
};

const fireplaceStone: PropDef = {
  needs: ['at'],
  size: (p) => [p.width ?? 1.4, 0.75],
  wallMounted: true,
  draw(sc, p, rng) {
    const w = p.width ?? 1.4;
    sc.frame(p.at![0], p.at![1], p.rot ?? 0, () => {
      // Lareira: frente para −y. Laje do piso, boca com cinza fria, coifa de pedra atrás.
      const hearth = rectPath(-w / 2 - 0.1, -0.375 - 0.35, w + 0.2, 0.4);
      sc.pat(hearth, 'stone_grey', { brightness: -0.08 });
      sc.stroke(hearth, 'rgba(30,25,20,0.6)', 0.02);
      for (let x = -w / 2; x < w / 2; x += 0.4) sc.fill(rectPath(x, -0.725, 0.01, 0.4), 'rgba(30,25,20,0.4)');
      sc.occlude(hearth, 0.08);
      const surround = polyPath([
        [-w / 2, -0.375],
        [w / 2, -0.375],
        [w / 2, 0.375],
        [-w / 2, 0.375],
      ]);
      sc.pat(surround, 'drystone_wall_mossy', { brightness: -0.1 });
      sc.fill(surround, 'rgba(80,70,60,0.35)');
      const box = rectPath(-w * 0.32, -0.375, w * 0.64, 0.5);
      const g = sc.c.createLinearGradient(0, -0.375, 0, 0.125);
      g.addColorStop(0, '#2d2622');
      g.addColorStop(1, '#0d0b0a');
      sc.fill(box, g);
      sc.stain([-w * 0.32, -0.375, w * 0.32, 0.125], 'rgb(140,135,128)', 0.6, 0.06, { clip: box, bias: 0.05 });
      // Dois tições apagados sobre o cavalete de ferro.
      for (const [dx, a] of [
        [-0.08, 0.2],
        [0.06, -0.15],
      ]) {
        sc.push(dx, -0.13, (a * 180) / Math.PI);
        const log = rectPath(-0.22, -0.045, 0.44, 0.09, 0.04);
        sc.fill(log, '#2a1d14');
        sc.fill(rectPath(-0.2, -0.03, 0.4, 0.02), 'rgba(90,80,70,0.6)');
        sc.occlude(log, 0.2);
        sc.pop();
      }
      sc.stroke(rectPath(-w * 0.32, -0.375, w * 0.64, 0.5), 'rgba(20,15,12,0.9)', 0.03);
      sc.occlude(polyPath([[-w / 2, -0.375], [-w * 0.32, -0.375], [-w * 0.32, 0.375], [-w / 2, 0.375]]), 1.25);
      sc.occlude(polyPath([[w * 0.32, -0.375], [w / 2, -0.375], [w / 2, 0.375], [w * 0.32, 0.375]]), 1.25);
      sc.occlude(rectPath(-w / 2, 0.125, w, 0.25), 2.8);
      // Prateleira (consola) de madeira sobre a boca.
      const mantel = rectPath(-w / 2 - 0.05, -0.42, w + 0.1, 0.12);
      woodTop(sc, mantel, w, 0.12, { material: 'wood_planks_dark' });
      sc.occlude(mantel, 1.3, 1.22);
      for (let k = 0; k < 3; k++) bottleTop(sc, -w / 2 + 0.15 + k * rng.range(0.25, 0.5), -0.36, 0.03, [40, 60, 40], [150, 120, 60], rng);
    });
  },
};

const firewoodStack: PropDef = {
  needs: ['at'],
  size: () => [0.9, 0.45],
  draw(sc, p, rng) {
    sc.frame(p.at![0], p.at![1], p.rot ?? 0, () => {
      const rows = 4;
      for (let r = 0; r < rows; r++) {
        const y = -0.2 + r * 0.11 + rng.range(-0.01, 0.01);
        const len = rng.range(0.75, 0.9);
        const x = rng.range(-0.05, 0.05);
        const log = rectPath(x - len / 2, y - 0.05, len, 0.1, 0.05);
        const g = sc.c.createLinearGradient(0, y - 0.05, 0, y + 0.05);
        const bark = jitter(rng, [96, 70, 48], 0.1);
        g.addColorStop(0, rgb(shadeRgb(bark, 1.3)));
        g.addColorStop(0.5, rgb(bark));
        g.addColorStop(1, rgb(shadeRgb(bark, 0.55)));
        sc.fill(log, g);
        for (let k = 0; k < 6; k++) sc.fill(rectPath(x - len / 2 + rng.range(0, len), y - 0.04, rng.range(0.02, 0.08), 0.008), 'rgba(40,25,15,0.5)');
        // Ponta serrada, clara.
        sc.fill(ellipsePath(x + len / 2 - 0.01, y, 0.015, 0.048), '#c9a678');
        sc.occlude(log, 0.55 - Math.abs(r - 1.5) * 0.08);
      }
      sc.stain([-0.6, -0.35, 0.6, 0.35], 'rgb(70,50,30)', 0.25, 0.08);
    });
  },
};

const tableSquareCloth: PropDef = {
  needs: ['at'],
  size: () => [0.9, 0.9],
  draw(sc, p, rng) {
    const [x, y] = p.at!;
    const seats = p.seats ?? 4;
    const tilt = rng.range(-4, 4);
    // Cadeiras primeiro (ficam por baixo da borda da toalha).
    const spots: [number, number, number][] = seats >= 4
      ? [
          [0, -0.62, 0],
          [0, 0.62, 180],
          [0.62, 0, 90],
          [-0.62, 0, 270],
        ]
      : seats === 3
        ? [
            [0, -0.62, 0],
            [0.62, 0, 90],
            [-0.62, 0, 270],
          ]
        : ([
            [0.62, 0, 90],
            [-0.62, 0, 270],
          ] as [number, number, number][]).slice(0, seats);
    for (const [dx, dy, r] of spots) {
      const pull = rng.range(0, 0.12);
      sc.frame(x + dx, y + dy, r + 180 + tilt + rng.range(-10, 10), () => {
        sc.push(0, pull, 0);
        woodChair(sc, rng);
        sc.pop();
      });
    }
    sc.frame(x, y, tilt, () => {
      const cloth = rectPath(-0.47, -0.47, 0.94, 0.94, 0.03);
      const checked = rng.chance(0.5);
      fabric(sc, cloth, 0.94, 0.94, checked ? [236, 230, 218] : jitter(rng, [238, 234, 224], 0.02), rng, {
        check: checked ? [168, 36, 34] : undefined,
        checkCell: 0.07,
        creases: 1,
      });
      // Barra que cai: borda um pouco mais escura.
      sc.stroke(rectPath(-0.45, -0.45, 0.9, 0.9, 0.03), 'rgba(0,0,0,0.12)', 0.035);
      sc.stroke(cloth, 'rgba(60,50,40,0.45)', 0.008);
      sc.occlude(cloth, 0.77, 0.5);
      sc.occlude(circlePath(0, 0, 0.05), 0.7);
    });
    sc.surfaces.push({
      poly: [
        [x - 0.38, y - 0.38],
        [x + 0.38, y - 0.38],
        [x + 0.38, y + 0.38],
        [x - 0.38, y + 0.38],
      ],
      top: 0.77,
      kind: 'table',
    });
  },
};

const coatRack: PropDef = {
  needs: ['at'],
  size: () => [0.55, 0.55],
  draw(sc, p, rng) {
    const [x, y] = p.at!;
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.3;
      sc.stroke(polyPath([[x, y], [x + Math.cos(a) * 0.25, y + Math.sin(a) * 0.25]]), '#3b2a1c', 0.03);
    }
    const coats: RGB[] = [
      [70, 62, 52],
      [40, 48, 66],
      [110, 84, 52],
      [60, 30, 30],
    ];
    for (let k = 0; k < rng.int(2, 3); k++) {
      const a = rng.angle();
      const cx = x + Math.cos(a) * 0.14;
      const cy = y + Math.sin(a) * 0.14;
      const coat = ellipsePath(cx, cy, 0.22, 0.12, a);
      fabric(sc, coat, 0.44, 0.24, jitter(rng, rng.pick(coats), 0.1), rng, { creases: 0 });
      sc.stroke(coat, 'rgba(0,0,0,0.4)', 0.01);
      sc.occlude(coat, 1.65, 0.85);
    }
    sc.fill(circlePath(x, y, 0.045), '#4a3422');
    sc.fill(circlePath(x + 0.05, y - 0.04, 0.11), '#3a3631');
    sc.occlude(circlePath(x, y, 0.04), 1.8);
  },
};

const stairsWood: PropDef = {
  needs: ['rect'],
  draw(sc, p, rng) {
    const [x0, y0, x1, y1] = p.rect!;
    const dir = p.direction ?? 'north';
    const vertical = dir === 'north' || dir === 'south';
    const run = vertical ? y1 - y0 : x1 - x0;
    const n = Math.max(3, Math.round(run / 0.28));
    const tread = run / n;
    const rise = 2.8 / (n + 1);
    for (let i = 0; i < n; i++) {
      // i = 0 é o degrau de baixo; ele fica no lado oposto a `direction`.
      const k = dir === 'north' || dir === 'west' ? n - 1 - i : i;
      const r = vertical
        ? rectPath(x0, y0 + k * tread, x1 - x0, tread)
        : rectPath(x0 + k * tread, y0, tread, y1 - y0);
      sc.pat(r, 'wood_planks_dark', { rot: vertical ? 0 : 90, brightness: -0.02 + i * 0.008 });
      // Bocel do degrau (borda gasta mais clara) e sombra do espelho.
      const nose = vertical
        ? rectPath(x0, dir === 'north' ? y0 + k * tread : y0 + (k + 1) * tread - 0.03, x1 - x0, 0.03)
        : rectPath(dir === 'west' ? x0 + k * tread : x0 + (k + 1) * tread - 0.03, y0, 0.03, y1 - y0);
      sc.fill(nose, 'rgba(230,200,160,0.22)');
      sc.stroke(r, 'rgba(15,8,4,0.6)', 0.012);
      // Desgaste no meio do degrau.
      const c = vertical ? [(x0 + x1) / 2, y0 + (k + 0.5) * tread] : [x0 + (k + 0.5) * tread, (y0 + y1) / 2];
      sc.fill(ellipsePath(c[0], c[1], vertical ? 0.3 : 0.08, vertical ? 0.08 : 0.3), 'rgba(200,170,130,0.08)');
      sc.occlude(r, rise * (i + 1));
    }
    // Corrimão de um lado.
    const rail = vertical ? rectPath(x1 - 0.07, y0, 0.05, y1 - y0) : rectPath(x0, y1 - 0.07, x1 - x0, 0.05);
    woodTop(sc, rail, 0.05, 1, { material: 'wood_planks_dark', brightness: 0.1 });
    sc.occlude(rail, 2.9, 0.9);
    void rng;
  },
};

// ---------- Cozinha ----------

const stoveIndustrial: PropDef = {
  needs: ['at'],
  size: (p) => [p.width ?? 1.2, 0.75],
  draw(sc, p, rng) {
    const w = p.width ?? 1.2;
    const rot = p.rot ?? faceAwayFromWall(sc, p.at as Vec);
    sc.frame(p.at![0], p.at![1], rot, () => {
      const body = rectPath(-w / 2, -0.375, w, 0.75, 0.02);
      metal(sc, body, w, 0.75, STEEL, rng);
      sc.stroke(body, 'rgba(40,40,40,0.9)', 0.015);
      // Chapa de respingo atrás e manchas de gordura.
      sc.fill(rectPath(-w / 2, 0.3, w, 0.075), '#8d9092');
      const cols = Math.max(2, Math.round(w / 0.4));
      const cw = w / cols;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < 2; j++) {
          const cx = -w / 2 + cw * (i + 0.5);
          const cy = -0.17 + j * 0.3;
          sc.fill(rectPath(cx - cw * 0.45, cy - 0.14, cw * 0.9, 0.28, 0.02), '#1c1c1c');
          sc.stroke(circlePath(cx, cy, 0.075), '#3a3a3a', 0.02);
          sc.fill(circlePath(cx, cy, 0.035), '#4a4038');
          // Grelha de ferro fundido.
          for (let k = 0; k < 4; k++) {
            const a = (k * Math.PI) / 4;
            sc.stroke(polyPath([[cx - Math.cos(a) * 0.12, cy - Math.sin(a) * 0.12], [cx + Math.cos(a) * 0.12, cy + Math.sin(a) * 0.12]]), '#2b2b2b', 0.012);
          }
        }
      }
      for (let i = 0; i < cols * 2; i++) sc.fill(circlePath(-w / 2 + (w / (cols * 2)) * (i + 0.5), -0.355, 0.016), '#111');
      sc.stain([-w / 2, -0.375, w / 2, 0.375], 'rgb(60,45,25)', 0.25, 0.07, { clip: body });
      sc.occlude(body, 0.92);
    });
  },
};

const potSteaming: PropDef = {
  needs: ['at'],
  noNudge: true,
  phase: 2,
  draw(sc, p, rng) {
    const [x, y] = p.at!;
    sc.fill(rectPath(x - 0.26, y - 0.02, 0.52, 0.04, 0.02), '#5f6062');
    const rim = circlePath(x, y, 0.19);
    metal(sc, rim, 0.38, 0.38, [170, 172, 174], rng, { streaks: false });
    const sauce = circlePath(x, y, 0.165);
    const g = sc.c.createRadialGradient(x - 0.04, y - 0.04, 0.01, x, y, 0.165);
    g.addColorStop(0, '#b4371f');
    g.addColorStop(0.8, '#8a2414');
    g.addColorStop(1, '#5a160c');
    sc.fill(sauce, g);
    for (let k = 0; k < 8; k++) {
      const a = rng.angle();
      const r = rng.range(0, 0.13);
      sc.stroke(circlePath(x + Math.cos(a) * r, y + Math.sin(a) * r, rng.range(0.006, 0.014)), 'rgba(240,140,100,0.5)', 0.003);
    }
    // Colher de pau encostada na borda.
    sc.push(x, y, rng.range(0, 360));
    sc.fill(rectPath(0.05, -0.012, 0.32, 0.024, 0.012), '#b88b58');
    sc.fill(ellipsePath(0.06, 0, 0.04, 0.028), '#a57a48');
    sc.pop();
    sc.occlude(rim, 1.2);
    // Vapor: véus brancos bem tênues, derivando com o ar.
    sc.c.save();
    sc.c.filter = `blur(${sc.blurM(0.06)}px)`;
    for (let k = 0; k < 5; k++) {
      sc.fill(circlePath(x - 0.05 * k + rng.range(-0.05, 0.05), y - 0.04 * k + rng.range(-0.05, 0.05), 0.09 + k * 0.03), 'rgba(255,255,255,0.08)');
    }
    sc.c.restore();
  },
};

const kitchenCounter: PropDef = {
  needs: ['path'],
  draw(sc, p, rng) {
    const depth = p.depth ?? 0.6;
    const poly = bandPolygon(p.path as Vec[], depth);
    const top = polyPath(poly);
    // Tampo de mármore claro gasto, com borda.
    sc.pat(top, 'stone_grey', { brightness: 0.12 });
    sc.fill(top, 'rgba(240,232,218,0.35)');
    sc.c.save();
    sc.c.clip(top);
    for (let k = 0; k < 8; k++) {
      const a = p.path![0] as Vec;
      const b = p.path![p.path!.length - 1] as Vec;
      const t = rng.next();
      const x = a[0] + (b[0] - a[0]) * t;
      const y = a[1] + (b[1] - a[1]) * t;
      sc.stroke(polyPath([[x, y - 0.4], [x + rng.range(-0.3, 0.3), y + 0.4]]), 'rgba(120,110,100,0.25)', 0.006);
    }
    sc.c.restore();
    sc.stain([0, 0, 20, 20], 'rgb(120,90,60)', 0.18, 0.15, { clip: top });
    sc.stroke(top, 'rgba(60,50,40,0.8)', 0.015);
    sc.occlude(top, 0.92);
    sc.surfaces.push({ poly, top: 0.92, kind: 'counter' });
  },
};

const sinkDouble: PropDef = {
  needs: ['at'],
  size: () => [0.9, 0.5],
  phase: 2,
  draw(sc, p, rng) {
    sc.frame(p.at![0], p.at![1], p.rot ?? 0, () => {
      const rim = rectPath(-0.45, -0.25, 0.9, 0.5, 0.03);
      metal(sc, rim, 0.9, 0.5, STEEL, rng, { streaks: false });
      for (const x of [-0.22, 0.22]) {
        const basin = rectPath(x - 0.19, -0.18, 0.38, 0.32, 0.05);
        const g = sc.c.createLinearGradient(x - 0.19, -0.18, x + 0.19, 0.14);
        g.addColorStop(0, '#6d7275');
        g.addColorStop(1, '#b8bcbe');
        sc.fill(basin, g);
        sc.stroke(basin, 'rgba(40,40,40,0.7)', 0.01);
        sc.fill(circlePath(x, -0.02, 0.025), '#2a2a2a');
      }
      // Torneira de bica alta.
      sc.fill(circlePath(0, 0.2, 0.03), '#d8dadc');
      sc.stroke(polyPath([[0, 0.2], [0, 0.02]]), '#cfd2d4', 0.022);
      sc.occlude(circlePath(0, 0.2, 0.03), 1.25);
    });
  },
};

const fridge: PropDef = {
  needs: ['at'],
  size: () => [0.72, 0.7],
  draw(sc, p, rng) {
    const rot = p.rot ?? faceAwayFromWall(sc, p.at as Vec);
    sc.frame(p.at![0], p.at![1], rot, () => {
      const body = rectPath(-0.36, -0.35, 0.72, 0.7, 0.09);
      const g = sc.c.createLinearGradient(-0.36, -0.35, 0.36, 0.35);
      g.addColorStop(0, '#f2efe6');
      g.addColorStop(1, '#cfcabc');
      sc.fill(body, g);
      sc.stain([-0.36, -0.35, 0.36, 0.35], 'rgb(150,140,110)', 0.25, 0.1, { clip: body });
      sc.stroke(body, 'rgba(90,85,75,0.9)', 0.012);
      // Puxador cromado na frente e um pano de prato em cima.
      sc.fill(rectPath(-0.2, -0.37, 0.4, 0.03, 0.015), '#bfc3c5');
      fabric(sc, rectPath(0.02, -0.1, 0.25, 0.3, 0.02), 0.25, 0.3, [200, 60, 50], rng, { check: [240, 240, 235], checkCell: 0.04, creases: 0 });
      sc.occlude(body, 1.8);
    });
  },
};

const prepTableWood: PropDef = {
  needs: ['at'],
  size: (p) => (p.size as [number, number]) ?? [1.6, 0.8],
  draw(sc, p, rng) {
    const [w, d] = (p.size as [number, number]) ?? [1.6, 0.8];
    sc.frame(p.at![0], p.at![1], p.rot ?? 0, () => {
      const top = rectPath(-w / 2, -d / 2, w, d, 0.02);
      woodTop(sc, top, w, d, { material: 'wood_oak', brightness: 0.02, worn: rng });
      // Talhos de faca e farinha.
      for (let k = 0; k < w * d * 25; k++) {
        const x = rng.range(-w / 2, w / 2);
        const y = rng.range(-d / 2, d / 2);
        sc.stroke(polyPath([[x, y], [x + rng.range(-0.06, 0.06), y + rng.range(-0.02, 0.02)]]), 'rgba(50,30,15,0.3)', 0.003);
      }
      sc.stain([-w / 2, -d / 2, w / 2, d / 2], 'rgb(245,240,230)', 0.35, 0.12, { clip: top, bias: -0.25 });
      sc.occlude(top, 0.88, 0.82);
      for (const [x, y] of [
        [-w / 2 + 0.05, -d / 2 + 0.05],
        [w / 2 - 0.05, -d / 2 + 0.05],
        [-w / 2 + 0.05, d / 2 - 0.05],
        [w / 2 - 0.05, d / 2 - 0.05],
      ] as Vec[]) {
        sc.occlude(rectPath(x - 0.035, y - 0.035, 0.07, 0.07), 0.85);
      }
    });
    const [x, y] = p.at!;
    sc.surfaces.push({
      poly: [
        [x - w / 2 + 0.1, y - d / 2 + 0.1],
        [x + w / 2 - 0.1, y - d / 2 + 0.1],
        [x + w / 2 - 0.1, y + d / 2 - 0.1],
        [x - w / 2 + 0.1, y + d / 2 - 0.1],
      ],
      top: 0.88,
      kind: 'table',
    });
  },
};

const hangingPans: PropDef = {
  needs: ['at'],
  noNudge: true,
  phase: 3.5,
  draw(sc, p, rng) {
    sc.frame(p.at![0], p.at![1], p.rot ?? 0, () => {
      const frame = rectPath(-0.7, -0.22, 1.4, 0.44, 0.03);
      sc.stroke(frame, '#2a2522', 0.03);
      sc.stroke(polyPath([[-0.7, 0], [0.7, 0]]), '#2a2522', 0.025);
      sc.occlude(frame, 2.05, 1.98);
      const copper: RGB = [184, 104, 64];
      for (let k = 0; k < 6; k++) {
        const x = -0.6 + k * 0.24 + rng.range(-0.03, 0.03);
        const y = (k % 2 ? 0.12 : -0.12) + rng.range(-0.02, 0.02);
        const r = rng.range(0.09, 0.14);
        const pan = circlePath(x, y, r);
        const g = sc.c.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
        const c = rng.chance(0.7) ? copper : [60, 60, 62] as RGB;
        g.addColorStop(0, rgb(shadeRgb(c, 1.5)));
        g.addColorStop(0.7, rgb(c));
        g.addColorStop(1, rgb(shadeRgb(c, 0.5)));
        sc.fill(pan, g);
        sc.fill(rectPath(x - 0.012, y - r - 0.15, 0.024, 0.15), rgb(shadeRgb(c, 0.7)));
        sc.occlude(pan, 1.85, 1.6);
      }
    });
  },
};

// ---------- Despensa ----------

const shelfPantry: PropDef = {
  needs: ['rect'],
  draw(sc, p, rng) {
    const [x0, y0, x1, y1] = p.rect!;
    const w = x1 - x0;
    const d = y1 - y0;
    const shelf = rectPath(x0, y0, w, d);
    sc.pat(shelf, 'wood_weathered', { rot: w > d ? 0 : 90, brightness: -0.1 });
    sc.stroke(shelf, 'rgba(25,15,8,0.8)', 0.02);
    const long = Math.max(w, d);
    const along = w > d;
    let s = 0.05;
    while (s < long - 0.08) {
      const kind = rng.int(0, 4);
      const size = kind === 3 ? rng.range(0.18, 0.3) : rng.range(0.08, 0.12);
      const across = (along ? d : w) * rng.range(0.35, 0.65);
      const cx = along ? x0 + s + size / 2 : x0 + across;
      const cy = along ? y0 + across : y0 + s + size / 2;
      if (kind === 0) {
        // Pote de vidro de conserva (tomate, pêssego, azeitona).
        const fill: RGB = rng.pick([
          [190, 50, 30],
          [220, 150, 60],
          [90, 100, 40],
          [210, 190, 120],
        ] as RGB[]);
        glassTop(sc, cx, cy, size / 2, fill);
        sc.fill(circlePath(cx, cy, size * 0.28), '#b9a26a');
      } else if (kind === 1) {
        sc.fill(circlePath(cx, cy, size / 2), '#a9adb0');
        sc.stroke(circlePath(cx, cy, size / 2 - 0.008), '#7b7f82', 0.006);
      } else if (kind === 2) {
        bottleTop(sc, cx, cy, size * 0.4, [50, 70, 30], [200, 170, 80], rng);
      } else {
        // Caixa/pacote de massa, papel pardo, sem impressão legível.
        const box = rectPath(cx - size / 2, cy - 0.06, size, 0.12, 0.01);
        sc.fill(box, rgb(jitter(rng, rng.pick([[200, 170, 110], [70, 100, 150], [180, 60, 50]] as RGB[]), 0.08)));
        sc.fill(rectPath(cx - size / 2 + 0.02, cy - 0.02, size * 0.5, 0.04), 'rgba(255,255,255,0.25)');
        sc.stroke(box, 'rgba(0,0,0,0.4)', 0.006);
      }
      s += size + rng.range(0.01, 0.05);
    }
    sc.occlude(shelf, 1.95);
  },
};

const crateWine: PropDef = {
  needs: ['at'],
  size: () => [0.52, 0.36],
  draw(sc, p, rng) {
    sc.frame(p.at![0], p.at![1], p.rot ?? rng.range(-15, 15), () => {
      const crate = rectPath(-0.26, -0.18, 0.52, 0.36);
      sc.pat(crate, 'wood_weathered', { brightness: 0.1 });
      sc.stroke(crate, 'rgba(40,25,10,0.9)', 0.025);
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 3; j++) {
          if (rng.chance(0.15)) continue;
          bottleTop(sc, -0.195 + i * 0.13, -0.11 + j * 0.11, 0.045, [28, 52, 30], rng.chance(0.5) ? [140, 30, 40] : [190, 160, 80], rng);
        }
      }
      sc.occlude(crate, 0.34);
    });
  },
};

const sackFlour: PropDef = {
  needs: ['at'],
  size: () => [0.6, 0.42],
  draw(sc, p, rng) {
    const [x, y] = p.at!;
    sc.stain([x - 0.6, y - 0.5, x + 0.6, y + 0.5], 'rgb(240,236,226)', 0.4, 0.08, { bias: -0.2 });
    for (let k = 0; k < 2; k++) {
      const dx = k ? rng.range(0.3, 0.4) : 0;
      sc.frame(x + dx, y + (k ? 0.15 : 0), rng.range(-20, 20), () => {
        const s = k ? 0.8 : 1;
        const sack = ellipsePath(0, 0, 0.3 * s, 0.21 * s);
        fabric(sc, sack, 0.6 * s, 0.42 * s, [196, 172, 128], rng, { creases: 0 });
        sc.stroke(sack, 'rgba(90,70,40,0.6)', 0.012);
        // Boca amarrada e costura.
        sc.fill(circlePath(0.22 * s, 0, 0.05 * s), '#b79c6c');
        sc.stroke(polyPath([[0.16 * s, -0.06], [0.28 * s, 0.06]]), '#6e5532', 0.008);
        sc.dome(0, 0, 0.3 * s, 0.45 * s, 0.1, 0, sack);
      });
    }
  },
};

export const INTERIOR_PROPS: Record<string, PropDef> = {
  bar_counter_zinc: barCounter,
  shelf_bottles: shelfBottles,
  espresso_machine: espressoMachine,
  cash_register: cashRegister,
  bar_stool: barStool,
  tv_wall: tvWall,
  fireplace_stone: fireplaceStone,
  firewood_stack: firewoodStack,
  table_square_cloth: tableSquareCloth,
  coat_rack: coatRack,
  stairs_wood: stairsWood,
  stove_industrial: stoveIndustrial,
  pot_steaming: potSteaming,
  kitchen_counter: kitchenCounter,
  sink_double: sinkDouble,
  fridge,
  prep_table_wood: prepTableWood,
  hanging_pans: hangingPans,
  shelf_pantry: shelfPantry,
  crate_wine: crateWine,
  sack_flour: sackFlour,
};

export { centerOfRect };
export type { PropSpec };
