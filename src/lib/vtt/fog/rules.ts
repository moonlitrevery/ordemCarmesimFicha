import { effectiveParent } from '../scene-rules';
import type { SceneObject, TableRole } from '../types';

/**
 * Token "do jogador" (Fase 11): vinculado a uma ficha dele ou criado por ele
 * (o falcão da Áma não tem ficha). Nunca some para ele, nem dentro da névoa.
 */
export function isOwnObject(
  object: Pick<SceneObject, 'created_by' | 'character_id'>,
  userId: string,
  myCharacterIds: ReadonlySet<string>
): boolean {
  return (
    object.created_by === userId ||
    (object.character_id !== null && myCharacterIds.has(object.character_id))
  );
}

/** Quem vê a névoa opaca e tem objeto escondido: todo mundo menos a mestra, salvo no "Ver como jogador". */
export function seesPlayerFog(role: TableRole | undefined, playerView: boolean): boolean {
  return role !== 'mestre' || playerView;
}

export function rootOf(object: SceneObject, objects: Record<string, SceneObject>): SceneObject {
  let current = object;
  for (let parent = effectiveParent(current, objects); parent; parent = effectiveParent(current, objects)) {
    current = parent;
  }
  return current;
}

export interface FogClassification {
  /** Não aparece, não recebe hover, não entra na seleção. */
  hidden: Set<string>;
  /** Do próprio jogador e inteiramente coberto: desenhado por cima da névoa. */
  lifted: Set<string>;
}

/**
 * Por família (raiz e anexos): um anexo não flutua sem o pai, então a família
 * aparece se qualquer pedaço dela estiver revelado. Inteiramente coberta, some,
 * a menos que algum membro seja do jogador: aí sobe inteira para cima da névoa.
 */
export function classifyFog(
  objects: Record<string, SceneObject>,
  revealed: (object: SceneObject) => boolean,
  own: (object: SceneObject) => boolean
): FogClassification {
  const families = new Map<string, SceneObject[]>();
  for (const object of Object.values(objects)) {
    const root = rootOf(object, objects).id;
    const family = families.get(root);
    if (family) family.push(object);
    else families.set(root, [object]);
  }
  const hidden = new Set<string>();
  const lifted = new Set<string>();
  families.forEach((family) => {
    if (family.some(revealed)) return;
    const target = family.some(own) ? lifted : hidden;
    for (const member of family) target.add(member.id);
  });
  return { hidden, lifted };
}
