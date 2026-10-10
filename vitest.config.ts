import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  // Components use the automatic JSX runtime (no React import), as in Next.
  esbuild: { jsx: 'automatic' },
});
