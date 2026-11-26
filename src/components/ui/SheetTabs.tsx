'use client';

import { type ReactNode, useRef, useState } from 'react';
import { SlideUnderline, useSlidingBox } from '@/components/ui/sliding';

export type SheetTab = {
  id: string;
  label: string;
  content: ReactNode;
};

export function SheetTabs({
  tabs,
  defaultTabId,
}: {
  tabs: SheetTab[];
  defaultTabId?: string;
}) {
  const [activeId, setActiveId] = useState(
    () => defaultTabId ?? tabs[0]?.id ?? ''
  );
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];
  // Fase 15: o sublinhado desliza até a aba nova, só CSS (sem a Motion na ficha).
  const listRef = useRef<HTMLDivElement>(null);
  const { box, placed } = useSlidingBox(listRef, '[aria-selected="true"]', active?.id ?? '');

  if (!active) return null;

  return (
    <div className="space-y-4">
      <div className="-mx-1 overflow-x-auto px-1">
        <div
          ref={listRef}
          role="tablist"
          className="relative flex min-w-min gap-1 border-b border-ink-border"
        >
          {tabs.map((tab) => {
            const selected = tab.id === active.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                id={`sheet-tab-${tab.id}`}
                aria-controls={`sheet-panel-${tab.id}`}
                className={
                  'relative shrink-0 whitespace-nowrap border-b-2 px-2.5 py-2 text-xs font-medium transition duration-fast ease-enter md:px-3 md:text-sm ' +
                  // Antes de medir (SSR), a própria aba tem a borda.
                  (selected ? (box ? 'border-transparent ' : 'border-crimson ') + 'text-parchment' : 'border-transparent text-ink-muted hover:text-parchment')
                }
                onClick={() => setActiveId(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
          {box && <SlideUnderline box={box} placed={placed} />}
        </div>
      </div>
      <div
        role="tabpanel"
        id={`sheet-panel-${active.id}`}
        aria-labelledby={`sheet-tab-${active.id}`}
      >
        {active.content}
      </div>
    </div>
  );
}
