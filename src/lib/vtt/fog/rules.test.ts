import { describe, expect, it } from 'vitest';
import type { SceneObject } from '../types';
import { classifyFog, isOwnObject, rootOf, seesPlayerFog } from './rules';

function object(id: string, patch: Partial<SceneObject> = {}): SceneObject {
  return {
    id,
    scene_id: 's1',
    asset_id: 'a1',
    kind: 'token',
    x: 0,
    y: 0,
    rotation: 0,
    scale: 1,
    flip_x: false,
    flip_y: false,
    z: 0,
    parent_id: null,
    local: null,
    caption: null,
    effects: [],
    conditions: [],
    character_id: null,
    npc_id: null,
    hidden: false,
    created_by: 'gm',
    updated_at: '2026-01-01T00:00:00Z',
    ...patch,
  };
}

const LOCAL = { x: 10, y: 0, rotation: 0, scale: 1, flipX: false, flipY: false };

describe('token do jogador', () => {
  it('vinculado à ficha dele ou criado por ele', () => {
    const mine = new Set(['ficha-ama']);
    expect(isOwnObject(object('a', { character_id: 'ficha-ama' }), 'ama', mine)).toBe(true);
    // O falcão: sem ficha, mas foi ela que colocou.
    expect(isOwnObject(object('b', { created_by: 'ama' }), 'ama', mine)).toBe(true);
    expect(isOwnObject(object('c', { character_id: 'ficha-outro' }), 'ama', mine)).toBe(false);
    expect(isOwnObject(object('d'), 'ama', mine)).toBe(false);
  });

  it('a mestra só vê a névoa opaca no "Ver como jogador"', () => {
    expect(seesPlayerFog('mestre', false)).toBe(false);
    expect(seesPlayerFog('mestre', true)).toBe(true);
    expect(seesPlayerFog('jogador', false)).toBe(true);
    expect(seesPlayerFog('espectador', false)).toBe(true);
  });
});

describe('famílias sob a névoa', () => {
  const parent = object('pai');
  const child = object('filho', { parent_id: 'pai', local: LOCAL });
  const loose = object('solto');
  const objects = { pai: parent, filho: child, solto: loose };

  it('raiz do anexo é o pai', () => {
    expect(rootOf(child, objects).id).toBe('pai');
    expect(rootOf(loose, objects).id).toBe('solto');
  });

  it('inteiramente coberto some; pedaço revelado mostra a família inteira', () => {
    const none = classifyFog(objects, () => false, () => false);
    expect(Array.from(none.hidden).sort()).toEqual(['filho', 'pai', 'solto']);
    const onlyChild = classifyFog(objects, (o) => o.id === 'filho', () => false);
    expect(Array.from(onlyChild.hidden)).toEqual(['solto']);
  });

  it('o do jogador sobe para cima da névoa em vez de sumir, com os anexos', () => {
    const result = classifyFog(objects, () => false, (o) => o.id === 'pai');
    expect(Array.from(result.lifted).sort()).toEqual(['filho', 'pai']);
    expect(Array.from(result.hidden)).toEqual(['solto']);
  });

  it('revelado não sobe: fica na ordem de sempre', () => {
    const result = classifyFog(objects, () => true, () => true);
    expect(result.hidden.size).toBe(0);
    expect(result.lifted.size).toBe(0);
  });
});
