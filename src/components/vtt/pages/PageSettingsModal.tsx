'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { Asset } from '@/lib/vtt/assets/rules';
import { fogDims } from '@/lib/vtt/fog/mask';
import { formatScale, parseMeters } from '@/lib/vtt/geometry';
import { formatTileScale, MAX_PAGE_NAME, metersPerPxFromTiles, TILE_METERS } from '@/lib/vtt/pages';
import {
  parseSceneTransition,
  SCENE_TRANSITION_LABELS,
  SCENE_TRANSITIONS,
} from '@/lib/vtt/scene-transition';
import { useVttStore } from '@/lib/vtt/store';
import type { VttScene } from '@/lib/vtt/types';
import { AssetThumb } from '../AssetThumb';
import { ConfirmDialog } from '../ConfirmDialog';
import { LightingSection } from '../WeatherPanel';
import { MapPickerGrid } from './MapPickerGrid';
import { FolderSelect, PageModal } from './PageModal';

const SMALL_BUTTON = 'btn-ghost min-h-11 px-2 py-1 text-xs desk:min-h-0';

function NameAndFolder({ scene, folders }: { scene: VttScene; folders: string[] }) {
  const sync = useVttStore((s) => s.sync);
  const [name, setName] = useState(scene.name);
  const [folder, setFolder] = useState(scene.folder);
  const [busy, setBusy] = useState(false);
  const changed = name.trim() !== scene.name || folder !== scene.folder;

  async function save(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !sync) return;
    setBusy(true);
    await sync.updateScene(scene.id, { name: trimmed, folder });
    setBusy(false);
  }

  return (
    <form onSubmit={save} className="grid gap-2 desk:grid-cols-[1fr_12rem_auto] desk:items-end">
      <label className="block space-y-1">
        <span className="label">Nome</span>
        <input
          className="field min-h-11 px-2 py-1 text-sm desk:min-h-8"
          maxLength={MAX_PAGE_NAME}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="block space-y-1" htmlFor="page-settings-folder">
        <span className="label">Pasta</span>
        <FolderSelect id="page-settings-folder" folders={folders} value={folder} onChange={setFolder} />
      </label>
      <button
        type="submit"
        className="btn-primary min-h-11 px-3 py-1 text-xs desk:min-h-8"
        disabled={busy || !changed || !name.trim()}
      >
        Salvar
      </button>
    </form>
  );
}

function MapSection({
  scene,
  maps,
  loadingMaps,
}: {
  scene: VttScene;
  maps: Asset[];
  loadingMaps: boolean;
}) {
  const sync = useVttStore((s) => s.sync);
  const [picking, setPicking] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const map = maps.find((asset) => asset.id === scene.map_asset_id) ?? null;

  return (
    <section className="space-y-2 border-t border-ink-border pt-3">
      <h3 className="label">Mapa</h3>
      <div className="flex items-center gap-3">
        {map ? (
          <AssetThumb asset={map} size={64} />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded bg-ink-raised text-[10px] text-ink-muted">
            {scene.map_asset_id ? '…' : 'Em branco'}
          </span>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-sm">{map?.name ?? (scene.map_asset_id ? 'Mapa' : 'Sem mapa')}</p>
          <p className="text-xs text-ink-muted">
            O mapa fica travado no fundo: nem a mestra o arrasta. Troque por aqui.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        <button type="button" className={SMALL_BUTTON} onClick={() => setPicking((value) => !value)}>
          {picking ? 'Fechar lista' : scene.map_asset_id ? 'Trocar mapa' : 'Escolher mapa'}
        </button>
        {scene.map_asset_id && (
          <button
            type="button"
            className={SMALL_BUTTON + ' text-crimson-soft'}
            onClick={() => setConfirmRemove(true)}
          >
            Remover mapa
          </button>
        )}
      </div>
      {picking && (
        <MapPickerGrid
          maps={maps}
          loading={loadingMaps}
          value={scene.map_asset_id}
          onChange={(asset) => {
            setPicking(false);
            // A escala vem do mapa novo (calibração salva nele ou do gerador).
            void sync?.changeMap(scene.id, asset.id);
          }}
        />
      )}
      {confirmRemove && (
        <ConfirmDialog
          title="Remover o mapa?"
          confirmLabel="Remover"
          danger
          onCancel={() => setConfirmRemove(false)}
          onConfirm={() => {
            setConfirmRemove(false);
            void sync?.removeMap(scene.id);
          }}
        >
          A página fica em branco. Tokens, desenhos e adereços continuam.
        </ConfirmDialog>
      )}
    </section>
  );
}

function ScaleSection({
  scene,
  map,
  onMeasure,
}: {
  scene: VttScene;
  map: Asset | null;
  onMeasure: () => void;
}) {
  const sync = useVttStore((s) => s.sync);
  const [tiles, setTiles] = useState('');
  const [busy, setBusy] = useState(false);
  const width = map?.width ?? null;
  const tilesValue = parseMeters(tiles);
  const proposed = tilesValue && width ? metersPerPxFromTiles(tilesValue, width) : null;

  async function saveTiles(event: FormEvent) {
    event.preventDefault();
    if (!proposed || !sync) return;
    setBusy(true);
    const saved = await sync.saveScale(proposed, scene.id);
    setBusy(false);
    if (saved) setTiles('');
  }

  return (
    <section className="space-y-2 border-t border-ink-border pt-3">
      <h3 className="label">Escala e grade</h3>
      <p className="text-xs">
        {scene.meters_per_px ? (
          <>
            {formatTileScale(scene.meters_per_px)}{' '}
            <span className="text-ink-muted">({formatScale(scene.meters_per_px)})</span>
          </>
        ) : (
          <span className="text-ink-muted">Régua não calibrada.</span>
        )}
      </p>
      {scene.map_asset_id && (
        <form onSubmit={saveTiles} className="flex flex-wrap items-end gap-2">
          <label className="block min-w-0 flex-1 space-y-1">
            <span className="text-xs text-ink-muted">
              Largura do mapa em quadrados (o Dungeon Alchemist mostra esse número)
            </span>
            <input
              className="field min-h-11 px-2 py-1 text-sm desk:min-h-8"
              inputMode="decimal"
              placeholder="Ex.: 40"
              disabled={!width}
              value={tiles}
              onChange={(e) => setTiles(e.target.value)}
            />
          </label>
          <button
            type="submit"
            className="btn-primary min-h-11 px-3 py-1 text-xs desk:min-h-8"
            disabled={busy || !proposed}
          >
            Salvar escala
          </button>
          <button type="button" className={SMALL_BUTTON} onClick={onMeasure}>
            Medir no mapa
          </button>
        </form>
      )}
      {scene.map_asset_id && (
        <p className="text-xs text-ink-muted">
          A escala fica salva no mapa: toda página nova com ele já nasce calibrada. 1 quadrado ={' '}
          {String(TILE_METERS).replace('.', ',')} m.
        </p>
      )}
      <label className="flex min-h-11 items-center gap-2 text-sm desk:min-h-0">
        <input
          type="checkbox"
          className="h-4 w-4 accent-crimson"
          checked={scene.grid_visible}
          disabled={!scene.meters_per_px}
          onChange={(e) => void sync?.setGridVisible(scene.id, e.target.checked)}
        />
        <span>Grade visível</span>
        {!scene.meters_per_px && <span className="text-xs text-ink-muted">(calibre a régua antes)</span>}
      </label>
    </section>
  );
}

/** Página em branco: o fundo neutro tem 2000 px (`EMPTY_MAP_SIZE` do canvas). */
const BLANK_PAGE_PX = 2000;

/**
 * Névoa de guerra (Fase 11), por página. Ligar começa toda coberta; desligar apaga
 * o que foi revelado (pede confirmação). Página nova nasce sem névoa.
 */
function FogSection({ scene, map }: { scene: VttScene; map: Asset | null }) {
  const fogSync = useVttStore((s) => s.fogSync);
  // A página aberta já tem a resposta no store; as outras perguntam ao banco.
  const viewedOn = useVttStore((s) => (s.fogSync?.sceneId === scene.id ? s.fogOn : null));
  const [fetched, setFetched] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const enabled = viewedOn ?? fetched;

  useEffect(() => {
    if (!fogSync || viewedOn !== null) return;
    let cancelled = false;
    void fogSync.isEnabled(scene.id).then((on) => {
      if (!cancelled) setFetched(on);
    });
    return () => {
      cancelled = true;
    };
  }, [fogSync, scene.id, viewedOn]);

  async function setEnabled(on: boolean) {
    if (!fogSync) return;
    const loaded = scene.map_asset_id ? useVttStore.getState().sceneAssets[scene.map_asset_id] : undefined;
    const width = map?.width ?? loaded?.width ?? BLANK_PAGE_PX;
    const height = map?.height ?? loaded?.height ?? BLANK_PAGE_PX;
    setBusy(true);
    const saved = await fogSync.setEnabled(scene.id, on, fogDims(width, height));
    setBusy(false);
    if (saved) setFetched(on);
  }

  return (
    <section className="space-y-1 border-t border-ink-border pt-3">
      <h3 className="label">Névoa de guerra</h3>
      <label className="flex min-h-11 items-center gap-2 text-sm desk:min-h-0">
        <input
          type="checkbox"
          className="h-4 w-4 accent-crimson"
          checked={enabled === true}
          disabled={busy || enabled === null}
          onChange={(e) => {
            if (e.target.checked) void setEnabled(true);
            else setConfirmOff(true);
          }}
        />
        <span>Névoa de guerra</span>
        {enabled === null && <span className="text-xs text-ink-muted">(carregando…)</span>}
      </label>
      <p className="text-xs text-ink-muted">
        Ao ligar, a página começa toda coberta. Revele com as ferramentas do grupo Névoa, na barra do topo, com a
        página aberta. Os jogadores veem preto onde está coberto; você vê a névoa a meia opacidade.
      </p>
      {confirmOff && (
        <ConfirmDialog
          title="Desligar a névoa?"
          confirmLabel="Desligar"
          danger
          onCancel={() => setConfirmOff(false)}
          onConfirm={() => {
            setConfirmOff(false);
            void setEnabled(false);
          }}
        >
          Os jogadores passam a ver o mapa todo, e o que foi revelado se perde: ao ligar de novo, a página começa
          toda coberta.
        </ConfirmDialog>
      )}
    </section>
  );
}

/** Da mesa inteira: o jogador escolhe a cobertura antes de poder ler a página nova. */
function TransitionPicker() {
  const sync = useVttStore((s) => s.sync);
  const style = useVttStore((s) => parseSceneTransition(s.table?.scene_transition));
  return (
    <section className="space-y-1 border-t border-ink-border pt-3">
      <label className="block space-y-1">
        <span className="label">Transição ao entrar</span>
        <select
          className="field min-h-11 px-2 py-1 text-xs desk:min-h-8"
          value={style}
          onChange={(e) => void sync?.setSceneTransition(parseSceneTransition(e.target.value))}
        >
          {SCENE_TRANSITIONS.map((option) => (
            <option key={option} value={option}>
              {SCENE_TRANSITION_LABELS[option]}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-ink-muted">Vale para todas as páginas desta mesa.</p>
    </section>
  );
}

/** Engrenagem do card: tudo o que é da página num lugar só. */
export function PageSettingsModal({
  sceneId,
  maps,
  loadingMaps,
  folders,
  onClose,
  onMeasure,
}: {
  sceneId: string;
  maps: Asset[];
  loadingMaps: boolean;
  folders: string[];
  onClose: () => void;
  onMeasure: (sceneId: string) => void;
}) {
  const scene = useVttStore((s) => s.scenes.find((item) => item.id === sceneId));
  if (!scene) return null;
  const map = maps.find((asset) => asset.id === scene.map_asset_id) ?? null;

  return (
    <PageModal title={`Configurações: ${scene.name}`} onClose={onClose} wide>
      <div className="max-h-[calc(100vh-10rem)] space-y-3 overflow-y-auto pr-1">
        <NameAndFolder key={scene.id + scene.name + scene.folder} scene={scene} folders={folders} />
        <MapSection scene={scene} maps={maps} loadingMaps={loadingMaps} />
        <ScaleSection scene={scene} map={map} onMeasure={() => onMeasure(scene.id)} />
        <LightingSection scene={scene} />
        <FogSection key={scene.id} scene={scene} map={map} />
        <section className="space-y-1 border-t border-ink-border pt-3">
          <h3 className="label">Som ambiente</h3>
          <p className="text-xs text-ink-muted">
            As camadas de som ficam salvas na página e tocam para quem estiver nela. Abra a
            página e monte o ambiente na aba Som e efeitos, na barra da direita.
          </p>
        </section>
        <TransitionPicker />
      </div>
    </PageModal>
  );
}
