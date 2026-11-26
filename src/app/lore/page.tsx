import Link from 'next/link';
import { LORE_PAGES } from '@/lib/constants';
import { ContentNav } from '@/components/content/ContentNav';
import { InkHero } from '@/components/fx/InkHero';

export default function LoreIndexPage() {
  return (
    <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
      <ContentNav base="/lore" pages={LORE_PAGES} />
      <div className="space-y-4">
        {/* Fase 15: fundo de tinta só no topo da Lore (nunca na Mesa nem na ficha). */}
        <InkHero title="Lore" label="Lore da Ordem Carmesim" className="h-32 md:h-40" />
        <h1 className="font-display text-4xl text-parchment">Lore</h1>
        <p className="text-ink-muted">
          Compêndio narrativo do universo da Ordem Carmesim.
        </p>
        <ul className="space-y-2">
          {LORE_PAGES.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/lore/${p.slug}`}
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
