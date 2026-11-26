'use client';

import { useState } from 'react';

/** "Quantos?" inline, sem diálogo do navegador. Padrão: todos. */
export function QtyPrompt({
  max,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  max: number;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: (qty: number) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(String(max));
  const qty = Math.trunc(Number(text));
  const valid = Number.isFinite(qty) && qty >= 1 && qty <= max;

  return (
    <form
      className="flex flex-wrap items-center gap-1 px-2 pb-2 text-xs text-ink-muted"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !busy) onConfirm(qty);
      }}
    >
      <label className="flex items-center gap-1">
        Quantos?
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={max}
          autoFocus
          className="field min-h-11 w-16 px-1 py-1 text-center text-sm desk:min-h-8"
          value={text}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setText(e.target.value)}
        />
        <span>de {max}</span>
      </label>
      <button
        type="submit"
        disabled={!valid || busy}
        className="btn-primary min-h-11 px-3 py-1 text-xs desk:min-h-8"
      >
        {confirmLabel}
      </button>
      <button
        type="button"
        className="btn-ghost min-h-11 px-2 py-1 text-xs desk:min-h-8"
        onClick={onCancel}
      >
        Cancelar
      </button>
    </form>
  );
}
