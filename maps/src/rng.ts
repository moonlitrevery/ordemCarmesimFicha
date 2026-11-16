// Aleatoriedade com semente: o mesmo mapa com a mesma semente sai idêntico.

/** Hash de 32 bits de uma string (cyrb53 reduzido). */
export function hashString(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }

  /** Um gerador derivado: cada camada tem o seu, e mexer numa não muda as outras. */
  fork(label: string): Rng {
    return new Rng(hashString(`${this.state}:${label}`));
  }

  /** mulberry32 */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /** Aproximação de normal (soma de 3 uniformes), média 0 e desvio ~1. */
  gauss(): number {
    return (this.next() + this.next() + this.next() - 1.5) * 2;
  }

  angle(): number {
    return this.next() * Math.PI * 2;
  }
}

/** Ruído de valor 2D com semente, suave (interpolação quíntica), em [0,1]. */
export class ValueNoise {
  private readonly seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
  }

  private lattice(ix: number, iy: number): number {
    let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(this.seed, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  at(x: number, y: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const a = this.lattice(ix, iy);
    const b = this.lattice(ix + 1, iy);
    const c = this.lattice(ix, iy + 1);
    const d = this.lattice(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }

  /** fBm: `octaves` camadas, cada uma com o dobro da frequência e metade da força. */
  fbm(x: number, y: number, octaves = 4): number {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    let f = 1;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.at(x * f + o * 17.3, y * f - o * 9.1);
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  }
}
