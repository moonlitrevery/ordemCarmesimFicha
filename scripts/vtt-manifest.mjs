// Gera generated/vtt-manifest.json e public/vtt/_built/ (SPEC §6).
// Uso: node scripts/vtt-manifest.mjs [pasta, padrão public/vtt] [manifest de saída]
import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { parseFile } from 'music-metadata';
import sharp from 'sharp';

const root = path.resolve(process.argv[2] ?? 'public/vtt');
const manifestPath = path.resolve(process.argv[3] ?? 'generated/vtt-manifest.json');
const BUILT_DIR = '_built';
const PLAYER_DIR = 'jogadores';
const THUMB_SIDE = 96;
const IMAGE_QUALITY = 85;
const THUMB_QUALITY = 75;
const MB = 1024 * 1024;

const IMAGE_EXTENSIONS = ['.webp', '.png', '.jpg', '.jpeg'];
const AUDIO_MIMES = {
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
};

// Espelha maxSideForKind e os limites de src/lib/vtt/assets/rules.ts.
const FOLDERS = {
  mapas: { kind: 'mapa', image: true, maxSide: 4096, maxBytes: 15 * MB },
  tokens: { kind: 'token', image: true, maxSide: 512, maxBytes: 15 * MB },
  addons: { kind: 'addon', image: true, maxSide: 512, maxBytes: 15 * MB },
  'adereços': { kind: 'adereco', image: true, maxSide: 1024, maxBytes: 15 * MB },
  'sons-ambiente': { kind: 'audio_ambiente', image: false, maxBytes: 8 * MB },
  sfx: { kind: 'audio_sfx', image: false, maxBytes: 8 * MB },
};

// Namespace próprio: o id só depende do caminho, então sobrevive a novos builds.
const ID_NAMESPACE = Buffer.from('6f1d0c3e8a2b4f5c9e7d1a3b5c7d9e0f', 'hex');

function stableId(idPath) {
  const hash = createHash('sha1').update(ID_NAMESPACE).update(idPath).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function contentHash(buffer, salt) {
  return createHash('sha256').update(buffer).update(salt).digest('hex').slice(0, 32);
}

function nameFromFile(fileName) {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  return (base || 'Sem nome').slice(0, 120);
}

function relativeTo(base, file) {
  return path.relative(base, file).split(path.sep).join('/').normalize('NFC');
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith('.'))
      .map((entry) => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? walk(full) : [full];
      })
  );
  return files.flat();
}

async function exists(file) {
  return fs.stat(file).then(
    () => true,
    () => false
  );
}

/** Nome vem do conteúdo: arquivo já gerado não precisa ser refeito. */
async function buildOnce(name, keep, produce) {
  keep.add(name);
  const target = path.join(root, BUILT_DIR, name);
  if (!(await exists(target))) await fs.writeFile(target, await produce());
  return target;
}

function encodeWebp(buffer, side, quality) {
  return sharp(buffer)
    .rotate()
    .resize(side, side, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();
}

async function buildImage(buffer, config, keep) {
  const meta = await sharp(buffer).metadata();
  // O limite entra no hash: o mesmo arquivo em duas pastas sai em tamanhos diferentes.
  const hash = contentHash(buffer, `image:${config.maxSide}`);
  const fits = Math.max(meta.width, meta.height) <= config.maxSide;
  // WebP que já cabe é copiado: reencodar só perderia qualidade.
  const reusable = fits && meta.format === 'webp' && (meta.orientation ?? 1) === 1;

  const name = `${hash}.webp`;
  const target = await buildOnce(name, keep, () =>
    reusable ? buffer : encodeWebp(buffer, config.maxSide, IMAGE_QUALITY)
  );
  const built = await sharp(target).metadata();

  // O tamanho vai no nome: senão o build reaproveitaria a miniatura de outro tamanho.
  const thumb = `${hash}-t${THUMB_SIDE}.webp`;
  await buildOnce(thumb, keep, () => encodeWebp(buffer, THUMB_SIDE, THUMB_QUALITY));
  return {
    name,
    target,
    thumb,
    resized: !fits,
    mime: 'image/webp',
    width: built.width,
    height: built.height,
    duration_s: null,
  };
}

async function buildAudio(file, buffer, keep) {
  const extension = path.extname(file).toLowerCase();
  const name = `${contentHash(buffer, 'audio')}${extension}`;
  const target = await buildOnce(name, keep, () => buffer);
  return {
    name,
    target,
    thumb: null,
    resized: false,
    mime: AUDIO_MIMES[extension],
    width: null,
    height: null,
    duration_s: (await parseFile(file, { duration: true })).format.duration ?? null,
  };
}

async function readEntry(file, folder, config, visibility, keep) {
  const relativePath = relativeTo(root, file);
  const extension = path.extname(file).toLowerCase();
  const accepted = config.image ? IMAGE_EXTENSIONS.includes(extension) : AUDIO_MIMES[extension];
  if (!accepted) {
    console.warn(`[vtt:manifest] ${relativePath}: formato não aceito em ${folder}/, ignorado`);
    return null;
  }

  try {
    const buffer = await fs.readFile(file);
    const built = config.image
      ? await buildImage(buffer, config, keep)
      : await buildAudio(file, buffer, keep);
    const { size } = await fs.stat(built.target);
    if (built.resized) {
      console.log(`[vtt:manifest] ${relativePath}: reduzido para ${built.width}x${built.height}`);
    }
    if (size > config.maxBytes) {
      console.warn(`[vtt:manifest] ${relativePath}: maior que ${config.maxBytes / MB} MB na saída`);
    }
    return {
      // Sem o prefixo jogadores/: liberar o arquivo não quebra o que já está em cena.
      idPath: relativePath.replace(new RegExp(`^${PLAYER_DIR}/`), ''),
      item: {
        kind: config.kind,
        name: nameFromFile(path.basename(relativePath)),
        visibility,
        path: `/vtt/${BUILT_DIR}/${built.name}`,
        thumb: built.thumb ? `/vtt/${BUILT_DIR}/${built.thumb}` : null,
        mime: built.mime,
        size_bytes: size,
        width: built.width,
        height: built.height,
        duration_s: built.duration_s,
      },
    };
  } catch (error) {
    // Arquivo corrompido não derruba o deploy: só fica de fora da biblioteca.
    console.warn(`[vtt:manifest] ${relativePath}: não deu para ler, ignorado (${error.message})`);
    return null;
  }
}

async function main() {
  const builtRoot = path.join(root, BUILT_DIR);
  await fs.mkdir(builtRoot, { recursive: true });

  const keep = new Set();
  const byId = new Map();
  // Só da mestra primeiro: se o mesmo caminho existir nos dois lados, o restrito vence.
  for (const [prefix, visibility] of [
    ['', 'mestre'],
    [PLAYER_DIR, 'jogadores'],
  ]) {
    for (const [folder, config] of Object.entries(FOLDERS)) {
      const files = await walk(path.join(root, prefix, folder));
      for (const file of files) {
        const entry = await readEntry(file, folder, config, visibility, keep);
        if (!entry) continue;
        if (byId.has(entry.idPath)) {
          console.warn(`[vtt:manifest] ${entry.idPath}: existe nos dois lados, vale o da mestra`);
          continue;
        }
        byId.set(entry.idPath, entry.item);
      }
    }
  }

  const stale = (await walk(builtRoot)).filter((file) => !keep.has(relativeTo(builtRoot, file)));
  await Promise.all(stale.map((file) => fs.rm(file)));

  // Ordem fixa: o manifest só muda quando os arquivos mudam.
  const items = [...byId.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([idPath, item]) => ({ id: stableId(idPath), ...item }));

  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, `${JSON.stringify({ items }, null, 2)}\n`);
  console.log(`[vtt:manifest] ${items.length} arquivo(s) na biblioteca estática.`);
}

await main();
