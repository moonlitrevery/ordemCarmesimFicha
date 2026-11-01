'use client';

import { useState } from 'react';
import { ASSET_KIND_LABELS } from '@/lib/vtt/assets/rules';
import { deleteAsset } from '@/lib/vtt/assets/upload';
import { useVttStore, type PendingAsset } from '@/lib/vtt/store';
import { AssetThumb } from './AssetThumb';

function PendingRow({
  asset,
  onResolved,
}: {
  asset: PendingAsset;
  onResolved: (approved: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      // A RPC também cria os objetos que o jogador soltou no mapa.
      await useVttStore.getState().sync?.approveAsset(asset.id);
      onResolved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao aprovar.');
      setBusy(false);
    }
  }

  async function reject() {
    setBusy(true);
    setError(null);
    try {
      await deleteAsset(asset.id);
      useVttStore.getState().sync?.notifyAssetResolved();
      onResolved(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao recusar.');
      setBusy(false);
    }
  }

  return (
    <li className="space-y-2 rounded-md border border-ink-border p-2">
      <div className="flex gap-2">
        <div className="shrink-0 overflow-hidden rounded">
          <AssetThumb asset={asset} size={40} />
        </div>
        <div className="min-w-0 flex-1 text-xs">
          <p className="truncate text-sm text-parchment" title={asset.name}>
            {asset.name}
          </p>
          <p className="truncate text-ink-muted">
            {asset.profiles?.display_name ?? 'Jogador'}
          </p>
          <p className="text-ink-muted">{ASSET_KIND_LABELS[asset.kind]}</p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="btn-ghost px-2 py-1 text-xs text-crimson-soft hover:border-crimson/60"
          disabled={busy}
          onClick={() => void reject()}
        >
          Recusar
        </button>
        <button
          type="button"
          className="btn-primary px-2 py-1 text-xs"
          disabled={busy}
          onClick={() => void approve()}
        >
          Aprovar
        </button>
      </div>
      {error && <p className="text-xs text-crimson-soft">{error}</p>}
    </li>
  );
}

export function ApprovalPanel() {
  const pending = useVttStore((s) => s.pendingAssets);
  const setPendingAssets = useVttStore((s) => s.setPendingAssets);
  const bumpLibrary = useVttStore((s) => s.bumpLibrary);

  if (pending.length === 0) {
    return <p className="text-sm text-ink-muted">Nada aguardando aprovação.</p>;
  }

  return (
    <ul className="space-y-2">
      {pending.map((asset) => (
        <PendingRow
          key={asset.id}
          asset={asset}
          onResolved={(approved) => {
            setPendingAssets(
              useVttStore
                .getState()
                .pendingAssets.filter((a) => a.id !== asset.id)
            );
            if (approved) bumpLibrary();
          }}
        />
      ))}
    </ul>
  );
}
