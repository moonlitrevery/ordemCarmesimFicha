import { prepareImage } from './prepare-image';
import {
  assetNameFromFile,
  buildAssetPathname,
  buildThumbPathname,
  isAudioKind,
  isImageKind,
  uploadErrorMessage,
  validateSourceFile,
  type Asset,
  type AssetKind,
} from './rules';

export const BLOB_NOT_CONFIGURED_MESSAGE =
  'Ligue o Blob store na Vercel — veja LEIA-ME';

export type UploadPhase = 'compressing' | 'uploading' | 'saving';

interface MediaInfo {
  width: number | null;
  height: number | null;
  durationS: number | null;
}

/** `null` = pode enviar; senão, a mensagem para mostrar. */
export async function checkUploadAvailable(): Promise<string | null> {
  try {
    const res = await fetch('/api/upload');
    const { configured } = (await res.json()) as { configured: boolean };
    return configured ? null : BLOB_NOT_CONFIGURED_MESSAGE;
  } catch {
    return 'Sem conexão com o servidor. Tente de novo.';
  }
}

/** Duração e dimensões vêm dos metadados; falhar aqui não impede o envio. */
function probeMedia(file: File, kind: AssetKind): Promise<MediaInfo> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const element = document.createElement(
      isAudioKind(kind) ? 'audio' : 'video'
    );
    const finish = (info: MediaInfo) => {
      URL.revokeObjectURL(url);
      element.removeAttribute('src');
      resolve(info);
    };
    element.preload = 'metadata';
    element.onloadedmetadata = () =>
      finish({
        width: element instanceof HTMLVideoElement ? element.videoWidth : null,
        height: element instanceof HTMLVideoElement ? element.videoHeight : null,
        durationS: Number.isFinite(element.duration) ? element.duration : null,
      });
    element.onerror = () =>
      finish({ width: null, height: null, durationS: null });
    element.src = url;
  });
}

/** Devolve a URL. Pequena o bastante para não precisar de barra de progresso. */
export async function uploadThumb(kind: AssetKind, thumb: Blob): Promise<string> {
  const { upload } = await import('@vercel/blob/client');
  const uploaded = await upload(
    buildThumbPathname(kind, crypto.randomUUID(), thumb.type),
    thumb,
    {
      access: 'public',
      handleUploadUrl: '/api/upload',
      clientPayload: JSON.stringify({ kind, thumb: true, size: thumb.size }),
      contentType: thumb.type,
    }
  ).catch((error: unknown) => {
    throw new Error(uploadErrorMessage(error instanceof Error ? error.message : ''));
  });
  return uploaded.url;
}

/** Asset antigo: `null` se a mesa recusou. */
export async function registerThumb(
  id: string,
  thumbUrl: string
): Promise<string | null> {
  const res = await fetch(`/api/assets/${id}/thumb`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ thumbUrl }),
  });
  if (!res.ok) return null;
  return ((await res.json()) as { thumbUrl: string | null }).thumbUrl;
}

export async function uploadAsset(
  file: File,
  kind: AssetKind,
  options: {
    onPhase?: (phase: UploadPhase) => void;
    onProgress?: (percentage: number) => void;
  } = {}
): Promise<Asset> {
  const invalid = validateSourceFile(file, kind);
  if (invalid) throw new Error(invalid);

  let body: Blob = file;
  let thumb: Blob | null = null;
  let info: MediaInfo = { width: null, height: null, durationS: null };
  if (isImageKind(kind)) {
    options.onPhase?.('compressing');
    const prepared = await prepareImage(file, kind).catch(() => {
      throw new Error('Não foi possível ler esta imagem.');
    });
    body = prepared.blob;
    thumb = prepared.thumb;
    info = { width: prepared.width, height: prepared.height, durationS: null };
  } else {
    info = await probeMedia(file, kind);
  }

  options.onPhase?.('uploading');
  // Import dinâmico: o cliente do Blob só carrega quando alguém envia algo.
  const { upload } = await import('@vercel/blob/client');
  const toUploadError = (error: unknown) =>
    new Error(uploadErrorMessage(error instanceof Error ? error.message : ''));

  // Miniatura primeiro: é pequena, e a barra de progresso fica só para o arquivo cheio.
  const thumbUrl = thumb ? await uploadThumb(kind, thumb) : null;

  const blob = await upload(
    buildAssetPathname(kind, crypto.randomUUID(), body.type),
    body,
    {
      access: 'public',
      handleUploadUrl: '/api/upload',
      clientPayload: JSON.stringify({ kind, size: body.size }),
      contentType: body.type,
      onUploadProgress: ({ percentage }) => options.onProgress?.(percentage),
    }
  ).catch((error: unknown) => {
    throw toUploadError(error);
  });

  options.onPhase?.('saving');
  const res = await fetch('/api/assets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kind,
      url: blob.url,
      thumbUrl,
      name: assetNameFromFile(file.name),
      ...info,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    asset?: Asset;
    error?: string;
  };
  if (!res.ok || !json.asset) {
    throw new Error(json.error ?? 'Não foi possível registrar o arquivo.');
  }
  return json.asset;
}

/** Apaga do storage e do banco. Já apagado em outra aba conta como sucesso. */
export async function deleteAsset(id: string): Promise<void> {
  const res = await fetch(`/api/upload/${id}`, { method: 'DELETE' });
  if (res.ok || res.status === 404) return;
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  throw new Error(json.error ?? 'Não foi possível apagar o arquivo.');
}
