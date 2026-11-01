import { Texture } from 'pixi.js';
import type { ResolvedCondition } from '../conditions';

/** A arte tem mais pixels que o tamanho na tela, para ficar nítida em tela densa. */
export const MARKER_ART_SIZE = 64;
export const RING_ART_SIZE = 256;

const ICON_BOX = 24;
const PARCHMENT = '#f5e6c8';
const BACKDROP = 'rgba(13, 10, 11, 0.92)';
const RING_COLOR = '#e8a33d';

function newCanvas(size: number) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return { canvas, context: canvas.getContext('2d') };
}

function disc(context: CanvasRenderingContext2D) {
  const center = MARKER_ART_SIZE / 2;
  context.beginPath();
  context.arc(center, center, center - 3, 0, Math.PI * 2);
  context.fillStyle = BACKDROP;
  context.fill();
  context.lineWidth = 3;
  context.strokeStyle = PARCHMENT;
  context.stroke();
}

function conditionArt(condition: ResolvedCondition): Texture {
  const { canvas, context } = newCanvas(MARKER_ART_SIZE);
  if (!context) return Texture.EMPTY;
  disc(context);
  const center = MARKER_ART_SIZE / 2;
  if (condition.emoji) {
    context.font = '34px system-ui, "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(condition.emoji, center, center + 2);
  } else if (condition.path) {
    const scale = (MARKER_ART_SIZE * 0.62) / ICON_BOX;
    const offset = (MARKER_ART_SIZE - ICON_BOX * scale) / 2;
    context.translate(offset, offset);
    context.scale(scale, scale);
    context.lineWidth = 2;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = PARCHMENT;
    context.stroke(new Path2D(condition.path));
  }
  return Texture.from(canvas);
}

function overflowArt(count: number): Texture {
  const { canvas, context } = newCanvas(MARKER_ART_SIZE);
  if (!context) return Texture.EMPTY;
  disc(context);
  context.font = '600 26px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = PARCHMENT;
  context.fillText(`+${count}`, MARKER_ART_SIZE / 2, MARKER_ART_SIZE / 2 + 1);
  return Texture.from(canvas);
}

function ringArt(): Texture {
  const { canvas, context } = newCanvas(RING_ART_SIZE);
  if (!context) return Texture.EMPTY;
  const center = RING_ART_SIZE / 2;
  // Halo pré-renderizado: o anel é um sprite, sem filtro (SPEC §7.7).
  context.shadowColor = RING_COLOR;
  context.shadowBlur = 14;
  context.lineWidth = 8;
  context.strokeStyle = RING_COLOR;
  context.beginPath();
  context.arc(center, center, center - 18, 0, Math.PI * 2);
  context.stroke();
  return Texture.from(canvas);
}

/** Uma textura por símbolo, reaproveitada por todos os tokens e criada uma vez. */
export class MarkerArt {
  private textures = new Map<string, Texture>();

  private cached(key: string, build: () => Texture): Texture {
    let texture = this.textures.get(key);
    if (!texture) {
      texture = build();
      this.textures.set(key, texture);
    }
    return texture;
  }

  condition(condition: ResolvedCondition): Texture {
    return this.cached(condition.key, () => conditionArt(condition));
  }

  overflow(count: number): Texture {
    return this.cached(`+${count}`, () => overflowArt(count));
  }

  ring(): Texture {
    return this.cached('ring', ringArt);
  }

  destroy() {
    this.textures.forEach((texture) => {
      if (texture !== Texture.EMPTY) texture.destroy(true);
    });
    this.textures.clear();
  }
}
