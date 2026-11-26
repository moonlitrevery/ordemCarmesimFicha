'use client';

/**
 * Número que rola até o valor novo (Fase 15, item 1), com pulso opcional e
 * glitch ao cruzar o limite crítico (item 3).
 *
 * Origem: motion-primitives, "Animated Number"
 * (components/core/animated-number.tsx), https://motion-primitives.com —
 * licença MIT (https://github.com/ibelick/motion-primitives/blob/main/LICENCE.md).
 *
 * Adaptado: escreve o texto direto no DOM a cada quadro (sem re-render do React
 * nem `m.*`); em vez da mola (`useSpring`), um tween curto em
 * `requestAnimationFrame` que desacelera no fim, sem passar do valor; o pulso é
 * a Web Animations API, só `transform`. Assim o motor imperativo da Motion
 * (~20 KB) fica fora do primeiro carregamento da ficha e da V.M. Com movimento
 * reduzido (sistema ou modo leve da Mesa) pula direto para o valor.
 */
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { DUR } from '@/lib/motion-tokens';
import { GLITCH_MS, GlitchLayers, runGlitch } from './glitch';
import { useReducedFx } from './useReducedFx';

/** Rolar até o valor novo: um pouco mais que `slow`, para ler a contagem. */
const COUNT_MS = 450;
const PULSE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Conta de onde estava até `value` (rAF só enquanto conta); com movimento
 * reduzido, salta. `jump()` corta para o valor final na hora (glitch).
 */
function useCountTo(value: number, write: (n: number) => void) {
  const reduced = useReducedFx();
  const shownRef = useRef(value);
  const frameRef = useRef(0);
  const writeRef = useRef(write);
  writeRef.current = write;

  const jump = (to: number) => {
    cancelAnimationFrame(frameRef.current);
    shownRef.current = to;
    writeRef.current(Math.round(to));
  };

  useEffect(() => {
    const from = shownRef.current;
    if (from === value) return;
    if (reduced) {
      jump(value);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      shownRef.current = from + (value - from) * easeOut(t);
      writeRef.current(Math.round(shownRef.current));
      if (t < 1) frameRef.current = requestAnimationFrame(step);
    };
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameRef.current);
    // `jump` só usa refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduced]);

  return { jump, reduced };
}

/** Roda `effect` quando `flag` passa de falso para verdadeiro depois de montado. */
function useRisingEdge(flag: boolean, effect: () => void) {
  const previous = useRef(flag);
  useEffect(() => {
    if (flag && !previous.current) effect();
    previous.current = flag;
    // `effect` muda a cada render; só a borda importa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flag]);
}

export function AnimatedNumber({
  value,
  className = '',
  style,
  pulse = false,
  critical = false,
}: {
  value: number;
  className?: string;
  style?: CSSProperties;
  /** Pulso curto a cada mudança (V.M., valor que chegou por realtime). */
  pulse?: boolean;
  /** Ao passar de falso para verdadeiro, um glitch (sanidade abaixo de 25%). */
  critical?: boolean;
}) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const baseRef = useRef<HTMLSpanElement>(null);
  // O texto inicial vem do React (SSR); depois só a mola escreve.
  const [initial] = useState(value);
  const { jump, reduced } = useCountTo(value, (n) => {
    if (baseRef.current) baseRef.current.textContent = String(n);
  });

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (pulse && !reduced && typeof rootRef.current?.animate === 'function') {
      rootRef.current.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }],
        { duration: DUR.slow * 1200, easing: PULSE_EASE }
      );
    }
  }, [value, pulse, reduced]);

  useRisingEdge(critical, () => {
    if (reduced || !rootRef.current) return;
    // O glitch é a transição: o número já aparece no valor final.
    jump(value);
    runGlitch(rootRef.current, baseRef.current);
  });

  return (
    <span
      ref={rootRef}
      className={'relative inline-block tabular-nums transition-colors duration-slow ease-enter ' + className}
      style={style}
    >
      <span ref={baseRef}>{initial}</span>
      {critical && <GlitchLayers text={String(value)} />}
    </span>
  );
}

/**
 * Mesmo efeito para um campo de texto (Ficha rápida): a mola escreve em
 * `input.value` enquanto o campo não está em foco. O React continua dono do
 * valor final; com foco, a pessoa vê e edita o número certo.
 */
export function useAnimatedInputValue(
  inputRef: RefObject<HTMLInputElement>,
  value: number,
  critical: boolean,
  glitchRootRef: RefObject<HTMLElement>
) {
  const { jump, reduced } = useCountTo(value, (n) => {
    const input = inputRef.current;
    if (input && document.activeElement !== input) input.value = String(n);
  });
  useRisingEdge(critical, () => {
    if (reduced || !glitchRootRef.current) return;
    jump(value);
    // Esconder o campo some com a borda: só o texto dele fica transparente.
    const input = inputRef.current;
    if (input) {
      input.style.color = 'transparent';
      window.setTimeout(() => input.style.removeProperty('color'), GLITCH_MS);
    }
    runGlitch(glitchRootRef.current, null);
  });
}
