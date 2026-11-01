import { describe, expect, it } from 'vitest';
import {
  buildWhisperTargets,
  chatSuggestions,
  parseChatInput,
  type WhisperTarget,
} from './chat-commands';

const targets: WhisperTarget[] = [
  { userId: 'u1', name: 'Ana' },
  { userId: 'u2', name: 'Maria' },
  { userId: 'u3', name: 'Maria Clara' },
  { userId: 'u4', name: 'Kaël', color: '#123456' },
];

describe('parseChatInput', () => {
  it('texto comum', () => {
    expect(parseChatInput(' oi ', targets)).toEqual({ kind: 'text', body: 'oi' });
  });

  it('/r com e sem rótulo', () => {
    expect(parseChatInput('/r 2d6+1d4+2', targets)).toEqual({
      kind: 'roll',
      notation: '2d6+1d4+2',
      label: '',
      hidden: false,
    });
    expect(parseChatInput('/r 1d20 Ataque com faca', targets)).toMatchObject({
      label: 'Ataque com faca',
    });
  });

  it('/rs é escondida', () => {
    expect(parseChatInput('/rs 1d20', targets)).toMatchObject({
      kind: 'roll',
      hidden: true,
    });
  });

  it('rolagem inválida explica', () => {
    expect(parseChatInput('/r banana', targets).kind).toBe('error');
    expect(parseChatInput('/r', targets).kind).toBe('error');
  });

  it('/shiu escolhe o nome mais longo', () => {
    expect(parseChatInput('/shiu Maria Clara oi tudo', targets)).toMatchObject({
      kind: 'whisper',
      to: { userId: 'u3' },
      body: 'oi tudo',
    });
    expect(parseChatInput('/shiu Maria oi', targets)).toMatchObject({
      to: { userId: 'u2' },
      body: 'oi',
    });
  });

  it('/shiu ignora acento e caixa', () => {
    expect(parseChatInput('/shiu kael psiu', targets)).toMatchObject({
      to: { userId: 'u4' },
      body: 'psiu',
    });
  });

  it('/shiu recusa quem não é da lista, como um personagem', () => {
    expect(parseChatInput('/shiu Dra. Vex oi', targets).kind).toBe('error');
  });

  it('/shiu não confunde prefixo de palavra', () => {
    expect(parseChatInput('/shiu Anabel oi', targets).kind).toBe('error');
  });

  it('/shiu sem mensagem ou sem destino', () => {
    expect(parseChatInput('/shiu Ana', targets).kind).toBe('error');
    expect(parseChatInput('/shiu Zé oi', targets).kind).toBe('error');
  });

  it('comando desconhecido', () => {
    expect(parseChatInput('/nada', targets).kind).toBe('error');
  });
});

describe('chatSuggestions', () => {
  it('lista comandos ao digitar /', () => {
    expect(chatSuggestions('/', targets).map((s) => s.label)).toEqual([
      '/r',
      '/rs',
      '/shiu',
    ]);
    expect(chatSuggestions('/s', targets).map((s) => s.label)).toEqual(['/shiu']);
    expect(chatSuggestions('oi', targets)).toEqual([]);
  });

  it('lista nomes depois de /shiu', () => {
    expect(chatSuggestions('/shiu ', targets)).toHaveLength(4);
    const [first] = chatSuggestions('/shiu kae', targets);
    expect(first).toEqual({
      value: '/shiu Kaël ',
      label: 'Kaël',
      person: { userId: 'u4', color: '#123456' },
    });
  });

  it('nome escolhido encerra a lista', () => {
    expect(chatSuggestions('/shiu Ana ', targets)).toEqual([]);
    expect(chatSuggestions('/shiu Ana oi', targets)).toEqual([]);
  });

  it('/r não sugere nomes', () => {
    expect(chatSuggestions('/r 1d', targets)).toEqual([]);
  });
});

describe('buildWhisperTargets', () => {
  it('só pessoas, em ordem, sem a própria', () => {
    const list = buildWhisperTargets(
      [
        { userId: 'eu', name: 'Eu' },
        { userId: 'b', name: 'Bia' },
        { userId: 'a', name: 'Ana' },
      ],
      'eu'
    );
    expect(list.map((t) => t.name)).toEqual(['Ana', 'Bia']);
  });
});
