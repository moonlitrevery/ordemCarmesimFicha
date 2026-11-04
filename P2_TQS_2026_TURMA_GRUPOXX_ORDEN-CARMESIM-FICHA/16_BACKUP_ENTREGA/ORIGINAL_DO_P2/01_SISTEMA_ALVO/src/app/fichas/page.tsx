import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getTotalLevel } from '@/lib/calculations';
import {
  CharacterBrowser,
  type CharacterGroup,
} from '@/components/character/CharacterBrowser';
import type { Character, CharacterElementRow, Profile } from '@/types/database';

type CharacterListRow = Pick<
  Character,
  'id' | 'owner_id' | 'name' | 'occupation' | 'arcana' | 'image_url'
>;

export default async function FichasPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const isMestre = profile?.role === 'mestre';

  let query = supabase
    .from('characters')
    .select('id, owner_id, name, occupation, arcana, image_url')
    .order('updated_at', {
      ascending: false,
    });

  if (!isMestre) {
    query = query.eq('owner_id', user.id);
  }

  const { data: characters } = await query;
  const list = (characters ?? []) as CharacterListRow[];

  const ids = list.map((c) => c.id);
  const { data: elements } = ids.length
    ? await supabase
        .from('character_elements')
        .select('element, level, fragments_current, character_id')
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

  const userId = user.id;

  function toCard(c: CharacterListRow) {
    return {
      id: c.id,
      name: c.name,
      occupation: c.occupation,
      arcana: c.arcana,
      imageUrl: c.image_url,
      level: getTotalLevel(elementsByChar.get(c.id) ?? []),
      isOwner: c.owner_id === userId,
    };
  }

  const groups: CharacterGroup[] = [];
  if (isMestre) {
    const byOwner = new Map<string, CharacterListRow[]>();
    for (const c of list) {
      const arr = byOwner.get(c.owner_id) ?? [];
      arr.push(c);
      byOwner.set(c.owner_id, arr);
    }
    for (const [ownerId, chars] of Array.from(byOwner.entries())) {
      groups.push({
        ownerLabel: owners.get(ownerId) ?? 'Jogador',
        cards: chars.map(toCard),
      });
    }
  } else {
    groups.push({ ownerLabel: '', cards: list.map(toCard) });
  }

  const showSearch = isMestre || list.length > 6;

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

      {list.length === 0 ? (
        <div className="panel p-8 text-center text-ink-muted">
          Nenhuma ficha ainda.{' '}
          <Link href="/fichas/nova" className="text-crimson-soft hover:underline">
            Criar a primeira
          </Link>
        </div>
      ) : (
        <CharacterBrowser groups={groups} showSearch={showSearch} />
      )}
    </div>
  );
}