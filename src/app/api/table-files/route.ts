import { NextResponse } from 'next/server';
import { storage } from '@/lib/storage';
import {
  canUploadToCategory,
  COLLECTION_KIND,
  COLLECTION_TABLE,
  isTableFileCollection,
  isUuid,
  maxBytesForMime,
  sanitizeTitle,
  statusForRole,
  storedMimesFor,
} from '@/lib/vtt/docs/rules';
import { getTableFileAccess } from '@/lib/vtt/docs/server';

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

/** Registra no banco o que o navegador já enviou ao Blob. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) return fail('Pedido inválido.', 400);

  const { collection, tableId, url, title, category, characterId } = body;
  if (!isTableFileCollection(collection)) return fail('Pedido inválido.', 400);

  const access = await getTableFileAccess(tableId);
  if (!access) return fail('Sessão expirada.', 401);
  if (!access.role) return fail('Sem permissão para enviar nesta mesa.', 403);

  const kind = COLLECTION_KIND[collection];
  if (!canUploadToCategory(access.role, kind, category)) {
    return fail('Sem permissão para enviar nesta categoria.', 403);
  }
  if (!storage.isConfigured()) {
    return fail('Ligue o Blob store na Vercel — veja LEIA-ME', 503);
  }
  if (typeof url !== 'string' || !storage.ownsUrl(url)) {
    return fail('Arquivo fora do storage da mesa.', 400);
  }

  // Tamanho e tipo vêm do próprio storage, nunca do que o cliente declarou.
  const file = await storage.stat(url).catch(() => null);
  if (!file) return fail('Arquivo não encontrado no storage.', 400);

  const mime = file.contentType.split(';')[0].trim();
  if (!file.pathname.startsWith(`${kind}/`) || !storedMimesFor(kind).includes(mime)) {
    return fail('O arquivo não corresponde ao tipo informado.', 400);
  }
  if (file.size > maxBytesForMime(mime)) {
    return fail('Arquivo maior que o limite permitido.', 413);
  }
  if (characterId != null && !isUuid(characterId)) {
    return fail('Personagem inválido.', 400);
  }

  const common = {
    table_id: tableId,
    title: sanitizeTitle(typeof title === 'string' ? title : ''),
    storage_key: file.pathname,
    url,
    mime,
    size_bytes: file.size,
  };
  const row: Record<string, unknown> =
    collection === 'documents'
      ? {
          ...common,
          category,
          status: statusForRole(access.role),
          uploaded_by: access.userId,
        }
      : {
          ...common,
          author_id: access.userId,
          character_id: characterId ?? null,
        };

  const { data, error } = await access.supabase
    .from(COLLECTION_TABLE[collection])
    .insert(row)
    .select('*, profiles(display_name)')
    .single();

  if (error) {
    if (error.code === '23505') return fail('Este arquivo já foi registrado.', 409);
    if (error.code === '42501') return fail('Sem permissão para esta ação.', 403);
    return fail('Não foi possível registrar o arquivo. Tente de novo.', 500);
  }

  return NextResponse.json({ file: data }, { status: 201 });
}
