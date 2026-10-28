import { useEffect } from 'react';
import { executeCommand } from '../lib/commands';
import { useStore } from '../store/useStore';

/**
 * Bridges main-process events into the store and keeps the workspace file in sync.
 * Menu commands reuse the same command registry as the palette and keyboard.
 */
export function useAppEvents(): void {
  useEffect(() => {
    let quitting = false;
    const unsubscribers = [
      window.vaultApi.onFileChanged((batch) => {
        void useStore.getState().handleFileBatch(batch);
      }),
      window.vaultApi.onVaultChanged((payload) => {
        useStore.getState().handleVaultChanged(payload);
      }),
      window.vaultApi.onSettingsChanged((payload) => {
        useStore.getState().handleSettingsChanged(payload);
      }),
      window.vaultApi.onMenuCommand((event) => {
        if (event.command === 'app:before-close') {
          if (quitting) return;
          quitting = true;
          void (async () => {
            try {
              await useStore.getState().saveAll();
            } finally {
              window.vaultApi.notifyReadyToQuit();
            }
          })();
          return;
        }
        void executeCommand(event.command);
      }),
    ];

    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = useStore.subscribe((state, previous) => {
      if (state.status !== 'ready') return;
      if (state.workspace === previous.workspace) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void useStore.getState().persistWorkspace();
      }, 500);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const onBeforeUnload = (): void => {
      // Best-effort for reloads; the close handshake covers normal quit.
      void useStore.getState().persistWorkspace();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);
}
