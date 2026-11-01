'use client';

import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Upload, X } from 'lucide-react';
import { readImageWidth } from '@/lib/vtt/assets/prepare-image';
import {
  ASSET_KIND_LABELS,
  kindsForMime,
  suggestKind,
  type Asset,
  type AssetKind,
} from '@/lib/vtt/assets/rules';
import {
  checkUploadAvailable,
  uploadAsset,
  type UploadPhase,
} from '@/lib/vtt/assets/upload';

// Duas por vez: comprimir mapa grande em paralelo pesa demais no tablet.
const CONCURRENCY = 2;

type ItemState = 'ready' | UploadPhase | 'error';

interface Item {
  id: string;
  file: File;
  kinds: AssetKind[];
  kind: AssetKind | null;
  state: ItemState;
  progress: number;
  error: string | null;
}

const PHASE_LABELS: Record<UploadPhase, string> = {
  compressing: 'Comprimindo…',
  uploading: 'Enviando…',
  saving: 'Salvando…',
};

/** Arrastar um item da própria lista não é soltar arquivo: só `Files` conta. */
function hasFiles(event: DragEvent): boolean {
  return event.dataTransfer.types.includes('Files');
}

/** O painel inteiro (`children`) aceita soltar arquivos. */
export function AssetUploader({
  allowedKinds,
  preferredKind,
  doneMessage,
  onUploaded,
  children,
}: {
  allowedKinds: AssetKind[];
  /** O filtro aberto vale para o lote: não dá para trocar 30 arquivos um a um. */
  preferredKind?: AssetKind;
  doneMessage: (count: number) => string;
  onUploaded: (asset: Asset) => void;
  children: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function patch(id: string, change: Partial<Item>) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...change } : item))
    );
  }

  async function addFiles(files: File[]) {
    setNotice(null);
    setError(null);
    const added = await Promise.all(
      files.map(async (file): Promise<Item> => {
        const kinds = kindsForMime(file.type).filter((k) =>
          allowedKinds.includes(k)
        );
        const width = file.type.startsWith('image/')
          ? await readImageWidth(file)
          : null;
        const suggested = suggestKind(file.type, width);
        const kind =
          preferredKind && kinds.includes(preferredKind)
            ? preferredKind
            : suggested && kinds.includes(suggested)
              ? suggested
              : (kinds[0] ?? null);
        return {
          id: crypto.randomUUID(),
          file,
          kinds,
          kind,
          state: kind ? 'ready' : 'error',
          progress: 0,
          error: kind ? null : 'Formato não aceito.',
        };
      })
    );
    setItems((prev) => [...prev, ...added]);
  }

  async function sendAll() {
    const queue = items.filter((item) => item.state === 'ready' && item.kind);
    if (!queue.length) return;
    setBusy(true);
    setNotice(null);
    setError(null);

    const unavailable = await checkUploadAvailable();
    if (unavailable) {
      setError(unavailable);
      setBusy(false);
      return;
    }

    let sent = 0;
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const { id } = item;
        try {
          const asset = await uploadAsset(item.file, item.kind as AssetKind, {
            onPhase: (state) => patch(id, { state }),
            onProgress: (progress) => patch(id, { progress }),
          });
          sent += 1;
          setItems((prev) => prev.filter((i) => i.id !== id));
          onUploaded(asset);
        } catch (err) {
          patch(id, {
            state: 'error',
            error: err instanceof Error ? err.message : 'Falha no envio.',
          });
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    setBusy(false);
    if (sent) setNotice(doneMessage(sent));
  }

  function onDrop(e: DragEvent) {
    setDragging(false);
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (!busy) void addFiles(Array.from(e.dataTransfer.files));
  }

  const readyCount = items.filter((item) => item.state === 'ready').length;

  return (
    <div
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setDragging(false);
        }
      }}
      onDrop={onDrop}
      className={
        'flex min-h-0 flex-1 flex-col gap-2 rounded-md ' +
        (dragging ? 'outline outline-2 outline-offset-2 outline-crimson' : '')
      }
    >
      <button
        type="button"
        className="btn-ghost min-h-11 w-full shrink-0 gap-2 px-2 py-1 text-xs desk:min-h-0"
        disabled={busy}
        title="Também dá para soltar os arquivos neste painel"
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={14} aria-hidden />
        Enviar arquivos
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          void addFiles(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />

      {items.length > 0 && (
        <ul className="max-h-48 shrink-0 space-y-2 overflow-y-auto">
          {items.map((item) => (
            <li
              key={item.id}
              className="space-y-1 rounded-md border border-ink-border p-2 text-xs"
            >
              <div className="flex items-center gap-2">
                <span
                  className="min-w-0 flex-1 truncate text-parchment"
                  title={item.file.name}
                >
                  {item.file.name}
                </span>
                {!busy && (
                  <button
                    type="button"
                    className="shrink-0 text-ink-muted hover:text-parchment"
                    aria-label={`Tirar ${item.file.name} da lista`}
                    title="Tirar da lista"
                    onClick={() =>
                      setItems((prev) => prev.filter((i) => i.id !== item.id))
                    }
                  >
                    <X size={14} aria-hidden />
                  </button>
                )}
              </div>
              {item.state === 'ready' && item.kind && (
                <select
                  className="field px-2 py-1 text-xs"
                  value={item.kind}
                  aria-label={`Tipo de ${item.file.name}`}
                  disabled={busy}
                  onChange={(e) =>
                    patch(item.id, { kind: e.target.value as AssetKind })
                  }
                >
                  {item.kinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {ASSET_KIND_LABELS[kind]}
                    </option>
                  ))}
                </select>
              )}
              {item.state !== 'ready' && item.state !== 'error' && (
                <>
                  <p className="text-ink-muted">{PHASE_LABELS[item.state]}</p>
                  <div
                    role="progressbar"
                    aria-valuenow={Math.round(item.progress)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="h-1 overflow-hidden rounded bg-ink-border"
                  >
                    <div
                      className="h-full bg-crimson"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                </>
              )}
              {item.error && <p className="text-crimson-soft">{item.error}</p>}
            </li>
          ))}
        </ul>
      )}

      {readyCount > 0 && (
        <button
          type="button"
          className="btn-primary min-h-11 w-full shrink-0 px-2 py-1 text-sm desk:min-h-0"
          disabled={busy}
          onClick={() => void sendAll()}
        >
          {busy
            ? 'Enviando…'
            : `Enviar ${readyCount} ${readyCount === 1 ? 'arquivo' : 'arquivos'}`}
        </button>
      )}
      {notice && <p className="shrink-0 text-xs text-emerald-400">{notice}</p>}
      {error && <p className="shrink-0 text-xs text-crimson-soft">{error}</p>}

      {children}
    </div>
  );
}
