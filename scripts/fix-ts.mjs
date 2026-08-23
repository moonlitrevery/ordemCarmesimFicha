import fs from 'fs';

fs.writeFileSync(
  'tsconfig.json',
  JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2017',
        lib: ['dom', 'dom.iterable', 'esnext'],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: 'esnext',
        moduleResolution: 'bundler',
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: 'preserve',
        incremental: true,
        plugins: [{ name: 'next' }],
        paths: {
          '@/*': ['./src/*'],
        },
      },
      include: [
        'next-env.d.ts',
        '**/*.ts',
        '**/*.tsx',
        '**/*.mdx',
        '.next/types/**/*.ts',
      ],
      exclude: ['node_modules', 'lib', 'scripts'],
    },
    null,
    2
  )
);

// Fix calculations - restore LEVEL_MILESTONES import
for (const p of ['src/lib/calculations.ts', 'lib/calculations.ts']) {
  if (!fs.existsSync(p)) continue;
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes('LEVEL_MILESTONES,')) {
    s = s.replace(
      `import {
  FRAGMENT_COST,
  MAX_CHARACTER_LEVEL,`,
      `import {
  FRAGMENT_COST,
  LEVEL_MILESTONES,
  MAX_CHARACTER_LEVEL,`
    );
  }
  // also ensure type import exists
  if (!s.includes('import type { LevelMilestone }')) {
    s = s.replace(
      "from '@/lib/constants';",
      "from '@/lib/constants';\nimport type { LevelMilestone } from '@/lib/constants';"
    );
  }
  fs.writeFileSync(p, s);
  console.log('fixed', p);
}

// Fix fichas page Set/Map iteration
const fichas = 'src/app/fichas/page.tsx';
let f = fs.readFileSync(fichas, 'utf8');
f = f.replace(
  'const ownerIds = [...new Set(list.map((c) => c.owner_id))];',
  'const ownerIds = Array.from(new Set(list.map((c) => c.owner_id)));'
);
f = f.replace(
  'for (const [ownerId, chars] of byOwner) {',
  'for (const [ownerId, chars] of Array.from(byOwner.entries())) {'
);
fs.writeFileSync(fichas, f);

// next.config - keep ignore for safety but types should work
let nc = fs.readFileSync('next.config.mjs', 'utf8');
nc = nc.replace(
  'typescript: { ignoreBuildErrors: true },',
  'typescript: { ignoreBuildErrors: false },'
);
nc = nc.replace(
  'typescript: { ignoreBuildErrors: false },',
  'typescript: { ignoreBuildErrors: false },'
);
fs.writeFileSync('next.config.mjs', nc);

console.log('done');
