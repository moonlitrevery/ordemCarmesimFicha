'use client';

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  ChevronsLeft,
  ChevronsRight,
  FileText,
  Images,
  MessageSquare,
  UserRound,
  Volume2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { countPendingDocuments } from '@/lib/vtt/docs/rules';
import { perfPanelOpened } from '@/lib/vtt/perf';
import { useVttStore } from '@/lib/vtt/store';
import { oneOf, UI_KEYS, usePref } from '@/lib/vtt/ui-prefs';
import { ChatPanel } from './ChatPanel';
import { DocumentsPanel } from './docs/DocumentsPanel';
import { ReportsPanel } from './docs/ReportsPanel';
import { IconButton, useIsDesk } from './hud';
import { LibraryPanel } from './LibraryPanel';
import { QuickSheet } from './QuickSheet';
import { SoundPanel } from './SoundPanel';
import { SubTabs } from './SubTabs';
import { WeatherPanel } from './WeatherPanel';

const TAB_IDS = ['chat', 'sheet', 'library', 'docs', 'media'] as const;
type TabId = (typeof TAB_IDS)[number];

const MIN_WIDTH = 280;
const MAX_WIDTH = 560;
const DEFAULT_WIDTH = 360;
/** Largura da tira de ícones com a barra recolhida. */
const STRIP_WIDTH = 48;

interface SidebarPrefs {
  open: boolean;
  width: number;
}

function clampWidth(width: number): number {
  return Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)));
}

function parseSidebar(raw: unknown): SidebarPrefs {
  const value = (raw ?? {}) as Partial<SidebarPrefs>;
  return {
    open: typeof value.open === 'boolean' ? value.open : true,
    width: typeof value.width === 'number' && Number.isFinite(value.width) ? clampWidth(value.width) : DEFAULT_WIDTH,
  };
}

const parseTab = oneOf(TAB_IDS);
const parseDocsTab = oneOf(['docs', 'reports'] as const);
const parseMediaTab = oneOf(['sound', 'fx'] as const);

interface TabDef {
  id: TabId;
  label: string;
  icon: LucideIcon;
  content: ReactNode;
  badge?: number;
  quietBadge?: boolean;
}

function DocsTab() {
  const [tab, setTab] = usePref(UI_KEYS.docsTab, parseDocsTab);
  return (
    <SubTabs
      label="Documentos e relatórios"
      active={tab}
      onChange={setTab}
      tabs={[
        { id: 'docs', label: 'Documentos', content: <DocumentsPanel /> },
        { id: 'reports', label: 'Relatórios', content: <ReportsPanel /> },
      ]}
    />
  );
}

function MediaTab() {
  const [tab, setTab] = usePref(UI_KEYS.mediaTab, parseMediaTab);
  return (
    <SubTabs
      label="Som e efeitos de tela"
      active={tab}
      onChange={setTab}
      tabs={[
        { id: 'sound', label: 'Som', content: <SoundPanel /> },
        { id: 'fx', label: 'Efeitos', content: <WeatherPanel /> },
      ]}
    />
  );
}

/**
 * Barra da direita, como no Roll20 (Fase 12). Flutua sobre o mapa, que continua
 * em tela cheia: abrir, fechar ou mudar a largura não redimensiona o canvas. O
 * espaço ocupado vai para `--vtt-right` no elemento pai, que centraliza a barra
 * de ferramentas e afasta o que fica no canto direito.
 */
export function RightSidebar({ isGm, canUseSheet }: { isGm: boolean; canUseSheet: boolean }) {
  const isDesk = useIsDesk();
  const [prefs, setPrefs] = usePref(UI_KEYS.sidebar, parseSidebar);
  const [savedTab, setSavedTab] = usePref(UI_KEYS.sidebarTab, parseTab);
  // No celular a gaveta cobre o mapa: começa sempre fechada.
  const [mobileOpen, setMobileOpen] = useState(false);
  const [seen, setSeen] = useState<ReadonlySet<TabId>>(new Set());
  const rootRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ startX: number; startWidth: number; width: number } | null>(null);

  const chatUnread = useVttStore((s) => s.chatUnread);
  const pendingCount = useVttStore((s) =>
    isGm ? s.pendingAssets.length + countPendingDocuments(s.documents) : 0
  );

  const open = isDesk ? prefs.open : mobileOpen;

  const tabs: TabDef[] = [
    {
      id: 'chat',
      label: 'Chat',
      icon: MessageSquare,
      content: <ChatPanel />,
      badge: chatUnread,
      quietBadge: true,
    },
    ...(canUseSheet
      ? [{ id: 'sheet' as const, label: 'Ficha rápida', icon: UserRound, content: <QuickSheet /> }]
      : []),
    ...(isGm
      ? [
          {
            id: 'library' as const,
            label: 'Biblioteca',
            icon: Images,
            content: (
              <LibraryPanel
                onArmed={() => {
                  // No celular a gaveta sai da frente para o toque que coloca o token.
                  if (!isDesk) setMobileOpen(false);
                }}
              />
            ),
            badge: pendingCount,
          },
        ]
      : []),
    { id: 'docs', label: 'Documentos e relatórios', icon: FileText, content: <DocsTab /> },
    ...(isGm
      ? [{ id: 'media' as const, label: 'Som e efeitos de tela', icon: Volume2, content: <MediaTab /> }]
      : []),
  ];

  const active: TabId = tabs.some((tab) => tab.id === savedTab) ? savedTab : 'chat';
  if (open && !seen.has(active)) setSeen(new Set(seen).add(active));

  const chatVisible = open && active === 'chat';
  useEffect(() => {
    useVttStore.setState((s) => ({
      chatVisible,
      chatUnread: chatVisible ? 0 : s.chatUnread,
    }));
  }, [chatVisible]);

  // Só o pai muda de estilo: o VttShell não re-renderiza.
  const occupied = isDesk ? (open ? prefs.width : STRIP_WIDTH) : 0;
  useEffect(() => {
    rootRef.current?.parentElement?.style.setProperty('--vtt-right', `${occupied}px`);
  }, [occupied]);

  function setOpen(next: boolean) {
    if (isDesk) setPrefs({ ...prefs, open: next });
    else setMobileOpen(next);
  }

  function pick(id: TabId) {
    if (id === 'library') perfPanelOpened('painel da Biblioteca');
    if (open && id === active) {
      setOpen(false);
      return;
    }
    setSavedTab(id);
    setOpen(true);
  }

  // Arrastar a borda: mexe direto no estilo e só grava no fim, sem render por movimento.
  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startWidth: prefs.width, width: prefs.width };
  }
  function moveResize(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const root = rootRef.current;
    if (!drag || !root) return;
    drag.width = clampWidth(drag.startWidth + drag.startX - event.clientX);
    root.style.width = `${drag.width}px`;
    root.parentElement?.style.setProperty('--vtt-right', `${drag.width}px`);
  }
  function endResize() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && drag.width !== prefs.width) setPrefs({ ...prefs, width: drag.width });
  }

  const tabButtons = (vertical: boolean) =>
    tabs.map((tab) => (
      <IconButton
        key={tab.id}
        icon={tab.icon}
        label={tab.label}
        active={open && tab.id === active}
        badge={tab.badge}
        quietBadge={tab.quietBadge}
        // A fileira do topo rola na horizontal: o balão seria cortado.
        tooltip={vertical ? 'left' : 'native'}
        onClick={() => pick(tab.id)}
      />
    ));

  const panels = tabs.map(
    (tab) =>
      seen.has(tab.id) && (
        <div
          key={tab.id}
          className={
            'min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3 ' + (tab.id === active ? 'flex' : 'hidden')
          }
        >
          {tab.content}
        </div>
      )
  );

  const activeLabel = tabs.find((tab) => tab.id === active)?.label;

  return (
    <>
      {/* Fechada: tira fina de ícones na borda direita (no celular, só os ícones). */}
      {!open && (
        <nav
          aria-label="Painéis"
          className={
            'absolute right-0 z-30 flex flex-col items-center gap-0.5 p-1 ' +
            (isDesk
              ? 'inset-y-0 w-12 border-l border-ink-border bg-ink-panel/95'
              : 'top-1/2 -translate-y-1/2 rounded-l-xl border border-r-0 border-ink-border bg-ink/90')
          }
        >
          {isDesk && (
            <IconButton icon={ChevronsLeft} label="Abrir barra lateral" tooltip="left" onClick={() => setOpen(true)} />
          )}
          {tabButtons(true)}
        </nav>
      )}

      {!isDesk && open && (
        <div aria-hidden className="absolute inset-0 z-30 bg-ink/40" onPointerDown={() => setOpen(false)} />
      )}

      <aside
        ref={rootRef}
        aria-label={activeLabel}
        style={isDesk ? { width: prefs.width } : undefined}
        className={
          'absolute inset-y-0 right-0 z-40 flex-col border-l border-ink-border bg-ink-panel shadow-panel ' +
          (isDesk ? '' : 'w-[min(100vw,26rem)] ') +
          (open ? 'flex' : 'hidden')
        }
      >
        {isDesk && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Largura da barra lateral"
            title="Arraste para mudar a largura"
            className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize touch-none hover:bg-crimson/30"
            onPointerDown={startResize}
            onPointerMove={moveResize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
          />
        )}
        <header className="flex shrink-0 items-center gap-0.5 border-b border-ink-border px-1 py-1">
          <nav aria-label="Painéis" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
            {tabButtons(false)}
          </nav>
          <IconButton
            icon={isDesk ? ChevronsRight : X}
            label={isDesk ? 'Recolher barra lateral' : 'Fechar'}
            tooltip="left"
            onClick={() => setOpen(false)}
          />
        </header>
        <h2 className="shrink-0 truncate px-3 pb-1 pt-2 font-display text-lg text-parchment">{activeLabel}</h2>
        {panels}
      </aside>
    </>
  );
}
