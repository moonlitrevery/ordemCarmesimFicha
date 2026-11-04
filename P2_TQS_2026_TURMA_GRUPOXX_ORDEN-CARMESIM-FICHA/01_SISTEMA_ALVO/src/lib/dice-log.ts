import { getCachedProfile } from '@/lib/profile-cache';
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
    // Sessão local: quem valida o usuário no insert é o RLS.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    const profile = await getCachedProfile(user.id).catch(() => null);

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
