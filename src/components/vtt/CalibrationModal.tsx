'use client';

import { useState, type FormEvent } from 'react';
import { parseMeters } from '@/lib/vtt/geometry';
import { useVttStore } from '@/lib/vtt/store';

/** Fim do arraste de "Calibrar régua": quantos metros tem o trecho medido. */
export function CalibrationModal() {
  const pixels = useVttStore((s) => s.calibrationPixels);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  if (pixels === null) return null;

  const close = () => {
    setValue('');
    useVttStore.setState({ calibrationPixels: null });
  };
  const meters = parseMeters(value);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (meters === null || pixels === null) return;
    setBusy(true);
    await useVttStore.getState().sync?.saveCalibration(pixels, meters);
    setBusy(false);
    close();
  }

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <form onSubmit={save} className="panel w-full max-w-xs space-y-3 p-4">
        <h2 className="font-display text-xl text-parchment">Calibrar régua</h2>
        {pixels < 1 ? (
          <p className="text-sm text-ink-muted">
            Arraste sobre um trecho do mapa para medir.
          </p>
        ) : (
          <div>
            <label className="label" htmlFor="calibration-meters">
              Quantos metros tem esse trecho?
            </label>
            <input
              id="calibration-meters"
              className="field"
              inputMode="decimal"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={close}>
            Cancelar
          </button>
          {pixels >= 1 && (
            <button
              type="submit"
              className="btn-primary"
              disabled={busy || meters === null}
            >
              Salvar
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
