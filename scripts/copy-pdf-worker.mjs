// O worker do pdf.js vai direto para public/: pelo webpack, o Terser do Next 14
// tenta minificar o .mjs como script comum e o build quebra. Sai com a versão no
// nome, e `PdfView` monta o mesmo caminho a partir de `pdfjs.version`.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = path.join(root, 'node_modules', 'pdfjs-dist');
const outDir = path.join(root, 'public', 'pdfjs');
const { version } = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
const name = `pdf.worker-${version}.min.mjs`;

mkdirSync(outDir, { recursive: true });
for (const file of readdirSync(outDir)) {
  if (file !== name) rmSync(path.join(outDir, file));
}
copyFileSync(path.join(pkgDir, 'legacy', 'build', 'pdf.worker.min.mjs'), path.join(outDir, name));
