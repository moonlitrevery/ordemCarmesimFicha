import { LORE_PAGES, RULES_PAGES } from '@/lib/constants';

const loreModules: Record<string, () => Promise<{ default: React.ComponentType }>> = {
  historia: () => import('@/content/lore/historia.mdx'),
  estrutura: () => import('@/content/lore/estrutura.mdx'),
  cargos: () => import('@/content/lore/cargos.mdx'),
  'planos-de-existencia': () => import('@/content/lore/planos-de-existencia.mdx'),
  lideres: () => import('@/content/lore/lideres.mdx'),
};

const rulesModules: Record<string, () => Promise<{ default: React.ComponentType }>> = {
  atributos: () => import('@/content/regras/atributos.mdx'),
  pericias: () => import('@/content/regras/pericias.mdx'),
  'elementos-e-fragmentos': () => import('@/content/regras/elementos-e-fragmentos.mdx'),
  arcanas: () => import('@/content/regras/arcanas.mdx'),
  'armas-e-runas': () => import('@/content/regras/armas-e-runas.mdx'),
  'itens-amaldicoados': () => import('@/content/regras/itens-amaldicoados.mdx'),
};

export function isLoreSlug(slug: string) {
  return LORE_PAGES.some((p) => p.slug === slug);
}

export function isRulesSlug(slug: string) {
  return RULES_PAGES.some((p) => p.slug === slug);
}

export async function loadLorePage(slug: string) {
  const loader = loreModules[slug];
  if (!loader) return null;
  return loader();
}

export async function loadRulesPage(slug: string) {
  const loader = rulesModules[slug];
  if (!loader) return null;
  return loader();
}
