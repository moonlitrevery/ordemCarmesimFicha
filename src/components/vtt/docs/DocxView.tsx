'use client';

import { useEffect, useState } from 'react';

/** Só carrega mammoth e DOMPurify ao abrir um .docx. O HTML nunca entra sem sanitizar. */
async function convert(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('download');
  const arrayBuffer = await res.arrayBuffer();
  const [{ default: mammoth }, { default: DOMPurify }] = await Promise.all([
    import('mammoth'),
    import('dompurify'),
  ]);
  const { value } = await mammoth.convertToHtml({ arrayBuffer });
  return DOMPurify.sanitize(value, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button'],
  });
}

export function DocxView({ url }: { url: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    convert(url)
      .then((result) => {
        if (!cancelled) setHtml(result);
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
        Não foi possível abrir este .docx. Use o botão de baixar.
      </p>
    );
  }
  if (html === null) return <p className="p-4 text-sm text-ink-muted">Convertendo…</p>;
  if (!html) return <p className="p-4 text-sm text-ink-muted">O documento está vazio.</p>;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div
        className="prose prose-invert prose-sm mx-auto max-w-3xl break-words"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
