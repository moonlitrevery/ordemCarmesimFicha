// Schema do YAML de mapa. Erro sai com arquivo, linha e campo.
import { LineCounter, parseDocument, isNode } from 'yaml';
import { z } from 'zod';

z.config(z.locales.pt());

const num = z.number();
const vec = z.tuple([num, num]);
const rect = z.tuple([num, num, num, num]);
const circle = z.tuple([num, num, num]);
const side = z.enum(['north', 'south', 'east', 'west']);
const density = z.enum(['low', 'medium', 'high']);
const intensity = z.enum(['subtle', 'medium', 'strong']);

export const GroundSchema = z
  .strictObject({
    rect: rect.optional(),
    polygon: z.array(vec).min(3).optional(),
    circle: circle.optional(),
    material: z.string(),
    tint: z.enum(['lighter', 'darker']).optional(),
  })
  .refine((g) => [g.rect, g.polygon, g.circle].filter(Boolean).length === 1, {
    message: 'use exatamente um de rect, polygon ou circle',
  });

const OpeningBase = {
  wall: side.optional(),
  wall_x: num.optional(),
  wall_y: num.optional(),
  at_x: num.optional(),
  at_y: num.optional(),
  width: num.positive(),
};

const openingRefine = (o: { wall?: string; wall_x?: number; wall_y?: number; at_x?: number; at_y?: number }) =>
  (o.wall !== undefined || o.wall_x !== undefined || o.wall_y !== undefined) &&
  (o.at_x !== undefined || o.at_y !== undefined);

export const DOOR_TYPES = ['wood', 'swing', 'open', 'wood_glass_double', 'metal'] as const;

export const DoorSchema = z
  .strictObject({
    ...OpeningBase,
    between: z.tuple([z.string(), z.string()]).optional(),
    type: z.enum(DOOR_TYPES).default('wood'),
  })
  .refine(openingRefine, { message: 'porta precisa de wall (ou wall_x/wall_y) e at_x ou at_y' });

export const WindowSchema = z
  .strictObject(OpeningBase)
  .refine(openingRefine, { message: 'janela precisa de wall (ou wall_x/wall_y) e at_x ou at_y' });

export const BuildingSchema = z.strictObject({
  id: z.string(),
  footprint: z.array(vec).min(3),
  wall: z.strictObject({ thickness: num.positive().default(0.35), material: z.string() }).optional(),
  roof: z
    .strictObject({
      show: z.boolean().default(true),
      material: z.string().optional(),
      patch: z.string().optional(),
      pitch_deg: num.optional(),
    })
    .optional(),
  floors: z.number().int().min(1).max(6).optional(),
  rooms: z.array(z.strictObject({ name: z.string(), rect, floor: z.string() })).optional(),
  doors: z.array(DoorSchema).optional(),
  windows: z.array(WindowSchema).optional(),
});

export const PropSchema = z.strictObject({
  type: z.string(),
  id: z.string().optional(),
  at: vec.optional(),
  rot: num.optional(),
  rect: rect.optional(),
  path: z.array(vec).min(2).optional(),
  area: rect.optional(),
  from: vec.optional(),
  to: vec.optional(),
  along: z.array(vec).min(2).optional(),
  size: vec.optional(),
  width: num.positive().optional(),
  depth: num.positive().optional(),
  seats: z.number().int().min(0).max(8).optional(),
  items: z.array(z.string()).optional(),
  density: density.optional(),
  count: z.number().int().min(0).optional(),
  plants: z.array(z.string()).optional(),
  clothes: z.boolean().optional(),
  basin_radius: num.positive().optional(),
  moss: z.enum(['none', 'light', 'medium', 'heavy']).optional(),
  drip: z.boolean().optional(),
  on: z.string().optional(),
  note: z.string().optional(),
  direction: side.optional(),
});

export const FeatureSchema = z.strictObject({
  type: z.string(),
  id: z.string().optional(),
  at: vec.optional(),
  size: vec.optional(),
  rot: num.optional(),
  path: z.array(vec).min(2).optional(),
  width_m: num.positive().optional(),
  intensity: intensity.optional(),
  smooth_side: side.optional(),
  cracked_side: side.optional(),
  water: z
    .strictObject({
      from: vec,
      trickle_to: vec,
      width_m: num.positive().default(0.25),
      wet_glow: intensity.optional(),
    })
    .optional(),
  moss_ground: z
    .strictObject({
      radius: num.positive(),
      color: z.enum(['vivid_green', 'green', 'dark_green']).default('green'),
      always_wet: z.boolean().default(false),
    })
    .optional(),
  inner: z.enum(['dark_descending', 'dark']).optional(),
  warm_air_haze: intensity.optional(),
});

export const VegetationSchema = z
  .strictObject({
    type: z.string(),
    scatter_outside: circle.optional(),
    scatter_inside: circle.optional(),
    scatter_area: rect.optional(),
    density: density.optional(),
    count: z.number().int().min(0).optional(),
    size_m: vec.optional(),
  })
  .refine((v) => [v.scatter_outside, v.scatter_inside, v.scatter_area].filter(Boolean).length === 1, {
    message: 'use exatamente um de scatter_outside, scatter_inside ou scatter_area',
  });

export const TerraceSchema = z.strictObject({
  arc_center: vec,
  radius: num.positive(),
  from_deg: num,
  to_deg: num,
  material: z.string(),
  gaps: z.number().int().min(0).default(0),
  overgrowth: num.min(0).max(1).default(0.3),
  height_m: num.positive().default(0.9),
});

export const TerrainSchema = z.strictObject({
  type: z.literal('bowl'),
  center: vec,
  radius: num.positive(),
  depth_m: num.positive(),
  rim_open: side.optional(),
});

export const VariantSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9_-]+$/, 'só letras minúsculas, números, _ e -'),
  note: z.string().optional(),
  /** Itens de features ou props: o tipo decide. */
  add: z.array(z.record(z.string(), z.unknown())).optional(),
  /** Ids de features/props a tirar nesta variante. */
  remove: z.array(z.string()).optional(),
});

export const MapSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/, 'só letras minúsculas, números e -'),
  title: z.string(),
  visibility: z.enum(['mestra', 'jogadores']).default('mestra'),
  size_m: vec,
  px_per_m: num.positive(),
  seed: z.union([z.number().int(), z.string()]).optional(),
  sun: z
    .strictObject({ azimuth_deg: num, elevation_deg: num.min(5).max(90) })
    .default({ azimuth_deg: 135, elevation_deg: 40 }),
  terrain: TerrainSchema.optional(),
  ground: z.array(GroundSchema).min(1),
  buildings: z.array(BuildingSchema).default([]),
  terraces: z.array(TerraceSchema).default([]),
  props: z.array(PropSchema).default([]),
  vegetation: z.array(VegetationSchema).default([]),
  features: z.array(FeatureSchema).default([]),
  variants: z.array(VariantSchema).default([]),
});

export type MapSpec = z.infer<typeof MapSchema>;
export type GroundSpec = z.infer<typeof GroundSchema>;
export type BuildingSpec = z.infer<typeof BuildingSchema>;
export type DoorSpec = z.infer<typeof DoorSchema>;
export type WindowSpec = z.infer<typeof WindowSchema>;
export type PropSpec = z.infer<typeof PropSchema>;
export type FeatureSpec = z.infer<typeof FeatureSchema>;
export type VegetationSpec = z.infer<typeof VegetationSchema>;
export type TerraceSpec = z.infer<typeof TerraceSchema>;
export type TerrainSpec = z.infer<typeof TerrainSchema>;

export class SpecError extends Error {
  constructor(
    readonly file: string,
    readonly issues: string[]
  ) {
    super(`${file}: ${issues.length} erro(s)\n${issues.map((i) => `  - ${i}`).join('\n')}`);
  }
}

/** Registro de tipos conhecidos: quem desenha diz quais campos cada tipo exige. */
export interface TypeRegistry {
  props: Record<string, { needs: readonly (keyof PropSpec)[] }>;
  features: Record<string, { needs: readonly (keyof FeatureSpec)[] }>;
  vegetation: readonly string[];
  materials: readonly string[];
}

type Path = (string | number)[];

function formatPath(path: Path): string {
  return path.reduce<string>(
    (out, part) => (typeof part === 'number' ? `${out}[${part}]` : out ? `${out}.${part}` : part),
    ''
  );
}

export interface ParsedSpec {
  spec: MapSpec;
  /** Itens de variante já validados como prop ou feature. */
  variantItems: Map<string, { props: PropSpec[]; features: FeatureSpec[] }>;
}

export function parseSpec(file: string, text: string, registry: TypeRegistry): ParsedSpec {
  const lines = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lines, prettyErrors: false });
  const where = (path: Path) => {
    // Sobe até achar um nó que exista: campo faltando aponta para o objeto pai.
    for (let p = path.slice(); ; p = p.slice(0, -1)) {
      const node = p.length ? doc.getIn(p, true) : doc.contents;
      if (isNode(node) && node.range) {
        const pos = lines.linePos(node.range[0]);
        return `linha ${pos.line}`;
      }
      if (p.length === 0) return 'linha ?';
    }
  };
  if (doc.errors.length) {
    throw new SpecError(
      file,
      doc.errors.map((e) => `linha ${lines.linePos(e.pos[0]).line}: YAML inválido (${e.message.split('\n')[0]})`)
    );
  }

  const issues: string[] = [];
  const report = (path: Path, message: string) =>
    issues.push(`${where(path)} — ${formatPath(path) || '(raiz)'}: ${message}`);

  const parsed = MapSchema.safeParse(doc.toJS());
  if (!parsed.success) {
    for (const issue of parsed.error.issues) report(issue.path as Path, issue.message);
    throw new SpecError(file, issues);
  }
  const spec = parsed.data;

  const known = (list: string[]) => list.sort().join(', ');
  const checkMaterial = (path: Path, material: string | undefined) => {
    if (material && !registry.materials.includes(material)) {
      report(path, `material desconhecido "${material}" (veja maps/assets/textures.json)`);
    }
  };
  spec.ground.forEach((g, i) => checkMaterial(['ground', i, 'material'], g.material));
  spec.terraces.forEach((t, i) => checkMaterial(['terraces', i, 'material'], t.material));
  spec.buildings.forEach((b, i) => {
    checkMaterial(['buildings', i, 'wall', 'material'], b.wall?.material);
    checkMaterial(['buildings', i, 'roof', 'material'], b.roof?.material);
    b.rooms?.forEach((r, j) => checkMaterial(['buildings', i, 'rooms', j, 'floor'], r.floor));
    const roomNames = new Set(['outside', ...(b.rooms ?? []).map((r) => r.name)]);
    b.doors?.forEach((d, j) =>
      d.between?.forEach((name, k) => {
        if (!roomNames.has(name)) report(['buildings', i, 'doors', j, 'between', k], `cômodo "${name}" não existe`);
      })
    );
  });

  const checkProp = (path: Path, prop: PropSpec) => {
    const def = registry.props[prop.type];
    if (!def) {
      report([...path, 'type'], `tipo de objeto desconhecido "${prop.type}". Conhecidos: ${known(Object.keys(registry.props))}`);
      return;
    }
    for (const field of def.needs) {
      if (prop[field] === undefined) report(path, `"${prop.type}" precisa do campo ${String(field)}`);
    }
  };
  const checkFeature = (path: Path, feature: FeatureSpec) => {
    const def = registry.features[feature.type];
    if (!def) {
      report([...path, 'type'], `tipo de feature desconhecido "${feature.type}". Conhecidos: ${known(Object.keys(registry.features))}`);
      return;
    }
    for (const field of def.needs) {
      if (feature[field] === undefined) report(path, `"${feature.type}" precisa do campo ${String(field)}`);
    }
  };
  spec.props.forEach((p, i) => checkProp(['props', i], p));
  spec.features.forEach((f, i) => checkFeature(['features', i], f));
  spec.vegetation.forEach((v, i) => {
    if (!registry.vegetation.includes(v.type)) {
      report(['vegetation', i, 'type'], `vegetação desconhecida "${v.type}". Conhecidas: ${known([...registry.vegetation])}`);
    }
  });

  const variantItems = new Map<string, { props: PropSpec[]; features: FeatureSpec[] }>();
  spec.variants.forEach((v, i) => {
    const items = { props: [] as PropSpec[], features: [] as FeatureSpec[] };
    v.add?.forEach((raw, j) => {
      const path: Path = ['variants', i, 'add', j];
      const type = typeof raw.type === 'string' ? raw.type : '';
      const asFeature = type in registry.features;
      const result = (asFeature ? FeatureSchema : PropSchema).safeParse(raw);
      if (!result.success) {
        for (const issue of result.error.issues) report([...path, ...(issue.path as Path)], issue.message);
        return;
      }
      if (asFeature) {
        checkFeature(path, result.data as FeatureSpec);
        items.features.push(result.data as FeatureSpec);
      } else {
        checkProp(path, result.data as PropSpec);
        items.props.push(result.data as PropSpec);
      }
    });
    variantItems.set(v.id, items);
  });

  if (issues.length) throw new SpecError(file, issues);
  return { spec, variantItems };
}
