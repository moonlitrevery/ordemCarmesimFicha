export const SCENE_TRANSITIONS = ['corte', 'fade', 'simbolo'] as const;

export type SceneTransitionStyle = (typeof SCENE_TRANSITIONS)[number];

export const SCENE_TRANSITION_LABELS: Record<SceneTransitionStyle, string> = {
  corte: 'Corte',
  fade: 'Fade',
  simbolo: 'Símbolo da Ordem',
};

/** Hoje é o ícone do site; troque o arquivo ou defina a variável para usar outro. */
export const ORDER_SYMBOL_URL = process.env.NEXT_PUBLIC_ORDER_SYMBOL_URL || '/icon.svg';

/** Mesmo com a cena nova sem carregar, o mapa não fica coberto mais do que isto. */
export const MAX_COVER_MS = 4000;

export function parseSceneTransition(raw: unknown): SceneTransitionStyle {
  return SCENE_TRANSITIONS.find((style) => style === raw) ?? 'fade';
}

export interface TransitionTiming {
  coverMs: number;
  /** Tempo mínimo coberto: só o símbolo precisa aparecer inteiro. */
  holdMs: number;
  revealMs: number;
}

export function transitionTiming(
  style: Exclude<SceneTransitionStyle, 'corte'>,
  lightMode: boolean
): TransitionTiming {
  if (style === 'simbolo') {
    return lightMode
      ? { coverMs: 150, holdMs: 350, revealMs: 250 }
      : { coverMs: 300, holdMs: 700, revealMs: 500 };
  }
  return lightMode
    ? { coverMs: 150, holdMs: 0, revealMs: 250 }
    : { coverMs: 300, holdMs: 0, revealMs: 500 };
}

export interface SceneTransitionView {
  style: Exclude<SceneTransitionStyle, 'corte'>;
  phase: 'cover' | 'hold' | 'reveal';
  /** Duração do fade desta fase. */
  durationMs: number;
  lightMode: boolean;
}

/**
 * Cobre, espera a cena nova e revela. Toda saída passa por `reveal`, e o teto
 * garante que falha de rede ou textura nunca deixa a mesa no preto.
 */
export class SceneTransition {
  private view: SceneTransitionView | null = null;
  private timing: TransitionTiming | null = null;
  private covered: Promise<void> = Promise.resolve();
  private coveredAt = 0;
  private coverTimer: ReturnType<typeof setTimeout> | undefined;
  private capTimer: ReturnType<typeof setTimeout> | undefined;
  private revealTimer: ReturnType<typeof setTimeout> | undefined;
  private ticket = 0;

  constructor(private publish: (view: SceneTransitionView | null) => void) {}

  get active(): boolean {
    return this.view !== null && this.view.phase !== 'reveal';
  }

  /** Resolve quando o mapa já está coberto. Chamar de novo no meio devolve o mesmo. */
  begin(style: SceneTransitionStyle, lightMode: boolean): Promise<void> {
    if (style === 'corte') return Promise.resolve();
    if (this.active) {
      // Uma leitura anterior pode ter pedido para revelar: a troca nova vale mais.
      clearTimeout(this.revealTimer);
      return this.covered;
    }
    this.clearTimers();
    this.ticket++;
    const timing = transitionTiming(style, lightMode);
    this.timing = timing;
    this.coveredAt = Date.now() + timing.coverMs;
    this.show({ style, phase: 'cover', durationMs: timing.coverMs, lightMode });
    this.covered = new Promise((resolve) => {
      this.coverTimer = setTimeout(() => {
        if (this.view) this.show({ ...this.view, phase: 'hold' });
        resolve();
      }, timing.coverMs);
    });
    this.capTimer = setTimeout(() => this.reveal(), timing.coverMs + MAX_COVER_MS);
    return this.covered;
  }

  /** A cena nova já está no store: revela quando ela carregar, ou no teto. */
  finishWhen(ready: Promise<unknown>) {
    if (!this.active) return;
    const { ticket } = this;
    const done = () => {
      if (ticket === this.ticket) this.reveal();
    };
    void ready.then(done, done);
  }

  /** Revela o que estiver na tela. Sem transição ativa, não faz nada. */
  reveal() {
    if (!this.active || !this.view || !this.timing) return;
    const { timing, view, ticket } = this;
    const wait = Math.max(0, this.coveredAt + timing.holdMs - Date.now());
    clearTimeout(this.revealTimer);
    this.revealTimer = setTimeout(() => {
      if (ticket !== this.ticket) return;
      clearTimeout(this.capTimer);
      this.show({ ...view, phase: 'reveal', durationMs: timing.revealMs });
      this.revealTimer = setTimeout(() => this.show(null), timing.revealMs);
    }, wait);
  }

  stop() {
    this.clearTimers();
    this.ticket++;
    this.show(null);
  }

  private show(view: SceneTransitionView | null) {
    this.view = view;
    this.publish(view);
  }

  private clearTimers() {
    clearTimeout(this.coverTimer);
    clearTimeout(this.capTimer);
    clearTimeout(this.revealTimer);
  }
}
