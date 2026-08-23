import fs from 'fs';

// Windows-only workaround for Next.js realpath ENOENT; never fail Linux/Vercel builds.
if (process.platform !== 'win32') {
  process.exit(0);
}

const target = 'node_modules/next/dist/lib/has-necessary-dependencies.js';

if (!fs.existsSync(target)) {
  console.warn(
    '[patch-next-realpath] target not found — skipping (Next.js layout may differ)'
  );
  process.exit(0);
}

let s;
try {
  s = fs.readFileSync(target, 'utf8');
} catch (err) {
  console.warn('[patch-next-realpath] could not read target — skipping:', err);
  process.exit(0);
}

if (s.includes('/* ordem-carmesim-realpath-patch */')) {
  console.log('[patch-next-realpath] already applied');
  process.exit(0);
}

const old = `const pkgPath = await _fs.promises.realpath((0, _resolvefrom.resolveFrom)(baseDir, \`\${p.pkg}/package.json\`));`;

const neu = `/* ordem-carmesim-realpath-patch */
            // fs.promises.realpath (native) can ENOENT on some Windows setups even when the file exists
            const pkgPath = (0, _resolvefrom.resolveFrom)(baseDir, \`\${p.pkg}/package.json\`);`;

if (!s.includes(old)) {
  console.warn(
    '[patch-next-realpath] Could not find patch target — Next.js version may differ; continuing without patch'
  );
  process.exit(0);
}

try {
  fs.writeFileSync(target, s.replace(old, neu));
  console.log('[patch-next-realpath] patched has-necessary-dependencies.js');
} catch (err) {
  console.warn('[patch-next-realpath] write failed — continuing:', err);
  process.exit(0);
}
