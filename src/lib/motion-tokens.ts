/**
 * Tokens de animação (Fase 15), espelho em segundos das variáveis CSS de
 * `globals.css` (`--dur-*`, `--ease-*`), para a Motion (`framer-motion`).
 * Só `transform`, `opacity` e `pathLength`; nada em loop.
 */
export const DUR = {
  fast: 0.12,
  base: 0.22,
  slow: 0.36,
} as const;

/** Entrar: desacelera no fim. */
export const EASE_ENTER = [0.22, 1, 0.36, 1] as const;
/** Sair: acelera no fim. */
export const EASE_EXIT = [0.55, 0, 1, 0.45] as const;

export const ENTER = { duration: DUR.base, ease: EASE_ENTER } as const;
export const EXIT = { duration: DUR.fast, ease: EASE_EXIT } as const;
