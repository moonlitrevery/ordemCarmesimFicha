// Luz do dia: sombra projetada (raymarch no mapa de alturas), oclusão ambiente e relevo.
import fs from 'fs';
import path from 'path';
import { createCanvas } from '@napi-rs/canvas';
import type { Scene } from './scene';

export interface Sun {
  azimuth_deg: number;
  elevation_deg: number;
}

/** Direção horizontal para o sol, no mapa (x → leste, y → sul). Azimute de bússola. */
export function sunVector(sun: Sun): { dx: number; dy: number; tan: number; l: [number, number, number] } {
  const az = (sun.azimuth_deg * Math.PI) / 180;
  const el = (sun.elevation_deg * Math.PI) / 180;
  const dx = Math.sin(az);
  const dy = -Math.cos(az);
  return {
    dx,
    dy,
    tan: Math.tan(el),
    l: [dx * Math.cos(el), dy * Math.cos(el), Math.sin(el)],
  };
}

/** Desfoque de caixa separável (soma corrente), `passes` vezes ≈ gaussiano. */
export function boxBlur(src: Float32Array, w: number, h: number, r: number, passes = 2): Float32Array {
  if (r < 1) return src.slice();
  const a = src.slice();
  const b = new Float32Array(src.length);
  const inv = 1 / (2 * r + 1);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += a[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        b[row + x] = acc * inv;
        acc += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += b[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc * inv;
        acc += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
      }
    }
  }
  return a;
}

function channel(scene: Scene, which: 'solid' | 'ftop' | 'fbot' | 'indoor'): Uint8ClampedArray {
  const canvas = scene[which];
  const ctx = canvas.getContext('2d');
  return ctx.getImageData(0, 0, scene.W, scene.H).data;
}

export interface LightingStats {
  gridFactor: number;
  shadowMs: number;
  totalMs: number;
}

export function applyLighting(scene: Scene, sun: Sun): LightingStats {
  const t0 = performance.now();
  const { W, H, ppm, hMax } = scene;
  const N = W * H;
  const k = hMax / 255;
  const sd = channel(scene, 'solid');
  const td = channel(scene, 'ftop');
  const bd = channel(scene, 'fbot');
  const id = channel(scene, 'indoor');
  const hf = scene.hfield;
  const ftf = scene.floatTop;
  const fbf = scene.floatBot;

  // Superfície vista de cima (relativa ao terreno) e volumes de sombra.
  const surf = new Float32Array(N);
  let maxTop = 0;
  for (let i = 0; i < N; i++) {
    const s = Math.max(sd[i * 4] * k, hf[i]);
    const t = Math.max(td[i * 4] * k, ftf[i]);
    const top = Math.max(s, t);
    surf[i] = top;
    if (top > maxTop) maxTop = top;
  }

  const sv = sunVector(sun);
  // Célula da grade de sombra: ~200 passos até a altura máxima, e no máx. ~3 Mpx.
  const cellTarget = Math.max(0.012, maxTop / (sv.tan * 200));
  const f = Math.max(1, Math.round(cellTarget * ppm), Math.ceil(Math.sqrt(N / 3e6)));
  const gw = Math.ceil(W / f);
  const gh = Math.ceil(H / f);
  const G = gw * gh;
  const gS = new Float32Array(G);
  const gT = new Float32Array(G);
  const gB = new Float32Array(G).fill(1e9);
  const gR = new Float32Array(G);
  const gA = new Float32Array(G);
  const gI = new Float32Array(G);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const gi = gy * gw + gx;
      let smax = 0;
      let tmax = 0;
      let bmin = 1e9;
      let sum = 0;
      let ind = 0;
      let n = 0;
      for (let y = gy * f; y < Math.min(H, gy * f + f); y++) {
        for (let x = gx * f; x < Math.min(W, gx * f + f); x++) {
          const i = y * W + x;
          const s = Math.max(sd[i * 4] * k, hf[i]);
          if (s > smax) smax = s;
          const tc = td[i * 4] * k;
          const t = Math.max(tc, ftf[i]);
          if (t > tmax) tmax = t;
          if (tc > 0.02) {
            const b = bd[i * 4] * k;
            if (b < bmin) bmin = b;
          }
          if (ftf[i] > 0.02 && fbf[i] < bmin) bmin = fbf[i];
          sum += surf[i];
          ind += id[i * 4];
          n++;
        }
      }
      gS[gi] = smax;
      gT[gi] = tmax;
      gB[gi] = tmax > 0.02 ? bmin : 1e9;
      const cx = Math.min(W - 1, gx * f + (f >> 1));
      const cy = Math.min(H - 1, gy * f + (f >> 1));
      gR[gi] = surf[cy * W + cx];
      gA[gi] = sum / n;
      gI[gi] = ind / n / 255;
    }
  }

  // Raymarch para o sol: cada passo anda uma célula e sobe `rise` metros.
  const ts = performance.now();
  const cellM = f / ppm;
  const rise = cellM * sv.tan;
  const shadow = new Float32Array(G);
  const hitDist = new Float32Array(G);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const gi = gy * gw + gx;
      const start = gR[gi] + 0.03;
      const steps = Math.ceil((maxTop - start) / rise);
      let x = gx + 0.5;
      let y = gy + 0.5;
      let hgt = start;
      for (let s = 1; s <= steps; s++) {
        x += sv.dx;
        y += sv.dy;
        hgt += rise;
        if (x < 0 || y < 0 || x >= gw || y >= gh) break;
        const q = (y | 0) * gw + (x | 0);
        if (gS[q] > hgt || (gT[q] >= hgt && gB[q] <= hgt)) {
          shadow[gi] = 1;
          hitDist[gi] = s * cellM;
          break;
        }
      }
    }
  }
  const shadowMs = performance.now() - ts;

  // Penumbra: perto do objeto a sombra é nítida, longe ela abre.
  const rSmall = Math.max(1, Math.round(0.05 / cellM));
  const rLarge = Math.max(2, Math.round(0.3 / cellM));
  const sharp = boxBlur(shadow, gw, gh, rSmall);
  const soft = boxBlur(shadow, gw, gh, rLarge);
  const distB = boxBlur(hitDist, gw, gh, rLarge);
  const mask = new Float32Array(G);
  for (let i = 0; i < G; i++) {
    const w = Math.min(1, distB[i] / Math.max(0.01, soft[i]) / 7);
    mask[i] = sharp[i] + (soft[i] - sharp[i]) * w;
  }

  // AO: o quanto a vizinhança é mais alta que o ponto (pé de parede, cantos).
  const ao1 = boxBlur(gA, gw, gh, Math.max(1, Math.round(0.18 / cellM)));
  const ao2 = boxBlur(gA, gw, gh, Math.max(2, Math.round(0.7 / cellM)));
  const ao = new Float32Array(G);
  for (let i = 0; i < G; i++) {
    const occ = Math.max(0, ao1[i] - gA[i]) * 0.42 + Math.max(0, ao2[i] - gA[i]) * 0.2;
    ao[i] = Math.min(0.55, occ);
  }
  const indoorB = boxBlur(gI, gw, gh, Math.max(1, Math.round(0.2 / cellM)));
  if (process.env.MAPS_DEBUG) {
    // Sombra, AO e alturas da grade, para achar artefato de luz.
    const dump = (name: string, arr: Float32Array, scale: number) => {
      const c = createCanvas(gw, gh);
      const g = c.getContext('2d');
      const img = g.createImageData(gw, gh);
      for (let i = 0; i < G; i++) {
        const v = Math.max(0, Math.min(255, arr[i] * scale));
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      const dir = path.resolve('maps/out/debug');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `light.${name}.png`), c.toBuffer('image/png'));
    };
    dump('mask', mask, 255);
    dump('ao', ao, 400);
    dump('receiver', gR, 255 / Math.max(1, maxTop));
    dump('solid', gS, 255 / Math.max(1, maxTop));
  }

  // Relevo em resolução cheia: altura do objeto + terreno (exagerado, só sugere).
  const relief = new Float32Array(N);
  const terrain = scene.terrain;
  for (let i = 0; i < N; i++) relief[i] = surf[i] + (terrain ? terrain[i] * 1.5 : 0);
  const rr = Math.max(1, Math.round(0.015 * ppm));
  const rel = boxBlur(relief, W, H, rr, 1);
  const terr = terrain ? boxBlur(terrain, W, H, Math.max(2, Math.round(1.5 * ppm)), 2) : null;

  const ctx = scene.color.getContext('2d');
  const img = ctx.getImageData(0, 0, W, H);
  const px = img.data;
  const [lx, ly, lz] = sv.l;
  const inv2 = ppm / 2;
  const sample = (arr: Float32Array, fx: number, fy: number) => {
    const x = Math.max(0, Math.min(gw - 1.001, fx));
    const y = Math.max(0, Math.min(gh - 1.001, fy));
    const x0 = x | 0;
    const y0 = y | 0;
    const ax = x - x0;
    const ay = y - y0;
    const i = y0 * gw + x0;
    const a = arr[i] + (arr[i + 1] - arr[i]) * ax;
    const b = arr[i + gw] + (arr[i + gw + 1] - arr[i + gw]) * ax;
    return a + (b - a) * ay;
  };
  for (let y = 0; y < H; y++) {
    const fy = (y + 0.5) / f - 0.5;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const fx = (x + 0.5) / f - 0.5;
      const m = sample(mask, fx, fy);
      const o = sample(ao, fx, fy);
      const indoor = sample(indoorB, fx, fy);

      // Normal do mapa de alturas: lado virado para o sol clareia, o outro escurece.
      const xl = x > 0 ? i - 1 : i;
      const xr = x < W - 1 ? i + 1 : i;
      const yu = y > 0 ? i - W : i;
      const yd = y < H - 1 ? i + W : i;
      const gxv = (rel[xr] - rel[xl]) * inv2;
      const gyv = (rel[yd] - rel[yu]) * inv2;
      const nlen = Math.sqrt(gxv * gxv + gyv * gyv + 1);
      let shade = (-gxv * lx - gyv * ly + lz) / nlen / lz;
      shade = Math.max(0.5, Math.min(1.45, 1 + (shade - 1) * 0.7));
      if (terr) {
        const tgx = (terr[xr] - terr[xl]) * inv2 * 3;
        const tgy = (terr[yd] - terr[yu]) * inv2 * 3;
        const tl = Math.sqrt(tgx * tgx + tgy * tgy + 1);
        const ts2 = (-tgx * lx - tgy * ly + lz) / tl / lz;
        shade *= Math.max(0.7, Math.min(1.25, 1 + (ts2 - 1) * 0.6));
      }

      // Dentro de casa a luz rebatida clareia a sombra.
      const strength = m * (1 - indoor * 0.5);
      const sr = 1 - strength * 0.47;
      const sg = 1 - strength * 0.45;
      const sb = 1 - strength * 0.34;
      const lit = 1 - strength;
      const aoMul = 1 - o * (1 - indoor * 0.2);
      const p = i * 4;
      let r = px[p] * sr * aoMul * shade * (1 + 0.05 * lit);
      let g = px[p + 1] * sg * aoMul * shade * (1 + 0.015 * lit);
      let b = px[p + 2] * sb * aoMul * shade * (1 - 0.035 * lit);
      // Acabamento: um pouco mais de saturação e contraste, como render de dia.
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      r = l + (r - l) * 1.05;
      g = l + (g - l) * 1.05;
      b = l + (b - l) * 1.05;
      px[p] = (r - 128) * 1.06 + 128;
      px[p + 1] = (g - 128) * 1.06 + 128;
      px[p + 2] = (b - 128) * 1.06 + 128;
    }
  }
  // putImageData do @napi-rs/canvas aplica a transformação (o padrão não): zera antes.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.putImageData(img, 0, 0);
  ctx.restore();
  return { gridFactor: f, shadowMs, totalMs: performance.now() - t0 };
}
