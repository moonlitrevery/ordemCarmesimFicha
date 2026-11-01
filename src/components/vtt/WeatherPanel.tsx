'use client';

import {
  DEFAULT_WEATHER_INTENSITY,
  parseWeather,
  patchWeather,
  WEATHER_LABELS,
  WEATHER_TYPES,
  type WeatherEntry,
  type WeatherType,
} from '@/lib/vtt/fx/rules';
import { useVttStore } from '@/lib/vtt/store';

/** Clima da cena aberta: salvo nela e visto por quem estiver nela. */
export function WeatherPanel() {
  const sync = useVttStore((s) => s.sync);
  const scene = useVttStore((s) => s.scenes.find((item) => item.id === s.viewedSceneId));

  if (!scene) {
    return (
      <p className="text-sm text-ink-muted">
        Nenhuma cena aberta. Crie ou abra uma em Cenas para ligar o clima.
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
        Vale para a cena {scene.name}. Fica salvo nela, e os efeitos se somam.
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
    </div>
  );
}
