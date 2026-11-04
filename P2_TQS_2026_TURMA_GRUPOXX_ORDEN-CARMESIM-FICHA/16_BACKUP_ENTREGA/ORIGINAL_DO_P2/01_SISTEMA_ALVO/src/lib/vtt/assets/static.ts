import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isImageKind,
  type Asset,
  type AssetKind,
  type AssetVisibility,
} from './rules';

const STATIC_LIST_URL = '/api/vtt/static';
const STATIC_IN_USE_URL = '/api/vtt/static/in-use';

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
  /** Só áudio: as subpastas. Manifest antigo não tem. */
  tags?: string[];
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
    tags: item.tags ?? [],
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

function fetchStaticList(url: string): Promise<Asset[]> {
  return fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(String(res.status));
      return res.json() as Promise<{ items: StaticManifestItem[] }>;
    })
    .then((data) => data.items.map(staticItemToAsset))
    .catch(() => []);
}

/**
 * O que não depende da cena: o navegador guarda por 60 s, por papel. Sem manifest
 * (dev sem `npm run vtt:manifest`), a biblioteca só mostra o Blob.
 */
export function loadStaticCatalog(): Promise<Asset[]> {
  return fetchStaticList(STATIC_LIST_URL);
}

/** Sem cache: o que o jogador pode ver muda com a cena. */
export function loadStaticInUse(): Promise<Asset[]> {
  return fetchStaticList(STATIC_IN_USE_URL);
}

/** Os do Blob primeiro (mais novos no topo), depois os fixos por caminho. */
export function mergeLibrary(uploaded: Asset[], ...fixed: Asset[][]): Asset[] {
  const seen = new Set<string>();
  return [...uploaded, ...fixed.flat()].filter((asset) => {
    if (seen.has(asset.id)) return false;
    seen.add(asset.id);
    return true;
  });
}

export function assetsOfKind(assets: Asset[], kind: AssetKind): Asset[] {
  return assets.filter((asset) => asset.kind === kind);
}

/** Do Blob, imagem e sem miniatura. Fixo ganha a dele no build. */
export function isBackfillCandidate(asset: Asset): boolean {
  return (
    isImageKind(asset.kind) &&
    asset.thumb_url === null &&
    !asset.url.startsWith('/vtt/')
  );
}

/** Tudo de uma vez e em paralelo: trocar de aba depois não faz requisição. */
export async function fetchLibraryAssets(
  supabase: SupabaseClient,
  isGm: boolean
): Promise<{ assets: Asset[]; error: string | null }> {
  const [{ data, error }, catalog, inUse] = await Promise.all([
    supabase
      .from('assets')
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: false }),
    loadStaticCatalog(),
    isGm ? Promise.resolve([]) : loadStaticInUse(),
  ]);
  return {
    assets: mergeLibrary((data ?? []) as Asset[], catalog, inUse),
    error: error?.message ?? null,
  };
}
