'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { FLOATING_PANEL } from './hud';

/** Confirmação da Mesa: nunca `window.confirm`. Esc e clique fora cancelam. */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Não fecha também o overlay de baixo.
        event.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/70 p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className={FLOATING_PANEL + ' w-full max-w-sm space-y-3 rounded-xl p-4 text-sm text-parchment'}
      >
        <h2 className="font-display text-xl">{title}</h2>
        {children && <div className="text-ink-muted">{children}</div>}
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            className="btn-ghost min-h-11 px-3 py-1 text-xs desk:min-h-0"
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            className={
              'btn-primary min-h-11 px-3 py-1 text-xs desk:min-h-0 ' + (danger ? 'bg-crimson' : '')
            }
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
