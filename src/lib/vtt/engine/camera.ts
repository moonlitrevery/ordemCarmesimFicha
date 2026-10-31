export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function screenToWorld(
  camera: Camera,
  sx: number,
  sy: number
): { x: number; y: number } {
  return { x: (sx - camera.x) / camera.zoom, y: (sy - camera.y) / camera.zoom };
}

export function worldToScreen(
  camera: Camera,
  wx: number,
  wy: number
): { x: number; y: number } {
  return { x: wx * camera.zoom + camera.x, y: wy * camera.zoom + camera.y };
}

/** O ponto do mundo sob (sx, sy) continua sob (sx, sy) depois do zoom. */
export function zoomAt(
  camera: Camera,
  nextZoom: number,
  sx: number,
  sy: number
): Camera {
  const zoom = clampZoom(nextZoom);
  const world = screenToWorld(camera, sx, sy);
  return { zoom, x: sx - world.x * zoom, y: sy - world.y * zoom };
}

/** Dois dedos: o ponto sob o centro antigo vai para o centro novo. */
export function pinch(
  camera: Camera,
  from: { cx: number; cy: number; distance: number },
  to: { cx: number; cy: number; distance: number }
): Camera {
  const zoom = clampZoom(camera.zoom * (to.distance / (from.distance || 1)));
  const world = screenToWorld(camera, from.cx, from.cy);
  return { zoom, x: to.cx - world.x * zoom, y: to.cy - world.y * zoom };
}

/** Mapa inteiro centralizado na tela, sem ampliar além de 100%. */
export function fitMap(
  mapWidth: number,
  mapHeight: number,
  viewWidth: number,
  viewHeight: number
): Camera {
  const zoom = clampZoom(Math.min(1, viewWidth / mapWidth, viewHeight / mapHeight));
  return {
    zoom,
    x: (viewWidth - mapWidth * zoom) / 2,
    y: (viewHeight - mapHeight * zoom) / 2,
  };
}
