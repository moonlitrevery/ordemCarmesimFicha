import type { Drawing, SceneObject } from './types';

/**
 * Eventos de broadcast do canal da mesa. Qualquer membro consegue enviar no
 * canal, então `session:state`, `member:changed`, `table:refresh`, `asset:*`, `scene:assign`,
 * `scene:refresh`, `initiative:refresh`, `npc:refresh` e `fx:weather` são só avisos: quem recebe relê o estado do banco. Os de
 * objeto e desenho levam a linha já gravada, validada na chegada.
 */
export type VttEvent =
  | { type: 'session:state'; open: boolean }
  | { type: 'member:changed'; userId: string }
  /** A mestra mudou uma configuração da mesa (transição entre cenas). */
  | { type: 'table:refresh' }
  | { type: 'asset:pending' }
  /** A mestra aprovou ou recusou: quem tem colocação pendente relê. */
  | { type: 'asset:resolved' }
  /** Mudou cena padrão, quem está em qual cena, ou a lista de cenas. */
  | { type: 'scene:assign' }
  /** Mudou algo que não deve viajar pelo canal (oculto, cena em preparo). */
  | { type: 'scene:refresh'; sceneId: string }
  /** Durante o arraste: transformação própria do objeto, sem gravar. */
  | { type: 'obj:drag'; sceneId: string; id: string; x: number; y: number }
  | { type: 'obj:upsert'; object: SceneObject }
  | { type: 'obj:delete'; sceneId: string; id: string }
  /** A mestra mudou a iniciativa: todos relêem `tables.initiative`. */
  | { type: 'initiative:refresh' }
  /** Sem dado nenhum: só a outra aba da mestra consegue reler `npcs`. */
  | { type: 'npc:refresh' }
  /** A mestra mudou clima ou iluminação: quem está na cena relê `weather` e `lighting`. */
  | { type: 'fx:weather'; sceneId: string }
  | { type: 'draw:add'; drawing: Drawing }
  /** `id` nulo: a mestra apagou todos os desenhos da cena. */
  | { type: 'draw:delete'; sceneId: string; id: string | null }
  | { type: 'ping'; sceneId: string; userId: string; x: number; y: number }
  /** `line` nula: terminou de medir. */
  | {
      type: 'ruler';
      sceneId: string;
      userId: string;
      line: [number, number, number, number] | null;
    };

export type VttEventType = VttEvent['type'];

export type VttEventOf<T extends VttEventType> = Extract<VttEvent, { type: T }>;
