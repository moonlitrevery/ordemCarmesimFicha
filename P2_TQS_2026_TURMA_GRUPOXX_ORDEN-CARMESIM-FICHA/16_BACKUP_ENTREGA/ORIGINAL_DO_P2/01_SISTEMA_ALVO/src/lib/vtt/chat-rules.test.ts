import { describe, expect, it } from 'vitest';
import {
  canDeleteMessage,
  isChatRoll,
  mergeChatMessages,
  type ChatMessage,
} from './chat-rules';

function message(id: string, created_at: string, body = ''): ChatMessage {
  return {
    id,
    table_id: 't',
    author_id: 'u',
    author_name: 'U',
    character_id: null,
    character_name: null,
    kind: 'text',
    body,
    roll: null,
    hidden: false,
    whisper_to: null,
    deleted: false,
    created_at,
  };
}

describe('mergeChatMessages', () => {
  it('ordena e não repete; a versão nova vence', () => {
    const merged = mergeChatMessages(
      [message('b', '2026-01-02', 'velha')],
      [message('a', '2026-01-01'), message('b', '2026-01-02', 'nova')]
    );
    expect(merged.map((m) => m.id)).toEqual(['a', 'b']);
    expect(merged[1].body).toBe('nova');
  });
});

describe('canDeleteMessage', () => {
  it('mestra qualquer; autor a própria; apagada não', () => {
    const own = { author_id: 'u', deleted: false };
    expect(canDeleteMessage(own, 'mestre', 'x')).toBe(true);
    expect(canDeleteMessage(own, 'jogador', 'u')).toBe(true);
    expect(canDeleteMessage(own, 'espectador', 'u')).toBe(true);
    expect(canDeleteMessage(own, 'jogador', 'x')).toBe(false);
    expect(canDeleteMessage({ ...own, deleted: true }, 'mestre', 'x')).toBe(false);
  });
});

describe('isChatRoll', () => {
  it('recusa jsonb torto', () => {
    const good = {
      notation: '1d6',
      groups: [{ sides: 6, results: [3] }],
      modifier: 0,
      total: 3,
      math: '3',
      label: '',
    };
    expect(isChatRoll(good)).toBe(true);
    expect(isChatRoll(null)).toBe(false);
    expect(isChatRoll({ ...good, groups: 'x' })).toBe(false);
    expect(isChatRoll({ ...good, groups: [{ sides: 6, results: ['<b>'] }] })).toBe(false);
    expect(isChatRoll({ ...good, total: '3' })).toBe(false);
  });
});
