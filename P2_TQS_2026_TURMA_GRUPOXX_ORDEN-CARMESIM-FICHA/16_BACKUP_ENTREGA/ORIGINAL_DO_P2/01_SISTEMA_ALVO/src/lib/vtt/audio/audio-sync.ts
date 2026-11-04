import type { SupabaseClient } from '@supabase/supabase-js';
import type { Asset } from '../assets/rules';
import { loadStaticCatalog, loadStaticInUse } from '../assets/static';
import type { TableChannel } from '../realtime';
import { useVttStore } from '../store';
import { AudioEngine, type AudioSource } from './engine';
import {
  audibleLayers,
  DEFAULT_LAYER_VOLUME,
  layerGains,
  MAX_AMBIENT_LAYERS,
  outputVolume,
  parseAmbient,
  parseAudioSettings,
  type AmbientLayer,
  type AudioSettings,
} from './rules';

const SAVE_MS = 250;
const CUE_READ_LIMIT = 10;
const SAVE_ERROR = 'Não foi possível salvar o som. Tente de novo.';

function store() {
  return useVttStore.getState();
}

function toSource(asset: Pick<Asset, 'id' | 'name' | 'url' | 'mime' | 'duration_s'>): AudioSource {
  return {
    id: asset.id,
    name: asset.name,
    url: asset.url,
    mime: asset.mime,
    durationS: asset.duration_s,
  };
}

/**
 * O canal só leva avisos, porque qualquer membro consegue enviar nele: quem recebe
 * relê o banco, e o RLS decide o que cada um ouve. Nenhum áudio passa pelo canal.
 */
export class AudioSync {
  private engine = new AudioEngine((name) =>
    store().showToast(`Não foi possível carregar o som ${name}.`)
  );
  private cleanup: (() => void)[] = [];
  private stopped = false;
  private sources = new Map<string, AudioSource>();
  private ambientTicket = 0;
  private applyTicket = 0;
  private pendingLayers: { sceneId: string; layers: AmbientLayer[] } | null = null;
  private layersTimer: ReturnType<typeof setTimeout> | undefined;
  private layersTicket = 0;
  private layersSave: Promise<void> = Promise.resolve();
  private settingsDirty = false;
  private settingsTimer: ReturnType<typeof setTimeout> | undefined;
  private settingsTicket = 0;
  private settingsSave: Promise<void> = Promise.resolve();
  private seenCues = new Set<string>();
  private cuesReady = false;
  private sfxStopSeen: number | null = null;

  constructor(
    private supabase: SupabaseClient,
    private channel: TableChannel,
    private tableId: string,
    private userId: string
  ) {}

  start() {
    this.engine.setOutput(outputVolume(store().audioPrefs));
    void this.engine.load().catch(() => undefined);
    this.cleanup.push(
      this.channel.on('audio:ambient', ({ sceneId }) => {
        if (sceneId === store().viewedSceneId) void this.loadAmbient();
      }),
      this.channel.on('audio:settings', () => void this.loadSettings()),
      this.channel.on('audio:sfx', () => void this.readCues(true)),
      // Apagar um arquivo chega como scene:assign e também muda o ambiente.
      this.channel.on('scene:assign', () => void this.loadAmbient()),
      useVttStore.subscribe((state, prev) => {
        if (state.viewedSceneId !== prev.viewedSceneId) {
          void this.flushLayers();
          void this.loadAmbient();
        }
        if (state.audioUnlocked !== prev.audioUnlocked) void this.applyAmbient();
        if (state.audioPrefs !== prev.audioPrefs) {
          this.engine.setOutput(outputVolume(state.audioPrefs));
        }
      })
    );
    void this.reload();
  }

  stop() {
    void this.flushLayers();
    void this.flushSettings();
    this.stopped = true;
    this.cleanup.forEach((remove) => remove());
    this.cleanup = [];
    this.engine.dispose();
  }

  /** Também roda a cada reconexão. SFX perdido não toca atrasado. */
  async reload() {
    await Promise.all([this.loadSettings(), this.loadAmbient(), this.readCues(false)]);
  }

  /** Chamado dentro do clique em "Entrar na sessão". */
  unlock() {
    this.engine.unlock();
  }

  // ---------- Leitura ----------

  private async loadSettings() {
    if (this.settingsDirty) return;
    const { data, error } = await this.supabase
      .from('tables')
      .select('audio')
      .eq('id', this.tableId)
      .maybeSingle();
    if (this.stopped || error || !data || this.settingsDirty) return;
    const settings = parseAudioSettings(data.audio);
    const stopped = this.sfxStopSeen !== null && settings.sfxStop > this.sfxStopSeen;
    this.sfxStopSeen = settings.sfxStop;
    useVttStore.setState({ audioSettings: settings });
    if (stopped) this.engine.stopSfx(settings.fadeMs);
    this.engine.setSfxGain(settings.volume / 100);
    void this.applyAmbient();
  }

  /** Pela RPC: a coluna guarda camada para um jogador só, e não é lida direto. */
  private async loadAmbient() {
    const sceneId = store().viewedSceneId;
    const ticket = ++this.ambientTicket;
    if (!sceneId) {
      useVttStore.setState({ ambientLayers: [] });
      void this.applyAmbient();
      return;
    }
    const { data, error } = await this.supabase.rpc('my_scene_ambient', {
      p_scene: sceneId,
    });
    if (this.stopped || ticket !== this.ambientTicket) return;
    if (this.pendingLayers?.sceneId === sceneId) return;
    useVttStore.setState({ ambientLayers: error ? [] : parseAmbient(data) });
    void this.applyAmbient();
  }

  private async applyAmbient() {
    const state = store();
    if (this.stopped || !state.audioUnlocked) return;
    const ticket = ++this.applyTicket;
    const gains = layerGains(
      audibleLayers(state.ambientLayers, this.userId),
      state.audioSettings.volume
    );
    await this.resolveSources(Array.from(gains.keys()));
    if (this.stopped || ticket !== this.applyTicket) return;
    this.engine.setAmbient(
      Array.from(gains).flatMap(([id, gain]) => {
        const source = this.sources.get(id);
        return source ? [{ ...source, gain }] : [];
      }),
      store().audioSettings.fadeMs
    );
  }

  /** O RLS só mostra ao jogador o que a mestra pôs em jogo. */
  private async resolveSources(ids: string[]) {
    const library = store().library ?? [];
    let missing = ids.filter((id) => {
      if (this.sources.has(id)) return false;
      const known = library.find((asset) => asset.id === id);
      if (known) this.sources.set(id, toSource(known));
      return !known;
    });
    if (missing.length === 0) return;

    const { data } = await this.supabase
      .from('assets')
      .select('id, name, url, mime, duration_s')
      .in('id', missing);
    ((data ?? []) as Pick<Asset, 'id' | 'name' | 'url' | 'mime' | 'duration_s'>[]).forEach(
      (asset) => this.sources.set(asset.id, toSource(asset))
    );
    missing = missing.filter((id) => !this.sources.has(id));
    if (missing.length === 0) return;

    const fixed = (await Promise.all([loadStaticCatalog(), loadStaticInUse()])).flat();
    fixed
      .filter((asset) => missing.includes(asset.id))
      .forEach((asset) => this.sources.set(asset.id, toSource(asset)));
  }

  /** O aviso não diz o que tocar: o RLS só devolve o SFX de todos e os deste usuário. */
  private async readCues(play: boolean) {
    const { data, error } = await this.supabase
      .from('audio_cues')
      .select('id, asset_id, target_user')
      .eq('table_id', this.tableId)
      .order('created_at', { ascending: false })
      .limit(CUE_READ_LIMIT);
    if (this.stopped || error) return;
    const cues = (data ?? []) as { id: string; asset_id: string; target_user: string | null }[];
    // Sem a primeira leitura não dá para saber o que é novo.
    const canPlay = play && this.cuesReady && store().audioUnlocked;
    const fresh = cues.filter((cue) => !this.seenCues.has(cue.id));
    fresh.forEach((cue) => this.seenCues.add(cue.id));
    this.cuesReady = true;
    if (!canPlay) return;
    for (const cue of fresh.reverse()) {
      // A mestra lê todas as linhas: a dela já tocou, e a de outra pessoa não é para ela.
      if (cue.target_user !== null && cue.target_user !== this.userId) continue;
      void this.playCue(cue.asset_id);
    }
  }

  private async playCue(assetId: string) {
    await this.resolveSources([assetId]);
    const source = this.sources.get(assetId);
    if (this.stopped || !source) return;
    void this.engine.playSfx(source, store().audioSettings.volume / 100);
  }

  // ---------- Ações da mestra ----------

  addLayer(sceneId: string, assetId: string, target: string | null) {
    const layers = store().ambientLayers;
    if (layers.length >= MAX_AMBIENT_LAYERS) {
      store().showToast(`Uma cena aceita até ${MAX_AMBIENT_LAYERS} camadas de ambiente.`);
      return;
    }
    this.changeLayers(sceneId, [
      ...layers,
      { id: crypto.randomUUID(), assetId, volume: DEFAULT_LAYER_VOLUME, target },
    ]);
  }

  patchLayer(sceneId: string, id: string, patch: Partial<Pick<AmbientLayer, 'volume' | 'target'>>) {
    this.changeLayers(
      sceneId,
      store().ambientLayers.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer))
    );
  }

  removeLayer(sceneId: string, id: string) {
    this.changeLayers(
      sceneId,
      store().ambientLayers.filter((layer) => layer.id !== id)
    );
  }

  private changeLayers(sceneId: string, layers: AmbientLayer[]) {
    if (this.pendingLayers && this.pendingLayers.sceneId !== sceneId) void this.flushLayers();
    this.layersTicket++;
    this.pendingLayers = { sceneId, layers };
    useVttStore.setState({ ambientLayers: layers });
    void this.applyAmbient();
    clearTimeout(this.layersTimer);
    this.layersTimer = setTimeout(() => void this.flushLayers(), SAVE_MS);
  }

  private async flushLayers() {
    clearTimeout(this.layersTimer);
    const pending = this.pendingLayers;
    if (!pending) return;
    const ticket = this.layersTicket;
    // Uma gravação de cada vez: a mais antiga não pode chegar por último.
    this.layersSave = this.layersSave.then(async () => {
      const { error } = await this.supabase
        .from('scenes')
        .update({ ambient: pending.layers })
        .eq('id', pending.sceneId);
      if (ticket === this.layersTicket) this.pendingLayers = null;
      if (error) {
        store().showToast(SAVE_ERROR);
        return;
      }
      this.channel.emit({ type: 'audio:ambient', sceneId: pending.sceneId });
    });
    await this.layersSave;
  }

  changeSettings(patch: Partial<AudioSettings>) {
    const settings = { ...store().audioSettings, ...patch };
    this.settingsDirty = true;
    this.settingsTicket++;
    useVttStore.setState({ audioSettings: settings });
    this.engine.setSfxGain(settings.volume / 100);
    void this.applyAmbient();
    clearTimeout(this.settingsTimer);
    this.settingsTimer = setTimeout(() => void this.flushSettings(), SAVE_MS);
  }

  private async flushSettings() {
    clearTimeout(this.settingsTimer);
    if (!this.settingsDirty) return;
    const ticket = this.settingsTicket;
    const audio = store().audioSettings;
    this.settingsSave = this.settingsSave.then(async () => {
      const { error } = await this.supabase
        .from('tables')
        .update({ audio })
        .eq('id', this.tableId);
      if (ticket === this.settingsTicket) this.settingsDirty = false;
      if (error) {
        store().showToast(SAVE_ERROR);
        return;
      }
      this.channel.emit({ type: 'audio:settings' });
    });
    await this.settingsSave;
  }

  async playSfx(asset: Asset, target: string | null) {
    const { data, error } = await this.supabase
      .from('audio_cues')
      .insert({ table_id: this.tableId, asset_id: asset.id, target_user: target })
      .select('id')
      .single();
    if (this.stopped) return;
    if (error) {
      store().showToast('Não foi possível tocar o SFX. Tente de novo.');
      return;
    }
    this.seenCues.add((data as { id: string }).id);
    this.channel.emit({ type: 'audio:sfx' });
    if (target !== null) return;
    this.sources.set(asset.id, toSource(asset));
    void this.playCue(asset.id);
  }

  stopAllSfx() {
    const { sfxStop, fadeMs } = store().audioSettings;
    this.engine.stopSfx(fadeMs);
    this.sfxStopSeen = sfxStop + 1;
    this.changeSettings({ sfxStop: sfxStop + 1 });
    void this.flushSettings();
  }
}
