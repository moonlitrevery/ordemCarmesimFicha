import createBundleAnalyzer from '@next/bundle-analyzer';
import createMDX from '@next/mdx';
import remarkGfm from 'remark-gfm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, "src");

// Supabase do projeto (REST e Realtime) e Blob (arquivos e envio direto do navegador).
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin;
  } catch {
    return 'https://*.supabase.co';
  }
})();
const supabaseWs = supabaseOrigin.replace(/^https:/, 'wss:');
const blobOrigin = 'https://*.public.blob.vercel-storage.com';

// Valem já: não bloqueiam nada que o site usa.
const ENFORCED_CSP = ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'"].join('; ');

// Política completa em modo relatório: o navegador só avisa no console o que
// bloquearia. Quando a Mesa rodar uma sessão sem aviso, troque o header por
// Content-Security-Policy. `unsafe-inline` em script: o App Router injeta scripts
// inline sem nonce.
const REPORT_ONLY_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `media-src 'self' blob: ${blobOrigin}`,
  `connect-src 'self' ${supabaseOrigin} ${supabaseWs} ${blobOrigin} https://vercel.com https://blob.vercel-storage.com`,
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "form-action 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'Content-Security-Policy', value: ENFORCED_CSP },
  { key: 'Content-Security-Policy-Report-Only', value: REPORT_ONLY_CSP },
];

/** @type {import("next").NextConfig} */
const nextConfig = {
  // maps/ é o gerador de mapas (Node): entra no lint junto com o site.
  eslint: { ignoreDuringBuilds: false, dirs: ['src', 'maps'] },
  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx'],
  experimental: {
    // Lido com fs pela rota: sem isso o manifest não vai para a função da Vercel.
    outputFileTracingIncludes: {
      '/api/vtt/static': ['./generated/vtt-manifest.json'],
    },
  },
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      {
        // Nome vem do conteúdo: nunca muda, e não deve aparecer em buscador.
        source: '/vtt/_built/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          { key: 'X-Robots-Tag', value: 'noindex' },
        ],
      },
      {
        // A versão está no nome: scripts/copy-pdf-worker.mjs.
        source: '/pdfjs/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
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