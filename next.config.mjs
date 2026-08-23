import createMDX from '@next/mdx';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, "src");

/** @type {import("next").NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: false },
  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx'],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@/components': path.join(src, 'components'),
      '@/lib': path.join(src, 'lib'),
      '@/types': path.join(src, 'types'),
      '@/hooks': path.join(src, 'hooks'),
      '@/content': path.join(__dirname, 'content'),
    };
    return config;
  },
};

const withMDX = createMDX({
  extension: /\.mdx?$/,
});

export default withMDX(nextConfig);
