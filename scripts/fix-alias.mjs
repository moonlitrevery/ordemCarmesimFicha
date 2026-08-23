import fs from 'fs';

fs.writeFileSync(
  'next.config.mjs',
  [
    "import createMDX from '@next/mdx';",
    '',
    '/** @type {import("next").NextConfig} */',
    'const nextConfig = {',
    '  eslint: { ignoreDuringBuilds: true },',
    "  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx'],",
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
      include: [
        'next-env.d.ts',
        './src/**/*.ts',
        './src/**/*.tsx',
        './src/**/*.mdx',
        './mdx-components.tsx',
        '.next/types/**/*.ts',
      ],
      exclude: ['node_modules', 'scripts', 'lib'],
    },
    null,
    2
  )
);

console.log('configs fixed — removed broken @ webpack alias');
