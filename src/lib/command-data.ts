/**
 * Itens da busca rápida da mestra (Fase 15, item 13). Lidos na primeira abertura
 * e guardados em memória até recarregar a página. Só leitura, pelo RLS de sempre:
 * a mestra lê as fichas (`is_mestre`), os NPCs e as páginas das mesas dela e os
 * próprios grupos da V.M.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { LORE_PAGES, RULES_PAGES } from '@/lib/constants';
import type { CommandItem } from './command-search';

type Row = Record<string, unknown>;

function embeddedName(value: unknown, field: string): string | undefined {
  const row = (Array.isArray(value) ? value[0] : value) as Row | null | undefined;
  const name = row?.[field];
  return typeof name === 'string' && name ? name : undefined;
}

const STATIC_ITEMS: CommandItem[] = [
  ...LORE_PAGES.map((page) => ({ key: 'lore:' + page.slug, kind: 'lore' as const, id: page.slug, title: page.title })),
  ...RULES_PAGES.map((page) => ({ key: 'regras:' + page.slug, kind: 'regras' as const, id: page.slug, title: page.title })),
];

let cache: Promise<CommandItem[]> | null = null;

export function loadCommandItems(supabase: SupabaseClient, userId: string): Promise<CommandItem[]> {
  cache ??= fetchItems(supabase, userId).catch((error) => {
    cache = null; // Falhou: a próxima abertura tenta de novo.
    throw error;
  });
  return cache;
}

async function fetchItems(supabase: SupabaseClient, userId: string): Promise<CommandItem[]> {
  const [characters, tables, npcs, groups] = await Promise.all([
    supabase.from('characters').select('id, name, profiles(display_name)').order('name'),
    // `select('*')` em `tables` falha (o código da mesa não tem privilégio).
    supabase.from('tables').select('id, name').eq('owner_id', userId),
    supabase.from('npcs').select('id, name, table_id').order('name'),
    supabase.from('gm_groups').select('id, name').order('sort_order'),
  ]);
  for (const result of [characters, tables, npcs, groups]) if (result.error) throw result.error;

  const tableRows = (tables.data ?? []) as Row[];
  const tableName = new Map(tableRows.map((t) => [String(t.id), String(t.name ?? '')]));
  const tableIds = [...tableName.keys()];
  const scenes = tableIds.length
    ? await supabase.from('scenes').select('id, name, table_id').in('table_id', tableIds).order('name')
    : { data: [] as Row[], error: null };
  if (scenes.error) throw scenes.error;

  return [
    ...((characters.data ?? []) as Row[]).map((r) => ({
      key: 'ficha:' + r.id,
      kind: 'ficha' as const,
      id: String(r.id),
      title: String(r.name || 'Sem nome'),
      subtitle: embeddedName(r.profiles, 'display_name'),
    })),
    ...((npcs.data ?? []) as Row[])
      .filter((r) => tableName.has(String(r.table_id)))
      .map((r) => ({
        key: 'npc:' + r.id,
        kind: 'npc' as const,
        id: String(r.id),
        title: String(r.name || 'NPC'),
        subtitle: tableName.get(String(r.table_id)),
        tableId: String(r.table_id),
      })),
    ...((scenes.data ?? []) as Row[]).map((r) => ({
      key: 'pagina:' + r.id,
      kind: 'pagina' as const,
      id: String(r.id),
      title: String(r.name || 'Página'),
      subtitle: tableName.get(String(r.table_id)),
      tableId: String(r.table_id),
    })),
    ...((groups.data ?? []) as Row[]).map((r) => ({
      key: 'grupo:' + r.id,
      kind: 'grupo' as const,
      id: String(r.id),
      title: String(r.name || 'Grupo'),
    })),
    ...STATIC_ITEMS,
  ];
}
