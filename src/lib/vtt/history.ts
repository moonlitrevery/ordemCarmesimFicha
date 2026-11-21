import type { ObjectPatch } from './scene-rules';
import type { FogRegion } from './fog/mask';
import type { Drawing, SceneObject } from './types';

export const HISTORY_LIMIT = 20;

/**
 * Cada comando descreve o que fazer ao ser aplicado; desfazer é aplicar o inverso.
 * `create` e `remove` guardam a linha inteira, para o objeto voltar com o mesmo id.
 */
export type HistoryCommand =
  | { type: 'patch'; id: string; before: ObjectPatch; after: ObjectPatch }
  | { type: 'create'; row: SceneObject }
  | { type: 'remove'; row: SceneObject }
  | { type: 'draw-add'; drawing: Drawing }
  | { type: 'draw-remove'; drawing: Drawing }
  /** Um traço de névoa (Fase 11): o mesmo recorte de células antes e depois. */
  | { type: 'fog'; sceneId: string; before: FogRegion; after: FogRegion }
  | { type: 'batch'; commands: HistoryCommand[] };

export function invertCommand(command: HistoryCommand): HistoryCommand {
  switch (command.type) {
    case 'patch':
      return {
        type: 'patch',
        id: command.id,
        before: command.after,
        after: command.before,
      };
    case 'create':
      return { type: 'remove', row: command.row };
    case 'remove':
      return { type: 'create', row: command.row };
    case 'draw-add':
      return { type: 'draw-remove', drawing: command.drawing };
    case 'draw-remove':
      return { type: 'draw-add', drawing: command.drawing };
    case 'fog':
      return { type: 'fog', sceneId: command.sceneId, before: command.after, after: command.before };
    case 'batch':
      // Ordem contrária: quem foi feito por último é desfeito primeiro.
      return {
        type: 'batch',
        commands: command.commands.slice().reverse().map(invertCommand),
      };
  }
}

/** Os valores atuais dos mesmos campos que o patch vai mudar. */
export function patchBefore(object: SceneObject, patch: ObjectPatch): ObjectPatch {
  const before: Record<string, unknown> = {};
  for (const key of Object.keys(patch) as (keyof ObjectPatch)[]) {
    before[key] = object[key];
  }
  return before as ObjectPatch;
}

/** Soltar o token onde ele estava, ou salvar a mesma legenda, não vira um passo. */
export function isNoopPatch(before: ObjectPatch, after: ObjectPatch): boolean {
  return (Object.keys(after) as (keyof ObjectPatch)[]).every(
    (key) => JSON.stringify(before[key]) === JSON.stringify(after[key])
  );
}

/** Pilha só em memória, por pessoa: some ao recarregar ou trocar de cena. */
export class HistoryStack {
  private undoSteps: HistoryCommand[] = [];
  private redoSteps: HistoryCommand[] = [];

  constructor(private limit = HISTORY_LIMIT) {}

  get canUndo(): boolean {
    return this.undoSteps.length > 0;
  }

  get canRedo(): boolean {
    return this.redoSteps.length > 0;
  }

  /** Ação nova: o caminho de refazer deixa de existir. */
  record(command: HistoryCommand) {
    this.pushUndo(command);
    this.redoSteps = [];
  }

  popUndo(): HistoryCommand | undefined {
    return this.undoSteps.pop();
  }

  popRedo(): HistoryCommand | undefined {
    return this.redoSteps.pop();
  }

  pushUndo(command: HistoryCommand) {
    this.undoSteps.push(command);
    if (this.undoSteps.length > this.limit) this.undoSteps.shift();
  }

  pushRedo(command: HistoryCommand) {
    this.redoSteps.push(command);
    if (this.redoSteps.length > this.limit) this.redoSteps.shift();
  }

  clear() {
    this.undoSteps = [];
    this.redoSteps = [];
  }

  /** Tira os passos que já não fazem sentido (névoa desligada), mantendo o resto. */
  removeWhere(test: (command: HistoryCommand) => boolean) {
    this.undoSteps = this.undoSteps.filter((command) => !test(command));
    this.redoSteps = this.redoSteps.filter((command) => !test(command));
  }
}
