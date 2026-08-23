import { notFound } from 'next/navigation';
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
        <div className="prose prose-invert prose-lg max-w-none">
          <Content />
        </div>
      </article>
    </div>
  );
}