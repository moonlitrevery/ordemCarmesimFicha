'use client';

import { useState, type FormEvent } from 'react';
import { parseMeters } from '@/lib/vtt/geometry';
import { metersPerPxFromTiles, TILE_METERS } from '@/lib/vtt/pages';
import { useVttStore } from '@/lib/vtt/store';
import { FLOATING_PANEL } from './hud';

const CARD =
  FLOATING_PANEL +
  ' absolute left-1/2 top-32 z-30 w-[min(28rem,calc(100vw-1rem))] -translate-x-1/2 space-y-2 rounded-xl p-3 text-sm text-parchment desk:top-14';

type Unit = 'tiles' | 'meters';

const SMALL = 'min-h-11 px-3 py-1 text-xs desk:min-h-0';

function MetersForm({ pixels }: { pixels: number }) {
  const [value, setValue] = useState('');
  // Padrão da mesa (Dungeon Alchemist): contar quadrados é mais fácil que estimar metros.
  const [unit, setUnit] = useState<Unit>('tiles');
  const [busy, setBusy] = useState(false);
  const amount = parseMeters(value);
  const meters = amount === null ? null : unit === 'tiles' ? amount * TILE_METERS : amount;
  const { cancelCalibration, startCalibration } = useVttStore.getState();

  async function save(event: FormEvent) {
    event.preventDefault();
    if (meters === null) return;
    setBusy(true);
    const saved = await useVttStore.getState().sync?.saveCalibration(pixels, meters);
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
        <strong>2.</strong> Quanto mede o trecho que você arrastou?
      </label>
      <div className="flex gap-2">
        <input
          id="calibration-meters"
          className="field min-w-0 flex-1"
          inputMode="decimal"
          placeholder={unit === 'tiles' ? 'Ex.: 4' : 'Ex.: 1 ou 4,5'}
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <select
          className="field w-36"
          aria-label="Unidade"
          value={unit}
          onChange={(e) => setUnit(e.target.value === 'meters' ? 'meters' : 'tiles')}
        >
          <option value="tiles">quadrados (1,5 m)</option>
          <option value="meters">metros</option>
        </select>
      </div>
      <p className="text-xs text-ink-muted">A escala fica salva no mapa: as próximas páginas com ele já nascem calibradas.</p>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={'btn-ghost ' + SMALL} onClick={cancelCalibration}>
          Cancelar
        </button>
        <button type="button" className={'btn-ghost ' + SMALL} onClick={startCalibration}>
          Medir de novo
        </button>
        <button type="submit" className={'btn-primary ' + SMALL} disabled={busy || meters === null}>
          Salvar
        </button>
      </div>
    </form>
  );
}

/** Caminho mais curto: o Dungeon Alchemist mostra a largura do mapa em quadrados. */
function TilesAcrossForm({ widthPx }: { widthPx: number }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const tiles = parseMeters(value);
  const metersPerPx = tiles === null ? null : metersPerPxFromTiles(tiles, widthPx);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (metersPerPx === null) return;
    setBusy(true);
    const saved = await useVttStore.getState().sync?.saveScale(metersPerPx);
    setBusy(false);
    if (saved) useVttStore.getState().cancelCalibration();
  }

  return (
    <form onSubmit={save} className="space-y-1 border-t border-ink-border pt-2">
      <label className="block text-xs text-ink-muted" htmlFor="calibration-tiles">
        Ou digite a largura do mapa inteiro em quadrados:
      </label>
      <div className="flex gap-2">
        <input
          id="calibration-tiles"
          className="field min-w-0 flex-1"
          inputMode="decimal"
          placeholder="Ex.: 40"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="submit" className={'btn-primary ' + SMALL} disabled={busy || metersPerPx === null}>
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
  const mapWidth = useVttStore((s) => {
    const scene = s.scenes.find((item) => item.id === s.viewedSceneId);
    return scene?.map_asset_id ? (s.sceneAssets[scene.map_asset_id]?.width ?? null) : null;
  });

  if (pixels !== null && pixels >= 1) return <MetersForm pixels={pixels} />;
  if (!calibrating && pixels === null) return null;

  return (
    <div role="status" className={CARD}>
      <p>
        <strong>1.</strong> Arraste sobre algo de tamanho conhecido no mapa: alguns quadrados
        do piso (1 quadrado = 1,5 m), uma porta ≈ 1 m, um carro ≈ 4,5 m.
      </p>
      <p className="text-ink-muted">
        <strong>2.</strong> Diga quanto isso mede.
      </p>
      {pixels !== null && (
        <p className="text-crimson-soft">
          O trecho ficou curto demais. Arraste de novo, de uma ponta à outra.
        </p>
      )}
      {mapWidth ? <TilesAcrossForm widthPx={mapWidth} /> : null}
      <div className="flex justify-end gap-2">
        {pixels !== null && (
          <button
            type="button"
            className={'btn-ghost ' + SMALL}
            onClick={() => useVttStore.getState().startCalibration()}
          >
            Medir de novo
          </button>
        )}
        <button
          type="button"
          className={'btn-ghost ' + SMALL}
          onClick={() => useVttStore.getState().cancelCalibration()}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
