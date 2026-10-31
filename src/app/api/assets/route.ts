import { NextResponse } from 'next/server';
import { storage } from '@/lib/storage';
import {
  canRoleUploadKind,
  hasThumb,
  isAssetKind,
  maxBytesForKind,
  sanitizeAssetName,
  THUMB_MAX_BYTES,
  thumbPathPrefix,
  uploadMimesForKind,
} from '@/lib/vtt/assets/rules';
import { getUploadAccess } from '@/lib/vtt/assets/server';

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function positiveOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}

export async function POST(request: Request) {
  const access = await getUploadAccess();
  if (!access) return fail('Sessão expirada.', 401);
  if (!access.canUpload) return fail('Sem permissão para enviar.', 403);
  if (!storage.isConfigured()) {
    return fail('Ligue o Blob store na Vercel — veja LEIA-ME', 503);
  }

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) return fail('Pedido inválido.', 400);

  const { kind, url, thumbUrl, name, width, height, durationS } = body;
  if (!isAssetKind(kind)) return fail('Tipo de arquivo inválido.', 400);
  if (!canRoleUploadKind(access.isMestre, kind)) {
    return fail('Sem permissão para enviar este tipo.', 403);
  }
  if (typeof url !== 'string' || !storage.ownsUrl(url)) {
    return fail('Arquivo fora do storage da mesa.', 400);
  }

  // Tamanho e tipo vêm do próprio storage, nunca do que o cliente declarou.
  const file = await storage.stat(url).catch(() => null);
  if (!file) return fail('Arquivo não encontrado no storage.', 400);

  const mime = file.contentType.split(';')[0].trim();
  if (
    !file.pathname.startsWith(`${kind}/`) ||
    !uploadMimesForKind(kind).includes(mime)
  ) {
    return fail('O arquivo não corresponde ao tipo informado.', 400);
  }
  if (file.size > maxBytesForKind(kind)) {
    return fail('Arquivo maior que o limite permitido.', 413);
  }

  let validThumbUrl: string | null = null;
  if (hasThumb(kind)) {
    if (typeof thumbUrl !== 'string' || !storage.ownsUrl(thumbUrl)) {
      return fail('Miniatura ausente ou fora do storage da mesa.', 400);
    }
    const thumb = await storage.stat(thumbUrl).catch(() => null);
    if (
      !thumb ||
      !thumb.pathname.startsWith(thumbPathPrefix(kind)) ||
      !uploadMimesForKind(kind).includes(thumb.contentType.split(';')[0].trim()) ||
      thumb.size > THUMB_MAX_BYTES
    ) {
      return fail('Miniatura inválida.', 400);
    }
    validThumbUrl = thumbUrl;
  }

  const widthPx = positiveOrNull(width);
  const heightPx = positiveOrNull(height);

  const { data, error } = await access.supabase
    .from('assets')
    .insert({
      kind,
      name: sanitizeAssetName(typeof name === 'string' ? name : ''),
      storage_key: file.pathname,
      url,
      thumb_url: validThumbUrl,
      mime,
      size_bytes: file.size,
      width: widthPx === null ? null : Math.round(widthPx),
      height: heightPx === null ? null : Math.round(heightPx),
      duration_s: positiveOrNull(durationS),
      status: access.isMestre ? 'approved' : 'pending',
      uploaded_by: access.userId,
    })
    .select('*')
    .single();

  if (error) {
    // 23505: esta URL já está registrada
    return error.code === '23505'
      ? fail('Este arquivo já está na biblioteca.', 409)
      : fail('Não foi possível registrar o arquivo. Tente de novo.', 500);
  }

  return NextResponse.json({ asset: data }, { status: 201 });
}
