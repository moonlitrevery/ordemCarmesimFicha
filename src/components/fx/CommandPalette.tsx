'use client';

/**
 * Busca rápida da mestra (Fase 15, item 13): Ctrl+K / Cmd+K em qualquer página,
 * inclusive na Mesa. Esc fecha, setas navegam, Enter abre.
 *
 * Origem: kokonutui, "Command Palette" / Action Search Bar
 * (components/kokonutui/action-search-bar.tsx),
 * https://kokonutui.com/docs/navigation/action-search-bar — licença MIT
 * (https://github.com/kokonut-labs/kokonutui/blob/main/LICENSE).
 *
 * Adaptado: uma lista só (sem páginas aninhadas), itens do site (fichas, NPCs,
 * páginas da Mesa, grupos da V.M., Lore e Regras), busca de `command-search.ts`,
 * cores do tema, só `opacity` e `transform`. Carregado por import dinâmico só
 * quando a mestra abre a busca pela primeira vez.
 */
import { AnimatePresence, m } from 'framer-motion';
import { BookOpen, Map as MapIcon, Scale, Search, Skull, UserRound, Users, type LucideIcon } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { MotionProvider } from '@/components/ui/MotionProvider';
import { loadCommandItems } from '@/lib/command-data';
import { COMMAND_KIND_LABEL, searchCommands, type CommandItem, type CommandKind } from '@/lib/command-search';
import { DUR, EASE_ENTER, ENTER, EXIT } from '@/lib/motion-tokens';
import { loadSupabase } from '@/lib/supabase/lazy';
import { OPEN_HUD_EVENT } from '@/lib/vtt/ui-events';
import { UI_KEYS, writePref } from '@/lib/vtt/ui-prefs';
import { useVttStore } from '@/lib/vtt/store';

const KIND_ICON: Record<CommandKind, LucideIcon> = {
  ficha: UserRound,
  npc: Skull,
  pagina: MapIcon,
  grupo: Users,
  lore: BookOpen,
  regras: Scale,
};

/** Abre o item. Página e NPC da Mesa já aberta não recarregam nada. */
function openItem(item: CommandItem, pathname: string, push: (href: string) => void) {
  const inTable = item.tableId && pathname === `/mesa/${item.tableId}`;
  switch (item.kind) {
    case 'ficha':
      return push(`/fichas/${item.id}`);
    case 'lore':
      return push(`/lore/${item.id}`);
    case 'regras':
      return push(`/regras/${item.id}`);
    case 'grupo':
      return push(`/vm?grupo=${encodeURIComponent(item.id)}`);
    case 'pagina':
      // Só a mestra vai: a fita dos jogadores não se mexe.
      if (inTable) useVttStore.setState({ gmSceneChoice: item.id, pagesOpen: false });
      else push(`/mesa/${item.tableId}?pagina=${encodeURIComponent(item.id)}`);
      return;
    case 'npc':
      writePref(UI_KEYS.hud, { open: true, tab: 'npcs' });
      if (inTable) window.dispatchEvent(new CustomEvent(OPEN_HUD_EVENT, { detail: 'npcs' }));
      else push(`/mesa/${item.tableId}`);
      return;
  }
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  // Por cima da Mesa em modo leve: sem movimento, como o resto da Mesa.
  const reduced = useVttStore((s) => pathname.startsWith('/mesa/') && s.lightMode);
  return (
    <MotionProvider full reduced={reduced}>
      <AnimatePresence>{open && <Palette key="palette" onClose={onClose} />}</AnimatePresence>
    </MotionProvider>
  );
}

function Palette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const [items, setItems] = useState<CommandItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    let alive = true;
    const previous = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    void (async () => {
      try {
        const supabase = await loadSupabase();
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user.id;
        if (!userId) throw new Error('sem sessão');
        const list = await loadCommandItems(supabase, userId);
        if (alive) setItems(list);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
      previous?.focus?.();
    };
  }, []);

  const results = useMemo(() => (items ? searchCommands(items, query) : []), [items, query]);
  const current = Math.min(active, Math.max(0, results.length - 1));

  // Esc na captura: não chega aos atalhos da Mesa (limpar seleção, fechar menu).
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  function choose(item: CommandItem | undefined) {
    if (!item) return;
    onClose();
    openItem(item, pathname, (href) => router.push(href));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (results.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current + step + results.length) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(results[current]);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 pt-[12vh]">
      <m.div
        aria-hidden
        className="absolute inset-0 bg-ink/70"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: ENTER }}
        exit={{ opacity: 0, transition: EXIT }}
        onPointerDown={onClose}
      />
      <m.div
        role="dialog"
        aria-modal="true"
        aria-label="Busca rápida"
        className="relative w-full max-w-lg overflow-hidden rounded-xl border border-ink-border bg-ink-panel shadow-panel"
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1, transition: ENTER }}
        exit={{ opacity: 0, y: -6, scale: 0.98, transition: EXIT }}
      >
        <div className="flex items-center gap-2 border-b border-ink-border px-3">
          <Search size={16} aria-hidden className="shrink-0 text-ink-muted" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[current] ? `${listId}-${results[current].key}` : undefined}
            className="min-h-12 min-w-0 flex-1 bg-transparent text-sm text-parchment outline-none placeholder:text-ink-muted"
            placeholder="Fichas, NPCs, páginas da Mesa, grupos, Lore, Regras…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
          <kbd className="hidden shrink-0 rounded border border-ink-border px-1.5 text-[10px] text-ink-muted desk:block">
            Esc
          </kbd>
        </div>
        <ul ref={listRef} id={listId} role="listbox" aria-label="Resultados" className="max-h-[55vh] overflow-y-auto p-1">
          {failed && <li className="px-3 py-4 text-sm text-crimson-soft">Não foi possível carregar. Feche e tente de novo.</li>}
          {!failed && !items && <li className="px-3 py-4 text-sm text-ink-muted">Carregando…</li>}
          {items && results.length === 0 && (
            <li className="px-3 py-4 text-sm text-ink-muted">Nada encontrado para “{query}”.</li>
          )}
          {results.map((item, index) => {
            const Icon = KIND_ICON[item.kind];
            const selected = index === current;
            return (
              <li
                key={item.key}
                id={`${listId}-${item.key}`}
                role="option"
                aria-selected={selected}
                className="relative flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 py-1.5 text-sm"
                onPointerMove={() => setActive(index)}
                onClick={() => choose(item)}
              >
                {selected && (
                  <m.span
                    aria-hidden
                    layoutId="palette-active"
                    transition={{ duration: DUR.fast, ease: EASE_ENTER }}
                    className="pointer-events-none absolute inset-0 rounded-md bg-crimson/20"
                  />
                )}
                <Icon size={16} aria-hidden className="relative shrink-0 text-crimson-soft" />
                <span className="relative min-w-0 flex-1">
                  <span className="block truncate text-parchment">{item.title}</span>
                  {item.subtitle && <span className="block truncate text-xs text-ink-muted">{item.subtitle}</span>}
                </span>
                <span className="relative shrink-0 text-[10px] uppercase tracking-[0.12em] text-ink-muted">
                  {COMMAND_KIND_LABEL[item.kind]}
                </span>
              </li>
            );
          })}
        </ul>
      </m.div>
    </div>
  );
}
