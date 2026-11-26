'use client';

/**
 * Pilha de toasts de ação da Mesa (Fase 15, item 10), no canto inferior esquerdo,
 * acima do ⋯: não cobre o chat (direita) nem as ferramentas (topo).
 *
 * Origem: kokonutui, "Promise Toast" (components/kokonutui/promise-toast.tsx),
 * https://kokonutui.com/docs/feedback/promise-toast — licença MIT
 * (https://github.com/kokonut-labs/kokonutui/blob/main/LICENSE).
 *
 * Adaptado: sem contador de progresso, botões nem arrastar para dispensar; o estado
 * vem de `src/lib/vtt/action-toasts.ts`; o texto troca no lugar (pendente → pronto);
 * cores do tema. **Só CSS** (`.fx-toast-in`, `.fx-toast-out`, `.fx-pop-in` em
 * globals.css): a Motion não entra no primeiro carregamento da Mesa.
 */
import { Check, CircleAlert, Info, LoaderCircle } from 'lucide-react';
import { dismissToast, useActionToasts, type ToastState } from '@/lib/vtt/action-toasts';

export function ActionToasts() {
  const toasts = useActionToasts((s) => s.toasts);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute bottom-16 left-2 z-40 flex w-[min(20rem,calc(100vw-1rem))] flex-col-reverse gap-1.5"
    >
      {[...toasts].reverse().map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => dismissToast(toast.id)}
          title="Fechar"
          className={
            'pointer-events-auto flex min-h-11 items-center gap-2 rounded-lg border bg-ink-raised/95 px-3 py-2 text-left text-xs text-parchment shadow-panel desk:min-h-0 ' +
            (toast.leaving ? 'fx-toast-out ' : 'fx-toast-in ') +
            (toast.state === 'error' ? 'border-crimson/70' : 'border-ink-border')
          }
        >
          {/* `key` novo a cada troca de estado: o texto novo entra com a animação. */}
          <span key={toast.state + toast.text} className="fx-pop-in flex min-w-0 items-center gap-2">
            <ToastIcon state={toast.state} />
            <span className="min-w-0">{toast.text}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function ToastIcon({ state }: { state: ToastState }) {
  if (state === 'pending') {
    return <LoaderCircle size={14} aria-hidden className="shrink-0 text-ink-muted motion-safe:animate-spin" />;
  }
  if (state === 'success') return <Check size={14} aria-hidden className="shrink-0 text-emerald-400/90" />;
  if (state === 'error') return <CircleAlert size={14} aria-hidden className="shrink-0 text-crimson-soft" />;
  return <Info size={14} aria-hidden className="shrink-0 text-ink-muted" />;
}
