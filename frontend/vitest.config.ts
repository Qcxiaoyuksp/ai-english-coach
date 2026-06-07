import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Pure-function unit tests run in a Node environment. The `@/` alias mirrors
// the tsconfig path mapping so test imports match app imports.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
});
