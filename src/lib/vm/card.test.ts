import { describe, expect, it } from 'vitest';
import { DEFAULT_ATTRIBUTES } from '@/types/database';
import { elementTags, moveInList, removeElement, resourceTone, upsertElement } from './card';
import { toVmCharacter, toVmNpc, type VmCharacter } from './data';

function char(id: string, elements: VmCharacter['elements'] = []): VmCharacter {
  return {
    id,
    owner_id: 'o',
    ownerName: 'Dona',
    name: id,
    image_url: null,
    attributes: { ...DEFAULT_ATTRIBUTES },
    hp_current: 10,
    mana_current: 10,
    sanity_current: 10,
    resource_mods: null,
    elements,
  };
}

describe('resourceTone', () => {
  it('normal, amarelo abaixo de 50%, vermelho abaixo de 25%', () => {
    expect(resourceTone(40, 40)).toBe('normal');
    expect(resourceTone(20, 40)).toBe('normal');
    expect(resourceTone(19, 40)).toBe('warn');
    expect(resourceTone(10, 40)).toBe('warn');
    expect(resourceTone(9, 40)).toBe('danger');
    expect(resourceTone(0, 40)).toBe('danger');
  });

  it('sem máximo não pinta', () => {
    expect(resourceTone(0, 0)).toBe('normal');
  });
});

describe('elementTags', () => {
  it('maior nível primeiro e esconde nível 0', () => {
    const tags = elementTags([
      { id: '1', element: 'sombra', level: 1 },
      { id: '2', element: 'fogo', level: 3 },
      { id: '3', element: 'agua', level: 0 },
      { id: '4', element: 'sangue', level: 2 },
    ]);
    expect(tags.map((t) => t.element)).toEqual(['fogo', 'sangue', 'sombra']);
  });
});

describe('eventos de elemento', () => {
  it('upsert troca só o personagem dono e mantém a identidade dos outros', () => {
    const a = char('a', [{ id: 'e1', element: 'fogo', level: 1 }]);
    const b = char('b');
    const next = upsertElement({ a, b }, 'a', { id: 'e1', element: 'fogo', level: 2 });
    expect(next.a.elements).toEqual([{ id: 'e1', element: 'fogo', level: 2 }]);
    expect(next.a).not.toBe(a);
    expect(next.b).toBe(b);
  });

  it('delete pelo id; id desconhecido devolve o mesmo objeto', () => {
    const map = { a: char('a', [{ id: 'e1', element: 'fogo', level: 1 }]) };
    expect(removeElement(map, 'e1').a.elements).toEqual([]);
    expect(removeElement(map, 'zzz')).toBe(map);
  });
});

describe('normalização', () => {
  it('UPDATE do realtime mantém o nome do perfil e os elementos', () => {
    const prev = char('a', [{ id: 'e1', element: 'fogo', level: 1 }]);
    const next = toVmCharacter(
      { id: 'a', owner_id: 'o', name: 'Novo', attributes: { FOR: 14 }, hp_current: 3 },
      prev
    );
    expect(next.name).toBe('Novo');
    expect(next.ownerName).toBe('Dona');
    expect(next.elements).toBe(prev.elements);
    expect(next.attributes.FOR).toBe(14);
    expect(next.attributes.POD).toBe(10);
  });

  it('NPC da Mesa: atributos em array FOR, CON, DES, INT, EDU, CAR, POD', () => {
    const npc = toVmNpc({
      id: 'n',
      name: 'Cão',
      attributes: [12, 11, 10, 9, 8, 7, 6],
      hp_current: 5,
      hp_max: 15,
      tables: { name: 'Mesa 1' },
    });
    expect(npc.attributes).toEqual({ FOR: 12, CON: 11, DES: 10, INT: 9, EDU: 8, CAR: 7, POD: 6 });
    expect(npc.tableName).toBe('Mesa 1');
  });
});

describe('moveInList', () => {
  const list = [
    { id: 'a', sort_order: 0 },
    { id: 'b', sort_order: 1 },
    { id: 'c', sort_order: 5 },
  ];

  it('troca com o vizinho e grava só quem mudou', () => {
    const moved = moveInList(list, 'b', 1)!;
    expect(moved.next.map((i) => i.id)).toEqual(['a', 'c', 'b']);
    expect(moved.next.map((i) => i.sort_order)).toEqual([0, 1, 2]);
    expect(moved.changed.map((i) => i.id)).toEqual(['c', 'b']);
    expect(moved.next[0]).toBe(list[0]);
  });

  it('nas pontas não faz nada', () => {
    expect(moveInList(list, 'a', -1)).toBeNull();
    expect(moveInList(list, 'c', 1)).toBeNull();
  });
});
