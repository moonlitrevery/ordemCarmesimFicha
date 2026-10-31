import type { SupabaseClient } from '@supabase/supabase-js';
import type { Asset } from './assets/rules';
import { checkUploadAvailable, uploadAsset } from './assets/upload';
import type { VttEventOf } from './events';
import { calibrate } from './geometry';
import type { TableChannel } from './realtime';
import {
  DRAWING_COLUMNS,
  fetchAssets,
  fetchSceneBundle,
  fetchScenes,
  OBJECT_COLUMNS,
  SCENE_COLUMNS,
} from './scene-queries';
import {
  allowPerKey,
  attachPatch,
  backZ,
  canDeleteObject,
  canEditObjects,
  defaultObjectScale,
  descendantsOf,
  detachPatch,
  frontZ,
  isSceneLive,
  isValidDrawing,
  isValidObject,
  ownTransform,
  patchFromOwn,
  resolveViewedScene,
  userColor,
  wouldCreateCycle,
  type ObjectPatch,
} from './scene-rules';
import { useVttStore } from './store';
import type {
  Drawing,
  ObjectKind,
  SceneAsset,
  SceneObject,
  VttScene,
} from './types';

const DRAG_THROTTLE_MS = 50;
const RULER_THROTTLE_MS = 100;
const PING_INTERVAL_MS = 1000;
const REFRESH_DELAY_MS = 300;

const SAVE_ERROR = 'Não foi possível salvar. Tente de novo.';

/** O que a sync pede ao canvas: só o transitório, que não passa pelo store. */
export interface EngineBridge {
  showPing: (x: number, y: number, color: string) => void;
  showRuler: (
    userId: string,
    color: string,
    line: [number, number, number, number] | null
  ) => void;
  /** Tamanho do mapa aberto, para escolher o tamanho inicial dos objetos. */
  mapSide: () => number | null;
}

function store() {
  return useVttStore.getState();
}

function without<T>(record: Record<string, T>, id: string): Record<string, T> {
  const next = { ...record };
  delete next[id];
  return next;
}

/**
 * Tudo o que muda a cena passa por aqui: grava no banco e transmite o resultado.
 * O canvas e os painéis só chamam estes métodos e leem o store.
 */
export class SceneSync {
  private engine: EngineBridge | null = null;
  private loadTicket = 0;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private lastDrag = 0;
  private lastRuler = 0;
  private lastPing = 0;
  private pingLimits = new Map<string, number>();
  private unsubscribers: (() => void)[] = [];
  private stopped = false;
  /** Objeto na mão de quem está arrastando: evento de fora não o tira do lugar. */
  interactingId: string | null = null;

  constructor(
    private supabase: SupabaseClient,
    private channel: TableChannel,
    private tableId: string,
    private userId: string
  ) {}

  start() {
    const { channel } = this;
    this.unsubscribers.push(
      channel.on('scene:assign', () => void this.reload()),
      channel.on('scene:refresh', (event) => this.onRefresh(event)),
      channel.on('asset:resolved', () => {
        store().bumpLibrary();
        this.scheduleRefresh();
      }),
      channel.on('obj:drag', (event) => this.onDrag(event)),
      channel.on('obj:upsert', (event) => this.onUpsert(event)),
      channel.on('obj:delete', (event) => this.onDelete(event)),
      channel.on('draw:add', (event) => this.onDrawAdd(event)),
      channel.on('draw:delete', (event) => this.onDrawDelete(event)),
      channel.on('ping', (event) => this.onPing(event)),
      channel.on('ruler', (event) => this.onRuler(event)),
      // Sessão, cena padrão e separação chegam pelo snapshot: decidem a cena vista.
      useVttStore.subscribe((state, prev) => {
        if (
          state.sessionOpen !== prev.sessionOpen ||
          state.me?.sceneId !== prev.me?.sceneId ||
          state.me?.role !== prev.me?.role ||
          state.table?.default_scene_id !== prev.table?.default_scene_id ||
          state.gmSceneChoice !== prev.gmSceneChoice
        ) {
          void this.reload();
        }
      })
    );
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.refreshTimer);
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
  }

  attachEngine(engine: EngineBridge | null) {
    this.engine = engine;
  }

  // ---------- Carregar ----------

  /** Relê a lista de cenas e a cena aberta. Também roda a cada reconexão. */
  async reload() {
    const ticket = ++this.loadTicket;
    try {
      const scenes = await fetchScenes(this.supabase, this.tableId);
      if (this.stopped || ticket !== this.loadTicket) return;
      useVttStore.setState({ scenes });
      await this.loadViewedScene(scenes, ticket);
    } catch {
      // Falha de rede: mantém o que está na tela; o próximo SUBSCRIBED recarrega.
    }
  }

  private async loadViewedScene(scenes: VttScene[], ticket: number) {
    const state = store();
    if (!state.me || !state.table) return;
    const viewedSceneId = resolveViewedScene({
      role: state.me.role,
      sessionOpen: state.sessionOpen,
      memberSceneId: state.me.sceneId,
      defaultSceneId: state.table.default_scene_id,
      gmChoice: state.gmSceneChoice,
      sceneIds: scenes.map((scene) => scene.id),
    });
    const scene = scenes.find((s) => s.id === viewedSceneId);

    if (!scene) {
      useVttStore.setState({
        viewedSceneId: null,
        objects: {},
        drawings: {},
        placements: [],
        selectedId: null,
        contextMenu: null,
      });
      return;
    }

    const bundle = await fetchSceneBundle(
      this.supabase,
      scene.id,
      this.userId,
      scene.map_asset_id
    );
    if (this.stopped || ticket !== this.loadTicket) return;

    const changedScene = store().viewedSceneId !== scene.id;
    const held = this.interactingId;
    const current = store().objects[held ?? ''];
    useVttStore.setState((s) => ({
      viewedSceneId: scene.id,
      objects:
        !changedScene && current
          ? { ...bundle.objects, [current.id]: current }
          : bundle.objects,
      drawings: bundle.drawings,
      placements: bundle.placements,
      sceneAssets: bundle.assets,
      selectedId:
        !changedScene && s.selectedId && bundle.objects[s.selectedId]
          ? s.selectedId
          : null,
      contextMenu: changedScene ? null : s.contextMenu,
      attachingId: changedScene ? null : s.attachingId,
      calibrating: changedScene ? false : s.calibrating,
    }));
  }

  private scheduleRefresh() {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => void this.reload(), REFRESH_DELAY_MS);
  }

  private async ensureAsset(id: string): Promise<void> {
    if (store().sceneAssets[id]) return;
    const assets = await fetchAssets(this.supabase, [id]).catch(() => null);
    if (!assets || this.stopped) return;
    useVttStore.setState((s) => ({
      sceneAssets: { ...s.sceneAssets, ...assets },
    }));
  }

  // ---------- Eventos recebidos ----------

  private onRefresh(event: VttEventOf<'scene:refresh'>) {
    if (event.sceneId === store().viewedSceneId) this.scheduleRefresh();
  }

  private onDrag(event: VttEventOf<'obj:drag'>) {
    const state = store();
    if (event.sceneId !== state.viewedSceneId) return;
    if (event.id === this.interactingId) return;
    if (!Number.isFinite(event.x) || !Number.isFinite(event.y)) return;
    const object = state.objects[event.id];
    if (!object) return;
    const own = ownTransform(object, state.objects);
    this.setLocal(
      event.id,
      patchFromOwn(object, state.objects, { ...own, x: event.x, y: event.y })
    );
  }

  private onUpsert(event: VttEventOf<'obj:upsert'>) {
    if (!isValidObject(event.object)) return;
    this.applyRow(event.object);
  }

  /** Last-write-wins pelo `updated_at` do servidor. */
  private applyRow(row: SceneObject) {
    const state = store();
    if (row.scene_id !== state.viewedSceneId) return;
    // Oculto nunca viaja pelo canal para jogador: se chegou, é forjado.
    if (row.hidden && state.me?.role !== 'mestre') return;
    if (row.id === this.interactingId) return;
    const existing = state.objects[row.id];
    if (existing && existing.updated_at > row.updated_at) return;
    void this.ensureAsset(row.asset_id);
    useVttStore.setState((s) => ({
      objects: { ...s.objects, [row.id]: row },
    }));
  }

  private onDelete(event: VttEventOf<'obj:delete'>) {
    if (event.sceneId !== store().viewedSceneId) return;
    this.removeLocal(event.id);
  }

  private onDrawAdd(event: VttEventOf<'draw:add'>) {
    const { drawing } = event;
    if (!isValidDrawing(drawing) || drawing.scene_id !== store().viewedSceneId) {
      return;
    }
    useVttStore.setState((s) => ({
      drawings: { ...s.drawings, [drawing.id]: drawing },
    }));
  }

  private onDrawDelete(event: VttEventOf<'draw:delete'>) {
    if (event.sceneId !== store().viewedSceneId) return;
    if (event.id === null) {
      useVttStore.setState({ drawings: {} });
      return;
    }
    useVttStore.setState({ drawings: without(store().drawings, event.id) });
  }

  private onPing(event: VttEventOf<'ping'>) {
    if (event.sceneId !== store().viewedSceneId) return;
    if (!Number.isFinite(event.x) || !Number.isFinite(event.y)) return;
    if (!allowPerKey(this.pingLimits, event.userId, Date.now(), PING_INTERVAL_MS)) {
      return;
    }
    this.engine?.showPing(event.x, event.y, userColor(event.userId));
  }

  private onRuler(event: VttEventOf<'ruler'>) {
    if (event.sceneId !== store().viewedSceneId) return;
    const { line } = event;
    if (line && !(line.length === 4 && line.every(Number.isFinite))) return;
    this.engine?.showRuler(event.userId, userColor(event.userId), line);
  }

  // ---------- Objetos ----------

  private canEdit(): boolean {
    const role = store().me?.role;
    return Boolean(role && canEditObjects(role));
  }

  /** Muda só na tela: arrastar e handles chamam isto a cada movimento. */
  setLocal(id: string, patch: ObjectPatch) {
    useVttStore.setState((s) => {
      const object = s.objects[id];
      if (!object) return s;
      return { objects: { ...s.objects, [id]: { ...object, ...patch } } };
    });
  }

  private removeLocal(id: string) {
    useVttStore.setState((s) => {
      if (!s.objects[id]) return s;
      return {
        objects: without(s.objects, id),
        selectedId: s.selectedId === id ? null : s.selectedId,
        contextMenu: s.contextMenu?.id === id ? null : s.contextMenu,
      };
    });
  }

  private sceneIsLive(sceneId: string): boolean {
    const state = store();
    return isSceneLive(
      sceneId,
      state.members,
      state.table?.default_scene_id ?? null,
      state.sessionOpen
    );
  }

  /** Oculto e cena em preparo saem só como aviso: o RLS filtra na releitura. */
  private broadcastObject(row: SceneObject) {
    if (row.hidden || !this.sceneIsLive(row.scene_id)) {
      this.channel.emit({ type: 'scene:refresh', sceneId: row.scene_id });
      return;
    }
    this.channel.emit({ type: 'obj:upsert', object: row });
  }

  emitDrag(id: string, x: number, y: number) {
    const state = store();
    const object = state.objects[id];
    if (!object || object.hidden || !this.sceneIsLive(object.scene_id)) return;
    const now = Date.now();
    if (now - this.lastDrag < DRAG_THROTTLE_MS) return;
    this.lastDrag = now;
    this.channel.emit({
      type: 'obj:drag',
      sceneId: object.scene_id,
      id,
      x,
      y,
    });
  }

  /** Aplica na tela, grava e transmite a linha que o banco devolveu. */
  async patchObject(id: string, patch: ObjectPatch): Promise<boolean> {
    this.setLocal(id, patch);
    const { data, error } = await this.supabase
      .from('scene_objects')
      .update(patch)
      .eq('id', id)
      .select(OBJECT_COLUMNS)
      .maybeSingle();
    if (this.stopped) return false;
    if (error || !data) {
      store().showToast(
        error?.message.includes('attach_cycle')
          ? 'Esse anexo daria uma volta em si mesmo.'
          : SAVE_ERROR
      );
      this.scheduleRefresh();
      return false;
    }
    const row = data as unknown as SceneObject;
    this.interactingId = this.interactingId === id ? null : this.interactingId;
    this.applyRow(row);
    this.broadcastObject(row);
    return true;
  }

  async placeAsset(asset: SceneAsset, x: number, y: number) {
    const state = store();
    if (!this.canEdit() || !state.viewedSceneId) return;
    const kind = asset.kind as ObjectKind;
    const zs = Object.values(state.objects).map((object) => object.z);
    const { data, error } = await this.supabase
      .from('scene_objects')
      .insert({
        scene_id: state.viewedSceneId,
        asset_id: asset.id,
        kind,
        x,
        y,
        scale: defaultObjectScale(kind, asset, this.engine?.mapSide() ?? null),
        z: zs.length > 0 ? Math.max(...zs) + 1 : 1,
        created_by: this.userId,
      })
      .select(OBJECT_COLUMNS)
      .single();
    if (error || !data) {
      store().showToast('Não foi possível colocar no mapa. Tente de novo.');
      return;
    }
    const row = data as unknown as SceneObject;
    useVttStore.setState((s) => ({
      sceneAssets: { ...s.sceneAssets, [asset.id]: asset },
      selectedId: row.id,
    }));
    this.applyRow(row);
    this.broadcastObject(row);
  }

  /** Arquivo solto no mapa: da mestra entra direto, de jogador espera aprovação. */
  async dropFiles(files: File[], x: number, y: number) {
    const state = store();
    if (!this.canEdit() || !state.viewedSceneId) return;
    const sceneId = state.viewedSceneId;
    const images = files.filter((file) => file.type.startsWith('image/'));
    if (images.length === 0) return;

    const unavailable = await checkUploadAvailable();
    if (unavailable) {
      store().showToast(unavailable);
      return;
    }

    for (const [index, file] of images.entries()) {
      const offset = index * 40;
      try {
        store().showToast(`Enviando ${file.name}…`);
        const asset = await uploadAsset(file, 'token');
        store().bumpLibrary();
        if (asset.status === 'approved') {
          await this.placeAsset(asset, x + offset, y + offset);
          continue;
        }
        await this.placePending(asset, sceneId, x + offset, y + offset);
      } catch (error) {
        store().showToast(
          error instanceof Error ? error.message : 'Falha ao enviar o arquivo.'
        );
      }
    }
  }

  private async placePending(
    asset: Asset,
    sceneId: string,
    x: number,
    y: number
  ) {
    const { data, error } = await this.supabase
      .from('pending_placements')
      .insert({
        asset_id: asset.id,
        scene_id: sceneId,
        x,
        y,
        scale: defaultObjectScale('token', asset, this.engine?.mapSide() ?? null),
        created_by: this.userId,
      })
      .select('id, asset_id, scene_id, x, y, scale, created_by, created_at')
      .single();
    if (error || !data) throw new Error('Não foi possível colocar no mapa.');
    useVttStore.setState((s) => ({
      placements: [...s.placements, data],
      sceneAssets: { ...s.sceneAssets, [asset.id]: asset },
    }));
    this.channel.emit({ type: 'asset:pending' });
    store().showToast('Enviada! Aguardando aprovação da mestra.');
  }

  async deleteObject(id: string) {
    const state = store();
    const object = state.objects[id];
    const role = state.me?.role;
    if (!object || !role || !canDeleteObject(object, role, this.userId)) {
      store().showToast('Você só pode apagar o que criou.');
      return;
    }
    // Os filhos ficam: viram objetos soltos no mesmo lugar.
    await Promise.all(
      Object.values(state.objects)
        .filter((child) => child.parent_id === id)
        .map((child) => this.patchObject(child.id, detachPatch(child, state.objects)))
    );
    const { data, error } = await this.supabase
      .from('scene_objects')
      .delete()
      .eq('id', id)
      .select('id');
    if (error || !data || data.length === 0) {
      store().showToast('Não foi possível apagar. Tente de novo.');
      this.scheduleRefresh();
      return;
    }
    this.removeLocal(id);
    if (object.hidden || !this.sceneIsLive(object.scene_id)) {
      this.channel.emit({ type: 'scene:refresh', sceneId: object.scene_id });
    } else {
      this.channel.emit({ type: 'obj:delete', sceneId: object.scene_id, id });
    }
  }

  private ownPatch(id: string, change: (own: ReturnType<typeof ownTransform>) => ReturnType<typeof ownTransform>) {
    const { objects } = store();
    const object = objects[id];
    if (!object) return;
    void this.patchObject(
      id,
      patchFromOwn(object, objects, change(ownTransform(object, objects)))
    );
  }

  flipX(id: string) {
    this.ownPatch(id, (own) => ({ ...own, flipX: !own.flipX }));
  }

  flipY(id: string) {
    this.ownPatch(id, (own) => ({ ...own, flipY: !own.flipY }));
  }

  rotateBy(id: string, radians: number) {
    this.ownPatch(id, (own) => ({ ...own, rotation: own.rotation + radians }));
  }

  /** Volta à rotação zero e ao tamanho com que o objeto nasceria hoje. */
  resetTransform(id: string) {
    const { sceneAssets, objects } = store();
    const object = objects[id];
    const asset = object && sceneAssets[object.asset_id];
    if (!object || !asset) return;
    const scale = object.parent_id
      ? 1
      : defaultObjectScale(object.kind, asset, this.engine?.mapSide() ?? null);
    this.ownPatch(id, (own) => ({
      ...own,
      rotation: 0,
      scale,
      flipX: false,
      flipY: false,
    }));
  }

  bringToFront(id: string) {
    const { objects } = store();
    if (objects[id]) {
      void this.patchObject(id, { z: frontZ(objects[id], objects) });
    }
  }

  sendToBack(id: string) {
    const { objects } = store();
    if (objects[id]) {
      void this.patchObject(id, { z: backZ(objects[id], objects) });
    }
  }

  /** Anexado some junto com o pai: esconder só o pai deixaria o filho solto no mapa. */
  async setHidden(id: string, hidden: boolean) {
    const { objects } = store();
    const family = [id, ...descendantsOf(id, objects).map((o) => o.id)];
    await Promise.all(family.map((target) => this.patchObject(target, { hidden })));
  }

  attach(childId: string, parentId: string) {
    const { objects } = store();
    const child = objects[childId];
    const parent = objects[parentId];
    if (!child || !parent) return;
    if (wouldCreateCycle(childId, parentId, objects)) {
      store().showToast('Esse anexo daria uma volta em si mesmo.');
      return;
    }
    // Ocultar segue a família: um filho visível de pai oculto ficaria sem pai para o jogador.
    const patch = attachPatch(child, parent, objects);
    void this.patchObject(
      childId,
      parent.hidden && !child.hidden ? { ...patch, hidden: true } : patch
    );
  }

  detach(id: string) {
    const { objects } = store();
    if (objects[id]) void this.patchObject(id, detachPatch(objects[id], objects));
  }

  // ---------- Desenhos ----------

  async addDrawing(points: number[], color: string, width: number) {
    const sceneId = store().viewedSceneId;
    if (!sceneId || !this.canEdit()) return;
    const { data, error } = await this.supabase
      .from('drawings')
      .insert({ scene_id: sceneId, author_id: this.userId, points, color, width })
      .select(DRAWING_COLUMNS)
      .single();
    if (error || !data) {
      store().showToast('Não foi possível salvar o desenho.');
      return;
    }
    const drawing = data as Drawing;
    useVttStore.setState((s) => ({
      drawings: { ...s.drawings, [drawing.id]: drawing },
    }));
    if (this.sceneIsLive(sceneId)) {
      this.channel.emit({ type: 'draw:add', drawing });
    } else {
      this.channel.emit({ type: 'scene:refresh', sceneId });
    }
  }

  async deleteDrawing(id: string) {
    const drawing = store().drawings[id];
    if (!drawing) return;
    useVttStore.setState({ drawings: without(store().drawings, id) });
    const { error } = await this.supabase.from('drawings').delete().eq('id', id);
    if (error) {
      store().showToast('Não foi possível apagar o desenho.');
      this.scheduleRefresh();
      return;
    }
    this.channel.emit({ type: 'draw:delete', sceneId: drawing.scene_id, id });
  }

  async clearDrawings() {
    const sceneId = store().viewedSceneId;
    if (!sceneId) return;
    const { error } = await this.supabase
      .from('drawings')
      .delete()
      .eq('scene_id', sceneId);
    if (error) {
      store().showToast('Não foi possível apagar os desenhos.');
      return;
    }
    useVttStore.setState({ drawings: {} });
    this.channel.emit({ type: 'draw:delete', sceneId, id: null });
  }

  // ---------- Transitórios ----------

  ping(x: number, y: number) {
    const sceneId = store().viewedSceneId;
    if (!sceneId) return;
    const now = Date.now();
    if (now - this.lastPing < PING_INTERVAL_MS) return;
    this.lastPing = now;
    this.engine?.showPing(x, y, userColor(this.userId));
    this.channel.emit({ type: 'ping', sceneId, userId: this.userId, x, y });
  }

  emitRuler(line: [number, number, number, number] | null) {
    const sceneId = store().viewedSceneId;
    if (!sceneId) return;
    const now = Date.now();
    if (line && now - this.lastRuler < RULER_THROTTLE_MS) return;
    this.lastRuler = now;
    this.channel.emit({ type: 'ruler', sceneId, userId: this.userId, line });
  }

  // ---------- Cenas (mestra) ----------

  /** Mudança que afeta quem vê o quê: todo mundo relê a mesa e a cena. */
  private announceAssign() {
    this.channel.emit({ type: 'scene:assign' });
  }

  async createScene(name: string, folder: string, mapAssetId: string | null) {
    const { scenes, table } = store();
    const { data, error } = await this.supabase
      .from('scenes')
      .insert({
        table_id: this.tableId,
        name,
        folder,
        map_asset_id: mapAssetId,
        sort: scenes.reduce((max, s) => Math.max(max, s.sort), 0) + 1,
      })
      .select(SCENE_COLUMNS)
      .single();
    if (error || !data) {
      store().showToast(
        error?.code === '42P01' || error?.code === 'PGRST205'
          ? 'Tabela de cenas não encontrada. Rode supabase/migrations/010_vtt_scenes.sql no Supabase.'
          : 'Não foi possível criar a cena.'
      );
      return;
    }
    const scene = data as VttScene;
    // A primeira cena vira a padrão: senão os jogadores não teriam o que ver.
    if (!table?.default_scene_id) await this.setDefaultScene(scene.id);
    useVttStore.setState({ gmSceneChoice: scene.id });
    await this.reload();
    this.announceAssign();
  }

  async updateScene(
    id: string,
    patch: Partial<Pick<VttScene, 'name' | 'folder' | 'map_asset_id' | 'meters_per_px' | 'sort'>>
  ): Promise<boolean> {
    const { error } = await this.supabase.from('scenes').update(patch).eq('id', id);
    if (error) {
      store().showToast(SAVE_ERROR);
      return false;
    }
    await this.reload();
    this.channel.emit({ type: 'scene:refresh', sceneId: id });
    return true;
  }

  async changeMap(id: string, mapAssetId: string) {
    // A calibração valia para o mapa antigo.
    await this.updateScene(id, { map_asset_id: mapAssetId, meters_per_px: null });
  }

  async reorderScenes(ordered: VttScene[]) {
    useVttStore.setState({
      scenes: ordered.map((scene, index) => ({ ...scene, sort: index + 1 })),
    });
    const results = await Promise.all(
      ordered.map((scene, index) =>
        this.supabase.from('scenes').update({ sort: index + 1 }).eq('id', scene.id)
      )
    );
    if (results.some((result) => result.error)) store().showToast(SAVE_ERROR);
    await this.reload();
  }

  async duplicateScene(id: string) {
    const { error } = await this.supabase.rpc('duplicate_scene', { p_scene: id });
    if (error) {
      store().showToast('Não foi possível duplicar a cena.');
      return;
    }
    await this.reload();
  }

  async deleteScene(id: string) {
    const { scenes, table } = store();
    if (table?.default_scene_id === id) {
      const next = scenes.find((scene) => scene.id !== id);
      await this.setDefaultScene(next?.id ?? null);
    }
    const { error } = await this.supabase.from('scenes').delete().eq('id', id);
    if (error) {
      store().showToast('Não foi possível apagar a cena.');
      return;
    }
    await this.refreshTable();
    await this.reload();
    this.announceAssign();
  }

  private async refreshTable() {
    const { data } = await this.supabase
      .from('tables')
      .select('default_scene_id')
      .eq('id', this.tableId)
      .maybeSingle();
    if (!data) return;
    const { table } = store();
    if (table) {
      useVttStore.setState({
        table: { ...table, default_scene_id: data.default_scene_id },
      });
    }
  }

  async setDefaultScene(id: string | null) {
    const { error } = await this.supabase
      .from('tables')
      .update({ default_scene_id: id })
      .eq('id', this.tableId);
    if (error) {
      store().showToast(SAVE_ERROR);
      return;
    }
    await this.refreshTable();
    this.announceAssign();
  }

  async assignMembers(userIds: string[], sceneId: string | null): Promise<boolean> {
    let query = this.supabase
      .from('table_members')
      .update({ scene_id: sceneId })
      .eq('table_id', this.tableId);
    if (userIds.length > 0) query = query.in('user_id', userIds);
    const { error } = await query;
    if (error) {
      store().showToast(SAVE_ERROR);
      return false;
    }
    useVttStore.setState((s) => ({
      members: s.members.map((member) =>
        userIds.length === 0 || userIds.includes(member.userId)
          ? { ...member, sceneId }
          : member
      ),
    }));
    this.announceAssign();
    return true;
  }

  /** Grava `meters_per_px` da cena aberta a partir do trecho medido. */
  async saveCalibration(worldPixels: number, meters: number): Promise<boolean> {
    const sceneId = store().viewedSceneId;
    const value = calibrate(worldPixels, meters);
    if (!sceneId || value === null) return false;
    return this.updateScene(sceneId, { meters_per_px: value });
  }

  // ---------- Aprovação (mestra) ----------

  async approveAsset(assetId: string): Promise<void> {
    const { data, error } = await this.supabase.rpc('approve_asset', {
      p_asset: assetId,
    });
    if (error) throw new Error('Não foi possível aprovar. Tente de novo.');
    for (const sceneId of (data ?? []) as string[]) {
      this.channel.emit({ type: 'scene:refresh', sceneId });
    }
    this.channel.emit({ type: 'asset:resolved' });
    await this.reload();
  }

  notifyAssetResolved() {
    this.channel.emit({ type: 'asset:resolved' });
  }

  /** Apagar da biblioteca leva junto objetos e mapas: todo mundo relê. */
  notifyAssetDeleted() {
    this.announceAssign();
    void this.reload();
  }
}

