import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC } from '../shared/ipc';
import type {
  CreateEntryRequest,
  DeleteEntryRequest,
  DuplicateEntryRequest,
  MenuCommandEvent,
  OpenVaultRequest,
  RenameEntryRequest,
  SettingsChangedEvent,
  VaultApi,
  VaultChangedEvent,
} from '../shared/ipc';
import type {
  AppSettings,
  AppearanceSettings,
  FileChangeBatch,
  PersistedWorkspaceV1,
  SearchOptions,
  SettingsScope,
  VaultSettings,
} from '../shared/types';

type Unsubscribe = () => void;

function subscribe<T>(channel: string, listener: (payload: T) => void): Unsubscribe {
  const handler = (_event: IpcRendererEvent, payload: T): void => {
    listener(payload);
  };
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const api: VaultApi & { platform: string } = {
  platform: process.platform,

  openVault: (input: OpenVaultRequest) => ipcRenderer.invoke(IPC.vaultOpen, input),
  listVaults: () => ipcRenderer.invoke(IPC.vaultList),
  chooseVault: (mode) => ipcRenderer.invoke(IPC.vaultChoose, mode),
  removeVault: (id: string) => ipcRenderer.invoke(IPC.vaultRemove, id),
  currentVault: () => ipcRenderer.invoke(IPC.vaultCurrent),
  getTree: () => ipcRenderer.invoke(IPC.vaultTree),

  readFile: (filePath: string) => ipcRenderer.invoke(IPC.fileRead, filePath),
  writeFile: (filePath: string, content: string, expectedMtimeMs?: number) =>
    ipcRenderer.invoke(IPC.fileWrite, filePath, content, expectedMtimeMs),
  createEntry: (input: CreateEntryRequest) => ipcRenderer.invoke(IPC.fileCreate, input),
  duplicateEntry: (input: DuplicateEntryRequest) => ipcRenderer.invoke(IPC.fileDuplicate, input),
  renameEntry: (input: RenameEntryRequest) => ipcRenderer.invoke(IPC.fileRename, input),
  deleteEntry: (input: DeleteEntryRequest) => ipcRenderer.invoke(IPC.fileDelete, input),
  startWatch: () => ipcRenderer.invoke(IPC.fileWatch),

  search: (options: SearchOptions) => ipcRenderer.invoke(IPC.searchQuery, options),
  getSettings: (scope: SettingsScope) => ipcRenderer.invoke(IPC.settingsGet, scope),
  setVaultSettings: (patch: Partial<VaultSettings>) =>
    ipcRenderer.invoke(IPC.settingsSet, { scope: 'vault', patch }),
  setAppearance: (patch: Partial<AppearanceSettings>) =>
    ipcRenderer.invoke(IPC.settingsSet, { scope: 'appearance', patch }),
  setAppSettings: (patch: Partial<AppSettings>) =>
    ipcRenderer.invoke(IPC.settingsSet, { scope: 'app', patch }),

  loadWorkspace: () => ipcRenderer.invoke(IPC.workspaceLoad),
  saveWorkspace: (workspace: PersistedWorkspaceV1) =>
    ipcRenderer.invoke(IPC.workspaceSave, workspace),
  getLinks: () => ipcRenderer.invoke(IPC.linksGraph),

  openExternal: (url: string) => ipcRenderer.invoke(IPC.shellOpenExternal, url),
  reveal: (filePath: string) => ipcRenderer.invoke(IPC.shellReveal, filePath),

  onFileChanged: (listener: (batch: FileChangeBatch) => void) =>
    subscribe<FileChangeBatch>(IPC.eventFileChanged, listener),
  onVaultChanged: (listener: (event: VaultChangedEvent) => void) =>
    subscribe<VaultChangedEvent>(IPC.eventVaultChanged, listener),
  onSettingsChanged: (listener: (event: SettingsChangedEvent) => void) =>
    subscribe<SettingsChangedEvent>(IPC.eventSettingsChanged, listener),
  onMenuCommand: (listener: (event: MenuCommandEvent) => void) =>
    subscribe<MenuCommandEvent>(IPC.eventMenuCommand, listener),

  notifyReadyToQuit: () => {
    ipcRenderer.send(IPC.appQuitReady);
  },
};

contextBridge.exposeInMainWorld('vaultApi', api);
