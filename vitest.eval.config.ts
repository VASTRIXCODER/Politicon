import path from 'node:path';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Model evals (npm run eval): tests/eval/*.eval.ts call the real Anthropic API
 * and are skipped unless ANTHROPIC_API_KEY is set; tests/eval/*.test.ts check
 * the eval's own heuristics and need no key. Kept out of `npm test`.
 *
 * Only ANTHROPIC_* variables are read from .env / .env.local (the shell's
 * environment wins); nothing else, so the eval can't reach the database.
 */
export default defineConfig({
  test: {
    include: ['tests/eval/**/*.eval.ts', 'tests/eval/**/*.test.ts'],
    environment: 'node',
    env: loadEnv('development', __dirname, ['ANTHROPIC_']),
    // All model calls happen in one beforeAll, a few at a time.
    hookTimeout: 15 * 60_000,
    testTimeout: 60_000,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
