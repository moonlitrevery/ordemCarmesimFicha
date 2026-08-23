import fs from 'fs';
import path from 'path';

const root = process.cwd();

function write(rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.replace(/\r\n/g, '\n'), 'utf8');
  console.log('wrote', rel);
}

write(
  'next.config.mjs',
  `import createMDX from '@next/mdx';

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx'],
};

const withMDX = createMDX({
  extension: /\\.mdx?$/,
});

export default withMDX(nextConfig);
`
);

write(
  'tailwind.config.ts',
  `import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './content/**/*.{md,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        crimson: {
          DEFAULT: '#8B1E2D',
          soft: '#A83242',
          deep: '#5C0F1A',
          glow: '#C44536',
        },
        ink: {
          DEFAULT: '#0C0A0D',
          raised: '#161218',
          panel: '#1C171C',
          border: '#2A2228',
          muted: '#8A7F86',
        },
        parchment: '#E8DFD0',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        panel:
          '0 0 0 1px rgba(139, 30, 45, 0.25), 0 12px 40px rgba(0,0,0,0.45)',
      },
    },
  },
  plugins: [],
};
export default config;
`
);

write(
  'mdx-components.tsx',
  `import type { MDXComponents } from 'mdx/types';

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: (props) => (
      <h1 className="font-display text-3xl text-parchment mb-4 mt-8" {...props} />
    ),
    h2: (props) => (
      <h2 className="font-display text-2xl text-parchment mb-3 mt-8 border-b border-ink-border pb-2" {...props} />
    ),
    h3: (props) => (
      <h3 className="font-display text-xl text-parchment mb-2 mt-6" {...props} />
    ),
    p: (props) => <p className="mb-4 leading-relaxed text-parchment/85" {...props} />,
    ul: (props) => <ul className="mb-4 list-disc pl-6 space-y-1 text-parchment/85" {...props} />,
    ol: (props) => <ol className="mb-4 list-decimal pl-6 space-y-1 text-parchment/85" {...props} />,
    li: (props) => <li className="leading-relaxed" {...props} />,
    a: (props) => (
      <a className="text-crimson-soft underline underline-offset-2 hover:text-crimson-glow" {...props} />
    ),
    blockquote: (props) => (
      <blockquote className="border-l-2 border-crimson/60 pl-4 italic text-ink-muted my-4" {...props} />
    ),
    code: (props) => (
      <code className="rounded bg-ink-raised px-1.5 py-0.5 text-sm text-crimson-glow" {...props} />
    ),
    ...components,
  };
}
`
);

write(
  'src/app/globals.css',
  `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: #0c0a0d;
  --foreground: #e8dfd0;
}

html {
  color-scheme: dark;
}

body {
  color: var(--foreground);
  background-color: var(--background);
  min-height: 100dvh;
}

@layer base {
  ::selection {
    background: rgba(139, 30, 45, 0.45);
    color: #fff;
  }
}

@layer components {
  .panel {
    @apply rounded-lg border border-ink-border bg-ink-panel/80 shadow-panel backdrop-blur-sm;
  }

  .field {
    @apply w-full rounded-md border border-ink-border bg-ink-raised px-3 py-2 text-sm text-parchment outline-none transition focus:border-crimson/70 focus:ring-1 focus:ring-crimson/40;
  }

  .btn {
    @apply inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition disabled:opacity-50;
  }

  .btn-primary {
    @apply btn bg-crimson text-parchment hover:bg-crimson-soft;
  }

  .btn-ghost {
    @apply btn border border-ink-border bg-transparent text-parchment hover:border-crimson/50 hover:bg-ink-raised;
  }

  .section-title {
    @apply font-display text-xl tracking-wide text-parchment md:text-2xl;
  }

  .label {
    @apply text-xs uppercase tracking-[0.14em] text-ink-muted;
  }
}
`
);

console.log('batch 1 done');
