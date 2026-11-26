'use client';

/**
 * Indicador do save automático (Fase 15, item 2): "Salvando…" → "Salvo" → some.
 * Erro fica visível com "tentar de novo"; mochila relida avisa por alguns segundos.
 *
 * Origem: kokonutui, "Save Status" (components/kokonutui/save-status.tsx),
 * https://kokonutui.com/docs/feedback/save-status — licença MIT
 * (https://github.com/kokonut-labs/kokonutui/blob/main/LICENSE).
 *
 * Adaptado: só a pílula de estado (sem editor, fila offline nem "há X s"); estados
 * do save que já existe; sem `filter: blur` (só `opacity` e `transform`); cores do
 * tema. Precisa de um `MotionProvider` acima (ficha e Mesa já têm).
 */
import { AnimatePresence, m } from 'framer-motion';
import { Check, CloudOff, LoaderCircle, RefreshCw } from 'lucide-react';
import type { SaveStatus } from '@/components/ui/SaveIndicator';
import { ENTER, EXIT } from '@/lib/motion-tokens';

const TEXT: Record<Exclude<SaveStatus, 'idle'>, string> = {
  saving: 'Salvando…',
  saved: 'Salvo',
  error: 'Não salvou',
  reloaded: 'Mochila relida de outro lugar',
};

export function SaveStatusPill({
  status,
  onRetry,
  floating = false,
}: {
  status: SaveStatus;
  onRetry?: () => void;
  /** Fixo no canto inferior esquerdo (ficha); senão, no fluxo (Ficha rápida). */
  floating?: boolean;
}) {
  const visible = status !== 'idle';
  return (
    <div
      aria-live="polite"
      className={
        floating
          ? 'pointer-events-none fixed bottom-4 left-4 z-40 md:bottom-6 md:left-6'
          : 'pointer-events-none flex min-h-7 items-center'
      }
    >
      <AnimatePresence initial={false}>
        {visible && (
          <m.div
            key="pill"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0, transition: ENTER }}
            exit={{ opacity: 0, y: 6, transition: EXIT }}
            className={
              'pointer-events-auto flex items-center gap-1.5 rounded-full border bg-ink-panel/95 px-2.5 py-1 text-xs shadow-panel ' +
              (status === 'error' ? 'border-crimson/70 text-crimson-soft' : 'border-ink-border text-ink-muted')
            }
          >
            <AnimatePresence initial={false} mode="popLayout">
              <m.span
                key={status}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1, transition: ENTER }}
                exit={{ opacity: 0, scale: 0.85, transition: EXIT }}
                className="flex items-center gap-1.5"
              >
                <StatusIcon status={status} />
                <span>{TEXT[status]}</span>
              </m.span>
            </AnimatePresence>
            {status === 'error' && onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="-my-1 -mr-1.5 min-h-9 rounded-full px-2 font-medium text-parchment underline-offset-2 hover:underline"
              >
                Tentar de novo
              </button>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatusIcon({ status }: { status: SaveStatus }) {
  if (status === 'saving') {
    // `motion-safe`: com movimento reduzido o ícone fica parado.
    return <LoaderCircle size={13} aria-hidden className="motion-safe:animate-spin" />;
  }
  if (status === 'saved') return <Check size={13} aria-hidden className="text-emerald-400/90" />;
  if (status === 'error') return <CloudOff size={13} aria-hidden />;
  return <RefreshCw size={13} aria-hidden />;
}
