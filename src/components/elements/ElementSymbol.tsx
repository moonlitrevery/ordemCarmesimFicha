import type { CSSProperties, ReactNode } from 'react';
import type { ElementType } from '@/types/database';
import { ELEMENT_COLORS, ELEMENT_LABELS } from '@/lib/constants';

// Grid 100×100, traço em currentColor. Desenhos aprovados — não alterar.
const SYMBOLS: Record<ElementType, { stroke: number; body: ReactNode }> = {
  fogo: { stroke: 3.5, body: <polygon points="50,15 85,80 15,80" /> },
  agua: { stroke: 3.5, body: <polygon points="15,20 85,20 50,85" /> },
  ar: { stroke: 3.5, body: (<><polygon points="50,15 85,80 15,80" /><line x1="20" y1="58" x2="80" y2="58" /></>) },
  terra: { stroke: 3.5, body: (<><polygon points="15,20 85,20 50,85" /><line x1="20" y1="42" x2="80" y2="42" /></>) },
  sangue: { stroke: 3.5, body: (<>
    <circle cx="50" cy="60" r="22" />
    <line x1="34.4" y1="44.4" x2="65.6" y2="75.6" /><line x1="65.6" y1="44.4" x2="34.4" y2="75.6" />
    <line x1="50" y1="82" x2="50" y2="12" /><polyline points="42,20 50,12 58,20" />
    <line x1="40" y1="47" x2="60" y2="47" /><line x1="43" y1="47" x2="43" y2="51" /><line x1="50" y1="47" x2="50" y2="51" /><line x1="57" y1="47" x2="57" y2="51" />
  </>) },
  veneno: { stroke: 3.5, body: (<>
    <circle cx="27" cy="48" r="16" /><circle cx="73" cy="48" r="16" />
    <line x1="43" y1="45" x2="57" y2="45" /><line x1="43" y1="51" x2="57" y2="51" /><line x1="50" y1="34" x2="50" y2="82" />
  </>) },
  encantamento: { stroke: 3.5, body: (<>
    <circle cx="50" cy="36" r="18" /><path d="M55 25 A12 12 0 1 0 55 47 A9 9 0 1 1 55 25" />
    <circle cx="50" cy="36" r="25" strokeDasharray="3 5" />
    <line x1="50" y1="54" x2="50" y2="88" /><line x1="37" y1="72" x2="63" y2="72" />
    <circle cx="34" cy="72" r="3" /><circle cx="66" cy="72" r="3" /><circle cx="50" cy="91" r="3" />
  </>) },
  eletricidade: { stroke: 3.5, body: (<>
    <polyline points="24,36 32,20 44,24 40,32 48,38 28,62" />
    <line x1="28" y1="62" x2="80" y2="62" strokeDasharray="7 4" /><line x1="64" y1="36" x2="64" y2="90" strokeDasharray="7 4" />
    <line x1="14" y1="50" x2="20" y2="47" /><line x1="84" y1="44" x2="90" y2="40" /><line x1="78" y1="80" x2="84" y2="84" />
    <line x1="54" y1="14" x2="58" y2="8" /><line x1="18" y1="76" x2="24" y2="80" />
  </>) },
  gelo: { stroke: 2.5, body: (<>
    <circle cx="50" cy="54" r="22" /><line x1="16" y1="54" x2="84" y2="54" /><line x1="50" y1="32" x2="50" y2="14" />
  </>) },
  luz: { stroke: 3.5, body: (<><circle cx="50" cy="50" r="28" /><circle cx="50" cy="50" r="3.5" fill="currentColor" /></>) },
  sombra: { stroke: 3.5, body: (<>
    <line x1="40" y1="12" x2="40" y2="60" /><line x1="29" y1="24" x2="51" y2="24" />
    <path d="M40 50 C40 40 66 40 64 58 C62 72 52 76 62 88" />
  </>) },
};

/**
 * Cores escuras demais pro fundo do site (`#0c0a0d`): o brilho na própria cor
 * some, então elas ganham um halo claro por fora, como o texto de Luz/Sombra.
 */
const DARK_ELEMENTS: ReadonlySet<ElementType> = new Set(['sombra', 'sangue', 'agua', 'terra']);

/** Sem glow, as cores escuras ainda precisam de um contorno claro mínimo. */
const LEGIBILITY_FILTER = 'drop-shadow(0 0 1px rgba(255,255,255,0.6))';

/** `#RRGGBB` + alpha (0–1) → `#RRGGBBAA`. */
function withAlpha(hex: string, alpha: number): string {
  return hex + Math.round(alpha * 255).toString(16).padStart(2, '0');
}

/** Brilho estático (CSS `filter`), duas camadas de `drop-shadow`. */
export function glowFilter(element: ElementType): string {
  const color = ELEMENT_COLORS[element];
  if (DARK_ELEMENTS.has(element)) {
    return (
      'drop-shadow(0 0 1.5px rgba(255,255,255,0.75)) ' +
      'drop-shadow(0 0 6px rgba(255,255,255,0.3)) ' +
      'drop-shadow(0 0 10px ' + withAlpha(color, 0.9) + ')'
    );
  }
  return 'drop-shadow(0 0 3px ' + color + ') drop-shadow(0 0 8px ' + withAlpha(color, 0.55) + ')';
}

export function ElementSymbol({
  element,
  size = 24,
  glow = false,
  pulse = false,
  inline = false,
  decorative = false,
  className,
  title,
}: {
  element: ElementType;
  /** Número em px; `inline` usa 1em. */
  size?: number;
  glow?: boolean;
  /** Animação curta única (sobe de nível); desligada com `prefers-reduced-motion`. */
  pulse?: boolean;
  /** Pequeno, alinhado ao texto (MDX). */
  inline?: boolean;
  /** Ao lado do nome escrito: o leitor de tela não repete o elemento. */
  decorative?: boolean;
  className?: string;
  title?: string;
}) {
  const s = SYMBOLS[element];
  if (!s) return null;
  const color = ELEMENT_COLORS[element];
  const filter = glow
    ? glowFilter(element)
    : DARK_ELEMENTS.has(element)
      ? LEGIBILITY_FILTER
      : undefined;
  const style: CSSProperties = filter ? { color, filter } : { color };
  const label = title ?? ELEMENT_LABELS[element];
  const dim = inline ? '1em' : size;
  const classes = [
    'shrink-0',
    inline ? 'inline-block align-[-0.15em]' : '',
    pulse ? 'element-symbol-pulse' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <svg
      viewBox="0 0 100 100"
      width={dim}
      height={dim}
      className={classes}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth={s.stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
    >
      {!decorative && <title>{label}</title>}
      {s.body}
    </svg>
  );
}
