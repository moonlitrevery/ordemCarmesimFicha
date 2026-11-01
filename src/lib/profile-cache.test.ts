import { beforeEach, describe, expect, it, vi } from 'vitest';

const maybeSingle = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
    }),
  }),
}));

const profile = { role: 'mestre', display_name: 'Ana' };

describe('getCachedProfile', () => {
  let getCachedProfile: typeof import('./profile-cache').getCachedProfile;

  beforeEach(async () => {
    vi.resetModules();
    maybeSingle.mockReset();
    ({ getCachedProfile } = await import('./profile-cache'));
  });

  it('busca uma vez só por usuário, mesmo com chamadas simultâneas', async () => {
    maybeSingle.mockResolvedValue({ data: profile, error: null });
    const [a, b] = await Promise.all([
      getCachedProfile('u1'),
      getCachedProfile('u1'),
    ]);
    await getCachedProfile('u1');
    expect(a).toEqual(profile);
    expect(b).toEqual(profile);
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it('troca de usuário busca de novo', async () => {
    maybeSingle.mockResolvedValue({ data: profile, error: null });
    await getCachedProfile('u1');
    await getCachedProfile('u2');
    expect(maybeSingle).toHaveBeenCalledTimes(2);
  });

  it('falha não fica no cache', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: new Error('rede') });
    await expect(getCachedProfile('u1')).rejects.toThrow('rede');
    maybeSingle.mockResolvedValueOnce({ data: profile, error: null });
    await expect(getCachedProfile('u1')).resolves.toEqual(profile);
  });
});
