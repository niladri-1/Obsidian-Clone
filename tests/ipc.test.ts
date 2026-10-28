import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings, VaultInfo } from '../src/shared/types';
import type { VaultRegistry } from '../src/main/vault/registry';

const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => Promise<unknown>>());
const shellCalls = vi.hoisted(() => ({
  openExternal: [] as string[],
  openPath: [] as string[],
  showItemInFolder: [] as string[],
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      handlers.set(channel, handler);
    },
  },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  shell: {
    openExternal: async (url: string) => {
      shellCalls.openExternal.push(url);
    },
    openPath: async (target: string) => {
      shellCalls.openPath.push(target);
      return '';
    },
    showItemInFolder: async (target: string) => {
      shellCalls.showItemInFolder.push(target);
    },
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
}));

const { LIMITS } = await import('../src/shared/ipc');
const { registerIpc } = await import('../src/main/ipc');
const { GlobalSettingsStore } = await import('../src/main/vault/settings');

let root: string;
let userData: string;
let dispose: (() => Promise<void>) | null = null;

interface CallResult {
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string };
}

async function call(channel: string, ...args: unknown[]): Promise<CallResult> {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`No handler registered for ${channel}`);
  return (await handler({}, ...args)) as CallResult;
}

beforeEach(async () => {
  handlers.clear();
  shellCalls.openExternal.length = 0;
  shellCalls.openPath.length = 0;
  shellCalls.showItemInFolder.length = 0;
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'obsidia-ipc-'));
  userData = await fs.mkdtemp(path.join(os.tmpdir(), 'obsidia-ipc-user-'));
  await fs.mkdir(path.join(root, 'notes'), { recursive: true });
  await fs.writeFile(path.join(root, 'notes', 'a.md'), '# A\n', 'utf8');

  const globalSettings = new GlobalSettingsStore(userData);
  let appSettings: AppSettings = await globalSettings.load();
  const info: VaultInfo = {
    id: 'vault-1',
    path: root,
    name: 'IPC Vault',
    lastOpenedAt: Date.now(),
  };
  const registry = {
    open: async (vaultPath: string) => ({ ...info, path: vaultPath }),
    get: async (id: string) => (id === info.id ? info : null),
    remove: async () => true,
    list: async () => ({ vaults: [info], lastVaultId: info.id }),
  };

  const registered = registerIpc({
    registry: registry as unknown as VaultRegistry,
    globalSettings,
    userDataDirectory: userData,
    getAppSettings: () => appSettings,
    setAppSettings: (next) => {
      appSettings = next;
    },
  });
  dispose = registered.dispose;

  const opened = await call('vault:open', { path: root, create: false });
  expect(opened.ok).toBe(true);
});

afterEach(async () => {
  await dispose?.();
  dispose = null;
  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(userData, { recursive: true, force: true });
});

describe('IPC validation', () => {
  it('serves file reads and rejects non-string or oversized paths', async () => {
    await expect(call('file:read', 'notes/a.md')).resolves.toMatchObject({
      ok: true,
      data: { content: '# A\n' },
    });
    await expect(call('file:read', 42)).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_ARGUMENT' },
    });
    await expect(call('file:read', 'x'.repeat(LIMITS.maxPathLength + 1))).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_ARGUMENT' },
    });
  });

  it('rejects invalid write payloads before touching the disk', async () => {
    await expect(call('file:write', 'notes/a.md', 42)).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_ARGUMENT' },
    });
    await expect(
      call('file:write', 'notes/a.md', 'a'.repeat(LIMITS.maxNoteBytes + 1)),
    ).resolves.toMatchObject({ ok: false, error: { code: 'TOO_LARGE' } });
    await expect(call('file:write', 'notes/a.md', 'ok', 'soon')).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_ARGUMENT' },
    });
    await expect(fs.readFile(path.join(root, 'notes', 'a.md'), 'utf8')).resolves.toBe('# A\n');
  });

  it('rejects traversal, invalid search queries and unknown settings scopes', async () => {
    await expect(call('file:create', { path: '../escape.md', kind: 'file' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'OUTSIDE_VAULT' },
    });
    await expect(call('file:duplicate', { path: '../escape.md' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'OUTSIDE_VAULT' },
    });
    await expect(call('file:duplicate', { path: 42 })).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_ARGUMENT' },
    });
    await expect(
      call('search:query', { query: 'x'.repeat(LIMITS.maxQueryLength + 1) }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_ARGUMENT' } });
    await expect(
      call('settings:set', { scope: 'everything', patch: {} }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_ARGUMENT' } });
    await expect(call('file:rename', { path: 'notes/a.md' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_ARGUMENT' },
    });
    await expect(call('workspace:save', 'not-an-object')).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_ARGUMENT' },
    });
  });

  it('rejects forgetting the active vault', async () => {
    await expect(call('vault:remove', 'vault-1')).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_ARGUMENT' },
    });
    await expect(call('vault:remove', 'missing')).resolves.toMatchObject({
      ok: true,
      data: { removed: true },
    });
  });

  it('only opens http, https and mailto URLs externally', async () => {
    await expect(call('shell:open-external', 'file:///etc/passwd')).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_ARGUMENT' },
    });
    await expect(call('shell:open-external', 'javascript:alert(1)')).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_ARGUMENT' },
    });
    await expect(call('shell:open-external', 'https://example.com')).resolves.toMatchObject({
      ok: true,
    });
    expect(shellCalls.openExternal).toEqual(['https://example.com/']);
  });

  it('returns a settings bundle and persists vault patches', async () => {
    const before = await call('settings:get', 'vault');
    expect(before).toMatchObject({ ok: true, data: { vault: { tabSize: 4 } } });

    const updated = await call('settings:set', {
      scope: 'vault',
      patch: { tabSize: 2 },
    });
    expect(updated).toMatchObject({ ok: true, data: { vault: { tabSize: 2 } } });

    const app = await call('settings:set', { scope: 'app', patch: { zoom: 1.25 } });
    expect(app).toMatchObject({ ok: true, data: { app: { zoom: 1.25 } } });
  });

  it('reads the tree, links and workspace through the current vault', async () => {
    await expect(call('vault:tree')).resolves.toMatchObject({
      ok: true,
      data: { tree: { files: ['notes/a.md'] } },
    });
    await expect(call('links:graph')).resolves.toMatchObject({
      ok: true,
      data: { nodes: [{ path: 'notes/a.md' }] },
    });
    await expect(call('workspace:load')).resolves.toMatchObject({ ok: true });
    await expect(call('file:watch')).resolves.toMatchObject({
      ok: true,
      data: { watching: true },
    });
  });

  it('duplicates a note next to the original with a free name', async () => {
    const first = await call('file:duplicate', { path: 'notes/a.md' });
    expect(first).toMatchObject({
      ok: true,
      data: { sourcePath: 'notes/a.md', path: 'notes/a 1.md' },
    });
    await expect(fs.readFile(path.join(root, 'notes', 'a 1.md'), 'utf8')).resolves.toBe('# A\n');
    expect((first.data as { tree: { files: string[] } }).tree.files).toEqual(
      expect.arrayContaining(['notes/a.md', 'notes/a 1.md']),
    );

    const second = await call('file:duplicate', { path: 'notes/a.md' });
    expect(second).toMatchObject({ ok: true, data: { path: 'notes/a 2.md' } });
  });

  it('reveals the vault root and files inside it', async () => {
    await expect(call('shell:reveal', '')).resolves.toMatchObject({
      ok: true,
      data: { revealed: true },
    });
    expect(shellCalls.openPath).toEqual([root]);
    await expect(call('shell:reveal', 'notes/a.md')).resolves.toMatchObject({
      ok: true,
      data: { revealed: true },
    });
    expect(shellCalls.showItemInFolder).toHaveLength(1);
    await expect(call('shell:reveal', '../outside.md')).resolves.toMatchObject({
      ok: false,
      error: { code: 'OUTSIDE_VAULT' },
    });
  });
});
