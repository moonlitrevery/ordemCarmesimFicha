'use client';

import { useVttStore } from '@/lib/vtt/store';

const MAX_SHOWN = 6;

/**
 * Fase 12: quem joga não tem mais a aba Iniciativa. Esta faixa compacta mostra a
 * ordem, só leitura, a partir do turno atual, e só aparece quando há entradas.
 * Os nomes já vêm protegidos da coluna (`???` para token oculto ou ofuscado).
 */
export function InitiativeStrip() {
  const initiative = useVttStore((s) => s.initiative);
  const { entries, current, round } = initiative;
  if (entries.length === 0) return null;

  const start = Math.min(Math.max(current, 0), entries.length - 1);
  const ordered = [...entries.slice(start), ...entries.slice(0, start)];
  const shown = ordered.slice(0, MAX_SHOWN);
  const extra = ordered.length - shown.length;

  return (
    <div
      role="status"
      aria-label={`Iniciativa, rodada ${round}`}
      className="flex max-w-full items-center gap-1 overflow-hidden rounded-md border border-ink-border bg-ink-raised/95 px-2 py-1 text-parchment"
    >
      <span className="shrink-0 text-ink-muted">Rodada {round}</span>
      <ol className="flex min-w-0 items-center gap-1">
        {shown.map((entry, index) => (
          <li
            key={entry.id}
            title={index === 0 ? `Turno de ${entry.name}` : entry.name}
            className={
              'max-w-[8rem] shrink-0 truncate rounded px-1.5 py-0.5 ' +
              (index === 0 ? 'border border-crimson bg-crimson/25' : 'border border-transparent text-ink-muted')
            }
          >
            {entry.name}
          </li>
        ))}
      </ol>
      {extra > 0 && <span className="shrink-0 text-ink-muted">+{extra}</span>}
    </div>
  );
}
