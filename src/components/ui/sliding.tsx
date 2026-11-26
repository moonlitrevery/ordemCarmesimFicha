'use client';

/**
 * Destaque que desliza até o item ativo, só com CSS (Fase 15): mede o item
 * dentro do contêiner e move uma peça só com `transform` (tokens de duração).
 * Sem a Motion: serve no menu do topo (toda página), nas abas da ficha e na Mesa.
 * Com "reduzir movimento" ou o modo leve da Mesa, os tokens viram 1 ms: pula.
 */
import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

// No servidor não há layout para medir (e `useLayoutEffect` avisaria).
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export interface SlideBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Caixa do item que casa com `selector` dentro de `containerRef` (relativa a ele,
 * que precisa de `position: relative`). `key` muda quando o ativo muda.
 * `placed` só fica verdadeiro depois da primeira medida: a peça entra sem deslizar.
 */
export function useSlidingBox(containerRef: RefObject<HTMLElement>, selector: string, key: string) {
  const [box, setBox] = useState<SlideBox | null>(null);
  const [placed, setPlaced] = useState(false);

  useIsoLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const el = container.querySelector<HTMLElement>(selector);
      // Escondido (aba fechada, `display: none`): não vale como medida.
      if (!el || el.offsetWidth === 0) {
        setBox((prev) => (el ? prev : null));
        return;
      }
      setBox((prev) => {
        const next = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
        return prev && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h ? prev : next;
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, selector, key]);

  useEffect(() => {
    if (!box || placed) return;
    const frame = requestAnimationFrame(() => setPlaced(true));
    return () => cancelAnimationFrame(frame);
  }, [box, placed]);

  return { box, placed };
}

const BASE = 100;
const MOVE = 'transition-transform duration-slow ease-enter';

/** Fundo do item ativo (menu, abas de ícone): `translate` + `scaleX`. */
export function SlideFill({ box, placed, className }: { box: SlideBox; placed: boolean; className: string }) {
  return (
    <span
      aria-hidden
      className={'pointer-events-none absolute left-0 top-0 ' + (placed ? MOVE + ' ' : '') + className}
      style={{
        width: BASE,
        height: box.h,
        transformOrigin: '0 0',
        transform: `translate(${box.x}px, ${box.y}px) scaleX(${box.w / BASE})`,
      }}
    />
  );
}

/** Sublinhado do item ativo (abas de texto): barra de 2 px na base. */
export function SlideUnderline({ box, placed, className = 'bg-crimson' }: { box: SlideBox; placed: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={'pointer-events-none absolute left-0 top-0 h-0.5 ' + (placed ? MOVE + ' ' : '') + className}
      style={{
        width: BASE,
        transformOrigin: '0 0',
        transform: `translate(${box.x}px, ${box.y + box.h - 2}px) scaleX(${box.w / BASE})`,
      }}
    />
  );
}
