import fs from 'fs';
import path from 'path';

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      walk(full, acc);
    } else if (/\.(tsx?|mdx|mjs|js)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

// Write tsconfig
fs.writeFileSync(
  'tsconfig.json',
  JSON.stringify(
    {
      compilerOptions: {
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
        baseUrl: '.',
        paths: {
          '@/*': ['./src/*'],
          '@/content/*': ['./content/*'],
        },
      },
      include: [
        'next-env.d.ts',
        '**/*.ts',
        '**/*.tsx',
        '**/*.mdx',
        '.next/types/**/*.ts',
      ],
      exclude: ['node_modules'],
    },
    null,
    2
  )
);

// Ensure lib/types under src
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

if (fs.existsSync('lib')) copyDir('lib', 'src/lib');
if (fs.existsSync('types')) {
  fs.mkdirSync('src/types', { recursive: true });
  for (const f of fs.readdirSync('types')) {
    if (f.endsWith('.ts')) {
      fs.copyFileSync(path.join('types', f), path.join('src/types', f));
    }
  }
}

// Fix imports across project
for (const file of walk('.')) {
  let c = fs.readFileSync(file, 'utf8');
  const n = c
    .replaceAll('@/components/', '@/components/')
    .replaceAll('@/lib/', '@/lib/')
    .replaceAll('@/hooks/', '@/hooks/')
    .replaceAll("from '@/content/", "from '@/content/") // keep
    .replaceAll(
      "from '@/components/content/FragmentCostTable'",
      "from '@/components/content/FragmentCostTable'"
    );
  // MDX content import path for FragmentCostTable
  const n2 = n.replaceAll(
    "@/components/content/FragmentCostTable",
    "@/components/content/FragmentCostTable"
  );
  if (n2 !== c) {
    fs.writeFileSync(file, n2);
    console.log('updated', file);
  }
}

// Fix layout import specifically
const layoutPath = 'src/app/layout.tsx';
let layout = fs.readFileSync(layoutPath, 'utf8');
layout = layout
  .replace("@/components/layout/Nav", "@/components/layout/Nav")
  .replace('bg-ink bg-ink-veil text-parchment', 'bg-ink text-parchment');
fs.writeFileSync(layoutPath, layout);

// Fix mdx content import for elementos
const mdxPath = 'content/regras/elementos-e-fragmentos.mdx';
if (fs.existsSync(mdxPath)) {
  let mdx = fs.readFileSync(mdxPath, 'utf8');
  mdx = mdx.replaceAll(
    "@/components/content/FragmentCostTable",
    "@/components/content/FragmentCostTable"
  );
  fs.writeFileSync(mdxPath, mdx);
}

// next.config needs to resolve @/content — add webpack alias
fs.writeFileSync(
  'next.config.mjs',
  `import createMDX from '@next/mdx';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx'],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, 'src'),
      '@/content': path.resolve(__dirname, 'content'),
    };
    return config;
  },
};

const withMDX = createMDX({
  extension: /\\.mdx?$/,
});

export default withMDX(nextConfig);
`
);

console.log('path fix done');
console.log('client exists', fs.existsSync('src/lib/supabase/client.ts'));
console.log('database exists', fs.existsSync('src/types/database.ts'));
