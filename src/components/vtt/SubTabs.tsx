'use client';

import { useId, useState, type ReactNode } from 'react';
import { m } from 'framer-motion';
import { DUR, EASE_ENTER } from '@/lib/motion-tokens';

export interface SubTab<T extends string> {
  id: T;
  label: string;
  content: ReactNode;
}

/**
 * Subabas dentro de uma aba. Cada uma só monta na primeira vez que é aberta e
 * depois fica montada: não perde envio em andamento, rascunho nem rolagem.
 */
export function SubTabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: SubTab<T>[];
  active: T;
  onChange: (id: T) => void;
  label: string;
}) {
  const [seen, setSeen] = useState<ReadonlySet<T>>(() => new Set([active]));
  // Um por instância: várias subabas ficam montadas ao mesmo tempo.
  const underlineId = 'subtab-' + useId();
  if (!seen.has(active)) setSeen(new Set(seen).add(active));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" aria-label={label} className="mb-2 flex shrink-0 gap-1 border-b border-ink-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === active}
            className={
              'relative -mb-px min-h-11 border-b-2 border-transparent px-3 text-sm desk:min-h-9 ' +
              (tab.id === active ? 'text-parchment' : 'text-ink-muted hover:text-parchment')
            }
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
            {tab.id === active && (
              // Fase 15: o sublinhado desliza até a subaba nova (layoutId, só transform).
              <m.span
                aria-hidden
                layoutId={underlineId}
                transition={{ duration: DUR.slow, ease: EASE_ENTER }}
                className="pointer-events-none absolute inset-x-0 -bottom-0.5 h-0.5 bg-crimson"
              />
            )}
          </button>
        ))}
      </div>
      {tabs.map(
        (tab) =>
          seen.has(tab.id) && (
            <div
              key={tab.id}
              role="tabpanel"
              className={'min-h-0 flex-1 flex-col ' + (tab.id === active ? 'flex' : 'hidden')}
            >
              {tab.content}
            </div>
          )
      )}
    </div>
  );
}
