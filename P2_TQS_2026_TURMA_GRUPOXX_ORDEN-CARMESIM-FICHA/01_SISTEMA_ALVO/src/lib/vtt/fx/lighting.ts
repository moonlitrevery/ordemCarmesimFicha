import { Container, Sprite, Texture } from 'pixi.js';
import { approach, lightingColors, type LightingState } from './rules';

const FADE_PER_SECOND = 1 / 0.9;
/** Em 100% ainda dá para ver algo: quem está na mesa não pode ficar sem nenhuma imagem. */
const MAX_ALPHA = 0.95;

function hexToNumber(color: string): number {
  return Number.parseInt(color.slice(1), 16);
}

/**
 * Um retângulo de tela cheia, em `multiply`, acima do mapa e dos tokens e abaixo do
 * clima. Parado, é só um sprite: não pede quadro nenhum (SPEC §7.2).
 *
 * Fase 11: para a lanterna furar a escuridão, a textura de `darkness` passa a vir de
 * uma RenderTexture com os furos desenhados em `erase`. Quem está fora não muda.
 */
export class LightingLayer {
  readonly container = new Container();
  private darkness = new Sprite(Texture.WHITE);
  private gradients = new Map<string, Texture>();
  private lookKey = '';
  private nextLook: { key: string; colors: [string, string] } | null = null;
  private level = 0;
  private target = 0;

  constructor() {
    this.darkness.blendMode = 'multiply';
    this.darkness.visible = false;
    this.container.addChild(this.darkness);
  }

  set(state: LightingState) {
    const colors = lightingColors(state);
    const key = colors.join('|');
    this.target = state.on ? (state.intensity / 100) * MAX_ALPHA : 0;
    if (key === this.lookKey) {
      this.nextLook = null;
    } else if (this.level === 0) {
      this.applyLook(key, colors);
    } else {
      // Trocar de cor no meio daria um salto: apaga, troca e acende de novo.
      this.nextLook = { key, colors };
    }
  }

  private applyLook(key: string, [top, bottom]: [string, string]) {
    this.lookKey = key;
    this.nextLook = null;
    if (top === bottom) {
      this.darkness.texture = Texture.WHITE;
      this.darkness.tint = hexToNumber(top);
    } else {
      this.darkness.texture = this.gradient(key, top, bottom);
      this.darkness.tint = 0xffffff;
    }
  }

  /** Dois pixels de largura esticados: continua sendo um único retângulo, sem filtro. */
  private gradient(key: string, top: string, bottom: string): Texture {
    const known = this.gradients.get(key);
    if (known) return known;
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    if (!context) return Texture.WHITE;
    const fill = context.createLinearGradient(0, 0, 0, 64);
    fill.addColorStop(0, top);
    fill.addColorStop(1, bottom);
    context.fillStyle = fill;
    context.fillRect(0, 0, 2, 64);
    const texture = Texture.from(canvas);
    this.gradients.set(key, texture);
    return texture;
  }

  resize(width: number, height: number) {
    this.darkness.width = width;
    this.darkness.height = height;
  }

  /** Só em fade. Com a escuridão parada, nada aqui pede quadro. */
  get animating(): boolean {
    return this.level !== (this.nextLook ? 0 : this.target) || this.nextLook !== null;
  }

  update(dt: number, width: number, height: number) {
    const target = this.nextLook ? 0 : this.target;
    this.level = approach(this.level, target, FADE_PER_SECOND * dt);
    if (this.nextLook && this.level === 0) {
      this.applyLook(this.nextLook.key, this.nextLook.colors);
    }
    this.darkness.visible = this.level > 0;
    this.darkness.alpha = this.level;
    // A textura muda o tamanho base do sprite: a medida vem depois dela.
    this.resize(width, height);
  }

  destroy() {
    this.gradients.forEach((texture) => texture.destroy(true));
    this.gradients.clear();
    this.container.destroy({ children: true });
  }
}
