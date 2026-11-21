'use client';

import { useCallback, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { isHexColor, PERSONAL_COLORS, userColor } from '@/lib/vtt/scene-rules';
import { useVttStore } from '@/lib/vtt/store';
import { FLOATING, FLOATING_PANEL, IconButton, useDismiss } from './hud';

function ColorPicker() {
  const userId = useVttStore((s) => s.me?.userId) ?? '';
  const color = useVttStore((s) => s.peopleColors[userId]) ?? userColor(userId);
  const sync = useVttStore((s) => s.sync);
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <p>
        Sua cor
        <span className="block text-xs text-ink-muted">
          Do seu ping, régua e avatar. Todos na mesa veem.
        </span>
      </p>
      <div className="grid grid-cols-6 gap-1.5" role="radiogroup" aria-label="Sua cor">
        {PERSONAL_COLORS.map((choice) => (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={choice === color.toLowerCase()}
            aria-label={choice}
            title={choice}
            className={
              'h-11 rounded-md border-2 desk:h-8 ' +
              (choice === color.toLowerCase() ? 'border-parchment' : 'border-ink-border')
            }
            style={{ backgroundColor: choice }}
            onClick={() => {
              setDraft(null);
              void sync?.setMyColor(choice);
            }}
          />
        ))}
      </div>
      <input
        className="field min-h-11 px-2 py-1 text-sm desk:min-h-8"
        aria-label="Cor em hexadecimal"
        placeholder="#c4374a"
        maxLength={7}
        value={draft ?? color}
        onChange={(e) => {
          setDraft(e.target.value);
          if (isHexColor(e.target.value)) {
            void sync?.setMyColor(e.target.value.toLowerCase());
          }
        }}
        onBlur={() => setDraft(null)}
      />
    </div>
  );
}

/** Preferências de quem está usando. Só a cor aparece para os outros. */
export function SettingsMenu() {
  const lightMode = useVttStore((s) => s.lightMode);
  const setLightMode = useVttStore((s) => s.setLightMode);
  const audioPrefs = useVttStore((s) => s.audioPrefs);
  const setAudioPrefs = useVttStore((s) => s.setAudioPrefs);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  return (
    <div ref={ref} className="absolute bottom-2 left-2 z-20">
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
            ' absolute bottom-full left-0 mb-2 max-h-[70vh] w-72 max-w-[calc(100vw-1rem)] space-y-3 overflow-y-auto rounded-xl p-3 text-sm text-parchment'
          }
        >
          <ColorPicker />
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
          <div className="space-y-1">
            <label className="block">
              <span className="flex justify-between">
                Volume
                <span className="text-xs tabular-nums text-ink-muted">{audioPrefs.volume}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                className="block min-h-11 w-full accent-crimson desk:min-h-0"
                aria-label="Seu volume"
                value={audioPrefs.volume}
                onChange={(e) =>
                  setAudioPrefs({ ...audioPrefs, volume: Number(e.target.value) })
                }
              />
            </label>
            <label className="flex min-h-11 items-center gap-2 desk:min-h-0">
              <input
                type="checkbox"
                className="h-4 w-4 accent-crimson"
                checked={audioPrefs.muted}
                onChange={(e) => setAudioPrefs({ ...audioPrefs, muted: e.target.checked })}
              />
              Sem som
            </label>
            <span className="block text-xs text-ink-muted">
              Só neste aparelho. Não muda o som dos outros.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
