'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Download, X } from 'lucide-react';
import { decodeText, viewerKindForMime } from '@/lib/vtt/docs/rules';
import { downloadTableFile } from '@/lib/vtt/docs/upload';
import { useVttStore } from '@/lib/vtt/store';
import { IconButton } from '../hud';
import { ZoomPan } from './ZoomPan';

// Cada formato pesado num pedaço próprio: abrir uma imagem não baixa o pdf.js.
const Loading = () => <p className="p-4 text-sm text-ink-muted">Carregando…</p>;
const PdfView = dynamic(() => import('./PdfView').then((m) => m.PdfView), {
  ssr: false,
  loading: Loading,
});
const DocxView = dynamic(() => import('./DocxView').then((m) => m.DocxView), {
  ssr: false,
  loading: Loading,
});
const MarkdownView = dynamic(
  () => import('./MarkdownView').then((m) => m.MarkdownView),
  { ssr: false, loading: Loading }
);

function TextFile({ url, markdown }: { url: string; markdown: boolean }) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error('download');
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (!cancelled) setText(decodeText(bytes));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (failed) {
    return (
      <p className="p-4 text-sm text-crimson-soft">
        Não foi possível abrir este arquivo. Use o botão de baixar.
      </p>
    );
  }
  if (text === null) return <Loading />;
  if (markdown) return <MarkdownView text={text} />;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <pre className="mx-auto max-w-3xl whitespace-pre-wrap break-words font-sans text-sm text-parchment">
        {text}
      </pre>
    </div>
  );
}

/** Visualizador único. Abre por clique ou por "Mostrar a todos"; cada um fecha o seu. */
export function DocumentViewer() {
  const target = useVttStore((s) => s.docViewer);

  useEffect(() => {
    if (!target) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') useVttStore.setState({ docViewer: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target]);

  if (!target) return null;
  const kind = viewerKindForMime(target.mime);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={target.title}
      className="absolute inset-0 z-[45] flex flex-col bg-ink/95"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-ink-border px-3 py-1">
        <h2 className="min-w-0 flex-1 truncate font-display text-lg text-parchment">
          {target.title}
        </h2>
        <IconButton
          icon={Download}
          label="Baixar"
          tooltip="native"
          onClick={() => void downloadTableFile(target)}
        />
        <IconButton
          icon={X}
          label="Fechar"
          tooltip="native"
          onClick={() => useVttStore.setState({ docViewer: null })}
        />
      </header>

      <div key={target.id} className="flex min-h-0 flex-1 flex-col">
        {kind === 'image' && (
          <ZoomPan wheel="zoom">
            {(viewport) => (
              // eslint-disable-next-line @next/next/no-img-element -- arquivo do Blob, já reduzido no envio
              <img
                src={target.url}
                alt={target.title}
                draggable={false}
                className="block"
                style={{ maxWidth: viewport.width, maxHeight: viewport.height }}
              />
            )}
          </ZoomPan>
        )}
        {kind === 'pdf' && <PdfView url={target.url} />}
        {kind === 'docx' && <DocxView url={target.url} />}
        {(kind === 'markdown' || kind === 'text') && (
          <TextFile url={target.url} markdown={kind === 'markdown'} />
        )}
        {kind === 'audio' && (
          <div className="flex flex-1 items-center justify-center p-4">
            <audio controls src={target.url} className="w-full max-w-lg" />
          </div>
        )}
        {!kind && (
          <p className="p-4 text-sm text-ink-muted">
            Este formato não abre aqui. Use o botão de baixar.
          </p>
        )}
      </div>
    </div>
  );
}
