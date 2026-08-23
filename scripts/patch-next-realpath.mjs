import fs from 'fs';

const target =
  'node_modules/next/dist/lib/has-necessary-dependencies.js';

let s = fs.readFileSync(target, 'utf8');

if (s.includes('/* ordem-carmesim-realpath-patch */')) {
  console.log('patch already applied');
  process.exit(0);
}

const old = `const pkgPath = await _fs.promises.realpath((0, _resolvefrom.resolveFrom)(baseDir, \`\${p.pkg}/package.json\`));`;

const neu = `/* ordem-carmesim-realpath-patch */
            // fs.promises.realpath (native) can ENOENT on some Windows setups even when the file exists
            const pkgPath = (0, _resolvefrom.resolveFrom)(baseDir, \`\${p.pkg}/package.json\`);`;

if (!s.includes(old)) {
  console.error('Could not find patch target — Next.js version may differ');
  process.exit(1);
}

fs.writeFileSync(target, s.replace(old, neu));
console.log('patched has-necessary-dependencies.js');
