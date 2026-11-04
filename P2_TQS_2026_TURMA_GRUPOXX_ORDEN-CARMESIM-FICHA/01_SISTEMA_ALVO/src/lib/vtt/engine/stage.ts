import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
  Ticker,
} from 'pixi.js';
import { conditionArc, resolveConditions, splitVisibleConditions } from '../conditions';
import { FxManager } from '../fx/manager';
import { FpsMonitor } from '../fx/rules';
import { formatRulerDistance } from '../geometry';
import { currentEntry } from '../initiative';
import type { EngineBridge } from '../scene-sync';
import {
  effectiveParent,
  ownTransform,
  placementAsObject,
  worldMatrix,
  worldTransform,
} from '../scene-rules';
import { useVttStore } from '../store';
import { applyMatrix, invert, type Point } from '../transform';
import type { Caption, Drawing, SceneObject } from '../types';
import {
  buildCaptionArt,
  CAPTION_ART_SCALE,
  destroyCaptionArt,
  type CaptionArt,
} from './caption-art';
import { fitMap, screenToWorld, type Camera } from './camera';
import { EngineInput } from './input';
import { MARKER_ART_SIZE, MarkerArt, RING_ART_SIZE } from './marker-art';
import { TextureStore } from './textures';

const EMPTY_MAP_SIZE = 2000;
const FALLBACK_OBJECT_SIZE = 256;
const PING_MS = 1500;
const LIGHT_FRAME_MS = 30;
const ANIMATION_FRAME_MS = 11;
const OBFUSCATE_MS = 100;
const OBFUSCATE_LIGHT_MS = 1000;
const REMOTE_RULER_EXPIRES_MS = 5000;
const HANDLE_SCREEN_SIZE = 10;
const ROTATE_HANDLE_OFFSET = 28;
const CAPTION_GAP = 4;

const HIDDEN_ALPHA = 0.4;
const PENDING_ALPHA = 0.55;
const CRIMSON = 0xc4374a;
const BADGE_REFERENCE_SIZE = 180;
const CONDITION_ICON_SIZE = 22;
const CONDITION_SPACING = 24;
const CONDITION_GAP = 16;
const RING_MARGIN = 1.18;
const HP_BAR_HEIGHT = 4;
const HP_BAR_MIN_WIDTH = 28;
const HP_BAR_MAX_WIDTH = 96;

export type HandleId = 'nw' | 'ne' | 'se' | 'sw' | 'rotate';

interface ObjectNode {
  id: string;
  url: string | null;
  container: Container;
  sprite: Sprite;
  width: number;
  height: number;
  badge: Container | null;
  badgeKind: 'hidden' | 'pending' | null;
  /** Posição guardada e o desvio do efeito Tremor, somados no container. */
  baseX: number;
  baseY: number;
  shakeX: number;
  shakeY: number;
}

interface CaptionNode {
  key: string;
  sprite: Sprite;
  art: CaptionArt;
  frame: number;
  revealed: boolean;
}

interface ConditionNode {
  key: string;
  slots: { sprite: Sprite; text: string }[];
}

interface HpBarNode {
  back: Sprite;
  fill: Sprite;
  ratio: number;
}

interface RulerNode {
  graphics: Graphics;
  label: Text;
  color: string;
  line: [number, number, number, number];
  expires: ReturnType<typeof setTimeout> | undefined;
}

function hexColor(color: string): number {
  return Number.parseInt(color.slice(1), 16);
}

/** Canvas da Mesa. O React só monta e desmonta; o resto vem do store (SPEC §7.9). */
export class VttEngine implements EngineBridge {
  camera: Camera = { x: 0, y: 0, zoom: 1 };
  /** Handles maiores no touch, onde o dedo cobre o alvo. */
  handleScale = 1;

  private app = new Application();
  private world = new Container();
  private mapLayer = new Container();
  private propsLayer = new Container();
  private tokensLayer = new Container();
  private captionsLayer = new Container();
  private markersLayer = new Container();
  private drawingsLayer = new Container();
  private effectsLayer = new Container();
  private pingsLayer = new Container();
  private uiLayer = new Container();

  private textures = new TextureStore();
  private loads = new Set<Promise<void>>();
  private nodes = new Map<string, ObjectNode>();
  private captions = new Map<string, CaptionNode>();
  private markerArt = new MarkerArt();
  private conditionNodes = new Map<string, ConditionNode>();
  private hpBars = new Map<string, HpBarNode>();
  private turnRing: Sprite | null = null;
  private turnObjectId: string | null = null;
  private strokes = new Map<string, Graphics>();
  private rulers = new Map<string, RulerNode>();
  private animations = new Set<(now: number) => void>();
  private selection = new Graphics();
  private liveStroke = new Graphics();

  private mapSprite: Sprite | null = null;
  private mapUrl: string | null = null;
  private mapBackdrop = new Graphics();
  private mapSize = { width: EMPTY_MAP_SIZE, height: EMPTY_MAP_SIZE };
  private fittedSceneId: string | null = null;
  private sceneId: string | null = null;

  private raf = 0;
  private frames = 0;
  private lastFrame = 0;
  private destroyed = false;
  private observer: ResizeObserver | null = null;
  private obfuscateTimer: ReturnType<typeof setInterval> | undefined;
  private obfuscateInterval = 0;
  private unsubscribe: (() => void) | null = null;
  private input: EngineInput | null = null;
  private fx: FxManager | null = null;
  private fpsMonitor = new FpsMonitor();

  private constructor(private host: HTMLElement) {}

  /** `isCancelled`: quem desmontou durante o init não chega a pegar texturas. */
  static async create(
    host: HTMLElement,
    isCancelled: () => boolean
  ): Promise<VttEngine> {
    const engine = new VttEngine(host);
    await engine.init(isCancelled);
    return engine;
  }

  private resolution(): number {
    const dpr = window.devicePixelRatio || 1;
    return Math.min(dpr, useVttStore.getState().lightMode ? 1.25 : 2);
  }

  private async init(isCancelled: () => boolean) {
    await this.app.init({
      preference: 'webgl',
      // Render sob demanda (SPEC §7.2): nenhum ticker roda; ver `schedule`.
      autoStart: false,
      sharedTicker: false,
      antialias: false,
      backgroundColor: 0x0d0a0b,
      width: Math.max(1, this.host.clientWidth),
      height: Math.max(1, this.host.clientHeight),
      resolution: this.resolution(),
      autoDensity: true,
    });
    if (isCancelled()) {
      this.destroyed = true;
      this.app.destroy({ removeView: true });
      return;
    }

    // A entrada é nossa; o sistema de eventos do Pixi manteria um ticker ligado.
    this.app.renderer.events.setTargetElement(
      null as unknown as HTMLCanvasElement
    );
    // O coletor de lixo do Pixi roda no Ticker.system, que pediria um rAF por
    // frame para sempre. Ele para e anda só quando `frame` desenha algo.
    Ticker.system.autoStart = false;
    Ticker.system.stop();

    this.app.canvas.style.display = 'block';
    this.app.canvas.style.touchAction = 'none';
    this.host.appendChild(this.app.canvas);

    this.world.addChild(
      this.mapLayer,
      this.propsLayer,
      this.tokensLayer,
      this.captionsLayer,
      this.markersLayer,
      this.drawingsLayer,
      this.effectsLayer,
      this.pingsLayer,
      this.uiLayer
    );
    this.app.stage.addChild(this.world);
    this.mapLayer.addChild(this.mapBackdrop);
    this.drawingsLayer.addChild(this.liveStroke);
    this.uiLayer.addChild(this.selection);
    this.propsLayer.sortableChildren = true;
    this.tokensLayer.sortableChildren = true;
    this.fx = new FxManager(
      {
        renderer: this.app.renderer,
        addAnimation: (animate) => this.addAnimation(animate),
        invalidate: () => this.invalidate(),
        viewWidth: () => this.viewWidth,
        viewHeight: () => this.viewHeight,
        lightMode: () => useVttStore.getState().lightMode,
      },
      this.app.stage
    );

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.host);

    this.input = new EngineInput(this, this.app.canvas);
    this.unsubscribe = useVttStore.subscribe((state, prev) => {
      if (
        state.objects !== prev.objects ||
        state.placements !== prev.placements ||
        state.sceneAssets !== prev.sceneAssets ||
        state.selectedId !== prev.selectedId ||
        state.viewedSceneId !== prev.viewedSceneId ||
        state.scenes !== prev.scenes ||
        state.initiative !== prev.initiative ||
        state.npcs !== prev.npcs
      ) {
        this.syncScene();
      }
      if (state.drawings !== prev.drawings) this.syncDrawings();
      if (state.lightMode !== prev.lightMode) this.applyLightMode();
    });

    this.syncScene();
    this.syncDrawings();
    this.invalidate();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    clearInterval(this.obfuscateTimer);
    this.observer?.disconnect();
    this.unsubscribe?.();
    this.input?.destroy();
    this.rulers.forEach((ruler) => clearTimeout(ruler.expires));
    this.captions.forEach((node) => destroyCaptionArt(node.art));
    this.markerArt.destroy();
    this.fx?.destroy();
    this.textures.destroy();
    this.app.destroy(
      { removeView: true },
      { children: true, texture: false, textureSource: false }
    );
  }

  // ---------- Render sob demanda ----------

  invalidate() {
    this.schedule();
  }

  private schedule() {
    if (this.raf || this.destroyed) return;
    this.raf = requestAnimationFrame((now) => {
      this.raf = 0;
      this.frame(now);
    });
  }

  private frame(now: number) {
    const animating = this.animations.size > 0;
    // Modo leve: animação a 30 fps; sem ele, monitor de 144 Hz não desenha 144 quadros
    // de efeito (90 Hz, o tablet, passa inteiro). Mudança avulsa desenha na hora.
    const interval = useVttStore.getState().lightMode
      ? LIGHT_FRAME_MS
      : ANIMATION_FRAME_MS;
    if (animating && now - this.lastFrame < interval) {
      this.schedule();
      return;
    }
    this.lastFrame = now;
    this.animations.forEach((animate) => animate(now));
    Ticker.system.update(now);
    this.app.render();
    this.frames++;
    if (this.fx?.running && this.fpsMonitor.feed(now)) {
      useVttStore.getState().askLightMode();
    }
    if (this.animations.size > 0) this.schedule();
  }

  /** Para o teste de desempenho: dá para ver que o canvas parado não desenha. */
  get renderedFrames(): number {
    return this.frames;
  }

  /** Para o teste de desempenho: o rAF pedido e as partículas vivas agora. */
  get fxStats() {
    return {
      scheduled: this.raf !== 0,
      running: this.fx?.running ?? false,
      particles: this.fx?.liveParticles ?? 0,
    };
  }

  private addAnimation(animate: (now: number) => void) {
    this.animations.add(animate);
    this.schedule();
    return () => {
      this.animations.delete(animate);
    };
  }

  private resize() {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.app.renderer.resize(width, height, this.resolution());
    this.fx?.resize();
    this.invalidate();
  }

  private applyLightMode() {
    this.resize();
    this.updateObfuscationTimer();
    this.fx?.applyLightMode();
  }

  // ---------- Câmera ----------

  get viewWidth(): number {
    return this.app.screen.width;
  }

  get viewHeight(): number {
    return this.app.screen.height;
  }

  setCamera(camera: Camera) {
    this.camera = camera;
    this.world.position.set(camera.x, camera.y);
    this.world.scale.set(camera.zoom);
    this.layoutCaptions();
    this.layoutMarkers();
    this.drawSelection();
    this.layoutTransient();
    this.fx?.wake();
    this.invalidate();
  }

  toWorld(sx: number, sy: number): Point {
    return screenToWorld(this.camera, sx, sy);
  }

  /** Cliente da janela → tela do canvas. */
  clientToScreen(clientX: number, clientY: number): Point {
    const rect = this.app.canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  fitCamera() {
    this.setCamera(
      fitMap(
        this.mapSize.width,
        this.mapSize.height,
        this.viewWidth,
        this.viewHeight
      )
    );
  }

  mapSide(): number | null {
    return this.mapSprite
      ? Math.max(this.mapSize.width, this.mapSize.height)
      : null;
  }

  // ---------- Mapa e objetos ----------

  private renderedObjects(): Record<string, SceneObject> {
    const { objects, placements } = useVttStore.getState();
    if (placements.length === 0) return objects;
    const all = { ...objects };
    for (const placement of placements) {
      const ghost = placementAsObject(placement);
      all[ghost.id] = ghost;
    }
    return all;
  }

  private syncScene() {
    const state = useVttStore.getState();
    const scene = state.scenes.find((s) => s.id === state.viewedSceneId) ?? null;
    if (scene?.id !== this.sceneId) {
      this.sceneId = scene?.id ?? null;
      this.rulers.forEach((_ruler, userId) => this.showRuler(userId, '', null));
    }

    const mapAsset = scene?.map_asset_id
      ? state.sceneAssets[scene.map_asset_id]
      : undefined;
    this.syncMap(mapAsset?.url ?? null, mapAsset?.width, mapAsset?.height);

    const objects = this.renderedObjects();
    for (const [id, node] of Array.from(this.nodes.entries())) {
      if (!objects[id]) this.removeNode(id, node);
    }
    for (const object of Object.values(objects)) this.syncNode(object, objects);
    // Só depois de todos existirem: filho precisa do container do pai.
    for (const object of Object.values(objects)) this.placeNode(object, objects);

    this.fx?.syncObjects(objects, this.nodes);
    this.fx?.syncWeather(scene?.weather ?? []);
    this.fx?.syncLighting(scene?.lighting ?? null);
    this.syncCaptions(objects);
    this.syncMarkers(objects);
    this.drawSelection();
    this.invalidate();
  }

  private syncMap(
    url: string | null,
    width: number | null | undefined,
    height: number | null | undefined
  ) {
    if (url !== this.mapUrl) {
      if (this.mapSprite) {
        this.mapSprite.destroy();
        this.mapSprite = null;
      }
      if (this.mapUrl) this.textures.release(this.mapUrl, false);
      this.mapUrl = url;
      this.mapSize =
        url && width && height
          ? { width, height }
          : { width: EMPTY_MAP_SIZE, height: EMPTY_MAP_SIZE };
      this.drawBackdrop();
      this.fittedSceneId = null;

      if (url) {
        this.trackLoad(
          this.textures.acquire(url).then(
            (texture) => {
              if (this.destroyed || this.mapUrl !== url) return;
              this.mapSprite = new Sprite(texture);
              this.mapSize = { width: texture.width, height: texture.height };
              this.mapLayer.addChild(this.mapSprite);
              this.drawBackdrop();
              this.fitOnce();
              this.invalidate();
            },
            () => useVttStore.getState().showToast('Não foi possível carregar o mapa.')
          )
        );
      }
    }
    this.fitOnce();
  }

  /** Cada cena abre enquadrada uma vez; depois a câmera é de quem está olhando. */
  private fitOnce() {
    if (!this.sceneId || this.fittedSceneId === this.sceneId) return;
    this.fittedSceneId = this.sceneId;
    this.fitCamera();
  }

  private drawBackdrop() {
    this.mapBackdrop
      .clear()
      .rect(0, 0, this.mapSize.width, this.mapSize.height)
      .fill(0x17120f);
  }

  private syncNode(object: SceneObject, objects: Record<string, SceneObject>) {
    let node = this.nodes.get(object.id);
    if (!node) {
      const container = new Container();
      container.sortableChildren = true;
      const sprite = new Sprite(Texture.EMPTY);
      sprite.anchor.set(0.5);
      sprite.zIndex = 0;
      container.addChild(sprite);
      node = {
        id: object.id,
        url: null,
        container,
        sprite,
        width: FALLBACK_OBJECT_SIZE,
        height: FALLBACK_OBJECT_SIZE,
        badge: null,
        badgeKind: null,
        baseX: 0,
        baseY: 0,
        shakeX: 0,
        shakeY: 0,
      };
      this.nodes.set(object.id, node);
    }

    const asset = useVttStore.getState().sceneAssets[object.asset_id];
    if (asset && asset.url !== node.url) this.loadNodeTexture(node, asset.url, asset);

    const own = ownTransform(object, objects);
    const { container } = node;
    node.baseX = own.x;
    node.baseY = own.y;
    container.position.set(own.x + node.shakeX, own.y + node.shakeY);
    container.rotation = own.rotation;
    container.scale.set(
      own.scale * (own.flipX ? -1 : 1),
      own.scale * (own.flipY ? -1 : 1)
    );
    container.zIndex = object.z;

    const pending = object.id.startsWith('pending:');
    node.sprite.alpha = pending ? PENDING_ALPHA : object.hidden ? HIDDEN_ALPHA : 1;
    this.syncBadge(node, pending ? 'pending' : object.hidden ? 'hidden' : null);
    // Selo proporcional à imagem: a escala do objeto é que define o tamanho na tela.
    node.badge?.scale.set(Math.max(node.width, node.height) / BADGE_REFERENCE_SIZE);
  }

  private loadNodeTexture(
    node: ObjectNode,
    url: string,
    size: { width: number | null; height: number | null }
  ) {
    if (node.url) this.textures.release(node.url, true);
    node.url = url;
    node.width = size.width ?? FALLBACK_OBJECT_SIZE;
    node.height = size.height ?? FALLBACK_OBJECT_SIZE;
    this.trackLoad(
      this.textures.acquire(url, true).then(
        (texture) => {
          if (this.destroyed || node.url !== url) return;
          node.sprite.texture = texture;
          node.width = texture.width;
          node.height = texture.height;
          this.fx?.layoutObject(node.id);
          this.layoutCaptions();
          this.layoutMarkers();
          this.drawSelection();
          this.invalidate();
        },
        () => {
          if (this.destroyed || node.url !== url) return;
          // Quadrado no lugar: dá para ver, selecionar e apagar o objeto quebrado.
          node.sprite.texture = Texture.WHITE;
          node.sprite.tint = CRIMSON;
          node.sprite.setSize(node.width, node.height);
          this.invalidate();
        }
      )
    );
  }

  private trackLoad(load: Promise<void>) {
    this.loads.add(load);
    void load.finally(() => this.loads.delete(load));
  }

  /**
   * Resolve com as texturas pedidas até agora carregadas e já desenhadas: o envio
   * para a GPU acontece no primeiro quadro, e é isso que a transição esconde.
   */
  async sceneLoaded(): Promise<void> {
    await Promise.allSettled(Array.from(this.loads));
    if (this.destroyed) return;
    this.invalidate();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }

  isInsideMap(wx: number, wy: number): boolean {
    return wx >= 0 && wy >= 0 && wx <= this.mapSize.width && wy <= this.mapSize.height;
  }

  zoom(): number {
    return this.camera.zoom;
  }

  viewCenter(): Point {
    return this.toWorld(this.viewWidth / 2, this.viewHeight / 2);
  }

  private placeNode(object: SceneObject, objects: Record<string, SceneObject>) {
    const node = this.nodes.get(object.id);
    if (!node) return;
    const parent = effectiveParent(object, objects);
    const target = parent
      ? this.nodes.get(parent.id)?.container
      : object.kind === 'adereco'
        ? this.propsLayer
        : this.tokensLayer;
    if (target && node.container.parent !== target) target.addChild(node.container);
  }

  private removeNode(id: string, node: ObjectNode) {
    this.fx?.detachObject(id);
    // Filhos saem antes: destruir o container do pai levaria os deles junto.
    node.container.children.slice().forEach((child) => {
      if (child !== node.sprite && child !== node.badge) {
        this.tokensLayer.addChild(child);
      }
    });
    if (node.url) this.textures.release(node.url, true);
    node.container.destroy({ children: true });
    this.nodes.delete(id);
  }

  private syncBadge(node: ObjectNode, kind: 'hidden' | 'pending' | null) {
    if (node.badgeKind === kind) return;
    node.badge?.destroy({ children: true });
    node.badge = null;
    node.badgeKind = kind;
    if (!kind) return;

    const badge =
      kind === 'hidden'
        ? new Graphics()
            .circle(0, 0, 26)
            .fill({ color: 0x000000, alpha: 0.7 })
            .ellipse(0, 0, 18, 10)
            .stroke({ color: 0xf5e6c8, width: 3 })
            .circle(0, 0, 4)
            .fill(0xf5e6c8)
            .moveTo(-16, 14)
            .lineTo(16, -14)
            .stroke({ color: 0xc4374a, width: 4 })
        : new Text({
            text: 'aguardando aprovação',
            style: {
              fontFamily: 'system-ui, sans-serif',
              fontSize: 26,
              fill: 0xf5e6c8,
              stroke: { color: 0x000000, width: 5 },
            },
            anchor: 0.5,
          });
    badge.zIndex = 1_000_000;
    node.badge = badge;
    node.container.addChild(badge);
  }

  // ---------- Legendas ----------

  /** Fora do container do token: legenda não gira, não espelha e continua legível. */
  private syncCaptions(objects: Record<string, SceneObject>) {
    for (const [id, node] of Array.from(this.captions.entries())) {
      const caption = objects[id]?.caption;
      if (!caption || node.key !== JSON.stringify(caption)) {
        this.removeCaption(id, node);
      }
    }
    const isGm = useVttStore.getState().me?.role === 'mestre';
    for (const object of Object.values(objects)) {
      const { caption } = object;
      if (caption && !this.captions.has(object.id)) {
        this.addCaption(object.id, caption, isGm);
      }
    }
    this.layoutCaptions();
    this.updateObfuscationTimer();
  }

  private addCaption(id: string, caption: Caption, isGm: boolean) {
    const art = buildCaptionArt(caption, isGm);
    const sprite = new Sprite(art.scrambled[0] ?? art.real);
    sprite.anchor.set(0.5, 0);
    this.captionsLayer.addChild(sprite);
    this.captions.set(id, {
      key: JSON.stringify(caption),
      sprite,
      art,
      frame: 0,
      revealed: false,
    });
  }

  private removeCaption(id: string, node: CaptionNode) {
    node.sprite.destroy();
    destroyCaptionArt(node.art);
    this.captions.delete(id);
  }

  private layoutCaptions() {
    const objects = this.renderedObjects();
    const scale = CAPTION_ART_SCALE / this.camera.zoom;
    this.captions.forEach((caption, id) => {
      const object = objects[id];
      const node = this.nodes.get(id);
      if (!object || !node) return;
      const world = worldTransform(object, objects);
      // A legenda sempre fica logo abaixo.
      const extent = this.halfHeight(node, world);
      caption.sprite.position.set(
        world.x,
        world.y + extent + CAPTION_GAP / this.camera.zoom
      );
      caption.sprite.scale.set(scale);
    });
  }

  /** Meia altura do retângulo girado, em coordenadas do mundo. */
  private halfHeight(node: ObjectNode, world: { rotation: number; scale: number }) {
    return (
      ((Math.abs(Math.cos(world.rotation)) * node.height +
        Math.abs(Math.sin(world.rotation)) * node.width) /
        2) *
      world.scale
    );
  }

  private halfWidth(node: ObjectNode, world: { rotation: number; scale: number }) {
    return (
      ((Math.abs(Math.sin(world.rotation)) * node.height +
        Math.abs(Math.cos(world.rotation)) * node.width) /
        2) *
      world.scale
    );
  }

  private updateObfuscationTimer() {
    const any = Array.from(this.captions.values()).some(
      (node) => node.art.scrambled.length > 0
    );
    const interval = any
      ? useVttStore.getState().lightMode
        ? OBFUSCATE_LIGHT_MS
        : OBFUSCATE_MS
      : 0;
    if (interval === this.obfuscateInterval) return;
    clearInterval(this.obfuscateTimer);
    this.obfuscateInterval = interval;
    if (interval) {
      this.obfuscateTimer = setInterval(() => this.stepObfuscation(), interval);
    }
  }

  /** Só desenha se alguma legenda ofuscada estiver na tela. */
  private stepObfuscation() {
    if (document.hidden) return;
    let changed = false;
    this.captions.forEach((node) => {
      if (node.art.scrambled.length === 0 || node.revealed) return;
      const { x, y } = node.sprite.position;
      const sx = x * this.camera.zoom + this.camera.x;
      const sy = y * this.camera.zoom + this.camera.y;
      if (
        sx < -300 ||
        sy < -100 ||
        sx > this.viewWidth + 300 ||
        sy > this.viewHeight + 100
      ) {
        return;
      }
      node.frame = (node.frame + 1) % node.art.scrambled.length;
      node.sprite.texture = node.art.scrambled[node.frame];
      changed = true;
    });
    if (changed) this.invalidate();
  }

  /** Mestra com o mouse sobre o token: vê o texto real por baixo da ofuscação. */
  revealCaption(id: string | null) {
    this.captions.forEach((node, captionId) => {
      if (node.art.scrambled.length === 0) return;
      const revealed = captionId === id;
      if (revealed === node.revealed) return;
      node.revealed = revealed;
      node.sprite.texture = revealed
        ? node.art.real
        : node.art.scrambled[node.frame];
      this.invalidate();
    });
  }

  // ---------- Condições, turno e HP ----------

  /** Como a legenda: fora do token, para não girar nem espelhar junto. */
  private syncMarkers(objects: Record<string, SceneObject>) {
    this.syncConditions(objects);
    this.syncHpBars(objects);

    const turn = currentEntry(useVttStore.getState().initiative)?.objectId ?? null;
    this.turnObjectId = turn && objects[turn] ? turn : null;
    if (this.turnObjectId && !this.turnRing) {
      this.turnRing = new Sprite(this.markerArt.ring());
      this.turnRing.anchor.set(0.5);
      this.markersLayer.addChildAt(this.turnRing, 0);
    }
    if (this.turnRing) this.turnRing.visible = Boolean(this.turnObjectId);

    this.layoutMarkers();
  }

  private syncConditions(objects: Record<string, SceneObject>) {
    this.conditionNodes.forEach((node, id) => {
      if (node.key !== objects[id]?.conditions.join('|')) {
        node.slots.forEach((slot) => slot.sprite.destroy());
        this.conditionNodes.delete(id);
      }
    });
    for (const object of Object.values(objects)) {
      if (object.conditions.length === 0 || this.conditionNodes.has(object.id)) continue;
      const { visible, overflow } = splitVisibleConditions(
        resolveConditions(object.conditions)
      );
      const slots = visible.map((condition) => ({
        sprite: new Sprite(this.markerArt.condition(condition)),
        text: condition.label,
      }));
      if (overflow.length > 0) {
        slots.push({
          sprite: new Sprite(this.markerArt.overflow(overflow.length)),
          text: overflow.map((condition) => condition.label).join(', '),
        });
      }
      slots.forEach(({ sprite }) => {
        sprite.anchor.set(0.5);
        this.markersLayer.addChild(sprite);
      });
      this.conditionNodes.set(object.id, {
        key: object.conditions.join('|'),
        slots,
      });
    }
  }

  /** O store só tem NPCs no navegador da mestra: para os outros, nenhuma barra existe. */
  private syncHpBars(objects: Record<string, SceneObject>) {
    const { npcs } = useVttStore.getState();
    const ratios = new Map<string, number>();
    for (const object of Object.values(objects)) {
      const npc = object.npc_id ? npcs[object.npc_id] : undefined;
      if (npc) {
        ratios.set(
          object.id,
          npc.hp_max > 0 ? Math.min(1, npc.hp_current / npc.hp_max) : 0
        );
      }
    }
    this.hpBars.forEach((bar, id) => {
      if (!ratios.has(id)) {
        bar.back.destroy();
        bar.fill.destroy();
        this.hpBars.delete(id);
      }
    });
    ratios.forEach((ratio, id) => {
      let bar = this.hpBars.get(id);
      if (!bar) {
        const back = new Sprite(Texture.WHITE);
        back.tint = 0x000000;
        back.alpha = 0.7;
        const fill = new Sprite(Texture.WHITE);
        fill.tint = CRIMSON;
        back.anchor.set(0, 1);
        fill.anchor.set(0, 1);
        this.markersLayer.addChild(back, fill);
        bar = { back, fill, ratio };
        this.hpBars.set(id, bar);
      }
      bar.ratio = ratio;
    });
  }

  private layoutMarkers() {
    const objects = this.renderedObjects();
    const unit = 1 / this.camera.zoom;

    if (this.turnRing && this.turnObjectId) {
      const object = objects[this.turnObjectId];
      const node = this.nodes.get(this.turnObjectId);
      if (object && node) {
        const world = worldTransform(object, objects);
        const side = Math.max(node.width, node.height) * world.scale * RING_MARGIN;
        this.turnRing.position.set(world.x, world.y);
        this.turnRing.scale.set(side / RING_ART_SIZE);
      }
    }

    this.conditionNodes.forEach((conditions, id) => {
      const object = objects[id];
      const node = this.nodes.get(id);
      if (!object || !node) return;
      const world = worldTransform(object, objects);
      const radius = this.halfHeight(node, world) * this.camera.zoom + CONDITION_GAP;
      const points = conditionArc(conditions.slots.length, radius, CONDITION_SPACING);
      conditions.slots.forEach(({ sprite }, index) => {
        sprite.position.set(
          world.x + points[index].x * unit,
          world.y + points[index].y * unit
        );
        sprite.scale.set((CONDITION_ICON_SIZE / MARKER_ART_SIZE) * unit);
      });
    });

    this.hpBars.forEach((bar, id) => {
      const object = objects[id];
      const node = this.nodes.get(id);
      if (!object || !node) return;
      const world = worldTransform(object, objects);
      const screenWidth = Math.max(
        HP_BAR_MIN_WIDTH,
        Math.min(HP_BAR_MAX_WIDTH, this.halfWidth(node, world) * 2 * this.camera.zoom)
      );
      const width = screenWidth * unit;
      const x = world.x - width / 2;
      const y = world.y + this.halfHeight(node, world);
      bar.back.position.set(x, y);
      bar.fill.position.set(x, y);
      bar.back.width = width;
      bar.back.height = HP_BAR_HEIGHT * unit;
      bar.fill.width = width * bar.ratio;
      bar.fill.height = HP_BAR_HEIGHT * unit;
    });
  }

  /** Nome da condição neste ponto da tela. O "+N" devolve os que não couberam. */
  conditionAt(sx: number, sy: number): string | null {
    const reach = (CONDITION_ICON_SIZE / 2) * this.handleScale;
    for (const node of Array.from(this.conditionNodes.values())) {
      for (const { sprite, text } of node.slots) {
        const x = sprite.position.x * this.camera.zoom + this.camera.x;
        const y = sprite.position.y * this.camera.zoom + this.camera.y;
        if (Math.hypot(x - sx, y - sy) <= reach) return text;
      }
    }
    return null;
  }

  // ---------- Seleção ----------

  /** Objetos de cima para baixo, na mesma ordem em que o Pixi desenha. */
  private drawOrder(objects: Record<string, SceneObject>): SceneObject[] {
    const childrenOf = new Map<string | null, SceneObject[]>();
    for (const object of Object.values(objects)) {
      const parent = effectiveParent(object, objects);
      const key = parent?.id ?? null;
      childrenOf.set(key, [...(childrenOf.get(key) ?? []), object]);
    }
    const walk = (list: SceneObject[], into: SceneObject[]) => {
      list
        .slice()
        .sort((a, b) => a.z - b.z)
        .forEach((object) => {
          const kids = childrenOf.get(object.id) ?? [];
          walk(kids.filter((kid) => kid.z < 0), into);
          into.push(object);
          walk(kids.filter((kid) => kid.z >= 0), into);
        });
    };
    const roots = childrenOf.get(null) ?? [];
    const ordered: SceneObject[] = [];
    walk(roots.filter((o) => o.kind === 'adereco'), ordered);
    walk(roots.filter((o) => o.kind !== 'adereco'), ordered);
    return ordered.reverse();
  }

  /** Pelo retângulo do objeto, em coordenadas do mundo. Pendentes não são clicáveis. */
  objectAt(wx: number, wy: number, exceptId?: string): SceneObject | null {
    const { objects } = useVttStore.getState();
    for (const object of this.drawOrder(objects)) {
      if (object.id === exceptId) continue;
      const node = this.nodes.get(object.id);
      if (!node) continue;
      const local = applyMatrix(invert(worldMatrix(object, objects)), {
        x: wx,
        y: wy,
      });
      if (
        Math.abs(local.x) <= node.width / 2 &&
        Math.abs(local.y) <= node.height / 2
      ) {
        return object;
      }
    }
    return null;
  }

  /** Cantos e alça de giro, em coordenadas do mundo. */
  handlesOf(id: string): Record<HandleId, Point> | null {
    const { objects } = useVttStore.getState();
    const object = objects[id];
    const node = this.nodes.get(id);
    if (!object || !node) return null;
    const matrix = worldMatrix(object, objects);
    const world = worldTransform(object, objects);
    const w = node.width / 2;
    const h = node.height / 2;
    const reach = (h * world.scale) + ROTATE_HANDLE_OFFSET / this.camera.zoom;
    return {
      nw: applyMatrix(matrix, { x: -w, y: -h }),
      ne: applyMatrix(matrix, { x: w, y: -h }),
      se: applyMatrix(matrix, { x: w, y: h }),
      sw: applyMatrix(matrix, { x: -w, y: h }),
      rotate: {
        x: world.x + Math.sin(world.rotation) * reach,
        y: world.y - Math.cos(world.rotation) * reach,
      },
    };
  }

  handleAt(sx: number, sy: number): HandleId | null {
    const { selectedId } = useVttStore.getState();
    if (!selectedId) return null;
    const handles = this.handlesOf(selectedId);
    if (!handles) return null;
    const grab = (HANDLE_SCREEN_SIZE * this.handleScale) + 6;
    const world = this.toWorld(sx, sy);
    for (const id of ['rotate', 'nw', 'ne', 'se', 'sw'] as HandleId[]) {
      const distance =
        Math.hypot(handles[id].x - world.x, handles[id].y - world.y) *
        this.camera.zoom;
      if (distance <= grab) return id;
    }
    return null;
  }

  /** Espessuras divididas pelo zoom: handle tem o mesmo tamanho em qualquer escala. */
  private drawSelection() {
    const { selectedId, objects } = useVttStore.getState();
    const graphics = this.selection;
    graphics.clear();
    const handles =
      selectedId && objects[selectedId] ? this.handlesOf(selectedId) : null;
    if (!handles) return;

    const unit = 1 / this.camera.zoom;
    const size = HANDLE_SCREEN_SIZE * this.handleScale * unit;
    const { nw, ne, se, sw, rotate } = handles;
    const topCenter = { x: (nw.x + ne.x) / 2, y: (nw.y + ne.y) / 2 };

    graphics
      .poly([nw.x, nw.y, ne.x, ne.y, se.x, se.y, sw.x, sw.y])
      .stroke({ color: CRIMSON, width: 2 * unit })
      .moveTo(topCenter.x, topCenter.y)
      .lineTo(rotate.x, rotate.y)
      .stroke({ color: CRIMSON, width: 2 * unit });
    for (const corner of [nw, ne, se, sw]) {
      graphics
        .rect(corner.x - size / 2, corner.y - size / 2, size, size)
        .fill(0xf5e6c8)
        .stroke({ color: CRIMSON, width: 2 * unit });
    }
    graphics
      .circle(rotate.x, rotate.y, size * 0.6)
      .fill(0xf5e6c8)
      .stroke({ color: CRIMSON, width: 2 * unit });
  }

  // ---------- Desenhos ----------

  private syncDrawings() {
    const { drawings } = useVttStore.getState();
    for (const [id, graphics] of Array.from(this.strokes.entries())) {
      if (!drawings[id]) {
        graphics.destroy();
        this.strokes.delete(id);
      }
    }
    for (const drawing of Object.values(drawings)) {
      if (this.strokes.has(drawing.id)) continue;
      const graphics = new Graphics();
      this.traceStroke(graphics, drawing);
      this.drawingsLayer.addChild(graphics);
      this.strokes.set(drawing.id, graphics);
    }
    this.drawingsLayer.addChild(this.liveStroke);
    this.invalidate();
  }

  private traceStroke(
    graphics: Graphics,
    drawing: Pick<Drawing, 'points' | 'color' | 'width'>
  ) {
    const { points } = drawing;
    graphics.moveTo(points[0], points[1]);
    for (let i = 2; i + 1 < points.length; i += 2) {
      graphics.lineTo(points[i], points[i + 1]);
    }
    graphics.stroke({
      color: hexColor(drawing.color),
      width: drawing.width,
      cap: 'round',
      join: 'round',
    });
  }

  drawLiveStroke(points: number[], color: string, width: number) {
    this.liveStroke.clear();
    if (points.length >= 4) {
      this.traceStroke(this.liveStroke, { points, color, width });
    }
    this.invalidate();
  }

  // ---------- Transitórios ----------

  showPing(x: number, y: number, color: string) {
    const ring = new Graphics();
    ring.position.set(x, y);
    this.pingsLayer.addChild(ring);
    const tint = hexColor(color);
    const start = performance.now();
    const stop = this.addAnimation((now) => {
      const t = (now - start) / PING_MS;
      if (t >= 1) {
        stop();
        ring.destroy();
        return;
      }
      const unit = 1 / this.camera.zoom;
      ring
        .clear()
        .circle(0, 0, (14 + 46 * ((t * 2) % 1)) * unit)
        .stroke({ color: tint, width: 4 * unit, alpha: 1 - ((t * 2) % 1) })
        .circle(0, 0, 8 * unit)
        .fill({ color: tint, alpha: 1 - t });
    });
  }

  showRuler(
    userId: string,
    color: string,
    line: [number, number, number, number] | null
  ) {
    let ruler = this.rulers.get(userId);
    if (!line) {
      if (ruler) {
        clearTimeout(ruler.expires);
        ruler.graphics.destroy();
        ruler.label.destroy(true);
        this.rulers.delete(userId);
        this.invalidate();
      }
      return;
    }
    if (!ruler) {
      ruler = {
        graphics: new Graphics(),
        label: new Text({
          text: '',
          style: {
            fontFamily: 'system-ui, sans-serif',
            fontSize: 28,
            fontWeight: '600',
            fill: 0xf5e6c8,
            stroke: { color: 0x000000, width: 6 },
          },
          anchor: { x: 0.5, y: 1 },
        }),
        color,
        line,
        expires: undefined,
      };
      this.uiLayer.addChild(ruler.graphics, ruler.label);
      this.rulers.set(userId, ruler);
    }
    // Quem mediu pode cair sem avisar que terminou.
    clearTimeout(ruler.expires);
    ruler.expires = setTimeout(
      () => this.showRuler(userId, '', null),
      REMOTE_RULER_EXPIRES_MS
    );
    ruler.color = color;
    ruler.line = line;
    this.drawRuler(ruler);
    this.invalidate();
  }

  private drawRuler(ruler: RulerNode) {
    const [x1, y1, x2, y2] = ruler.line;
    const unit = 1 / this.camera.zoom;
    const tint = hexColor(ruler.color);
    ruler.graphics
      .clear()
      .moveTo(x1, y1)
      .lineTo(x2, y2)
      .stroke({ color: tint, width: 3 * unit })
      .circle(x1, y1, 5 * unit)
      .fill(tint)
      .circle(x2, y2, 5 * unit)
      .fill(tint);
    const { scenes, viewedSceneId, calibrating } = useVttStore.getState();
    const scene = scenes.find((s) => s.id === viewedSceneId);
    const pixels = Math.hypot(x2 - x1, y2 - y1);
    ruler.label.text = calibrating
      ? 'calibrando…'
      : formatRulerDistance(pixels, scene?.meters_per_px ?? null);
    ruler.label.position.set(x2, y2 - 10 * unit);
    ruler.label.scale.set(CAPTION_ART_SCALE * unit);
  }

  /** A mesma régua precisa continuar fina quando o zoom muda. */
  private layoutTransient() {
    this.rulers.forEach((ruler) => this.drawRuler(ruler));
  }
}
