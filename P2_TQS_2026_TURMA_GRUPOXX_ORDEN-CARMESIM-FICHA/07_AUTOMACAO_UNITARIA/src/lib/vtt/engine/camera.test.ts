import { describe, expect, it } from 'vitest';
import {
  fitMap,
  MAX_ZOOM,
  MIN_ZOOM,
  pinch,
  screenToWorld,
  worldToScreen,
  zoomAt,
} from './camera';

describe('camera', () => {
  it('tela e mundo são inversos', () => {
    const cam = { x: 30, y: -10, zoom: 2 };
    const w = screenToWorld(cam, 100, 50);
    expect(worldToScreen(cam, w.x, w.y)).toEqual({ x: 100, y: 50 });
  });

  it('zoom mantém o ponto sob o cursor', () => {
    const cam = { x: 30, y: -10, zoom: 2 };
    const before = screenToWorld(cam, 200, 120);
    const after = screenToWorld(zoomAt(cam, 3, 200, 120), 200, 120);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('respeita os limites', () => {
    const cam = { x: 0, y: 0, zoom: 1 };
    expect(zoomAt(cam, 999, 0, 0).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(cam, 0, 0, 0).zoom).toBe(MIN_ZOOM);
  });

  it('pinça move e amplia', () => {
    const cam = { x: 0, y: 0, zoom: 1 };
    const next = pinch(
      cam,
      { cx: 100, cy: 100, distance: 50 },
      { cx: 120, cy: 100, distance: 100 }
    );
    expect(next.zoom).toBe(2);
    const w = screenToWorld(next, 120, 100);
    expect(w.x).toBeCloseTo(100);
    expect(w.y).toBeCloseTo(100);
  });

  it('centraliza o mapa sem passar de 100%', () => {
    expect(fitMap(4000, 2000, 1000, 1000)).toEqual({ zoom: 0.25, x: 0, y: 250 });
    expect(fitMap(100, 100, 500, 500)).toEqual({ zoom: 1, x: 200, y: 200 });
  });
});
