'use client';

/**
 * Ouve Ctrl+K / Cmd+K (só a conta de mestra) e carrega a paleta sob demanda:
 * no primeiro carregamento de cada página fica só este ouvinte (Fase 15, item 13).
 * Na Mesa nenhum atalho usa Ctrl+K; o padrão do navegador (focar a busca) é trocado.
 */
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { isCommandShortcut } from '@/lib/command-search';

const CommandPalette = dynamic(() => import('./CommandPalette').then((mod) => mod.CommandPalette), {
  ssr: false,
});

export function CommandPaletteHost({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (!isCommandShortcut(event) || event.repeat) return;
      event.preventDefault();
      setLoaded(true);
      setOpen((value) => !value);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);

  const close = useCallback(() => setOpen(false), []);
  if (!enabled || !loaded) return null;
  return <CommandPalette open={open} onClose={close} />;
}
