export const MAX_VISIBLE_CONDITIONS = 6;
export const MAX_CUSTOM_CONDITION_LENGTH = 24;

const CUSTOM_PREFIX = 'custom:';
const MAX_CONDITIONS_PER_OBJECT = 40;

/** Traços em uma caixa de 24×24: o mesmo desenho serve ao menu e ao canvas. */
export interface StandardCondition {
  id: string;
  label: string;
  hint?: string;
  path: string;
}

export const STANDARD_CONDITIONS: StandardCondition[] = [
  {
    id: 'queimando',
    label: 'Queimando',
    path: 'M12 3c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 1-3-1-6 1-10z',
  },
  {
    id: 'envenenado',
    label: 'Envenenado',
    path: 'M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z M10 12l4 4 M14 12l-4 4',
  },
  {
    id: 'atordoado',
    label: 'Atordoado',
    hint: 'perde o próximo turno',
    path: 'M12 4l2.2 5 5.3.5-4 3.5 1.2 5.2-4.7-2.7-4.7 2.7 1.2-5.2-4-3.5 5.3-.5z',
  },
  {
    id: 'sangrando',
    label: 'Sangrando',
    path: 'M8 4c2 3 4 5 4 8a4 4 0 0 1-8 0c0-3 2-5 4-8z M17 11c1.5 2 3 3.5 3 5.5a3 3 0 0 1-6 0c0-2 1.5-3.5 3-5.5z',
  },
  {
    id: 'cegueira-parcial',
    label: 'Cegueira parcial',
    path: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z M4 20L20 4',
  },
  {
    id: 'movimento-dificultado',
    label: 'Movimento dificultado',
    path: 'M3 12h11 M10 8l4 4-4 4 M19 5v14',
  },
  {
    id: 'confuso',
    label: 'Confuso',
    path: 'M8.5 9a3.5 3.5 0 1 1 5.5 3c-1.2.8-2 1.5-2 3 M12 19h.01',
  },
  {
    id: 'com-medo',
    label: 'Com medo',
    path: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M9 10h.01 M15 10h.01 M12 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  },
  {
    id: 'alucinando',
    label: 'Alucinando',
    path: 'M12 12a1.5 1.5 0 0 1 3 0 3 3 0 0 1-6 0 5 5 0 0 1 10 0 7 7 0 0 1-14 0 8 8 0 0 1 8-8',
  },
  {
    id: 'arma-travada',
    label: 'Arma travada',
    path: 'M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3 M12 15v2',
  },
  {
    id: 'na-fumaca',
    label: 'Na fumaça',
    hint: 'desvantagem',
    path: 'M7 18a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 9a4.5 4.5 0 0 1 0 9z M8 21h8',
  },
];

export const CUSTOM_EMOJI_CHOICES = [
  '🔥', '❄️', '⚡', '💀', '🩸', '🕸️', '👁️', '🌀',
  '💤', '🛡️', '🗡️', '✨', '🌑', '☠️', '🧠', '❤️',
];

export interface ResolvedCondition {
  /** O valor guardado em `scene_objects.conditions`. */
  key: string;
  label: string;
  path?: string;
  emoji?: string;
}

function firstGrapheme(text: string): string {
  const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return Array.from(segments.segment(text))[0]?.segment ?? '';
}

// Por construtor: a sintaxe literal de \p depende do alvo do compilador.
const EMOJI = new RegExp('\\p{Extended_Pictographic}|\\p{Regional_Indicator}', 'u');

/** Um único emoji, ou `null`: a arte do token só tem lugar para um símbolo. */
export function sanitizeEmoji(text: string): string | null {
  const first = firstGrapheme(text.trim());
  return first && EMOJI.test(first) ? first : null;
}

function clipLabel(text: string): string {
  return Array.from(text).slice(0, MAX_CUSTOM_CONDITION_LENGTH).join('');
}

export function customCondition(text: string, emoji: string): string | null {
  const label = clipLabel(text.trim());
  const symbol = sanitizeEmoji(emoji);
  return label && symbol ? `${CUSTOM_PREFIX}${symbol}:${label}` : null;
}

/** Valor que não se reconhece vira `null`: qualquer membro grava esta coluna. */
export function resolveCondition(key: string): ResolvedCondition | null {
  if (key.startsWith(CUSTOM_PREFIX)) {
    const rest = key.slice(CUSTOM_PREFIX.length);
    const colon = rest.indexOf(':');
    if (colon < 0) return null;
    const emoji = sanitizeEmoji(rest.slice(0, colon));
    const label = clipLabel(rest.slice(colon + 1));
    return emoji && label ? { key, label, emoji } : null;
  }
  const standard = STANDARD_CONDITIONS.find((item) => item.id === key);
  if (!standard) return null;
  return {
    key,
    label: standard.hint ? `${standard.label} (${standard.hint})` : standard.label,
    path: standard.path,
  };
}

export function resolveConditions(keys: string[]): ResolvedCondition[] {
  return keys
    .slice(0, MAX_CONDITIONS_PER_OBJECT)
    .map(resolveCondition)
    .filter((item): item is ResolvedCondition => item !== null);
}

export function toggleCondition(keys: string[], key: string): string[] {
  return keys.includes(key)
    ? keys.filter((item) => item !== key)
    : [...keys, key];
}

export function isValidConditionList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_CONDITIONS_PER_OBJECT &&
    value.every((item) => typeof item === 'string' && item.length <= 120)
  );
}

/** No máximo 6 no arco; o resto vira "+N", que mostra os nomes ao tocar. */
export function splitVisibleConditions(conditions: ResolvedCondition[]): {
  visible: ResolvedCondition[];
  overflow: ResolvedCondition[];
} {
  return {
    visible: conditions.slice(0, MAX_VISIBLE_CONDITIONS),
    overflow: conditions.slice(MAX_VISIBLE_CONDITIONS),
  };
}

const MAX_ARC_SPAN = Math.PI * 0.9;

/**
 * Posições em volta do centro do token, simétricas e sobre o topo. Em token
 * pequeno o raio cresce: ícones têm tamanho fixo na tela e não podem se cobrir.
 */
export function conditionArc(
  count: number,
  radius: number,
  spacing: number
): { x: number; y: number }[] {
  if (count <= 0) return [];
  const needed = count > 1 ? ((count - 1) * spacing) / MAX_ARC_SPAN : 0;
  const r = Math.max(radius, needed);
  const step = count > 1 ? spacing / r : 0;
  const start = (-(count - 1) * step) / 2;
  return Array.from({ length: count }, (_unused, index) => {
    const angle = start + index * step;
    return { x: Math.sin(angle) * r, y: -Math.cos(angle) * r };
  });
}
