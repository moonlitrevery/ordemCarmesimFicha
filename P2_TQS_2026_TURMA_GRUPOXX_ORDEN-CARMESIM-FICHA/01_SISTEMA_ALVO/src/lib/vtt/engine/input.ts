import { distanceToStroke, simplifyToLimit } from '../geometry';
import {
  canEditObjects,
  effectiveParent,
  patchFromWorld,
  worldTransform,
} from '../scene-rules';
import { personColor, useVttStore } from '../store';
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

type Gesture =
  | { kind: 'none' }
  | { kind: 'pan'; lastX: number; lastY: number }
  | { kind: 'pinch'; cx: number; cy: number; distance: number }
  | {
      kind: 'drag';
      id: string;
      offsetX: number;
      offsetY: number;
      moved: boolean;
      before: SceneObject;
    }
  | {
      kind: 'scale';
      id: string;
      startDistance: number;
      startScale: number;
      before: SceneObject;
    }
  | { kind: 'rotate'; id: string; before: SceneObject }
  | { kind: 'stroke'; points: number[]; width: number }
  | { kind: 'erase' }
  | { kind: 'ruler'; x1: number; y1: number; x2: number; y2: number };

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
      engine.revealCaption(null);
      this.showConditionTip(null, { x: 0, y: 0 });
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
          this.updateCursor();
        }
      })
    );
  }

  destroy() {
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

    if (event.altKey) {
      store().sync?.ping(world.x, world.y);
      return;
    }

    if (event.pointerType === 'touch') this.armTouchTimers(at, world);

    const state = store();

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
        this.startSelect(at, world);
    }
  }

  private startSelect(at: Point, world: Point) {
    if (!this.canEdit()) return;
    const { selectedId, objects, sync } = store();

    const handle = this.engine.handleAt(at.x, at.y);
    if (handle && selectedId && objects[selectedId]) {
      this.startHandle(handle, selectedId, world);
      return;
    }

    const hit = this.engine.objectAt(world.x, world.y);
    if (!hit) {
      if (selectedId) useVttStore.setState({ selectedId: null });
      return;
    }
    if (hit.id !== selectedId) useVttStore.setState({ selectedId: hit.id });
    const current = worldTransform(hit, objects);
    this.gesture = {
      kind: 'drag',
      id: hit.id,
      offsetX: current.x - world.x,
      offsetY: current.y - world.y,
      moved: false,
      before: objects[hit.id],
    };
    if (sync) sync.interactingId = hit.id;
  }

  private startHandle(handle: HandleId, id: string, world: Point) {
    const { objects, sync } = store();
    if (sync) sync.interactingId = id;
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
      this.abortGesture();
      this.openMenuAt(at);
    }, LONG_PRESS_MS);
  }

  private onMove(event: PointerEvent) {
    const known = this.pointers.has(event.pointerId);
    const at = this.screen(event);
    if (event.pointerType !== 'touch') this.cursor = at;

    if (!known) {
      this.hover(at, event);
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

  private hover(at: Point, event: PointerEvent) {
    if (event.pointerType === 'touch') return;
    this.showConditionTip(this.engine.conditionAt(at.x, at.y), at);
    // Só a mestra: passar o mouse revela a legenda ofuscada.
    if (store().me?.role !== 'mestre') return;
    const world = this.engine.toWorld(at.x, at.y);
    this.engine.revealCaption(this.engine.objectAt(world.x, world.y)?.id ?? null);
  }

  private moveDrag(gesture: Extract<Gesture, { kind: 'drag' }>, world: Point) {
    const { objects, sync } = store();
    const object = objects[gesture.id];
    if (!object || !sync) return;
    const current = worldTransform(object, objects);
    const patch = patchFromWorld(object, objects, {
      ...current,
      x: world.x + gesture.offsetX,
      y: world.y + gesture.offsetY,
    });
    sync.setLocal(gesture.id, patch);
    const own = patch.local ?? { x: patch.x as number, y: patch.y as number };
    sync.emitDrag(gesture.id, own.x, own.y);
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

    if (event.pointerType === 'touch' && at) this.registerTap(at);

    const { gesture } = this;
    this.gesture = { kind: 'none' };
    const { sync, me, calibrating } = store();

    switch (gesture.kind) {
      case 'pan':
        this.updateCursor();
        return;
      case 'drag':
        if (gesture.moved) {
          this.commit(gesture.id, gesture.before);
        } else if (sync) {
          sync.interactingId = null;
        }
        return;
      case 'scale':
      case 'rotate':
        this.commit(gesture.id, gesture.before);
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

  private commit(id: string, before: SceneObject) {
    const { objects, sync } = store();
    const object = objects[id];
    if (!object || !sync) return;
    // O `interactingId` só sai quando o banco responder: evento de fora não desfaz.
    void sync.changeObject(
      id,
      effectiveParent(object, objects) && object.local
        ? { local: object.local }
        : {
            x: object.x,
            y: object.y,
            rotation: object.rotation,
            scale: object.scale,
            flip_x: object.flip_x,
            flip_y: object.flip_y,
          },
      before
    );
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
      gesture.kind === 'rotate'
    ) {
      if (sync) {
        sync.interactingId = null;
        // Toque longo cai aqui sem ter mexido em nada: não precisa reler.
        if (gesture.kind !== 'drag' || gesture.moved) void sync.reload();
      }
    }
    if (gesture.kind === 'stroke') this.engine.drawLiveStroke([], '#000000', 1);
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
    useVttStore.setState({
      selectedId: hit.id,
      contextMenu: { id: hit.id, x: at.x + rect.left, y: at.y + rect.top },
    });
  }

  private onKeyDown(event: KeyboardEvent) {
    if (isTyping(event.target)) return;
    if (event.code === 'Space') {
      this.spaceDown = true;
      this.updateCursor();
      event.preventDefault();
      return;
    }
    const { selectedId, sync } = store();
    if (this.onHistoryKey(event)) return;
    if (this.onClipboardKey(event)) return;
    if (event.key === 'Escape') {
      useVttStore.setState({
        selectedId: null,
        contextMenu: null,
        attachingId: null,
        armedAsset: null,
        calibrating: false,
        calibrationPixels: null,
      });
      this.abortGesture();
      return;
    }
    if (!selectedId || !sync || !this.canEdit()) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      void sync.deleteObject(selectedId);
    } else if (event.key === 'q' || event.key === 'Q') {
      sync.rotateBy(selectedId, -QUARTER_TURN);
    } else if (event.key === 'e' || event.key === 'E') {
      sync.rotateBy(selectedId, QUARTER_TURN);
    }
  }

  /** Ctrl+C e Ctrl+V. Texto marcado (uma mensagem do chat) continua sendo do navegador. */
  private onClipboardKey(event: KeyboardEvent): boolean {
    if (!event.ctrlKey && !event.metaKey) return false;
    const key = event.key.toLowerCase();
    if (key !== 'c' && key !== 'v') return false;
    const { sync, selectedId } = store();
    if (!sync || !this.canEdit() || this.gesture.kind !== 'none') return false;
    if (key === 'c') {
      if (!selectedId || window.getSelection()?.toString()) return false;
      sync.copyObject(selectedId);
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
