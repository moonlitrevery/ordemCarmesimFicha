'use client';

/**
 * Glitch curto, uma vez só (Fase 15, item 3).
 *
 * Origem: kokonutui, "Glitch Text" (components/kokonutui/glitch-text.tsx),
 * https://kokonutui.com/docs/texts/glitch-text — licença MIT
 * (https://github.com/kokonut-labs/kokonutui/blob/main/LICENSE).
 *
 * Adaptado: sem gatilho "idle" nem "hover" (nada em loop), só `burst` chamado por
 * quem usa; cores do tema (carmesim e pergaminho, sem ciano); animação pela
 * Motion (`animate`) em vez de WAAPI direto, só `transform` e `opacity`. O
 * recorte das faixas (`clip-path`) é fixo durante a explosão, não animado.
 */
import { animate } from 'framer-motion';

const BANDS = 4;
const FRAMES = 6;
const FRAME_MS = 55; // 6 × 55 = 330 ms, bem abaixo dos 600 ms
/** Duração total de uma explosão, em ms. */
export const GLITCH_MS = FRAMES * FRAME_MS;
const SHIFT_EM = 0.12;
const SPLIT_PX = 2;
const STILL_CHANCE = 0.3;

const ACCENT = '#C44536';
const SECOND = '#E8DFD0';

const LAYER = 'pointer-events-none absolute inset-0 select-none opacity-0';

/**
 * Camadas sobrepostas ao texto: dois canais e as faixas. Ficam invisíveis em
 * repouso. `className` alinha o texto igual ao de baixo (ex.: centralizado).
 */
export function GlitchLayers({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span aria-hidden data-glitch-root className="pointer-events-none absolute inset-0">
      <span data-glitch="channel" className={LAYER + ' ' + className} style={{ color: ACCENT }}>
        {text}
      </span>
      <span data-glitch="channel" className={LAYER + ' ' + className} style={{ color: SECOND }}>
        {text}
      </span>
      {Array.from({ length: BANDS }, (_, i) => (
        <span key={i} data-glitch="band" className={LAYER + ' ' + className}>
          {text}
        </span>
      ))}
    </span>
  );
}

const round = (n: number) => Math.round(n * 1000) / 1000;

function randomCuts(count: number): number[] {
  const weights = Array.from({ length: count }, () => 0.55 + Math.random());
  const total = weights.reduce((a, b) => a + b, 0);
  const cuts = [0];
  for (const w of weights) cuts.push(round(cuts[cuts.length - 1] + (w / total) * 100));
  return cuts;
}

function jump(max: number): number {
  if (Math.random() < STILL_CHANCE) return 0;
  const sign = Math.random() < 0.5 ? -1 : 1;
  return round(sign * (0.25 + 0.75 * Math.random()) * max);
}

/** Cada valor segura um quadro inteiro: o glitch corta, não desliza. */
function held(values: number[]): number[] {
  return values.flatMap((v) => [v, v]);
}

/**
 * Uma explosão de ~330 ms sobre `root` (o elemento que contém as `GlitchLayers`).
 * `base` é o texto de verdade, escondido enquanto as faixas o recompõem.
 */
export function runGlitch(root: HTMLElement, base: HTMLElement | null): void {
  const layers = root.querySelector('[data-glitch-root]');
  if (!layers) return;
  const duration = (FRAMES * FRAME_MS) / 1000;
  const fontPx = parseFloat(getComputedStyle(root).fontSize) || 16;
  const options = { duration, ease: 'linear' as const };

  if (base) {
    animate(base, { opacity: held([...Array(FRAMES - 1).fill(0), 1]) }, options);
  }

  const cuts = randomCuts(BANDS);
  const mover = Math.floor(Math.random() * BANDS);
  layers.querySelectorAll<HTMLElement>('[data-glitch="band"]').forEach((band, i) => {
    const top = i === 0 ? -50 : cuts[i];
    const bottom = i === BANDS - 1 ? -50 : round(100 - cuts[i + 1]);
    band.style.clipPath = `inset(${top}% -25% ${bottom}% -25%)`;
    const xs = Array.from({ length: FRAMES }, (_, f) => {
      if (f === FRAMES - 1) return 0;
      const x = jump(SHIFT_EM);
      return f === 0 && i === mover && x === 0 ? SHIFT_EM * 0.6 : x;
    }).map((em) => em * fontPx);
    animate(
      band,
      { x: held(xs), opacity: held([...Array(FRAMES - 1).fill(1), 0]) },
      options
    );
  });

  const offsets = Array.from({ length: FRAMES }, () => Math.max(1, Math.ceil(Math.random() * SPLIT_PX)));
  layers.querySelectorAll<HTMLElement>('[data-glitch="channel"]').forEach((channel, c) => {
    const dir = c === 0 ? -1 : 1;
    animate(
      channel,
      {
        x: held(offsets.map((d) => dir * d)),
        opacity: held(offsets.map((_, f) => (f === FRAMES - 1 ? 0 : 0.9))),
      },
      options
    );
  });
}
