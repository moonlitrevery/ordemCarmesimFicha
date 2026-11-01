import { NextResponse } from 'next/server';
import {
  readManifest,
  readStaticAccess,
} from '@/lib/vtt/assets/manifest.server';

export const dynamic = 'force-dynamic';

/**
 * Fixos só da mestra em uso nas cenas que este usuário vê. Sem cache: muda com a
 * cena, e sem isso um mapa da mestra ficaria em branco para os jogadores.
 */
export async function GET() {
  const access = await readStaticAccess();
  if (!access) {
    return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });
  }
  // A mestra já recebe tudo no catálogo.
  let items: Awaited<ReturnType<typeof readManifest>> = [];
  if (!access.isMestre) {
    // Erro aqui (migração não rodada) só esconde mais: nunca libera.
    const { data } = await access.supabase.rpc('my_scene_static_asset_ids');
    const inUse = new Set((data ?? []) as string[]);
    if (inUse.size > 0) {
      items = (await readManifest()).filter((item) => inUse.has(item.id));
    }
  }
  return NextResponse.json(
    { items },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
