import { describe, expect, it } from 'vitest';
import {
  formatScale,
  calibrate,
  distanceToStroke,
  formatRulerDistance,
  parseMeters,
  simplifyStroke,
  simplifyToLimit,
} from './geometry';

describe('simplifyStroke', () => {
  it('tira pontos colineares e mantém as pontas', () => {
    expect(simplifyStroke([0, 0, 5, 0, 10, 0], 1)).toEqual([0, 0, 10, 0]);
  });

  it('mantém o canto', () => {
    expect(simplifyStroke([0, 0, 5, 5, 10, 0], 1)).toEqual([0, 0, 5, 5, 10, 0]);
  });

  it('não mexe em traço de dois pontos', () => {
    expect(simplifyStroke([1, 2, 3, 4], 5)).toEqual([1, 2, 3, 4]);
  });

  it('fica dentro da tolerância', () => {
    const points: number[] = [];
    for (let i = 0; i < 200; i++) points.push(i, Math.sin(i / 10) * 20);
    const simple = simplifyStroke(points, 1);
    expect(simple.length).toBeLessThan(points.length);
    for (let i = 0; i < points.length; i += 2) {
      expect(
        distanceToStroke(points[i], points[i + 1], simple)
      ).toBeLessThanOrEqual(1.0001);
    }
  });
});

describe('simplifyToLimit', () => {
  it('respeita o limite mesmo em rabisco enorme', () => {
    const points: number[] = [];
    for (let i = 0; i < 2000; i++) points.push(i % 2 ? 0 : 500, i);
    const result = simplifyToLimit(points, 0.1, 400);
    expect(result.length).toBeLessThanOrEqual(400);
    expect(result.length).toBeGreaterThanOrEqual(4);
  });
});

describe('distanceToStroke', () => {
  it('mede até o segmento mais próximo', () => {
    expect(distanceToStroke(5, 3, [0, 0, 10, 0])).toBeCloseTo(3);
    expect(distanceToStroke(13, 4, [0, 0, 10, 0])).toBeCloseTo(5);
  });
});

describe('régua', () => {
  it('sem calibração pede para calibrar', () => {
    expect(formatRulerDistance(100, null)).toBe('calibre a régua');
  });

  it('calibra e converte', () => {
    const mpp = calibrate(200, 10);
    expect(mpp).toBe(0.05);
    expect(formatRulerDistance(250, mpp)).toBe('12,5 m');
  });

  it('recusa calibração sem sentido', () => {
    expect(calibrate(0, 10)).toBeNull();
    expect(calibrate(100, -1)).toBeNull();
  });

  it('lê metros com vírgula', () => {
    expect(parseMeters(' 12,5 ')).toBe(12.5);
    expect(parseMeters('abc')).toBeNull();
    expect(parseMeters('0')).toBeNull();
  });
});

describe('formatScale', () => {
  it('mostra quantos pixels dão um metro', () => {
    expect(formatScale(0.02)).toBe('1 m ≈ 50 px');
  });

  it('usa vírgula e uma casa quando o número é pequeno', () => {
    expect(formatScale(0.4)).toBe('1 m ≈ 2,5 px');
  });
});
