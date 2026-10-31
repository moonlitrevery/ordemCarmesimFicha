'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  ASSET_KINDS,
  ASSET_KIND_LABELS,
  isAudioKind,
  matchesSearch,
  parseTags,
  type Asset,
  type AssetKind,
} from '@/lib/vtt/assets/rules';
import { deleteAsset } from '@/lib/vtt/assets/upload';
import { useVttStore } from '@/lib/vtt/store';
import { visibleRange } from '@/lib/vtt/virtual-grid';
import { AssetThumb } from './AssetThumb';
import { AssetUploader } from './AssetUploader';

const MIN_CELL_WIDTH = 120;
const CELL_GAP = 8;
const CAPTION_HEIGHT = 28;

function AssetEditor({
  asset,
  onSaved,
  onDeleted,
}: {
  asset: Asset;
  onSaved: (asset: Asset) => void;
  onDeleted: () => void;
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
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 text-xs text-ink-muted">
            Apagar de vez?
          </span>
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-xs"
            disabled={busy}
            onClick={() => setConfirming(false)}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary px-2 py-1 text-xs"
            disabled={busy}
            onClick={() => void remove()}
          >
            Apagar
          </button>
        </div>
      ) : (
        <div className="flex justify-between gap-2">
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-xs text-crimson-soft hover:border-crimson/60"
            onClick={() => setConfirming(true)}
          >
            Apagar
          </button>
          <button
            type="submit"
            className="btn-primary px-2 py-1 text-xs"
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

function AssetGrid({
  assets,
  selectedId,
  playingId,
  onSelect,
  onTogglePreview,
}: {
  assets: Asset[];
  selectedId: string | null;
  playingId: string | null;
  onSelect: (id: string) => void;
  onTogglePreview: (asset: Asset) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setSize({ width: element.clientWidth, height: element.clientHeight });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const columns = Math.max(
    1,
    Math.floor((size.width + CELL_GAP) / (MIN_CELL_WIDTH + CELL_GAP))
  );
  const cellWidth = (size.width - CELL_GAP * (columns - 1)) / columns;
  const rowHeight = Math.max(1, cellWidth + CAPTION_HEIGHT + CELL_GAP);
  const range = visibleRange({
    scrollTop,
    viewportHeight: size.height,
    rowHeight,
    columns,
    total: assets.length,
  });

  return (
    <div
      ref={scrollRef}
      className="min-h-[12rem] flex-1 overflow-y-auto"
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div className="relative" style={{ height: range.totalHeight }}>
        <ul
          className="absolute inset-x-0 grid"
          style={{
            top: range.startRow * rowHeight,
            gap: CELL_GAP,
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          }}
        >
          {assets.slice(range.start, range.end).map((asset) => (
            <li key={asset.id} className="relative">
              <button
                type="button"
                aria-pressed={asset.id === selectedId}
                onClick={() => onSelect(asset.id)}
                className={
                  'block w-full overflow-hidden rounded-md border text-left transition ' +
                  (asset.id === selectedId
                    ? 'border-crimson'
                    : 'border-ink-border hover:border-crimson/50')
                }
              >
                <AssetThumb asset={asset} size={cellWidth} />
                <span
                  className="block truncate px-1 text-xs leading-7 text-parchment"
                  title={asset.name}
                >
                  {asset.name}
                </span>
              </button>
              {isAudioKind(asset.kind) && (
                <button
                  type="button"
                  className="btn-ghost absolute right-1 top-1 bg-ink/80 px-2 py-0.5 text-xs"
                  aria-label={
                    asset.id === playingId
                      ? `Parar ${asset.name}`
                      : `Pré-escutar ${asset.name}`
                  }
                  onClick={() => onTogglePreview(asset)}
                >
                  {asset.id === playingId ? '■' : '▶'}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function LibraryPanel() {
  const libraryVersion = useVttStore((s) => s.libraryVersion);
  const bumpLibrary = useVttStore((s) => s.bumpLibrary);

  const [kind, setKind] = useState<AssetKind>('mapa');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void createClient()
      .from('assets')
      .select('*')
      .eq('kind', kind)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        setError(
          err
            ? err.message.includes('assets')
              ? 'Tabela de arquivos não encontrada. Rode supabase/migrations/008_vtt_assets.sql no Supabase.'
              : err.message
            : null
        );
        setAssets((data ?? []) as Asset[]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, libraryVersion]);

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
    setSelectedId(null);
    setKind(next);
  }

  const filtered = useMemo(
    () => assets.filter((asset) => matchesSearch(asset, search)),
    [assets, search]
  );
  const selected = assets.find((asset) => asset.id === selectedId) ?? null;

  return (
    // min-h-0: a altura precisa ser limitada para a grade rolar por dentro; sem
    // isso ela cresce até o conteúdo e a virtualização renderiza tudo.
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap gap-1">
        {ASSET_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={k === kind}
            onClick={() => changeKind(k)}
            className={
              'rounded-md px-2 py-0.5 text-xs transition ' +
              (k === kind
                ? 'bg-crimson/25 text-parchment'
                : 'text-ink-muted hover:bg-ink-raised hover:text-parchment')
            }
          >
            {ASSET_KIND_LABELS[k]}
          </button>
        ))}
      </div>

      <AssetUploader
        allowedKinds={[...ASSET_KINDS]}
        doneMessage={(count) =>
          count === 1 ? '1 arquivo na biblioteca.' : `${count} arquivos na biblioteca.`
        }
        onUploaded={bumpLibrary}
      />

      <input
        className="field shrink-0 px-2 py-1 text-xs"
        type="search"
        value={search}
        placeholder="Buscar por nome ou tag"
        aria-label="Buscar por nome ou tag"
        onChange={(e) => setSearch(e.target.value)}
      />

      {error && <p className="text-xs text-crimson-soft">{error}</p>}
      {!error && !loading && filtered.length === 0 && (
        <p className="text-sm text-ink-muted">
          {search.trim() ? 'Nada encontrado.' : 'Nenhum arquivo aqui ainda.'}
        </p>
      )}

      <AssetGrid
        assets={filtered}
        selectedId={selectedId}
        playingId={playingId}
        onSelect={setSelectedId}
        onTogglePreview={togglePreview}
      />

      {selected && (
        <AssetEditor
          key={selected.id}
          asset={selected}
          onSaved={(saved) =>
            setAssets((prev) =>
              prev.map((asset) => (asset.id === saved.id ? saved : asset))
            )
          }
          onDeleted={() => {
            if (selected.id === playingId) stopPreview();
            setSelectedId(null);
            setAssets((prev) => prev.filter((a) => a.id !== selected.id));
          }}
        />
      )}
    </div>
  );
}
