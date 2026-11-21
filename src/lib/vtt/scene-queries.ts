import type { SupabaseClient } from '@supabase/supabase-js';
import { loadStaticCatalog, loadStaticInUse } from './assets/static';
import type {
  Drawing,
  PendingPlacement,
  SceneAsset,
  SceneObject,
  VttScene,
} from './types';

/** Sem as colunas da Fase 12 (migração 022): a Mesa continua abrindo sem ela. */
const SCENE_COLUMNS_BASE =
  'id, table_id, name, folder, sort, map_asset_id, meters_per_px, weather, lighting, created_at';

export const SCENE_COLUMNS = `${SCENE_COLUMNS_BASE}, archived, grid_visible`;

/** 42703: coluna que não existe. PGRST204: o cache do PostgREST não a conhece. */
export function isMissingColumn(error: { code?: string } | null | undefined): boolean {
  return error?.code === '42703' || error?.code === 'PGRST204';
}

let pagesColumnsMissing = false;

/** A migração 022 ainda não rodou: arquivar e grade não funcionam. */
export function pagesMigrationMissing(): boolean {
  return pagesColumnsMissing;
}

function withPageDefaults(rows: Partial<VttScene>[]): VttScene[] {
  return rows.map((row) => ({ archived: false, grid_visible: false, ...row }) as VttScene);
}

export const OBJECT_COLUMNS =
  'id, scene_id, asset_id, kind, x, y, rotation, scale, flip_x, flip_y, z, parent_id, local, caption, effects, conditions, character_id, npc_id, hidden, created_by, updated_at';

export const DRAWING_COLUMNS =
  'id, scene_id, author_id, points, color, width, created_at';

export const SCENE_ASSET_COLUMNS = 'id, kind, name, url, thumb_url, width, height';

export interface SceneBundle {
  objects: Record<string, SceneObject>;
  drawings: Record<string, Drawing>;
  placements: PendingPlacement[];
  assets: Record<string, SceneAsset>;
}

export async function fetchScenes(
  supabase: SupabaseClient,
  tableId: string
): Promise<VttScene[]> {
  const query = (columns: string) =>
    supabase
      .from('scenes')
      .select(columns)
      .eq('table_id', tableId)
      .order('sort')
      .order('created_at');
  if (!pagesColumnsMissing) {
    const { data, error } = await query(SCENE_COLUMNS);
    if (!error) return withPageDefaults((data ?? []) as Partial<VttScene>[]);
    if (!isMissingColumn(error)) throw error;
    pagesColumnsMissing = true;
  }
  const { data, error } = await query(SCENE_COLUMNS_BASE);
  if (error) throw error;
  return withPageDefaults((data ?? []) as Partial<VttScene>[]);
}

export async function fetchAssets(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Record<string, SceneAsset>> {
  if (ids.length === 0) return {};
  const { data, error } = await supabase
    .from('assets')
    .select(SCENE_ASSET_COLUMNS)
    .in('id', ids);
  if (error) throw error;
  const found = Object.fromEntries(
    ((data ?? []) as SceneAsset[]).map((asset) => [asset.id, asset])
  );
  // Só baixa o manifest se a cena usa algo que não está no banco.
  if (ids.every((id) => found[id])) return found;
  const take = (assets: SceneAsset[]) =>
    assets
      .filter((asset) => ids.includes(asset.id))
      .forEach((asset) => {
        found[asset.id] = asset;
      });
  take(await loadStaticCatalog());
  if (!ids.every((id) => found[id])) take(await loadStaticInUse());
  return found;
}

/** O RLS decide o que vem: oculto e cena alheia não chegam ao jogador. */
export async function fetchSceneBundle(
  supabase: SupabaseClient,
  sceneId: string,
  userId: string,
  mapAssetId: string | null
): Promise<SceneBundle> {
  const [objectsRes, drawingsRes, placementsRes] = await Promise.all([
    supabase.from('scene_objects').select(OBJECT_COLUMNS).eq('scene_id', sceneId),
    supabase.from('drawings').select(DRAWING_COLUMNS).eq('scene_id', sceneId),
    supabase
      .from('pending_placements')
      .select('id, asset_id, scene_id, x, y, scale, created_by, created_at')
      .eq('scene_id', sceneId)
      .eq('created_by', userId),
  ]);
  if (objectsRes.error) throw objectsRes.error;
  if (drawingsRes.error) throw drawingsRes.error;
  if (placementsRes.error) throw placementsRes.error;

  const objects = (objectsRes.data ?? []) as unknown as SceneObject[];
  const drawings = (drawingsRes.data ?? []) as Drawing[];
  const placements = (placementsRes.data ?? []) as PendingPlacement[];

  const assetIds = new Set<string>();
  if (mapAssetId) assetIds.add(mapAssetId);
  objects.forEach((object) => assetIds.add(object.asset_id));
  placements.forEach((placement) => assetIds.add(placement.asset_id));

  return {
    objects: Object.fromEntries(objects.map((o) => [o.id, o])),
    drawings: Object.fromEntries(drawings.map((d) => [d.id, d])),
    placements,
    assets: await fetchAssets(supabase, Array.from(assetIds)),
  };
}
