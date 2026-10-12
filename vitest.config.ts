import { configDefaults, defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Playwright specs (npm run test:e2e) and model evals (they call the real
    // API and cost money) have their own runners; keep them out of unit runs.
    exclude: [...configDefaults.exclude, 'tests/e2e/**', '**/evals/**', '**/eval/**', 'playwright-report/**', 'test-results/**'],
    environment: 'node',
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  // Components use the automatic JSX runtime (no React import), as in Next.
  esbuild: { jsx: 'automatic' },
});
