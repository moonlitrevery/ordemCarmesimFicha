'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pdfRenderScale } from '@/lib/vtt/docs/rules';
import { useVttStore } from '@/lib/vtt/store';
import { IconButton } from '../hud';
import { ZoomPan } from './ZoomPan';

/** Um canvas só: 12 MP em RGBA são 48 MB, e o modo leve fica com menos da metade. */
const MAX_PIXELS = 12_000_000;
const MAX_PIXELS_LIGHT = 5_000_000;

/** Só a página aberta existe em canvas. Trocar de página destrói a anterior. */
function PdfPage({
  pdf,
  number,
  width,
}: {
  pdf: PDFDocumentProxy;
  number: number;
  width: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lightMode = useVttStore((s) => s.lightMode);
  const [height, setHeight] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let cancelRender: (() => void) | null = null;
    let release: (() => void) | null = null;

    void (async () => {
      const page = await pdf.getPage(number);
      release = () => page.cleanup();
      if (cancelled) {
        release();
        return;
      }
      const base = page.getViewport({ scale: 1 });
      const fit = width / base.width;
      const scale = pdfRenderScale(
        fit,
        window.devicePixelRatio || 1,
        base.width,
        base.height,
        lightMode ? MAX_PIXELS_LIGHT : MAX_PIXELS
      );
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      setHeight(base.height * fit);
      const task = page.render({ canvasContext: context, viewport });
      cancelRender = () => task.cancel();
      await task.promise;
    })().catch((error: unknown) => {
      // Cancelar o desenho também rejeita, e não é erro.
      if (!cancelled && (error as { name?: string })?.name !== 'RenderingCancelledException') {
        setFailed(true);
      }
    });

    return () => {
      cancelled = true;
      cancelRender?.();
      release?.();
    };
  }, [pdf, number, width, lightMode]);

  if (failed) {
    return (
      <p className="p-4 text-sm text-crimson-soft" style={{ width }}>
        Não foi possível desenhar esta página.
      </p>
    );
  }
  return (
    <canvas
      ref={canvasRef}
      className="block bg-white"
      style={{ width, height: height ?? width * 1.414 }}
    />
  );
}

export function PdfView({ url }: { url: string }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | null = null;

    void (async () => {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      // Copiado por scripts/copy-pdf-worker.mjs: o webpack não consegue empacotar.
      pdfjs.GlobalWorkerOptions.workerSrc = `/pdfjs/pdf.worker-${pdfjs.version}.min.mjs`;
      if (cancelled) return;
      const task = pdfjs.getDocument({
        url,
        // PDF vem de quem envia: nada de avaliar código, nem baixar o que não abriu.
        isEvalSupported: false,
        disableAutoFetch: true,
        disableStream: true,
      });
      destroy = () => void task.destroy();
      const loaded = await task.promise;
      if (!cancelled) setPdf(loaded);
    })().catch(() => {
      if (!cancelled) setFailed(true);
    });

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [url]);

  useEffect(() => {
    if (!pdf) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') setPage((p) => Math.max(1, p - 1));
      if (event.key === 'ArrowRight') setPage((p) => Math.min(pdf.numPages, p + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pdf]);

  if (failed) {
    return (
      <p className="p-4 text-sm text-crimson-soft">
        Não foi possível abrir este PDF. Use o botão de baixar.
      </p>
    );
  }
  if (!pdf) return <p className="p-4 text-sm text-ink-muted">Carregando PDF…</p>;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ZoomPan key={page} wheel="pan">
        {(viewport) => <PdfPage pdf={pdf} number={page} width={viewport.width} />}
      </ZoomPan>
      <div className="flex shrink-0 items-center justify-center gap-2 border-t border-ink-border py-1 text-xs text-ink-muted">
        <IconButton
          icon={ChevronLeft}
          label="Página anterior"
          tooltip="native"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        />
        <span aria-live="polite">
          Página {page} de {pdf.numPages}
        </span>
        <IconButton
          icon={ChevronRight}
          label="Próxima página"
          tooltip="native"
          disabled={page >= pdf.numPages}
          onClick={() => setPage(page + 1)}
        />
      </div>
    </div>
  );
}
