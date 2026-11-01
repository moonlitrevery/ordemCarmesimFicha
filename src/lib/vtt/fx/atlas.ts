import {
  Container,
  Graphics,
  Rectangle,
  Texture,
  type RenderTexture,
  type Renderer,
} from 'pixi.js';
import type { FxTextureName } from './presets';

const ATLAS_SIZE = 512;
const WHITE = 0xffffff;
const SOFT_STEPS = 28;

interface Slot {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SLOTS: Record<FxTextureName, Slot> = {
  soft: { x: 2, y: 2, width: 128, height: 128 },
  wing: { x: 134, y: 2, width: 256, height: 256 },
  wind: { x: 2, y: 134, width: 128, height: 32 },
  flake: { x: 2, y: 170, width: 32, height: 32 },
  ash: { x: 38, y: 170, width: 16, height: 16 },
  splash: { x: 58, y: 170, width: 32, height: 16 },
  rune1: { x: 2, y: 262, width: 64, height: 64 },
  rune2: { x: 70, y: 262, width: 64, height: 64 },
  rune3: { x: 138, y: 262, width: 64, height: 64 },
  rune4: { x: 206, y: 262, width: 64, height: 64 },
  rune5: { x: 274, y: 262, width: 64, height: 64 },
  rune6: { x: 342, y: 262, width: 64, height: 64 },
};

/** Traços em caixa de 10×10. Desenho próprio: o Android não tem fonte rúnica. */
const RUNE_STROKES: Partial<Record<FxTextureName, number[][]>> = {
  rune1: [[3, 0, 3, 10], [3, 1, 8, 3], [3, 4, 8, 6]],
  rune2: [[2, 0, 2, 10], [8, 0, 8, 10], [2, 2, 8, 6]],
  rune3: [[5, 0, 5, 10], [5, 3, 1, 0], [5, 3, 9, 0], [5, 7, 2, 10], [5, 7, 8, 10]],
  rune4: [[5, 0, 9, 5], [9, 5, 5, 10], [5, 10, 1, 5], [1, 5, 5, 0], [1, 10, 9, 10]],
  rune5: [[3, 0, 3, 10], [3, 0, 8, 2.5], [8, 2.5, 3, 5], [3, 5, 8, 7.5], [8, 7.5, 3, 10]],
  rune6: [[1, 1, 9, 9], [9, 1, 1, 9], [5, 0, 5, 10]],
};

function drawSoft(graphics: Graphics, slot: Slot) {
  const center = slot.width / 2;
  // Círculos concêntricos somam alpha: mais denso no meio, some na borda.
  for (let step = SOFT_STEPS; step > 0; step--) {
    const radius = (step / SOFT_STEPS) * (center - 1);
    graphics
      .circle(slot.x + center, slot.y + center, radius)
      .fill({ color: WHITE, alpha: 0.012 + 0.028 * (1 - step / SOFT_STEPS) });
  }
}

/** Curva com a ponta fina: base grossa e transparente, miolo claro. */
function drawWind(graphics: Graphics, { x, y, width, height }: Slot) {
  const mid = y + height / 2;
  for (const [stroke, alpha] of [
    [7, 0.14],
    [4, 0.32],
    [1.6, 0.9],
  ] as const) {
    graphics
      .moveTo(x + 5, mid + 5)
      .bezierCurveTo(x + width * 0.3, mid - 9, x + width * 0.65, mid + 9, x + width - 5, mid - 4)
      .stroke({ color: WHITE, width: stroke, alpha, cap: 'round' });
  }
}

/** Leque de traços de vento saindo da raiz, em baixo à esquerda da caixa. */
function drawWing(graphics: Graphics, { x, y, width, height }: Slot) {
  const rootX = x + width * 0.04;
  const rootY = y + height * 0.72;
  const feathers = 8;
  for (let i = 0; i < feathers; i++) {
    const t = i / (feathers - 1);
    const reach = width * (0.92 - 0.42 * t);
    const lift = height * (0.62 - 0.72 * t);
    const endX = rootX + reach;
    const endY = rootY - lift;
    const controlX = rootX + reach * 0.42;
    const controlY = rootY - lift * 1.15 - height * 0.1;
    for (const [stroke, alpha] of [
      [11, 0.07],
      [6, 0.14],
      [2.4, 0.7 - 0.25 * t],
    ] as const) {
      graphics
        .moveTo(rootX, rootY)
        .quadraticCurveTo(controlX, controlY, endX, endY)
        .stroke({ color: WHITE, width: stroke, alpha, cap: 'round' });
    }
  }
}

function drawFlake(graphics: Graphics, { x, y, width }: Slot) {
  const center = width / 2;
  for (let arm = 0; arm < 3; arm++) {
    const angle = (arm * Math.PI) / 3;
    const dx = Math.cos(angle) * (center - 2);
    const dy = Math.sin(angle) * (center - 2);
    graphics
      .moveTo(x + center - dx, y + center - dy)
      .lineTo(x + center + dx, y + center + dy)
      .stroke({ color: WHITE, width: 2.6, cap: 'round' });
  }
  graphics.circle(x + center, y + center, 3.5).fill(WHITE);
}

function drawAsh(graphics: Graphics, { x, y }: Slot) {
  graphics
    .poly([x + 2, y + 6, x + 7, y + 1, x + 14, y + 4, x + 12, y + 11, x + 8, y + 15, x + 3, y + 12])
    .fill(WHITE);
}

function drawSplash(graphics: Graphics, { x, y, width, height }: Slot) {
  graphics
    .ellipse(x + width / 2, y + height / 2, width / 2 - 2, height / 2 - 2)
    .stroke({ color: WHITE, width: 2, alpha: 0.9 });
}

function drawRune(graphics: Graphics, slot: Slot, strokes: number[][]) {
  const margin = slot.width * 0.16;
  const unit = (slot.width - margin * 2) / 10;
  for (const [stroke, alpha] of [
    [10, 0.16],
    [4.5, 1],
  ] as const) {
    for (const [x1, y1, x2, y2] of strokes) {
      graphics
        .moveTo(slot.x + margin + x1 * unit, slot.y + margin + y1 * unit)
        .lineTo(slot.x + margin + x2 * unit, slot.y + margin + y2 * unit)
        .stroke({ color: WHITE, width: stroke, alpha, cap: 'round' });
    }
  }
}

function drawArt(): Container {
  const graphics = new Graphics();
  drawSoft(graphics, SLOTS.soft);
  drawWind(graphics, SLOTS.wind);
  drawWing(graphics, SLOTS.wing);
  drawFlake(graphics, SLOTS.flake);
  drawAsh(graphics, SLOTS.ash);
  drawSplash(graphics, SLOTS.splash);
  for (const [name, strokes] of Object.entries(RUNE_STROKES)) {
    drawRune(graphics, SLOTS[name as FxTextureName], strokes);
  }
  const art = new Container();
  art.addChild(graphics);
  return art;
}

/** Uma textura só, gerada ao abrir: nada a baixar, e tudo no mesmo lote (SPEC §7.5). */
export class FxAtlas {
  readonly source: Texture;
  private frames = new Map<FxTextureName, Texture>();
  private art: Container;

  constructor(private renderer: Renderer) {
    this.art = drawArt();
    // Caixa fixa: sem isto o Pixi recorta pelo que foi desenhado e as posições mudam.
    this.source = renderer.generateTexture({
      target: this.art,
      frame: new Rectangle(0, 0, ATLAS_SIZE, ATLAS_SIZE),
      resolution: 1,
      antialias: true,
    });
    for (const [name, slot] of Object.entries(SLOTS)) {
      this.frames.set(
        name as FxTextureName,
        new Texture({
          source: this.source.source,
          frame: new Rectangle(slot.x, slot.y, slot.width, slot.height),
        })
      );
    }
  }

  frame(name: FxTextureName): Texture {
    return this.frames.get(name) as Texture;
  }

  /** O navegador joga fora o conteúdo da textura quando perde o contexto WebGL. */
  redraw() {
    this.renderer.render({
      container: this.art,
      target: this.source as RenderTexture,
      clear: true,
    });
  }

  destroy() {
    this.frames.forEach((frame) => frame.destroy());
    this.frames.clear();
    this.art.destroy({ children: true });
    this.source.destroy(true);
  }
}
