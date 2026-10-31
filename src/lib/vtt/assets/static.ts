import type { SupabaseClient } from '@supabase/supabase-js';
import type { Asset, AssetKind, AssetVisibility } from './rules';

const STATIC_LIST_URL = '/api/vtt/static';

/** Uma linha do manifest gerado por scripts/vtt-manifest.mjs. */
export interface StaticManifestItem {
  id: string;
  kind: AssetKind;
  name: string;
  visibility: AssetVisibility;
  path: string;
  thumb: string | null;
  mime: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration_s: number | null;
}

export function staticItemToAsset(item: StaticManifestItem): Asset {
  return {
    id: item.id,
    kind: item.kind,
    name: item.name,
    storage_key: item.path,
    url: item.path,
    thumb_url: item.thumb,
    mime: item.mime,
    size_bytes: item.size_bytes,
    width: item.width,
    height: item.height,
    duration_s: item.duration_s,
    tags: [],
    status: 'approved',
    visibility: item.visibility,
    uploaded_by: null,
    created_at: '1970-01-01T00:00:00.000Z',
  };
}

/** Jogador vê o que foi liberado e o que a mestra pôs numa cena que ele vê. */
export function visibleStaticItems(
  items: StaticManifestItem[],
  isMestre: boolean,
  inUseIds: string[]
): StaticManifestItem[] {
  if (isMestre) return items;
  const inUse = new Set(inUseIds);
  return items.filter(
    (item) => item.visibility === 'jogadores' || inUse.has(item.id)
  );
}

/**
 * Sem cache: o que o jogador pode ver muda com a cena. Sem manifest (dev sem
 * `npm run vtt:manifest`), a biblioteca só mostra o Blob.
 */
export function loadStaticAssets(): Promise<Asset[]> {
  return fetch(STATIC_LIST_URL)
    .then((res) => {
      if (!res.ok) throw new Error(String(res.status));
      return res.json() as Promise<{ items: StaticManifestItem[] }>;
    })
    .then((data) => data.items.map(staticItemToAsset))
    .catch(() => []);
}

/** Os do Blob primeiro (mais novos no topo), depois os fixos por caminho. */
export function mergeLibrary(
  uploaded: Asset[],
  fixed: Asset[],
  kind: AssetKind
): Asset[] {
  return [...uploaded, ...fixed.filter((asset) => asset.kind === kind)];
}

export async function fetchLibraryAssets(
  supabase: SupabaseClient,
  kind: AssetKind
): Promise<{ assets: Asset[]; error: string | null }> {
  const [{ data, error }, fixed] = await Promise.all([
    supabase
      .from('assets')
      .select('*')
      .eq('kind', kind)
      .eq('status', 'approved')
      .order('created_at', { ascending: false }),
    loadStaticAssets(),
  ]);
  return {
    assets: mergeLibrary((data ?? []) as Asset[], fixed, kind),
    error: error?.message ?? null,
  };
}
