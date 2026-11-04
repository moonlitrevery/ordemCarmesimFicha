import { describe, expect, it } from 'vitest';
import { collectOnline } from './presence';
import type { VttPresence } from './types';

function presence(userId: string, name: string): VttPresence {
  return { userId, name, role: 'jogador', sceneId: null };
}

describe('collectOnline', () => {
  it('conta uma vez o usuário com várias abas', () => {
    const online = collectOnline({
      a: [presence('a', 'Ana'), presence('a', 'Ana')],
    });
    expect(online).toHaveLength(1);
  });

  it('usa a presença mais recente do usuário', () => {
    const online = collectOnline({
      a: [presence('a', 'Nome antigo'), presence('a', 'Nome novo')],
    });
    expect(online[0].name).toBe('Nome novo');
  });

  it('ordena por nome e ignora chave sem presença', () => {
    const online = collectOnline({
      b: [presence('b', 'Bruno')],
      c: [],
      a: [presence('a', 'Ágata')],
    });
    expect(online.map((p) => p.userId)).toEqual(['a', 'b']);
  });
});
