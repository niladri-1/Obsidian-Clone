import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeRelPath } from '../../shared/paths';
import type {
  AppSettings,
  AppearanceSettings,
  PaneState,
  PersistedWorkspaceV1,
  VaultSettings,
} from '../../shared/types';
import { atomicWriteAbsolute, pathExists } from './fsops';

export const DEFAULT_VAULT_SETTINGS: VaultSettings = {
  alwaysUpdateLinks: false,
  autoPairBrackets: true,
  defaultViewMode: 'source',
  newFileLocation: 'root',
  newFileFolderPath: '/',
  attachmentFolderPath: '/',
  trashOption: 'local',
  useMarkdownLinks: false,
  readableLineLength: true,
  showInlineTitle: true,
  showLineNumber: false,
  useTab: true,
  tabSize: 4,
  livePreview: true,
  spellcheck: true,
  propertiesInDocument: 'visible',
  promptDelete: true,
};

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  theme: 'system',
  accentColor: '',
  baseFontSize: 16,
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: 'system',
  zoom: 1,
  lastVaultId: null,
};

const VAULT_KEYS = new Set(Object.keys(DEFAULT_VAULT_SETTINGS));
const APPEARANCE_KEYS = new Set(Object.keys(DEFAULT_APPEARANCE));
const APP_KEYS = new Set(Object.keys(DEFAULT_APP_SETTINGS));

async function readJsonFile(
  file: string,
  backupOnCorrupt = true,
): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    if (!raw.trim()) return {};
    const parsed: unknown = JSON.parse(raw.replace(/^\uFEFF/, ''));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return {};
    if (backupOnCorrupt && error instanceof SyntaxError) {
      const backup = `${file}.corrupt-${Date.now()}`;
      await fs.rename(file, backup).catch(() => undefined);
    }
    return {};
  }
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function asFolder(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed || trimmed === '/') return '/';
  try {
    return normalizeRelPath(trimmed);
  } catch {
    return fallback;
  }
}

function asNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function sanitizeVaultSettings(raw: Record<string, unknown>): VaultSettings {
  return {
    alwaysUpdateLinks: asBoolean(raw.alwaysUpdateLinks, DEFAULT_VAULT_SETTINGS.alwaysUpdateLinks),
    autoPairBrackets: asBoolean(raw.autoPairBrackets, DEFAULT_VAULT_SETTINGS.autoPairBrackets),
    defaultViewMode: asEnum(raw.defaultViewMode, ['source', 'reading'] as const, 'source'),
    newFileLocation: asEnum(
      raw.newFileLocation,
      ['root', 'current', 'folder'] as const,
      DEFAULT_VAULT_SETTINGS.newFileLocation,
    ),
    newFileFolderPath: asFolder(raw.newFileFolderPath, DEFAULT_VAULT_SETTINGS.newFileFolderPath),
    attachmentFolderPath: asFolder(
      raw.attachmentFolderPath,
      DEFAULT_VAULT_SETTINGS.attachmentFolderPath,
    ),
    trashOption:
      raw.trashOption === 'permanent'
        ? 'permanent'
        : raw.trashOption === 'local' || raw.trashOption === 'system'
          ? 'local'
          : DEFAULT_VAULT_SETTINGS.trashOption,
    useMarkdownLinks: asBoolean(raw.useMarkdownLinks, DEFAULT_VAULT_SETTINGS.useMarkdownLinks),
    readableLineLength: asBoolean(
      raw.readableLineLength,
      DEFAULT_VAULT_SETTINGS.readableLineLength,
    ),
    showInlineTitle: asBoolean(raw.showInlineTitle, DEFAULT_VAULT_SETTINGS.showInlineTitle),
    showLineNumber: asBoolean(raw.showLineNumber, DEFAULT_VAULT_SETTINGS.showLineNumber),
    useTab: asBoolean(raw.useTab, DEFAULT_VAULT_SETTINGS.useTab),
    tabSize: asNumber(raw.tabSize, DEFAULT_VAULT_SETTINGS.tabSize, 1, 8),
    livePreview: asBoolean(raw.livePreview, DEFAULT_VAULT_SETTINGS.livePreview),
    spellcheck: asBoolean(raw.spellcheck, DEFAULT_VAULT_SETTINGS.spellcheck),
    propertiesInDocument: asEnum(
      raw.propertiesInDocument,
      ['visible', 'hidden'] as const,
      DEFAULT_VAULT_SETTINGS.propertiesInDocument,
    ),
    promptDelete: asBoolean(raw.promptDelete, DEFAULT_VAULT_SETTINGS.promptDelete),
  };
}

export function sanitizeAppearance(raw: Record<string, unknown>): AppearanceSettings {
  const accent = typeof raw.accentColor === 'string' && /^#[0-9a-f]{6}$/i.test(raw.accentColor)
    ? raw.accentColor.toLowerCase()
    : '';
  return {
    theme: asEnum(raw.theme, ['system', 'light', 'dark'] as const, 'system'),
    accentColor: accent,
    baseFontSize: asNumber(raw.baseFontSize, DEFAULT_APPEARANCE.baseFontSize, 10, 32),
  };
}

export function sanitizeAppSettings(raw: Record<string, unknown>): AppSettings {
  return {
    theme: asEnum(raw.theme, ['system', 'light', 'dark'] as const, 'system'),
    zoom: typeof raw.zoom === 'number' && raw.zoom >= 0.5 && raw.zoom <= 2 ? raw.zoom : 1,
    lastVaultId: typeof raw.lastVaultId === 'string' ? raw.lastVaultId : null,
  };
}

function sanitizeWorkspace(raw: unknown): PersistedWorkspaceV1 | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Record<string, unknown>;
  if (candidate.version !== 1 || !Array.isArray(candidate.panes)) return null;

  const panes: PaneState[] = candidate.panes
    .slice(0, 4)
    .map((pane, index) => {
      const entry = (pane ?? {}) as Record<string, unknown>;
      const tabs = Array.isArray(entry.tabs)
        ? entry.tabs.filter((tab): tab is string => typeof tab === 'string').slice(0, 100)
        : [];
      const activeTab =
        typeof entry.activeTab === 'string' && tabs.includes(entry.activeTab)
          ? entry.activeTab
          : (tabs[0] ?? null);
      return {
        id: typeof entry.id === 'string' && entry.id ? entry.id : `pane-${index + 1}`,
        tabs,
        activeTab,
      };
    });

  if (panes.length === 0) panes.push({ id: 'pane-1', tabs: [], activeTab: null });

  const activePaneId =
    typeof candidate.activePaneId === 'string' &&
    panes.some((pane) => pane.id === candidate.activePaneId)
      ? candidate.activePaneId
      : panes[0]!.id;

  const recentFiles = Array.isArray(candidate.recentFiles)
    ? [
        ...new Set(
          candidate.recentFiles
            .filter((entry): entry is string => typeof entry === 'string')
            .slice(0, 200),
        ),
      ].slice(0, 40)
    : [];

  const expandedFolders = Array.isArray(candidate.expandedFolders)
    ? candidate.expandedFolders
        .filter((entry): entry is string => typeof entry === 'string')
        .slice(0, 2000)
    : [];

  const viewModes: Record<string, 'source' | 'reading'> = {};
  if (candidate.viewModes && typeof candidate.viewModes === 'object' && !Array.isArray(candidate.viewModes)) {
    for (const [path, mode] of Object.entries(candidate.viewModes as Record<string, unknown>)) {
      if (path.length > 4096) continue;
      if (mode === 'source' || mode === 'reading') viewModes[path] = mode;
    }
  }

  return {
    version: 1,
    panes,
    activePaneId,
    splitDirection: candidate.splitDirection === 'horizontal' ? 'horizontal' : 'vertical',
    leftOpen: candidate.leftOpen !== false,
    rightOpen: candidate.rightOpen !== false,
    leftWidth: asNumber(candidate.leftWidth, 260, 160, 520),
    rightWidth: asNumber(candidate.rightWidth, 300, 160, 520),
    activeLeftView: candidate.activeLeftView === 'search' ? 'search' : 'files',
    activeRightView: asEnum(
      candidate.activeRightView,
      ['outline', 'backlinks', 'properties'] as const,
      'outline',
    ),
    recentFiles,
    expandedFolders,
    viewModes,
  };
}

export class VaultSettingsStore {
  private readonly configDir: string;
  private readonly appFile: string;
  private readonly appearanceFile: string;
  private readonly workspaceFile: string;
  private appAliases: Record<string, unknown> = {};
  private appearanceAliases: Record<string, unknown> = {};
  private workspaceAliases: Record<string, unknown> = {};

  private settings: VaultSettings = { ...DEFAULT_VAULT_SETTINGS };
  private appearance: AppearanceSettings = { ...DEFAULT_APPEARANCE };

  constructor(root: string) {
    this.configDir = path.join(root, '.obsidia');
    this.appFile = path.join(this.configDir, 'app.json');
    this.appearanceFile = path.join(this.configDir, 'appearance.json');
    this.workspaceFile = path.join(this.configDir, 'workspace.json');
  }

  get configDirectory(): string {
    return this.configDir;
  }

  get workspacePath(): string {
    return this.workspaceFile;
  }

  async load(): Promise<{ settings: VaultSettings; appearance: AppearanceSettings }> {
    await fs.mkdir(this.configDir, { recursive: true });
    const appRaw = await readJsonFile(this.appFile);
    const appearanceRaw = await readJsonFile(this.appearanceFile);
    this.appAliases = this.collectUnknown(appRaw, VAULT_KEYS);
    this.appearanceAliases = this.collectUnknown(appearanceRaw, APPEARANCE_KEYS);
    this.settings = sanitizeVaultSettings(appRaw);
    this.appearance = sanitizeAppearance(appearanceRaw);
    return { settings: { ...this.settings }, appearance: { ...this.appearance } };
  }

  private collectUnknown(raw: Record<string, unknown>, known: Set<string>): Record<string, unknown> {
    const aliases: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!known.has(key)) aliases[key] = value;
    }
    return aliases;
  }

  async updateVault(patch: Partial<VaultSettings>): Promise<VaultSettings> {
    const merged: Record<string, unknown> = { ...(this.settings as unknown as Record<string, unknown>) };
    for (const [key, value] of Object.entries(patch)) {
      if (VAULT_KEYS.has(key)) merged[key] = value;
    }
    this.settings = sanitizeVaultSettings(merged);
    await this.writeJson(this.appFile, {
      ...this.appAliases,
      ...(this.settings as unknown as Record<string, unknown>),
    });
    return { ...this.settings };
  }

  async updateAppearance(patch: Partial<AppearanceSettings>): Promise<AppearanceSettings> {
    const merged: Record<string, unknown> = {
      ...(this.appearance as unknown as Record<string, unknown>),
    };
    for (const [key, value] of Object.entries(patch)) {
      if (APPEARANCE_KEYS.has(key)) merged[key] = value;
    }
    this.appearance = sanitizeAppearance(merged);
    await this.writeJson(this.appearanceFile, {
      ...this.appearanceAliases,
      ...(this.appearance as unknown as Record<string, unknown>),
    });
    return { ...this.appearance };
  }

  async readWorkspace(): Promise<PersistedWorkspaceV1 | null> {
    const raw = await readJsonFile(this.workspaceFile);
    this.workspaceAliases = raw;
    return sanitizeWorkspace(raw.clone);
  }

  async writeWorkspace(workspace: PersistedWorkspaceV1): Promise<void> {
    const cleaned = sanitizeWorkspace(workspace);
    if (!cleaned) return;
    const payload = {
      ...this.workspaceAliases,
      clone: cleaned,
      lastOpenFiles: cleaned.recentFiles.slice(0, 40),
    };
    await this.writeJson(this.workspaceFile, payload);
  }

  private async writeJson(file: string, payload: Record<string, unknown>): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const text = `${JSON.stringify(payload, null, 2)}\n`;
    await atomicWriteAbsolute(file, text, { eol: '\n' });
  }
}

export class GlobalSettingsStore {
  private readonly file: string;
  private aliases: Record<string, unknown> = {};
  private settings: AppSettings = { ...DEFAULT_APP_SETTINGS };

  constructor(userDataDirectory: string) {
    this.file = path.join(userDataDirectory, 'settings.json');
  }

  async load(): Promise<AppSettings> {
    const raw = await readJsonFile(this.file);
    this.aliases = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!APP_KEYS.has(key)) this.aliases[key] = value;
    }
    this.settings = sanitizeAppSettings(raw);
    return { ...this.settings };
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    const merged: Record<string, unknown> = { ...(this.settings as unknown as Record<string, unknown>) };
    for (const [key, value] of Object.entries(patch)) {
      if (APP_KEYS.has(key)) merged[key] = value;
    }
    this.settings = sanitizeAppSettings(merged);
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await atomicWriteAbsolute(
      this.file,
      `${JSON.stringify({ ...this.aliases, ...this.settings }, null, 2)}\n`,
      { eol: '\n' },
    );
    return { ...this.settings };
  }
}

export async function backupIfCorrupt(file: string): Promise<boolean> {
  if (!(await pathExists(file))) return false;
  try {
    const raw = await fs.readFile(file, 'utf8');
    JSON.parse(raw);
    return false;
  } catch {
    await fs.rename(file, `${file}.corrupt-${Date.now()}`).catch(() => undefined);
    return true;
  }
}
