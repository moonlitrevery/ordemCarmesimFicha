import type { VttPresence } from './types';

/** Junta o estado do presence: várias abas do mesmo usuário contam uma vez. */
export function collectOnline(
  state: Record<string, VttPresence[]>
): VttPresence[] {
  return Object.values(state)
    .map((metas) => metas[metas.length - 1])
    .filter((meta): meta is VttPresence => Boolean(meta))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
