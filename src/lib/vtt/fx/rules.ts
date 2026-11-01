import type { ObjectKind } from '../types';
import {
  TOKEN_EFFECTS,
  type EmitterDef,
  type FxCurve,
  type FxPreset,
  type FxRange,
} from './presets';
import { SPELLS } from './spells';

export const PARTICLE_CAP = 1200;
export const PARTICLE_CAP_LIGHT = 300;
/** Modo leve corta ~70% das partículas (SPEC §7.4). */
export const LIGHT_FACTOR = 0.3;

const MAX_EFFECTS_PER_OBJECT = 12;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export type EffectType = 'spell' | 'effect';

export interface EffectEntry {
  type: EffectType;
  id: string;
  /** Só nos efeitos com cor escolhível. */
  color?: string;
}

export function effectKey(entry: Pick<EffectEntry, 'type' | 'id'>): string {
  return `${entry.type}:${entry.id}`;
}

/** Qualquer jogador grava a coluna: o que não existe é ignorado ao ler. */
export function parseEffects(raw: unknown): EffectEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const entries: EffectEntry[] = [];
  for (const item of raw) {
    const entry = item as Partial<EffectEntry> | null;
    if (!entry || typeof entry.id !== 'string') continue;
    if (entry.type !== 'spell' && entry.type !== 'effect') continue;
    const key = effectKey({ type: entry.type, id: entry.id });
    if (seen.has(key) || entries.length >= MAX_EFFECTS_PER_OBJECT) continue;
    seen.add(key);
    entries.push({
      type: entry.type,
      id: entry.id,
      ...(typeof entry.color === 'string' && HEX_COLOR.test(entry.color)
        ? { color: entry.color }
        : {}),
    });
  }
  return entries;
}

export function toggleEffect(raw: unknown, entry: EffectEntry): EffectEntry[] {
  const list = parseEffects(raw);
  const key = effectKey(entry);
  return list.some((other) => effectKey(other) === key)
    ? list.filter((other) => effectKey(other) !== key)
    : [...list, entry];
}

export function setEffectColor(
  raw: unknown,
  type: EffectType,
  id: string,
  color: string
): EffectEntry[] {
  const key = effectKey({ type, id });
  return parseEffects(raw).map((entry) =>
    effectKey(entry) === key ? { ...entry, color } : entry
  );
}

/** Efeitos de token servem também em addon; adereço fica sem os dois menus. */
export function supportsEffects(kind: ObjectKind): kind is 'token' | 'addon' {
  return kind === 'token' || kind === 'addon';
}

export interface ResolvedEffect {
  key: string;
  preset: FxPreset;
  color: string | null;
}

/** O que desenhar: magia só no alvo certo, mesmo que a coluna diga outra coisa. */
export function resolveEffects(raw: unknown, kind: ObjectKind): ResolvedEffect[] {
  if (!supportsEffects(kind)) return [];
  const resolved: ResolvedEffect[] = [];
  for (const entry of parseEffects(raw)) {
    const preset =
      entry.type === 'spell'
        ? SPELLS.find((spell) => spell.id === entry.id && spell.appliesTo === kind)?.preset
        : TOKEN_EFFECTS.find((effect) => effect.id === entry.id);
    if (!preset) continue;
    resolved.push({
      key: `${effectKey(entry)}:${entry.color ?? ''}`,
      preset,
      color: entry.color ?? preset.defaultColor ?? null,
    });
  }
  return resolved;
}

// ---------- Partículas ----------

export function curveAt(curve: FxCurve, t: number): number {
  const last = curve.length - 1;
  if (last <= 0) return curve[0] ?? 1;
  if (t <= 0) return curve[0];
  if (t >= 1) return curve[last];
  const position = t * last;
  const index = Math.floor(position);
  return curve[index] + (curve[index + 1] - curve[index]) * (position - index);
}

export function randomIn(range: FxRange, random: () => number = Math.random): number {
  return range[0] + (range[1] - range[0]) * random();
}

/** Até onde a partícula chega do centro, nas unidades do preset. */
export function emitterReach(emitter: EmitterDef): number {
  const travel = emitter.speed[1] * emitter.life[1];
  const size = emitter.size[1] * Math.max(...emitter.scale);
  return emitter.radius[1] + travel + size / 2;
}

/** Margem da conferência "está na tela": o que dá para ver além do centro do dono. */
export function presetReach(preset: FxPreset): number {
  return Math.max(
    1,
    ...(preset.emitters ?? []).map(emitterReach),
    ...(preset.sprites ?? []).map((sprite) => {
      const offset = Math.hypot(sprite.offset?.[0] ?? 0, sprite.offset?.[1] ?? 0);
      return offset + sprite.size * (sprite.pulse?.max ?? 1);
    })
  );
}

/** Pede rAF contínuo? Brilho parado é só um sprite: não anima nada. */
export function isAnimatedPreset(preset: FxPreset, lightMode: boolean): boolean {
  if (preset.shake) return true;
  if ((preset.emitters ?? []).length > 0) return true;
  return (preset.sprites ?? []).some(
    (sprite) => Boolean(sprite.flap) || (Boolean(sprite.pulse) && !lightMode)
  );
}

export function isOnScreen(
  x: number,
  y: number,
  reach: number,
  width: number,
  height: number
): boolean {
  return x + reach >= 0 && y + reach >= 0 && x - reach <= width && y - reach <= height;
}

export function particleCap(lightMode: boolean): number {
  return lightMode ? PARTICLE_CAP_LIGHT : PARTICLE_CAP;
}

// ---------- Clima ----------

export const WEATHER_TYPES = ['chuva', 'neve', 'nevoa', 'fuligem'] as const;

export type WeatherType = (typeof WEATHER_TYPES)[number];

export const WEATHER_LABELS: Record<WeatherType, string> = {
  chuva: 'Chuva',
  neve: 'Neve',
  nevoa: 'Névoa',
  fuligem: 'Fuligem',
};

export const DEFAULT_WEATHER_INTENSITY = 50;

export interface WeatherEntry {
  type: WeatherType;
  on: boolean;
  /** 0 a 100. Fica guardada com o efeito desligado. */
  intensity: number;
}

function clampIntensity(value: unknown): number {
  const number =
    typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_WEATHER_INTENSITY;
  return Math.max(0, Math.min(100, Math.round(number)));
}

export function parseWeather(raw: unknown): WeatherEntry[] {
  if (!Array.isArray(raw)) return [];
  return WEATHER_TYPES.flatMap((type) => {
    const entry = raw.find((item) => (item as WeatherEntry | null)?.type === type) as
      | WeatherEntry
      | undefined;
    return entry
      ? [{ type, on: entry.on === true, intensity: clampIntensity(entry.intensity) }]
      : [];
  });
}

export function patchWeather(
  raw: unknown,
  type: WeatherType,
  patch: Partial<Pick<WeatherEntry, 'on' | 'intensity'>>
): WeatherEntry[] {
  const current = parseWeather(raw);
  const existing = current.find((entry) => entry.type === type) ?? {
    type,
    on: false,
    intensity: DEFAULT_WEATHER_INTENSITY,
  };
  return parseWeather([
    ...current.filter((entry) => entry.type !== type),
    { ...existing, ...patch },
  ]);
}

// ---------- Iluminação ----------

export const LIGHTING_PRESETS = ['noite', 'escuridao', 'crepusculo', 'penumbra', 'custom'] as const;

export type LightingPreset = (typeof LIGHTING_PRESETS)[number];

export const LIGHTING_LABELS: Record<LightingPreset, string> = {
  noite: 'Noite',
  escuridao: 'Escuridão',
  crepusculo: 'Crepúsculo',
  penumbra: 'Penumbra',
  custom: 'Cor personalizada',
};

export const DEFAULT_LIGHTING_INTENSITY = 60;
export const DEFAULT_LIGHTING_COLOR = '#3a2a5e';

export interface LightingState {
  on: boolean;
  preset: LightingPreset;
  /** Só em `custom`. */
  color: string;
  /** 0 a 100. Fica guardada com a iluminação desligada. */
  intensity: number;
}

export const LIGHTING_OFF: LightingState = {
  on: false,
  preset: 'noite',
  color: DEFAULT_LIGHTING_COLOR,
  intensity: DEFAULT_LIGHTING_INTENSITY,
};

/** Só o Crepúsculo tem duas cores: de cima para baixo da tela. */
const LIGHTING_COLORS: Record<Exclude<LightingPreset, 'custom'>, [string, string]> = {
  noite: ['#1c2c66', '#1c2c66'],
  escuridao: ['#000000', '#000000'],
  crepusculo: ['#47307f', '#d97a3a'],
  penumbra: ['#55555c', '#55555c'],
};

export function parseLighting(raw: unknown): LightingState {
  const value = raw as Partial<LightingState> | null;
  if (!value || typeof value !== 'object' || !LIGHTING_PRESETS.includes(value.preset as LightingPreset)) {
    return LIGHTING_OFF;
  }
  return {
    on: value.on === true,
    preset: value.preset as LightingPreset,
    color:
      typeof value.color === 'string' && HEX_COLOR.test(value.color)
        ? value.color
        : DEFAULT_LIGHTING_COLOR,
    intensity:
      typeof value.intensity === 'number' && Number.isFinite(value.intensity)
        ? Math.max(0, Math.min(100, Math.round(value.intensity)))
        : DEFAULT_LIGHTING_INTENSITY,
  };
}

export function lightingColors(state: LightingState): [string, string] {
  return state.preset === 'custom' ? [state.color, state.color] : LIGHTING_COLORS[state.preset];
}

/** Sobe ou desce até o alvo sem passar dele: fade do clima e mudança de intensidade. */
export function approach(current: number, target: number, step: number): number {
  return current < target
    ? Math.min(target, current + step)
    : Math.max(target, current - step);
}

// ---------- Queda de FPS (SPEC §7.4) ----------

const FPS_WINDOW_MS = 5000;
const FPS_GAP_MS = 500;
const LOW_FPS = 40;

/** `true` quando a média de uma janela inteira de 5 s fica abaixo de 40 fps. */
export class FpsMonitor {
  private start = 0;
  private last = 0;
  private frames = 0;

  feed(now: number): boolean {
    // Aba escondida ou efeito que parou e voltou não é lentidão.
    if (!this.start || now - this.last > FPS_GAP_MS) {
      this.start = now;
      this.last = now;
      this.frames = 0;
      return false;
    }
    this.last = now;
    this.frames++;
    const elapsed = now - this.start;
    if (elapsed < FPS_WINDOW_MS) return false;
    const fps = (this.frames * 1000) / elapsed;
    this.start = now;
    this.frames = 0;
    return fps < LOW_FPS;
  }
}
