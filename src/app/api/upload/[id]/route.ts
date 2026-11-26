import { NextResponse } from 'next/server';
import { storage, StorageError } from '@/lib/storage';
import { canDeleteAsset, deletableAssetUrls, type Asset } from '@/lib/vtt/assets/rules';
import { getUploadAccess } from '@/lib/vtt/assets/server';

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const access = await getUploadAccess();
  if (!access) {
    return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });
  }

  const { data } = await access.supabase
    .from('assets')
    .select('kind, url, thumb_url, status, uploaded_by')
    .eq('id', params.id)
    .maybeSingle();
  const asset = data as Pick<
    Asset,
    'kind' | 'url' | 'thumb_url' | 'status' | 'uploaded_by'
  > | null;
  if (!asset) {
    return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 });
  }
  if (!canDeleteAsset(asset, access.userId, access.isMestre)) {
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });
  }
  if (!storage.isConfigured()) {
    return NextResponse.json(
      { error: 'Ligue o Blob store na Vercel — veja LEIA-ME' },
      { status: 503 }
    );
  }

  // Linha apontando para fora da pasta do tipo: some a linha, o arquivo alheio fica.
  const urls = deletableAssetUrls(asset, storage.ownsUrl);
  const expected = asset.thumb_url ? 2 : 1;
  if (urls.length < expected) {
    console.warn('[upload] asset com URL fora da pasta do tipo; arquivo não apagado', params.id);
  }

  // Blob primeiro: se falhar, a linha fica e dá para tentar de novo (del é idempotente).
  if (urls.length > 0) {
    try {
      await storage.delete(urls);
    } catch (error) {
      console.error('[upload] falha ao apagar no storage', error);
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

  const { error } = await access.supabase
    .from('assets')
    .delete()
    .eq('id', params.id);
  if (error) {
    console.error('[upload] falha ao apagar o registro', error);
    return NextResponse.json(
      { error: 'Não foi possível apagar o registro. Tente de novo.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
