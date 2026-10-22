import { notFound } from 'next/navigation';
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
    <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
      <ContentNav base="/lore" pages={LORE_PAGES} current={params.slug} />
      <article className="panel min-w-0 max-w-none p-5 md:p-8">
        <div className="prose prose-invert prose-lg max-w-none">
          <Content />
        </div>
      </article>
    </div>
  );
}