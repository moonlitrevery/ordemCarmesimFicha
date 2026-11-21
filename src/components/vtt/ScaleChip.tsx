'use client';

import { Ruler } from 'lucide-react';
import { formatTileScale } from '@/lib/vtt/pages';
import { useVttStore } from '@/lib/vtt/store';
import { FLOATING } from './hud';

const CHIP =
  FLOATING +
  ' absolute bottom-2 right-[calc(var(--vtt-right,0px)_+_0.5rem)] z-10 flex min-h-11 items-center gap-1.5 px-3 text-xs desk:min-h-8 ';

/** Canto inferior direito. Para a mestra, é a porta de entrada da calibração. */
export function ScaleChip() {
  const isGm = useVttStore((s) => s.me?.role === 'mestre');
  const metersPerPx = useVttStore(
    (s) => s.scenes.find((scene) => scene.id === s.viewedSceneId)?.meters_per_px ?? null
  );
  const text = metersPerPx ? formatTileScale(metersPerPx) : 'Régua não calibrada';
  const tone = metersPerPx ? 'text-parchment' : 'text-ink-muted';

  if (!isGm) {
    return (
      <p
        className={CHIP + tone}
        title={
          metersPerPx
            ? 'Escala da régua nesta página'
            : 'A mestra ainda não calibrou a régua desta página'
        }
      >
        <Ruler size={14} aria-hidden />
        {text}
      </p>
    );
  }

  return (
    <button
      type="button"
      title={metersPerPx ? 'Calibrar de novo' : 'Calibrar a régua desta página'}
      className={CHIP + tone + ' hover:text-parchment'}
      onClick={() => useVttStore.getState().startCalibration()}
    >
      <Ruler size={14} aria-hidden />
      {text}
    </button>
  );
}
