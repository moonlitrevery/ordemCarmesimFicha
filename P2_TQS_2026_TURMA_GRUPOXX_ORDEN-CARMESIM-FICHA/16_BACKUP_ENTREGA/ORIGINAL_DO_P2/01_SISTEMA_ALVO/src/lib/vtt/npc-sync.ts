import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreatureTier } from './creature-tiers';
import { buildNpcFromTier, type Npc, type NpcPatch } from './npc-rules';
import type { TableChannel } from './realtime';
import { useVttStore } from './store';

const NPC_COLUMNS =
  'id, table_id, name, plane, tier, nd, attributes, hp_max, hp_current, damage_die, x_bonus, attack_slots, turns, xp, notes, created_at';

const MISSING_TABLE_CODES = ['42P01', 'PGRST205'];
const SAVE_DELAY_MS = 400;

function store() {
  return useVttStore.getState();
}

/**
 * Só existe no navegador da mestra: nada de NPC passa pelo canal, que todo membro
 * recebe. O aviso `npc:refresh` não leva dado e serve à outra aba dela.
 */
export class NpcSync {
  private unsubscribe: (() => void) | null = null;
  private pending = new Map<string, NpcPatch>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;

  constructor(
    private supabase: SupabaseClient,
    private channel: TableChannel,
    private tableId: string
  ) {}

  start() {
    this.unsubscribe = this.channel.on('npc:refresh', () => void this.reload());
  }

  stop() {
    this.stopped = true;
    this.unsubscribe?.();
    clearTimeout(this.timer);
    void this.flush();
  }

  async reload() {
    if (this.pending.size > 0) return;
    const { data, error } = await this.supabase
      .from('npcs')
      .select(NPC_COLUMNS)
      .eq('table_id', this.tableId)
      .order('created_at');
    if (this.stopped || this.pending.size > 0) return;
    if (error) {
      useVttStore.setState({
        npcError: MISSING_TABLE_CODES.includes(error.code)
          ? 'Tabela de NPCs não encontrada. Rode supabase/migrations/016_vtt_npcs.sql no Supabase.'
          : 'Não foi possível carregar os NPCs.',
      });
      return;
    }
    const rows = (data ?? []) as unknown as Npc[];
    useVttStore.setState({
      npcError: null,
      npcs: Object.fromEntries(rows.map((npc) => [npc.id, npc])),
    });
  }

  async create(name: string, tier: CreatureTier, nd: number): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('npcs')
      .insert({
        table_id: this.tableId,
        name: name.trim().slice(0, 120),
        ...buildNpcFromTier(tier, nd),
      })
      .select(NPC_COLUMNS)
      .single();
    if (error || !data) {
      store().showToast(
        error && MISSING_TABLE_CODES.includes(error.code)
          ? 'Tabela de NPCs não encontrada. Rode supabase/migrations/016_vtt_npcs.sql no Supabase.'
          : 'Não foi possível criar o NPC.'
      );
      return false;
    }
    const npc = data as unknown as Npc;
    useVttStore.setState((s) => ({ npcs: { ...s.npcs, [npc.id]: npc } }));
    this.channel.emit({ type: 'npc:refresh' });
    return true;
  }

  /** Aparece na hora (a barrinha do token inclusive) e grava agrupado: −/+ é rápido. */
  update(id: string, patch: NpcPatch) {
    useVttStore.setState((s) => {
      const npc = s.npcs[id];
      return npc ? { npcs: { ...s.npcs, [id]: { ...npc, ...patch } } } : s;
    });
    this.pending.set(id, { ...this.pending.get(id), ...patch });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), SAVE_DELAY_MS);
  }

  private async flush() {
    if (this.pending.size === 0) return;
    const batch = Array.from(this.pending.entries());
    this.pending.clear();
    const results = await Promise.all(
      batch.map(([id, patch]) =>
        this.supabase.from('npcs').update(patch).eq('id', id)
      )
    );
    if (results.some((result) => result.error)) {
      store().showToast('Não foi possível salvar o NPC. Tente de novo.');
      void this.reload();
      return;
    }
    this.channel.emit({ type: 'npc:refresh' });
  }

  /** O vínculo dos tokens cai junto (`on delete set null`): a cena precisa reler. */
  async remove(id: string) {
    this.pending.delete(id);
    const { error } = await this.supabase.from('npcs').delete().eq('id', id);
    if (error) {
      store().showToast('Não foi possível apagar o NPC.');
      return;
    }
    useVttStore.setState((s) => {
      const npcs = { ...s.npcs };
      delete npcs[id];
      return { npcs };
    });
    this.channel.emit({ type: 'npc:refresh' });
    const { sync, viewedSceneId } = store();
    if (viewedSceneId) {
      this.channel.emit({ type: 'scene:refresh', sceneId: viewedSceneId });
    }
    void sync?.reload();
  }
}
