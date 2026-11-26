'use client';

import { m } from 'framer-motion';
import { TurnTrail } from '@/components/fx/TurnTrail';
import { DUR, EASE_ENTER } from '@/lib/motion-tokens';
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
        {/* `layout`: ao passar o turno, a fila desliza em vez de pular (só transform). */}
        {shown.map((entry, index) => (
          <m.li
            key={entry.id}
            layout="position"
            transition={{ duration: DUR.slow, ease: EASE_ENTER }}
            title={index === 0 ? `Turno de ${entry.name}` : entry.name}
            className={
              'relative flex max-w-[8rem] shrink-0 rounded px-1.5 py-0.5 ' +
              (index === 0 ? 'bg-crimson/25' : 'text-ink-muted')
            }
          >
            {index === 0 && <TurnTrail layoutId="turn-strip" trailKey={`${round}:${current}`} />}
            <span className="truncate">{entry.name}</span>
          </m.li>
        ))}
      </ol>
      {extra > 0 && <span className="shrink-0 text-ink-muted">+{extra}</span>}
    </div>
  );
}
