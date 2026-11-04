import { describe, expect, it } from 'vitest';
import {
  HISTORY_LIMIT,
  HistoryStack,
  invertCommand,
  isNoopPatch,
  patchBefore,
  type HistoryCommand,
} from './history';
import type { Drawing, SceneObject } from './types';

const ROW = {
  id: 'o1',
  x: 10,
  y: 20,
  rotation: 0,
  scale: 1,
  flip_x: false,
  parent_id: null,
  local: null,
  caption: null,
  hidden: false,
} as unknown as SceneObject;

const DRAWING = { id: 'd1' } as Drawing;

const patch = (id: string): HistoryCommand => ({
  type: 'patch',
  id,
  before: { x: 1 },
  after: { x: 2 },
});

describe('invertCommand', () => {
  it('troca antes e depois de um patch', () => {
    expect(invertCommand(patch('a'))).toEqual({
      type: 'patch',
      id: 'a',
      before: { x: 2 },
      after: { x: 1 },
    });
  });

  it('criar vira apagar a mesma linha, e vice-versa', () => {
    expect(invertCommand({ type: 'create', row: ROW })).toEqual({
      type: 'remove',
      row: ROW,
    });
    expect(invertCommand({ type: 'remove', row: ROW })).toEqual({
      type: 'create',
      row: ROW,
    });
  });

  it('desenhar vira apagar o mesmo desenho, e vice-versa', () => {
    expect(invertCommand({ type: 'draw-add', drawing: DRAWING })).toEqual({
      type: 'draw-remove',
      drawing: DRAWING,
    });
    expect(invertCommand({ type: 'draw-remove', drawing: DRAWING })).toEqual({
      type: 'draw-add',
      drawing: DRAWING,
    });
  });

  it('lote inverte a ordem: restaura o pai antes de reanexar os filhos', () => {
    const detachChild = patch('filho');
    const removeParent: HistoryCommand = { type: 'remove', row: ROW };
    const inverted = invertCommand({
      type: 'batch',
      commands: [detachChild, removeParent],
    });
    expect(inverted).toEqual({
      type: 'batch',
      commands: [{ type: 'create', row: ROW }, invertCommand(detachChild)],
    });
  });

  it('inverter duas vezes devolve o comando original', () => {
    const command: HistoryCommand = {
      type: 'batch',
      commands: [patch('a'), { type: 'remove', row: ROW }],
    };
    expect(invertCommand(invertCommand(command))).toEqual(command);
  });
});

describe('patchBefore', () => {
  it('guarda só os campos que o patch muda', () => {
    expect(patchBefore(ROW, { x: 99, hidden: true })).toEqual({
      x: 10,
      hidden: false,
    });
  });

  it('guarda nulo: desanexar sabe voltar a não ter pai', () => {
    expect(patchBefore(ROW, { parent_id: 'p', local: null })).toEqual({
      parent_id: null,
      local: null,
    });
  });
});

describe('isNoopPatch', () => {
  it('reconhece patch sem mudança, inclusive em objeto aninhado', () => {
    expect(isNoopPatch({ x: 1 }, { x: 1 })).toBe(true);
    expect(
      isNoopPatch(
        { local: { x: 1, y: 2, rotation: 0, scale: 1, flipX: false, flipY: false } },
        { local: { x: 1, y: 2, rotation: 0, scale: 1, flipX: false, flipY: false } }
      )
    ).toBe(true);
  });

  it('reconhece mudança', () => {
    expect(isNoopPatch({ x: 1 }, { x: 2 })).toBe(false);
    expect(isNoopPatch({ parent_id: null }, { parent_id: 'p' })).toBe(false);
  });
});

describe('HistoryStack', () => {
  it('começa vazia', () => {
    const stack = new HistoryStack();
    expect(stack.canUndo).toBe(false);
    expect(stack.canRedo).toBe(false);
    expect(stack.popUndo()).toBeUndefined();
    expect(stack.popRedo()).toBeUndefined();
  });

  it('desfaz do mais novo para o mais velho', () => {
    const stack = new HistoryStack();
    stack.record(patch('a'));
    stack.record(patch('b'));
    expect(stack.popUndo()).toEqual(patch('b'));
    expect(stack.popUndo()).toEqual(patch('a'));
  });

  it('ação nova apaga o caminho de refazer', () => {
    const stack = new HistoryStack();
    stack.pushRedo(patch('a'));
    expect(stack.canRedo).toBe(true);
    stack.record(patch('b'));
    expect(stack.canRedo).toBe(false);
  });

  it('refazer devolvendo ao desfazer não apaga o resto de refazer', () => {
    const stack = new HistoryStack();
    stack.pushRedo(patch('a'));
    stack.pushRedo(patch('b'));
    const step = stack.popRedo() as HistoryCommand;
    stack.pushUndo(step);
    expect(stack.canRedo).toBe(true);
  });

  it('guarda no máximo 20 passos e perde os mais velhos', () => {
    const stack = new HistoryStack();
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) stack.record(patch(`p${i}`));
    let count = 0;
    let oldest: HistoryCommand | undefined;
    for (let step = stack.popUndo(); step; step = stack.popUndo()) {
      oldest = step;
      count++;
    }
    expect(count).toBe(20);
    expect(oldest).toEqual(patch('p5'));
  });

  it('clear zera os dois lados', () => {
    const stack = new HistoryStack();
    stack.record(patch('a'));
    stack.pushRedo(patch('b'));
    stack.clear();
    expect(stack.canUndo).toBe(false);
    expect(stack.canRedo).toBe(false);
  });
});
