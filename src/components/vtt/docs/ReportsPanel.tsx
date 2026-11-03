'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Upload } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  REPORT_ACCEPT,
  canDeleteTableFile,
  titleFromFile,
  validateTableFile,
  type TableReport,
} from '@/lib/vtt/docs/rules';
import {
  checkUploadAvailable,
  uploadTableFile,
  type UploadPhase,
} from '@/lib/vtt/docs/upload';
import { useVttStore } from '@/lib/vtt/store';
import { FileRow } from './FileRow';
import { UploadProgress } from './UploadProgress';

const DATE_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function ReportForm({ tableId, isGm, userId }: {
  tableId: string;
  isGm: boolean;
  userId: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [characterId, setCharacterId] = useState('');
  const [characters, setCharacters] = useState<{ id: string; name: string }[]>([]);
  const [phase, setPhase] = useState<UploadPhase | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let query = createClient().from('characters').select('id, name').order('name');
    // RLS: a mestra lê todas; o jogador pediria só as dele de qualquer forma.
    if (!isGm) query = query.eq('owner_id', userId);
    void query.then(({ data }) => {
      if (!cancelled) setCharacters((data ?? []) as { id: string; name: string }[]);
    });
    return () => {
      cancelled = true;
    };
  }, [isGm, userId]);

  function pick(next: File | null) {
    setError(null);
    if (!next) return;
    const invalid = validateTableFile(next, 'relatorio');
    if (invalid) {
      setError(invalid);
      setFile(null);
      return;
    }
    setFile(next);
    if (!title.trim()) setTitle(titleFromFile(next.name));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setError(null);
    const unavailable = await checkUploadAvailable();
    if (unavailable) {
      setError(unavailable);
      return;
    }
    setProgress(0);
    setPhase('uploading');
    try {
      await uploadTableFile<TableReport>(
        file,
        {
          collection: 'reports',
          tableId,
          title,
          characterId: characterId || null,
        },
        { onPhase: setPhase, onProgress: setProgress }
      );
      setFile(null);
      setTitle('');
      setCharacterId('');
      useVttStore.getState().docSync?.notifyUploaded(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no envio.');
    }
    setPhase(null);
  }

  return (
    <form onSubmit={submit} className="shrink-0 space-y-2">
      <button
        type="button"
        className="btn-ghost min-h-11 w-full gap-2 px-2 py-1 text-xs desk:min-h-0"
        disabled={phase !== null}
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={14} aria-hidden />
        <span className="truncate">{file ? file.name : 'Escolher relatório'}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        hidden
        accept={REPORT_ACCEPT}
        onChange={(event) => {
          pick(event.target.files?.[0] ?? null);
          event.target.value = '';
        }}
      />
      {file && phase === null && (
        <>
          <label className="block">
            <span className="label">Título</span>
            <input
              className="field"
              value={title}
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="label">Personagem (opcional)</span>
            <select
              className="field"
              value={characterId}
              onChange={(event) => setCharacterId(event.target.value)}
            >
              <option value="">Nenhum</option>
              {characters.map((character) => (
                <option key={character.id} value={character.id}>
                  {character.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="btn-primary min-h-11 w-full px-2 py-1 text-sm desk:min-h-0"
          >
            Enviar para a mesa
          </button>
        </>
      )}
      {file && phase && (
        <UploadProgress name={file.name} phase={phase} progress={progress} />
      )}
      {error && <p className="text-xs text-crimson-soft">{error}</p>}
    </form>
  );
}

export function ReportsPanel() {
  const reports = useVttStore((s) => s.reports);
  const docsError = useVttStore((s) => s.docsError);
  const me = useVttStore((s) => s.me);
  const tableId = useVttStore((s) => s.table?.id ?? null);

  const isGm = me?.role === 'mestre';
  const canUpload = isGm || me?.role === 'jogador';

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {canUpload && tableId && me && (
        <ReportForm tableId={tableId} isGm={isGm} userId={me.userId} />
      )}
      {docsError && <p className="shrink-0 text-xs text-crimson-soft">{docsError}</p>}
      {reports === null && !docsError && (
        <p className="text-sm text-ink-muted">Carregando…</p>
      )}
      {reports?.length === 0 && (
        <p className="text-sm text-ink-muted">
          Nenhum relatório ainda.{' '}
          {canUpload
            ? 'Envie um .docx, .pdf, .md ou .txt: todos da mesa leem.'
            : 'Quando alguém enviar, aparece aqui.'}
        </p>
      )}
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {reports?.map((report) => (
          <FileRow
            key={report.id}
            file={report}
            collection="reports"
            details={[
              report.profiles?.display_name ?? 'Jogador',
              report.character_name,
              DATE_FORMAT.format(new Date(report.created_at)),
            ]
              .filter(Boolean)
              .join(' · ')}
            canDelete={
              Boolean(me) && canDeleteTableFile(report.author_id, me?.userId as string, isGm)
            }
          />
        ))}
      </ul>
    </div>
  );
}
