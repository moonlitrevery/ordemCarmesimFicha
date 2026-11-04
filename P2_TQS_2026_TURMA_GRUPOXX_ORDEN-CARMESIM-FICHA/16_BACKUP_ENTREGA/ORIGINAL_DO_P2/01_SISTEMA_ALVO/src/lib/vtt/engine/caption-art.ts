import { Texture } from 'pixi.js';
import { scrambleText } from '../scene-rules';
import type { Caption } from '../types';

const FONT_SIZE = 28;
const LINE_HEIGHT = 34;
const MAX_LINE_WIDTH = 520;
const GLOW_BLUR = 18;
const PADDING = 26;
const FONT = `600 ${FONT_SIZE}px system-ui, "Segoe UI", Roboto, sans-serif`;

/** Quadros da ofuscação: alternar entre eles parece aleatório e não recria textura. */
export const SCRAMBLE_FRAMES = 6;

/** A arte tem o dobro do tamanho mostrado, para ficar nítida com zoom. */
export const CAPTION_ART_SCALE = 0.5;

function wrapLines(context: CanvasRenderingContext2D, text: string): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && context.measureText(next).width > MAX_LINE_WIDTH) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function renderCaption(text: string, caption: Caption): Texture {
  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) return Texture.EMPTY;
  measure.font = FONT;
  const lines = wrapLines(measure, text);
  const width = Math.max(...lines.map((line) => measure.measureText(line).width));

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width + PADDING * 2);
  canvas.height = Math.ceil(lines.length * LINE_HEIGHT + PADDING * 2);
  const context = canvas.getContext('2d');
  if (!context) return Texture.EMPTY;

  context.font = FONT;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  const cx = canvas.width / 2;
  const yOf = (index: number) => PADDING + LINE_HEIGHT * (index + 0.5);

  // Brilho pré-renderizado (SPEC §7.7): a sombra só existe aqui, nunca por frame.
  if (caption.glow) {
    context.save();
    context.shadowColor = caption.glowColor;
    context.shadowBlur = GLOW_BLUR;
    context.fillStyle = caption.glowColor;
    for (let pass = 0; pass < 3; pass++) {
      lines.forEach((line, index) => context.fillText(line, cx, yOf(index)));
    }
    context.restore();
  }

  if (caption.strokeWidth > 0) {
    context.strokeStyle = caption.stroke;
    context.lineWidth = caption.strokeWidth * 2;
    lines.forEach((line, index) => context.strokeText(line, cx, yOf(index)));
  }

  context.fillStyle = caption.color;
  lines.forEach((line, index) => context.fillText(line, cx, yOf(index)));

  return Texture.from(canvas);
}

export interface CaptionArt {
  real: Texture;
  scrambled: Texture[];
}

export function buildCaptionArt(caption: Caption, isGm: boolean): CaptionArt {
  if (!caption.obfuscated) {
    return { real: renderCaption(caption.text, caption), scrambled: [] };
  }
  const scrambled: Texture[] = [];
  for (let i = 0; i < SCRAMBLE_FRAMES; i++) {
    scrambled.push(renderCaption(scrambleText(caption.text), caption));
  }
  // Quem não é mestra não precisa do texto real nem na memória de vídeo.
  return {
    real: isGm ? renderCaption(caption.text, caption) : scrambled[0],
    scrambled,
  };
}

export function destroyCaptionArt(art: CaptionArt) {
  const all = new Set([art.real, ...art.scrambled]);
  all.forEach((texture) => {
    if (texture !== Texture.EMPTY) texture.destroy(true);
  });
}
