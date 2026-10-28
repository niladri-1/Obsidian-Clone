import { describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({
  key: '',
  api: null as Record<string, unknown> | null,
  listeners: new Map<string, (event: unknown, payload: unknown) => void>(),
  removed: [] as Array<[string, unknown]>,
  sent: [] as Array<[string, unknown]>,
  invoked: [] as Array<[string, unknown[]]>,
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (key: string, api: Record<string, unknown>) => {
      captured.key = key;
      captured.api = api;
    },
  },
  ipcRenderer: {
    invoke: async (channel: string, ...args: unknown[]) => {
      captured.invoked.push([channel, args]);
      return { ok: true, data: null };
    },
    on: (channel: string, listener: (event: unknown, payload: unknown) => void) => {
      captured.listeners.set(channel, listener);
    },
    removeListener: (channel: string, listener: unknown) => {
      captured.removed.push([channel, listener]);
    },
    send: (channel: string, payload: unknown) => {
      captured.sent.push([channel, payload]);
    },
  },
}));

await import('../src/preload/index');

type Api = Record<string, (...args: never[]) => unknown>;

describe('preload bridge', () => {
  it('exposes exactly the documented API under window.vaultApi', () => {
    expect(captured.key).toBe('vaultApi');
    expect(Object.keys(captured.api ?? {}).sort()).toEqual(
      [
        'platform',
        'openVault',
        'listVaults',
        'chooseVault',
        'removeVault',
        'currentVault',
        'getTree',
        'readFile',
        'writeFile',
        'createEntry',
        'duplicateEntry',
        'renameEntry',
        'deleteEntry',
        'startWatch',
        'search',
        'getSettings',
        'setVaultSettings',
        'setAppearance',
        'setAppSettings',
        'loadWorkspace',
        'saveWorkspace',
        'getLinks',
        'openExternal',
        'reveal',
        'onFileChanged',
        'onVaultChanged',
        'onSettingsChanged',
        'onMenuCommand',
        'notifyReadyToQuit',
      ].sort(),
    );
  });

  it('does not expose Node or Electron primitives', () => {
    for (const forbidden of ['require', 'process', 'ipcRenderer', 'shell', 'fs', 'path']) {
      expect(captured.api).not.toHaveProperty(forbidden);
    }
  });

  it('routes calls over the documented channels', async () => {
    const api = captured.api as unknown as {
      readFile: (path: string) => Promise<unknown>;
      writeFile: (path: string, content: string, mtime?: number) => Promise<unknown>;
      setVaultSettings: (patch: unknown) => Promise<unknown>;
      openExternal: (url: string) => Promise<unknown>;
      notifyReadyToQuit: () => void;
    };

    await api.readFile('notes/a.md');
    await api.writeFile('notes/a.md', 'body', 123);
    await api.setVaultSettings({ spellcheck: false });
    await api.openExternal('https://example.com');
    api.notifyReadyToQuit();

    expect(captured.invoked).toEqual([
      ['file:read', ['notes/a.md']],
      ['file:write', ['notes/a.md', 'body', 123]],
      ['settings:set', [{ scope: 'vault', patch: { spellcheck: false } }]],
      ['shell:open-external', ['https://example.com']],
    ]);
    expect(captured.sent).toEqual([['app:quit-ready', undefined]]);
  });

  it('subscribes and unsubscribes event listeners', () => {
    const api = captured.api as unknown as Api;
    const received: unknown[] = [];
    const unsubscribe = (api.onFileChanged as unknown as (fn: (payload: unknown) => void) => () => void)(
      (payload) => received.push(payload),
    );

    const listener = captured.listeners.get('file:changed');
    expect(listener).toBeTypeOf('function');
    listener!({}, { added: ['a.md'], changed: [], removed: [] });
    expect(received).toEqual([{ added: ['a.md'], changed: [], removed: [] }]);

    unsubscribe();
    expect(captured.removed).toHaveLength(1);
    expect(captured.removed[0]?.[0]).toBe('file:changed');
  });
});
