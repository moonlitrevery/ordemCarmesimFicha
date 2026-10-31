'use client';

import { useState, type ReactNode } from 'react';

export interface SidePanelTab {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * Retrátil ao lado do canvas com mouse; gaveta por cima dele no touch.
 * Fechado continua montado (hidden) para não perder o estado das abas.
 */
export function SidePanel({
  side,
  label,
  open,
  tabs,
}: {
  side: 'left' | 'right';
  label: string;
  open: boolean;
  tabs: SidePanelTab[];
}) {
  const [activeId, setActiveId] = useState(tabs[0].id);

  return (
    <aside
      aria-label={label}
      className={
        'absolute inset-y-0 z-30 w-80 max-w-[85vw] flex-col border-ink-border bg-ink-panel desk:static desk:z-auto desk:shrink-0 ' +
        (side === 'left' ? 'left-0 border-r ' : 'right-0 border-l ') +
        (open ? 'flex' : 'hidden')
      }
    >
      <div role="tablist" className="flex shrink-0 overflow-x-auto border-b border-ink-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === activeId}
            onClick={() => setActiveId(tab.id)}
            className={
              'whitespace-nowrap border-b-2 px-3 py-2 text-sm transition ' +
              (tab.id === activeId
                ? 'border-crimson text-parchment'
                : 'border-transparent text-ink-muted hover:text-parchment')
            }
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          hidden={tab.id !== activeId}
          className="min-h-0 flex-1 overflow-y-auto p-3"
        >
          {tab.content}
        </div>
      ))}
    </aside>
  );
}
