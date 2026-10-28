import fs from 'node:fs/promises';
import path from 'node:path';
import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { IPC, LIMITS } from '../shared/ipc';
import type {
  AppSettings,
  AppearanceSettings,
  IpcError,
  IpcResult,
  PersistedWorkspaceV1,
  SearchOptions,
  SettingsBundle,
  SettingsScope,
  VaultInfo,
  VaultSettings,
} from '../shared/types';
import { FileOpError } from './vault/fsops';
import { VaultPathError } from './vault/paths';
import { VaultRegistry } from './vault/registry';
import { VaultService } from './vault/service';
import { GlobalSettingsStore, DEFAULT_APPEARANCE, DEFAULT_VAULT_SETTINGS } from './vault/settings';

export interface IpcContext {
  registry: VaultRegistry;
  globalSettings: GlobalSettingsStore;
  userDataDirectory: string;
  getAppSettings: () => AppSettings;
  setAppSettings: (settings: AppSettings) => void;
  onVaultOpened?: (info: VaultInfo) => void;
}

interface VaultState {
  service: VaultService | null;
}

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

function fail(code: IpcError['code'], message: string): IpcResult<never> {
  return { ok: false, error: { code, message } };
}

function toError(error: unknown): IpcError {
  if (error instanceof VaultPathError || error instanceof FileOpError) {
    return { code: error.code, message: error.message };
  }
  const nodeError = error as NodeJS.ErrnoException;
  if (nodeError?.code === 'ENOENT') return { code: 'NOT_FOUND', message: 'File not found' };
  if (nodeError?.code === 'EEXIST') return { code: 'EXISTS', message: 'Already exists' };
  if (nodeError?.code === 'EACCES' || nodeError?.code === 'EPERM') {
    return { code: 'IO_ERROR', message: 'Permission denied' };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { code: 'IO_ERROR', message };
}

function handle<T>(channel: string, handler: (...args: unknown[]) => Promise<T>): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]): Promise<IpcResult<T>> => {
    try {
      return ok(await handler(...args));
    } catch (error) {
      const mapped = toError(error);
      return fail(mapped.code, mapped.message);
    }
  });
}

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    window.webContents.send(channel, payload);
  }
}

function requireString(value: unknown, field: string, maxLength: number = LIMITS.maxPathLength): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    throw new VaultPathError('INVALID_ARGUMENT', `${field} must be a non-empty string`);
  }
  return value;
}

function requireObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new VaultPathError('INVALID_ARGUMENT', `${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function registerIpc(context: IpcContext): { dispose: () => Promise<void> } {
  const state: VaultState = { service: null };

  const requireVault = (): VaultService => {
    if (!state.service) throw new FileOpError('NO_VAULT', 'No vault is open');
    return state.service;
  };

  const bundle = async (): Promise<SettingsBundle> => {
    const service = state.service;
    return {
      vault: service ? service.getSettings() : { ...DEFAULT_VAULT_SETTINGS },
      appearance: service ? service.getAppearance() : { ...DEFAULT_APPEARANCE },
      app: context.getAppSettings(),
    };
  };

  const treeEvent = () => {
    const service = requireVault();
    return { tree: service.getTree(), links: service.getLinks() };
  };

  const openVault = async (rawPath: unknown, create: boolean) => {
    const vaultPath = requireString(rawPath, 'path');
    if (vaultPath.length > LIMITS.maxPathLength) throw new VaultPathError('INVALID_ARGUMENT', 'Path too long');
    const info = await context.registry.open(vaultPath, create);
    if (state.service) await state.service.dispose();
    state.service = await VaultService.create(info, {
      onFileBatch: (batch) => broadcast(IPC.eventFileChanged, batch),
      onVaultChanged: () => {
        if (!state.service) return;
        broadcast(IPC.eventVaultChanged, {
          tree: state.service.getTree(),
          links: state.service.getLinks(),
        });
      },
      onError: (error) => {
        broadcast(IPC.eventFileChanged, { added: [], changed: [], removed: [] });
        console.error('[watcher]', error);
      },
    });
    const workspace = await state.service.getWorkspace();
    const appSettings = await context.globalSettings.update({ lastVaultId: info.id });
    context.setAppSettings(appSettings);
    context.onVaultOpened?.(info);
    return {
      vault: info,
      tree: state.service.getTree(),
      settings: state.service.getSettings(),
      appearance: state.service.getAppearance(),
      workspace,
      links: state.service.getLinks(),
    };
  };

  handle(IPC.vaultOpen, async (input) => {
    const request = requireObject(input, 'request');
    return openVault(request.path, request.create === true);
  });

  handle(IPC.vaultList, async () => context.registry.list());

  handle(IPC.vaultChoose, async (mode) => {
    const create = mode === 'create';
    const result = await dialog.showOpenDialog({
      title: create ? 'Create a vault folder' : 'Open a vault folder',
      properties: create ? ['openDirectory', 'createDirectory'] : ['openDirectory'],
      buttonLabel: create ? 'Create vault' : 'Open vault',
    });
    return { path: result.canceled ? null : (result.filePaths[0] ?? null) };
  });

  handle(IPC.vaultRemove, async (id) => {
    const vaultId = requireString(id, 'id', 200);
    const info = await context.registry.get(vaultId);
    if (info && state.service?.info.id === vaultId) {
      throw new VaultPathError('INVALID_ARGUMENT', 'Close the vault before forgetting it');
    }
    return { removed: await context.registry.remove(vaultId) };
  });

  handle(IPC.vaultCurrent, async () => state.service?.info ?? null);
  handle(IPC.vaultTree, async () => treeEvent());

  handle(IPC.workspaceLoad, async () => requireVault().getWorkspace());
  handle(IPC.workspaceSave, async (workspace) => {
    const parsed = requireObject(workspace, 'workspace') as unknown as PersistedWorkspaceV1;
    await requireVault().saveWorkspace(parsed);
    return { saved: true };
  });

  handle(IPC.fileRead, async (relative) => requireVault().readFile(requireString(relative, 'path')));

  handle(IPC.fileWrite, async (relative, content, expectedMtimeMs) => {
    const filePath = requireString(relative, 'path');
    if (typeof content !== 'string') throw new VaultPathError('INVALID_ARGUMENT', 'content must be a string');
    if (Buffer.byteLength(content, 'utf8') > LIMITS.maxNoteBytes) {
      throw new FileOpError('TOO_LARGE', 'File exceeds the 5 MB limit');
    }
    if (expectedMtimeMs !== undefined && typeof expectedMtimeMs !== 'number') {
      throw new VaultPathError('INVALID_ARGUMENT', 'expectedMtimeMs must be a number');
    }
    return requireVault().writeFile(filePath, content, expectedMtimeMs);
  });

  handle(IPC.fileCreate, async (input) => {
    const request = requireObject(input, 'input');
    const filePath = requireString(request.path, 'path');
    const kind = request.kind === 'folder' ? 'folder' : 'file';
    const content = typeof request.content === 'string' ? request.content : undefined;
    const service = requireVault();
    const created = await service.createEntry(filePath, kind, content);
    return { ...created, ...treeEvent() };
  });

  handle(IPC.fileDuplicate, async (input) => {
    const request = requireObject(input, 'input');
    const filePath = requireString(request.path, 'path');
    const service = requireVault();
    const duplicated = await service.duplicateEntry(filePath);
    return { ...duplicated, ...treeEvent() };
  });

  handle(IPC.fileRename, async (input) => {
    const request = requireObject(input, 'input');
    const filePath = requireString(request.path, 'path');
    const newPath = requireString(request.newPath, 'newPath');
    const service = requireVault();
    const updateLinks = request.updateLinks === true;
    const result = await service.renameEntry(filePath, newPath, updateLinks);
    return { ...result, ...treeEvent() };
  });

  handle(IPC.fileDelete, async (input) => {
    const request = requireObject(input, 'input');
    const filePath = requireString(request.path, 'path');
    const service = requireVault();
    const result = await service.deleteEntry(filePath);
    return { ...result, ...treeEvent() };
  });

  handle(IPC.fileWatch, async () => {
    requireVault();
    return { watching: true };
  });

  handle(IPC.searchQuery, async (input) => {
    const service = requireVault();
    const request = requireObject(input, 'search');
    const query = typeof request.query === 'string' ? request.query : '';
    if (query.length > LIMITS.maxQueryLength) {
      throw new VaultPathError('INVALID_ARGUMENT', 'Search query is too long');
    }
    const options: SearchOptions = {
      query,
      limit: typeof request.limit === 'number' ? request.limit : undefined,
      caseSensitive: request.caseSensitive === true,
      wholeWord: request.wholeWord === true,
      regex: request.regex === true,
    };
    return service.searchVault(options);
  });

  handle(IPC.settingsGet, async () => bundle());

  handle(IPC.settingsSet, async (input) => {
    const request = requireObject(input, 'request');
    const scope = request.scope as SettingsScope;
    const patch = requireObject(request.patch, 'patch');
    const service = state.service;

    if (scope === 'vault') {
      if (!service) throw new FileOpError('NO_VAULT', 'No vault is open');
      await service.updateVaultSettings(patch as Partial<VaultSettings>);
    } else if (scope === 'appearance') {
      if (!service) throw new FileOpError('NO_VAULT', 'No vault is open');
      await service.updateAppearance(patch as Partial<AppearanceSettings>);
    } else if (scope === 'app') {
      const updated = await context.globalSettings.update(patch as Partial<AppSettings>);
      context.setAppSettings(updated);
    } else {
      throw new VaultPathError('INVALID_ARGUMENT', 'Unknown settings scope');
    }

    const next = await bundle();
    broadcast(IPC.eventSettingsChanged, { settings: next });
    return next;
  });

  handle(IPC.linksGraph, async () => requireVault().getLinks());

  handle(IPC.shellOpenExternal, async (url) => {
    if (typeof url !== 'string' || url.length > 2048) {
      throw new VaultPathError('INVALID_ARGUMENT', 'Invalid URL');
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new VaultPathError('INVALID_ARGUMENT', 'Invalid URL');
    }
    if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
      throw new VaultPathError('INVALID_ARGUMENT', 'URL protocol is not allowed');
    }
    await shell.openExternal(parsed.toString());
    return { opened: true };
  });

  handle(IPC.shellReveal, async (relative) => {
    const service = requireVault();
    const target = typeof relative === 'string' ? relative : '';
    const absolute =
      target === '' ? service.root : await service.getAbsolute(requireString(target, 'path'));
    const stat = await fs.stat(absolute);
    if (stat.isDirectory()) {
      await shell.openPath(absolute);
    } else {
      shell.showItemInFolder(path.normalize(absolute));
    }
    return { revealed: true };
  });

  return {
    dispose: async () => {
      await state.service?.dispose();
      state.service = null;
    },
  };
}

export { broadcast };
