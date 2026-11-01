import { describe, expect, it } from 'vitest';
import {
  backpackToSave,
  mergeRemoteBackpack,
  mergeRemoteResources,
  normalizeBackpack,
  resourcesToSave,
} from './resource-sync';

const base = { hp_current: 20, mana_current: 10, sanity_current: 5 };

describe('resourcesToSave', () => {
  it('sem mudança local não reenvia nada', () => {
    expect(resourcesToSave(base, base)).toEqual({});
  });

  it('manda só o campo que mudou', () => {
    expect(resourcesToSave({ ...base, hp_current: 15 }, base)).toEqual({
      hp_current: 15,
    });
  });
});

describe('mergeRemoteResources', () => {
  it('HP mudado na Ficha Rápida chega e o próximo save não o desfaz', () => {
    const merged = mergeRemoteResources(base, base, { ...base, hp_current: 7 });
    expect(merged.changed).toBe(true);
    expect(merged.local.hp_current).toBe(7);
    expect(resourcesToSave(merged.local, merged.lastSaved)).toEqual({});
  });

  it('não sobrescreve o campo sendo editado, mas aceita os outros', () => {
    const local = { ...base, hp_current: 18 };
    const merged = mergeRemoteResources(local, base, {
      hp_current: 7,
      mana_current: 3,
      sanity_current: 5,
    });
    expect(merged.local).toEqual({
      hp_current: 18,
      mana_current: 3,
      sanity_current: 5,
    });
    expect(resourcesToSave(merged.local, merged.lastSaved)).toEqual({
      hp_current: 18,
    });
  });

  it('o eco do próprio save não muda nada', () => {
    expect(mergeRemoteResources(base, base, base).changed).toBe(false);
  });
});

describe('mochila', () => {
  const sword = { name: 'Faca', description: '', weight: 1 };
  const rope = { name: 'Corda', description: 'dez metros', weight: 2 };
  const pack = { inventory: [sword], money: 10 };

  it('normaliza o que vem do banco', () => {
    expect(normalizeBackpack({ inventory: null, money: '12.50' })).toEqual({
      inventory: [],
      money: 12.5,
    });
  });

  it('só salva a coluna que mudou', () => {
    expect(backpackToSave(pack, pack)).toEqual({});
    expect(backpackToSave({ ...pack, money: 5 }, pack)).toEqual({ money: 5 });
    expect(backpackToSave({ ...pack, inventory: [sword, rope] }, pack)).toEqual({
      inventory: [sword, rope],
    });
  });

  it('ordem das chaves do jsonb não é mudança', () => {
    const reordered = [{ weight: 1, name: 'Faca', description: '' }];
    expect(backpackToSave({ ...pack, inventory: reordered }, pack)).toEqual({});
    expect(mergeRemoteBackpack(pack, pack, { ...pack, inventory: reordered }).changed).toBe(false);
  });

  it('a ficha aberta recebe o item novo e não o desfaz no próximo save', () => {
    const remote = { inventory: [sword, rope], money: 10 };
    const merged = mergeRemoteBackpack(pack, pack, remote);
    expect(merged.changed).toBe(true);
    expect(merged.local.inventory).toEqual([sword, rope]);
    expect(backpackToSave(merged.local, merged.lastSaved)).toEqual({});
  });

  it('coluna com mudança local não salva fica, e a outra entra', () => {
    const local = { inventory: [sword], money: 99 };
    const merged = mergeRemoteBackpack(local, pack, { inventory: [rope], money: 50 });
    expect(merged.local).toEqual({ inventory: [rope], money: 99 });
    expect(backpackToSave(merged.local, merged.lastSaved)).toEqual({ money: 99 });
  });
});
