import { NextResponse } from 'next/server';
import { storage } from '@/lib/storage';
import {
  isAssetKind,
  isImageKind,
  THUMB_MAX_BYTES,
  thumbPathPrefix,
  uploadMimesForKind,
} from '@/lib/vtt/assets/rules';
import { getUploadAccess } from '@/lib/vtt/assets/server';

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

/** Asset antigo, sem miniatura: o navegador da mestra gera uma vez e registra aqui. */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const access = await getUploadAccess();
  if (!access) return fail('Sessão expirada.', 401);
  if (!access.isMestre) return fail('Sem permissão.', 403);

  const body = (await request.json().catch(() => null)) as {
    thumbUrl?: unknown;
  } | null;
  const thumbUrl = body?.thumbUrl;
  if (typeof thumbUrl !== 'string' || !storage.ownsUrl(thumbUrl)) {
    return fail('Miniatura fora do storage da mesa.', 400);
  }

  const { data: asset } = await access.supabase
    .from('assets')
    .select('kind, thumb_url')
    .eq('id', params.id)
    .maybeSingle();
  if (!asset) return fail('Arquivo não encontrado.', 404);
  if (!isAssetKind(asset.kind) || !isImageKind(asset.kind)) {
    return fail('Este tipo de arquivo não tem miniatura.', 400);
  }

  const thumb = await storage.stat(thumbUrl).catch(() => null);
  if (
    !thumb ||
    !thumb.pathname.startsWith(thumbPathPrefix(asset.kind)) ||
    !uploadMimesForKind(asset.kind).includes(thumb.contentType.split(';')[0].trim()) ||
    thumb.size > THUMB_MAX_BYTES
  ) {
    return fail('Miniatura inválida.', 400);
  }

  // Só preenche o que está vazio: duas abas não trocam uma pela outra.
  const { data, error } = await access.supabase
    .from('assets')
    .update({ thumb_url: thumbUrl })
    .eq('id', params.id)
    .is('thumb_url', null)
    .select('thumb_url')
    .maybeSingle();
  if (error) return fail('Não foi possível registrar a miniatura.', 500);
  if (!data) {
    await storage.delete([thumbUrl]).catch(() => undefined);
    return NextResponse.json({ thumbUrl: asset.thumb_url });
  }
  return NextResponse.json({ thumbUrl: data.thumb_url });
}
