import { describe, expect, it } from 'vitest';
import {
  addEntries,
  clearInitiative,
  currentEntry,
  EMPTY_INITIATIVE,
  entriesFor,
  moveEntry,
  nextTurn,
  parseInitiative,
  previousTurn,
  removeEntry,
  sortEntries,
  updateEntry,
} from './initiative';
import type { InitiativeState } from './types';

let counter = 0;
const makeId = () => `e${++counter}`;

function withEntries(values: [string, number | null][]): InitiativeState {
  return {
    ...EMPTY_INITIATIVE,
    entries: values.map(([id, value]) => ({
      id,
      name: id,
      value,
      objectId: null,
      turn: 1,
      turns: 1,
    })),
  };
}

const ids = (state: InitiativeState) => state.entries.map((e) => e.id);

describe('entriesFor', () => {
  it('criatura de 2 turnos aparece 2 vezes, com o mesmo token', () => {
    const entries = entriesFor({ name: 'Aberração', objectId: 'tok', turns: 2 }, makeId);
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.turn)).toEqual([1, 2]);
    expect(entries.every((e) => e.objectId === 'tok' && e.turns === 2)).toBe(true);
    expect(new Set(entries.map((e) => e.id)).size).toBe(2);
  });

  it('turnos inválidos viram 1 e nome vazio ganha um rótulo', () => {
    const [entry, extra] = entriesFor({ name: ' ', objectId: null, turns: 0 }, makeId);
    expect(entry.name).toBe('Sem nome');
    expect(extra).toBeUndefined();
  });
});

describe('turnos', () => {
  it('próximo dá a volta e soma rodada', () => {
    let state = withEntries([['a', 1], ['b', 2]]);
    state = nextTurn(state);
    expect(currentEntry(state)?.id).toBe('b');
    expect(state.round).toBe(1);
    state = nextTurn(state);
    expect(currentEntry(state)?.id).toBe('a');
    expect(state.round).toBe(2);
  });

  it('anterior volta a rodada, mas não antes da primeira', () => {
    let state = withEntries([['a', 1], ['b', 2]]);
    expect(previousTurn(state)).toBe(state);
    state = nextTurn(nextTurn(state));
    state = previousTurn(state);
    expect(currentEntry(state)?.id).toBe('b');
    expect(state.round).toBe(1);
  });

  it('lista vazia não anda', () => {
    expect(nextTurn(EMPTY_INITIATIVE)).toBe(EMPTY_INITIATIVE);
    expect(currentEntry(EMPTY_INITIATIVE)).toBeNull();
  });
});

describe('ordem', () => {
  it('ordena decrescente, sem valor no fim, empate mantém a ordem', () => {
    const state = sortEntries(
      withEntries([['a', 5], ['b', null], ['c', 9], ['d', 5]])
    );
    expect(ids(state)).toEqual(['c', 'a', 'd', 'b']);
  });

  it('dois sem valor não viram NaN e mantêm a ordem', () => {
    expect(ids(sortEntries(withEntries([['a', null], ['b', null]])))).toEqual(['a', 'b']);
  });

  it('ordenar e arrastar não passam a vez', () => {
    let state = nextTurn(withEntries([['a', 1], ['b', 2], ['c', 3]]));
    state = sortEntries(state);
    expect(currentEntry(state)?.id).toBe('b');
    state = moveEntry(state, 'b', 2);
    expect(ids(state)).toEqual(['c', 'a', 'b']);
    expect(currentEntry(state)?.id).toBe('b');
  });

  it('mover para fora da lista não faz nada', () => {
    const state = withEntries([['a', 1]]);
    expect(moveEntry(state, 'a', 5)).toBe(state);
    expect(moveEntry(state, 'zz', 0)).toBe(state);
  });
});

describe('remover', () => {
  const three = () => nextTurn(withEntries([['a', 1], ['b', 2], ['c', 3]]));

  it('antes de quem está na vez: a vez continua com a mesma pessoa', () => {
    expect(currentEntry(removeEntry(three(), 'a'))?.id).toBe('b');
  });

  it('quem está na vez: passa para o seguinte', () => {
    expect(currentEntry(removeEntry(three(), 'b'))?.id).toBe('c');
  });

  it('último da lista na vez: volta para um índice válido', () => {
    const state = removeEntry(nextTurn(three()), 'c');
    expect(state.current).toBe(1);
  });

  it('esvaziar zera o índice', () => {
    const state = removeEntry(withEntries([['a', 1]]), 'a');
    expect(state.current).toBe(0);
  });
});

describe('edição', () => {
  it('muda só a entrada pedida', () => {
    const state = updateEntry(withEntries([['a', 1], ['b', 2]]), 'b', { value: 7 });
    expect(state.entries.map((e) => e.value)).toEqual([1, 7]);
  });

  it('limpar mantém a notação escolhida', () => {
    const state = addEntries(
      { ...EMPTY_INITIATIVE, notation: '2d10', round: 4 },
      entriesFor({ name: 'x', objectId: null, turns: 1 }, makeId)
    );
    expect(clearInitiative(state)).toEqual({ ...EMPTY_INITIATIVE, notation: '2d10' });
  });
});

describe('parseInitiative', () => {
  it('aceita o default da coluna, sem notação', () => {
    expect(parseInitiative({ entries: [], current: 0, round: 1 })).toEqual(EMPTY_INITIATIVE);
  });

  it('não confia no formato', () => {
    expect(parseInitiative(null)).toEqual(EMPTY_INITIATIVE);
    const parsed = parseInitiative({
      entries: [
        { id: 'a' },
        { id: 'b', name: 'B', value: null, objectId: null, turn: 1, turns: 1 },
      ],
      current: 99,
      round: -2,
    });
    expect(parsed.entries.map((e) => e.id)).toEqual(['b']);
    expect(parsed.current).toBe(0);
    expect(parsed.round).toBe(1);
  });
});
