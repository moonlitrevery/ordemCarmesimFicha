import { Container, Texture, TilingSprite } from 'pixi.js';
import { Emitter, type ParticleSystem } from './particles';
import {
  FOG_LAYERS,
  RAIN_ANGLE,
  RAIN_LAYERS,
  RAIN_SPLASH,
  SNOW,
  SOOT,
  type EmitterDef,
} from './presets';
import { approach, WEATHER_TYPES, type WeatherEntry, type WeatherType } from './rules';

const TILE = 256;
const FADE_PER_SECOND = 1 / 0.9;
const RAIN_STREAKS = 70;
const NOISE_CELLS = [6, 12, 24];

function newCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE;
  return { canvas, context: canvas.getContext('2d') };
}

function repeating(canvas: HTMLCanvasElement): Texture {
  const texture = Texture.from(canvas);
  texture.source.addressMode = 'repeat';
  return texture;
}

/** Riscos desenhados também nas 8 vizinhas: a emenda do ladrilho não aparece. */
function rainTexture(): Texture {
  const { canvas, context } = newCanvas();
  if (!context) return Texture.EMPTY;
  context.lineCap = 'round';
  for (let i = 0; i < RAIN_STREAKS; i++) {
    const x = Math.random() * TILE;
    const y = Math.random() * TILE;
    const length = 16 + Math.random() * 26;
    context.strokeStyle = `rgba(200, 220, 240, ${0.25 + Math.random() * 0.55})`;
    context.lineWidth = 0.8 + Math.random() * 0.8;
    for (const dx of [-TILE, 0, TILE]) {
      for (const dy of [-TILE, 0, TILE]) {
        context.beginPath();
        context.moveTo(x + dx, y + dy);
        context.lineTo(
          x + dx - Math.sin(RAIN_ANGLE) * length,
          y + dy + Math.cos(RAIN_ANGLE) * length
        );
        context.stroke();
      }
    }
  }
  return repeating(canvas);
}

/** Ruído de valor que fecha nas bordas, em três oitavas. */
function fogTexture(): Texture {
  const { canvas, context } = newCanvas();
  if (!context) return Texture.EMPTY;
  const image = context.createImageData(TILE, TILE);
  const grids = NOISE_CELLS.map((cells) => ({
    cells,
    values: Array.from({ length: cells * cells }, () => Math.random()),
  }));
  const smooth = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      let sum = 0;
      let weight = 1;
      let total = 0;
      for (const { cells, values } of grids) {
        const gx = (x / TILE) * cells;
        const gy = (y / TILE) * cells;
        const ix = Math.floor(gx);
        const iy = Math.floor(gy);
        const tx = smooth(gx - ix);
        const ty = smooth(gy - iy);
        const at = (cx: number, cy: number) =>
          values[(cy % cells) * cells + (cx % cells)];
        const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * tx;
        const bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * tx;
        sum += (top + (bottom - top) * ty) * weight;
        total += weight;
        weight /= 2;
      }
      const alpha = Math.max(0, Math.min(1, (sum / total - 0.32) * 2.2));
      const offset = (y * TILE + x) * 4;
      image.data[offset] = 196;
      image.data[offset + 1] = 202;
      image.data[offset + 2] = 208;
      image.data[offset + 3] = alpha * alpha * 255;
    }
  }
  context.putImageData(image, 0, 0);
  return repeating(canvas);
}

interface WeatherTile {
  sprite: TilingSprite;
  alpha: number;
  speedX: number;
  speedY: number;
}

interface WeatherNode {
  level: number;
  target: number;
  tiles: WeatherTile[];
  emitters: Emitter[];
}

const EMITTERS: Partial<Record<WeatherType, EmitterDef[]>> = {
  chuva: [RAIN_SPLASH],
  neve: [SNOW],
  fuligem: [SOOT],
};

/** Espaço de tela: filho direto do stage, sobre o mapa e sob o HUD (que é DOM). */
export class WeatherLayer {
  readonly container = new Container();
  private nodes = new Map<WeatherType, WeatherNode>();
  private rain: Texture | null = null;
  private fog: Texture | null = null;

  constructor(private system: ParticleSystem) {}

  /** Cena nova ou mudança ao vivo: tudo chega ao alvo pelo mesmo fade. */
  set(entries: WeatherEntry[], width: number, height: number, lightMode: boolean) {
    for (const type of WEATHER_TYPES) {
      const entry = entries.find((item) => item.type === type);
      const target = entry?.on ? entry.intensity / 100 : 0;
      const node = this.nodes.get(type);
      if (node) {
        node.target = target;
      } else if (target > 0) {
        this.nodes.set(type, this.create(type, target, width, height, lightMode));
      }
    }
  }

  private create(
    type: WeatherType,
    target: number,
    width: number,
    height: number,
    lightMode: boolean
  ): WeatherNode {
    const node: WeatherNode = { level: 0, target, tiles: [], emitters: [] };
    const addTile = (
      texture: Texture,
      tileScale: number,
      alpha: number,
      speedX: number,
      speedY: number
    ) => {
      const sprite = new TilingSprite({ texture, width, height });
      sprite.tileScale.set(tileScale);
      sprite.alpha = 0;
      this.container.addChild(sprite);
      node.tiles.push({ sprite, alpha, speedX, speedY });
    };
    if (type === 'chuva') {
      this.rain ??= rainTexture();
      for (const layer of RAIN_LAYERS) {
        addTile(
          this.rain,
          layer.tileScale,
          layer.alpha,
          -Math.sin(RAIN_ANGLE) * layer.speed,
          Math.cos(RAIN_ANGLE) * layer.speed
        );
      }
    }
    if (type === 'nevoa') {
      this.fog ??= fogTexture();
      for (const layer of FOG_LAYERS) {
        addTile(this.fog, layer.tileScale, layer.alpha, layer.speedX, layer.speedY);
      }
    }
    for (const def of EMITTERS[type] ?? []) {
      const emitter = new Emitter(this.system, def, def.color as number);
      this.container.addChild(emitter.container);
      node.emitters.push(emitter);
    }
    this.applyLayers(node, lightMode);
    return node;
  }

  /** Modo leve: uma camada de chuva e de névoa (SPEC §7.4). */
  private applyLayers(node: WeatherNode, lightMode: boolean) {
    node.tiles.forEach(({ sprite }, index) => {
      sprite.visible = index === 0 || !lightMode;
    });
  }

  applyLightMode(lightMode: boolean) {
    this.nodes.forEach((node) => this.applyLayers(node, lightMode));
  }

  resize(width: number, height: number) {
    this.nodes.forEach((node) => {
      node.tiles.forEach(({ sprite }) => {
        sprite.width = width;
        sprite.height = height;
      });
    });
  }

  get active(): boolean {
    return this.nodes.size > 0;
  }

  update(dt: number, width: number, height: number, lightMode: boolean) {
    this.nodes.forEach((node, type) => {
      node.level = approach(node.level, node.target, FADE_PER_SECOND * dt);
      for (const { sprite, alpha, speedX, speedY } of node.tiles) {
        sprite.alpha = node.level * alpha;
        // Só o resto da volta: o valor não cresce sem limite numa sessão longa.
        const span = TILE * sprite.tileScale.x;
        sprite.tilePosition.x = (sprite.tilePosition.x + speedX * dt) % span;
        sprite.tilePosition.y = (sprite.tilePosition.y + speedY * dt) % span;
      }
      let flying = 0;
      for (const emitter of node.emitters) {
        emitter.update(dt, {
          emitting: node.level > 0,
          unit: 1,
          lightMode,
          density: node.level,
          width,
          height,
        });
        flying += emitter.liveCount;
      }
      if (node.level === 0 && node.target === 0 && flying === 0) {
        this.remove(type, node);
      }
    });
  }

  private remove(type: WeatherType, node: WeatherNode) {
    node.tiles.forEach(({ sprite }) => sprite.destroy());
    node.emitters.forEach((emitter) => emitter.destroy());
    this.nodes.delete(type);
  }

  destroy() {
    this.nodes.forEach((node, type) => this.remove(type, node));
    this.rain?.destroy(true);
    this.fog?.destroy(true);
    this.container.destroy({ children: true });
  }
}
