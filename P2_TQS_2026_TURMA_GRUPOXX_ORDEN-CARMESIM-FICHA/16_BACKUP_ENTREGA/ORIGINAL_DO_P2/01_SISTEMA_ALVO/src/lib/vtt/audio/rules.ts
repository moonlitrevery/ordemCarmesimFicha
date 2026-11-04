/** Tags da biblioteca de som. Subpasta de public/vtt vira a mesma tag (`audioTagFromFolder`). */
export const AUDIO_CATEGORIES = [
  { tag: 'chuva', label: 'Chuva' },
  { tag: 'vento', label: 'Vento' },
  { tag: 'fogo', label: 'Fogo' },
  { tag: 'trovao', label: 'Trovão' },
  { tag: 'floresta-noite', label: 'Floresta/Noite' },
  { tag: 'caverna-gotejar', label: 'Caverna/Gotejar' },
  { tag: 'cidade-transito', label: 'Cidade/Trânsito' },
  { tag: 'carro', label: 'Carro' },
  { tag: 'sirene', label: 'Sirene' },
  { tag: 'multidao', label: 'Multidão' },
  { tag: 'passos', label: 'Passos' },
  { tag: 'porta', label: 'Porta' },
  { tag: 'sussurros', label: 'Sussurros' },
  { tag: 'tensao', label: 'Tensão' },
  { tag: 'batimento-cardiaco', label: 'Batimento cardíaco' },
  { tag: 'estatica-radio', label: 'Estática/Rádio' },
] as const;

export const MAX_AMBIENT_LAYERS = 12;
export const DEFAULT_LAYER_VOLUME = 70;
export const DEFAULT_FADE_MS = 2000;
export const MIN_FADE_MS = 500;
export const MAX_FADE_MS = 10000;
export const UNLOAD_AFTER_MS = 2 * 60 * 1000;
/** Acima disto o som toca por streaming: decodificado, ocuparia dezenas de MB. */
export const STREAM_ABOVE_S = 180;

const UUID = /^[0-9a-fA-F-]{36}$/;

export interface AmbientLayer {
  id: string;
  assetId: string;
  /** 0 a 100. */
  volume: number;
  /** `null`: todos na cena. */
  target: string | null;
}

export interface AudioSettings {
  /** Volume geral da mestra, 0 a 100: vale para todo mundo. */
  volume: number;
  fadeMs: number;
  /** Sobe a cada "Parar todos os SFX". */
  sfxStop: number;
}

export interface AudioPrefs {
  volume: number;
  muted: boolean;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  volume: 100,
  fadeMs: DEFAULT_FADE_MS,
  sfxStop: 0,
};

export const DEFAULT_AUDIO_PREFS: AudioPrefs = { volume: 100, muted: false };

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

export function parseAmbient(raw: unknown): AmbientLayer[] {
  if (!Array.isArray(raw)) return [];
  const layers: AmbientLayer[] = [];
  for (const item of raw) {
    const layer = item as Partial<AmbientLayer> | null;
    if (!layer || typeof layer.id !== 'string') continue;
    if (typeof layer.assetId !== 'string' || !UUID.test(layer.assetId)) continue;
    if (layers.length >= MAX_AMBIENT_LAYERS) break;
    layers.push({
      id: layer.id,
      assetId: layer.assetId,
      volume: clampNumber(layer.volume, 0, 100, DEFAULT_LAYER_VOLUME),
      target: typeof layer.target === 'string' && UUID.test(layer.target) ? layer.target : null,
    });
  }
  return layers;
}

export function parseAudioSettings(raw: unknown): AudioSettings {
  const value = (raw ?? {}) as Partial<AudioSettings>;
  return {
    volume: clampNumber(value.volume, 0, 100, DEFAULT_AUDIO_SETTINGS.volume),
    fadeMs: clampNumber(value.fadeMs, MIN_FADE_MS, MAX_FADE_MS, DEFAULT_FADE_MS),
    sfxStop: clampNumber(value.sfxStop, 0, Number.MAX_SAFE_INTEGER, 0),
  };
}

export function parseAudioPrefs(raw: string | null): AudioPrefs {
  if (!raw) return DEFAULT_AUDIO_PREFS;
  try {
    const value = JSON.parse(raw) as Partial<AudioPrefs> | null;
    return {
      volume: clampNumber(value?.volume, 0, 100, DEFAULT_AUDIO_PREFS.volume),
      muted: value?.muted === true,
    };
  } catch {
    return DEFAULT_AUDIO_PREFS;
  }
}

/** A mestra não ouve a camada que mandou só para um jogador. */
export function audibleLayers(layers: AmbientLayer[], userId: string): AmbientLayer[] {
  return layers.filter((layer) => layer.target === null || layer.target === userId);
}

/** O mesmo som em duas camadas toca uma vez só, na maior: é o que deixa a troca de cena contínua. */
export function layerGains(
  layers: AmbientLayer[],
  masterVolume: number
): Map<string, number> {
  const gains = new Map<string, number>();
  for (const layer of layers) {
    const gain = (layer.volume / 100) * (masterVolume / 100);
    gains.set(layer.assetId, Math.max(gain, gains.get(layer.assetId) ?? 0));
  }
  return gains;
}

export interface AmbientPlan {
  start: string[];
  stop: string[];
  keep: string[];
}

export function planAmbient(active: Iterable<string>, wanted: Iterable<string>): AmbientPlan {
  const current = new Set(active);
  const next = new Set(wanted);
  return {
    start: Array.from(next).filter((id) => !current.has(id)),
    stop: Array.from(current).filter((id) => !next.has(id)),
    keep: Array.from(next).filter((id) => current.has(id)),
  };
}

export function outputVolume(prefs: AudioPrefs): number {
  return prefs.muted ? 0 : prefs.volume / 100;
}

/** O nome do arquivo no Blob tem sufixo aleatório: o formato vem do tipo gravado. */
export function howlFormat(mime: string): string {
  if (mime === 'audio/mpeg') return 'mp3';
  if (mime === 'audio/mp4' || mime === 'audio/x-m4a') return 'm4a';
  return 'ogg';
}

export function shouldStream(durationS: number | null): boolean {
  return durationS !== null && durationS > STREAM_ABOVE_S;
}

export function expiredSounds(
  lastUsed: Map<string, number>,
  now: number,
  ttlMs: number = UNLOAD_AFTER_MS
): string[] {
  return Array.from(lastUsed)
    .filter(([, used]) => now - used > ttlMs)
    .map(([key]) => key);
}

/** "Floresta Noite" e "floresta-noite" viram a mesma tag. */
export function audioTagFromFolder(folder: string): string {
  return folder
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function matchesCategory(tags: string[], category: string | null): boolean {
  return category === null || tags.includes(category);
}
