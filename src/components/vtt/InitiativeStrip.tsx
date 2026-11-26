'use client';

import { useRef } from 'react';
import { TurnTrail } from '@/components/fx/TurnTrail';
import { useVttStore } from '@/lib/vtt/store';

const MAX_SHOWN = 6;

/**
 * Fase 12: quem joga não tem mais a aba Iniciativa. Esta faixa compacta mostra a
 * ordem, só leitura, a partir do turno atual, e só aparece quando há entradas.
 * Os nomes já vêm protegidos da coluna (`???` para token oculto ou ofuscado).
 */
export function InitiativeStrip() {
  const initiative = useVttStore((s) => s.initiative);
  // Antes do `return null`: hooks na mesma ordem em todo render.
  const listRef = useRef<HTMLOListElement>(null);
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
      <ol ref={listRef} className="relative flex min-w-0 items-center gap-1">
        <TurnTrail containerRef={listRef} selector='[data-turn="true"]' trailKey={`${round}:${current}`} rounded="rounded" />
        {shown.map((entry, index) => (
          <li
            key={entry.id}
            data-turn={index === 0 || undefined}
            title={index === 0 ? `Turno de ${entry.name}` : entry.name}
            className={
              'relative flex max-w-[8rem] shrink-0 rounded px-1.5 py-0.5 ' +
              (index === 0 ? 'bg-crimson/25' : 'text-ink-muted')
            }
          >
            <span className="truncate">{entry.name}</span>
          </li>
        ))}
      </ol>
      {extra > 0 && <span className="shrink-0 text-ink-muted">+{extra}</span>}
    </div>
  );
}
