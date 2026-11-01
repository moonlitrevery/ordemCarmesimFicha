'use client';

import { useCallback, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useVttStore } from '@/lib/vtt/store';
import { FLOATING, FLOATING_PANEL, IconButton, useDismiss } from './hud';

/** Preferências de quem está usando; não mudam nada para os outros. */
export function SettingsMenu() {
  const lightMode = useVttStore((s) => s.lightMode);
  const setLightMode = useVttStore((s) => s.setLightMode);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  return (
    <div ref={ref} className="absolute bottom-16 left-2 z-20 desk:bottom-2">
      <div className={FLOATING + ' p-0.5'}>
        <IconButton
          icon={MoreHorizontal}
          label="Configurações"
          active={open}
          tooltip="right"
          onClick={() => setOpen((value) => !value)}
        />
      </div>
      {open && (
        <div
          className={
            FLOATING_PANEL +
            ' absolute bottom-full left-0 mb-2 w-64 space-y-3 rounded-xl p-3 text-sm text-parchment'
          }
        >
          <label className="flex min-h-11 items-start gap-2 desk:min-h-0">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-crimson"
              checked={lightMode}
              onChange={(e) => setLightMode(e.target.checked)}
            />
            <span>
              Modo leve
              <span className="block text-xs text-ink-muted">
                Menos efeitos e resolução menor. Use se o mapa estiver travando.
              </span>
            </span>
          </label>
          <label className="block text-ink-muted" title="Chega na fase 7">
            Volume
            <input
              type="range"
              disabled
              className="mt-1 block w-full cursor-not-allowed"
              aria-label="Volume (chega na fase 7)"
            />
            <span className="text-xs">Chega junto com o som, na fase 7.</span>
          </label>
        </div>
      )}
    </div>
  );
}
