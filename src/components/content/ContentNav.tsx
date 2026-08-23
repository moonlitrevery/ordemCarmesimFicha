import Link from 'next/link';

export function ContentNav({
  base,
  pages,
  current,
}: {
  base: '/lore' | '/regras';
  pages: readonly { slug: string; title: string }[];
  current?: string;
}) {
  return (
    <aside className="panel h-fit p-4 md:sticky md:top-20">
      <p className="label mb-3">{base === '/lore' ? 'Lore' : 'Regras'}</p>
      <nav className="flex flex-col gap-1">
        <Link
          href={base}
          className={`rounded-md px-2 py-1.5 text-sm ${
            !current
              ? 'bg-crimson/20 text-parchment'
              : 'text-ink-muted hover:bg-ink-raised hover:text-parchment'
          }`}
        >
          Índice
        </Link>
        {pages.map((p) => (
          <Link
            key={p.slug}
            href={`${base}/${p.slug}`}
            className={`rounded-md px-2 py-1.5 text-sm ${
              current === p.slug
                ? 'bg-crimson/20 text-parchment'
                : 'text-ink-muted hover:bg-ink-raised hover:text-parchment'
            }`}
          >
            {p.title}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
