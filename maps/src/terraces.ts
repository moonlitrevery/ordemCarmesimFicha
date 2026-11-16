// Muros de pedra seca em arco (terraços), com falhas, pedras roladas e mato por cima.
// Ângulos em graus, 0 = leste, crescendo no sentido anti-horário na tela (90 = norte).
import { blobPoly, type Vec } from './geom';
import type { Rng } from './rng';
import { polyPath, type Scene } from './scene';
import type { TerraceSpec } from './schema';
import { grassTuft } from './decals';
import { leafCluster, type RGB } from './props/kit';

const DRY: RGB[] = [
  [150, 138, 84],
  [126, 120, 66],
  [104, 110, 58],
];
const BRAMBLE: RGB[] = [
  [44, 62, 32],
  [58, 74, 38],
  [70, 70, 42],
];

export function arcPoint(c: Vec, r: number, deg: number): Vec {
  const a = (deg * Math.PI) / 180;
  return [c[0] + Math.cos(a) * r, c[1] - Math.sin(a) * r];
}

export function drawTerraces(sc: Scene, terraces: TerraceSpec[], rng: Rng) {
  terraces.forEach((t, ti) => {
    const r0 = rng.fork(`terrace:${ti}`);
    const c = t.arc_center as Vec;
    const span = t.to_deg - t.from_deg;
    const length = (Math.abs(span) * Math.PI * t.radius) / 180;
    // Falhas: trechos desmoronados.
    const gaps = Array.from({ length: t.gaps }, () => {
      const s = r0.range(0.05, 0.95) * length;
      const w = r0.range(1.4, 3.4);
      return [s - w / 2, s + w / 2] as [number, number];
    });
    const inGap = (s: number) => gaps.some(([a, b]) => s > a && s < b);
    const deg = (s: number) => t.from_deg + (s / length) * span;
    const band = 0.7;
    const courses = 2;
    for (let k = 0; k < courses; k++) {
      let s = r0.range(0, 0.3);
      while (s < length) {
        const size = r0.range(0.28, 0.55);
        const mid = s + size / 2;
        s += size + r0.range(0.01, 0.05);
        if (inGap(mid) || r0.chance(0.04)) continue;
        const off = -band / 2 + (band / courses) * (k + 0.5) + r0.range(-0.05, 0.05);
        const p = arcPoint(c, t.radius + off, deg(mid));
        const tangent = ((deg(mid) + 90) * Math.PI) / 180;
        const stone = polyPath(blobPoly(p, size / 2, () => r0.next(), { rough: 0.22, points: 8, stretch: 1.25, rot: -tangent }));
        sc.pat(stone, t.material, { brightness: r0.range(-0.12, 0.08) });
        sc.stroke(stone, 'rgba(25,24,18,0.75)', 0.025);
        if (r0.chance(t.overgrowth * 0.5)) sc.pat(stone, 'moss', { alpha: r0.range(0.3, 0.7) });
        sc.dome(p[0], p[1], size / 2, t.height_m + r0.range(-0.2, 0.1), t.height_m * 0.6, 0, stone);
      }
    }
    // Pedras roladas morro abaixo (para dentro da tigela) nas falhas.
    for (const [a, b] of gaps) {
      for (let k = 0; k < (b - a) * 5; k++) {
        const sm = r0.range(a, b);
        const p = arcPoint(c, t.radius - r0.range(-0.2, 2.2), deg(sm));
        const size = r0.range(0.15, 0.4);
        const stone = polyPath(blobPoly(p, size / 2, () => r0.next(), { rough: 0.3, points: 7 }));
        sc.pat(stone, t.material, { brightness: r0.range(-0.1, 0.05) });
        sc.stroke(stone, 'rgba(25,24,18,0.7)', 0.02);
        sc.dome(p[0], p[1], size / 2, size * 0.7, 0.05, 0, stone);
      }
    }
    // Mato engolindo o muro.
    const tufts = Math.round(length * t.overgrowth * 1.4);
    for (let k = 0; k < tufts; k++) {
      const sm = r0.range(0, length);
      const p = arcPoint(c, t.radius + r0.range(-0.6, 0.6), deg(sm));
      if (r0.chance(0.35)) {
        leafCluster(sc, p[0], p[1], r0.range(0.4, 0.9), BRAMBLE, r0, { leaf: 0.06, height: t.height_m + 0.5, base: 0, flowers: [[36, 20, 34]], flowerRate: 0.04 });
      } else {
        grassTuft(sc, p, r0.range(0.3, 0.6), DRY, r0, t.height_m + 0.3);
      }
    }
  });
}
