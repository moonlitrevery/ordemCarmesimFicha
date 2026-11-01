import { describe, expect, it } from 'vitest';
import { SPELL_PRESETS, TOKEN_EFFECTS } from './presets';
import {
  lightingColors,
  LIGHTING_OFF,
  parseLighting,
  approach,
  curveAt,
  emitterReach,
  FpsMonitor,
  isAnimatedPreset,
  isOnScreen,
  parseEffects,
  parseWeather,
  particleCap,
  patchWeather,
  presetReach,
  resolveEffects,
  setEffectColor,
  supportsEffects,
  toggleEffect,
} from './rules';
import { normalizeSearch, searchSpells, SPELLS } from './spells';

describe('magias', () => {
  it('começa exatamente com as cinco da mestra', () => {
    expect(SPELLS.map((spell) => [spell.name, spell.appliesTo])).toEqual([
      ['Covardia', 'token'],
      ['Carneirinho', 'token'],
      ['Ginástica', 'token'],
      ['Varredura', 'token'],
      ['Balas de Veneno', 'addon'],
    ]);
  });

  it('cada magia tem o próprio preset', () => {
    expect(new Set(SPELLS.map((spell) => spell.preset)).size).toBe(SPELLS.length);
  });

  it('a busca acha qualquer magia, sem acento e sem caixa', () => {
    for (const spell of SPELLS) {
      expect(searchSpells(spell.name.toUpperCase())).toContain(spell);
    }
    expect(searchSpells('ginastica').map((s) => s.id)).toEqual(['ginastica']);
    expect(searchSpells('  VENENO ').map((s) => s.id)).toEqual(['balas-de-veneno']);
    expect(searchSpells('')).toHaveLength(SPELLS.length);
    expect(searchSpells('xyz')).toEqual([]);
    expect(normalizeSearch('Ginástica')).toBe('ginastica');
  });

  it('Varredura vai cerca de 3× mais longe que Carneirinho', () => {
    const ratio =
      emitterReach(SPELL_PRESETS.varredura.emitters[0]) /
      emitterReach(SPELL_PRESETS.carneirinho.emitters[0]);
    expect(ratio).toBeGreaterThan(2.8);
    expect(ratio).toBeLessThan(3.2);
  });

  it('Carneirinho é esporádico e Varredura, contínua', () => {
    expect(SPELL_PRESETS.carneirinho.emitters[0]).toHaveProperty('burst');
    expect(SPELL_PRESETS.carneirinho.emitters[0]).not.toHaveProperty('rate');
    expect(SPELL_PRESETS.varredura.emitters[0].rate).toBeGreaterThan(0);
  });

  it('Carneirinho e Varredura usam runas desenhadas, nas cores pedidas', () => {
    const [blue] = SPELL_PRESETS.carneirinho.emitters;
    const [yellow] = SPELL_PRESETS.varredura.emitters;
    expect(blue.textures.every((name) => name.startsWith('rune'))).toBe(true);
    expect(blue.color).toBe(0x89cff0);
    expect(yellow.color).toBe(0xffd84a);
  });
});

describe('efeitos na coluna', () => {
  it('ignora o que qualquer um poderia gravar', () => {
    expect(parseEffects('x')).toEqual([]);
    expect(parseEffects(null)).toEqual([]);
    expect(
      parseEffects([
        null,
        { type: 'spell' },
        { type: 'outra', id: 'a' },
        { type: 'spell', id: 'a' },
        { type: 'spell', id: 'a' },
        { type: 'effect', id: 'b', color: 'red' },
        { type: 'effect', id: 'c', color: '#112233' },
      ])
    ).toEqual([
      { type: 'spell', id: 'a' },
      { type: 'effect', id: 'b' },
      { type: 'effect', id: 'c', color: '#112233' },
    ]);
  });

  it('limita quantos efeitos um objeto carrega', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ type: 'spell', id: `s${i}` }));
    expect(parseEffects(many)).toHaveLength(12);
  });

  it('liga e desliga sem mexer nos outros', () => {
    const on = toggleEffect([{ type: 'spell', id: 'covardia' }], { type: 'effect', id: 'brilho' });
    expect(on).toHaveLength(2);
    expect(toggleEffect(on, { type: 'spell', id: 'covardia' })).toEqual([
      { type: 'effect', id: 'brilho' },
    ]);
  });

  it('muda a cor só do efeito certo', () => {
    expect(
      setEffectColor(
        [
          { type: 'effect', id: 'brilho' },
          { type: 'effect', id: 'pulsar' },
        ],
        'effect',
        'pulsar',
        '#ff0000'
      )
    ).toEqual([
      { type: 'effect', id: 'brilho' },
      { type: 'effect', id: 'pulsar', color: '#ff0000' },
    ]);
  });

  it('magia só funciona no alvo certo', () => {
    const spell = [{ type: 'spell', id: 'balas-de-veneno' }];
    expect(resolveEffects(spell, 'addon')).toHaveLength(1);
    expect(resolveEffects(spell, 'token')).toEqual([]);
    expect(resolveEffects([{ type: 'spell', id: 'covardia' }], 'addon')).toEqual([]);
    expect(resolveEffects(spell, 'adereco')).toEqual([]);
    expect(supportsEffects('adereco')).toBe(false);
  });

  it('id desconhecido não desenha; cor padrão vem do preset', () => {
    expect(resolveEffects([{ type: 'spell', id: 'nada' }], 'token')).toEqual([]);
    const [brilho] = resolveEffects([{ type: 'effect', id: 'brilho' }], 'token');
    expect(brilho.color).toBe('#e8a33d');
    const [custom] = resolveEffects([{ type: 'effect', id: 'brilho', color: '#00ff00' }], 'token');
    expect(custom.color).toBe('#00ff00');
    expect(custom.key).not.toBe(brilho.key);
  });
});

describe('presets', () => {
  const find = (id: string) => TOKEN_EFFECTS.find((effect) => effect.id === id)!;

  it('efeitos de token iniciais', () => {
    expect(TOKEN_EFFECTS.map((effect) => effect.id)).toEqual([
      'brilho',
      'pulsar',
      'tremor',
      'aura-sombria',
    ]);
  });

  it('Tremor não solta partícula nenhuma', () => {
    expect(find('tremor').emitters).toBeUndefined();
    expect(find('tremor').sprites).toBeUndefined();
    expect(find('tremor').shake).toBeDefined();
  });

  it('Brilho parado não pede quadro; Pulsar para no modo leve', () => {
    expect(isAnimatedPreset(find('brilho'), false)).toBe(false);
    expect(isAnimatedPreset(find('pulsar'), false)).toBe(true);
    expect(isAnimatedPreset(find('pulsar'), true)).toBe(false);
    expect(isAnimatedPreset(find('tremor'), true)).toBe(true);
    expect(isAnimatedPreset(SPELL_PRESETS.covardia, true)).toBe(true);
  });

  it('a margem de visibilidade cobre o alcance', () => {
    expect(presetReach(SPELL_PRESETS.varredura)).toBeGreaterThan(6);
    expect(presetReach(find('tremor'))).toBe(1);
  });
});

describe('partículas', () => {
  it('curva interpola entre pontos iguais', () => {
    expect(curveAt([0, 1, 0], 0)).toBe(0);
    expect(curveAt([0, 1, 0], 0.25)).toBeCloseTo(0.5);
    expect(curveAt([0, 1, 0], 0.5)).toBe(1);
    expect(curveAt([0, 1, 0], 1)).toBe(0);
    expect(curveAt([0, 1, 0], 2)).toBe(0);
    expect(curveAt([0.4], 0.7)).toBe(0.4);
  });

  it('tetos da SPEC §7.5', () => {
    expect(particleCap(false)).toBe(1200);
    expect(particleCap(true)).toBe(300);
  });

  it('fora da câmera, contando o alcance', () => {
    expect(isOnScreen(100, 100, 0, 800, 600)).toBe(true);
    expect(isOnScreen(-50, 100, 40, 800, 600)).toBe(false);
    expect(isOnScreen(-50, 100, 60, 800, 600)).toBe(true);
    expect(isOnScreen(900, 100, 60, 800, 600)).toBe(false);
  });
});

describe('clima', () => {
  it('lê só o que conhece, na ordem do painel', () => {
    expect(parseWeather({})).toEqual([]);
    expect(parseWeather([])).toEqual([]);
    expect(
      parseWeather([
        { type: 'neve', on: true, intensity: 300 },
        { type: 'lava', on: true, intensity: 10 },
        { type: 'chuva', on: 'sim', intensity: -5 },
        null,
      ])
    ).toEqual([
      { type: 'chuva', on: false, intensity: 0 },
      { type: 'neve', on: true, intensity: 100 },
    ]);
  });

  it('guarda a intensidade com o efeito desligado', () => {
    const on = patchWeather([], 'chuva', { on: true, intensity: 70 });
    expect(on).toEqual([{ type: 'chuva', on: true, intensity: 70 }]);
    expect(patchWeather(on, 'chuva', { on: false })).toEqual([
      { type: 'chuva', on: false, intensity: 70 },
    ]);
  });

  it('é cumulativo', () => {
    const both = patchWeather(patchWeather([], 'nevoa', { on: true }), 'chuva', { on: true });
    expect(both.map((entry) => entry.type)).toEqual(['chuva', 'nevoa']);
  });

  it('fade não passa do alvo', () => {
    expect(approach(0, 0.5, 0.2)).toBeCloseTo(0.2);
    expect(approach(0.45, 0.5, 0.2)).toBe(0.5);
    expect(approach(1, 0, 0.3)).toBeCloseTo(0.7);
    expect(approach(0.1, 0, 0.3)).toBe(0);
  });
});

describe('FpsMonitor', () => {
  function run(monitor: FpsMonitor, fps: number, seconds: number, from = 1000) {
    let fired = false;
    for (let i = 0; i <= fps * seconds; i++) {
      if (monitor.feed(from + (i * 1000) / fps)) fired = true;
    }
    return fired;
  }

  it('avisa com média abaixo de 40 por 5 s', () => {
    expect(run(new FpsMonitor(), 30, 6)).toBe(true);
  });

  it('não avisa com menos de 5 s nem com bom FPS', () => {
    expect(run(new FpsMonitor(), 30, 4)).toBe(false);
    expect(run(new FpsMonitor(), 60, 12)).toBe(false);
  });

  it('aba escondida recomeça a conta', () => {
    const monitor = new FpsMonitor();
    expect(run(monitor, 30, 4)).toBe(false);
    expect(run(monitor, 30, 4, 60_000)).toBe(false);
  });
});

describe('iluminação', () => {
  it('sem valor ou com preset desconhecido fica desligada', () => {
    expect(parseLighting(null)).toEqual(LIGHTING_OFF);
    expect(parseLighting({ preset: 'sol', on: true })).toEqual(LIGHTING_OFF);
  });

  it('corrige cor e intensidade tortas', () => {
    const state = parseLighting({ on: true, preset: 'custom', color: 'azul', intensity: 400 });
    expect(state.on).toBe(true);
    expect(state.intensity).toBe(100);
    expect(state.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('só o Crepúsculo tem duas cores, e a personalizada usa a escolhida', () => {
    const colors = (preset: string) =>
      lightingColors(parseLighting({ on: true, preset, color: '#112233', intensity: 50 }));
    const [top, bottom] = colors('crepusculo');
    expect(top).not.toBe(bottom);
    expect(colors('noite')[0]).toBe(colors('noite')[1]);
    expect(colors('custom')).toEqual(['#112233', '#112233']);
  });
});
