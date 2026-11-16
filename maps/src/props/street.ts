// Objetos de rua: poste, cartazes, viatura, lambreta, varal entre prédios, cachorro, porta.
import { blobPoly, dist, type Vec } from '../geom';
import type { Rng } from '../rng';
import type { Scene } from '../scene';
import type { PropSpec } from '../schema';
import type { PropDef } from './index';
import { hangLine } from './outdoor';
import { circlePath, ellipsePath, jitter, metal, polyPath, rectPath, rgb, shadeRgb, type RGB } from './kit';

const IRON: RGB = [38, 40, 40];

const lampPost: PropDef = {
  needs: ['at'],
  size: () => [0.4, 0.4],
  draw(sc, p, rng) {
    const [x, y] = p.at!;
    const rot = p.rot ?? rng.range(0, 360);
    // Base fundida, coluna fina, braço e lanterna (a sombra comprida é o que mais aparece).
    sc.fill(circlePath(x, y, 0.17), rgb(IRON));
    sc.stroke(circlePath(x, y, 0.13), 'rgba(110,110,105,0.5)', 0.012);
    sc.occlude(circlePath(x, y, 0.17), 0.6);
    sc.occlude(circlePath(x, y, 0.065), 3.9);
    sc.frame(x, y, rot, () => {
      sc.fill(rectPath(0, -0.025, 0.55, 0.05), rgb(IRON));
      sc.occlude(rectPath(0, -0.025, 0.55, 0.05), 3.95, 3.85);
      const lantern = polyPath(Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2;
        return [0.6 + Math.cos(a) * 0.2, Math.sin(a) * 0.2] as Vec;
      }));
      sc.fill(lantern, rgb(shadeRgb(IRON, 1.2)));
      sc.fill(circlePath(0.6, 0, 0.12), 'rgba(230,220,180,0.45)');
      sc.fill(circlePath(0.6, 0, 0.05), rgb(IRON));
      sc.stroke(lantern, 'rgba(0,0,0,0.8)', 0.012);
      sc.occlude(lantern, 4.1, 3.6);
    });
    sc.fill(circlePath(x, y, 0.07), rgb(shadeRgb(IRON, 1.3)));
    sc.fill(circlePath(x - 0.02, y - 0.02, 0.025), 'rgba(200,200,190,0.35)');
  },
};

/** Cartazes de desaparecido presos no poste (e um caído): foto borrada e linhas ilegíveis. */
const missingPosters: PropDef = {
  needs: ['at'],
  phase: 2,
  noNudge: true,
  draw(sc, p, rng) {
    const [x, y] = p.at!;
    const count = p.count ?? 2;
    for (let k = 0; k < count; k++) {
      const a = rng.angle();
      // Papel colado em volta do poste: de cima é uma aba saindo da coluna.
      sc.push(x, y, (a * 180) / Math.PI);
      const flap = polyPath([
        [0.06, -0.1],
        [0.2, -0.12],
        [0.22, 0.12],
        [0.06, 0.1],
      ]);
      sc.fill(flap, k % 2 ? '#f1ecdc' : '#e9e2c9');
      sc.fill(rectPath(0.1, -0.06, 0.06, 0.07), 'rgba(70,70,70,0.6)');
      sc.fill(rectPath(0.1, 0.03, 0.09, 0.012), 'rgba(60,60,60,0.35)');
      sc.stroke(flap, 'rgba(80,70,50,0.5)', 0.004);
      sc.occlude(flap, 1.8, 1.3);
      sc.pop();
    }
    // Um caído e pisado no chão, molhado.
    const fall: Vec = [x + rng.range(-0.9, 0.9), y + rng.range(-0.9, 0.9)];
    sc.push(fall[0], fall[1], rng.range(0, 360));
    const sheet = polyPath([
      [-0.105, -0.148],
      [0.105, -0.142],
      [0.1, 0.15],
      [-0.11, 0.148],
    ]);
    sc.fill(sheet, '#e4ddc6');
    sc.fill(rectPath(-0.07, -0.12, 0.14, 0.12), 'rgba(60,60,60,0.55)');
    sc.fill(ellipsePath(0, -0.07, 0.035, 0.045), 'rgba(140,140,140,0.6)');
    for (let r = 0; r < 4; r++) sc.fill(rectPath(-0.08, 0.02 + r * 0.025, 0.16 * rng.range(0.6, 1), 0.01), 'rgba(50,50,50,0.4)');
    sc.stain([-0.11, -0.15, 0.11, 0.15], 'rgb(90,80,60)', 0.45, 0.05, { clip: sheet });
    sc.fill(ellipsePath(0.03, 0.06, 0.05, 0.03), 'rgba(60,50,40,0.35)');
    sc.pop();
  },
};

/** Carro compacto de cima: capô, para-brisa, teto, vigia, retrovisores, rodas aparecendo. */
export function compactCar(sc: Scene, rng: Rng, body: RGB, opts: { police?: boolean; length?: number; width?: number } = {}) {
  const L = opts.length ?? 3.65;
  const W = opts.width ?? 1.62;
  // Frente para −y (norte com rot 0).
  for (const [wx, wy] of [
    [-W / 2, -L / 2 + 0.6],
    [W / 2, -L / 2 + 0.6],
    [-W / 2, L / 2 - 0.55],
    [W / 2, L / 2 - 0.55],
  ]) {
    sc.fill(rectPath(wx - 0.1, wy - 0.3, 0.2, 0.6, 0.06), '#151515');
  }
  const shell = rectPath(-W / 2, -L / 2, W, L, 0.32);
  const g = sc.c.createLinearGradient(-W / 2, 0, W / 2, 0);
  g.addColorStop(0, rgb(shadeRgb(body, 0.7)));
  g.addColorStop(0.25, rgb(shadeRgb(body, 1.1)));
  g.addColorStop(0.5, rgb(shadeRgb(body, 1.25)));
  g.addColorStop(0.75, rgb(shadeRgb(body, 1.05)));
  g.addColorStop(1, rgb(shadeRgb(body, 0.7)));
  sc.fill(shell, g);
  sc.stroke(shell, 'rgba(0,0,0,0.85)', 0.025);
  // Faixa vermelha lateral da viatura (vista de cima, só a borda).
  if (opts.police) {
    sc.fill(rectPath(-W / 2 + 0.01, -L / 2 + 0.5, 0.05, L - 1.0), '#a2161a');
    sc.fill(rectPath(W / 2 - 0.06, -L / 2 + 0.5, 0.05, L - 1.0), '#a2161a');
  }
  // Para-brisa, teto, vigia traseira.
  const glass = (y0: number, y1: number, inset0: number, inset1: number) =>
    polyPath([
      [-W / 2 + inset0, y0],
      [W / 2 - inset0, y0],
      [W / 2 - inset1, y1],
      [-W / 2 + inset1, y1],
    ]);
  const wind = glass(-L / 2 + 0.95, -L / 2 + 1.55, 0.2, 0.16);
  const gg = sc.c.createLinearGradient(0, -L / 2 + 0.95, 0, -L / 2 + 1.55);
  gg.addColorStop(0, '#9fb3c0');
  gg.addColorStop(1, '#223038');
  sc.fill(wind, gg);
  sc.fill(polyPath([[-W / 2 + 0.3, -L / 2 + 1.0], [-W / 2 + 0.6, -L / 2 + 1.0], [-W / 2 + 0.45, -L / 2 + 1.5], [-W / 2 + 0.25, -L / 2 + 1.5]]), 'rgba(255,255,255,0.25)');
  const roof = rectPath(-W / 2 + 0.17, -L / 2 + 1.55, W - 0.34, 1.35, 0.1);
  sc.fill(roof, rgb(shadeRgb(body, 1.08)));
  sc.stroke(roof, 'rgba(0,0,0,0.35)', 0.012);
  sc.fill(glass(-L / 2 + 2.9, -L / 2 + 3.25, 0.17, 0.22), '#26343c');
  // Janelas laterais (faixa escura ao lado do teto).
  sc.fill(rectPath(-W / 2 + 0.08, -L / 2 + 1.55, 0.09, 1.35), '#1c2328');
  sc.fill(rectPath(W / 2 - 0.17, -L / 2 + 1.55, 0.09, 1.35), '#1c2328');
  // Retrovisores, faróis, vinco do capô.
  sc.fill(ellipsePath(-W / 2 - 0.05, -L / 2 + 1.05, 0.09, 0.05), rgb(shadeRgb(body, 0.8)));
  sc.fill(ellipsePath(W / 2 + 0.05, -L / 2 + 1.05, 0.09, 0.05), rgb(shadeRgb(body, 0.8)));
  sc.fill(rectPath(-W / 2 + 0.12, -L / 2 + 0.02, 0.35, 0.07, 0.03), '#dfe3e2');
  sc.fill(rectPath(W / 2 - 0.47, -L / 2 + 0.02, 0.35, 0.07, 0.03), '#dfe3e2');
  sc.fill(rectPath(-W / 2 + 0.12, L / 2 - 0.08, 0.3, 0.06, 0.02), '#7c1414');
  sc.fill(rectPath(W / 2 - 0.42, L / 2 - 0.08, 0.3, 0.06, 0.02), '#7c1414');
  sc.stroke(polyPath([[-0.35, -L / 2 + 0.15], [-0.3, -L / 2 + 0.9]]), 'rgba(0,0,0,0.25)', 0.01);
  sc.stroke(polyPath([[0.35, -L / 2 + 0.15], [0.3, -L / 2 + 0.9]]), 'rgba(0,0,0,0.25)', 0.01);
  if (opts.police) {
    // Barra de luzes azuis no teto (sem nada escrito).
    const bar = rectPath(-0.55, -L / 2 + 1.85, 1.1, 0.22, 0.06);
    sc.fill(bar, '#2b2e33');
    sc.fill(rectPath(-0.52, -L / 2 + 1.88, 0.45, 0.16, 0.05), '#2e5fc9');
    sc.fill(rectPath(0.07, -L / 2 + 1.88, 0.45, 0.16, 0.05), '#2e5fc9');
    sc.fill(rectPath(-0.07, -L / 2 + 1.9, 0.14, 0.12), '#c9c9c9');
    sc.occlude(bar, 1.62);
  }
  // Poeira e sujeira de estrada de interior.
  sc.stain([-W / 2, -L / 2, W / 2, L / 2], 'rgb(150,140,120)', 0.25, 0.25, { clip: shell });
  sc.occlude(rectPath(-W / 2, -L / 2 + 0.05, W, L - 0.1, 0.3), 0.85);
  sc.dome(0, -L / 2 + 2.2, W * 0.5, 1.52, 1.3, 0, roof);
  sc.occlude(rectPath(-W / 2 + 0.1, -L / 2 + 0.9, W - 0.2, 2.4, 0.2), 1.25);
  void rng;
}

const policeCarSmall: PropDef = {
  needs: ['at'],
  size: () => [1.62, 3.65],
  draw(sc, p, rng) {
    sc.frame(p.at![0], p.at![1], p.rot ?? 0, () => compactCar(sc, rng, [24, 32, 56], { police: true }));
  },
};

/** Lambreta: escudo frontal, banco, guidão, rodas pequenas. */
const scooter: PropDef = {
  needs: ['at'],
  size: () => [0.7, 1.8],
  draw(sc, p, rng) {
    const color = jitter(rng, rng.pick([[150, 190, 180], [200, 60, 40], [230, 220, 190], [70, 100, 140]] as RGB[]), 0.05);
    sc.frame(p.at![0], p.at![1], p.rot ?? 0, () => {
      sc.fill(rectPath(-0.06, -0.92, 0.12, 0.3, 0.05), '#161616');
      sc.fill(rectPath(-0.06, 0.62, 0.12, 0.3, 0.05), '#161616');
      // Carenagem traseira larga e piso.
      const rear = polyPath([
        [-0.3, 0.1],
        [-0.34, 0.6],
        [-0.2, 0.85],
        [0.2, 0.85],
        [0.34, 0.6],
        [0.3, 0.1],
      ]);
      metal(sc, rear, 0.68, 0.8, color, rng, { streaks: false });
      sc.stroke(rear, 'rgba(0,0,0,0.7)', 0.012);
      sc.fill(rectPath(-0.17, -0.45, 0.34, 0.6, 0.05), '#3b3b3b');
      for (let k = 0; k < 5; k++) sc.fill(rectPath(-0.15, -0.4 + k * 0.11, 0.3, 0.02), '#262626');
      const shield = polyPath([
        [-0.27, -0.5],
        [0.27, -0.5],
        [0.18, -0.72],
        [-0.18, -0.72],
      ]);
      metal(sc, shield, 0.54, 0.22, color, rng, { streaks: false });
      sc.stroke(shield, 'rgba(0,0,0,0.7)', 0.012);
      const seat = rectPath(-0.14, 0.12, 0.28, 0.55, 0.12);
      sc.fill(seat, '#2a2420');
      sc.fill(rectPath(-0.1, 0.16, 0.08, 0.45, 0.04), 'rgba(255,255,255,0.08)');
      // Guidão e farol.
      sc.fill(rectPath(-0.36, -0.79, 0.72, 0.04, 0.02), '#2a2a2a');
      sc.fill(circlePath(0, -0.78, 0.07), rgb(shadeRgb(color, 1.1)));
      sc.fill(circlePath(0, -0.82, 0.04), '#e8eef0');
      sc.fill(circlePath(-0.36, -0.77, 0.03), '#888');
      sc.fill(circlePath(0.36, -0.77, 0.03), '#888');
      sc.occlude(rear, 0.85);
      sc.occlude(seat, 0.82);
      sc.occlude(shield, 0.95);
      sc.occlude(rectPath(-0.36, -0.81, 0.72, 0.06), 1.05, 0.95);
    });
  },
};

const clotheslineAcross: PropDef = {
  needs: ['from', 'to'],
  phase: 3,
  noNudge: true,
  draw(sc, p, rng) {
    const a = p.from as Vec;
    const b = p.to as Vec;
    // Varal de janela a janela, alto; ganchos nas pontas.
    hangLine(sc, a, b, 5.2, rng, p.clothes ?? true, false);
    for (const q of [a, b]) {
      sc.fill(circlePath(q[0], q[1], 0.04), '#5a5a58');
      sc.occlude(circlePath(q[0], q[1], 0.04), 5.3, 5.0);
    }
    void dist;
  },
};

/** Cachorro deitado amarrado: corpo, cabeça, rabo, pelagem, coleira e guia até a argola. */
const dogTied: PropDef = {
  needs: ['at'],
  size: () => [0.5, 0.9],
  draw(sc, p, rng) {
    const [x, y] = p.at!;
    const coat = rng.pick([
      [140, 100, 60],
      [60, 46, 36],
      [190, 170, 140],
      [110, 80, 50],
    ] as RGB[]);
    const rot = p.rot ?? rng.range(0, 360);
    // Argola na parede/poste mais próxima: a guia vai na direção oposta à da cabeça.
    sc.frame(x, y, rot, () => {
      const anchor: Vec = [0, 0.9];
      sc.stroke(polyPath([[0, 0.25], [0.1, 0.55], anchor]), '#5b3a22', 0.012);
      sc.fill(circlePath(anchor[0], anchor[1], 0.035), '#6a6a66');
      // Tigela d'água.
      sc.fill(circlePath(0.35, 0.45, 0.09), '#9aa0a4');
      sc.fill(circlePath(0.35, 0.45, 0.065), '#55707a');
      sc.occlude(circlePath(0.35, 0.45, 0.09), 0.07);
      const body = ellipsePath(0, 0.05, 0.17, 0.33);
      const g = sc.c.createRadialGradient(-0.04, 0, 0.02, 0, 0.05, 0.35);
      g.addColorStop(0, rgb(shadeRgb(coat, 1.3)));
      g.addColorStop(1, rgb(shadeRgb(coat, 0.7)));
      // Patas encolhidas, rabo enrolado.
      for (const [px, py] of [
        [-0.13, -0.22],
        [0.11, -0.24],
        [-0.15, 0.25],
      ]) {
        sc.fill(ellipsePath(px, py, 0.05, 0.1, 0.3), rgb(shadeRgb(coat, 0.9)));
      }
      sc.stroke(polyPath([[0.05, 0.35], [0.2, 0.42], [0.22, 0.3]]), rgb(shadeRgb(coat, 0.85)), 0.06);
      sc.fill(body, g);
      // Pelos: risquinhos na direção do corpo.
      for (let k = 0; k < 120; k++) {
        const a = rng.angle();
        const r = Math.sqrt(rng.next());
        const fx = Math.cos(a) * 0.15 * r;
        const fy = 0.05 + Math.sin(a) * 0.3 * r;
        sc.stroke(polyPath([[fx, fy], [fx + rng.range(-0.01, 0.01), fy + 0.03]]), rgb(shadeRgb(coat, rng.range(0.7, 1.3)), 0.6), 0.006);
      }
      sc.fill(ellipsePath(-0.02, -0.36, 0.11, 0.12), rgb(shadeRgb(coat, 1.05)));
      sc.fill(ellipsePath(-0.03, -0.47, 0.06, 0.07), rgb(shadeRgb(coat, 0.95)));
      sc.fill(circlePath(-0.03, -0.53, 0.022), '#151110');
      sc.fill(ellipsePath(-0.12, -0.36, 0.035, 0.06, -0.4), rgb(shadeRgb(coat, 0.7)));
      sc.fill(ellipsePath(0.08, -0.36, 0.035, 0.06, 0.4), rgb(shadeRgb(coat, 0.7)));
      sc.stroke(ellipsePath(-0.01, -0.27, 0.09, 0.03), '#9b2420', 0.025);
      sc.dome(0, 0.05, 0.33, 0.38, 0.12, 0, body);
      sc.dome(-0.02, -0.38, 0.14, 0.32, 0.15);
    });
  },
};

/** Porta do posto: degrau de pedra, soleira e porta de madeira encostada na fachada. */
const doorMarker: PropDef = {
  needs: ['at'],
  noNudge: true,
  draw(sc, p, rng) {
    const [x, y] = p.at!;
    // Descobre de que lado está o prédio: a porta abre para fora dele.
    const inside = sc.occupied.find((o) => o.kind === 'building' && o.poly.some(() => true) && near(o.poly, [x, y]));
    let rot = p.rot ?? 0;
    if (p.rot === undefined && inside) {
      const cx = inside.poly.reduce((s, q) => s + q[0], 0) / inside.poly.length;
      const cy = inside.poly.reduce((s, q) => s + q[1], 0) / inside.poly.length;
      rot = Math.round(((Math.atan2(-(x - cx), y - cy) * 180) / Math.PI + 180) / 90) * 90;
    }
    sc.frame(x, y, rot, () => {
      const step = rectPath(-0.75, -0.55, 1.5, 0.55, 0.02);
      sc.pat(step, 'stone_grey', { brightness: 0.05 });
      sc.stroke(step, 'rgba(20,20,20,0.6)', 0.02);
      sc.stain([-0.75, -0.55, 0.75, 0], 'rgb(60,55,50)', 0.3, 0.1, { clip: step });
      sc.occlude(step, 0.16);
      // Capacho gasto.
      const mat = rectPath(-0.4, -0.45, 0.8, 0.35, 0.02);
      sc.fill(mat, '#5c4a36');
      for (let k = 0; k < 12; k++) sc.fill(rectPath(-0.38 + k * 0.065, -0.43, 0.03, 0.31), 'rgba(30,22,14,0.35)');
      // Batente e porta embutidos no beiral.
      sc.fill(rectPath(-0.6, -0.05, 1.2, 0.1), '#3a2a1c');
      sc.pat(rectPath(-0.5, -0.04, 1.0, 0.08), 'wood_weathered', { brightness: -0.1 });
      void rng;
    });
  },
};

function near(poly: Vec[], [x, y]: Vec) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return x >= Math.min(...xs) - 0.3 && x <= Math.max(...xs) + 0.3 && y >= Math.min(...ys) - 0.3 && y <= Math.max(...ys) + 0.3;
}

export const STREET_PROPS: Record<string, PropDef> = {
  lamp_post_iron: lampPost,
  missing_posters: missingPosters,
  police_car_small: policeCarSmall,
  scooter,
  clothesline_across_street: clotheslineAcross,
  dog_tied: dogTied,
  door_marker: doorMarker,
};

export type { PropSpec };
export { blobPoly };
