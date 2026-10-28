import { useEffect } from 'react';
import { executeCommand } from '../lib/commands';
import { useStore } from '../store/useStore';

function editorFocused(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('.cm-editor');
}

/**
 * Global keyboard shortcuts. Context-sensitive exception: inside the editor Ctrl/Cmd+B is
 * bold (handled by CodeMirror); elsewhere it toggles the left sidebar. The native menu uses
 * Ctrl/Cmd+Alt+B for the sidebar so it never shadows bold.
 */
export function useGlobalHotkeys(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key;
      const lower = key.toLowerCase();
      const run = (id: string): void => {
        event.preventDefault();
        void executeCommand(id);
      };

      if (!mod && event.altKey && key === 'ArrowLeft') return run('nav:back');
      if (!mod && event.altKey && key === 'ArrowRight') return run('nav:forward');
      if (!mod && !event.altKey && key === 'F2') return run('file:rename');
      if (!mod) return;

      if (event.altKey) {
        if (lower === 'b') return run('view:toggle-left');
        if (lower === 's') return run('file:save-all');
        return;
      }

      if (event.shiftKey) {
        if (lower === 'n') return run('file:new-folder');
        if (lower === 'f') return run('search:focus');
        if (lower === 'b') return run('view:toggle-right');
        if (lower === 'o') return run('vault:open');
        if (lower === 'e') return run('view:graph'); // Ctrl+Shift+E is free; graph stays Ctrl+G
        return;
      }

      if (lower === 'n') return run('file:new-note');
      if (lower === 'o') return run('nav:quick-open');
      if (lower === 'p') return run('nav:command-palette');
      if (lower === 's') return run('file:save');
      if (lower === 'w') return run('file:close-tab');
      if (lower === 'e') return run('view:toggle-reading');
      if (lower === 'g') return run('view:graph');
      if (lower === 'b') {
        if (editorFocused(event.target)) return;
        return run('view:toggle-left');
      }
      if (key === '\\' || key === '|') return run('view:split');
      if (key === ',') return run('app:settings');
      if (key === '=' || key === '+') return run('view:zoom-in');
      if (key === '-' || key === '_') return run('view:zoom-out');
      if (key === '0') return run('view:zoom-reset');
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Keeps the current reading mode in sync when commands are invoked from the native menu.
  useEffect(() => {
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') void useStore.getState().persistWorkspace();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
}
