import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  // O tsconfig deixa o JSX como `preserve` (quem compila é o Next).
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    include: ['src/**/*.test.ts', 'supabase/**/*.test.ts', 'maps/**/*.test.ts'],
  },
});
