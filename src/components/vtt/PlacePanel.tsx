'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  ASSET_KIND_LABELS,
  matchesSearch,
  type Asset,
  type AssetKind,
} from '@/lib/vtt/assets/rules';
import { useVttStore } from '@/lib/vtt/store';
import { AssetGrid } from './LibraryPanel';

const KINDS: AssetKind[] = ['token', 'addon', 'adereco'];

/**
 * Assets aprovados para colocar no mapa. Com mouse, arrasta; no touch, toca aqui
 * e depois toca no mapa.
 */
export function PlacePanel({ onArmed }: { onArmed: () => void }) {
  const libraryVersion = useVttStore((s) => s.libraryVersion);
  const armedId = useVttStore((s) => s.armedAsset?.id ?? null);
  const [kind, setKind] = useState<AssetKind>('token');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void createClient()
      .from('assets')
      .select('*')
      .eq('kind', kind)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        setError(err ? 'Não foi possível carregar a lista.' : null);
        setAssets((data ?? []) as Asset[]);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, libraryVersion]);

  const filtered = useMemo(
    () => assets.filter((asset) => matchesSearch(asset, search)),
    [assets, search]
  );

  function arm(id: string) {
    const asset = assets.find((a) => a.id === id) ?? null;
    useVttStore.setState({
      armedAsset: asset?.id === armedId ? null : asset,
      tool: 'select',
    });
    if (asset && asset.id !== armedId) onArmed();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <p className="shrink-0 text-xs text-ink-muted">
        Arraste para o mapa, ou toque aqui e depois no mapa. Também dá para soltar
        um arquivo do computador direto no mapa.
      </p>
      <div className="flex shrink-0 gap-1">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={k === kind}
            onClick={() => setKind(k)}
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
      <input
        className="field shrink-0 px-2 py-1 text-xs"
        type="search"
        value={search}
        placeholder="Buscar por nome ou tag"
        aria-label="Buscar por nome ou tag"
        onChange={(e) => setSearch(e.target.value)}
      />
      {error && <p className="text-xs text-crimson-soft">{error}</p>}
      <AssetGrid
        assets={filtered}
        selectedId={armedId}
        playingId={null}
        onSelect={arm}
      />
    </div>
  );
}
