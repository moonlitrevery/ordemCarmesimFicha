'use client';

import { useMemo, useRef, useState, type DragEvent } from 'react';
import { CheckCheck, MonitorUp, Upload } from 'lucide-react';
import {
  DOCUMENT_ACCEPT,
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABELS,
  canDeleteTableFile,
  titleFromFile,
  visibleDocuments,
  type DocumentCategory,
  type TableDocument,
} from '@/lib/vtt/docs/rules';
import {
  checkUploadAvailable,
  uploadTableFile,
  type UploadPhase,
} from '@/lib/vtt/docs/upload';
import { useVttStore } from '@/lib/vtt/store';
import { IconButton } from '../hud';
import { FileRow } from './FileRow';
import { UploadProgress } from './UploadProgress';

interface Sending {
  id: string;
  name: string;
  phase: UploadPhase;
  progress: number;
}

function hasFiles(event: DragEvent): boolean {
  return event.dataTransfer.types.includes('Files');
}

/** Aprovar aqui ou na Biblioteca é a mesma fila. Recusar é apagar. */
export function PendingDocumentRow({ document }: { document: TableDocument }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      await useVttStore.getState().docSync?.approve(document.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao aprovar.');
      setBusy(false);
    }
  }

  return (
    <>
      <FileRow
        file={document}
        collection="documents"
        details={`${document.profiles?.display_name ?? 'Jogador'} · Referência`}
        canDelete
        actions={
          <IconButton
            icon={CheckCheck}
            label="Aprovar"
            tooltip="native"
            disabled={busy}
            onClick={() => void approve()}
          />
        }
      />
      {error && <li className="text-xs text-crimson-soft">{error}</li>}
    </>
  );
}

export function DocumentsPanel() {
  const documents = useVttStore((s) => s.documents);
  const docsError = useVttStore((s) => s.docsError);
  const me = useVttStore((s) => s.me);
  const tableId = useVttStore((s) => s.table?.id ?? null);

  const inputRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<DocumentCategory | null>(null);
  const [sending, setSending] = useState<Sending[]>([]);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isGm = me?.role === 'mestre';
  const canUpload = me?.role === 'mestre' || me?.role === 'jogador';
  const userId = me?.userId ?? null;
  // Sem filtro, o envio da mestra precisa de um destino: Cartas é o mais comum.
  const uploadCategory: DocumentCategory = isGm ? (filter ?? 'carta') : 'referencia';

  const list = useMemo(
    () =>
      visibleDocuments(documents ?? [], filter, userId).filter(
        (document) => !(isGm && document.status === 'pending')
      ),
    [documents, filter, userId, isGm]
  );
  const pending = useMemo(
    () => (isGm ? (documents ?? []).filter((d) => d.status === 'pending') : []),
    [documents, isGm]
  );

  async function send(files: File[]) {
    if (!files.length || !tableId) return;
    setNotice(null);
    setError(null);
    const unavailable = await checkUploadAvailable();
    if (unavailable) {
      setError(unavailable);
      return;
    }

    const failures: string[] = [];
    let sent = 0;
    // Um por vez: comprimir imagem em paralelo pesa no tablet.
    for (const file of files) {
      const id = crypto.randomUUID();
      const patch = (change: Partial<Sending>) =>
        setSending((prev) =>
          prev.map((item) => (item.id === id ? { ...item, ...change } : item))
        );
      setSending((prev) => [
        ...prev,
        { id, name: file.name, phase: 'uploading', progress: 0 },
      ]);
      try {
        await uploadTableFile<TableDocument>(
          file,
          {
            collection: 'documents',
            tableId,
            category: uploadCategory,
            title: titleFromFile(file.name),
          },
          {
            onPhase: (phase) => patch({ phase }),
            onProgress: (progress) => patch({ progress }),
          }
        );
        sent += 1;
      } catch (err) {
        failures.push(
          `${file.name}: ${err instanceof Error ? err.message : 'falha no envio.'}`
        );
      }
      setSending((prev) => prev.filter((item) => item.id !== id));
    }

    if (sent) {
      useVttStore.getState().docSync?.notifyUploaded(!isGm);
      setNotice(
        isGm
          ? `${sent} enviado(s) em ${DOCUMENT_CATEGORY_LABELS[uploadCategory]}.`
          : `${sent} enviado(s). Aparece para a mesa depois que a mestra aprovar.`
      );
    }
    if (failures.length) setError(failures.join(' '));
  }

  return (
    <div
      className={
        'flex min-h-0 flex-1 flex-col gap-2 rounded-md ' +
        (dragging ? 'outline outline-2 outline-offset-2 outline-crimson' : '')
      }
      onDragOver={(event) => {
        if (!canUpload || !hasFiles(event)) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragging(false);
        }
      }}
      onDrop={(event) => {
        setDragging(false);
        if (!canUpload || !hasFiles(event)) return;
        event.preventDefault();
        void send(Array.from(event.dataTransfer.files));
      }}
    >
      <div className="flex shrink-0 flex-wrap gap-1" role="group" aria-label="Categoria">
        <FilterChip label="Todos" active={filter === null} onClick={() => setFilter(null)} />
        {DOCUMENT_CATEGORIES.map((category) => (
          <FilterChip
            key={category}
            label={DOCUMENT_CATEGORY_LABELS[category]}
            active={filter === category}
            onClick={() => setFilter(category)}
          />
        ))}
      </div>

      {canUpload && (
        <>
          <button
            type="button"
            className="btn-ghost min-h-11 w-full shrink-0 gap-2 px-2 py-1 text-xs desk:min-h-0"
            title="Também dá para soltar os arquivos neste painel"
            onClick={() => inputRef.current?.click()}
          >
            <Upload size={14} aria-hidden />
            Enviar em {DOCUMENT_CATEGORY_LABELS[uploadCategory]}
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            accept={DOCUMENT_ACCEPT}
            onChange={(event) => {
              void send(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
          />
        </>
      )}

      {sending.map((item) => (
        <UploadProgress
          key={item.id}
          name={item.name}
          phase={item.phase}
          progress={item.progress}
        />
      ))}
      {notice && <p className="shrink-0 text-xs text-emerald-400">{notice}</p>}
      {error && <p className="shrink-0 text-xs text-crimson-soft">{error}</p>}
      {docsError && <p className="shrink-0 text-xs text-crimson-soft">{docsError}</p>}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {pending.length > 0 && (
          <section className="space-y-1">
            <h3 className="text-xs text-ink-muted">
              Aguardando aprovação ({pending.length})
            </h3>
            <ul className="space-y-2">
              {pending.map((document) => (
                <PendingDocumentRow key={document.id} document={document} />
              ))}
            </ul>
          </section>
        )}

        {documents === null && !docsError && (
          <p className="text-sm text-ink-muted">Carregando…</p>
        )}
        {documents !== null && list.length === 0 && pending.length === 0 && (
          <p className="text-sm text-ink-muted">
            {filter
              ? `Nada em ${DOCUMENT_CATEGORY_LABELS[filter]} ainda.`
              : 'Nenhum documento ainda.'}{' '}
            {isGm
              ? 'Envie PDF, imagem ou áudio pelo botão acima.'
              : canUpload
                ? 'Você pode sugerir uma referência pelo botão acima.'
                : 'Quando a mestra enviar, aparece aqui.'}
          </p>
        )}

        <ul className="space-y-2">
          {list.map((document) => (
            <FileRow
              key={document.id}
              file={document}
              collection="documents"
              details={
                document.status === 'pending'
                  ? 'Aguardando aprovação'
                  : DOCUMENT_CATEGORY_LABELS[document.category]
              }
              canDelete={
                Boolean(userId) &&
                canDeleteTableFile(document.uploaded_by, userId as string, isGm)
              }
              actions={
                isGm && (
                  <IconButton
                    icon={MonitorUp}
                    label="Mostrar a todos"
                    tooltip="native"
                    onClick={() =>
                      void useVttStore.getState().docSync?.showToAll(document)
                    }
                  />
                )
              }
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={
        'min-h-11 rounded-full border px-2.5 py-0.5 text-xs transition desk:min-h-0 ' +
        (active
          ? 'border-crimson/60 bg-crimson/30 text-parchment'
          : 'border-ink-border text-ink-muted hover:text-parchment')
      }
    >
      {label}
    </button>
  );
}
