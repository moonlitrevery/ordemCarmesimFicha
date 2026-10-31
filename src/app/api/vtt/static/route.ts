import { readFile } from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';
import { getUploadAccess } from '@/lib/vtt/assets/server';
import {
  visibleStaticItems,
  type StaticManifestItem,
} from '@/lib/vtt/assets/static';

export const dynamic = 'force-dynamic';

async function readManifest(): Promise<StaticManifestItem[]> {
  const file = path.join(process.cwd(), 'generated', 'vtt-manifest.json');
  const raw = await readFile(file, 'utf8').catch(() => null);
  if (!raw) return [];
  return (JSON.parse(raw) as { items: StaticManifestItem[] }).items;
}

export async function GET() {
  const access = await getUploadAccess();
  if (!access) {
    return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });
  }

  const items = await readManifest();
  let inUse: string[] = [];
  if (!access.isMestre) {
    // Erro aqui (migração não rodada) só esconde mais: nunca libera.
    const { data } = await access.supabase.rpc('my_scene_static_asset_ids');
    inUse = (data ?? []) as string[];
  }

  return NextResponse.json(
    { items: visibleStaticItems(items, access.isMestre, inUse) },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
