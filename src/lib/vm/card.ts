import { getEffectiveMaxes, getTotalLevel } from '@/lib/calculations';
import type { CharacterElementRow } from '@/types/database';
import type { VmCharacter, VmElement } from './data';

export type ResourceTone = 'normal' | 'warn' | 'danger';

/** Abaixo de 50% do máximo fica amarelo; abaixo de 25%, vermelho. */
export function resourceTone(current: number, max: number): ResourceTone {
  if (!(max > 0)) return 'normal';
  const ratio = current / max;
  if (ratio < 0.25) return 'danger';
  if (ratio < 0.5) return 'warn';
  return 'normal';
}

/** Cor do número em alerta (V.M., ficha e Ficha rápida). */
export const RESOURCE_TONE_COLOR: Record<Exclude<ResourceTone, 'normal'>, string> = {
  warn: '#F2C94C',
  danger: '#FF3B3B',
};

/** Sanidade abaixo de 25%: o número fica vermelho e dá um glitch ao cruzar. */
export function isSanityCritical(current: number, max: number): boolean {
  return resourceTone(current, max) === 'danger';
}

/** Mesmos máximos que a ficha mostra (as colunas `*_max` do banco não valem). */
export function characterMaxes(c: VmCharacter) {
  return getEffectiveMaxes(
    getTotalLevel(c.elements as CharacterElementRow[]),
    c.attributes,
    c.resource_mods ?? {}
  );
}

/** Tags do card: só nível > 0, maior nível primeiro. */
export function elementTags(elements: VmElement[]): VmElement[] {
  return elements
    .filter((e) => e.level > 0)
    .sort((a, b) => b.level - a.level || a.element.localeCompare(b.element));
}

/** INSERT/UPDATE de `character_elements`: troca só o personagem dono da linha. */
export function upsertElement(
  characters: Record<string, VmCharacter>,
  characterId: string,
  element: VmElement
): Record<string, VmCharacter> {
  const c = characters[characterId];
  if (!c) return characters;
  const rest = c.elements.filter((e) => e.id !== element.id && e.element !== element.element);
  return { ...characters, [characterId]: { ...c, elements: [...rest, element] } };
}

/** DELETE só traz o id: procura quem tinha essa linha. Id desconhecido não mexe em nada. */
export function removeElement(
  characters: Record<string, VmCharacter>,
  elementId: string
): Record<string, VmCharacter> {
  for (const [id, c] of Object.entries(characters)) {
    if (c.elements.some((e) => e.id === elementId)) {
      return { ...characters, [id]: { ...c, elements: c.elements.filter((e) => e.id !== elementId) } };
    }
  }
  return characters;
}

/** Troca o item com o vizinho e renumera 0..n; devolve a lista e só quem mudou. */
export function moveInList<T extends { id: string; sort_order: number }>(
  list: T[],
  id: string,
  dir: -1 | 1
): { next: T[]; changed: T[] } | null {
  const i = list.findIndex((item) => item.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return null;
  const order = list.slice();
  [order[i], order[j]] = [order[j], order[i]];
  const next = order.map((item, index) => (item.sort_order === index ? item : { ...item, sort_order: index }));
  return { next, changed: next.filter((item, index) => item !== order[index]) };
}
