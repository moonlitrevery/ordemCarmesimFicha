import fs from "fs";
import path from "path";

const root = process.cwd();
function write(rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.replace(/\r\n/g, "\n"), "utf8");
  console.log("wrote", rel);
}

const lorePages = [
  ["historia", "Historia", "fundacao da Ordem, linha do tempo dos lideres"],
  ["estrutura", "Estrutura", "Darkwater, sede, instalacoes"],
  ["cargos", "Cargos", "hierarquia de cargos e criterios de progressao"],
  ["planos-de-existencia", "Planos de Existencia", "Plano Real, Tartaro, Plano Astral, Demiplano de Emily, Purgatorio"],
  ["lideres", "Lideres", "bios de Christopher, Hannah, Levi, Matthias, Ayla"],
];

const loreTitles = {
  historia: "História",
  estrutura: "Estrutura",
  cargos: "Cargos",
  "planos-de-existencia": "Planos de Existência",
  lideres: "Líderes",
};

const rulesPages = [
  ["atributos", "Atributos", "FOR, CON, DES, INT, EDU, CAR, POD"],
  ["pericias", "Perícias", "lista de perícias e especialização"],
  ["elementos-e-fragmentos", "Elementos e Fragmentos", "os 11 elementos e a curva de fragmentos"],
  ["arcanas", "Arcanas", "O Julgamento, A Temperança, O Mago, O Louco"],
  ["armas-e-runas", "Armas e Runas", "ações em combate e runificação"],
  ["itens-amaldicoados", "Itens Amaldiçoados", "raridades e maestria"],
];

for (const [slug, , hint] of lorePages) {
  const title = loreTitles[slug];
  write(
    "content/lore/" + slug + ".mdx",
    "# " + title + "\n\n" +
    "{/* COLAR AQUI: texto da seção — " + hint + " */}\n\n" +
    "## Visão geral\n\n" +
    "{/* COLAR AQUI: introdução */}\n\n" +
    "## Detalhes\n\n" +
    "{/* COLAR AQUI: conteúdo principal */}\n"
  );
}

for (const [slug, title, hint] of rulesPages) {
  let extra = "";
  if (slug === "elementos-e-fragmentos") {
    extra =
      "\n## Curva de fragmentos\n\n" +
      "A tabela abaixo é gerada a partir da constante `FRAGMENT_COST` do sistema.\n\n" +
      "import { FragmentCostTable } from '@/components/content/FragmentCostTable';\n\n" +
      "<FragmentCostTable />\n";
  }
  write(
    "content/regras/" + slug + ".mdx",
    "# " + title + "\n\n" +
    "{/* COLAR AQUI: texto da seção — " + hint + " */}\n\n" +
    "## Visão geral\n\n" +
    "{/* COLAR AQUI: introdução */}\n\n" +
    "## Detalhes\n\n" +
    "{/* COLAR AQUI: conteúdo principal */}\n" +
    extra
  );
}

write("src/app/lore/page.tsx", `import Link from 'next/link';
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
`);

write("src/app/regras/page.tsx", `import Link from 'next/link';
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
`);

write("src/lib/mdx.ts", `import { LORE_PAGES, RULES_PAGES } from '@/lib/constants';

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
`);

write("src/app/lore/[slug]/page.tsx", `import { notFound } from 'next/navigation';
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
      <article className="panel max-w-none p-5 md:p-8">
        <Content />
      </article>
    </div>
  );
}
`);

write("src/app/regras/[slug]/page.tsx", `import { notFound } from 'next/navigation';
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
      <article className="panel max-w-none p-5 md:p-8">
        <Content />
      </article>
    </div>
  );
}
`);

write("README.md", `# Ordem Carmesim

Site de fichas, lore e regras para a campanha de RPG **Ordem Carmesim**.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Framer Motion
- Supabase (Auth + Postgres + RLS)
- Deploy: Vercel + Supabase (free tier)

## Setup local

1. Copie \`.env.local.example\` para \`.env.local\` e preencha:
   - \`NEXT_PUBLIC_SUPABASE_URL\`
   - \`NEXT_PUBLIC_SUPABASE_ANON_KEY\`

2. No SQL Editor do Supabase, rode \`supabase/schema.sql\`.

3. Crie a conta em \`/cadastro\`. Para virar mestre:

\`\`\`sql
update public.profiles set role = 'mestre' where id = '<uuid-do-usuario>';
\`\`\`

4. Rode:

\`\`\`bash
npm install
npm run dev
\`\`\`

## Conteúdo

Arquivos em \`content/lore/*.mdx\` e \`content/regras/*.mdx\` têm placeholders \`{/* COLAR AQUI */}\` — cole o texto narrativo neles.
`);

console.log("batch7 fixed done");
