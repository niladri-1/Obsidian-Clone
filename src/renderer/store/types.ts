import type {
  AppSettings,
  AppearanceSettings,
  LinkGraph,
  PersistedWorkspaceV1,
  SettingsBundle,
  VaultInfo,
  VaultNode,
  VaultSettings,
  VaultTree,
  ViewMode,
} from '@shared/types';

export interface NoteBuffer {
  path: string;
  content: string;
  savedContent: string;
  mtimeMs: number;
  eol: 'lf' | 'crlf';
  hadBom: boolean;
  dirty: boolean;
  missing: boolean;
  conflict: boolean;
  externalContent?: string;
  externalMtimeMs?: number;
  loading?: boolean;
  error?: string;
  cursor?: { line: number; ch: number };
  scrollTop?: number;
}

export interface Toast {
  id: string;
  kind: 'info' | 'success' | 'error';
  message: string;
  actionLabel?: string;
  action?: () => void;
}

export type SettingsSection = 'editor' | 'appearance' | 'files' | 'hotkeys' | 'about';

export interface RevealRequest {
  path: string;
  text?: string;
  line?: number;
  heading?: string;
  nonce: number;
}

export interface TextPrompt {
  kind: 'rename' | 'new-note' | 'new-folder';
  path?: string;
  parentDir?: string;
  title: string;
  label: string;
  value: string;
  confirmLabel: string;
}

export interface ClosePrompt {
  paneId: string;
  path: string;
}

export interface UIState {
  paletteOpen: boolean;
  quickOpenOpen: boolean;
  settingsOpen: boolean;
  settingsSection: SettingsSection;
  graphOpen: boolean;
  graphLocal: boolean;
  focusSearchNonce: number;
  closePrompt: ClosePrompt | null;
  deleteTarget: { path: string; kind: 'file' | 'folder' } | null;
  reveal: RevealRequest | null;
  textPrompt: TextPrompt | null;
}

export interface AppStore {
  status: 'loading' | 'picker' | 'error' | 'ready';
  bootError: string | null;
  vault: VaultInfo | null;
  vaults: VaultInfo[];
  lastVaultId: string | null;
  tree: VaultTree;
  settings: SettingsBundle;
  workspace: PersistedWorkspaceV1;
  buffers: Record<string, NoteBuffer>;
  links: LinkGraph;
  histories: Record<string, { stack: string[]; index: number }>;
  ui: UIState;
  toasts: Toast[];

  bootstrap: () => Promise<void>;
  refreshVaultList: () => Promise<void>;
  chooseAndOpenVault: (mode: 'open' | 'create') => Promise<void>;
  openVaultByPath: (path: string, create?: boolean) => Promise<void>;
  removeVault: (id: string) => Promise<void>;
  showPicker: () => Promise<void>;
  returnToVault: () => void;

  openNote: (
    path: string,
    options?: {
      paneId?: string;
      newTab?: boolean;
      viewMode?: ViewMode;
      revealText?: string;
      revealHeading?: string;
      revealLine?: number;
      skipHistory?: boolean;
    },
  ) => Promise<void>;
  activateTab: (paneId: string, path: string) => Promise<void>;
  closeTab: (paneId: string, path: string, force?: boolean) => Promise<void>;
  closeOtherTabs: (paneId: string, path: string) => Promise<void>;
  closeTabsAfter: (paneId: string, path: string) => Promise<void>;
  closeAllTabs: (paneId: string) => Promise<void>;
  setActivePane: (paneId: string) => void;
  toggleSplit: () => void;
  openToSide: (path: string, direction: 'vertical' | 'horizontal') => Promise<void>;
  setSplitDirection: (direction: 'vertical' | 'horizontal') => void;
  closePane: (paneId: string) => void;
  reorderTab: (paneId: string, fromIndex: number, toIndex: number) => void;

  setContent: (path: string, content: string) => void;
  saveNote: (path: string, force?: boolean) => Promise<boolean>;
  saveAll: () => Promise<void>;
  reloadNote: (path: string) => Promise<void>;
  keepMine: (path: string) => Promise<void>;
  setViewMode: (path: string, mode: ViewMode) => void;
  toggleReadingView: (path: string) => void;
  setCursor: (path: string, cursor: { line: number; ch: number }) => void;
  setScroll: (path: string, scrollTop: number) => void;

  createNote: (parentDir?: string, name?: string) => Promise<void>;
  createFolder: (parentDir?: string, name?: string) => Promise<void>;
  duplicateEntry: (path: string) => Promise<void>;
  requestDelete: (path: string, kind: 'file' | 'folder') => void;
  /** `target` lets `requestDelete` delete immediately when confirmation is disabled. */
  confirmDelete: (target?: { path: string; kind: 'file' | 'folder' }) => Promise<void>;
  renameEntry: (path: string, newName: string) => Promise<void>;
  openDailyNote: () => Promise<void>;

  toggleFolder: (path: string) => void;
  setExpandedFolders: (folders: string[]) => void;
  setLeftOpen: (open: boolean) => void;
  setRightOpen: (open: boolean) => void;
  setLeftWidth: (width: number) => void;
  setRightWidth: (width: number) => void;
  setActiveLeftView: (view: 'files' | 'search') => void;
  setActiveRightView: (view: 'outline' | 'backlinks' | 'properties') => void;
  focusSearch: () => void;

  updateVaultSettings: (patch: Partial<VaultSettings>) => Promise<void>;
  updateAppearance: (patch: Partial<AppearanceSettings>) => Promise<void>;
  updateAppSettings: (patch: Partial<AppSettings>) => Promise<void>;

  goBack: () => Promise<void>;
  goForward: () => Promise<void>;

  persistWorkspace: (immediate?: boolean) => Promise<void>;
  handleFileBatch: (batch: { added: string[]; changed: string[]; removed: string[] }) => Promise<void>;
  handleVaultChanged: (payload: { tree: VaultTree; links: LinkGraph }) => void;
  handleSettingsChanged: (payload: { settings: SettingsBundle }) => void;

  setReveal: (request: Omit<RevealRequest, 'nonce'>) => void;
  clearReveal: (nonce: number) => void;
  openTextPrompt: (prompt: TextPrompt) => void;
  closeTextPrompt: () => void;
  submitTextPrompt: (value: string) => Promise<void>;
  /** Reverts a buffer to its last saved text without writing, used by "Discard". */
  discardNote: (path: string) => void;
  setClosePrompt: (prompt: ClosePrompt | null) => void;
  setDeleteTarget: (target: { path: string; kind: 'file' | 'folder' } | null) => void;
  setPaletteOpen: (open: boolean) => void;
  setQuickOpenOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean, section?: SettingsSection) => void;
  setGraphOpen: (open: boolean) => void;
  setGraphLocal: (local: boolean) => void;
  pushToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
}

export interface PaneContext {
  node: VaultNode;
  depth: number;
}

export function emptyTree(): VaultTree {
  return {
    root: { path: '', name: 'Vault', kind: 'folder', children: [] },
    files: [],
    folders: [],
  };
}

export function emptyLinks(): LinkGraph {
  return { nodes: [], edges: [], unresolved: [] };
}

export function defaultWorkspace(): PersistedWorkspaceV1 {
  return {
    version: 1,
    panes: [{ id: 'pane-1', tabs: [], activeTab: null }],
    activePaneId: 'pane-1',
    splitDirection: 'vertical',
    leftOpen: true,
    rightOpen: true,
    leftWidth: 260,
    rightWidth: 300,
    activeLeftView: 'files',
    activeRightView: 'outline',
    recentFiles: [],
    expandedFolders: [],
    viewModes: {},
  };
}
