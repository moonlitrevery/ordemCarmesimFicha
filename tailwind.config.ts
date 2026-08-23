import type { Config } from 'tailwindcss';

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
