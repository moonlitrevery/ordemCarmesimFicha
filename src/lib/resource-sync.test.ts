import { describe, expect, it } from 'vitest';
import { mergeRemoteResources, resourcesToSave } from './resource-sync';

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
