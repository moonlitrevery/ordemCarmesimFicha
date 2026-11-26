import { NextResponse } from 'next/server';
import { storage, StorageError } from '@/lib/storage';
import {
  canDeleteTableFile,
  COLLECTION_KIND,
  COLLECTION_TABLE,
  isTableFileCollection,
  isUuid,
} from '@/lib/vtt/docs/rules';
import { blobPathname } from '@/lib/vtt/assets/rules';
import { getTableFileAccess } from '@/lib/vtt/docs/server';

export async function DELETE(
  _request: Request,
  { params }: { params: { collection: string; id: string } }
) {
  const { collection, id } = params;
  if (!isTableFileCollection(collection) || !isUuid(id)) {
    return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 });
  }

  const ownerColumn = collection === 'documents' ? 'uploaded_by' : 'author_id';
  const table = COLLECTION_TABLE[collection];

  // Sem mesa ainda: só a leitura diz de qual é. Quem não a vê, recebe 404.
  const session = await getTableFileAccess(null);
  if (!session) {
    return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });
  }
  const { data } = await session.supabase
    .from(table)
    .select(`url, table_id, ${ownerColumn}`)
    .eq('id', id)
    .maybeSingle();
  const row = data as unknown as
    | (Record<string, string | null> & { url: string; table_id: string })
    | null;
  if (!row) {
    return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 });
  }

  const { data: role } = await session.supabase.rpc('table_upload_role', {
    p_table: row.table_id,
  });
  if (!canDeleteTableFile(row[ownerColumn], session.userId, role === 'gm')) {
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
  }
  if (!storage.isConfigured()) {
    return NextResponse.json(
      { error: 'Ligue o Blob store na Vercel — veja LEIA-ME' },
      { status: 503 }
    );
  }

  // O check do banco já prende a URL à pasta; aqui é a segunda trava antes do `del`.
  const ownFile =
    storage.ownsUrl(row.url) &&
    Boolean(blobPathname(row.url)?.startsWith(`${COLLECTION_KIND[collection]}/`));
  if (!ownFile) {
    console.warn('[table-files] URL fora da pasta da coleção; arquivo não apagado', id);
  }

  // Blob primeiro: se falhar, a linha fica e dá para tentar de novo (del é idempotente).
  if (ownFile) {
    try {
      await storage.delete([row.url]);
    } catch (error) {
      console.error('[table-files] falha ao apagar no storage', error);
      return NextResponse.json(
        {
          error:
            error instanceof StorageError
              ? error.message
              : 'Não foi possível apagar o arquivo. Tente de novo.',
        },
        { status: 502 }
      );
    }
  }

  const { error } = await session.supabase.from(table).delete().eq('id', id);
  if (error) {
    console.error('[table-files] falha ao apagar o registro', error);
    return NextResponse.json(
      { error: 'Não foi possível apagar o registro. Tente de novo.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
