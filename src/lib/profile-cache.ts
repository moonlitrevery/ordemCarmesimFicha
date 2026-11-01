import { createClient } from '@/lib/supabase/client';

export type CachedProfile = { role: string; display_name: string };

let cached: { userId: string; profile: Promise<CachedProfile | null> } | null =
  null;

/**
 * Perfil do usuário logado, buscado uma vez por carregamento da página: Nav e
 * rolagens leem daqui. Falha não fica no cache, a próxima chamada tenta de novo.
 */
export function getCachedProfile(userId: string): Promise<CachedProfile | null> {
  if (cached?.userId === userId) return cached.profile;
  const profile = Promise.resolve(
    createClient()
      .from('profiles')
      .select('role, display_name')
      .eq('id', userId)
      .maybeSingle()
  ).then(({ data, error }) => {
    if (error) throw error;
    return data as CachedProfile | null;
  });
  const entry = { userId, profile };
  cached = entry;
  profile.catch(() => {
    if (cached === entry) cached = null;
  });
  return profile;
}
