import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { CharacterSheet } from '@/components/character/CharacterSheet';
import type { Character, CharacterElementRow } from '@/types/database';

// Só o que a ficha lê (sem owner_id, *_max, datas). Coluna nova na ficha entra aqui.
const SHEET_COLUMNS =
  'id, name, occupation, age, pronouns, birthplace, residence, image_url, arcana, subarcana, ' +
  'attributes, hp_current, mana_current, sanity_current, skills, spells, weapons, inventory, money, ' +
  'armor, curses, historical_feats, milestone_notes, resource_mods, notes, backstory, ' +
  'is_order_agent, order_rank, attribute_points_spent, skill_points_spent';

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
    .select(SHEET_COLUMNS)
    .eq('id', params.id)
    .maybeSingle();

  if (!character) notFound();

  const { data: elements } = await supabase
    .from('character_elements')
    .select('id, element, level, fragments_current')
    .eq('character_id', params.id)
    .order('element');

  return (
    <CharacterSheet
      // SHEET_COLUMNS não traz owner_id, *_max nem datas, que a ficha não lê.
      character={character as unknown as Character}
      initialElements={(elements ?? []) as CharacterElementRow[]}
    />
  );
}
