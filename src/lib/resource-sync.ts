import { itemQty } from '@/lib/calculations';
import type { InventoryItem } from '@/types/database';

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

// ---------- Mochila ----------

export interface BackpackValues {
  inventory: InventoryItem[];
  money: number;
}

export function normalizeBackpack(row: {
  inventory?: InventoryItem[] | null;
  money?: number | string | null;
}): BackpackValues {
  return {
    inventory: Array.isArray(row.inventory) ? row.inventory : [],
    money: Number(row.money ?? 0) || 0,
  };
}

/** Campo a campo: o jsonb devolve as chaves em outra ordem, e isso não é mudança. */
function sameInventory(a: InventoryItem[], b: InventoryItem[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (item, index) =>
        item.name === b[index].name &&
        item.description === b[index].description &&
        Number(item.weight) === Number(b[index].weight) &&
        itemQty(item) === itemQty(b[index])
    )
  );
}

/** Como `resourcesToSave`. A lista vai inteira: mudou aqui, este é o valor dela. */
export function backpackToSave(
  local: BackpackValues,
  lastSaved: BackpackValues
): Partial<BackpackValues> {
  const changed: Partial<BackpackValues> = {};
  if (!sameInventory(local.inventory, lastSaved.inventory)) changed.inventory = local.inventory;
  if (local.money !== lastSaved.money) changed.money = local.money;
  return changed;
}

/** Como `mergeRemoteResources`: coluna com mudança local não salva fica como está. */
export function mergeRemoteBackpack(
  local: BackpackValues,
  lastSaved: BackpackValues,
  remote: BackpackValues
): { local: BackpackValues; lastSaved: BackpackValues; changed: boolean } {
  const nextLocal = { ...local };
  const nextSaved = { ...lastSaved };
  let changed = false;
  if (sameInventory(local.inventory, lastSaved.inventory)) {
    nextSaved.inventory = remote.inventory;
    if (!sameInventory(remote.inventory, local.inventory)) {
      nextLocal.inventory = remote.inventory;
      changed = true;
    }
  }
  if (local.money === lastSaved.money) {
    nextSaved.money = remote.money;
    if (remote.money !== local.money) {
      nextLocal.money = remote.money;
      changed = true;
    }
  }
  return { local: nextLocal, lastSaved: nextSaved, changed };
}

// ---------- Versão da mochila (migração 025) ----------

/**
 * Versão a usar no próximo save depois de um evento remoto. O save só grava a
 * mochila com `.eq('backpack_rev', versão)`. Sem mudança local pendente, adota a
 * remota. Com mudança local, só adota se o remoto não mexeu justo no campo que está
 * sendo editado; senão fica com a velha, o save não pega linha e o cliente relê,
 * em vez de regravar por cima (item enviado pra party voltando, dinheiro voltando).
 */
export function nextBackpackRev(
  local: BackpackValues,
  lastSaved: BackpackValues,
  remote: BackpackValues,
  knownRev: number,
  remoteRev: number
): number {
  const inventoryPending = !sameInventory(local.inventory, lastSaved.inventory);
  const moneyPending = local.money !== lastSaved.money;
  const remoteTouchedInventory = !sameInventory(remote.inventory, lastSaved.inventory);
  const remoteTouchedMoney = remote.money !== lastSaved.money;
  if ((inventoryPending && remoteTouchedInventory) || (moneyPending && remoteTouchedMoney)) {
    return knownRev;
  }
  return remoteRev;
}

export interface ServerBackpack {
  backpack: BackpackValues;
  rev: number;
}

/** Retorno das RPCs de dinheiro/party, ou a linha relida depois de um conflito. */
export function serverBackpack(row: unknown): ServerBackpack | null {
  if (!row || typeof row !== 'object') return null;
  const data = row as { inventory?: InventoryItem[] | null; money?: number | string | null; backpack_rev?: unknown };
  if (data.money === null || data.money === undefined || typeof data.backpack_rev !== 'number') return null;
  return { backpack: normalizeBackpack(data), rev: data.backpack_rev };
}
