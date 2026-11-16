// Terreno em tigela (vale): só sugere relevo pelo sombreamento, sem curvas de nível.
import type { Scene } from './scene';
import type { TerrainSpec } from './schema';

const OPEN_DIR: Record<string, [number, number]> = {
  east: [1, 0],
  west: [-1, 0],
  north: [0, -1],
  south: [0, 1],
};

/** Altura do terreno (m) num ponto: fundo da tigela em −depth, borda em 0. */
export function bowlHeight(t: TerrainSpec, x: number, y: number): number {
  const dx = x - t.center[0];
  const dy = y - t.center[1];
  const r = Math.hypot(dx, dy) / t.radius;
  // Perfil suave: plano no fundo, sobe até a borda e continua de leve fora.
  const inner = r < 1 ? -t.depth_m * (1 - r * r) ** 1.4 : 0;
  let h = inner + (r >= 1 ? (r - 1) * t.radius * 0.08 : 0);
  if (t.rim_open) {
    // Borda aberta: do lado indicado o terreno não sobe, desce para fora da tigela.
    const [ox, oy] = OPEN_DIR[t.rim_open];
    const len = Math.hypot(dx, dy) || 1;
    const facing = Math.max(0, (dx * ox + dy * oy) / len);
    const open = facing ** 2.5 * Math.min(1, r);
    const outward = -t.depth_m * 0.55 * Math.min(1.6, r);
    h = h * (1 - open) + Math.min(h, outward) * open;
  }
  return h;
}

export function buildTerrain(scene: Scene, t: TerrainSpec): Float32Array {
  const { W, H, ppm } = scene;
  const out = new Float32Array(W * H);
  // Calcula numa grade grossa (0,5 m) e interpola: é só para sombreamento suave.
  const step = Math.max(1, Math.round(ppm * 0.5));
  const gw = Math.ceil(W / step) + 2;
  const gh = Math.ceil(H / step) + 2;
  const grid = new Float32Array(gw * gh);
  const n = scene.noise;
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const x = (i * step) / ppm;
      const y = (j * step) / ppm;
      // Ondulação leve para não parecer torneado.
      grid[j * gw + i] = bowlHeight(t, x, y) + (n.fbm(x * 0.05, y * 0.05, 3) - 0.5) * 2.4;
    }
  }
  for (let y = 0; y < H; y++) {
    const fy = y / step;
    const j = Math.floor(fy);
    const ay = fy - j;
    for (let x = 0; x < W; x++) {
      const fx = x / step;
      const i = Math.floor(fx);
      const ax = fx - i;
      const k = j * gw + i;
      const a = grid[k] + (grid[k + 1] - grid[k]) * ax;
      const b = grid[k + gw] + (grid[k + gw + 1] - grid[k + gw]) * ax;
      out[y * W + x] = a + (b - a) * ay;
    }
  }
  return out;
}
