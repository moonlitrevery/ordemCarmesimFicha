import Link from 'next/link';
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

  const owners = new Map<string, string>();
  if (isMestre && list.length) {
    const ownerIds = Array.from(new Set(list.map((c) => c.owner_id)));
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
    for (const [ownerId, chars] of Array.from(byOwner.entries())) {
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
                  href={`/fichas/${c.id}`}
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
                      {c.occupation ? ` · ${c.occupation}` : ''}
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
