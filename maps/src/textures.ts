// Texturas CC0 aplicadas na escala certa (metros), com ajuste de cor e mistura anti-repetição.
import fs from 'fs';
import path from 'path';
import {
  createCanvas,
  loadImage,
  DOMMatrix,
  type Canvas,
  type Image,
  type SKRSContext2D,
} from '@napi-rs/canvas';
import { ValueNoise } from './rng';

export const ASSETS_DIR = path.resolve('maps/assets');
const TEXTURE_DIR = path.join(ASSETS_DIR, 'textures');

interface TextureEntry {
  source: 'polyhaven' | 'ambientcg';
  id: string;
  size_m: number;
}

interface Adjust {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  tint?: [number, number, number];
}

interface MaterialEntry {
  texture: string;
  adjust?: Adjust;
  mix?: { texture: string; amount: number; scale_m: number; blend?: string };
  procedural?: 'checker';
  /** Piso em grade: anti-repetição sem girar e alinhada à borda. */
  grid?: boolean;
  checker?: { cell_m: number; a: [number, number, number]; b: [number, number, number] };
}

export interface TexturesConfig {
  license: string;
  textures: Record<string, TextureEntry>;
  materials: Record<string, MaterialEntry>;
}

export function loadTexturesConfig(): TexturesConfig {
  return JSON.parse(fs.readFileSync(path.join(ASSETS_DIR, 'textures.json'), 'utf8')) as TexturesConfig;
}

/** Cor média de cada material quando a textura não foi baixada: o mapa sai, mais pobre. */
const FALLBACK: Record<string, [number, number, number]> = {
  grass_short: [86, 112, 52],
  tall_grass_dry_mixed: [128, 120, 72],
  forest_floor_leaves: [92, 70, 46],
  garden_soil: [88, 66, 48],
  cobblestone_basalt: [70, 72, 74],
  cobblestone_basalt_irregular: [80, 80, 82],
  asphalt_patched: [70, 70, 72],
  terracotta_tiles_worn: [150, 72, 50],
  wood_planks_dark: [70, 48, 34],
  ceramic_tiles_checker_cream: [190, 160, 130],
  concrete_old: [140, 138, 132],
  plaster_tufo_old: [196, 176, 140],
  terracotta_roof_old: [150, 76, 52],
  drystone_wall_mossy: [110, 108, 90],
};

function adjustPixels(data: Uint8ClampedArray, adjust: Adjust, extraBrightness = 0) {
  const b = (adjust.brightness ?? 0) + extraBrightness;
  const contrast = 1 + (adjust.contrast ?? 0);
  const sat = 1 + (adjust.saturation ?? 0);
  const [tr, tg, tb] = adjust.tint ?? [1, 1, 1];
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] / 255;
    let g = data[i + 1] / 255;
    let bl = data[i + 2] / 255;
    const l = 0.299 * r + 0.587 * g + 0.114 * bl;
    r = l + (r - l) * sat;
    g = l + (g - l) * sat;
    bl = l + (bl - l) * sat;
    r = (r - 0.5) * contrast + 0.5 + b;
    g = (g - 0.5) * contrast + 0.5 + b;
    bl = (bl - 0.5) * contrast + 0.5 + b;
    data[i] = r * tr * 255;
    data[i + 1] = g * tg * 255;
    data[i + 2] = bl * tb * 255;
  }
}

export interface FillOptions {
  /** Brilho extra (−1..1), ex.: `tint: lighter` no chão. */
  brightness?: number;
  /** Rotação da textura em graus (telhas seguem a água do telhado). */
  rot?: number;
  /** Multiplica o tamanho real (raro: 1 = escala certa). */
  scale?: number;
  alpha?: number;
  /** Mistura anti-repetição (padrão: ligada em áreas grandes). */
  antiTile?: boolean;
  /** Borda natural esfiapada, em metros (0 = borda reta, recortada). */
  feather?: number;
}

export class TextureBank {
  private images = new Map<string, Image | Canvas | null>();
  private tiles = new Map<string, Canvas>();
  readonly missing = new Set<string>();

  constructor(
    readonly config: TexturesConfig,
    readonly ppm: number,
    private readonly seed: number
  ) {}

  get materialNames(): string[] {
    return Object.keys(this.config.materials);
  }

  async preload(materials: Iterable<string>) {
    const names = new Set<string>();
    for (const m of materials) {
      const entry = this.config.materials[m];
      if (!entry) continue;
      names.add(entry.texture);
      if (entry.mix) names.add(entry.mix.texture);
    }
    await Promise.all(
      [...names].map(async (name) => {
        if (this.images.has(name)) return;
        const file = path.join(TEXTURE_DIR, `${name}.jpg`);
        if (!fs.existsSync(file)) {
          this.images.set(name, null);
          this.missing.add(name);
          return;
        }
        const img = await loadImage(file);
        const aoFile = path.join(TEXTURE_DIR, `${name}_ao.jpg`);
        if (fs.existsSync(aoFile)) {
          // A oclusão da própria textura dá profundidade às juntas e frestas.
          const ao = await loadImage(aoFile);
          const c = createCanvas(img.width, img.height);
          const g = c.getContext('2d');
          g.drawImage(img, 0, 0);
          g.globalCompositeOperation = 'multiply';
          g.globalAlpha = 0.55;
          g.drawImage(ao, 0, 0, img.width, img.height);
          this.images.set(name, c);
        } else {
          this.images.set(name, img);
        }
      })
    );
  }

  private textureSize(name: string): number {
    return this.config.textures[name]?.size_m ?? 2;
  }

  /** Ladrilho já na escala do mapa, com o ajuste do material. */
  tile(material: string, brightness = 0): Canvas {
    const key = `${material}|${brightness.toFixed(3)}`;
    const cached = this.tiles.get(key);
    if (cached) return cached;
    const entry = this.config.materials[material];
    const textureName = entry?.texture ?? material;
    const img = this.images.get(textureName) ?? null;
    const sizeM = this.textureSize(textureName);
    const px = Math.max(8, Math.round(sizeM * this.ppm));
    const c = createCanvas(px, px);
    const g = c.getContext('2d');
    if (entry?.procedural === 'checker' && entry.checker) {
      this.drawChecker(g, px, sizeM, entry, img);
    } else if (img) {
      g.drawImage(img, 0, 0, px, px);
    } else {
      const [r, gg, b] = FALLBACK[material] ?? [128, 128, 128];
      g.fillStyle = `rgb(${r},${gg},${b})`;
      g.fillRect(0, 0, px, px);
    }
    const data = g.getImageData(0, 0, px, px);
    adjustPixels(data.data, entry?.adjust ?? {}, brightness);
    g.putImageData(data, 0, 0);
    this.tiles.set(key, c);
    return c;
  }

  /** Xadrez creme e terracota: cor procedural, sujeira e rejunte vêm da textura. */
  private drawChecker(g: SKRSContext2D, px: number, sizeM: number, entry: MaterialEntry, grime: Image | Canvas | null) {
    const { cell_m, a, b } = entry.checker!;
    const n = Math.max(1, Math.round(sizeM / cell_m));
    const cell = px / n;
    const noise = new ValueNoise(this.seed ^ 0x51ed);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const base = (i + j) % 2 === 0 ? a : b;
        const v = 0.94 + noise.at(i * 1.7, j * 1.3) * 0.12;
        g.fillStyle = `rgb(${base[0] * v},${base[1] * v},${base[2] * v})`;
        g.fillRect(i * cell, j * cell, cell + 0.5, cell + 0.5);
      }
    }
    if (grime) {
      g.globalCompositeOperation = 'multiply';
      g.globalAlpha = 0.5;
      g.filter = 'grayscale(1) brightness(1.35) contrast(1.4)';
      g.drawImage(grime, 0, 0, px, px);
      g.filter = 'none';
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    g.strokeStyle = 'rgba(60,50,40,0.55)';
    g.lineWidth = Math.max(1, cell * 0.04);
    for (let i = 0; i <= n; i++) {
      g.beginPath();
      g.moveTo(i * cell, 0);
      g.lineTo(i * cell, px);
      g.moveTo(0, i * cell);
      g.lineTo(px, i * cell);
      g.stroke();
    }
  }

  /** Padrão em metros para um contexto com transformação `scale(ppm)`. */
  pattern(ctx: SKRSContext2D, material: string, opts: { rot?: number; ox?: number; oy?: number; scale?: number; brightness?: number } = {}) {
    const tile = this.tile(material, opts.brightness ?? 0);
    const pat = ctx.createPattern(tile, 'repeat');
    const m = new DOMMatrix()
      .translate(opts.ox ?? 0, opts.oy ?? 0)
      .rotate(opts.rot ?? 0)
      .scale((opts.scale ?? 1) / this.ppm);
    pat.setTransform(m);
    return pat;
  }

  /** Tamanho real do ladrilho em metros. */
  sizeOf(material: string): number {
    const entry = this.config.materials[material];
    return this.textureSize(entry?.texture ?? material);
  }

  mixOf(material: string) {
    return this.config.materials[material]?.mix;
  }

  isGrid(material: string): boolean {
    return this.config.materials[material]?.grid === true;
  }
}
