import type { SupabaseClient } from '@supabase/supabase-js';
import {
  addEntries,
  entriesFor,
  parseInitiative,
  SECRET_ENTRY_NAME,
  updateEntry,
} from './initiative';
import type { TableChannel } from './realtime';
import { useVttStore } from './store';
import type { InitiativeState, SceneObject } from './types';

const SAVE_DELAY_MS = 250;

function store() {
  return useVttStore.getState();
}

/**
 * Grava em `tables.initiative`; o evento no canal é só um aviso para reler. Só a
 * dona consegue gravar (RLS). Quem digita ou passa turnos rápido vê na hora: o
 * banco recebe o último estado, um de cada vez.
 */
export class InitiativeSync {
  private unsubscribe: (() => void) | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private dirty = false;
  private saving = false;
  private stopped = false;
  private loadTicket = 0;

  constructor(
    private supabase: SupabaseClient,
    private channel: TableChannel,
    private tableId: string
  ) {}

  start() {
    this.unsubscribe = this.channel.on('initiative:refresh', () => void this.reload());
  }

  stop() {
    this.stopped = true;
    this.unsubscribe?.();
    if (this.dirty) {
      clearTimeout(this.saveTimer);
      void this.flush();
    }
  }

  /** Também roda a cada reconexão. Edição não salva vale mais que a releitura. */
  async reload() {
    if (this.dirty || this.saving) return;
    const ticket = ++this.loadTicket;
    const { data, error } = await this.supabase
      .from('tables')
      .select('initiative')
      .eq('id', this.tableId)
      .maybeSingle();
    if (error || !data || ticket !== this.loadTicket) return;
    if (this.dirty || this.saving || this.stopped) return;
    useVttStore.setState({ initiative: parseInitiative(data.initiative) });
  }

  apply(change: (state: InitiativeState) => InitiativeState) {
    const current = store().initiative;
    const next = change(current);
    if (next === current) return;
    useVttStore.setState({ initiative: next });
    this.dirty = true;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), SAVE_DELAY_MS);
  }

  private async flush() {
    if (this.saving) return;
    this.saving = true;
    this.dirty = false;
    const { error } = await this.supabase
      .from('tables')
      .update({ initiative: store().initiative })
      .eq('id', this.tableId);
    this.saving = false;
    if (error) {
      store().showToast('Não foi possível salvar a iniciativa. Tente de novo.');
      // Com edição nova, o timer dela pode já ter passado: grava esse estado agora.
      if (this.dirty) void this.flush();
      else void this.reload();
      return;
    }
    // Mudou enquanto gravava: o timer pode já ter passado, então grava de novo aqui.
    if (this.dirty) {
      clearTimeout(this.saveTimer);
      void this.flush();
      return;
    }
    this.channel.emit({ type: 'initiative:refresh' });
  }

  /**
   * Nome = legenda, NPC, ficha ou arquivo. Oculto e ofuscado entram como "???":
   * todo membro lê esta coluna, e o nome de verdade aparece só no painel da mestra.
   */
  async addObjects(ids: string[]) {
    const { objects, initiative, npcs, sceneAssets } = store();
    const known = new Set(initiative.entries.map((entry) => entry.objectId));
    const targets = ids
      .map((id) => objects[id])
      .filter((object): object is SceneObject => Boolean(object));
    const fresh = targets.filter((object) => !known.has(object.id));
    if (fresh.length < targets.length) {
      store().showToast('Quem já está na iniciativa não entra de novo.');
    }
    if (fresh.length === 0) return;

    const characterIds = fresh
      .map((object) => object.character_id)
      .filter((id): id is string => Boolean(id));
    const characterNames = new Map<string, string>();
    if (characterIds.length > 0) {
      const { data } = await this.supabase
        .from('characters')
        .select('id, name')
        .in('id', characterIds);
      (data ?? []).forEach((row: { id: string; name: string }) =>
        characterNames.set(row.id, row.name)
      );
    }

    const entries = fresh.flatMap((object) => {
      const npc = object.npc_id ? npcs[object.npc_id] : undefined;
      const secret = object.hidden || Boolean(object.caption?.obfuscated);
      const name = secret
        ? SECRET_ENTRY_NAME
        : object.caption?.text ||
          npc?.name ||
          (object.character_id && characterNames.get(object.character_id)) ||
          sceneAssets[object.asset_id]?.name ||
          'Token';
      return entriesFor(
        { name, objectId: object.id, turns: npc?.turns ?? 1 },
        () => crypto.randomUUID()
      );
    });
    this.apply((state) => addEntries(state, entries));
  }

  addManual(name: string) {
    this.apply((state) =>
      addEntries(
        state,
        entriesFor({ name, objectId: null, turns: 1 }, () => crypto.randomUUID())
      )
    );
  }

  /** Vai para o chat como toda rolagem, sem levar a ficha escolhida na Ficha Rápida. */
  async rollEntry(id: string, hidden: boolean) {
    const { chat, initiative } = store();
    const entry = initiative.entries.find((item) => item.id === id);
    if (!chat || !entry) return;
    const roll = await chat.roll({
      notation: initiative.notation,
      label: `Iniciativa — ${entry.name}`,
      hidden,
      actor: entry.name,
    });
    if (!roll) {
      store().showToast('Não foi possível rolar: confira a notação da iniciativa.');
      return;
    }
    this.apply((state) => updateEntry(state, id, { value: roll.total }));
  }
}
