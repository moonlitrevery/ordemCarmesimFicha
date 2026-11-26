'use client';

import { useEffect, useState } from 'react';
import { LayoutGrid, Theater, X } from 'lucide-react';
import { useVttStore } from '@/lib/vtt/store';
import { oneOf, UI_KEYS, usePref } from '@/lib/vtt/ui-prefs';
import { OPEN_HUD_EVENT } from '@/lib/vtt/ui-events';
import { FLOATING, FLOATING_PANEL, IconButton } from './hud';
import { InitiativePanel } from './InitiativePanel';
import { NpcPanel } from './NpcPanel';
import { SubTabs } from './SubTabs';

const HUD_TABS = ['initiative', 'npcs'] as const;

interface HudPrefs {
  open: boolean;
  tab: (typeof HUD_TABS)[number];
}

const parseTab = oneOf(HUD_TABS);

function parseHud(raw: unknown): HudPrefs {
  const value = (raw ?? {}) as Partial<HudPrefs>;
  return { open: value.open === true, tab: parseTab(value.tab) };
}

/**
 * Botões da mestra logo abaixo do título (HUD e Páginas) e o HUD em si: painel
 * flutuante, não modal, com Iniciativa e NPCs. O mapa continua usável com ele aberto.
 */
export function GmHud() {
  const [prefs, setPrefs] = usePref(UI_KEYS.hud, parseHud);
  const pagesOpen = useVttStore((s) => s.pagesOpen);
  // Só monta os painéis depois da primeira abertura; depois ficam montados.
  const [mounted, setMounted] = useState(false);
  if (prefs.open && !mounted) setMounted(true);

  // Busca rápida (Fase 15) escolheu um NPC desta Mesa: abre o HUD na aba NPCs.
  useEffect(() => {
    const onOpen = (event: Event) => {
      const tab = parseTab((event as CustomEvent<unknown>).detail);
      setPrefs({ open: true, tab });
    };
    window.addEventListener(OPEN_HUD_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_HUD_EVENT, onOpen);
  }, [setPrefs]);

  return (
    <>
      <div className={FLOATING + ' pointer-events-auto flex shrink-0 items-center gap-0.5 p-0.5'}>
        <IconButton
          icon={Theater}
          label="HUD da mestra (Iniciativa e NPCs)"
          active={prefs.open}
          tooltip="right"
          onClick={() => setPrefs({ ...prefs, open: !prefs.open })}
        />
        <button
          type="button"
          aria-pressed={pagesOpen}
          title="Páginas (P)"
          className={
            'flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs desk:min-h-9 ' +
            (pagesOpen
              ? 'bg-crimson/40 text-parchment'
              : 'text-ink-muted hover:bg-ink-raised hover:text-parchment')
          }
          onClick={() => useVttStore.setState({ pagesOpen: !pagesOpen })}
        >
          <LayoutGrid size={18} aria-hidden />
          <span>Páginas</span>
        </button>
      </div>

      <section
        aria-label="HUD da mestra"
        className={
          FLOATING_PANEL +
          ' pointer-events-auto fixed inset-x-0 bottom-0 z-30 h-[60%] flex-col rounded-t-2xl desk:inset-x-auto desk:bottom-auto desk:left-2 desk:top-[6.5rem] desk:h-auto desk:max-h-[calc(100%-8rem)] desk:w-[360px] desk:rounded-xl ' +
          (prefs.open ? 'flex' : 'hidden')
        }
      >
        <header className="flex shrink-0 items-center justify-between gap-2 px-3 pt-1">
          <h2 className="font-display text-lg text-parchment">HUD da mestra</h2>
          <IconButton
            icon={X}
            label="Fechar HUD"
            tooltip="native"
            onClick={() => setPrefs({ ...prefs, open: false })}
          />
        </header>
        {mounted && (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3">
            <SubTabs
              label="HUD da mestra"
              active={prefs.tab}
              onChange={(tab) => setPrefs({ ...prefs, tab })}
              tabs={[
                { id: 'initiative', label: 'Iniciativa', content: <InitiativePanel /> },
                { id: 'npcs', label: 'NPCs', content: <NpcPanel /> },
              ]}
            />
          </div>
        )}
      </section>
    </>
  );
}
