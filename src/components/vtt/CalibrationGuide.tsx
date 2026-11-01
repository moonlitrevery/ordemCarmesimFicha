'use client';

import { useState, type FormEvent } from 'react';
import { parseMeters } from '@/lib/vtt/geometry';
import { useVttStore } from '@/lib/vtt/store';
import { FLOATING_PANEL } from './hud';

const CARD =
  FLOATING_PANEL +
  ' absolute left-1/2 top-32 z-30 w-[min(28rem,calc(100vw-1rem))] -translate-x-1/2 space-y-2 rounded-xl p-3 text-sm text-parchment desk:top-14';

function MetersForm({ pixels }: { pixels: number }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const meters = parseMeters(value);
  const { cancelCalibration, startCalibration } = useVttStore.getState();

  async function save(event: FormEvent) {
    event.preventDefault();
    if (meters === null) return;
    setBusy(true);
    const saved = await useVttStore
      .getState()
      .sync?.saveCalibration(pixels, meters);
    setBusy(false);
    if (saved) cancelCalibration();
  }

  return (
    <form
      onSubmit={save}
      className={CARD}
      onKeyDown={(e) => {
        if (e.key === 'Escape') cancelCalibration();
      }}
    >
      <label className="block" htmlFor="calibration-meters">
        <strong>2.</strong> Quantos metros tem o trecho que você mediu?
      </label>
      <input
        id="calibration-meters"
        className="field"
        inputMode="decimal"
        placeholder="Ex.: 1 ou 4,5"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className="btn-ghost min-h-11 px-3 py-1 text-xs desk:min-h-0"
          onClick={cancelCalibration}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="btn-ghost min-h-11 px-3 py-1 text-xs desk:min-h-0"
          onClick={startCalibration}
        >
          Medir de novo
        </button>
        <button
          type="submit"
          className="btn-primary min-h-11 px-3 py-1 text-xs desk:min-h-0"
          disabled={busy || meters === null}
        >
          Salvar
        </button>
      </div>
    </form>
  );
}

/** Dois passos na tela, sem cobrir o mapa: é nele que a mestra precisa arrastar. */
export function CalibrationGuide() {
  const calibrating = useVttStore((s) => s.calibrating);
  const pixels = useVttStore((s) => s.calibrationPixels);

  if (pixels !== null && pixels >= 1) return <MetersForm pixels={pixels} />;
  if (!calibrating && pixels === null) return null;

  return (
    <div role="status" className={CARD}>
      <p>
        <strong>1.</strong> Arraste sobre algo de tamanho conhecido no mapa (uma
        porta ≈ 1 m, um carro ≈ 4,5 m).
      </p>
      <p className="text-ink-muted">
        <strong>2.</strong> Digite quantos metros isso tem.
      </p>
      {pixels !== null && (
        <p className="text-crimson-soft">
          O trecho ficou curto demais. Arraste de novo, de uma ponta à outra.
        </p>
      )}
      <div className="flex justify-end gap-2">
        {pixels !== null && (
          <button
            type="button"
            className="btn-ghost min-h-11 px-3 py-1 text-xs desk:min-h-0"
            onClick={() => useVttStore.getState().startCalibration()}
          >
            Medir de novo
          </button>
        )}
        <button
          type="button"
          className="btn-ghost min-h-11 px-3 py-1 text-xs desk:min-h-0"
          onClick={() => useVttStore.getState().cancelCalibration()}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
