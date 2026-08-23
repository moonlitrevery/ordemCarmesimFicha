import fs from 'fs';
import path from 'path';

const root = process.cwd();
function write(rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.replace(/\r\n/g, '\n'), 'utf8');
  console.log('wrote', rel);
}

write(
  'src/app/fichas/page.tsx',
  `import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getTotalLevel } from '@/lib/calculations';
import { CharacterImage } from '@/components/ui/CharacterImage';
import type { Character, CharacterElementRow, Profile } from '@/types/database';

export default async function FichasPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  const isMestre = profile?.role === 'mestre';

  let query = supabase.from('characters').select('*').order('updated_at', {
    ascending: false,
  });

  if (!isMestre) {
    query = query.eq('owner_id', user.id);
  }

  const { data: characters } = await query;
  const list = (characters ?? []) as Character[];

  const ids = list.map((c) => c.id);
  const { data: elements } = ids.length
    ? await supabase
        .from('character_elements')
        .select('*')
        .in('character_id', ids)
    : { data: [] as CharacterElementRow[] };

  const elementsByChar = new Map<string, CharacterElementRow[]>();
  for (const el of (elements ?? []) as CharacterElementRow[]) {
    const arr = elementsByChar.get(el.character_id!) ?? [];
    arr.push(el);
    elementsByChar.set(el.character_id!, arr);
  }

  let owners = new Map<string, string>();
  if (isMestre && list.length) {
    const ownerIds = [...new Set(list.map((c) => c.owner_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', ownerIds);
    for (const p of (profiles ?? []) as Pick<Profile, 'id' | 'display_name'>[]) {
      owners.set(p.id, p.display_name);
    }
  }

  const groups: { ownerLabel: string; chars: Character[] }[] = [];
  if (isMestre) {
    const byOwner = new Map<string, Character[]>();
    for (const c of list) {
      const arr = byOwner.get(c.owner_id) ?? [];
      arr.push(c);
      byOwner.set(c.owner_id, arr);
    }
    for (const [ownerId, chars] of byOwner) {
      groups.push({
        ownerLabel: owners.get(ownerId) ?? 'Jogador',
        chars,
      });
    }
  } else {
    groups.push({ ownerLabel: '', chars: list });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl text-parchment">Fichas</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {isMestre
              ? 'Visão de mestre — todas as fichas da campanha.'
              : 'Suas fichas de personagem.'}
          </p>
        </div>
        <Link href="/fichas/nova" className="btn-primary">
          + Nova Ficha
        </Link>
      </div>

      {list.length === 0 && (
        <div className="panel p-8 text-center text-ink-muted">
          Nenhuma ficha ainda.{' '}
          <Link href="/fichas/nova" className="text-crimson-soft hover:underline">
            Criar a primeira
          </Link>
        </div>
      )}

      {groups.map((group) => (
        <div key={group.ownerLabel || 'own'} className="space-y-3">
          {isMestre && group.ownerLabel && (
            <h2 className="label text-crimson-soft">{group.ownerLabel}</h2>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.chars.map((c) => {
              const level = getTotalLevel(elementsByChar.get(c.id) ?? []);
              return (
                <Link
                  key={c.id}
                  href={\`/fichas/\${c.id}\`}
                  className="panel group overflow-hidden transition hover:border-crimson/50"
                >
                  <CharacterImage
                    url={c.image_url}
                    name={c.name}
                    className="h-40 w-full"
                  />
                  <div className="space-y-1 p-4">
                    <h3 className="font-display text-xl text-parchment group-hover:text-crimson-soft">
                      {c.name}
                    </h3>
                    <p className="text-sm text-ink-muted">
                      Nível {level}
                      {c.occupation ? \` · \${c.occupation}\` : ''}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
`
);

write(
  'src/app/fichas/nova/page.tsx',
  `'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { DEFAULT_ATTRIBUTES } from '@/types/database';
import { computeDerivedMaxes } from '@/lib/calculations';

export default function NovaFichaPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError('Você precisa estar logado.');
      setLoading(false);
      return;
    }

    const maxes = computeDerivedMaxes(0, DEFAULT_ATTRIBUTES);
    const { data, error: err } = await supabase
      .from('characters')
      .insert({
        owner_id: user.id,
        name: name.trim() || 'Novo personagem',
        attributes: DEFAULT_ATTRIBUTES,
        hp_current: maxes.hpMax,
        hp_max: maxes.hpMax,
        mana_current: maxes.manaMax,
        mana_max: maxes.manaMax,
        sanity_current: maxes.sanityMax,
        sanity_max: maxes.sanityMax,
        milestone_notes: {},
      })
      .select('id')
      .single();

    setLoading(false);
    if (err || !data) {
      setError(err?.message ?? 'Falha ao criar ficha.');
      return;
    }
    router.push(\`/fichas/\${data.id}\`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="font-display text-4xl text-parchment">Nova Ficha</h1>
      <form onSubmit={onSubmit} className="panel space-y-4 p-6">
        <label className="block space-y-1.5">
          <span className="label">Nome do personagem</span>
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Valen Ashcroft"
            autoFocus
            required
          />
        </label>
        {error && (
          <p className="text-sm text-crimson-soft">{error}</p>
        )}
        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? 'Criando…' : 'Criar ficha'}
        </button>
      </form>
    </div>
  );
}
`
);

write(
  'src/app/fichas/[id]/page.tsx',
  `import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { CharacterSheet } from '@/components/character/CharacterSheet';
import type { Character, CharacterElementRow } from '@/types/database';

export default async function FichaPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: character } = await supabase
    .from('characters')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();

  if (!character) notFound();

  const { data: elements } = await supabase
    .from('character_elements')
    .select('*')
    .eq('character_id', params.id)
    .order('element');

  return (
    <CharacterSheet
      character={character as Character}
      initialElements={(elements ?? []) as CharacterElementRow[]}
    />
  );
}
`
);

write(
  'src/components/content/ContentNav.tsx',
  `import Link from 'next/link';

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
          className={\`rounded-md px-2 py-1.5 text-sm \${
            !current
              ? 'bg-crimson/20 text-parchment'
              : 'text-ink-muted hover:bg-ink-raised hover:text-parchment'
          }\`}
        >
          Índice
        </Link>
        {pages.map((p) => (
          <Link
            key={p.slug}
            href={\`\${base}/\${p.slug}\`}
            className={\`rounded-md px-2 py-1.5 text-sm \${
              current === p.slug
                ? 'bg-crimson/20 text-parchment'
                : 'text-ink-muted hover:bg-ink-raised hover:text-parchment'
            }\`}
          >
            {p.title}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
`
);

write(
  'src/components/content/FragmentCostTable.tsx',
  `import { FRAGMENT_COST } from '@/lib/constants';

export function FragmentCostTable() {
  return (
    <div className="overflow-x-auto rounded-md border border-ink-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-ink-raised text-ink-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Nível atual</th>
            <th className="px-3 py-2 font-medium">Fragmentos para o próximo</th>
          </tr>
        </thead>
        <tbody>
          {FRAGMENT_COST.map((cost, level) => (
            <tr key={level} className="border-t border-ink-border">
              <td className="px-3 py-1.5">{level}</td>
              <td className="px-3 py-1.5 text-crimson-soft">{cost}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
`
);

console.log('batch 6 done');
