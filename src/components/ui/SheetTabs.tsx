'use client';

import { type ReactNode, useId, useState } from 'react';
import { m } from 'framer-motion';
import { DUR, EASE_ENTER } from '@/lib/motion-tokens';

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
  const underlineId = 'sheet-tab-' + useId();

  if (!active) return null;

  return (
    <div className="space-y-4">
      <div className="-mx-1 overflow-x-auto px-1">
        <div
          role="tablist"
          className="flex min-w-min gap-1 border-b border-ink-border"
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
                  'relative shrink-0 whitespace-nowrap border-b-2 border-transparent px-2.5 py-2 text-xs font-medium transition duration-fast ease-enter md:px-3 md:text-sm ' +
                  (selected ? 'text-parchment' : 'text-ink-muted hover:text-parchment')
                }
                onClick={() => setActiveId(tab.id)}
              >
                {tab.label}
                {selected && (
                  // Fase 15: o sublinhado desliza até a aba nova (layoutId, só transform).
                  <m.span
                    aria-hidden
                    layoutId={underlineId}
                    transition={{ duration: DUR.slow, ease: EASE_ENTER }}
                    className="pointer-events-none absolute inset-x-0 -bottom-0.5 h-0.5 bg-crimson"
                  />
                )}
              </button>
            );
          })}
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
