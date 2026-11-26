/**
 * Toasts de ação da Mesa (Fase 15, item 10): "Movendo jogadores…" → "Pronto".
 * Uma pilha só, com no máximo 3; o `showToast` antigo entra aqui como aviso.
 * Estado em um store próprio (zustand), fora do store da Mesa: um toast não
 * re-renderiza nada além da pilha.
 */
import { create } from 'zustand';

export type ToastState = 'pending' | 'success' | 'error' | 'info';

export interface ActionToast {
  id: number;
  state: ToastState;
  text: string;
  /** Saindo: a pilha anima a saída (CSS) e o tira logo depois. */
  leaving?: boolean;
}

export const MAX_TOASTS = 3;
const DONE_MS = 2200;
const INFO_MS = 4000;
const ERROR_MS = 5000;
/** Tempo da animação de saída (`--dur-fast`, com folga). */
const LEAVE_MS = 160;

export const useActionToasts = create<{ toasts: ActionToast[] }>(() => ({ toasts: [] }));

let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function clearTimer(id: number) {
  clearTimeout(timers.get(id));
  timers.delete(id);
}

export function dismissToast(id: number) {
  clearTimer(id);
  useActionToasts.setState((s) => ({
    toasts: s.toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
  }));
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      useActionToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, LEAVE_MS)
  );
}

function schedule(id: number, state: ToastState) {
  clearTimer(id);
  if (state === 'pending') return;
  const ms = state === 'success' ? DONE_MS : state === 'error' ? ERROR_MS : INFO_MS;
  timers.set(id, setTimeout(() => dismissToast(id), ms));
}

/** Põe um toast no topo da pilha; o mais antigo sai se passar de 3. */
export function pushToast(text: string, state: ToastState = 'info'): number {
  const id = nextId++;
  useActionToasts.setState((s) => {
    const toasts = [...s.toasts, { id, state, text }];
    for (const dropped of toasts.slice(0, Math.max(0, toasts.length - MAX_TOASTS))) clearTimer(dropped.id);
    return { toasts: toasts.slice(-MAX_TOASTS) };
  });
  schedule(id, state);
  return id;
}

export function updateToast(id: number, state: ToastState, text: string) {
  useActionToasts.setState((s) => ({
    toasts: s.toasts.map((t) => (t.id === id ? { ...t, state, text } : t)),
  }));
  schedule(id, state);
}

/**
 * Acompanha uma ação assíncrona. `false` como resultado (o padrão das funções da
 * Mesa que já avisam o próprio erro) só tira o toast, sem duplicar a mensagem.
 * Exceção vira o toast de erro e continua subindo para quem chamou.
 */
export async function trackAction<T>(
  run: () => Promise<T>,
  /** `error: null`: quem chama já mostra o erro na tela; o toast só sai. */
  text: { pending: string; success: string | ((result: T) => string); error?: string | null },
  isOk: (result: T) => boolean = (result) => result !== false
): Promise<T> {
  const id = pushToast(text.pending, 'pending');
  try {
    const result = await run();
    if (isOk(result)) {
      updateToast(id, 'success', typeof text.success === 'function' ? text.success(result) : text.success);
    } else {
      dismissToast(id);
    }
    return result;
  } catch (error) {
    if (text.error === null) {
      dismissToast(id);
      throw error;
    }
    updateToast(
      id,
      'error',
      text.error ?? (error instanceof Error && error.message ? error.message : 'Não deu certo. Tente de novo.')
    );
    throw error;
  }
}
