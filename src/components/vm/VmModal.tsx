'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Moldura de modal da V.M.: Esc e clique fora fecham. Sem diálogo nativo. */
export function VmModal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/75 p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={
          'panel flex max-h-[85dvh] w-full flex-col gap-3 bg-ink-panel/95 p-4 text-parchment ' +
          (wide ? 'max-w-lg' : 'max-w-sm')
        }
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-2xl">{title}</h2>
          <button
            type="button"
            aria-label="Fechar"
            className="flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-ink-raised hover:text-parchment"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Criar ou renomear grupo. */
export function GroupNameModal({
  title,
  initial = '',
  confirmLabel,
  busy,
  onSubmit,
  onClose,
}: {
  title: string;
  initial?: string;
  confirmLabel: string;
  busy: boolean;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  const trimmed = name.trim();

  return (
    <VmModal title={title} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed && !busy) onSubmit(trimmed);
        }}
      >
        <label className="block space-y-1">
          <span className="label">Nome do grupo</span>
          <input
            ref={inputRef}
            className="field"
            value={name}
            maxLength={80}
            placeholder="Ex.: Cineres Cruenti"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={!trimmed || busy}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </VmModal>
  );
}
