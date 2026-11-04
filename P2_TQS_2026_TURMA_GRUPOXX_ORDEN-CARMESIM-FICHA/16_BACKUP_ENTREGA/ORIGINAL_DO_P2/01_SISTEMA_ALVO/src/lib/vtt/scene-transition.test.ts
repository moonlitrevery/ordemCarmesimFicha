import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_COVER_MS,
  parseSceneTransition,
  SceneTransition,
  transitionTiming,
  type SceneTransitionView,
} from './scene-transition';

describe('parseSceneTransition', () => {
  it('valor desconhecido vira fade', () => {
    expect(parseSceneTransition('simbolo')).toBe('simbolo');
    expect(parseSceneTransition('corte')).toBe('corte');
    expect(parseSceneTransition('outro')).toBe('fade');
    expect(parseSceneTransition(undefined)).toBe('fade');
  });
});

describe('transitionTiming', () => {
  const total = ({ coverMs, holdMs, revealMs }: ReturnType<typeof transitionTiming>) =>
    coverMs + holdMs + revealMs;

  it('fade ~0,8 s e símbolo ~1,5 s', () => {
    expect(total(transitionTiming('fade', false))).toBe(800);
    expect(total(transitionTiming('simbolo', false))).toBe(1500);
  });

  it('modo leve é mais curto', () => {
    expect(total(transitionTiming('fade', true))).toBeLessThan(800);
    expect(total(transitionTiming('simbolo', true))).toBeLessThan(1500);
  });
});

describe('SceneTransition', () => {
  let views: (SceneTransitionView | null)[];
  let transition: SceneTransition;
  const lastPhase = () => views[views.length - 1]?.phase ?? null;

  beforeEach(() => {
    vi.useFakeTimers();
    views = [];
    transition = new SceneTransition((view) => views.push(view));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('corte não cobre nada', async () => {
    await transition.begin('corte', false);
    expect(views).toEqual([]);
  });

  it('cobre, espera a cena e revela', async () => {
    let loaded = () => undefined as void;
    const ready = new Promise<void>((resolve) => {
      loaded = resolve;
    });
    transition.begin('fade', false);
    expect(lastPhase()).toBe('cover');
    await vi.advanceTimersByTimeAsync(300);
    expect(lastPhase()).toBe('hold');

    transition.finishWhen(ready);
    await vi.advanceTimersByTimeAsync(1000);
    expect(lastPhase()).toBe('hold');

    loaded();
    await vi.advanceTimersByTimeAsync(0);
    expect(lastPhase()).toBe('reveal');
    await vi.advanceTimersByTimeAsync(500);
    expect(lastPhase()).toBe(null);
  });

  it('símbolo fica o tempo mínimo mesmo com a cena pronta', async () => {
    transition.begin('simbolo', false);
    await vi.advanceTimersByTimeAsync(300);
    transition.finishWhen(Promise.resolve());
    await vi.advanceTimersByTimeAsync(699);
    expect(lastPhase()).toBe('hold');
    await vi.advanceTimersByTimeAsync(1);
    expect(lastPhase()).toBe('reveal');
  });

  it('textura que nunca chega não prende no preto', async () => {
    transition.begin('fade', false);
    transition.finishWhen(new Promise(() => undefined));
    await vi.advanceTimersByTimeAsync(300 + MAX_COVER_MS + 1);
    expect(lastPhase()).toBe('reveal');
  });

  it('falha ao carregar também revela', async () => {
    transition.begin('fade', false);
    await vi.advanceTimersByTimeAsync(300);
    transition.finishWhen(Promise.reject(new Error('rede')));
    await vi.advanceTimersByTimeAsync(0);
    expect(lastPhase()).toBe('reveal');
  });

  it('begin repetido é a mesma transição', async () => {
    const first = transition.begin('fade', false);
    await vi.advanceTimersByTimeAsync(100);
    expect(transition.begin('fade', false)).toBe(first);
    expect(views).toHaveLength(1);
  });

  it('nova troca enquanto revela cobre de novo', async () => {
    transition.begin('fade', false);
    await vi.advanceTimersByTimeAsync(300);
    transition.reveal();
    await vi.advanceTimersByTimeAsync(0);
    expect(lastPhase()).toBe('reveal');

    transition.begin('fade', false);
    expect(lastPhase()).toBe('cover');
    await vi.advanceTimersByTimeAsync(500);
    expect(lastPhase()).toBe('hold');
  });

  it('parar limpa tudo', async () => {
    transition.begin('fade', false);
    transition.stop();
    expect(lastPhase()).toBe(null);
    await vi.advanceTimersByTimeAsync(10000);
    expect(lastPhase()).toBe(null);
  });
});
