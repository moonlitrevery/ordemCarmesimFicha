'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Eye,
  EyeOff,
  MoreHorizontal,
  Play,
  Square,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  ASSET_DRAG_TYPE,
  ASSET_KIND_LABELS,
  ASSET_KINDS,
  isAudioKind,
  isStaticAsset,
  matchesSearch,
  parseTags,
  PLAYER_KINDS,
  type Asset,
  type AssetKind,
} from '@/lib/vtt/assets/rules';
import { assetsOfKind } from '@/lib/vtt/assets/static';
import { deleteAsset } from '@/lib/vtt/assets/upload';
import { isPlaceableKind } from '@/lib/vtt/scene-rules';
import { useVttStore } from '@/lib/vtt/store';
import { visibleRange } from '@/lib/vtt/virtual-grid';
import { ApprovalPanel } from './ApprovalPanel';
import { AssetThumb } from './AssetThumb';
import { AssetUploader } from './AssetUploader';
import { IconButton } from './hud';

// Alto o bastante para o toque (≥ 44 px) com a miniatura de 40 px.
const ROW_HEIGHT = 52;
const ROW_GAP = 4;

const FIRST_KINDS: AssetKind[] = ['token', 'mapa', 'adereco', 'addon'];
const GM_KINDS: AssetKind[] = [
  ...FIRST_KINDS,
  ...ASSET_KINDS.filter((kind) => !FIRST_KINDS.includes(kind)),
];
/** Jogador vê só o que consegue colocar: mapa entra pela mestra, em Cenas. */
const PLAYER_LIST_KINDS: AssetKind[] = ['token', 'adereco', 'addon'];

function AssetEditor({
  asset,
  onSaved,
  onDeleted,
  onClose,
}: {
  asset: Asset;
  onSaved: (asset: Asset) => void;
  onDeleted: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(asset.name);
  const [tags, setTags] = useState(asset.tags.join(', '));
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    const patch = { name: trimmed, tags: parseTags(tags) };
    const { error: err } = await createClient()
      .from('assets')
      .update(patch)
      .eq('id', asset.id);
    setBusy(false);
    if (err) {
      setError('Não foi possível salvar. Tente de novo.');
      return;
    }
    onSaved({ ...asset, ...patch });
    onClose();
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await deleteAsset(asset.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao apagar.');
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={save}
      className="shrink-0 space-y-2 rounded-md border border-ink-border p-2"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="label min-w-0 truncate">Editar arquivo</h3>
        <IconButton icon={X} label="Fechar" tooltip="native" onClick={onClose} />
      </div>
      <input
        className="field px-2 py-1 text-xs"
        value={name}
        aria-label="Nome"
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="field px-2 py-1 text-xs"
        value={tags}
        aria-label="Tags, separadas por vírgula"
        placeholder="Tags, separadas por vírgula"
        onChange={(e) => setTags(e.target.value)}
      />
      {confirming ? (
        <div className="space-y-2">
          <p className="text-xs text-ink-muted">
            Apagar de vez? Não dá para desfazer, e o arquivo some de todas as cenas
            que o usam.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-ghost min-h-11 px-2 py-1 text-xs desk:min-h-0"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary min-h-11 px-2 py-1 text-xs desk:min-h-0"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? 'Apagando…' : 'Apagar de vez'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-between gap-2">
          <button
            type="button"
            className="btn-ghost min-h-11 px-2 py-1 text-xs text-crimson-soft hover:border-crimson/60 desk:min-h-0"
            onClick={() => setConfirming(true)}
          >
            Apagar
          </button>
          <button
            type="submit"
            className="btn-primary min-h-11 px-2 py-1 text-xs desk:min-h-0"
            disabled={busy || !name.trim()}
          >
            Salvar
          </button>
        </div>
      )}
      {error && <p className="text-xs text-crimson-soft">{error}</p>}
    </form>
  );
}

function AssetRow({
  asset,
  isGm,
  canPlace,
  armed,
  playing,
  managing,
  onPick,
  onTogglePreview,
  onToggleVisibility,
  onManage,
}: {
  asset: Asset;
  isGm: boolean;
  canPlace: boolean;
  armed: boolean;
  playing: boolean;
  managing: boolean;
  onPick: () => void;
  onTogglePreview: () => void;
  onToggleVisibility: () => void;
  onManage: () => void;
}) {
  const fixed = isStaticAsset(asset);
  const visible = asset.visibility === 'jogadores';
  const placeable = canPlace && isPlaceableKind(asset.kind);

  return (
    <li
      className={
        'flex items-center gap-1 rounded-md border pr-1 transition ' +
        (armed ? 'border-crimson bg-crimson/10' : 'border-transparent hover:bg-ink-raised')
      }
      style={{ height: ROW_HEIGHT }}
    >
      <button
        type="button"
        aria-pressed={armed}
        disabled={!placeable}
        draggable={placeable}
        title={
          placeable
            ? `Arraste ${asset.name} para o mapa, ou toque aqui e depois no mapa`
            : asset.name
        }
        onDragStart={(e) =>
          e.dataTransfer.setData(ASSET_DRAG_TYPE, JSON.stringify(asset))
        }
        onClick={onPick}
        className="flex h-full min-w-0 flex-1 items-center gap-2 pl-1 text-left disabled:cursor-default"
      >
        <span className="overflow-hidden rounded">
          <AssetThumb asset={asset} size={40} />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-parchment">
          {asset.name}
        </span>
        {fixed && (
          <span
            title="Arquivo fixo do site: muda só no repositório, não dá para editar nem apagar por aqui"
            className="shrink-0 rounded bg-ink-raised px-1.5 py-0.5 text-[10px] leading-none text-ink-muted"
          >
            fixo
          </span>
        )}
      </button>
      {isAudioKind(asset.kind) && (
        <IconButton
          icon={playing ? Square : Play}
          label={playing ? `Parar ${asset.name}` : `Pré-escutar ${asset.name}`}
          active={playing}
          tooltip="native"
          onClick={onTogglePreview}
        />
      )}
      {isGm &&
        (fixed ? (
          <span
            role="img"
            aria-label={visible ? 'Visível pros jogadores' : 'Só a mestra vê'}
            title={
              visible
                ? 'Visível pros jogadores'
                : 'Só a mestra vê. Para liberar, mova para public/vtt/jogadores/'
            }
            className="flex h-11 w-11 shrink-0 items-center justify-center text-ink-muted desk:h-9 desk:w-9"
          >
            {visible ? <Eye size={16} aria-hidden /> : <EyeOff size={16} aria-hidden />}
          </span>
        ) : (
          <>
            <IconButton
              icon={visible ? Eye : EyeOff}
              label={
                visible
                  ? `${asset.name}: visível pros jogadores. Esconder`
                  : `${asset.name}: só a mestra vê. Mostrar pros jogadores`
              }
              tooltip="native"
              onClick={onToggleVisibility}
            />
            <IconButton
              icon={MoreHorizontal}
              label={`Editar ${asset.name}`}
              active={managing}
              tooltip="native"
              onClick={onManage}
            />
          </>
        ))}
    </li>
  );
}

function AssetList({
  assets,
  renderRow,
}: {
  assets: Asset[];
  renderRow: (asset: Asset) => JSX.Element;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setHeight(element.clientHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const rowHeight = ROW_HEIGHT + ROW_GAP;
  const range = visibleRange({
    scrollTop,
    viewportHeight: height,
    rowHeight,
    columns: 1,
    total: assets.length,
  });

  return (
    <div
      ref={scrollRef}
      className="min-h-[8rem] flex-1 overflow-y-auto"
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div className="relative" style={{ height: range.totalHeight }}>
        <ul
          className="absolute inset-x-0 flex flex-col"
          style={{ top: range.startRow * rowHeight, gap: ROW_GAP }}
        >
          {assets.slice(range.start, range.end).map(renderRow)}
        </ul>
      </div>
    </div>
  );
}

function Approvals() {
  const count = useVttStore((s) => s.pendingAssets.length);
  if (count === 0) return null;
  return (
    <details open className="shrink-0 rounded-md border border-ink-border">
      <summary className="flex min-h-11 cursor-pointer items-center px-2 text-sm text-parchment desk:min-h-8">
        Aprovações ({count})
      </summary>
      <div className="max-h-56 overflow-y-auto p-2 pt-0">
        <ApprovalPanel />
      </div>
    </details>
  );
}

/** O único lugar para ver, colocar e gerenciar arquivos, para todos os papéis. */
export function LibraryPanel({ onArmed }: { onArmed: () => void }) {
  const library = useVttStore((s) => s.library);
  const libraryError = useVttStore((s) => s.libraryError);
  const bumpLibrary = useVttStore((s) => s.bumpLibrary);
  const isGm = useVttStore((s) => s.me?.role === 'mestre');
  const canPlace = useVttStore((s) => s.me?.role !== 'espectador');
  const armedId = useVttStore((s) => s.armedAsset?.id ?? null);

  const kinds = isGm ? GM_KINDS : PLAYER_LIST_KINDS;
  const [kind, setKind] = useState<AssetKind>('token');
  const loading = library === null;
  const error = libraryError?.includes('assets')
    ? 'Tabela de arquivos não encontrada. Rode supabase/migrations/008_vtt_assets.sql no Supabase.'
    : libraryError;
  const assets = useMemo(() => assetsOfKind(library ?? [], kind), [library, kind]);
  const [search, setSearch] = useState('');
  const [managingId, setManagingId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopPreview = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingId(null);
  };

  useEffect(
    () => () => {
      audioRef.current?.pause();
      audioRef.current = null;
    },
    []
  );

  function togglePreview(asset: Asset) {
    const wasPlaying = asset.id === playingId;
    stopPreview();
    if (wasPlaying) return;
    const audio = new Audio(asset.url);
    audio.onended = stopPreview;
    audio.onerror = stopPreview;
    audioRef.current = audio;
    setPlayingId(asset.id);
    void audio.play().catch(stopPreview);
  }

  function changeKind(next: AssetKind) {
    stopPreview();
    setManagingId(null);
    setKind(next);
  }

  function arm(asset: Asset) {
    const armed = asset.id === armedId ? null : asset;
    useVttStore.setState({ armedAsset: armed, tool: 'select' });
    if (armed) onArmed();
  }

  async function toggleVisibility(asset: Asset) {
    const visibility = asset.visibility === 'jogadores' ? 'mestre' : 'jogadores';
    const { error: err } = await createClient()
      .from('assets')
      .update({ visibility })
      .eq('id', asset.id);
    if (err) {
      useVttStore
        .getState()
        .showToast('Não foi possível mudar a visibilidade. Tente de novo.');
      return;
    }
    useVttStore.getState().librarySync?.patch(asset.id, { visibility });
    useVttStore.getState().sync?.notifyAssetResolved();
  }

  const filtered = useMemo(
    () => assets.filter((asset) => matchesSearch(asset, search)),
    [assets, search]
  );
  const managing = assets.find((asset) => asset.id === managingId) ?? null;

  return (
    <AssetUploader
      allowedKinds={isGm ? [...ASSET_KINDS] : PLAYER_KINDS}
      doneMessage={(count) => {
        if (isGm) {
          return count === 1
            ? '1 arquivo na biblioteca.'
            : `${count} arquivos na biblioteca.`;
        }
        return count === 1
          ? 'Enviada! Aguardando aprovação da mestra.'
          : `${count} imagens enviadas. Aguardando aprovação da mestra.`;
      }}
      onUploaded={() => {
        bumpLibrary();
        if (!isGm) useVttStore.getState().sync?.notifyAssetPending();
      }}
    >
      {isGm && <Approvals />}

      <div className="flex shrink-0 flex-wrap gap-1">
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={k === kind}
            onClick={() => changeKind(k)}
            className={
              'min-h-11 rounded-full px-2.5 text-xs transition desk:min-h-0 desk:py-0.5 ' +
              (k === kind
                ? 'bg-crimson/25 text-parchment'
                : 'text-ink-muted hover:bg-ink-raised hover:text-parchment')
            }
          >
            {ASSET_KIND_LABELS[k]}
          </button>
        ))}
      </div>

      <input
        className="field shrink-0 px-2 py-1 text-xs"
        type="search"
        value={search}
        placeholder="Buscar por nome"
        aria-label="Buscar por nome"
        onChange={(e) => setSearch(e.target.value)}
      />

      {kind === 'mapa' && (
        <p className="shrink-0 text-xs text-ink-muted">
          Mapas entram em jogo pelo painel Cenas, da mestra.
        </p>
      )}
      {error && <p className="shrink-0 text-xs text-crimson-soft">{error}</p>}
      {!error && !loading && filtered.length === 0 && (
        <p className="shrink-0 text-sm text-ink-muted">
          {search.trim()
            ? 'Nada encontrado. Tente outro nome.'
            : isGm
              ? 'Nada aqui ainda. Use Enviar arquivos, acima, ou solte os arquivos neste painel.'
              : 'A mestra ainda não liberou nada deste tipo. Você pode enviar uma imagem para ela aprovar.'}
        </p>
      )}

      <AssetList
        assets={filtered}
        renderRow={(asset) => (
          <AssetRow
            key={asset.id}
            asset={asset}
            isGm={isGm}
            canPlace={canPlace}
            armed={asset.id === armedId}
            playing={asset.id === playingId}
            managing={asset.id === managingId}
            onPick={() => arm(asset)}
            onTogglePreview={() => togglePreview(asset)}
            onToggleVisibility={() => void toggleVisibility(asset)}
            onManage={() =>
              setManagingId((current) => (current === asset.id ? null : asset.id))
            }
          />
        )}
      />

      {managing && !isStaticAsset(managing) && (
        <AssetEditor
          key={managing.id}
          asset={managing}
          onClose={() => setManagingId(null)}
          onSaved={(saved) =>
            useVttStore.getState().librarySync?.patch(saved.id, saved)
          }
          onDeleted={() => {
            if (managing.id === playingId) stopPreview();
            setManagingId(null);
            useVttStore.getState().librarySync?.remove(managing.id);
            useVttStore.getState().sync?.notifyAssetDeleted();
          }}
        />
      )}
    </AssetUploader>
  );
}
