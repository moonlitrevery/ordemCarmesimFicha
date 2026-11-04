'use client';

import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { X, type LucideIcon } from 'lucide-react';
import { FLOATING, FLOATING_PANEL, IconButton } from './hud';

export interface RailItem {
  id: string;
  label: string;
  icon: LucideIcon;
  content: ReactNode;
  badge?: number;
  quietBadge?: boolean;
}

export type RailSide = 'left' | 'right';

const CLOSE_SHEET_AT_PX = 80;

/** Coluna de ícones na borda, com mouse. No touch vira a `RailBottomBar`. */
export function IconRail({
  side,
  items,
  activeId,
  onToggle,
}: {
  side: RailSide;
  items: RailItem[];
  activeId: string | null;
  onToggle: (id: string) => void;
}) {
  return (
    <nav
      aria-label={side === 'left' ? 'Ferramentas da mestra' : 'Painéis'}
      className={
        FLOATING +
        ' absolute top-1/2 z-10 hidden -translate-y-1/2 flex-col gap-0.5 p-1 desk:flex ' +
        (side === 'left' ? 'left-2' : 'right-2')
      }
    >
      {items.map((item) => (
        <IconButton
          key={item.id}
          icon={item.icon}
          label={item.label}
          active={item.id === activeId}
          badge={item.badge}
          quietBadge={item.quietBadge}
          tooltip={side === 'left' ? 'right' : 'left'}
          onClick={() => onToggle(item.id)}
        />
      ))}
    </nav>
  );
}

/** Touch: os dois trilhos juntos numa barra fixa, com alvos de 44 px. */
export function RailBottomBar({
  left,
  right,
  activeLeft,
  activeRight,
  onToggle,
}: {
  left: RailItem[];
  right: RailItem[];
  activeLeft: string | null;
  activeRight: string | null;
  onToggle: (side: RailSide, id: string) => void;
}) {
  return (
    <nav
      aria-label="Painéis"
      className="absolute inset-x-0 bottom-0 z-30 flex h-14 items-center justify-center gap-1 overflow-x-auto border-t border-ink-border bg-ink px-2 desk:hidden"
    >
      {right.map((item) => (
        <IconButton
          key={item.id}
          icon={item.icon}
          label={item.label}
          active={item.id === activeRight}
          badge={item.badge}
          quietBadge={item.quietBadge}
          tooltip="native"
          onClick={() => onToggle('right', item.id)}
        />
      ))}
      {left.length > 0 && (
        <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-ink-border" />
      )}
      {left.map((item) => (
        <IconButton
          key={item.id}
          icon={item.icon}
          label={item.label}
          active={item.id === activeLeft}
          badge={item.badge}
          tooltip="native"
          onClick={() => onToggle('left', item.id)}
        />
      ))}
    </nav>
  );
}

/**
 * Painel flutuante com mouse; folha inferior no touch. Só monta o que já foi
 * aberto (a biblioteca não baixa nada antes disso) e depois mantém montado,
 * para não perder envio em andamento, rascunho nem rolagem.
 */
export function PanelHost({
  side,
  items,
  activeId,
  onClose,
}: {
  side: RailSide;
  items: RailItem[];
  activeId: string | null;
  onClose: () => void;
}) {
  const [seenIds, setSeenIds] = useState<ReadonlySet<string>>(new Set());
  const sheetRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ startY: number; distance: number } | null>(null);

  if (activeId && !seenIds.has(activeId)) {
    setSeenIds(new Set(seenIds).add(activeId));
  }

  const active = items.find((item) => item.id === activeId);

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startY: event.clientY, distance: 0 };
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || !sheetRef.current) return;
    drag.distance = Math.max(0, event.clientY - drag.startY);
    sheetRef.current.style.transform = `translateY(${drag.distance}px)`;
  }

  function endDrag() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (sheetRef.current) sheetRef.current.style.transform = '';
    if (drag && drag.distance > CLOSE_SHEET_AT_PX) onClose();
  }

  return (
    <aside
      ref={sheetRef}
      aria-label={active?.label}
      className={
        FLOATING_PANEL +
        ' absolute inset-x-0 bottom-14 z-20 h-[70%] flex-col rounded-t-2xl desk:top-14 desk:h-auto desk:w-[360px] desk:rounded-xl ' +
        (side === 'left'
          ? 'desk:bottom-2 desk:left-14 desk:right-auto '
          : 'desk:bottom-12 desk:left-auto desk:right-14 ') +
        (active ? 'flex' : 'hidden')
      }
    >
      <div
        className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center desk:hidden"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span aria-hidden className="h-1 w-10 rounded-full bg-ink-border" />
      </div>
      <header className="flex shrink-0 items-center justify-between gap-2 px-3 desk:py-1">
        <h2 className="truncate font-display text-lg text-parchment">
          {active?.label}
        </h2>
        <IconButton icon={X} label="Fechar painel" tooltip="native" onClick={onClose} />
      </header>
      {items.map(
        (item) =>
          seenIds.has(item.id) && (
            <div
              key={item.id}
              className={
                'min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3 ' +
                (item.id === activeId ? 'flex' : 'hidden')
              }
            >
              {item.content}
            </div>
          )
      )}
    </aside>
  );
}
