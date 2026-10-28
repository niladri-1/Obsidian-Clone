import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { PRODUCTION_CSP } from './src/main/security';

const shared = resolve(__dirname, 'src/shared');
const renderer = resolve(__dirname, 'src/renderer');

/**
 * The production renderer is a local file; the session header in `main/index.ts` covers
 * navigations, and this meta tag covers the initial document. Development is exempt because
 * Vite injects an inline React-refresh preamble.
 */
function productionCspPlugin(): Plugin {
  return {
    name: 'obsidia-production-csp',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: PRODUCTION_CSP,
          },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') } },
    },
  },
  renderer: {
    root: renderer,
    resolve: { alias: { '@shared': shared, '@renderer': renderer } },
    plugins: [react(), productionCspPlugin()],
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html') } },
    },
  },
});
