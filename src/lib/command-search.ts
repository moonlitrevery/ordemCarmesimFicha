/**
 * Busca rápida da mestra (Fase 15, item 13): regras puras, sem rede.
 * Sem acento e sem caixa; toda palavra digitada precisa aparecer no título ou no
 * subtítulo; título que começa com a busca vem antes.
 */
export type CommandKind = 'ficha' | 'npc' | 'pagina' | 'grupo' | 'lore' | 'regras';

export interface CommandItem {
  /** Único na lista (tipo + id). */
  key: string;
  kind: CommandKind;
  id: string;
  title: string;
  subtitle?: string;
  /** Mesa do NPC ou da página. */
  tableId?: string;
}

export const COMMAND_KIND_LABEL: Record<CommandKind, string> = {
  ficha: 'Ficha',
  npc: 'NPC',
  pagina: 'Página da Mesa',
  grupo: 'Grupo da V.M.',
  lore: 'Lore',
  regras: 'Regras',
};

const KIND_ORDER: CommandKind[] = ['ficha', 'npc', 'pagina', 'grupo', 'lore', 'regras'];

export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function score(item: CommandItem, query: string, words: string[]): number | null {
  const title = normalizeSearch(item.title);
  const haystack = title + ' ' + normalizeSearch(item.subtitle ?? '') + ' ' + normalizeSearch(COMMAND_KIND_LABEL[item.kind]);
  if (!words.every((word) => haystack.includes(word))) return null;
  if (title.startsWith(query)) return 0;
  if (title.split(' ').some((part) => part.startsWith(words[0]))) return 1;
  return title.includes(words[0]) ? 2 : 3;
}

export function searchCommands(items: CommandItem[], query: string, limit = 40): CommandItem[] {
  const normalized = normalizeSearch(query);
  const words = normalized ? normalized.split(' ') : [];
  const ranked: { item: CommandItem; rank: number }[] = [];
  for (const item of items) {
    const rank = words.length === 0 ? 0 : score(item, normalized, words);
    if (rank !== null) ranked.push({ item, rank });
  }
  ranked.sort(
    (a, b) =>
      a.rank - b.rank ||
      KIND_ORDER.indexOf(a.item.kind) - KIND_ORDER.indexOf(b.item.kind) ||
      a.item.title.localeCompare(b.item.title, 'pt-BR')
  );
  return ranked.slice(0, limit).map((entry) => entry.item);
}

/** Atalho da busca: Ctrl+K, ou Cmd+K no Mac. */
export function isCommandShortcut(event: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }): boolean {
  return event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey;
}
