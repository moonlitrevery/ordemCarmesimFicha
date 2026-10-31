export const RESOURCE_KEYS = ['hp_current', 'mana_current', 'sanity_current'] as const;

export type ResourceKey = (typeof RESOURCE_KEYS)[number];

export type ResourceValues = Record<ResourceKey, number>;

/** Só o que mudou aqui desde o último save: o resto pode ter mudado em outra aba. */
export function resourcesToSave(
  local: ResourceValues,
  lastSaved: ResourceValues
): Partial<ResourceValues> {
  const changed: Partial<ResourceValues> = {};
  for (const key of RESOURCE_KEYS) {
    if (local[key] !== lastSaved[key]) changed[key] = local[key];
  }
  return changed;
}

/**
 * Aplica o que chegou de outra aba. Campo com mudança local ainda não salva fica
 * como está: quem está editando ganha, e o próximo save grava o valor dele.
 */
export function mergeRemoteResources(
  local: ResourceValues,
  lastSaved: ResourceValues,
  remote: ResourceValues
): { local: ResourceValues; lastSaved: ResourceValues; changed: boolean } {
  const nextLocal = { ...local };
  const nextSaved = { ...lastSaved };
  let changed = false;
  for (const key of RESOURCE_KEYS) {
    if (local[key] !== lastSaved[key]) continue;
    nextSaved[key] = remote[key];
    if (remote[key] !== local[key]) {
      nextLocal[key] = remote[key];
      changed = true;
    }
  }
  return { local: nextLocal, lastSaved: nextSaved, changed };
}
