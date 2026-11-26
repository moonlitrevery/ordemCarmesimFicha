import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  // O tsconfig deixa o JSX como `preserve` (quem compila é o Next).
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // No Next, `server-only` some no servidor e quebra o build se entrar no cliente.
      // Nos testes (Node) é sempre servidor.
      'server-only': path.resolve(__dirname, 'node_modules/next/dist/compiled/server-only/empty.js'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'supabase/**/*.test.ts', 'maps/**/*.test.ts'],
  },
});
