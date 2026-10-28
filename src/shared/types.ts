export type ViewMode = 'source' | 'reading';

export type NodeKind = 'file' | 'folder';

export interface VaultInfo {
  id: string;
  path: string;
  name: string;
  lastOpenedAt: number;
  missing?: boolean;
}

export interface VaultNode {
  path: string;
  name: string;
  kind: NodeKind;
  children?: VaultNode[];
  mtimeMs?: number;
  size?: number;
}

export interface VaultTree {
  root: VaultNode;
  files: string[];
  folders: string[];
}

export interface VaultSettings {
  alwaysUpdateLinks: boolean;
  autoPairBrackets: boolean;
  defaultViewMode: ViewMode;
  newFileLocation: 'root' | 'current' | 'folder';
  newFileFolderPath: string;
  attachmentFolderPath: string;
  trashOption: 'local' | 'permanent';
  useMarkdownLinks: boolean;
  readableLineLength: boolean;
  showInlineTitle: boolean;
  showLineNumber: boolean;
  useTab: boolean;
  tabSize: number;
  livePreview: boolean;
  spellcheck: boolean;
  propertiesInDocument: 'visible' | 'hidden';
  promptDelete: boolean;
}

export interface AppearanceSettings {
  theme: 'system' | 'light' | 'dark';
  accentColor: string;
  baseFontSize: number;
  fontFamily: string;
  editorFontFamily: string;
}

export interface AppSettings {
  theme: 'system' | 'light' | 'dark';
  zoom: number;
  lastVaultId: string | null;
  ctrlScrollZoom: boolean;
}

export interface ReadFileResult {
  path: string;
  content: string;
  mtimeMs: number;
  size: number;
  eol: 'lf' | 'crlf';
  hadBom: boolean;
}

export interface WriteFileResult {
  path: string;
  mtimeMs: number;
  size: number;
  tree?: VaultTree;
  links?: LinkGraph;
}

export interface SearchResult {
  path: string;
  title: string;
  score: number;
  snippet: string;
  matchStart: number;
  matchLength: number;
}

export interface SearchOptions {
  query: string;
  limit?: number;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  tookMs: number;
  error?: string;
}

export interface LinkEdge {
  from: string;
  target: string;
  to: string | null;
  embed: boolean;
  alias?: string;
  heading?: string;
}

export interface GraphNode {
  path: string;
  title: string;
  linkCount: number;
}

export interface LinkGraph {
  nodes: GraphNode[];
  edges: LinkEdge[];
  unresolved: Array<{ from: string; target: string }>;
}

export interface PaneState {
  id: string;
  tabs: string[];
  activeTab: string | null;
}

export interface WorkspaceState {
  panes: PaneState[];
  activePaneId: string;
  splitDirection: 'vertical' | 'horizontal';
  leftOpen: boolean;
  rightOpen: boolean;
  leftWidth: number;
  rightWidth: number;
  activeLeftView: 'files' | 'search';
  activeRightView: 'outline' | 'backlinks' | 'properties';
  recentFiles: string[];
  expandedFolders: string[];
  /** Per-note source/reading mode, keyed by vault-relative path. */
  viewModes: Record<string, ViewMode>;
}

export interface PersistedWorkspaceV1 {
  version: 1;
  panes: PaneState[];
  activePaneId: string;
  splitDirection: 'vertical' | 'horizontal';
  leftOpen: boolean;
  rightOpen: boolean;
  leftWidth: number;
  rightWidth: number;
  activeLeftView: 'files' | 'search';
  activeRightView: 'outline' | 'backlinks' | 'properties';
  recentFiles: string[];
  expandedFolders: string[];
  /** Per-note source/reading mode, keyed by vault-relative path. */
  viewModes: Record<string, ViewMode>;
}

export interface OpenVaultResult {
  vault: VaultInfo;
  tree: VaultTree;
  settings: VaultSettings;
  appearance: AppearanceSettings;
  workspace: PersistedWorkspaceV1 | null;
  links: LinkGraph;
}

export interface VaultListResult {
  vaults: VaultInfo[];
  lastVaultId: string | null;
}

export interface FileChangeBatch {
  added: string[];
  changed: string[];
  removed: string[];
}

export type IpcErrorCode =
  | 'INVALID_ARGUMENT'
  | 'OUTSIDE_VAULT'
  | 'NOT_FOUND'
  | 'EXISTS'
  | 'CONFLICT'
  | 'TOO_LARGE'
  | 'UNSUPPORTED'
  | 'IO_ERROR'
  | 'NO_VAULT'
  | 'UNKNOWN';

export interface IpcError {
  code: IpcErrorCode;
  message: string;
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError };

export interface SettingsBundle {
  vault: VaultSettings;
  appearance: AppearanceSettings;
  app: AppSettings;
}

export type SettingsScope = 'vault' | 'appearance' | 'app';
