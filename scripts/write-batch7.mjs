import fs from 'fs';
import path from 'path';

const root = process.cwd();
function write(rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.replace(/\r\n/g, '\n'), 'utf8');
  console.log('wrote', rel);
}

const lorePages = [
  ['historia', 'História', 'fundação da Ordem, linha do tempo dos líderes'],
  ['estrutura', 'Estrutura', 'Darkwater, sede, instalações'],
  ['cargos', 'Cargos', 'hierarquia de cargos e critérios de progressão'],
  ['planos-de-existencia', 'Planos de Existência', 'Plano Real, Tártaro, Plano Astral, Demiplano de Emily, Purgatório'],
  ['lideres', 'Líderes', 'bios de Christopher, Hannah, Levi, Matthias, Ayla'],
];

const rulesPages = [
  ['atributos', 'Atributos', 'FOR, CON, DES, INT, EDU, CAR, POD'],
  ['pericias', 'Perícias', 'lista de perícias e especialização'],
  ['elementos-e-fragmentos', 'Elementos e Fragmentos', 'os 11 elementos e a curva de fragmentos'],
  ['arcanas', 'Arcanas', 'O Julgamento, A Temperança, O Mago, O Louco'],
  ['armas-e-runas', 'Armas e Runas', 'ações em combate e runificação'],
  ['itens-amaldicoados', 'Itens Amaldiçoados', 'raridades e maestria'],
];

for (const [slug, title, hint] of lorePages) {
  write(
    \`content/lore/\${slug}.mdx\`,
    \`# \${title}

{/* COLAR AQUI: texto da seção — \${hint} */}

## Visão geral

{/* COLAR AQUI: introdução */}

## Detalhes

{/* COLAR AQUI: conteúdo principal */}
\`
  );
}

for (const [slug, title, hint] of rulesPages) {
  const extra =
    slug === 'elementos-e-fragmentos'
      ? \`
## Curva de fragmentos

A tabela abaixo é gerada a partir da constante \`FRAGMENT_COST\` do sistema.

import { FragmentCostTable } from '@/components/content/FragmentCostTable';

<FragmentCostTable />
\`
      : '';

  write(
    \`content/regras/\${slug}.mdx\`,
    \`# \${title}

{/* COLAR AQUI: texto da seção — \${hint} */}

## Visão geral

{/* COLAR AQUI: introdução */}

## Detalhes

{/* COLAR AQUI: conteúdo principal */}
\${extra}
\`
  );
}

write(
  'src/app/lore/page.tsx',
  `import Link from 'next/link';
import { LORE_PAGES } from '@/lib/constants';
import { ContentNav } from '@/components/content/ContentNav';

export default function LoreIndexPage() {
  return (
    <div className="grid gap-6 md:grid-cols-[220px_1fr]">
      <ContentNav base="/lore" pages={LORE_PAGES} />
      <div className="space-y-4">
        <h1 className="font-display text-4xl text-parchment">Lore</h1>
        <p className="text-ink-muted">
          Compêndio narrativo do universo da Ordem Carmesim.
        </p>
        <ul className="space-y-2">
          {LORE_PAGES.map((p) => (
            <li key={p.slug}>
              <Link
                href={\`/lore/\${p.slug}\`}
                className="panel block px-4 py-3 transition hover:border-crimson/50"
              >
                <span className="font-display text-xl text-parchment">{p.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
`
);

write(
  'src/app/regras/page.tsx',
  `import Link from 'next/link';
import { RULES_PAGES } from '@/lib/constants';
import { ContentNav } from '@/components/content/ContentNav';

export default function RegrasIndexPage() {
  return (
    <div className="grid gap-6 md:grid-cols-[220px_1fr]">
      <ContentNav base="/regras" pages={RULES_PAGES} />
      <div className="space-y-4">
        <h1 className="font-display text-4xl text-parchment">Regras</h1>
        <p className="text-ink-muted">
          Referência do sistema de RPG da campanha.
        </p>
        <ul className="space-y-2">
          {RULES_PAGES.map((p) => (
            <li key={p.slug}>
              <Link
                href={\`/regras/\${p.slug}\`}
                className="panel block px-4 py-3 transition hover:border-crimson/50"
              >
                <span className="font-display text-xl text-parchment">{p.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
`
);

write(
  'src/lib/mdx.ts',
  `import { LORE_PAGES, RULES_PAGES } from '@/lib/constants';

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
`
);

write(
  'src/app/lore/[slug]/page.tsx',
  `import { notFound } from 'next/navigation';
import { LORE_PAGES } from '@/lib/constants';
import { ContentNav } from '@/components/content/ContentNav';
import { isLoreSlug, loadLorePage } from '@/lib/mdx';

export function generateStaticParams() {
  return LORE_PAGES.map((p) => ({ slug: p.slug }));
}

export default async function LoreSlugPage({
  params,
}: {
  params: { slug: string };
}) {
  if (!isLoreSlug(params.slug)) notFound();
  const mod = await loadLorePage(params.slug);
  if (!mod) notFound();
  const Content = mod.default;

  return (
    <div className="grid gap-6 md:grid-cols-[220px_1fr]">
      <ContentNav base="/lore" pages={LORE_PAGES} current={params.slug} />
      <article className="panel prose-invert max-w-none p-5 md:p-8">
        <Content />
      </article>
    </div>
  );
}
`
);

write(
  'src/app/regras/[slug]/page.tsx',
  `import { notFound } from 'next/navigation';
import { RULES_PAGES } from '@/lib/constants';
import { ContentNav } from '@/components/content/ContentNav';
import { isRulesSlug, loadRulesPage } from '@/lib/mdx';

export function generateStaticParams() {
  return RULES_PAGES.map((p) => ({ slug: p.slug }));
}

export default async function RegrasSlugPage({
  params,
}: {
  params: { slug: string };
}) {
  if (!isRulesSlug(params.slug)) notFound();
  const mod = await loadRulesPage(params.slug);
  if (!mod) notFound();
  const Content = mod.default;

  return (
    <div className="grid gap-6 md:grid-cols-[220px_1fr]">
      <ContentNav base="/regras" pages={RULES_PAGES} current={params.slug} />
      <article className="panel prose-invert max-w-none p-5 md:p-8">
        <Content />
      </article>
    </div>
  );
}
`
);

write(
  'README.md',
  `# Ordem Carmesim

Site de fichas, lore e regras para a campanha de RPG **Ordem Carmesim**.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Framer Motion
- Supabase (Auth + Postgres + RLS)
- Deploy: Vercel (frontend) + Supabase (free tier)

## Setup local

1. Copie \`.env.local.example\` para \`.env.local\` e preencha as chaves do Supabase:
   - \`NEXT_PUBLIC_SUPABASE_URL\`
   - \`NEXT_PUBLIC_SUPABASE_ANON_KEY\`

2. No SQL Editor do Supabase, rode o arquivo \`supabase/schema.sql\` completo.

3. Crie sua conta pelo site (\`/cadastro\`). Para virar mestre:

\`\`\`sql
update public.profiles
set role = 'mestre'
where display_name = 'Julieta'; -- ou pelo email via join com auth.users
\`\`\`

4. Instale e rode:

\`\`\`bash
npm install
npm run dev
\`\`\`

## Rotas

| Rota | Descrição |
|------|-----------|
| \`/\` | Landing |
| \`/login\` \`/cadastro\` | Auth |
| \`/lore\` \`/regras\` | Compêndio (MDX em \`content/\`) |
| \`/fichas\` | Dashboard de fichas |
| \`/fichas/nova\` | Criar ficha |
| \`/fichas/[id]\` | Ficha interativa |

## Conteúdo

Os arquivos em \`content/lore/*.mdx\` e \`content/regras/*.mdx\` têm placeholders \`{/* COLAR AQUI: ... */}\` — cole o texto narrativo neles sem inventar lore.
`
);

console.log('batch 7 done');
