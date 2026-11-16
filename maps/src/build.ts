// Lê o YAML, valida, gera o mapa (e cada variante) e exporta WebP + meta.json.
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { parseSpec, SpecError, type MapSpec, type TypeRegistry } from './schema';
import { effectivePpm, REGISTRY, renderMap } from './render';
import { loadTexturesConfig } from './textures';

export const SPECS_DIR = path.resolve('maps/specs');
export const OUT_DIR = path.resolve('maps/out');

/** Onde a Mesa lê: pasta só da mestra ou liberada para jogadores. */
export function publicDir(spec: MapSpec): string {
  return spec.visibility === 'jogadores'
    ? path.resolve('public/vtt/jogadores/mapas/cineres')
    : path.resolve('public/vtt/mapas/cineres');
}

export function typeRegistry(): TypeRegistry {
  return {
    props: Object.fromEntries(Object.entries(REGISTRY.props).map(([k, v]) => [k, { needs: v.needs }])),
    features: Object.fromEntries(Object.entries(REGISTRY.features).map(([k, v]) => [k, { needs: v.needs }])),
    vegetation: REGISTRY.vegetation,
    materials: Object.keys(loadTexturesConfig().materials),
  };
}

export function listSpecFiles(): string[] {
  return fs
    .readdirSync(SPECS_DIR)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => path.join(SPECS_DIR, f))
    .sort();
}

/** Acha o YAML pelo id do mapa ou pelo nome do arquivo. */
export function findSpecFile(target: string): string | null {
  for (const file of listSpecFiles()) {
    const stem = path.basename(file).replace(/\.ya?ml$/, '');
    if (stem === target) return file;
    const id = /^id:\s*([\w-]+)/m.exec(fs.readFileSync(file, 'utf8'))?.[1];
    if (id === target) return file;
  }
  return null;
}

export interface BuildOutput {
  id: string;
  variant: string | null;
  file: string;
  bytes: number;
  width: number;
  height: number;
  ms: number;
  timings: Record<string, number>;
  warnings: string[];
}

export interface BuildOptions {
  seed?: number;
  png?: boolean;
  only?: string | null;
  log?: (line: string) => void;
}

export async function buildFile(file: string, opts: BuildOptions = {}): Promise<BuildOutput[]> {
  const log = opts.log ?? console.log;
  const rel = path.relative(process.cwd(), file);
  const { spec, variantItems } = parseSpec(rel, fs.readFileSync(file, 'utf8'), typeRegistry());
  const { ppm, reduced } = effectivePpm(spec);
  if (reduced) {
    log(`[maps] ${spec.id}: ${spec.size_m.join('×')} m a ${spec.px_per_m} px/m passa de 4096 px; usando ${ppm} px/m`);
  }

  const jobs: { variant: string | null; note?: string }[] = [{ variant: null }];
  for (const v of spec.variants) {
    const items = variantItems.get(v.id);
    const changes = (items?.props.length ?? 0) + (items?.features.length ?? 0) + (v.remove?.length ?? 0);
    if (!changes) {
      log(`[maps] ${spec.id}.${v.id}: sem mudanças no mapa, não gerada${v.note ? ` (${v.note})` : ''}`);
      continue;
    }
    jobs.push({ variant: v.id });
  }

  const results: BuildOutput[] = [];
  for (const job of jobs) {
    if (opts.only && (job.variant ?? 'base') !== opts.only) continue;
    const t0 = performance.now();
    const items = job.variant ? variantItems.get(job.variant)! : null;
    const remove = job.variant ? spec.variants.find((v) => v.id === job.variant)?.remove ?? [] : [];
    const result = await renderMap({
      spec,
      variant: items && job.variant ? { id: job.variant, props: items.props, features: items.features, remove } : undefined,
      seedOverride: opts.seed,
    });
    const { scene } = result;
    const raw = scene.color.getContext('2d').getImageData(0, 0, scene.W, scene.H).data;
    const name = job.variant ? `${spec.id}.${job.variant}` : spec.id;
    const dir = publicDir(spec);
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const image = () => sharp(Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength), { raw: { width: scene.W, height: scene.H, channels: 4 } }).removeAlpha();
    const target = path.join(dir, `${name}.webp`);
    await image().webp({ quality: 86, effort: 4, smartSubsample: true }).toFile(target);
    await image().resize(1600, 1600, { fit: 'inside' }).jpeg({ quality: 82 }).toFile(path.join(OUT_DIR, `${name}.preview.jpg`));
    if (opts.png) await image().png({ compressionLevel: 6 }).toFile(path.join(OUT_DIR, `${name}.png`));
    const meta = {
      id: spec.id,
      title: spec.title,
      variant: job.variant,
      seed: result.seed,
      size_m: spec.size_m,
      px_per_m: result.ppm,
      meters_per_px: 1 / result.ppm,
      width: scene.W,
      height: scene.H,
    };
    fs.writeFileSync(path.join(dir, `${name}.meta.json`), `${JSON.stringify(meta, null, 2)}\n`);
    const ms = Math.round(performance.now() - t0);
    const bytes = fs.statSync(target).size;
    results.push({ id: spec.id, variant: job.variant, file: target, bytes, width: scene.W, height: scene.H, ms, timings: result.timings, warnings: scene.warnings });
    log(`[maps] ${name}: ${scene.W}×${scene.H} px, ${(bytes / 1024 / 1024).toFixed(2)} MB, ${(ms / 1000).toFixed(1)} s → ${path.relative(process.cwd(), target)}`);
    log(`[maps]   tempos (ms): ${Object.entries(result.timings).map(([k, v]) => `${k} ${v}`).join(' · ')} (grade de sombra 1:${result.lighting.gridFactor})`);
    for (const w of scene.warnings) log(`[maps]   aviso: ${w}`);
  }
  return results;
}

export function formatError(error: unknown): string {
  if (error instanceof SpecError) return error.message;
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}
