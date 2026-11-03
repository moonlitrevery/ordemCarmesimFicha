'use client';

import { useState } from 'react';
import {
  Download,
  Eye,
  FileText,
  Image as ImageIcon,
  Music,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import {
  formatFileSize,
  viewerKindForMime,
  type TableFileCollection,
} from '@/lib/vtt/docs/rules';
import { deleteTableFile, downloadTableFile } from '@/lib/vtt/docs/upload';
import { useVttStore } from '@/lib/vtt/store';
import { IconButton } from '../hud';

export interface FileRowItem {
  id: string;
  title: string;
  url: string;
  mime: string;
  size_bytes: number;
}

function iconFor(mime: string): LucideIcon {
  const kind = viewerKindForMime(mime);
  if (kind === 'image') return ImageIcon;
  if (kind === 'audio') return Music;
  return FileText;
}

/** Item de Documentos, Relatórios e da fila: abrir, baixar e apagar são iguais. */
export function FileRow({
  file,
  collection,
  details,
  canDelete,
  actions,
}: {
  file: FileRowItem;
  collection: TableFileCollection;
  details: string;
  canDelete: boolean;
  actions?: React.ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const Icon = iconFor(file.mime);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await deleteTableFile(collection, file.id);
      useVttStore.getState().docSync?.notifyDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao apagar.');
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <li className="rounded-md border border-ink-border p-2">
      <div className="flex items-center gap-2">
        <Icon size={18} className="shrink-0 text-ink-muted" aria-hidden />
        <button
          type="button"
          className="min-h-11 min-w-0 flex-1 text-left desk:min-h-0"
          onClick={() => useVttStore.getState().docSync?.open(file)}
        >
          <span className="block truncate text-sm text-parchment" title={file.title}>
            {file.title}
          </span>
          <span className="block truncate text-xs text-ink-muted">
            {details} · {formatFileSize(file.size_bytes)}
          </span>
        </button>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-end gap-0.5">
        {actions}
        <IconButton
          icon={Eye}
          label="Visualizar"
          tooltip="native"
          onClick={() => useVttStore.getState().docSync?.open(file)}
        />
        <IconButton
          icon={Download}
          label="Baixar"
          tooltip="native"
          onClick={() => void downloadTableFile(file)}
        />
        {canDelete && !confirming && (
          <IconButton
            icon={Trash2}
            label="Apagar"
            tooltip="native"
            danger
            onClick={() => setConfirming(true)}
          />
        )}
        {confirming && (
          <span className="flex items-center gap-1">
            <button
              type="button"
              className="btn-ghost min-h-11 px-2 py-1 text-xs desk:min-h-0"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Manter
            </button>
            <button
              type="button"
              className="btn-ghost min-h-11 px-2 py-1 text-xs text-crimson-soft hover:border-crimson/60 desk:min-h-0"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? 'Apagando…' : 'Apagar'}
            </button>
          </span>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-crimson-soft">{error}</p>}
    </li>
  );
}
