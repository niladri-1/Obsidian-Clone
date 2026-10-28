/**
 * Minimal type declarations for the two markdown-it plugins that do not ship their own
 * declarations. The runtime behaviour is the plugins' documented API.
 */
declare module 'markdown-it-footnote' {
  import type { PluginSimple } from 'markdown-it';
  const footnote: PluginSimple;
  export default footnote;
}

declare module 'markdown-it-task-lists' {
  import type { PluginWithOptions } from 'markdown-it';

  export interface TaskListOptions {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }

  const taskLists: PluginWithOptions<TaskListOptions>;
  export default taskLists;
}
