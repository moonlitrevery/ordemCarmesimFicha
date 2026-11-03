import { prepareImageWithin } from '../assets/prepare-image';
import { uploadErrorMessage } from '../assets/rules';
import { checkUploadAvailable, type UploadPhase } from '../assets/upload';
import {
  buildTableFilePathname,
  COLLECTION_KIND,
  DOCUMENT_IMAGE_MAX_SIDE,
  downloadName,
  sourceMimeForFile,
  validateTableFile,
  type DocumentCategory,
  type TableFileCollection,
} from './rules';

export { checkUploadAvailable };
export type { UploadPhase };

export async function uploadTableFile<T>(
  file: File,
  target: {
    collection: TableFileCollection;
    tableId: string;
    title: string;
    category?: DocumentCategory;
    characterId?: string | null;
  },
  options: {
    onPhase?: (phase: UploadPhase) => void;
    onProgress?: (percentage: number) => void;
  } = {}
): Promise<T> {
  const kind = COLLECTION_KIND[target.collection];
  const invalid = validateTableFile(file, kind);
  if (invalid) throw new Error(invalid);

  // A extensão manda: no Windows, `file.type` vem vazio para .md e .m4a.
  const sourceMime = sourceMimeForFile(file.name, kind) as string;
  let body: Blob = new Blob([file], { type: sourceMime });
  if (sourceMime.startsWith('image/')) {
    options.onPhase?.('compressing');
    body = await prepareImageWithin(file, DOCUMENT_IMAGE_MAX_SIDE).catch(() => {
      throw new Error('Não foi possível ler esta imagem.');
    });
  }

  options.onPhase?.('uploading');
  const { upload } = await import('@vercel/blob/client');
  const blob = await upload(
    buildTableFilePathname(kind, crypto.randomUUID(), body.type),
    body,
    {
      access: 'public',
      handleUploadUrl: '/api/upload',
      clientPayload: JSON.stringify({
        kind,
        tableId: target.tableId,
        category: target.category,
        mime: body.type,
      }),
      contentType: body.type,
      onUploadProgress: ({ percentage }) => options.onProgress?.(percentage),
    }
  ).catch((error: unknown) => {
    throw new Error(uploadErrorMessage(error instanceof Error ? error.message : ''));
  });

  options.onPhase?.('saving');
  const res = await fetch('/api/table-files', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...target, url: blob.url }),
  });
  const json = (await res.json().catch(() => ({}))) as { file?: T; error?: string };
  if (!res.ok || !json.file) {
    throw new Error(json.error ?? 'Não foi possível registrar o arquivo.');
  }
  return json.file;
}

/** Apaga do storage e do banco. Já apagado em outra aba conta como sucesso. */
export async function deleteTableFile(
  collection: TableFileCollection,
  id: string
): Promise<void> {
  const res = await fetch(`/api/table-files/${collection}/${id}`, { method: 'DELETE' });
  if (res.ok || res.status === 404) return;
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  throw new Error(json.error ?? 'Não foi possível apagar o arquivo.');
}

/**
 * Baixa com o título como nome. `download` não vale entre origens, então o arquivo
 * passa por um blob local; sem conexão com o Blob, cai no `?download=1` dele.
 */
export async function downloadTableFile(file: {
  url: string;
  title: string;
  mime: string;
}): Promise<void> {
  const link = document.createElement('a');
  let objectUrl: string | null = null;
  try {
    const res = await fetch(file.url);
    if (!res.ok) throw new Error('download');
    objectUrl = URL.createObjectURL(await res.blob());
    link.href = objectUrl;
    link.download = downloadName(file.title, file.mime);
  } catch {
    link.href = `${file.url}?download=1`;
  }
  document.body.append(link);
  link.click();
  link.remove();
  // O navegador já começou a baixar: esperar um pouco evita cortar no Android.
  if (objectUrl) {
    const url = objectUrl;
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
