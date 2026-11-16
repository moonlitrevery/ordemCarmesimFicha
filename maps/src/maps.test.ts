import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import { deriveWalls, placeOpenings } from './buildings';
import { typeRegistry } from './build';
import { orientedRect, type Vec } from './geom';
import { sunVector } from './lighting';
import { separation } from './props';
import { effectivePpm, renderMap } from './render';
import { hashString, Rng } from './rng';
import { parseSpec, SpecError, type MapSpec } from './schema';
import { bowlHeight } from './terrain';
import { arcPoint } from './terraces';

const SPECS = path.resolve('maps/specs');
const registry = typeRegistry();

function load(name: string) {
  return parseSpec(name, fs.readFileSync(path.join(SPECS, name), 'utf8'), registry);
}

describe('YAML dos mapas', () => {
  it.each(['pousada_terreo.yaml', 'praca.yaml', 'vale_san_giusto.yaml'])('%s é válido', (name) => {
    expect(() => load(name)).not.toThrow();
  });

  it('erro aponta linha e campo', () => {
    const yaml = [
      'id: teste',
      'title: Teste',
      'size_m: [10, 10]',
      'px_per_m: 20',
      'ground:',
      '  - { rect: [0, 0, 10, 10], material: grass_short }',
      'props:',
      '  - { type: bar_stool, at: [1] }',
      '  - { type: dragao, at: [2, 2] }',
    ].join('\n');
    try {
      parseSpec('teste.yaml', yaml, registry);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SpecError);
      const text = (error as SpecError).message;
      expect(text).toMatch(/linha 8 — props\[0\]\.at/);
    }
    const unknown = yaml.replace('at: [1]', 'at: [1, 1]');
    expect(() => parseSpec('teste.yaml', unknown, registry)).toThrow(/linha 9 — props\[1\]\.type: tipo de objeto desconhecido "dragao"/);
  });

  it('campo exigido pelo tipo e material desconhecido', () => {
    const yaml = [
      'id: teste',
      'title: Teste',
      'size_m: [10, 10]',
      'px_per_m: 20',
      'ground:',
      '  - { rect: [0, 0, 10, 10], material: lava_rosa }',
      'props:',
      '  - { type: table_square_cloth }',
    ].join('\n');
    expect(() => parseSpec('t.yaml', yaml, registry)).toThrow(/material desconhecido "lava_rosa"/);
    expect(() => parseSpec('t.yaml', yaml, registry)).toThrow(/"table_square_cloth" precisa do campo at/);
  });

  it('variante separa feature e objeto pelo tipo', () => {
    const { variantItems } = load('vale_san_giusto.yaml');
    expect(variantItems.get('fenda_aberta')?.features.map((f) => f.type)).toEqual(['rock_fissure']);
  });
});

describe('paredes derivadas dos cômodos', () => {
  const { spec } = load('pousada_terreo.yaml');
  const building = spec.buildings[0];

  it('divisas viram paredes internas, unidas', () => {
    const inner = deriveWalls(building).filter((w) => !w.exterior);
    const key = (w: { a: Vec; b: Vec }) => `${w.a.join(',')}→${w.b.join(',')}`;
    expect(inner.map(key).sort()).toEqual(['1,9.5→15,9.5', '12.5,5→12.5,9.5', '4,5→4,9.5'].sort());
  });

  it('portas e janelas caem na parede certa', () => {
    const walls = deriveWalls(building);
    const warnings: string[] = [];
    placeOpenings(building, walls, { warn: (m: string) => warnings.push(m) } as never);
    expect(warnings).toEqual([]);
    const divisa = walls.find((w) => !w.exterior && w.a[1] === 9.5)!;
    expect(divisa.openings.map((o) => o.kind)).toEqual(['door', 'door']);
    const south = walls.find((w) => w.exterior && w.side === 'south')!;
    expect(south.openings.map((o) => o.kind)).toEqual(['window', 'door', 'window']);
  });
});

describe('ajuste fino', () => {
  it('separação mínima empurra para fora da parede', () => {
    const wall = orientedRect([5, 0], 10, 0.35);
    const shelf = orientedRect([5, 0.2], 2, 0.4);
    const push = separation(shelf, wall)!;
    expect(push[0]).toBeCloseTo(0);
    expect(push[1]).toBeGreaterThan(0);
    expect(separation(orientedRect([5, 2], 2, 0.4), wall)).toBeNull();
  });
});

describe('luz e terreno', () => {
  it('sol de sudeste (135°) aponta para leste e sul', () => {
    const s = sunVector({ azimuth_deg: 135, elevation_deg: 40 });
    expect(s.dx).toBeCloseTo(Math.SQRT1_2);
    expect(s.dy).toBeCloseTo(Math.SQRT1_2);
    expect(s.tan).toBeCloseTo(Math.tan((40 * Math.PI) / 180));
  });

  it('tigela: fundo no centro, borda aberta mais baixa', () => {
    const t = { type: 'bowl' as const, center: [60, 55] as [number, number], radius: 46, depth_m: 14, rim_open: 'east' as const };
    expect(bowlHeight(t, 60, 55)).toBeCloseTo(-14);
    expect(bowlHeight(t, 60 + 50, 55)).toBeLessThan(bowlHeight(t, 60 - 50, 55));
  });

  it('arco: 0° leste, 90° norte', () => {
    const [ex, ey] = arcPoint([0, 0], 10, 0);
    const [nx, ny] = arcPoint([0, 0], 10, 90);
    expect([ex, ey].map((v) => Math.round(v))).toEqual([10, 0]);
    expect([nx, ny].map((v) => Math.round(v))).toEqual([0, -10]);
  });

  it('maior lado passa de 4096 px: reduz a escala', () => {
    const spec = { size_m: [200, 100], px_per_m: 32 } as MapSpec;
    expect(effectivePpm(spec)).toEqual({ ppm: 20.48, reduced: true });
  });
});

describe('semente', () => {
  it('rng é determinístico e os garfos são independentes', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
    expect(new Rng(42).fork('x').next()).not.toEqual(new Rng(42).fork('y').next());
    expect(hashString('vale')).toBe(hashString('vale'));
  });

  it('mesmo mapa e semente dão a mesma imagem; outra semente muda', async () => {
    const yaml = [
      'id: mini',
      'title: Mini',
      'size_m: [5, 4]',
      'px_per_m: 16',
      'ground:',
      '  - { rect: [0, 0, 5, 4], material: grass_short }',
      '  - { rect: [0, 3, 5, 4], material: cobblestone_basalt }',
      'props:',
      '  - { type: bistro_table, at: [2, 2] }',
      '  - { type: terracotta_pots, area: [0, 0, 5, 2], count: 3 }',
    ].join('\n');
    const { spec } = parseSpec('mini.yaml', yaml, registry);
    const digest = async (seed?: number) => {
      const { scene } = await renderMap({ spec, seedOverride: seed });
      return createHash('sha1').update(scene.color.getContext('2d').getImageData(0, 0, scene.W, scene.H).data).digest('hex');
    };
    const first = await digest();
    expect(await digest()).toBe(first);
    expect(await digest(7)).not.toBe(first);
  }, 30000);
});
