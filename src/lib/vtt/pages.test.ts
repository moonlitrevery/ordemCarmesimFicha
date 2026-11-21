import { describe, expect, it } from 'vitest';
import {
  addFolderIn,
  canRemovePage,
  folderCounts,
  folderList,
  formatTileScale,
  gridCellPx,
  metersPerPxFromTiles,
  normalizeSearch,
  parseFolders,
  renameFolderIn,
  reorderPages,
  uniqueFolderName,
  visiblePages,
} from './pages';

const page = (id: string, name: string, folder = '', archived = false) => ({
  id,
  name,
  folder,
  archived,
});

const PAGES = [
  page('a', 'Praça de Trocchia'),
  page('b', 'Pousada — térreo', 'Cidade'),
  page('c', 'Pousada — 1º andar', 'Cidade'),
  page('d', 'Vale', 'Fora', true),
  page('e', 'Cripta'),
];

describe('pastas', () => {
  it('parseFolders limpa, tira repetidas e ignora o que não é texto', () => {
    expect(parseFolders(['  Cidade ', 'Cidade', '', 3, 'Fora'])).toEqual(['Cidade', 'Fora']);
    expect(parseFolders(null)).toEqual([]);
    expect(parseFolders({})).toEqual([]);
  });

  it('folderList mantém a ordem salva e põe as órfãs no fim', () => {
    expect(folderList(['Fora'], PAGES)).toEqual(['Fora', 'Cidade']);
    expect(folderList([], [page('x', 'x', 'Zeta'), page('y', 'y', 'Alfa')])).toEqual(['Alfa', 'Zeta']);
  });

  it('folderCounts não conta arquivadas', () => {
    expect(Object.fromEntries(folderCounts(PAGES))).toEqual({ Cidade: 2 });
  });

  it('renomear junta com uma pasta de mesmo nome e recusa nome vazio', () => {
    expect(renameFolderIn(['A', 'B'], 'A', 'B')).toEqual(['B']);
    expect(renameFolderIn(['A', 'B'], 'A', ' C ')).toEqual(['C', 'B']);
    expect(renameFolderIn(['A'], 'A', '  ')).toEqual(['A']);
  });

  it('adicionar e nome livre', () => {
    expect(addFolderIn(['A'], 'A')).toEqual(['A']);
    expect(addFolderIn(['A'], 'B')).toEqual(['A', 'B']);
    expect(uniqueFolderName(['Nova pasta', 'Nova pasta 2'])).toBe('Nova pasta 3');
    expect(uniqueFolderName([])).toBe('Nova pasta');
  });
});

describe('visiblePages', () => {
  const ids = (list: { id: string }[]) => list.map((item) => item.id);

  it('"Todas" mostra só as soltas não arquivadas', () => {
    expect(ids(visiblePages(PAGES, { kind: 'all' }, ''))).toEqual(['a', 'e']);
  });

  it('pasta e arquivadas', () => {
    expect(ids(visiblePages(PAGES, { kind: 'folder', name: 'Cidade' }, ''))).toEqual(['b', 'c']);
    expect(ids(visiblePages(PAGES, { kind: 'archived' }, ''))).toEqual(['d']);
  });

  it('busca ignora acento e caixa e atravessa pastas', () => {
    expect(ids(visiblePages(PAGES, { kind: 'all' }, 'POUSADA'))).toEqual(['b', 'c']);
    expect(ids(visiblePages(PAGES, { kind: 'all' }, 'praca'))).toEqual(['a']);
    expect(ids(visiblePages(PAGES, { kind: 'all' }, 'vale'))).toEqual([]);
    expect(ids(visiblePages(PAGES, { kind: 'archived' }, 'vale'))).toEqual(['d']);
    expect(ids(visiblePages(PAGES, { kind: 'folder', name: 'Cidade' }, 'térreo'))).toEqual(['b']);
  });

  it('normalizeSearch', () => {
    expect(normalizeSearch('  Ação ')).toBe('acao');
  });
});

describe('regras da fita e ordem', () => {
  it('a página da fita não é arquivada nem apagada', () => {
    expect(canRemovePage('a', 'a')).toBe(false);
    expect(canRemovePage('a', 'b')).toBe(true);
    expect(canRemovePage('a', null)).toBe(true);
  });

  it('reorderPages', () => {
    const list = [{ id: '1' }, { id: '2' }, { id: '3' }];
    expect(reorderPages(list, '3', '1')?.map((item) => item.id)).toEqual(['3', '1', '2']);
    expect(reorderPages(list, '1', '3')?.map((item) => item.id)).toEqual(['2', '3', '1']);
    expect(reorderPages(list, '1', '1')).toBeNull();
    expect(reorderPages(list, '1', 'x')).toBeNull();
  });
});

describe('escala em quadrados', () => {
  it('largura em quadrados vira metros por pixel', () => {
    // 40 quadrados de 1,5 m numa imagem de 4096 px.
    expect(metersPerPxFromTiles(40, 4096)).toBeCloseTo(60 / 4096);
    expect(metersPerPxFromTiles(0, 4096)).toBeNull();
    expect(metersPerPxFromTiles(40, 0)).toBeNull();
  });

  it('gridCellPx e o texto do chip', () => {
    expect(gridCellPx(1.5 / 100)).toBeCloseTo(100);
    expect(gridCellPx(null)).toBeNull();
    expect(gridCellPx(1)).toBeNull(); // 1,5 px por quadrado: ruído
    expect(formatTileScale(1.5 / 64)).toBe('1 quadrado (1,5 m) ≈ 64 px');
  });
});
