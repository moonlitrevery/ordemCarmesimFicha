'use client';

/**
 * Número que rola até o valor novo (Fase 15, item 1), com pulso opcional e
 * glitch ao cruzar o limite crítico (item 3).
 *
 * Origem: motion-primitives, "Animated Number"
 * (components/core/animated-number.tsx), https://motion-primitives.com —
 * licença MIT (https://github.com/ibelick/motion-primitives/blob/main/LICENCE.md).
 *
 * Adaptado: escreve o texto direto no DOM a cada passo da mola (sem re-render do
 * React nem `m.*`, então não depende do LazyMotion); mola sem overshoot; com
 * movimento reduzido (sistema ou modo leve da Mesa) pula direto para o valor.
 * O pulso é só `transform`, uma vez por mudança.
 */
import { animate, useMotionValueEvent, useSpring } from 'framer-motion';
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { DUR, EASE_ENTER } from '@/lib/motion-tokens';
import { GLITCH_MS, GlitchLayers, runGlitch } from './glitch';
import { useReducedFx } from './useReducedFx';

/** Assenta em ~0,4 s, sem passar do valor (quase amortecimento crítico). */
const SPRING = { stiffness: 220, damping: 30, mass: 1 };

/** Mola que segue `value`; com movimento reduzido, salta. */
function useNumberSpring(value: number, write: (n: number) => void) {
  const reduced = useReducedFx();
  const spring = useSpring(value, SPRING);
  useMotionValueEvent(spring, 'change', (v) => write(Math.round(v)));
  useEffect(() => {
    if (reduced) spring.jump(value);
    else spring.set(value);
  }, [spring, value, reduced]);
  return { spring, reduced: Boolean(reduced) };
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
  const { spring, reduced } = useNumberSpring(value, (n) => {
    if (baseRef.current) baseRef.current.textContent = String(n);
  });

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (pulse && !reduced && rootRef.current) {
      animate(rootRef.current, { scale: [1, 1.18, 1] }, { duration: DUR.slow * 1.2, ease: EASE_ENTER });
    }
  }, [value, pulse, reduced]);

  useRisingEdge(critical, () => {
    if (reduced || !rootRef.current) return;
    // O glitch é a transição: o número já aparece no valor final.
    spring.jump(value);
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
  const { spring, reduced } = useNumberSpring(value, (n) => {
    const input = inputRef.current;
    if (input && document.activeElement !== input) input.value = String(n);
  });
  useRisingEdge(critical, () => {
    if (reduced || !glitchRootRef.current) return;
    spring.jump(value);
    // Esconder o campo some com a borda: só o texto dele fica transparente.
    const input = inputRef.current;
    if (input) {
      input.style.color = 'transparent';
      window.setTimeout(() => input.style.removeProperty('color'), GLITCH_MS);
    }
    runGlitch(glitchRootRef.current, null);
  });
}
