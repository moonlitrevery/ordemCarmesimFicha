import type { VttScene } from './types';

/**
 * Páginas (Fase 12): no banco são `scenes`, na interface são "Páginas", como no
 * Roll20. Tudo aqui é puro: o overlay e o `SceneSync` só chamam estas funções.
 */

/** Padrão da mesa, igual ao Dungeon Alchemist: 1 quadrado = 1,5 m. */
export const TILE_METERS = 1.5;

export const MAX_FOLDER_NAME = 80;
export const MAX_PAGE_NAME = 120;

/** Grade com quadrado menor que isso na imagem viraria só ruído (e linhas demais). */
export const MIN_GRID_CELL_PX = 8;

export type PagesView =
  | { kind: 'all' }
  | { kind: 'archived' }
  | { kind: 'folder'; name: string };

/** Nome de pasta como fica salvo: sem espaço nas pontas, até 80 caracteres. */
export function cleanFolderName(input: string): string {
  return input.trim().replace(/\s+/g, ' ').slice(0, MAX_FOLDER_NAME);
}

/** Para a busca: sem acento e sem caixa. "Praça" acha "praca". */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Lê `tables.scene_folders`, que chega como `unknown` do banco. */
export function parseFolders(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const name = cleanFolderName(item);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push(name);
  }
  return result;
}

/**
 * As pastas na ordem salva, mais as que só existem em alguma página (criadas
 * antes da Fase 12 ou sem a migração), no fim e em ordem alfabética.
 */
export function folderList(stored: string[], scenes: Pick<VttScene, 'folder'>[]): string[] {
  const result = parseFolders(stored);
  const known = new Set(result);
  const extra = new Set<string>();
  for (const scene of scenes) {
    const name = cleanFolderName(scene.folder);
    if (name && !known.has(name)) extra.add(name);
  }
  return [...result, ...Array.from(extra).sort((a, b) => a.localeCompare(b, 'pt-BR'))];
}

/** Quantas páginas (não arquivadas) cada pasta tem. */
export function folderCounts(scenes: Pick<VttScene, 'folder' | 'archived'>[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const scene of scenes) {
    if (scene.archived) continue;
    const name = cleanFolderName(scene.folder);
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

/**
 * O que a grade mostra. Na visão "Todas" vêm as páginas soltas; as das pastas
 * ficam nos cards de pasta. Com busca, procura em tudo do lado escolhido
 * (arquivadas ou não), sem pastas.
 */
export function visiblePages<T extends Pick<VttScene, 'name' | 'folder' | 'archived'>>(
  scenes: T[],
  view: PagesView,
  query: string
): T[] {
  const wanted = normalizeSearch(query);
  const archivedSide = view.kind === 'archived';
  if (wanted) {
    return scenes.filter(
      (scene) =>
        scene.archived === archivedSide &&
        (view.kind !== 'folder' || cleanFolderName(scene.folder) === view.name) &&
        normalizeSearch(scene.name).includes(wanted)
    );
  }
  return scenes.filter((scene) => {
    if (view.kind === 'archived') return scene.archived;
    if (scene.archived) return false;
    if (view.kind === 'folder') return cleanFolderName(scene.folder) === view.name;
    return cleanFolderName(scene.folder) === '';
  });
}

/** A fita dos jogadores não sai do lugar por engano: essa página não some nem é apagada. */
export function canRemovePage(sceneId: string, partySceneId: string | null): boolean {
  return sceneId !== partySceneId;
}

/** Arrastar `draggedId` para o lugar de `targetId`. Devolve a lista na ordem nova. */
export function reorderPages<T extends { id: string }>(
  scenes: T[],
  draggedId: string,
  targetId: string
): T[] | null {
  if (draggedId === targetId) return null;
  const from = scenes.findIndex((scene) => scene.id === draggedId);
  const to = scenes.findIndex((scene) => scene.id === targetId);
  if (from === -1 || to === -1) return null;
  const next = scenes.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function renameFolderIn(folders: string[], from: string, to: string): string[] {
  const target = cleanFolderName(to);
  if (!target) return folders;
  const result: string[] = [];
  for (const name of folders) {
    const next = name === from ? target : name;
    if (!result.includes(next)) result.push(next);
  }
  return result;
}

export function addFolderIn(folders: string[], name: string): string[] {
  const clean = cleanFolderName(name);
  return clean && !folders.includes(clean) ? [...folders, clean] : folders;
}

/** Nome livre para "Nova pasta", "Nova pasta 2"… */
export function uniqueFolderName(folders: string[], base = 'Nova pasta'): string {
  if (!folders.includes(base)) return base;
  for (let n = 2; ; n++) {
    const name = `${base} ${n}`;
    if (!folders.includes(name)) return name;
  }
}

/**
 * Escala a partir da largura do mapa em quadrados: o Dungeon Alchemist mostra o
 * tamanho do mapa em quadrados, e esse número continua valendo depois que a
 * imagem é reduzida (no upload ou no manifest), ao contrário dos pixels por quadrado.
 */
export function metersPerPxFromTiles(tilesAcross: number, imageWidthPx: number): number | null {
  if (!(tilesAcross > 0) || !(imageWidthPx > 0)) return null;
  const value = (tilesAcross * TILE_METERS) / imageWidthPx;
  return Number.isFinite(value) && value > 0 && value < 100 ? value : null;
}

/** Quantos pixels da imagem tem um quadrado de 1,5 m. */
export function gridCellPx(metersPerPx: number | null | undefined): number | null {
  if (!metersPerPx || !(metersPerPx > 0)) return null;
  const cell = TILE_METERS / metersPerPx;
  return Number.isFinite(cell) && cell >= MIN_GRID_CELL_PX ? cell : null;
}

/** "1 quadrado ≈ 64 px", para o chip e as configurações. */
export function formatTileScale(metersPerPx: number): string {
  const pixels = TILE_METERS / metersPerPx;
  const shown = pixels >= 10 ? Math.round(pixels) : Math.round(pixels * 10) / 10;
  return `1 quadrado (1,5 m) ≈ ${String(shown).replace('.', ',')} px`;
}
