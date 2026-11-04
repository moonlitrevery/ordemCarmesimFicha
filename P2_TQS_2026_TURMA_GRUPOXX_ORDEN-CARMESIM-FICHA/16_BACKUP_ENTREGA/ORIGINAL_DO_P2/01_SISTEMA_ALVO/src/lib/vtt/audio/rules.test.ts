import { describe, expect, it } from 'vitest';
import {
  audibleLayers,
  audioTagFromFolder,
  AUDIO_CATEGORIES,
  expiredSounds,
  howlFormat,
  layerGains,
  matchesCategory,
  MAX_AMBIENT_LAYERS,
  outputVolume,
  parseAmbient,
  parseAudioPrefs,
  parseAudioSettings,
  planAmbient,
  shouldStream,
  UNLOAD_AFTER_MS,
  type AmbientLayer,
} from './rules';

const ASSET_A = '11111111-1111-4111-8111-111111111111';
const ASSET_B = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';

const layer = (patch: Partial<AmbientLayer> = {}): AmbientLayer => ({
  id: 'l1',
  assetId: ASSET_A,
  volume: 50,
  target: null,
  ...patch,
});

describe('parseAmbient', () => {
  it('ignora o que não é camada e limita o volume', () => {
    expect(parseAmbient('x')).toEqual([]);
    expect(
      parseAmbient([null, { id: 'a' }, { id: 'b', assetId: 'nope' }, layer({ volume: 900 })])
    ).toEqual([layer({ volume: 100 })]);
  });

  it('trata alvo inválido como todos', () => {
    expect(parseAmbient([{ ...layer(), target: 'x' }])[0].target).toBeNull();
    expect(parseAmbient([layer({ target: USER })])[0].target).toBe(USER);
  });

  it('corta no limite de camadas', () => {
    const many = Array.from({ length: MAX_AMBIENT_LAYERS + 3 }, (_, i) => layer({ id: `${i}` }));
    expect(parseAmbient(many)).toHaveLength(MAX_AMBIENT_LAYERS);
  });
});

describe('parseAudioSettings', () => {
  it('usa o padrão quando falta e prende o fade na faixa', () => {
    expect(parseAudioSettings(null)).toEqual({ volume: 100, fadeMs: 2000, sfxStop: 0 });
    expect(parseAudioSettings({ fadeMs: 1 }).fadeMs).toBe(500);
    expect(parseAudioSettings({ volume: 40, fadeMs: 99999 })).toMatchObject({
      volume: 40,
      fadeMs: 10000,
    });
  });
});

describe('parseAudioPrefs', () => {
  it('sobrevive a valor corrompido', () => {
    expect(parseAudioPrefs(null)).toEqual({ volume: 100, muted: false });
    expect(parseAudioPrefs('{')).toEqual({ volume: 100, muted: false });
    expect(parseAudioPrefs('{"volume":30,"muted":true}')).toEqual({ volume: 30, muted: true });
  });

  it('mudo zera a saída sem perder o volume', () => {
    expect(outputVolume({ volume: 30, muted: true })).toBe(0);
    expect(outputVolume({ volume: 30, muted: false })).toBeCloseTo(0.3);
  });
});

describe('camadas audíveis', () => {
  it('camada com alvo só toca para o alvo', () => {
    const layers = [layer(), layer({ id: 'l2', assetId: ASSET_B, target: USER })];
    expect(audibleLayers(layers, USER)).toHaveLength(2);
    expect(audibleLayers(layers, ASSET_A)).toEqual([layers[0]]);
  });

  it('o volume geral multiplica o da camada', () => {
    expect(layerGains([layer({ volume: 50 })], 50).get(ASSET_A)).toBeCloseTo(0.25);
  });

  it('o mesmo som duas vezes fica com o maior ganho', () => {
    const gains = layerGains([layer({ volume: 20 }), layer({ id: 'l2', volume: 80 })], 100);
    expect(gains.size).toBe(1);
    expect(gains.get(ASSET_A)).toBeCloseTo(0.8);
  });
});

describe('planAmbient', () => {
  it('som em comum continua: só o que mudou entra ou sai', () => {
    expect(planAmbient(['a', 'b'], ['b', 'c'])).toEqual({
      start: ['c'],
      stop: ['a'],
      keep: ['b'],
    });
  });

  it('sem cena, tudo sai', () => {
    expect(planAmbient(['a'], []).stop).toEqual(['a']);
  });
});

describe('carga', () => {
  it('escolhe o formato pelo tipo gravado', () => {
    expect(howlFormat('audio/ogg')).toBe('ogg');
    expect(howlFormat('audio/mpeg')).toBe('mp3');
    expect(howlFormat('audio/x-m4a')).toBe('m4a');
  });

  it('só faz streaming de som longo', () => {
    expect(shouldStream(null)).toBe(false);
    expect(shouldStream(60)).toBe(false);
    expect(shouldStream(600)).toBe(true);
  });

  it('descarrega o que está parado há mais de 2 minutos', () => {
    const used = new Map([
      ['velho', 0],
      ['novo', 1000],
    ]);
    expect(expiredSounds(used, UNLOAD_AFTER_MS + 1)).toEqual(['velho']);
  });
});

describe('categorias', () => {
  it('toda categoria sai igual da pasta com o rótulo dela', () => {
    for (const { tag, label } of AUDIO_CATEGORIES) {
      expect(audioTagFromFolder(label)).toBe(tag);
    }
  });

  it('sem categoria escolhida, tudo passa', () => {
    expect(matchesCategory([], null)).toBe(true);
    expect(matchesCategory(['chuva'], 'chuva')).toBe(true);
    expect(matchesCategory(['chuva'], 'vento')).toBe(false);
  });
});
