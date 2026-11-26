'use client';

import { useState } from 'react';
import { parseDecimal } from '@/lib/money';

export const WEIGHT_LIMIT = 9999;

export function parseWeight(text: string): number | null {
  const value = parseDecimal(text);
  if (value === null || Math.abs(value) > WEIGHT_LIMIT) return null;
  return Math.round(value * 100) / 100;
}

/** `−2` com o sinal tipográfico, vírgula nos decimais. */
export function formatWeight(value: number): string {
  const abs = Math.abs(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  return value < 0 ? `−${abs}` : abs;
}

/** Peso negativo é bônus de carga: verde, pra não parecer erro. */
export function WeightBadge({ weight, className = '' }: { weight: number; className?: string }) {
  const value = Number(weight) || 0;
  return (
    <span
      className={(value < 0 ? 'text-emerald-400 ' : 'text-ink-muted ') + className}
      title={value < 0 ? 'Aumenta a carga que dá pra levar' : undefined}
    >
      {formatWeight(value)}
    </span>
  );
}

/**
 * Peso por unidade. Teclado de texto (não `decimal`): o teclado decimal do iPhone
 * não tem o sinal de menos, e a mochila militar pesa −2.
 */
export function WeightInput({
  value,
  onChange,
  className,
  placeholder,
  ariaLabel = 'Peso do item',
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  className: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = value === null ? '' : String(value).replace('.', ',');
  const invalid = draft !== null && draft.trim() !== '' && parseWeight(draft) === null;

  return (
    <input
      type="text"
      autoComplete="off"
      className={className + (invalid ? ' border-crimson/70' : '')}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      value={draft ?? shown}
      onChange={(e) => {
        setDraft(e.target.value);
        if (!e.target.value.trim()) {
          onChange(null);
          return;
        }
        const parsed = parseWeight(e.target.value);
        if (parsed !== null) onChange(parsed);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}
