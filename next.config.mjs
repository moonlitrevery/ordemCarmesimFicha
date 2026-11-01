import createBundleAnalyzer from '@next/bundle-analyzer';
import createMDX from '@next/mdx';
import remarkGfm from 'remark-gfm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, "src");

/** @type {import("next").NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: false },
  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx'],
  experimental: {
    // Lido com fs pela rota: sem isso o manifest não vai para a função da Vercel.
    outputFileTracingIncludes: {
      '/api/vtt/static': ['./generated/vtt-manifest.json'],
    },
  },
  async headers() {
    return [
      {
        // Nome vem do conteúdo: nunca muda, e não deve aparecer em buscador.
        source: '/vtt/_built/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          { key: 'X-Robots-Tag', value: 'noindex' },
        ],
      },
    ];
  },
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
  options: {
    remarkPlugins: [remarkGfm],
  },
});

// ANALYZE=true npm run build → relatórios em .next/analyze/
const withBundleAnalyzer = createBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
});

export default withBundleAnalyzer(withMDX(nextConfig));