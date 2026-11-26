import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './content/**/*.{md,mdx}',
  ],
  theme: {
    extend: {
      screens: {
        // Tablet grande passa de 1024 px mas usa gaveta: o critério é ter mouse.
        desk: { raw: '(min-width: 1024px) and (pointer: fine)' },
      },
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
      // Tokens de animação (Fase 15): os valores moram nas variáveis CSS de globals.css,
      // que caem para 1 ms com "reduzir movimento" e no modo leve da Mesa.
      transitionDuration: {
        fast: 'var(--dur-fast)',
        base: 'var(--dur-base)',
        slow: 'var(--dur-slow)',
      },
      transitionTimingFunction: {
        enter: 'var(--ease-enter)',
        exit: 'var(--ease-exit)',
      },
      boxShadow: {
        panel:
          '0 0 0 1px rgba(139, 30, 45, 0.25), 0 12px 40px rgba(0,0,0,0.45)',
      },
      typography: () => ({
        invert: {
          css: {
            '--tw-prose-body': '#E8DFD0',
            '--tw-prose-headings': '#E8DFD0',
            '--tw-prose-lead': '#8A7F86',
            '--tw-prose-links': '#A83242',
            '--tw-prose-bold': '#E8DFD0',
            '--tw-prose-counters': '#8A7F86',
            '--tw-prose-bullets': '#8B1E2D',
            '--tw-prose-hr': '#2A2228',
            '--tw-prose-quotes': '#8A7F86',
            '--tw-prose-quote-borders': '#8B1E2D',
            '--tw-prose-captions': '#8A7F86',
            '--tw-prose-code': '#E8DFD0',
            '--tw-prose-pre-code': '#E8DFD0',
            '--tw-prose-pre-bg': '#161218',
            '--tw-prose-th-borders': '#8B1E2D',
            '--tw-prose-td-borders': '#2A2228',
            h1: {
              fontFamily: 'var(--font-display), Georgia, serif',
            },
            h2: {
              fontFamily: 'var(--font-display), Georgia, serif',
              borderBottom: '1px solid #8B1E2D',
              paddingBottom: '0.3em',
            },
            h3: {
              fontFamily: 'var(--font-display), Georgia, serif',
            },
            table: {
              fontSize: '0.95em',
            },
            'thead th': {
              color: '#E8DFD0',
            },
          },
        },
      }),
    },
  },
  plugins: [typography],
};
export default config;
