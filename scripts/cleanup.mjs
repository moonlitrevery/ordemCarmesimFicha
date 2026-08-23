import fs from 'fs';
import path from 'path';

// Fix next.config content alias to root ./content
let nc = fs.readFileSync('next.config.mjs', 'utf8');
nc = nc.replace(
  "path.join(src, 'content')",
  "path.join(__dirname, 'content')"
);
fs.writeFileSync('next.config.mjs', nc);

// Sync elementos mdx from src if present
const srcMdx = 'src/content/regras/elementos-e-fragmentos.mdx';
const rootMdx = 'content/regras/elementos-e-fragmentos.mdx';
if (fs.existsSync(srcMdx)) {
  fs.copyFileSync(srcMdx, rootMdx);
}

// Remove duplicates
for (const p of ['src/content', 'lib', 'types']) {
  fs.rmSync(p, { recursive: true, force: true });
}

// Dice labels
for (const f of [
  'src/components/dice/DiceRoller.tsx',
  'src/components/dice/FloatingDiceButton.tsx',
]) {
  let s = fs.readFileSync(f, 'utf8');
  s = s.replace(/>D</g, '>Dados<');
  fs.writeFileSync(f, s);
}

// README note
let r = fs.readFileSync('README.md', 'utf8');
if (!r.includes('patch-next-realpath')) {
  r +=
    '\n## Nota Windows\n\nNeste ambiente, o build do Next.js pode falhar no `realpath` nativo. O script `scripts/patch-next-realpath.mjs` (rodado no `postinstall`/`dev`/`build`) corrige isso automaticamente.\n';
  fs.writeFileSync('README.md', r);
}

// Ensure content files exist
const lore = [
  'historia',
  'estrutura',
  'cargos',
  'planos-de-existencia',
  'lideres',
];
for (const slug of lore) {
  const p = path.join('content/lore', slug + '.mdx');
  if (!fs.existsSync(p)) console.warn('missing', p);
}

console.log('cleanup done');
console.log(fs.readFileSync('next.config.mjs', 'utf8'));
