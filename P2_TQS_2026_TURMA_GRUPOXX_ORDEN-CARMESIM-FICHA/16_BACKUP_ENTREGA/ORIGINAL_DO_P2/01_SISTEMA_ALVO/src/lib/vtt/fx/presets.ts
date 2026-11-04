/**
 * Efeitos descritos só com dados: preset novo é só mais um objeto aqui.
 * Distâncias e tamanhos em "unidades": 1 = metade do maior lado da imagem do dono,
 * então o efeito acompanha qualquer token. Clima usa pixels da tela (unidade = 1).
 */
export type FxTextureName =
  | 'soft'
  | 'wind'
  | 'wing'
  | 'flake'
  | 'ash'
  | 'splash'
  | 'rune1'
  | 'rune2'
  | 'rune3'
  | 'rune4'
  | 'rune5'
  | 'rune6';

export type FxRange = readonly [number, number];

/** Pontos igualmente espaçados ao longo da vida da partícula. */
export type FxCurve = readonly number[];

export type FxBlend = 'add' | 'normal';

/** Atrás ou na frente da imagem do dono. */
export type FxLayer = 'behind' | 'front';

/** `custom`: a cor que a pessoa escolheu no menu. */
export type FxColor = number | 'custom';

export interface EmitterDef {
  textures: readonly FxTextureName[];
  /** Partículas por segundo. */
  rate?: number;
  /** Esporádico: a cada `every` segundos solta `count` de uma vez. */
  burst?: { every: FxRange; count: FxRange };
  /** Limite deste emissor; o teto global (SPEC §7.5) vale por cima. */
  max: number;
  life: FxRange;
  speed: FxRange;
  size: FxRange;
  alpha: FxCurve;
  scale: FxCurve;
  color: FxColor;
  blend: FxBlend;
  layer: FxLayer;
  /** Distância do centro onde nasce. */
  radius: FxRange;
  /** Onde nasce no anel, em radianos. Sem isto, em volta toda. */
  arc?: FxRange;
  /** Sem isto, sai para fora do anel. Com isto, nessa direção. */
  direction?: FxRange;
  /** Soma à direção de saída: 0 sai reto, π/2 gira em volta do dono. */
  swirl?: number;
  /** Rotação da textura ao longo do movimento (traço de vento). */
  align?: boolean;
  spin?: FxRange;
  sway?: { amplitude: number; hz: number };
  /** Nasce em qualquer ponto da tela: só para clima. */
  fullscreen?: boolean;
}

export interface SpriteDef {
  texture: FxTextureName;
  /** Largura em unidades. */
  size: number;
  color: FxColor;
  alpha: number;
  blend: FxBlend;
  layer: FxLayer;
  anchor?: readonly [number, number];
  offset?: readonly [number, number];
  /** Segundo sprite espelhado no eixo vertical do dono (par de asas). */
  mirrored?: boolean;
  /** Oscila a rotação entre dois ângulos. */
  flap?: { from: number; to: number; hz: number };
  /** Oscila a escala. Modo leve desliga: é glow animado (SPEC §7.4). */
  pulse?: { min: number; max: number; hz: number };
}

export interface FxPreset {
  id: string;
  label: string;
  emitters?: readonly EmitterDef[];
  sprites?: readonly SpriteDef[];
  /** Treme o dono, sem partícula nenhuma. Amplitude em unidades. */
  shake?: { amplitude: number; hz: number };
  /** Mostra as cores no menu. */
  colorable?: boolean;
  defaultColor?: string;
}

export const FULL_TURN = Math.PI * 2;

const RUNES = ['rune1', 'rune2', 'rune3', 'rune4', 'rune5', 'rune6'] as const;
const BABY_BLUE = 0x89cff0;
const RUNE_YELLOW = 0xffd84a;
const WIND_WHITE = 0xdff3ff;
const POISON_GREEN = 0x5bd13a;

/** Vida, início e tamanho iguais aos dois: a Varredura só vai mais longe. */
const RUNE_BASE = {
  textures: RUNES,
  life: [1.4, 2],
  size: [0.3, 0.42],
  alpha: [0, 1, 0.9, 0],
  scale: [0.7, 1, 1.05],
  blend: 'add',
  layer: 'front',
  radius: [0.75, 0.95],
  spin: [-0.5, 0.5],
} as const;

/** Uma lufada; `arc` diz de que lado do token ela sai. */
const GUST = {
  textures: ['wind'],
  burst: { every: [0.55, 0.8], count: [3, 5] },
  max: 28,
  life: [0.45, 0.8],
  speed: [1.8, 3],
  size: [0.55, 0.95],
  alpha: [0, 0.8, 0],
  scale: [0.7, 1, 1.2],
  color: WIND_WHITE,
  blend: 'add',
  layer: 'behind',
  radius: [0.8, 1.3],
  align: true,
} as const;

export const SPELL_PRESETS = {
  covardia: {
    id: 'covardia',
    label: 'Asas de vento',
    sprites: [
      {
        texture: 'wing',
        size: 1.7,
        color: WIND_WHITE,
        alpha: 0.65,
        blend: 'add',
        layer: 'behind',
        anchor: [0.04, 0.72],
        offset: [0.18, -0.12],
        mirrored: true,
        flap: { from: -0.5, to: 0.42, hz: 1.5 },
      },
    ],
    emitters: [
      { ...GUST, arc: [Math.PI * 0.6, Math.PI * 1.4] },
      { ...GUST, arc: [-Math.PI * 0.4, Math.PI * 0.4] },
    ],
  },
  carneirinho: {
    id: 'carneirinho',
    label: 'Runas azul-bebê',
    emitters: [
      {
        ...RUNE_BASE,
        burst: { every: [0.7, 2.2], count: [1, 3] },
        max: 24,
        speed: [0.4, 0.5],
        color: BABY_BLUE,
      },
    ],
  },
  ginastica: {
    id: 'ginastica',
    label: 'Vento em volta',
    emitters: [
      {
        textures: ['wind'],
        rate: 20,
        max: 44,
        life: [0.6, 1.1],
        speed: [1.1, 1.9],
        size: [0.5, 0.9],
        alpha: [0, 0.7, 0.45, 0],
        scale: [0.6, 1, 1.25],
        color: WIND_WHITE,
        blend: 'add',
        layer: 'front',
        radius: [0.75, 1.05],
        swirl: Math.PI * 0.32,
        align: true,
      },
    ],
  },
  varredura: {
    id: 'varredura',
    label: 'Runas amarelas',
    emitters: [
      {
        ...RUNE_BASE,
        rate: 7,
        max: 36,
        // Contado do centro do token, dá 3× o alcance do Carneirinho.
        speed: [2, 2.67],
        color: RUNE_YELLOW,
      },
    ],
  },
  balasDeVeneno: {
    id: 'balas-de-veneno',
    label: 'Aura de gás verde',
    emitters: [
      {
        textures: ['soft'],
        rate: 16,
        max: 48,
        life: [1.2, 2.4],
        speed: [0.08, 0.3],
        size: [0.55, 1.05],
        alpha: [0, 0.42, 0.3, 0],
        scale: [0.55, 1, 1.5],
        color: POISON_GREEN,
        blend: 'normal',
        layer: 'front',
        radius: [0, 0.8],
        spin: [-0.4, 0.4],
      },
    ],
  },
} satisfies Record<string, FxPreset>;

/** Efeitos sem ser magia (menu Efeitos ▸). Para adicionar: mais um objeto na lista. */
export const TOKEN_EFFECTS: readonly FxPreset[] = [
  {
    id: 'brilho',
    label: 'Brilho',
    colorable: true,
    defaultColor: '#e8a33d',
    sprites: [
      { texture: 'soft', size: 3, color: 'custom', alpha: 0.85, blend: 'add', layer: 'behind' },
    ],
  },
  {
    id: 'pulsar',
    label: 'Pulsar',
    colorable: true,
    defaultColor: '#e0525f',
    sprites: [
      {
        texture: 'soft',
        size: 2.9,
        color: 'custom',
        alpha: 0.8,
        blend: 'add',
        layer: 'behind',
        pulse: { min: 0.82, max: 1.2, hz: 0.8 },
      },
    ],
  },
  {
    id: 'tremor',
    label: 'Tremor',
    shake: { amplitude: 0.03, hz: 13 },
  },
  {
    id: 'aura-sombria',
    label: 'Aura sombria',
    emitters: [
      {
        textures: ['soft'],
        rate: 11,
        max: 34,
        life: [2, 3.4],
        speed: [0.05, 0.16],
        size: [0.9, 1.5],
        alpha: [0, 0.55, 0.42, 0],
        scale: [0.7, 1, 1.35],
        color: 0x120d18,
        blend: 'normal',
        layer: 'behind',
        radius: [0.3, 0.95],
        spin: [-0.25, 0.25],
      },
    ],
  },
];

/** Cores do Brilho e do Pulsar: grandes o bastante para o dedo. */
export const EFFECT_COLORS = [
  '#e8a33d',
  '#e0525f',
  '#b57edc',
  '#5d8bf4',
  '#3dc1d3',
  '#7bc950',
  '#f5e6c8',
  '#f07bb5',
] as const;

// ---------- Clima (tela inteira) ----------

/** O modo leve fica só com a primeira camada (SPEC §7.4). */
export const RAIN_LAYERS = [
  { speed: 900, alpha: 0.62, tileScale: 1.35 },
  { speed: 620, alpha: 0.4, tileScale: 0.85 },
] as const;

export const FOG_LAYERS = [
  { speedX: 15, speedY: 3, alpha: 0.62, tileScale: 4 },
  { speedX: -9, speedY: -2, alpha: 0.42, tileScale: 2.7 },
] as const;

/** Inclinação do risco da chuva em relação à vertical, em radianos. */
export const RAIN_ANGLE = 0.2;

export const RAIN_SPLASH: EmitterDef = {
  textures: ['splash'],
  rate: 12,
  max: 24,
  life: [0.18, 0.3],
  speed: [0, 0],
  size: [14, 26],
  alpha: [0.5, 0.25, 0],
  scale: [0.35, 0.8, 1],
  color: 0xc8dcf0,
  blend: 'add',
  layer: 'front',
  radius: [0, 0],
  fullscreen: true,
};

export const SNOW: EmitterDef = {
  textures: ['flake', 'soft'],
  rate: 34,
  max: 190,
  life: [4.5, 7],
  speed: [34, 72],
  size: [5, 12],
  alpha: [0, 0.9, 0.9, 0],
  scale: [1, 1],
  color: 0xf4f8ff,
  blend: 'normal',
  layer: 'front',
  radius: [0, 0],
  direction: [Math.PI * 0.44, Math.PI * 0.56],
  spin: [-0.8, 0.8],
  sway: { amplitude: 26, hz: 0.28 },
  fullscreen: true,
};

export const SOOT: EmitterDef = {
  textures: ['ash', 'soft'],
  rate: 14,
  max: 90,
  life: [4, 7.5],
  speed: [12, 34],
  size: [4, 11],
  alpha: [0, 0.85, 0.7, 0],
  scale: [0.8, 1, 1.15],
  color: 0x16100e,
  blend: 'normal',
  layer: 'front',
  radius: [0, 0],
  direction: [-Math.PI * 0.72, -Math.PI * 0.32],
  spin: [-1, 1],
  sway: { amplitude: 14, hz: 0.18 },
  fullscreen: true,
};
