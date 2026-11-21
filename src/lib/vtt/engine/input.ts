import { fillPolygon, fillRect, stampCircle, stampSegment } from '../fog/mask';
import { distanceToStroke, simplifyToLimit } from '../geometry';
import {
  canEditObjects,
  patchFromWorld,
  worldTransform,
} from '../scene-rules';
import {
  arrowDirection,
  boxFrom,
  limitSelection,
  MAX_SELECTION,
  mergeSelection,
  nudgeStep,
  selectionLimitMessage,
  toggleInSelection,
} from '../selection';
import { FOG_BRUSH_MAX, FOG_BRUSH_MIN, personColor, soleSelectedId, useVttStore } from '../store';
import type { SceneObject } from '../types';
import { snapAngle, type Point } from '../transform';
import { pinch, zoomAt } from './camera';
import type { HandleId, VttEngine } from './stage';

const LONG_PRESS_MS = 450;
const DOUBLE_TAP_MS = 300;
const PING_HOLD_MS = 250;
const TAP_SLOP_PX = 10;
const WHEEL_ZOOM_SPEED = 0.0015;
const ROTATE_STEP = Math.PI / 12;
const QUARTER_TURN = Math.PI / 2;
const MIN_OBJECT_SCALE = 0.01;
const MIN_STROKE_STEP_PX = 2;
const STROKE_EPSILON_PX = 1.5;
const MAX_LIVE_POINTS = 12000;
const ERASER_RADIUS_PX = 10;
const MAX_STROKE_WIDTH = 200;
const CONDITION_TIP_MS = 2500;
/** `[` e `]`: o pincel cresce ou diminui um quarto. */
const FOG_BRUSH_STEP = 1.25;
/** Clicar perto do primeiro ponto fecha o polígono; perto do último, é o duplo clique. */
const POLY_CLOSE_PX = 10;
const POLY_DUPLICATE_PX = 4;

/** Não há cursor nativo de girar: uma seta curva em SVG, com `grab` de reserva. */
const ROTATE_CURSOR =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23f5e6c8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><path d='M21 12a9 9 0 1 1-3-6.7'/><polyline points='21 3 21 9 15 9'/></svg>\") 12 12, grab";

type Gesture =
  | { kind: 'none' }
  | { kind: 'pan'; lastX: number; lastY: number }
  | { kind: 'pinch'; cx: number; cy: number; distance: number }
  | {
      /** Um ou vários: `ids` são as raízes (anexado a outro selecionado vai com o pai). */
      kind: 'drag';
      ids: string[];
      /** Onde foi o clique: sem arrastar, clicar num item de um grupo seleciona só ele. */
      clickId: string;
      startX: number;
      startY: number;
      starts: Record<string, Point>;
      befores: Record<string, SceneObject>;
      moved: boolean;
    }
  | {
      kind: 'scale';
      id: string;
      startDistance: number;
      startScale: number;
      before: SceneObject;
    }
  | { kind: 'rotate'; id: string; before: SceneObject }
  /**
   * Canto da caixa do grupo: escala todas as raízes a partir do centro do grupo.
   * Cada uma cresce, e a distância até o centro cresce na mesma proporção.
   */
  | {
      kind: 'group-scale';
      ids: string[];
      center: Point;
      startDistance: number;
      starts: Record<string, { x: number; y: number; scale: number }>;
      befores: Record<string, SceneObject>;
    }
  | { kind: 'stroke'; points: number[]; width: number }
  | { kind: 'erase' }
  | { kind: 'ruler'; x1: number; y1: number; x2: number; y2: number }
  /** Caixa de seleção. Só vale (`active`) depois de passar da folga do clique. */
  | {
      kind: 'marquee';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      additive: boolean;
      base: string[];
      active: boolean;
    }
  /** Toque no vazio: segurar vira caixa de seleção; soltar sem mexer limpa a seleção. */
  | { kind: 'tap-empty'; world: Point }
  /** Pincel de névoa: `last` em células, para emendar o traço sem buraco. */
  | { kind: 'fog-brush'; last: Point; value: 0 | 1 }
  /** Retângulo de névoa, em coordenadas do mundo. */
  | { kind: 'fog-rect'; x1: number; y1: number; x2: number; y2: number; value: 0 | 1 };

function store() {
  return useVttStore.getState();
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/** Gestos do canvas (SPEC §7.10). Nada aqui passa pelo sistema de eventos do Pixi. */
export class EngineInput {
  private pointers = new Map<number, Point>();
  private gesture: Gesture = { kind: 'none' };
  private spaceDown = false;
  private longPress: ReturnType<typeof setTimeout> | undefined;
  private pingHold: ReturnType<typeof setTimeout> | undefined;
  private downAt: Point = { x: 0, y: 0 };
  private lastTapAt = 0;
  private doubleTapPending = false;
  private cleanup: (() => void)[] = [];
  private tipTimer: ReturnType<typeof setTimeout> | undefined;
  /** Onde o mouse está, para o Ctrl+V. Fora do canvas (sobre o HUD) é nulo. */
  private cursor: Point | null = null;
  /** Hover: no máximo um hit-test por quadro, nunca um por evento de mouse. */
  private hoverAt: Point | null = null;
  private hoverRaf = 0;
  /** Polígono de névoa em andamento: um ponto por clique, até fechar. */
  private fogPoly: { points: Point[]; value: 0 | 1 } | null = null;

  constructor(
    private engine: VttEngine,
    private canvas: HTMLCanvasElement
  ) {
    const listen = <K extends keyof HTMLElementEventMap>(
      type: K,
      handler: (event: HTMLElementEventMap[K]) => void,
      options?: AddEventListenerOptions
    ) => {
      canvas.addEventListener(type, handler, options);
      this.cleanup.push(() => canvas.removeEventListener(type, handler));
    };
    const listenWindow = <K extends keyof WindowEventMap>(
      type: K,
      handler: (event: WindowEventMap[K]) => void
    ) => {
      window.addEventListener(type, handler);
      this.cleanup.push(() => window.removeEventListener(type, handler));
    };

    listen('pointerdown', (e) => this.onDown(e));
    listen('pointermove', (e) => this.onMove(e));
    listen('pointerup', (e) => this.onUp(e));
    listen('pointercancel', (e) => this.onCancel(e));
    listen('pointerleave', () => {
      this.cursor = null;
      this.hoverAt = null;
      engine.setHover(null);
      engine.revealCaption(null);
      this.showConditionTip(null, { x: 0, y: 0 });
      // O círculo do pincel não fica parado na borda; polígono pela metade fica.
      if (this.gesture.kind === 'none' && !this.fogPoly) engine.setFogPreview(null);
    });
    listen('wheel', (e) => this.onWheel(e), { passive: false });
    listen('dblclick', (e) => this.onDoubleClick(e));
    listen('contextmenu', (e) => this.onContextMenu(e));
    listenWindow('keydown', (e) => this.onKeyDown(e));
    listenWindow('keyup', (e) => {
      if (e.code === 'Space') {
        this.spaceDown = false;
        this.updateCursor();
      }
    });
    this.updateCursor();
    this.cleanup.push(
      useVttStore.subscribe((state, prev) => {
        if (
          state.tool !== prev.tool ||
          state.attachingId !== prev.attachingId ||
          state.armedAsset !== prev.armedAsset ||
          state.calibrating !== prev.calibrating
        ) {
          this.engine.setHover(null);
          this.updateCursor();
        }
        // Saiu da névoa, trocou de formato ou a página perdeu a névoa: o polígono pela metade some.
        if (
          state.tool !== prev.tool ||
          state.fogShape !== prev.fogShape ||
          state.fogOn !== prev.fogOn ||
          state.viewedSceneId !== prev.viewedSceneId
        ) {
          this.cancelFog();
        }
      })
    );
  }

  destroy() {
    cancelAnimationFrame(this.hoverRaf);
    this.clearTimers();
    clearTimeout(this.tipTimer);
    this.cleanup.forEach((remove) => remove());
  }

  private canEdit(): boolean {
    const role = store().me?.role;
    return Boolean(role && canEditObjects(role));
  }

  private updateCursor() {
    const { tool, attachingId, armedAsset, calibrating } = store();
    let cursor = 'default';
    if (this.spaceDown || tool === 'pan') cursor = 'grab';
    else if (attachingId || armedAsset || calibrating || tool !== 'select') {
      cursor = 'crosshair';
    }
    this.canvas.style.cursor = cursor;
  }

  private clearTimers() {
    clearTimeout(this.longPress);
    clearTimeout(this.pingHold);
  }

  private screen(event: { clientX: number; clientY: number }): Point {
    return this.engine.clientToScreen(event.clientX, event.clientY);
  }

  // ---------- Ponteiro ----------

  private onDown(event: PointerEvent) {
    this.canvas.setPointerCapture(event.pointerId);
    const at = this.screen(event);
    this.pointers.set(event.pointerId, at);
    this.engine.handleScale = event.pointerType === 'touch' ? 2 : 1;
    if (store().contextMenu) useVttStore.setState({ contextMenu: null });

    // Segundo dedo sempre vira pan + pinça, mesmo no meio de outro gesto.
    if (this.pointers.size === 2) {
      this.clearTimers();
      this.abortGesture();
      this.startPinch();
      return;
    }
    if (this.pointers.size > 2) return;

    this.downAt = at;

    if (event.button === 2) return;
    if (event.button === 1 || this.spaceDown) {
      event.preventDefault();
      this.gesture = { kind: 'pan', lastX: at.x, lastY: at.y };
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    const world = this.engine.toWorld(at.x, at.y);

    // Névoa antes do Alt+clique (ping): com ela, o Alt troca revelar por cobrir.
    if (store().tool === 'fog') {
      this.engine.setHover(null);
      this.startFog(world, event.altKey);
      return;
    }

    if (event.altKey) {
      store().sync?.ping(world.x, world.y);
      return;
    }

    if (event.pointerType === 'touch') this.armTouchTimers(at, world);

    const state = store();
    this.engine.setHover(null);

    if (state.armedAsset && this.canEdit()) {
      void state.sync?.placeAsset(state.armedAsset, world.x, world.y);
      useVttStore.setState({ armedAsset: null });
      return;
    }

    if (state.attachingId) {
      const target = this.engine.objectAt(world.x, world.y, state.attachingId);
      if (target) state.sync?.attach(state.attachingId, target.id);
      else state.showToast('Anexo cancelado: clique em um token.');
      useVttStore.setState({ attachingId: null });
      return;
    }

    if (state.calibrating) {
      this.gesture = {
        kind: 'ruler',
        x1: world.x,
        y1: world.y,
        x2: world.x,
        y2: world.y,
      };
      return;
    }

    switch (state.tool) {
      case 'pan':
        this.gesture = { kind: 'pan', lastX: at.x, lastY: at.y };
        this.canvas.style.cursor = 'grabbing';
        return;
      case 'ping':
        state.sync?.ping(world.x, world.y);
        return;
      case 'ruler':
        this.gesture = {
          kind: 'ruler',
          x1: world.x,
          y1: world.y,
          x2: world.x,
          y2: world.y,
        };
        return;
      case 'draw':
        if (this.canEdit()) {
          this.gesture = {
            kind: 'stroke',
            points: [world.x, world.y],
            width: Math.min(
              MAX_STROKE_WIDTH,
              state.strokeWidth / this.engine.camera.zoom
            ),
          };
        }
        return;
      case 'erase':
        if (this.canEdit()) {
          this.gesture = { kind: 'erase' };
          this.eraseAt(world);
        }
        return;
      default:
        this.startSelect(at, world, event);
    }
  }

  /** Troca a seleção. Passou de 50: fica com os primeiros e avisa, sem cortar calado. */
  private select(ids: string[]) {
    const limited = limitSelection(ids);
    if (limited.truncated) store().showToast(selectionLimitMessage(limited.total));
    useVttStore.setState({ selectedIds: limited.ids });
  }

  private startSelect(at: Point, world: Point, event: PointerEvent) {
    if (!this.canEdit()) return;
    const state = store();
    const sole = soleSelectedId(state);

    const handle = this.engine.handleAt(at.x, at.y);
    if (handle && sole && state.objects[sole]) {
      this.startHandle(handle, sole, world);
      return;
    }
    if (handle && !sole && handle !== 'rotate') {
      this.startGroupScale(world);
      return;
    }

    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    const hit = this.engine.objectAt(world.x, world.y);
    if (!hit) {
      // Toque: segurar no vazio faz a caixa (arrastar com um dedo não faz nada sozinho).
      if (event.pointerType === 'touch') {
        this.gesture = { kind: 'tap-empty', world };
        return;
      }
      this.gesture = {
        kind: 'marquee',
        x1: world.x,
        y1: world.y,
        x2: world.x,
        y2: world.y,
        additive,
        base: additive ? state.selectedIds : [],
        active: false,
      };
      return;
    }

    if (additive) {
      const next = toggleInSelection(state.selectedIds, hit.id);
      if (next.length > MAX_SELECTION) {
        state.showToast(selectionLimitMessage(next.length));
        return;
      }
      useVttStore.setState({ selectedIds: next });
      return;
    }

    const ids = state.selectedIds.includes(hit.id) ? state.selectedIds : [hit.id];
    if (ids !== state.selectedIds) useVttStore.setState({ selectedIds: ids });
    this.startDrag(ids, hit.id, world);
  }

  /** Pega o grupo: guarda onde cada raiz estava e segura todas contra evento de fora. */
  private startDrag(ids: string[], clickId: string, world: Point) {
    const { objects, sync } = store();
    if (!sync) return;
    const roots = sync.rootsOf(ids);
    const starts: Record<string, Point> = {};
    const befores: Record<string, SceneObject> = {};
    for (const id of roots) {
      const current = worldTransform(objects[id], objects);
      starts[id] = { x: current.x, y: current.y };
      befores[id] = objects[id];
    }
    sync.hold(roots);
    this.gesture = {
      kind: 'drag',
      ids: roots,
      clickId,
      startX: world.x,
      startY: world.y,
      starts,
      befores,
      moved: false,
    };
    this.canvas.style.cursor = 'grabbing';
  }

  private startGroupScale(world: Point) {
    const { objects, selectedIds, sync } = store();
    const bounds = this.engine.groupBounds();
    if (!sync || !bounds) return;
    const roots = sync.rootsOf(selectedIds);
    const starts: Record<string, { x: number; y: number; scale: number }> = {};
    const befores: Record<string, SceneObject> = {};
    for (const id of roots) {
      const current = worldTransform(objects[id], objects);
      starts[id] = { x: current.x, y: current.y, scale: current.scale };
      befores[id] = objects[id];
    }
    sync.hold(roots);
    this.gesture = {
      kind: 'group-scale',
      ids: roots,
      center: bounds.center,
      startDistance: Math.max(1, Math.hypot(world.x - bounds.center.x, world.y - bounds.center.y)),
      starts,
      befores,
    };
  }

  private moveGroupScale(gesture: Extract<Gesture, { kind: 'group-scale' }>, world: Point) {
    const { objects, sync } = store();
    if (!sync) return;
    const distance = Math.hypot(world.x - gesture.center.x, world.y - gesture.center.y);
    // Nenhum objeto fica menor que o mínimo de sempre.
    const smallest = Math.min(...Object.values(gesture.starts).map((start) => start.scale));
    const factor = Math.max(MIN_OBJECT_SCALE / Math.max(smallest, MIN_OBJECT_SCALE), distance / gesture.startDistance);
    const { x: cx, y: cy } = gesture.center;
    const patches: { id: string; patch: ReturnType<typeof patchFromWorld> }[] = [];
    for (const id of gesture.ids) {
      const object = objects[id];
      const start = gesture.starts[id];
      if (!object || !start) continue;
      const current = worldTransform(object, objects);
      patches.push({
        id,
        patch: patchFromWorld(object, objects, {
          ...current,
          x: cx + (start.x - cx) * factor,
          y: cy + (start.y - cy) * factor,
          scale: start.scale * factor,
        }),
      });
    }
    // Como na alça de um objeto só: os outros veem o resultado ao soltar.
    sync.setLocalMany(patches);
  }

  private startHandle(handle: HandleId, id: string, world: Point) {
    const { objects, sync } = store();
    sync?.hold([id]);
    if (handle === 'rotate') {
      this.gesture = { kind: 'rotate', id, before: objects[id] };
      return;
    }
    const current = worldTransform(objects[id], objects);
    this.gesture = {
      kind: 'scale',
      id,
      startDistance: Math.max(
        1,
        Math.hypot(world.x - current.x, world.y - current.y)
      ),
      startScale: current.scale,
      before: objects[id],
    };
  }

  private armTouchTimers(at: Point, world: Point) {
    const now = performance.now();
    this.doubleTapPending = now - this.lastTapAt < DOUBLE_TAP_MS;
    this.clearTimers();
    if (this.doubleTapPending) {
      // Toque duplo e segurar = ping.
      this.pingHold = setTimeout(() => {
        this.doubleTapPending = false;
        this.abortGesture();
        store().sync?.ping(world.x, world.y);
      }, PING_HOLD_MS);
      return;
    }
    this.longPress = setTimeout(() => {
      // Segurar no vazio com Selecionar: vira caixa de seleção a partir dali.
      if (this.gesture.kind === 'tap-empty') {
        const start = this.gesture.world;
        this.gesture = {
          kind: 'marquee',
          x1: start.x,
          y1: start.y,
          x2: start.x,
          y2: start.y,
          additive: false,
          base: [],
          active: true,
        };
        navigator.vibrate?.(15);
        return;
      }
      this.abortGesture();
      this.openMenuAt(at);
    }, LONG_PRESS_MS);
  }

  private onMove(event: PointerEvent) {
    const known = this.pointers.has(event.pointerId);
    const at = this.screen(event);
    if (event.pointerType !== 'touch') this.cursor = at;

    if (!known) {
      if (event.pointerType === 'touch') return;
      this.hoverAt = at;
      if (!this.hoverRaf) {
        this.hoverRaf = requestAnimationFrame(() => {
          this.hoverRaf = 0;
          if (this.hoverAt) this.hover(this.hoverAt);
        });
      }
      return;
    }
    this.pointers.set(event.pointerId, at);

    if (Math.hypot(at.x - this.downAt.x, at.y - this.downAt.y) > TAP_SLOP_PX) {
      this.clearTimers();
      this.doubleTapPending = false;
    }

    const { gesture } = this;
    const world = this.engine.toWorld(at.x, at.y);

    switch (gesture.kind) {
      case 'pan':
        this.engine.setCamera({
          ...this.engine.camera,
          x: this.engine.camera.x + at.x - gesture.lastX,
          y: this.engine.camera.y + at.y - gesture.lastY,
        });
        gesture.lastX = at.x;
        gesture.lastY = at.y;
        return;
      case 'pinch':
        this.movePinch();
        return;
      case 'drag':
        gesture.moved = true;
        this.moveDrag(gesture, world);
        return;
      case 'scale':
        this.moveScale(gesture, world);
        return;
      case 'group-scale':
        this.moveGroupScale(gesture, world);
        return;
      case 'rotate':
        this.moveRotate(gesture, world, event.shiftKey);
        return;
      case 'stroke':
        this.extendStroke(gesture, world);
        return;
      case 'erase':
        this.eraseAt(world);
        return;
      case 'ruler':
        gesture.x2 = world.x;
        gesture.y2 = world.y;
        this.showRuler(gesture);
        return;
      case 'fog-brush':
        this.moveFogBrush(gesture, world);
        return;
      case 'fog-rect':
        gesture.x2 = world.x;
        gesture.y2 = world.y;
        this.engine.setFogPreview({
          kind: 'rect',
          x0: gesture.x1,
          y0: gesture.y1,
          x1: gesture.x2,
          y1: gesture.y2,
          reveal: gesture.value === 1,
        });
        return;
      case 'marquee':
        gesture.x2 = world.x;
        gesture.y2 = world.y;
        if (!gesture.active && Math.hypot(at.x - this.downAt.x, at.y - this.downAt.y) > TAP_SLOP_PX) {
          gesture.active = true;
        }
        if (gesture.active) {
          this.engine.setMarquee(boxFrom({ x: gesture.x1, y: gesture.y1 }, { x: gesture.x2, y: gesture.y2 }));
        }
        return;
      default:
    }
  }

  private showConditionTip(text: string | null, at: Point) {
    const current = store().conditionTip;
    if (text === (current?.text ?? null)) return;
    const rect = this.canvas.getBoundingClientRect();
    useVttStore.setState({
      conditionTip: text
        ? { text, x: at.x + rect.left, y: at.y + rect.top }
        : null,
    });
  }

  /**
   * Mouse parado sobre o mapa (no máximo uma vez por quadro): cursor, contorno de
   * hover, dica de condição e, para a mestra, legenda ofuscada.
   */
  private hover(at: Point) {
    if (store().tool === 'fog') {
      this.fogHover(at);
      return;
    }
    this.showConditionTip(this.engine.conditionAt(at.x, at.y), at);
    const state = store();
    const world = this.engine.toWorld(at.x, at.y);
    const hit = this.engine.objectAt(world.x, world.y);
    // Só a mestra: passar o mouse revela a legenda ofuscada.
    if (state.me?.role === 'mestre') this.engine.revealCaption(hit?.id ?? null);

    const selecting =
      state.tool === 'select' &&
      !this.spaceDown &&
      !state.attachingId &&
      !state.armedAsset &&
      !state.calibrating;
    // Mão, outras ferramentas e espectador: nada recebe hover. O mapa nunca recebe.
    if (!selecting || !this.canEdit()) {
      this.engine.setHover(null);
      this.updateCursor();
      return;
    }

    const handle = this.engine.handleAt(at.x, at.y);
    if (handle) {
      this.engine.setHover(null);
      this.canvas.style.cursor = this.handleCursor(handle);
      return;
    }
    this.engine.setHover(hit?.id ?? null);
    this.canvas.style.cursor = hit ? 'grab' : 'default';
  }

  /** Cursor de redimensionar na diagonal certa, mesmo com o objeto girado. */
  private handleCursor(handle: HandleId): string {
    if (handle === 'rotate') return ROTATE_CURSOR;
    const handles = this.engine.selectionHandles();
    const corner = handles?.[handle];
    if (!handles?.nw || !handles.se || !corner) return 'nwse-resize';
    const center = { x: (handles.nw.x + handles.se.x) / 2, y: (handles.nw.y + handles.se.y) / 2 };
    return (corner.x - center.x) * (corner.y - center.y) > 0 ? 'nwse-resize' : 'nesw-resize';
  }

  /** Arrasta o grupo inteiro pelo mesmo deslocamento: a posição relativa não muda. */
  private moveDrag(gesture: Extract<Gesture, { kind: 'drag' }>, world: Point) {
    const { objects, sync } = store();
    if (!sync) return;
    const dx = world.x - gesture.startX;
    const dy = world.y - gesture.startY;
    const patches: { id: string; patch: ReturnType<typeof patchFromWorld> }[] = [];
    const items: { id: string; x: number; y: number }[] = [];
    for (const id of gesture.ids) {
      const object = objects[id];
      const start = gesture.starts[id];
      if (!object || !start) continue;
      const current = worldTransform(object, objects);
      const patch = patchFromWorld(object, objects, { ...current, x: start.x + dx, y: start.y + dy });
      patches.push({ id, patch });
      const own = patch.local ?? { x: patch.x as number, y: patch.y as number };
      items.push({ id, x: own.x, y: own.y });
    }
    // Um setState e um broadcast para o grupo todo, com o throttle de sempre.
    sync.setLocalMany(patches);
    sync.emitDragMany(items);
  }

  private moveScale(gesture: Extract<Gesture, { kind: 'scale' }>, world: Point) {
    const { objects, sync } = store();
    const object = objects[gesture.id];
    if (!object || !sync) return;
    const current = worldTransform(object, objects);
    const distance = Math.hypot(world.x - current.x, world.y - current.y);
    sync.setLocal(
      gesture.id,
      patchFromWorld(object, objects, {
        ...current,
        scale: Math.max(
          MIN_OBJECT_SCALE,
          gesture.startScale * (distance / gesture.startDistance)
        ),
      })
    );
  }

  private moveRotate(
    gesture: Extract<Gesture, { kind: 'rotate' }>,
    world: Point,
    snap: boolean
  ) {
    const { objects, sync } = store();
    const object = objects[gesture.id];
    if (!object || !sync) return;
    const current = worldTransform(object, objects);
    const angle = Math.atan2(world.x - current.x, current.y - world.y);
    sync.setLocal(
      gesture.id,
      patchFromWorld(object, objects, {
        ...current,
        rotation: snap ? snapAngle(angle, ROTATE_STEP) : angle,
      })
    );
  }

  private extendStroke(
    gesture: Extract<Gesture, { kind: 'stroke' }>,
    world: Point
  ) {
    const { points } = gesture;
    const lastX = points[points.length - 2];
    const lastY = points[points.length - 1];
    const step = MIN_STROKE_STEP_PX / this.engine.camera.zoom;
    if (
      points.length >= MAX_LIVE_POINTS ||
      Math.hypot(world.x - lastX, world.y - lastY) < step
    ) {
      return;
    }
    points.push(world.x, world.y);
    const { strokeColor } = store();
    this.engine.drawLiveStroke(points, strokeColor, gesture.width);
  }

  private eraseAt(world: Point) {
    const { drawings, sync, me } = store();
    const reach = ERASER_RADIUS_PX / this.engine.camera.zoom;
    for (const drawing of Object.values(drawings)) {
      if (drawing.author_id !== me?.userId) continue;
      const distance = distanceToStroke(world.x, world.y, drawing.points);
      if (distance <= reach + drawing.width / 2) {
        void sync?.deleteDrawing(drawing.id);
      }
    }
  }

  private showRuler(gesture: Extract<Gesture, { kind: 'ruler' }>) {
    const { me, sync, calibrating } = store();
    const line: [number, number, number, number] = [
      gesture.x1,
      gesture.y1,
      gesture.x2,
      gesture.y2,
    ];
    if (me) this.engine.showRuler(me.userId, personColor(me.userId), line);
    if (!calibrating) sync?.emitRuler(line);
  }

  private onUp(event: PointerEvent) {
    const at = this.pointers.get(event.pointerId);
    this.pointers.delete(event.pointerId);
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    this.clearTimers();

    if (this.gesture.kind === 'pinch') {
      if (this.pointers.size < 2) this.gesture = { kind: 'none' };
      return;
    }

    // Com a névoa, dois toques seguidos são dois pontos do polígono, não "enquadrar".
    if (event.pointerType === 'touch' && at && store().tool !== 'fog') this.registerTap(at);

    const { gesture } = this;
    this.gesture = { kind: 'none' };
    const { sync, me, calibrating } = store();

    switch (gesture.kind) {
      case 'pan':
        this.updateCursor();
        return;
      case 'drag':
        this.updateCursor();
        if (gesture.moved) {
          sync?.commitTransforms(gesture.befores);
        } else {
          sync?.release(gesture.ids);
          // Clique sem arrastar num item de um grupo: fica só ele.
          if (store().selectedIds.length > 1) useVttStore.setState({ selectedIds: [gesture.clickId] });
        }
        return;
      case 'scale':
      case 'rotate':
        sync?.commitTransforms({ [gesture.id]: gesture.before });
        return;
      case 'group-scale':
        // Uma gravação e um passo de desfazer para o grupo inteiro.
        sync?.commitTransforms(gesture.befores);
        return;
      case 'marquee': {
        this.engine.setMarquee(null);
        if (!gesture.active) {
          // Clique no vazio, sem arrastar: limpa (com Shift/Ctrl, mantém).
          if (!gesture.additive && store().selectedIds.length > 0) useVttStore.setState({ selectedIds: [] });
          return;
        }
        const found = this.engine.objectsInBox(
          boxFrom({ x: gesture.x1, y: gesture.y1 }, { x: gesture.x2, y: gesture.y2 })
        );
        this.select(mergeSelection(gesture.base, found));
        return;
      }
      case 'fog-brush':
        store().fogSync?.endStroke();
        return;
      case 'fog-rect':
        this.finishFogRect(gesture);
        return;
      case 'tap-empty':
        if (at && Math.hypot(at.x - this.downAt.x, at.y - this.downAt.y) <= TAP_SLOP_PX) {
          if (store().selectedIds.length > 0) useVttStore.setState({ selectedIds: [] });
        }
        return;
      case 'stroke': {
        this.engine.drawLiveStroke([], '#000000', 1);
        // Um décimo de pixel basta, e o broadcast do traço fica bem menor.
        const simple = simplifyToLimit(
          gesture.points,
          STROKE_EPSILON_PX / this.engine.camera.zoom
        ).map((value) => Math.round(value * 10) / 10);
        if (simple.length >= 4) {
          void sync?.addDrawing(simple, store().strokeColor, gesture.width);
        }
        return;
      }
      case 'ruler':
        if (me) this.engine.showRuler(me.userId, '', null);
        if (calibrating) {
          useVttStore.setState({
            calibrating: false,
            calibrationPixels: Math.hypot(
              gesture.x2 - gesture.x1,
              gesture.y2 - gesture.y1
            ),
          });
        } else {
          sync?.emitRuler(null);
        }
        return;
      default:
    }
  }

  private registerTap(at: Point) {
    if (Math.hypot(at.x - this.downAt.x, at.y - this.downAt.y) > TAP_SLOP_PX) {
      return;
    }
    // Sem mouse não há hover: o toque mostra o nome, que some sozinho.
    const tip = this.engine.conditionAt(at.x, at.y);
    this.showConditionTip(tip, at);
    clearTimeout(this.tipTimer);
    if (tip) {
      this.tipTimer = setTimeout(
        () => this.showConditionTip(null, at),
        CONDITION_TIP_MS
      );
    }
    const wasDoubleTap = this.doubleTapPending;
    this.doubleTapPending = false;
    this.lastTapAt = wasDoubleTap ? 0 : performance.now();
    if (wasDoubleTap) {
      const world = this.engine.toWorld(at.x, at.y);
      if (!this.engine.objectAt(world.x, world.y)) this.engine.fitCamera();
    }
  }

  private onCancel(event: PointerEvent) {
    this.pointers.delete(event.pointerId);
    this.clearTimers();
    this.abortGesture();
  }

  /** Gesto interrompido: arraste volta a valer o que o banco tem. */
  private abortGesture() {
    const { gesture } = this;
    this.gesture = { kind: 'none' };
    const { sync, me } = store();
    if (
      gesture.kind === 'drag' ||
      gesture.kind === 'scale' ||
      gesture.kind === 'rotate' ||
      gesture.kind === 'group-scale'
    ) {
      if (sync) {
        sync.release(gesture.kind === 'drag' || gesture.kind === 'group-scale' ? gesture.ids : [gesture.id]);
        // Toque longo cai aqui sem ter mexido em nada: não precisa reler.
        if (gesture.kind !== 'drag' || gesture.moved) void sync.reload();
      }
      this.updateCursor();
    }
    if (gesture.kind === 'marquee') this.engine.setMarquee(null);
    if (gesture.kind === 'stroke') this.engine.drawLiveStroke([], '#000000', 1);
    // O que o pincel já pintou fica (e vira um passo); o retângulo não chega a valer.
    if (gesture.kind === 'fog-brush') store().fogSync?.endStroke();
    if (gesture.kind === 'fog-rect') this.engine.setFogPreview(null);
    if (gesture.kind === 'ruler' && me) {
      this.engine.showRuler(me.userId, '', null);
      if (!store().calibrating) sync?.emitRuler(null);
    }
  }

  // ---------- Pinça ----------

  private twoFingers(): { cx: number; cy: number; distance: number } | null {
    const [a, b] = Array.from(this.pointers.values());
    if (!a || !b) return null;
    return {
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
      distance: Math.hypot(a.x - b.x, a.y - b.y),
    };
  }

  private startPinch() {
    const fingers = this.twoFingers();
    if (fingers) this.gesture = { kind: 'pinch', ...fingers };
  }

  private movePinch() {
    const { gesture } = this;
    const fingers = this.twoFingers();
    if (gesture.kind !== 'pinch' || !fingers) return;
    this.engine.setCamera(pinch(this.engine.camera, gesture, fingers));
    this.gesture = { kind: 'pinch', ...fingers };
  }

  // ---------- Roda, duplo clique, menu, teclado ----------

  private onWheel(event: WheelEvent) {
    event.preventDefault();
    const at = this.screen(event);
    const { camera } = this.engine;
    this.engine.setCamera(
      zoomAt(
        camera,
        camera.zoom * Math.exp(-event.deltaY * WHEEL_ZOOM_SPEED),
        at.x,
        at.y
      )
    );
  }

  private onDoubleClick(event: MouseEvent) {
    if (store().tool === 'fog') {
      this.closeFogPoly();
      return;
    }
    if (store().tool !== 'select') return;
    const at = this.screen(event);
    const world = this.engine.toWorld(at.x, at.y);
    if (!this.engine.objectAt(world.x, world.y)) this.engine.fitCamera();
  }

  private onContextMenu(event: MouseEvent) {
    event.preventDefault();
    // No touch o menu vem do toque longo: o navegador também dispara este evento.
    if (this.lastPointerWasTouch()) return;
    this.openMenuAt(this.screen(event));
  }

  private lastPointerWasTouch(): boolean {
    return this.engine.handleScale > 1;
  }

  private openMenuAt(at: Point) {
    if (!this.canEdit()) return;
    const world = this.engine.toWorld(at.x, at.y);
    const hit = this.engine.objectAt(world.x, world.y);
    if (!hit) return;
    const rect = this.canvas.getBoundingClientRect();
    const { selectedIds } = store();
    // Clique direito num item do grupo: o menu vale para o grupo inteiro.
    useVttStore.setState({
      selectedIds: selectedIds.includes(hit.id) ? selectedIds : [hit.id],
      contextMenu: { id: hit.id, x: at.x + rect.left, y: at.y + rect.top },
    });
  }

  private onKeyDown(event: KeyboardEvent) {
    if (isTyping(event.target)) return;
    // Overlay de Páginas por cima: Delete, setinhas e atalhos não mexem no mapa escondido.
    if (store().pagesOpen) return;
    if (event.code === 'Space') {
      this.spaceDown = true;
      this.updateCursor();
      event.preventDefault();
      return;
    }
    const { selectedIds, sync } = store();
    if (this.onFogKey(event)) return;
    if (this.onHistoryKey(event)) return;
    if (this.onSelectAllKey(event)) return;
    if (this.onClipboardKey(event)) return;
    if (event.key === 'Escape') {
      useVttStore.setState({
        selectedIds: [],
        contextMenu: null,
        attachingId: null,
        armedAsset: null,
        calibrating: false,
        calibrationPixels: null,
      });
      this.abortGesture();
      return;
    }
    if (selectedIds.length === 0 || !sync || !this.canEdit()) return;
    const direction = arrowDirection(event.key);
    // Só com o foco no mapa: na barra lateral as setinhas rolam a lista.
    if (direction && this.focusOnMap(event)) {
      event.preventDefault();
      const scene = store().scenes.find((item) => item.id === store().viewedSceneId);
      const step = nudgeStep(scene?.meters_per_px, this.engine.camera.zoom, event.shiftKey);
      sync.nudge(selectedIds, direction.x * step, direction.y * step);
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      void sync.deleteObjects(selectedIds);
    } else if (event.key === 'q' || event.key === 'Q') {
      sync.rotateMany(selectedIds, -QUARTER_TURN);
    } else if (event.key === 'e' || event.key === 'E') {
      sync.rotateMany(selectedIds, QUARTER_TURN);
    }
  }

  // ---------- Névoa (Fase 11, só a mestra) ----------

  private canFog(): boolean {
    const { me, fogSync } = store();
    return me?.role === 'mestre' && Boolean(fogSync?.mask);
  }

  /** Alt segurado inverte: revelar vira cobrir e vice-versa. */
  private fogValue(alt: boolean): 0 | 1 {
    return (store().fogMode === 'reveal') !== alt ? 1 : 0;
  }

  /** Raio do pincel em células: o tamanho é de tela, como a espessura do desenho. */
  private brushCells(): number {
    return (store().fogBrush / 2 / this.engine.camera.zoom) * this.engine.fogCellsPerWorld();
  }

  private startFog(world: Point, alt: boolean) {
    if (!this.canFog()) return;
    const value = this.fogValue(alt);
    const state = store();
    if (state.fogShape === 'brush') {
      const cell = this.engine.fogCell(world.x, world.y);
      const fog = state.fogSync;
      if (!cell || !fog) return;
      fog.beginStroke();
      const r = this.brushCells();
      fog.edit((mask) => stampCircle(mask, cell.x, cell.y, r, value));
      this.gesture = { kind: 'fog-brush', last: cell, value };
      this.previewBrush(world, value);
      return;
    }
    if (state.fogShape === 'rect') {
      this.gesture = { kind: 'fog-rect', x1: world.x, y1: world.y, x2: world.x, y2: world.y, value };
      return;
    }
    this.addFogPoint(world, value);
  }

  private moveFogBrush(gesture: Extract<Gesture, { kind: 'fog-brush' }>, world: Point) {
    const cell = this.engine.fogCell(world.x, world.y);
    if (!cell) return;
    const r = this.brushCells();
    const { last, value } = gesture;
    store().fogSync?.edit((mask) => stampSegment(mask, last.x, last.y, cell.x, cell.y, r, value));
    gesture.last = cell;
    this.previewBrush(world, value);
  }

  private previewBrush(world: Point, value: 0 | 1) {
    this.engine.setFogPreview({
      kind: 'circle',
      x: world.x,
      y: world.y,
      r: store().fogBrush / 2 / this.engine.camera.zoom,
      reveal: value === 1,
    });
  }

  private finishFogRect(gesture: Extract<Gesture, { kind: 'fog-rect' }>) {
    this.engine.setFogPreview(null);
    const a = this.engine.fogCell(gesture.x1, gesture.y1);
    const b = this.engine.fogCell(gesture.x2, gesture.y2);
    const fog = store().fogSync;
    if (!a || !b || !fog) return;
    fog.beginStroke();
    fog.edit((mask) => fillRect(mask, a.x, a.y, b.x, b.y, gesture.value));
    fog.endStroke();
  }

  private addFogPoint(world: Point, value: 0 | 1) {
    const poly = this.fogPoly ?? { points: [], value };
    this.fogPoly = poly;
    const zoom = this.engine.camera.zoom;
    const screenDistance = (point: Point) => Math.hypot(point.x - world.x, point.y - world.y) * zoom;
    const first = poly.points[0];
    const last = poly.points[poly.points.length - 1];
    if (first && poly.points.length >= 3 && screenDistance(first) <= POLY_CLOSE_PX * this.engine.handleScale) {
      this.closeFogPoly();
      return;
    }
    // O duplo clique passa duas vezes aqui no mesmo lugar.
    if (last && screenDistance(last) <= POLY_DUPLICATE_PX) return;
    poly.points.push(world);
    this.previewPoly(world);
  }

  private previewPoly(cursor: Point | null) {
    const poly = this.fogPoly;
    if (!poly) return;
    this.engine.setFogPreview({ kind: 'poly', points: poly.points, cursor, reveal: poly.value === 1 });
  }

  /** Duplo clique, Enter ou clique no primeiro ponto. Menos de 3 pontos não faz nada. */
  private closeFogPoly() {
    const poly = this.fogPoly;
    this.fogPoly = null;
    this.engine.setFogPreview(null);
    const fog = store().fogSync;
    if (!poly || poly.points.length < 3 || !fog || !this.canFog()) return;
    const cells = poly.points
      .map((point) => this.engine.fogCell(point.x, point.y))
      .filter((cell): cell is Point => cell !== null);
    fog.beginStroke();
    fog.edit((mask) => fillPolygon(mask, cells, poly.value));
    fog.endStroke();
  }

  private cancelFog() {
    if (this.gesture.kind === 'fog-brush' || this.gesture.kind === 'fog-rect') this.abortGesture();
    this.fogPoly = null;
    this.engine.setFogPreview(null);
  }

  /** Mouse parado com a névoa: o círculo do pincel ou a próxima aresta do polígono. */
  private fogHover(at: Point) {
    const world = this.engine.toWorld(at.x, at.y);
    const state = store();
    if (!this.canFog()) {
      this.engine.setFogPreview(null);
      return;
    }
    if (state.fogShape === 'brush') this.previewBrush(world, this.fogValue(false));
    else if (state.fogShape === 'poly' && this.fogPoly) this.previewPoly(world);
  }

  /** `[` e `]` mudam o pincel; Enter fecha o polígono, Backspace tira o último ponto, Esc cancela. */
  private onFogKey(event: KeyboardEvent): boolean {
    const state = store();
    if (state.tool !== 'fog' || event.ctrlKey || event.metaKey) return false;
    if (event.key === '[' || event.key === ']') {
      event.preventDefault();
      const next = event.key === ']' ? state.fogBrush * FOG_BRUSH_STEP : state.fogBrush / FOG_BRUSH_STEP;
      useVttStore.setState({
        fogBrush: Math.round(Math.min(FOG_BRUSH_MAX, Math.max(FOG_BRUSH_MIN, next))),
      });
      if (this.hoverAt) this.fogHover(this.hoverAt);
      return true;
    }
    if (!this.fogPoly) return false;
    if (event.key === 'Enter') {
      event.preventDefault();
      this.closeFogPoly();
      return true;
    }
    if (event.key === 'Backspace') {
      event.preventDefault();
      this.fogPoly.points.pop();
      if (this.fogPoly.points.length === 0) this.cancelFog();
      else this.previewPoly(this.hoverAt ? this.engine.toWorld(this.hoverAt.x, this.hoverAt.y) : null);
      return true;
    }
    if (event.key === 'Escape') {
      // Só o polígono: a seleção e o resto ficam para o próximo Esc.
      this.cancelFog();
      return true;
    }
    return false;
  }

  /** Foco no mapa (ou em lugar nenhum): fora disso a tecla é da página. */
  private focusOnMap(event: KeyboardEvent): boolean {
    return event.target === this.canvas || event.target === document.body;
  }

  /** Ctrl+A: tudo o que a pessoa pode mexer na página (o mapa nunca é objeto). */
  private onSelectAllKey(event: KeyboardEvent): boolean {
    if ((!event.ctrlKey && !event.metaKey) || event.key.toLowerCase() !== 'a') return false;
    if (!this.canEdit() || !this.focusOnMap(event)) return false;
    event.preventDefault();
    // O que está escondido na névoa não entra.
    this.select(this.engine.selectableIds());
    if (store().tool !== 'select') useVttStore.setState({ tool: 'select' });
    return true;
  }

  /** Ctrl+C e Ctrl+V. Texto marcado (uma mensagem do chat) continua sendo do navegador. */
  private onClipboardKey(event: KeyboardEvent): boolean {
    if (!event.ctrlKey && !event.metaKey) return false;
    const key = event.key.toLowerCase();
    if (key !== 'c' && key !== 'v') return false;
    const { sync, selectedIds } = store();
    if (!sync || !this.canEdit() || this.gesture.kind !== 'none') return false;
    if (key === 'c') {
      if (selectedIds.length === 0 || window.getSelection()?.toString()) return false;
      sync.copyObjects(selectedIds);
      return true;
    }
    if (!sync.hasCopy) return false;
    event.preventDefault();
    // Segurar a tecla não vira uma pilha de cópias.
    if (event.repeat) return true;
    const world = this.cursor && this.engine.toWorld(this.cursor.x, this.cursor.y);
    void sync.pasteCopy(world && this.engine.isInsideMap(world.x, world.y) ? world : null);
    return true;
  }

  /** Ctrl+Z desfaz; Ctrl+Shift+Z e Ctrl+Y refazem. Campo de texto nem chega aqui. */
  private onHistoryKey(event: KeyboardEvent): boolean {
    if (!event.ctrlKey && !event.metaKey) return false;
    const key = event.key.toLowerCase();
    if (key !== 'z' && key !== 'y') return false;
    event.preventDefault();
    const { sync } = store();
    // Com um gesto em andamento, o objeto ainda nem foi gravado.
    if (!sync || !this.canEdit() || this.gesture.kind !== 'none') return true;
    if (key === 'z' && !event.shiftKey) void sync.undo();
    else void sync.redo();
    return true;
  }
}
