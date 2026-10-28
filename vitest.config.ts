import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Unit and integration tests run in Node. The Markdown pipeline opts into jsdom per file
 * (`// @vitest-environment jsdom`) because DOMPurify needs a DOM.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    restoreMocks: true,
    clearMocks: true,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
