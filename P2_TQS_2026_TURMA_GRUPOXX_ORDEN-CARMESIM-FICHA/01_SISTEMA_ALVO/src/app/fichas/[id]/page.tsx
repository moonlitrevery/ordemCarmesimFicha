import { notFound, redirect } from 'next/navigation';
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
