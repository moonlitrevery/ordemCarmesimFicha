'use client';

import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import type { LucideIcon } from 'lucide-react';
import { m } from 'framer-motion';
import { DUR, EASE_ENTER } from '@/lib/motion-tokens';
import { readableTextOn } from '@/lib/vtt/scene-rules';

/** Fundo do que flutua sobre o mapa. Blur só com mouse: no tablet pesa sobre o WebGL. */
export const FLOATING =
  'rounded-xl border border-ink-border bg-ink/90 shadow-panel desk:bg-ink/75 desk:backdrop-blur-sm';

/** Painel com texto para ler: mais opaco que as barras de ícones. */
export const FLOATING_PANEL =
  'border border-ink-border bg-ink-panel/95 shadow-panel desk:backdrop-blur-sm';

type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

const TOOLTIP_POSITION: Record<TooltipSide, string> = {
  top: 'bottom-full left-1/2 mb-1.5 -translate-x-1/2',
  bottom: 'left-1/2 top-full mt-1.5 -translate-x-1/2',
  left: 'right-full top-1/2 mr-1.5 -translate-y-1/2',
  right: 'left-full top-1/2 ml-1.5 -translate-y-1/2',
};

export function IconButton({
  icon: Icon,
  label,
  active = false,
  disabled = false,
  badge,
  quietBadge = false,
  tooltip = 'bottom',
  danger = false,
  highlightId,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  badge?: number;
  /** Contador discreto, sem o vermelho de "precisa de atenção". */
  quietBadge?: boolean;
  /** `native`: dentro de área com rolagem, onde o balão seria cortado. */
  tooltip?: TooltipSide | 'native';
  danger?: boolean;
  /**
   * Abas (Fase 15): o fundo do ativo é um só, com este `layoutId`, e desliza de um
   * ícone para o outro. Precisa do `MotionProvider full` (a Mesa tem).
   */
  highlightId?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      title={tooltip === 'native' ? label : undefined}
      onClick={onClick}
      className={
        'group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition desk:h-9 desk:w-9 ' +
        (disabled
          ? 'cursor-not-allowed text-ink-muted/40'
          : active
            ? (highlightId ? '' : 'bg-crimson/40 ') + 'text-parchment'
            : danger
              ? 'text-crimson-soft hover:bg-ink-raised'
              : 'text-ink-muted hover:bg-ink-raised hover:text-parchment')
      }
    >
      {active && highlightId && (
        <m.span
          aria-hidden
          layoutId={highlightId}
          transition={{ duration: DUR.slow, ease: EASE_ENTER }}
          className="pointer-events-none absolute inset-0 rounded-lg bg-crimson/40"
        />
      )}
      <Icon size={18} aria-hidden className="relative" />
      {Boolean(badge) && (
        <span
          className={
            'absolute -right-0.5 -top-0.5 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 ' +
            (quietBadge
              ? 'bg-ink-raised text-parchment'
              : 'bg-crimson text-parchment')
          }
        >
          {badge}
        </span>
      )}
      {tooltip !== 'native' && (
        <span
          aria-hidden
          className={
            'pointer-events-none absolute z-40 hidden whitespace-nowrap rounded-md border border-ink-border bg-ink-raised px-2 py-1 text-xs text-parchment group-focus-visible:block desk:group-hover:block ' +
            TOOLTIP_POSITION[tooltip]
          }
        >
          {label}
        </span>
      )}
    </button>
  );
}

/** Círculo com a inicial na cor da pessoa. `className` escolhe o tamanho. */
export function PersonAvatar({
  name,
  color,
  className,
  children,
}: {
  name: string;
  color: string;
  className: string;
  children?: ReactNode;
}) {
  return (
    <span
      className={
        'relative flex shrink-0 items-center justify-center rounded-full border-2 border-ink text-xs font-semibold uppercase ' +
        className
      }
      style={{ backgroundColor: color, color: readableTextOn(color) }}
    >
      {name.slice(0, 1)}
      {children}
    </span>
  );
}

/** Com mouse e tela larga: é a mesma regra da variante `desk` do Tailwind. */
const DESK_QUERY = '(min-width: 1024px) and (pointer: fine)';

export function useIsDesk(): boolean {
  const [desk, setDesk] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(DESK_QUERY);
    const update = () => setDesk(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return desk;
}

/** Fecha popover com clique fora ou Esc. */
export function useDismiss(
  ref: RefObject<HTMLElement>,
  open: boolean,
  close: () => void
) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [ref, open, close]);
}
