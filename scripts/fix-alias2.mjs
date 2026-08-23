import fs from 'fs';
import { execSync } from 'child_process';

fs.writeFileSync(
  'next.config.mjs',
  [
    "import createMDX from '@next/mdx';",
    "import path from 'path';",
    "import { fileURLToPath } from 'url';",
    '',
    'const __dirname = path.dirname(fileURLToPath(import.meta.url));',
    'const src = path.join(__dirname, "src");',
    '',
    '/** @type {import("next").NextConfig} */',
    'const nextConfig = {',
    '  eslint: { ignoreDuringBuilds: true },',
    "  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx'],",
    '  webpack: (config) => {',
    '    config.resolve.alias = {',
    '      ...config.resolve.alias,',
    "      '@/components': path.join(src, 'components'),",
    "      '@/lib': path.join(src, 'lib'),",
    "      '@/types': path.join(src, 'types'),",
    "      '@/hooks': path.join(src, 'hooks'),",
    "      '@/content': path.join(src, 'content'),",
    '    };',
    '    return config;',
    '  },',
    '};',
    '',
    'const withMDX = createMDX({',
    '  extension: /\\.mdx?$/,',
    '});',
    '',
    'export default withMDX(nextConfig);',
    '',
  ].join('\n')
);

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
        baseUrl: '.',
        paths: {
          '@/*': ['./src/*'],
        },
      },
      include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
      exclude: ['node_modules', 'scripts'],
    },
    null,
    2
  )
);

execSync('npm install -D @types/node@20 typescript@5 eslint@8', {
  stdio: 'inherit',
});

console.log('alias + types fixed');
