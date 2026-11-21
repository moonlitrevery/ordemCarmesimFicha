import type { SupabaseClient } from '@supabase/supabase-js';
import { joinFogChannel, type FogChannel, type FogEvent } from '../realtime';
import { useVttStore } from '../store';
import {
  createMask,
  decodeMask,
  encodeMask,
  payloadToRegion,
  readRegion,
  readRegionFrom,
  regionToPayload,
  sameRegion,
  unionRect,
  writeRegion,
  type CellRect,
  type FogMask,
  type FogRegion,
} from './mask';

/** Traço ao vivo: um recorte a cada 50 ms, como o arraste de objeto. */
const PATCH_THROTTLE_MS = 50;
/** Gravação agrupada: o pincel não grava a cada movimento. */
const SAVE_MS = 600;

const SAVE_ERROR = 'Não foi possível salvar a névoa. Tente de novo.';

function store() {
  return useVttStore.getState();
}

/**
 * Névoa da página vista (Fase 11). Fonte da verdade: `scenes.fog`. Só a mestra
 * grava e só ela escreve no canal `nevoa:{mesa}` (o Realtime recusa os outros):
 * os recortes chegam ao vivo e, depois de cada gravação, `fog:saved` faz todo
 * mundo reler o banco.
 */
export class FogSync {
  /** Mutável: o pincel escreve direto aqui. Nula = página sem névoa. */
  mask: FogMask | null = null;
  sceneId: string | null = null;

  private channel: FogChannel | null = null;
  private stopped = false;
  /** O que o canvas ainda não redesenhou. */
  private dirty: CellRect | null = null;
  /** Traço em andamento: as células de antes, para o passo de desfazer. */
  private stroke: { before: Uint8Array; changed: CellRect | null } | null = null;
  private unsent: CellRect | null = null;
  private lastSend = 0;
  private sendTimer: ReturnType<typeof setTimeout> | undefined;
  /** Mudança da mestra ainda não gravada: releitura não passa por cima. */
  private unsaved = false;
  /** Gravações a caminho: o banco ainda não tem o que está na tela. */
  private inFlight = 0;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private saveChain: Promise<void> = Promise.resolve();
  private loadTicket = 0;

  constructor(
    private supabase: SupabaseClient,
    private tableId: string,
    private isGm: boolean
  ) {}

  start() {
    this.channel = joinFogChannel(
      this.supabase,
      this.tableId,
      (event) => this.onEvent(event),
      // Reconectou: o que chegou no meio da queda ficou para trás.
      () => void this.reread()
    );
  }

  stop() {
    void this.flushSave();
    this.stopped = true;
    clearTimeout(this.sendTimer);
    this.channel?.leave();
    this.channel = null;
  }

  // ---------- Canvas ----------

  /** O retângulo mudado desde a última chamada (toda a máscara se ela foi trocada). */
  takeDirty(): CellRect | null {
    const dirty = this.dirty;
    this.dirty = null;
    return dirty;
  }

  private touch(rect: CellRect | null) {
    if (!rect) return;
    this.dirty = unionRect(this.dirty, rect);
    useVttStore.setState((s) => ({ fogRev: s.fogRev + 1 }));
  }

  private replace(sceneId: string, mask: FogMask | null) {
    this.sceneId = sceneId;
    this.mask = mask;
    this.dirty = mask ? { x: 0, y: 0, w: mask.w, h: mask.h } : null;
    useVttStore.setState((s) => ({
      fogOn: mask !== null,
      fogRev: s.fogRev + 1,
      // Desligou com a ferramenta na mão: volta para Selecionar.
      tool: mask === null && s.tool === 'fog' ? 'select' : s.tool,
    }));
  }

  // ---------- Carregar ----------

  /**
   * A névoa vem junto com a página (`fetchSceneBundle`), antes de o mapa aparecer:
   * o jogador nunca vê o mapa descoberto por um quadro.
   */
  adopt(sceneId: string, raw: unknown) {
    if (this.stopped) return;
    this.loadTicket++;
    if (sceneId === this.sceneId && this.busy) return;
    if (sceneId !== this.sceneId) this.abandonEdits();
    this.replace(sceneId, decodeMask(raw));
  }

  /** Página nenhuma (sessão fechada, sem cena): esquece a névoa. */
  clear() {
    this.abandonEdits();
    this.sceneId = null;
    this.mask = null;
    this.dirty = null;
    useVttStore.setState((s) => ({ fogOn: false, fogRev: s.fogRev + 1 }));
  }

  /** A mestra tem algo na tela que o banco ainda não tem. */
  private get busy(): boolean {
    return this.isGm && (this.unsaved || this.stroke !== null || this.inFlight > 0);
  }

  private abandonEdits() {
    // A página anterior ainda grava (flushSave guarda qual era).
    if (this.unsaved) void this.flushSave();
    this.stroke = null;
    this.unsent = null;
    clearTimeout(this.sendTimer);
  }

  private async reread() {
    const sceneId = this.sceneId;
    if (!sceneId || this.stopped || this.busy) return;
    const ticket = ++this.loadTicket;
    const { data, error } = await this.supabase
      .from('scenes')
      .select('fog')
      .eq('id', sceneId)
      .maybeSingle();
    if (this.stopped || error || ticket !== this.loadTicket || sceneId !== this.sceneId) return;
    if (this.busy) return;
    this.replace(sceneId, decodeMask((data as { fog?: unknown } | null)?.fog ?? null));
  }

  // ---------- Recebidos ----------

  private onEvent(event: FogEvent) {
    if (event.sceneId !== this.sceneId) return;
    if (event.type === 'fog:saved') {
      void this.reread();
      return;
    }
    // Só a mestra escreve no canal (o servidor garante); outra aba dela também recebe.
    if (!this.mask || this.stroke) return;
    const region = payloadToRegion(this.mask, event.patch);
    if (region && writeRegion(this.mask, region)) this.touch(region);
  }

  // ---------- Editar (mestra) ----------

  get editing(): boolean {
    return this.stroke !== null;
  }

  beginStroke() {
    if (!this.isGm || !this.mask || this.stroke) return;
    this.stroke = { before: this.mask.cells.slice(), changed: null };
  }

  /** Uma mudança dentro do traço: `paint` escreve na máscara e devolve o que mudou. */
  edit(paint: (mask: FogMask) => CellRect | null) {
    if (!this.mask || !this.stroke) return;
    const rect = paint(this.mask);
    if (!rect) return;
    this.stroke.changed = unionRect(this.stroke.changed, rect);
    this.unsent = unionRect(this.unsent, rect);
    this.unsaved = true;
    this.touch(rect);
    this.sendSoon();
  }

  endStroke() {
    const stroke = this.stroke;
    this.stroke = null;
    if (!stroke || !this.mask || !this.sceneId) return;
    this.sendNow();
    if (!stroke.changed) return;
    const before = readRegionFrom(stroke.before, this.mask.w, stroke.changed);
    const after = readRegion(this.mask, stroke.changed);
    if (!sameRegion(before, after)) {
      store().sync?.recordHistory({ type: 'fog', sceneId: this.sceneId, before, after });
    }
    this.scheduleSave();
  }

  /** Revelar tudo ou Cobrir tudo: um traço que pega a máscara inteira. */
  fillAll(revealed: boolean) {
    if (!this.mask) return;
    this.beginStroke();
    this.edit((mask) => {
      mask.cells.fill(revealed ? 1 : 0);
      return { x: 0, y: 0, w: mask.w, h: mask.h };
    });
    this.endStroke();
  }

  /** Desfazer e refazer: o recorte volta pela mesma via (transmite e grava). */
  applyRegion(sceneId: string, region: FogRegion): 'applied' | 'skipped' {
    if (!this.mask || sceneId !== this.sceneId || this.stroke) return 'skipped';
    if (!writeRegion(this.mask, region)) {
      // Fora da máscara (mudou de tamanho) é pulado; igual já é "feito".
      const fits = region.x + region.w <= this.mask.w && region.y + region.h <= this.mask.h;
      return fits ? 'applied' : 'skipped';
    }
    this.unsaved = true;
    this.touch(region);
    this.unsent = unionRect(this.unsent, region);
    this.sendNow();
    this.scheduleSave();
    return 'applied';
  }

  private sendSoon() {
    const wait = PATCH_THROTTLE_MS - (Date.now() - this.lastSend);
    if (wait <= 0) {
      this.sendNow();
      return;
    }
    clearTimeout(this.sendTimer);
    this.sendTimer = setTimeout(() => this.sendNow(), wait);
  }

  private sendNow() {
    clearTimeout(this.sendTimer);
    const rect = this.unsent;
    this.unsent = null;
    if (!rect || !this.mask || !this.sceneId) return;
    this.lastSend = Date.now();
    this.channel?.emit({
      type: 'fog:patch',
      sceneId: this.sceneId,
      patch: regionToPayload(readRegion(this.mask, rect)),
    });
  }

  // ---------- Gravar ----------

  private scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flushSave(), SAVE_MS);
  }

  private flushSave(): Promise<void> {
    clearTimeout(this.saveTimer);
    if (!this.unsaved || !this.mask || !this.sceneId) return this.saveChain;
    const sceneId = this.sceneId;
    const record = encodeMask(this.mask);
    // Mudança depois daqui marca de novo; até a resposta, `inFlight` segura a releitura.
    this.unsaved = false;
    this.inFlight++;
    // Uma de cada vez: a mais antiga não pode chegar por último.
    this.saveChain = this.saveChain.then(async () => {
      const { error } = await this.supabase.from('scenes').update({ fog: record }).eq('id', sceneId);
      this.inFlight--;
      if (error) {
        store().showToast(SAVE_ERROR);
        // Fica marcada: a próxima mudança (ou o fim da sessão) tenta de novo.
        if (sceneId === this.sceneId) this.unsaved = true;
        return;
      }
      this.channel?.emit({ type: 'fog:saved', sceneId });
    });
    return this.saveChain;
  }

  // ---------- Ligar e desligar (Configurações da página) ----------

  /** Só pergunta se a página tem névoa: a máscara inteira só vem com a página aberta. */
  async isEnabled(sceneId: string): Promise<boolean | null> {
    if (sceneId === this.sceneId) return this.mask !== null;
    const { data, error } = await this.supabase
      .from('scenes')
      .select('fog_w:fog->w')
      .eq('id', sceneId)
      .maybeSingle();
    if (error) return null;
    return (data as { fog_w?: unknown } | null)?.fog_w != null;
  }

  /** Ligar começa toda coberta; desligar apaga a máscara. */
  async setEnabled(
    sceneId: string,
    on: boolean,
    dims: { w: number; h: number }
  ): Promise<boolean> {
    if (!this.isGm) return false;
    if (sceneId === this.sceneId) {
      this.stroke = null;
      this.unsaved = false;
      clearTimeout(this.saveTimer);
    }
    await this.saveChain;
    const mask = on ? createMask(dims.w, dims.h) : null;
    const { error } = await this.supabase
      .from('scenes')
      .update({ fog: mask ? encodeMask(mask) : null })
      .eq('id', sceneId);
    if (error) {
      store().showToast(SAVE_ERROR);
      return false;
    }
    if (sceneId === this.sceneId) {
      this.replace(sceneId, mask);
      // Desfazer traço de uma névoa que não existe mais não faz sentido.
      store().sync?.dropFogHistory(sceneId);
    }
    this.channel?.emit({ type: 'fog:saved', sceneId });
    return true;
  }
}
