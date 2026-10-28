import type {
  AppSettings,
  AppearanceSettings,
  FileChangeBatch,
  IpcResult,
  LinkGraph,
  OpenVaultResult,
  PersistedWorkspaceV1,
  ReadFileResult,
  SearchOptions,
  SearchResponse,
  SettingsBundle,
  SettingsScope,
  VaultInfo,
  VaultListResult,
  VaultSettings,
  VaultTree,
  WriteFileResult,
} from './types';

export const IPC = {
  vaultOpen: 'vault:open',
  vaultList: 'vault:list',
  vaultChoose: 'vault:choose',
  vaultRemove: 'vault:remove',
  vaultCurrent: 'vault:current',
  vaultTree: 'vault:tree',
  workspaceLoad: 'workspace:load',
  workspaceSave: 'workspace:save',
  fileRead: 'file:read',
  fileWrite: 'file:write',
  fileCreate: 'file:create',
  fileDuplicate: 'file:duplicate',
  fileRename: 'file:rename',
  fileDelete: 'file:delete',
  fileWatch: 'file:watch',
  searchQuery: 'search:query',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  linksGraph: 'links:graph',
  shellOpenExternal: 'shell:open-external',
  shellReveal: 'shell:reveal',
  appQuitReady: 'app:quit-ready',
  // events
  eventFileChanged: 'file:changed',
  eventVaultChanged: 'vault:changed',
  eventSettingsChanged: 'settings:changed',
  eventMenuCommand: 'app:menu-command',
} as const;

export const LIMITS = {
  maxNoteBytes: 5 * 1024 * 1024,
  maxPathLength: 4096,
  maxQueryLength: 512,
  maxSearchResults: 200,
  maxRelNameLength: 240,
} as const;

export interface OpenVaultRequest {
  path: string;
  create?: boolean;
}

export interface CreateEntryRequest {
  path: string;
  kind: 'file' | 'folder';
  content?: string;
}

export interface DuplicateEntryRequest {
  path: string;
}

export interface RenameEntryRequest {
  path: string;
  newPath: string;
  updateLinks?: boolean;
}

export interface DeleteEntryRequest {
  path: string;
}

export interface RenameEntryResult {
  path: string;
  newPath: string;
  tree: VaultTree;
  links: LinkGraph;
  linksUpdated: number;
}

export interface DuplicateEntryResult {
  sourcePath: string;
  path: string;
  tree: VaultTree;
  links: LinkGraph;
}

export interface DeleteEntryResult {
  path: string;
  tree: VaultTree;
  links: LinkGraph;
}

export interface CreateEntryResult {
  path: string;
  kind: 'file' | 'folder';
  tree: VaultTree;
  links: LinkGraph;
}

export interface ChooseVaultResult {
  path: string | null;
}

export interface VaultChangedEvent {
  tree: VaultTree;
  links: LinkGraph;
}

export interface SettingsChangedEvent {
  settings: SettingsBundle;
}

export interface MenuCommandEvent {
  command: string;
}

export interface VaultApi {
  openVault(input: OpenVaultRequest): Promise<IpcResult<OpenVaultResult>>;
  listVaults(): Promise<IpcResult<VaultListResult>>;
  chooseVault(mode: 'open' | 'create'): Promise<IpcResult<ChooseVaultResult>>;
  removeVault(id: string): Promise<IpcResult<{ removed: boolean }>>;
  currentVault(): Promise<IpcResult<VaultInfo | null>>;
  getTree(): Promise<IpcResult<VaultChangedEvent>>;
  readFile(path: string): Promise<IpcResult<ReadFileResult>>;
  writeFile(
    path: string,
    content: string,
    expectedMtimeMs?: number,
  ): Promise<IpcResult<WriteFileResult>>;
  createEntry(input: CreateEntryRequest): Promise<IpcResult<CreateEntryResult>>;
  duplicateEntry(input: DuplicateEntryRequest): Promise<IpcResult<DuplicateEntryResult>>;
  renameEntry(input: RenameEntryRequest): Promise<IpcResult<RenameEntryResult>>;
  deleteEntry(input: DeleteEntryRequest): Promise<IpcResult<DeleteEntryResult>>;
  startWatch(): Promise<IpcResult<{ watching: boolean }>>;
  search(options: SearchOptions): Promise<IpcResult<SearchResponse>>;
  getSettings(scope: SettingsScope): Promise<IpcResult<SettingsBundle>>;
  setVaultSettings(patch: Partial<VaultSettings>): Promise<IpcResult<SettingsBundle>>;
  setAppearance(patch: Partial<AppearanceSettings>): Promise<IpcResult<SettingsBundle>>;
  setAppSettings(patch: Partial<AppSettings>): Promise<IpcResult<SettingsBundle>>;
  loadWorkspace(): Promise<IpcResult<PersistedWorkspaceV1 | null>>;
  saveWorkspace(workspace: PersistedWorkspaceV1): Promise<IpcResult<{ saved: boolean }>>;
  getLinks(): Promise<IpcResult<LinkGraph>>;
  openExternal(url: string): Promise<IpcResult<{ opened: boolean }>>;
  reveal(path: string): Promise<IpcResult<{ revealed: boolean }>>;
  /** Signals that pending saves are flushed and the window may close. */
  notifyReadyToQuit(): void;
  onFileChanged(listener: (batch: FileChangeBatch) => void): () => void;
  onVaultChanged(listener: (event: VaultChangedEvent) => void): () => void;
  onSettingsChanged(listener: (event: SettingsChangedEvent) => void): () => void;
  onMenuCommand(listener: (event: MenuCommandEvent) => void): () => void;
}

/** The exact object bridged by the preload script (`window.vaultApi`). */
export interface RendererApi extends VaultApi {
  platform: string;
}
