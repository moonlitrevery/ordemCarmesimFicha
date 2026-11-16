// Monta o mapa na ordem das camadas: chão → decalques → muros → paredes/aberturas →
// objetos → vegetação (copas por cima) → luz (sombras, AO, relevo).
import fs from 'fs';
import path from 'path';
import { circlePath, polyPath, Scene } from './scene';
import { drawBuildingInterior, drawRoof, deriveWalls, placeOpenings, wallBoxes } from './buildings';
import { polyBounds, rectPoly, segDist, type RectM, type Vec } from './geom';
import { applyLighting, type LightingStats } from './lighting';
import { hashString, Rng } from './rng';
import type { FeatureSpec, MapSpec, PropSpec } from './schema';
import { loadTexturesConfig, TextureBank } from './textures';
import { buildTerrain } from './terrain';
import { drawTerraces } from './terraces';
import { FEATURES } from './features';
import { drawProps, PROPS } from './props';
import { drawVegetation, VEGETATION } from './vegetation';
import { GROUND_DECOR, setScatterExclusion } from './decals';

export const MAX_SIDE = 4096;

/** Materiais de borda natural: entram esfiapados em vez de recortados. */
const NATURAL: Record<string, number> = {
  grass_short: 0.35,
  tall_grass_dry_mixed: 1.2,
  forest_floor_leaves: 1.2,
  garden_soil: 0.3,
  soil: 0.3,
  moss: 0.3,
};

export function seedFor(spec: MapSpec): number {
  if (typeof spec.seed === 'number') return spec.seed >>> 0;
  return hashString(spec.seed ?? spec.id);
}

export function effectivePpm(spec: MapSpec): { ppm: number; reduced: boolean } {
  const side = Math.max(spec.size_m[0], spec.size_m[1]) * spec.px_per_m;
  if (side <= MAX_SIDE) return { ppm: spec.px_per_m, reduced: false };
  return { ppm: Math.floor((MAX_SIDE / Math.max(spec.size_m[0], spec.size_m[1])) * 100) / 100, reduced: true };
}

/** Altura máxima que o canvas de alturas precisa representar (8 bits). */
function heightRange(spec: MapSpec): number {
  if (spec.vegetation.length) return 24;
  if (spec.buildings.some((b) => b.roof?.show !== false)) return 14;
  return 6;
}

export interface RenderResult {
  scene: Scene;
  seed: number;
  ppm: number;
  lighting: LightingStats;
  timings: Record<string, number>;
}

export interface RenderInput {
  spec: MapSpec;
  variant?: { id: string; props: PropSpec[]; features: FeatureSpec[]; remove: string[] };
  seedOverride?: number;
}

function usedMaterials(spec: MapSpec): Set<string> {
  const set = new Set<string>([
    'moss',
    'moss_dry',
    'wood_oak',
    'wood_weathered',
    'linen',
    'soil',
    'stone_grey',
    'basalt_rock',
    'basalt_cracked',
    'plaster_tufo_old',
    'terracotta_roof_old',
    'cobblestone_basalt',
    'drystone_wall_mossy',
  ]);
  spec.ground.forEach((g) => set.add(g.material));
  spec.terraces.forEach((t) => set.add(t.material));
  spec.buildings.forEach((b) => {
    if (b.wall) set.add(b.wall.material);
    if (b.roof?.material) set.add(b.roof.material);
    b.rooms?.forEach((r) => set.add(r.floor));
  });
  return set;
}

export async function renderMap(input: RenderInput): Promise<RenderResult> {
  const { spec } = input;
  const timings: Record<string, number> = {};
  let mark = performance.now();
  const lap = (name: string) => {
    const now = performance.now();
    timings[name] = Math.round(now - mark);
    mark = now;
  };

  const seed = input.seedOverride ?? seedFor(spec);
  const rng = new Rng(seed);
  const { ppm } = effectivePpm(spec);
  const tex = new TextureBank(loadTexturesConfig(), ppm, seed);
  await tex.preload(usedMaterials(spec));
  const scene = new Scene(spec.size_m[0], spec.size_m[1], ppm, heightRange(spec), tex, rng.fork('scene'));
  for (const name of tex.missing) scene.warn(`textura "${name}" não baixada (rode npm run maps:assets): usando tom liso`);
  lap('setup');

  const removed = new Set(input.variant?.remove ?? []);
  const props = [...spec.props, ...(input.variant?.props ?? [])].filter((p) => !p.id || !removed.has(p.id));
  const features = [...spec.features, ...(input.variant?.features ?? [])].filter((f) => !f.id || !removed.has(f.id));

  if (spec.terrain) scene.terrain = buildTerrain(scene, spec.terrain);

  // Muro, trilha e pedra ficam livres do detalhe de chão (tufos de capim etc.).
  for (const t of spec.terraces) {
    const [cx, cy] = t.arc_center;
    scene.keepClear.push((p) => {
      if (Math.abs(Math.hypot(p[0] - cx, p[1] - cy) - t.radius) > 0.6) return false;
      let a = (Math.atan2(-(p[1] - cy), p[0] - cx) * 180) / Math.PI;
      while (a < t.from_deg) a += 360;
      return a <= t.to_deg;
    });
  }
  for (const f of features) {
    if (f.path) {
      const pts = f.path as Vec[];
      const half = (f.width_m ?? 0.5) / 2 + 0.25;
      scene.keepClear.push((p) => pts.some((q, i) => i > 0 && segDist(p, pts[i - 1], q).d < half));
    }
    if (f.at && f.size) {
      const at = f.at as Vec;
      const r = Math.max(f.size[0], f.size[1]) / 2 + (f.moss_ground ? f.moss_ground.radius * 0.6 : 0.3);
      scene.keepClear.push((p) => Math.hypot(p[0] - at[0], p[1] - at[1]) < r);
    }
  }

  // 1. Chão: cada camada com o detalhe do material (tufos, flores, folhas), que
  // não nasce embaixo das camadas seguintes.
  const groundShapes = spec.ground.map((g) => {
    let path;
    let bounds: RectM;
    if (g.rect) {
      const poly = rectPoly(g.rect);
      path = polyPath(poly);
      bounds = polyBounds(poly);
    } else if (g.polygon) {
      path = polyPath(g.polygon as Vec[]);
      bounds = polyBounds(g.polygon as Vec[]);
    } else {
      const [cx, cy, r] = g.circle!;
      path = circlePath(cx, cy, r);
      bounds = [cx - r, cy - r, cx + r, cy + r];
    }
    return { path, bounds };
  });
  spec.ground.forEach((g, i) => {
    const { path, bounds } = groundShapes[i];
    const brightness = g.tint === 'lighter' ? 0.07 : g.tint === 'darker' ? -0.07 : 0;
    const full = bounds[0] <= 0 && bounds[1] <= 0 && bounds[2] >= spec.size_m[0] && bounds[3] >= spec.size_m[1];
    scene.material(path, bounds, g.material, {
      brightness,
      antiTile: true,
      feather: full ? 0 : NATURAL[g.material] ?? 0,
    });
    setScatterExclusion(groundShapes.slice(i + 1).map((s) => s.path));
    GROUND_DECOR[g.material]?.(scene, path, bounds, rng.fork(`ground:${i}`));
    setScatterExclusion([]);
  });
  lap('chão');

  // 2. Decalques (trilhas, marcas, limo no chão)
  for (const f of features) FEATURES[f.type]?.decal?.(scene, f, rng.fork(`decal:${f.id ?? f.type}`));
  lap('decalques');

  // 3. Muros de pedra / terraços
  drawTerraces(scene, spec.terraces, rng.fork('terraces'));
  lap('muros');

  // 4. Edificações (paredes e aberturas, ou telhado)
  for (const b of spec.buildings) {
    const br = rng.fork(`building:${b.id}`);
    if (b.roof?.show === false || (b.rooms?.length && b.roof === undefined)) {
      const walls = deriveWalls(b);
      placeOpenings(b, walls, scene);
      drawBuildingInterior(scene, b, walls, br);
      for (const box of wallBoxes(walls)) scene.walls.push(box);
    } else {
      drawRoof(scene, b, br);
      scene.occupied.push({ poly: b.footprint as Vec[], kind: 'building' });
    }
  }
  lap('edificações');

  // 5. Objetos (e features que são objeto: afloramento, fenda)
  await drawProps(scene, props, rng.fork('props'));
  for (const f of features) FEATURES[f.type]?.object?.(scene, f, rng.fork(`object:${f.id ?? f.type}`));
  lap('objetos');

  // 6. Vegetação, copa por cima de tudo
  drawVegetation(scene, spec.vegetation, rng.fork('vegetation'));
  lap('vegetação');

  // MAPS_DEBUG=1 salva as camadas antes da luz em maps/out/debug/.
  if (process.env.MAPS_DEBUG) {
    const dir = path.resolve('maps/out/debug');
    fs.mkdirSync(dir, { recursive: true });
    for (const layer of ['color', 'solid', 'ftop', 'fbot', 'indoor'] as const) {
      fs.writeFileSync(path.join(dir, `${spec.id}.${layer}.png`), scene[layer].toBuffer('image/png'));
    }
  }

  // 7. Luz
  const lighting = applyLighting(scene, spec.sun);
  lap('luz');

  return { scene, seed, ppm, lighting, timings };
}

export const REGISTRY = {
  props: PROPS,
  features: FEATURES,
  vegetation: VEGETATION,
};
