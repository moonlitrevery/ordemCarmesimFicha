import Link from 'next/link';
import { RULES_PAGES } from '@/lib/constants';
import { ContentNav } from '@/components/content/ContentNav';

export default function RegrasIndexPage() {
  return (
    <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
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
                href={`/regras/${p.slug}`}
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
