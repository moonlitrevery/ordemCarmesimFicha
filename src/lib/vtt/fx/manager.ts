import { Container, Matrix, Sprite, type Renderer } from 'pixi.js';
import type { SceneObject } from '../types';
import { FxAtlas } from './atlas';
import { Emitter, ParticleSystem } from './particles';
import { FULL_TURN, type FxColor, type SpriteDef } from './presets';
import {
  isAnimatedPreset,
  isOnScreen,
  parseWeather,
  presetReach,
  resolveEffects,
  type ResolvedEffect,
} from './rules';
import { WeatherLayer } from './weather';

// Abaixo e acima de qualquer anexo; o selo de oculto (1_000_000) continua por cima.
const BEHIND_Z = -1_000_000;
const FRONT_Z = 900_000;
const MAX_DT = 0.1;
const DEFAULT_TINT = 0xffffff;

/** O que o gerenciador precisa de um objeto do canvas. */
export interface FxOwner {
  container: Container;
  width: number;
  height: number;
  /** Posição guardada, sem o tremor. */
  baseX: number;
  baseY: number;
  shakeX: number;
  shakeY: number;
}

export interface FxHost {
  renderer: Renderer;
  /** Pede quadros enquanto a função estiver registrada; devolve como parar. */
  addAnimation: (animate: (now: number) => void) => () => void;
  invalidate: () => void;
  viewWidth: () => number;
  viewHeight: () => number;
  lightMode: () => boolean;
}

interface LiveSprite {
  sprite: Sprite;
  def: SpriteDef;
  side: 1 | -1;
}

interface Instance {
  key: string;
  effect: ResolvedEffect;
  sprites: LiveSprite[];
  emitters: Emitter[];
  reach: number;
}

interface Attachment {
  raw: unknown;
  behind: Container;
  front: Container;
  instances: Instance[];
}

function hexToNumber(color: string): number {
  return Number.parseInt(color.slice(1), 16);
}

function ownerUnit(owner: FxOwner): number {
  return Math.max(owner.width, owner.height) / 2;
}

/**
 * Efeitos ligados nos objetos e clima da cena. Lê `object.effects` e `scene.weather`
 * e só pede quadro enquanto há algo animado na tela (SPEC §7.2).
 */
export class FxManager {
  private atlas: FxAtlas;
  private system: ParticleSystem;
  private weather: WeatherLayer;
  private attachments = new Map<string, Attachment>();
  private owners = new Map<string, FxOwner>();
  private weatherKey = '[]';
  private stopAnimation: (() => void) | null = null;
  private lastTick = 0;
  private clock = 0;
  private matrix = new Matrix();
  private onContextRestored = () => {
    // Depois do Pixi refazer o contexto, que escuta o mesmo evento.
    setTimeout(() => {
      this.atlas.redraw();
      this.host.invalidate();
    });
  };

  constructor(private host: FxHost, stage: Container) {
    this.atlas = new FxAtlas(host.renderer);
    this.system = new ParticleSystem(this.atlas);
    this.weather = new WeatherLayer(this.system);
    stage.addChild(this.weather.container);
    host.renderer.canvas.addEventListener?.('webglcontextrestored', this.onContextRestored);
  }

  /** Para quem mede: partículas vivas agora. */
  get liveParticles(): number {
    return this.system.live;
  }

  /** Há rAF rodando por causa dos efeitos? */
  get running(): boolean {
    return this.stopAnimation !== null;
  }

  // ---------- Objetos ----------

  syncObjects(objects: Record<string, SceneObject>, owners: Map<string, FxOwner>) {
    this.owners = owners;
    this.attachments.forEach((attachment, id) => {
      if (!objects[id] || !owners.has(id)) this.detach(id, attachment);
    });
    for (const object of Object.values(objects)) {
      const owner = owners.get(object.id);
      if (owner) this.syncObject(object, owner);
    }
    this.wake();
  }

  private syncObject(object: SceneObject, owner: FxOwner) {
    const current = this.attachments.get(object.id);
    // Arrastar troca a linha, não a lista: a conta só roda se a lista mudou.
    if (current?.raw === object.effects) return;
    const wanted = resolveEffects(object.effects, object.kind);
    if (!current && wanted.length === 0) return;

    const attachment = current ?? this.attach(object.id, owner);
    attachment.raw = object.effects;

    const wantedKeys = new Set(wanted.map((effect) => effect.key));
    attachment.instances = attachment.instances.filter((instance) => {
      if (wantedKeys.has(instance.key)) return true;
      this.destroyInstance(instance, owner);
      return false;
    });
    for (const effect of wanted) {
      if (!attachment.instances.some((instance) => instance.key === effect.key)) {
        attachment.instances.push(this.createInstance(effect, attachment));
      }
    }
    if (attachment.instances.length === 0) {
      this.detach(object.id, attachment);
      return;
    }
    this.layoutSprites(attachment, owner);
  }

  private attach(id: string, owner: FxOwner): Attachment {
    const behind = new Container();
    behind.zIndex = BEHIND_Z;
    const front = new Container();
    front.zIndex = FRONT_Z;
    owner.container.addChild(behind, front);
    const attachment: Attachment = { raw: null, behind, front, instances: [] };
    this.attachments.set(id, attachment);
    return attachment;
  }

  /** Antes de o canvas soltar os filhos do dono ou destruir o container dele. */
  detachObject(id: string) {
    const attachment = this.attachments.get(id);
    if (attachment) this.detach(id, attachment);
  }

  private detach(id: string, attachment: Attachment) {
    const owner = this.owners.get(id);
    attachment.instances.forEach((instance) => this.destroyInstance(instance, owner));
    attachment.behind.destroy({ children: true });
    attachment.front.destroy({ children: true });
    this.attachments.delete(id);
  }

  private tintOf(color: FxColor, effect: ResolvedEffect): number {
    if (color !== 'custom') return color;
    return effect.color ? hexToNumber(effect.color) : DEFAULT_TINT;
  }

  private createInstance(effect: ResolvedEffect, attachment: Attachment): Instance {
    const instance: Instance = {
      key: effect.key,
      effect,
      sprites: [],
      emitters: [],
      reach: presetReach(effect.preset),
    };
    for (const def of effect.preset.sprites ?? []) {
      const sides: (1 | -1)[] = def.mirrored ? [1, -1] : [1];
      for (const side of sides) {
        const sprite = new Sprite(this.atlas.frame(def.texture));
        sprite.anchor.set(def.anchor?.[0] ?? 0.5, def.anchor?.[1] ?? 0.5);
        sprite.tint = this.tintOf(def.color, effect);
        sprite.alpha = def.alpha;
        sprite.blendMode = def.blend === 'add' ? 'add' : 'normal';
        (def.layer === 'behind' ? attachment.behind : attachment.front).addChild(sprite);
        instance.sprites.push({ sprite, def, side });
      }
    }
    for (const def of effect.preset.emitters ?? []) {
      const emitter = new Emitter(this.system, def, this.tintOf(def.color, effect));
      (def.layer === 'behind' ? attachment.behind : attachment.front).addChild(emitter.container);
      instance.emitters.push(emitter);
    }
    return instance;
  }

  private destroyInstance(instance: Instance, owner: FxOwner | undefined) {
    instance.sprites.forEach(({ sprite }) => sprite.destroy());
    instance.emitters.forEach((emitter) => emitter.destroy());
    instance.sprites = [];
    instance.emitters = [];
    if (instance.effect.preset.shake && owner) {
      owner.shakeX = 0;
      owner.shakeY = 0;
      owner.container.position.set(owner.baseX, owner.baseY);
    }
  }

  /** A imagem do dono pode carregar depois de o efeito ligar. */
  layoutObject(id: string) {
    const attachment = this.attachments.get(id);
    const owner = this.owners.get(id);
    if (attachment && owner) this.layoutSprites(attachment, owner);
  }

  private layoutSprites(attachment: Attachment, owner: FxOwner) {
    const unit = ownerUnit(owner);
    const lightMode = this.host.lightMode();
    for (const instance of attachment.instances) {
      for (const { sprite, def, side } of instance.sprites) {
        const pulse = def.pulse && lightMode ? (def.pulse.min + def.pulse.max) / 2 : 1;
        this.scaleSprite(sprite, def, side, unit, pulse);
        sprite.position.set((def.offset?.[0] ?? 0) * unit * side, (def.offset?.[1] ?? 0) * unit);
      }
    }
  }

  private scaleSprite(sprite: Sprite, def: SpriteDef, side: 1 | -1, unit: number, factor: number) {
    const scale = ((def.size * unit) / sprite.texture.width) * factor;
    sprite.scale.set(scale * side, scale);
  }

  // ---------- Clima ----------

  syncWeather(raw: unknown) {
    const entries = parseWeather(raw);
    const key = JSON.stringify(entries);
    if (key === this.weatherKey) return;
    this.weatherKey = key;
    this.weather.set(entries, this.host.viewWidth(), this.host.viewHeight(), this.host.lightMode());
    this.wake();
  }

  resize() {
    this.weather.resize(this.host.viewWidth(), this.host.viewHeight());
  }

  applyLightMode() {
    this.weather.applyLightMode(this.host.lightMode());
    this.attachments.forEach((attachment, id) => {
      const owner = this.owners.get(id);
      if (owner) this.layoutSprites(attachment, owner);
    });
    this.wake();
  }

  // ---------- Quadros ----------

  /** Câmera ou objeto mudou: algo que estava fora da tela pode ter voltado. */
  wake() {
    if (this.stopAnimation || !this.hasWork()) return;
    this.lastTick = 0;
    this.stopAnimation = this.host.addAnimation((now) => this.tick(now));
  }

  private isVisible(owner: FxOwner, instance: Instance): boolean {
    owner.container.getGlobalTransform(this.matrix, false);
    const { a, b, tx, ty } = this.matrix;
    return isOnScreen(
      tx,
      ty,
      instance.reach * ownerUnit(owner) * Math.hypot(a, b),
      this.host.viewWidth(),
      this.host.viewHeight()
    );
  }

  private hasWork(): boolean {
    if (this.weather.active) return true;
    const lightMode = this.host.lightMode();
    for (const [id, attachment] of Array.from(this.attachments.entries())) {
      const owner = this.owners.get(id);
      if (!owner) continue;
      for (const instance of attachment.instances) {
        if (instance.emitters.some((emitter) => emitter.liveCount > 0)) return true;
        if (
          isAnimatedPreset(instance.effect.preset, lightMode) &&
          this.isVisible(owner, instance)
        ) {
          return true;
        }
      }
    }
    return false;
  }

  private tick(now: number) {
    const dt = this.lastTick ? Math.min(MAX_DT, (now - this.lastTick) / 1000) : 0;
    this.lastTick = now;
    this.clock += dt;
    const lightMode = this.host.lightMode();
    const width = this.host.viewWidth();
    const height = this.host.viewHeight();

    this.attachments.forEach((attachment, id) => {
      const owner = this.owners.get(id);
      if (owner) this.tickAttachment(attachment, owner, dt, lightMode, width, height);
    });
    this.weather.update(dt, width, height, lightMode);

    if (!this.hasWork()) {
      this.stopAnimation?.();
      this.stopAnimation = null;
    }
  }

  private tickAttachment(
    attachment: Attachment,
    owner: FxOwner,
    dt: number,
    lightMode: boolean,
    width: number,
    height: number
  ) {
    const unit = ownerUnit(owner);
    for (const instance of attachment.instances) {
      const visible = this.isVisible(owner, instance);
      if (visible) this.animateSprites(instance, unit, lightMode);
      for (const emitter of instance.emitters) {
        emitter.update(dt, { emitting: visible, unit, lightMode, density: 1, width, height });
      }
      const { shake } = instance.effect.preset;
      if (shake && visible) {
        const amount = shake.amplitude * unit * Math.abs(owner.container.scale.x);
        const phase = this.clock * shake.hz * FULL_TURN;
        // Duas frequências sem múltiplo comum: treme, não anda em círculo.
        owner.shakeX = Math.sin(phase) * amount;
        owner.shakeY = Math.sin(phase * 1.37 + 1) * amount;
        owner.container.position.set(owner.baseX + owner.shakeX, owner.baseY + owner.shakeY);
      }
    }
  }

  private animateSprites(instance: Instance, unit: number, lightMode: boolean) {
    for (const { sprite, def, side } of instance.sprites) {
      if (def.flap) {
        const wave = 0.5 + 0.5 * Math.sin(this.clock * def.flap.hz * FULL_TURN);
        sprite.rotation = (def.flap.from + (def.flap.to - def.flap.from) * wave) * side;
      }
      if (def.pulse && !lightMode) {
        const wave = 0.5 + 0.5 * Math.sin(this.clock * def.pulse.hz * FULL_TURN);
        const factor = def.pulse.min + (def.pulse.max - def.pulse.min) * wave;
        this.scaleSprite(sprite, def, side, unit, factor);
      }
    }
  }

  destroy() {
    this.stopAnimation?.();
    this.stopAnimation = null;
    this.host.renderer.canvas.removeEventListener?.('webglcontextrestored', this.onContextRestored);
    this.attachments.forEach((attachment, id) => this.detach(id, attachment));
    this.weather.destroy();
    this.atlas.destroy();
  }
}
