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
    <div className="grid gap-6 md:grid-cols-[220px_1fr]">
      <ContentNav base="/lore" pages={LORE_PAGES} current={params.slug} />
      <article className="panel max-w-none p-5 md:p-8">
        <Content />
      </article>
    </div>
  );
}
