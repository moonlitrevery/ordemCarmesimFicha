'use client';

import { useRef, useState, type ReactNode } from 'react';
import { SlideUnderline, useSlidingBox } from '@/components/ui/sliding';

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
  // Fase 15: o sublinhado desliza até a subaba nova, só CSS.
  const listRef = useRef<HTMLDivElement>(null);
  const { box, placed } = useSlidingBox(listRef, '[aria-selected="true"]', active);
  if (!seen.has(active)) setSeen(new Set(seen).add(active));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={listRef} role="tablist" aria-label={label} className="relative mb-2 flex shrink-0 gap-1 border-b border-ink-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === active}
            className={
              'relative -mb-px min-h-11 border-b-2 px-3 text-sm desk:min-h-9 ' +
              (tab.id === active
                ? (box ? 'border-transparent ' : 'border-crimson ') + 'text-parchment'
                : 'border-transparent text-ink-muted hover:text-parchment')
            }
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
        {box && <SlideUnderline box={box} placed={placed} />}
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
