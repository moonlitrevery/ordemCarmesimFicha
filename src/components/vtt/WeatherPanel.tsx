'use client';

import {
  DEFAULT_WEATHER_INTENSITY,
  LIGHTING_LABELS,
  LIGHTING_PRESETS,
  parseLighting,
  parseWeather,
  patchWeather,
  WEATHER_LABELS,
  WEATHER_TYPES,
  type LightingState,
  type WeatherEntry,
  type WeatherType,
} from '@/lib/vtt/fx/rules';
import { useVttStore } from '@/lib/vtt/store';
import type { VttScene } from '@/lib/vtt/types';

/** Também nas Configurações da página (Fase 12). */
export function LightingSection({ scene }: { scene: VttScene }) {
  const sync = useVttStore((s) => s.sync);
  const lighting = parseLighting(scene.lighting);
  const change = (patch: Partial<LightingState>) =>
    sync?.setLighting(scene.id, { ...lighting, ...patch });

  return (
    <section className="space-y-2 border-t border-ink-border pt-3">
      <h3 className="label">Iluminação</h3>
      <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label="Iluminação">
        <button
          type="button"
          role="radio"
          aria-checked={!lighting.on}
          className={
            'min-h-11 rounded-md border px-2 py-1 text-xs desk:min-h-8 ' +
            (!lighting.on ? 'border-crimson bg-crimson/25' : 'border-ink-border hover:border-crimson/60')
          }
          onClick={() => change({ on: false })}
        >
          Nenhuma
        </button>
        {LIGHTING_PRESETS.map((preset) => {
          const active = lighting.on && lighting.preset === preset;
          return (
            <button
              key={preset}
              type="button"
              role="radio"
              aria-checked={active}
              className={
                'min-h-11 rounded-md border px-2 py-1 text-xs desk:min-h-8 ' +
                (active ? 'border-crimson bg-crimson/25' : 'border-ink-border hover:border-crimson/60')
              }
              onClick={() => change({ on: true, preset })}
            >
              {LIGHTING_LABELS[preset]}
            </button>
          );
        })}
      </div>
      {lighting.preset === 'custom' && (
        <label className="flex min-h-11 items-center gap-2 desk:min-h-0">
          <input
            type="color"
            className="h-8 w-12 shrink-0 cursor-pointer rounded border border-ink-border bg-transparent"
            value={lighting.color}
            onChange={(e) => change({ color: e.target.value })}
          />
          <span className="text-xs text-ink-muted">Cor da iluminação</span>
        </label>
      )}
      <label className="block">
        <span className="flex justify-between text-xs text-ink-muted">
          Intensidade
          <span className="tabular-nums">{lighting.intensity}%</span>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          className="block min-h-11 w-full accent-crimson desk:min-h-0"
          aria-label="Intensidade da iluminação"
          value={lighting.intensity}
          onChange={(e) => change({ intensity: Number(e.target.value) })}
        />
      </label>
    </section>
  );
}

/** Clima e iluminação da cena aberta: salvos nela e vistos por quem estiver nela. */
export function WeatherPanel() {
  const sync = useVttStore((s) => s.sync);
  const scene = useVttStore((s) => s.scenes.find((item) => item.id === s.viewedSceneId));

  if (!scene) {
    return (
      <p className="text-sm text-ink-muted">
        Nenhuma página aberta. Crie ou abra uma em Páginas, abaixo do nome da mesa.
      </p>
    );
  }

  const entries = parseWeather(scene.weather);
  const change = (
    type: WeatherType,
    patch: Partial<Pick<WeatherEntry, 'on' | 'intensity'>>
  ) => sync?.setWeather(scene.id, patchWeather(scene.weather, type, patch));

  return (
    <div className="space-y-4 text-sm text-parchment">
      <p className="text-xs text-ink-muted">
        Vale para a página {scene.name}. Fica salvo nela, e os efeitos se somam.
      </p>
      {WEATHER_TYPES.map((type) => {
        const entry = entries.find((item) => item.type === type);
        const on = entry?.on ?? false;
        const intensity = entry?.intensity ?? DEFAULT_WEATHER_INTENSITY;
        return (
          <div key={type} className="space-y-1">
            <label className="flex min-h-11 items-center gap-2 desk:min-h-0">
              <input
                type="checkbox"
                className="h-4 w-4 accent-crimson"
                checked={on}
                onChange={(e) => change(type, { on: e.target.checked })}
              />
              <span className="flex-1">{WEATHER_LABELS[type]}</span>
              <span className="text-xs tabular-nums text-ink-muted">{intensity}%</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              className="block min-h-11 w-full accent-crimson desk:min-h-0"
              aria-label={`Intensidade: ${WEATHER_LABELS[type]}`}
              value={intensity}
              onChange={(e) => change(type, { intensity: Number(e.target.value) })}
            />
          </div>
        );
      })}
      <LightingSection scene={scene} />
    </div>
  );
}
