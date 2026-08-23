import { createClient } from '@/lib/supabase/client';

export type DiceRollLogInput = {
  characterId?: string | null;
  characterName: string;
  label: string;
  notation: string;
  dieResult?: number | null;
  bonus?: number;
  total: number;
  breakdown?: string;
};

export async function logDiceRoll(input: DiceRollLogInput): Promise<void> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle();

    await supabase.from('dice_rolls').insert({
      character_id: input.characterId || null,
      character_name: input.characterName,
      roller_id: user.id,
      roller_name: profile?.display_name ?? user.email ?? 'Jogador',
      label: input.label,
      notation: input.notation,
      die_result: input.dieResult ?? null,
      bonus: input.bonus ?? 0,
      total: input.total,
      breakdown: input.breakdown ?? null,
    });
  } catch (err) {
    console.error('Falha ao registrar rolagem', err);
  }
}
