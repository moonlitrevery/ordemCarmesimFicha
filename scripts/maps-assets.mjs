// Baixa as texturas CC0 de maps/assets/textures.json para maps/assets/textures/.
// Uso: npm run maps:assets [-- --force]
// Cada textura vira <nome>.jpg (cor) e, quando a fonte tem, <nome>_ao.jpg (oclusão).
import fs from 'fs/promises';
import path from 'path';
import { unzip } from './lib/unzip.mjs';

const root = path.resolve('maps/assets');
const outDir = path.join(root, 'textures');
const force = process.argv.includes('--force');
const RESOLUTION = '1k';
const CONCURRENCY = 4;
const UA = { 'User-Agent': 'ordem-carmesim-maps/1.0' };

async function exists(file) {
  return fs.stat(file).then(
    () => true,
    () => false
  );
}

async function get(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} em ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function fromPolyHaven(id) {
  const files = JSON.parse((await get(`https://api.polyhaven.com/files/${id}`)).toString('utf8'));
  const color = files.Diffuse?.[RESOLUTION]?.jpg?.url;
  if (!color) throw new Error(`Poly Haven ${id}: sem Diffuse ${RESOLUTION}`);
  const ao = files.AO?.[RESOLUTION]?.jpg?.url;
  return { color: await get(color), ao: ao ? await get(ao) : null };
}

async function fromAmbientCg(id) {
  const zip = unzip(await get(`https://ambientcg.com/get?file=${id}_${RESOLUTION.toUpperCase()}-JPG.zip`));
  const pick = (suffix) => Object.entries(zip).find(([name]) => name.endsWith(suffix))?.[1] ?? null;
  const color = pick('_Color.jpg');
  if (!color) throw new Error(`ambientCG ${id}: zip sem _Color.jpg`);
  return { color, ao: pick('_AmbientOcclusion.jpg') };
}

const SOURCES = { polyhaven: fromPolyHaven, ambientcg: fromAmbientCg };

async function fetchOne(name, entry) {
  const colorFile = path.join(outDir, `${name}.jpg`);
  if (!force && (await exists(colorFile))) return 'já existe';
  const source = SOURCES[entry.source];
  if (!source) throw new Error(`fonte desconhecida "${entry.source}"`);
  const { color, ao } = await source(entry.id);
  await fs.writeFile(colorFile, color);
  if (ao) await fs.writeFile(path.join(outDir, `${name}_ao.jpg`), ao);
  return `baixada (${Math.round((color.length + (ao?.length ?? 0)) / 1024)} KB)`;
}

async function main() {
  const config = JSON.parse(await fs.readFile(path.join(root, 'textures.json'), 'utf8'));
  await fs.mkdir(outDir, { recursive: true });
  const queue = Object.entries(config.textures);
  let failed = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const [name, entry] = job;
      try {
        console.log(`[maps:assets] ${name}: ${await fetchOne(name, entry)}`);
      } catch (error) {
        failed++;
        console.error(`[maps:assets] ${name}: falhou (${error.message})`);
      }
    }
  });
  await Promise.all(workers);
  if (failed) {
    console.error(`[maps:assets] ${failed} textura(s) falharam. O gerador usa um tom liso no lugar delas.`);
    process.exitCode = 1;
  }
}

await main();
