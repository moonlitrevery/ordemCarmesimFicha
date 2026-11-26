import { describe, expect, it } from 'vitest';
import { isCommandShortcut, normalizeSearch, searchCommands, type CommandItem } from './command-search';

const item = (kind: CommandItem['kind'], title: string, subtitle?: string): CommandItem => ({
  key: kind + ':' + title,
  kind,
  id: title,
  title,
  subtitle,
});

const ITEMS = [
  item('ficha', 'Áma Duarte', 'Joana'),
  item('npc', 'Cão de Caça', 'Mesa de domingo'),
  item('pagina', 'Pousada — térreo', 'Mesa de domingo'),
  item('grupo', 'Grupo principal'),
  item('lore', 'Planos de Existência'),
  item('regras', 'Elementos e Fragmentos'),
];

describe('busca rápida da mestra', () => {
  it('ignora acento e maiúsculas', () => {
    expect(normalizeSearch('  Pousada  TÉRREO ')).toBe('pousada terreo');
    expect(searchCommands(ITEMS, 'ama').map((i) => i.title)).toEqual(['Áma Duarte']);
    expect(searchCommands(ITEMS, 'terreo').map((i) => i.title)).toEqual(['Pousada — térreo']);
  });

  it('toda palavra precisa aparecer (título, subtítulo ou tipo)', () => {
    expect(searchCommands(ITEMS, 'domingo cao').map((i) => i.title)).toEqual(['Cão de Caça']);
    expect(searchCommands(ITEMS, 'npc').map((i) => i.title)).toEqual(['Cão de Caça']);
    expect(searchCommands(ITEMS, 'joana').map((i) => i.title)).toEqual(['Áma Duarte']);
  });

  it('começo do título vem antes do meio', () => {
    const list = [item('lore', 'A Ordem dos Planos'), item('lore', 'Planos de Existência')];
    expect(searchCommands(list, 'planos').map((i) => i.title)).toEqual(['Planos de Existência', 'A Ordem dos Planos']);
  });

  it('sem busca, lista por tipo', () => {
    expect(searchCommands(ITEMS, '').map((i) => i.kind)).toEqual(['ficha', 'npc', 'pagina', 'grupo', 'lore', 'regras']);
  });

  it('atalho: Ctrl+K e Cmd+K, sem Alt nem Shift', () => {
    const base = { key: 'k', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };
    expect(isCommandShortcut({ ...base, ctrlKey: true })).toBe(true);
    expect(isCommandShortcut({ ...base, metaKey: true, key: 'K' })).toBe(true);
    expect(isCommandShortcut({ ...base, ctrlKey: true, shiftKey: true })).toBe(false);
    expect(isCommandShortcut(base)).toBe(false);
  });
});
