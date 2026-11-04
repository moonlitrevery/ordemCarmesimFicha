import type { InitiativeEntry, InitiativeState } from './types';

export const DEFAULT_INITIATIVE_NOTATION = '1d20';
/** Token oculto ou legenda ofuscada: a coluna é lida por todos os membros. */
export const SECRET_ENTRY_NAME = '???';

const MAX_ENTRIES = 200;
const MAX_NAME_LENGTH = 120;
const MAX_NOTATION_LENGTH = 60;

export const EMPTY_INITIATIVE: InitiativeState = {
  entries: [],
  current: 0,
  round: 1,
  notation: DEFAULT_INITIATIVE_NOTATION,
};

function isEntry(value: unknown): value is InitiativeEntry {
  const e = value as InitiativeEntry | null;
  return (
    !!e &&
    typeof e.id === 'string' &&
    typeof e.name === 'string' &&
    (e.value === null || Number.isFinite(e.value)) &&
    (e.objectId === null || typeof e.objectId === 'string') &&
    Number.isInteger(e.turn) &&
    Number.isInteger(e.turns)
  );
}

function clampCurrent(current: unknown, length: number): number {
  if (!Number.isInteger(current) || length === 0) return 0;
  return Math.max(0, Math.min(length - 1, current as number));
}

/** A coluna nasce sem `notation` e o jsonb não tem forma garantida. */
export function parseInitiative(value: unknown): InitiativeState {
  const raw = value as Partial<InitiativeState> | null;
  if (!raw || typeof raw !== 'object') return EMPTY_INITIATIVE;
  const entries = Array.isArray(raw.entries) ? raw.entries.filter(isEntry) : [];
  return {
    entries,
    current: clampCurrent(raw.current, entries.length),
    round:
      Number.isInteger(raw.round) && (raw.round as number) > 0
        ? (raw.round as number)
        : 1,
    notation:
      typeof raw.notation === 'string' && raw.notation
        ? raw.notation.slice(0, MAX_NOTATION_LENGTH)
        : DEFAULT_INITIATIVE_NOTATION,
  };
}

export function currentEntry(state: InitiativeState): InitiativeEntry | null {
  return state.entries[state.current] ?? null;
}

/** Criatura com N turnos por rodada aparece N vezes, cada uma com o próprio valor. */
export function entriesFor(
  input: { name: string; objectId: string | null; turns: number },
  makeId: () => string
): InitiativeEntry[] {
  const turns = Math.max(1, Math.round(input.turns) || 1);
  return Array.from({ length: turns }, (_unused, index) => ({
    id: makeId(),
    name: input.name.trim().slice(0, MAX_NAME_LENGTH) || 'Sem nome',
    value: null,
    objectId: input.objectId,
    turn: index + 1,
    turns,
  }));
}

export function addEntries(
  state: InitiativeState,
  entries: InitiativeEntry[]
): InitiativeState {
  return { ...state, entries: [...state.entries, ...entries].slice(0, MAX_ENTRIES) };
}

export function updateEntry(
  state: InitiativeState,
  id: string,
  patch: Partial<Pick<InitiativeEntry, 'name' | 'value'>>
): InitiativeState {
  const clipped =
    patch.name === undefined
      ? patch
      : { ...patch, name: patch.name.slice(0, MAX_NAME_LENGTH) };
  return {
    ...state,
    entries: state.entries.map((entry) =>
      entry.id === id ? { ...entry, ...clipped } : entry
    ),
  };
}

/** Reordenar não pode passar a vez: o turno atual acompanha quem estava nele. */
function reordered(
  state: InitiativeState,
  entries: InitiativeEntry[]
): InitiativeState {
  const active = currentEntry(state);
  const index = active ? entries.findIndex((e) => e.id === active.id) : 0;
  return { ...state, entries, current: Math.max(0, index) };
}

export function removeEntry(state: InitiativeState, id: string): InitiativeState {
  const index = state.entries.findIndex((entry) => entry.id === id);
  if (index < 0) return state;
  const entries = state.entries.filter((entry) => entry.id !== id);
  // Tirar quem está na vez passa para o seguinte, que agora ocupa o mesmo índice.
  const current = index < state.current ? state.current - 1 : state.current;
  return { ...state, entries, current: clampCurrent(current, entries.length) };
}

/** Decrescente e estável: empate mantém a ordem que a mestra arrastou. Sem valor vai ao fim. */
export function sortEntries(state: InitiativeState): InitiativeState {
  const entries = state.entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const left = a.entry.value ?? -Infinity;
      const right = b.entry.value ?? -Infinity;
      return left === right ? a.index - b.index : right - left;
    })
    .map(({ entry }) => entry);
  return reordered(state, entries);
}

export function moveEntry(
  state: InitiativeState,
  id: string,
  targetIndex: number
): InitiativeState {
  const from = state.entries.findIndex((entry) => entry.id === id);
  if (from < 0 || targetIndex < 0 || targetIndex >= state.entries.length) {
    return state;
  }
  const entries = state.entries.slice();
  const [moved] = entries.splice(from, 1);
  entries.splice(targetIndex, 0, moved);
  return reordered(state, entries);
}

export function nextTurn(state: InitiativeState): InitiativeState {
  if (state.entries.length === 0) return state;
  const wraps = state.current >= state.entries.length - 1;
  return {
    ...state,
    current: wraps ? 0 : state.current + 1,
    round: wraps ? state.round + 1 : state.round,
  };
}

/** No primeiro turno da primeira rodada não há para onde voltar. */
export function previousTurn(state: InitiativeState): InitiativeState {
  if (state.entries.length === 0) return state;
  if (state.current > 0) return { ...state, current: state.current - 1 };
  if (state.round <= 1) return state;
  return {
    ...state,
    current: state.entries.length - 1,
    round: state.round - 1,
  };
}

export function clearInitiative(state: InitiativeState): InitiativeState {
  return { ...EMPTY_INITIATIVE, notation: state.notation };
}
