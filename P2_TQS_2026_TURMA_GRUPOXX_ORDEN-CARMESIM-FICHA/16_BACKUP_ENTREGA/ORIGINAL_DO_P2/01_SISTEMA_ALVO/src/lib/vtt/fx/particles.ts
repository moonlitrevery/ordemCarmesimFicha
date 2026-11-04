import { Particle, ParticleContainer } from 'pixi.js';
import type { FxAtlas } from './atlas';
import { FULL_TURN, type EmitterDef, type FxTextureName } from './presets';
import { curveAt, LIGHT_FACTOR, particleCap, randomIn } from './rules';

class FxParticle extends Particle {
  vx = 0;
  vy = 0;
  baseX = 0;
  age = 0;
  life = 1;
  /** Escala da textura para dar o tamanho sorteado, antes da curva. */
  sizeScale = 1;
  spinRate = 0;
  phase = 0;
}

export interface EmitContext {
  /** Fora da câmera não nasce nada; o que está no ar termina a vida. */
  emitting: boolean;
  /** Pixels locais de uma unidade do preset. */
  unit: number;
  lightMode: boolean;
  /** Intensidade do clima; efeitos de token usam 1. */
  density: number;
  /** Tamanho da tela, para o clima. */
  width: number;
  height: number;
}

/** Dono do pool e do teto: é uma conta só, por mais emissores que existam. */
export class ParticleSystem {
  private free: FxParticle[] = [];
  live = 0;

  constructor(readonly atlas: FxAtlas) {}

  take(texture: FxTextureName): FxParticle {
    const frame = this.atlas.frame(texture);
    const particle =
      this.free.pop() ?? new FxParticle({ texture: frame, anchorX: 0.5, anchorY: 0.5 });
    particle.texture = frame;
    this.live++;
    return particle;
  }

  give(particle: FxParticle) {
    this.free.push(particle);
    this.live--;
  }
}

/**
 * Filho do container do dono: posição, giro, escala e flip vêm da hierarquia, e a
 * partícula só conhece coordenadas locais. O clima é um emissor preso à tela.
 */
export class Emitter {
  readonly container: ParticleContainer;
  private particles: FxParticle[] = [];
  private pending = 0;
  private nextBurst: number;

  constructor(
    private system: ParticleSystem,
    private def: EmitterDef,
    private tint: number
  ) {
    this.nextBurst = def.burst ? randomIn(def.burst.every) * Math.random() : 0;
    this.container = new ParticleContainer({
      texture: system.atlas.source,
      roundPixels: false,
      blendMode: def.blend === 'add' ? 'add' : 'normal',
      dynamicProperties: {
        position: true,
        rotation: true,
        vertex: true,
        uvs: true,
        color: true,
      },
    });
    this.container.particleChildren = this.particles;
  }

  get liveCount(): number {
    return this.particles.length;
  }

  update(dt: number, context: EmitContext) {
    this.advance(dt);
    if (context.emitting) this.emit(dt, context);
  }

  private advance(dt: number) {
    const { def, particles } = this;
    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i];
      particle.age += dt;
      if (particle.age >= particle.life) {
        // Troca com o último: a ordem não importa e não há `splice` por quadro.
        particles[i] = particles[particles.length - 1];
        particles.pop();
        this.system.give(particle);
        continue;
      }
      const t = particle.age / particle.life;
      particle.baseX += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.x = def.sway
        ? particle.baseX +
          Math.sin(particle.age * def.sway.hz * FULL_TURN + particle.phase) * def.sway.amplitude
        : particle.baseX;
      if (particle.spinRate) particle.rotation += particle.spinRate * dt;
      particle.alpha = curveAt(def.alpha, t);
      const scale = particle.sizeScale * curveAt(def.scale, t);
      particle.scaleX = scale;
      particle.scaleY = scale;
    }
  }

  private emit(dt: number, context: EmitContext) {
    const { def } = this;
    const cut = context.lightMode ? LIGHT_FACTOR : 1;
    const density = context.density * cut;
    let count = 0;
    if (def.rate) {
      this.pending += def.rate * density * dt;
      count = Math.floor(this.pending);
      this.pending -= count;
    }
    if (def.burst) {
      this.nextBurst -= dt;
      if (this.nextBurst <= 0) {
        // Rajada mais espaçada no modo leve: um grupo de 1 a 3 não dá para cortar.
        this.nextBurst = randomIn(def.burst.every) / cut;
        count += Math.round(randomIn(def.burst.count));
      }
    }
    const max = Math.ceil(def.max * density);
    const cap = particleCap(context.lightMode);
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= max || this.system.live >= cap) return;
      this.spawn(context);
    }
  }

  private spawn({ unit, width, height }: EmitContext) {
    const { def } = this;
    const texture = def.textures[Math.floor(Math.random() * def.textures.length)];
    const particle = this.system.take(texture);

    const place = def.arc ? randomIn(def.arc) : Math.random() * FULL_TURN;
    const distance = randomIn(def.radius) * unit;
    const direction = def.direction ? randomIn(def.direction) : place + (def.swirl ?? 0);
    const speed = randomIn(def.speed) * unit;

    particle.baseX = def.fullscreen ? Math.random() * width : Math.cos(place) * distance;
    particle.y = def.fullscreen ? Math.random() * height : Math.sin(place) * distance;
    particle.x = particle.baseX;
    particle.vx = Math.cos(direction) * speed;
    particle.vy = Math.sin(direction) * speed;
    particle.age = 0;
    particle.life = randomIn(def.life);
    particle.phase = Math.random() * FULL_TURN;
    particle.sizeScale = (randomIn(def.size) * unit) / particle.texture.width;
    particle.spinRate = def.spin ? randomIn(def.spin) : 0;
    particle.rotation = def.align ? direction : def.spin ? Math.random() * FULL_TURN : 0;
    particle.tint = this.tint;
    particle.alpha = curveAt(def.alpha, 0);
    const scale = particle.sizeScale * curveAt(def.scale, 0);
    particle.scaleX = scale;
    particle.scaleY = scale;
    this.particles.push(particle);
  }

  destroy() {
    this.particles.forEach((particle) => this.system.give(particle));
    this.particles.length = 0;
    this.container.destroy();
  }
}
