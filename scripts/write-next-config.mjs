import fs from 'fs';

fs.writeFileSync(
  'next.config.mjs',
  [
    "import createMDX from '@next/mdx';",
    "import path from 'path';",
    "import { fileURLToPath } from 'url';",
    '',
    'const __dirname = path.dirname(fileURLToPath(import.meta.url));',
    '',
    '/** @type {import("next").NextConfig} */',
    'const nextConfig = {',
    "  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx'],",
    '  webpack: (config) => {',
    "    config.resolve.alias['@'] = path.join(__dirname, 'src');",
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

console.log('next.config written');
console.log(fs.readFileSync('next.config.mjs', 'utf8'));
