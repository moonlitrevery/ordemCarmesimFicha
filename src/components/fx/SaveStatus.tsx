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
 * do save que já existe; cores do tema. **Só CSS** (sem a Motion, que pesaria no
 * primeiro carregamento da ficha): a pílula fica montada e entra/sai por
 * transição de `opacity`/`transform`; o texto novo entra com `.fx-pop-in`.
 */
import { useState } from 'react';
import { Check, CloudOff, LoaderCircle, RefreshCw } from 'lucide-react';
import type { SaveStatus } from '@/components/ui/SaveIndicator';

type Shown = Exclude<SaveStatus, 'idle'>;

const TEXT: Record<Shown, string> = {
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
  // Ao sumir, continua mostrando o último estado enquanto a pílula sai.
  const [last, setLast] = useState<Shown>('saved');
  if (status !== 'idle' && status !== last) setLast(status);
  const visible = status !== 'idle';
  const shown = visible ? status : last;

  return (
    <div
      aria-live="polite"
      className={
        floating
          ? 'pointer-events-none fixed bottom-4 left-4 z-40 md:bottom-6 md:left-6'
          : 'pointer-events-none flex min-h-7 items-center'
      }
    >
      <div
        aria-hidden={!visible || undefined}
        className={
          'flex items-center gap-1.5 rounded-full border bg-ink-panel/95 px-2.5 py-1 text-xs shadow-panel transition duration-base ' +
          (visible
            ? 'pointer-events-auto translate-y-0 opacity-100 ease-enter '
            : 'invisible translate-y-1.5 opacity-0 ease-exit ') +
          (shown === 'error' ? 'border-crimson/70 text-crimson-soft' : 'border-ink-border text-ink-muted')
        }
        // `invisible` só depois de sair: some do leitor de tela e do Tab.
        style={visible ? undefined : { transitionProperty: 'opacity, transform, visibility' }}
      >
        <span key={shown} className="fx-pop-in flex items-center gap-1.5">
          <StatusIcon status={shown} />
          <span>{TEXT[shown]}</span>
        </span>
        {shown === 'error' && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="-my-1 -mr-1.5 min-h-9 rounded-full px-2 font-medium text-parchment underline-offset-2 hover:underline"
          >
            Tentar de novo
          </button>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: Shown }) {
  if (status === 'saving') {
    // `motion-safe`: com movimento reduzido o ícone fica parado.
    return <LoaderCircle size={13} aria-hidden className="motion-safe:animate-spin" />;
  }
  if (status === 'saved') return <Check size={13} aria-hidden className="text-emerald-400/90" />;
  if (status === 'error') return <CloudOff size={13} aria-hidden />;
  return <RefreshCw size={13} aria-hidden />;
}
