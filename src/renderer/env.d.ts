/// <reference types="vite/client" />

import type { RendererApi } from '@shared/ipc';

declare global {
  interface Window {
    vaultApi: RendererApi;
  }
}

declare module 'markdown-it-task-lists' {
  import type MarkdownIt from 'markdown-it';
  interface TaskListOptions {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }
  const plugin: (md: MarkdownIt, options?: TaskListOptions) => void;
  export default plugin;
}

declare module 'markdown-it-footnote' {
  import type MarkdownIt from 'markdown-it';
  const plugin: (md: MarkdownIt) => void;
  export default plugin;
}

export {};
