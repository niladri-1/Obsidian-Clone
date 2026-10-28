import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { buildLinkGraph, rewriteLinks, buildFileIndex } from '../../shared/links';
import { basename, dirname, isMarkdownPath, noteTitle, toPosix } from '../../shared/paths';
import type {
  AppearanceSettings,
  LinkGraph,
  PersistedWorkspaceV1,
  ReadFileResult,
  SearchOptions,
  SearchResponse,
  VaultInfo,
  VaultSettings,
  VaultTree,
  WriteFileResult,
  FileChangeBatch,
} from '../../shared/types';
import {
  FileOpError,
  copyEntryAbsolute,
  createEntryAbsolute,
  deleteToTrash,
  pathExists,
  readTextFile,
  renameAbsolute,
  uniquePath,
  writeTextFile,
} from './fsops';
import {
  assertValidName,
  canonicalizeRoot,
  resolveInVault,
  VaultPathError,
} from './paths';
import { buildTree } from './tree';
import { SearchIndex } from './search';
import { VaultSettingsStore } from './settings';
import { VaultWatcher } from './watcher';

export interface VaultServiceEvents {
  onFileBatch: (batch: FileChangeBatch) => void;
  onVaultChanged: () => void;
  onError: (error: Error) => void;
}

function aliasesOf(content: string): string[] {
  try {
    const data = matter(content).data as Record<string, unknown>;
    const value = data.aliases ?? data.alias;
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
  } catch {
    // Malformed frontmatter is ignored for alias resolution.
  }
  return [];
}

export class VaultService {
  readonly root: string;
  readonly info: VaultInfo;
  readonly settingsStore: VaultSettingsStore;
  readonly search = new SearchIndex();

  private settings: VaultSettings;
  private appearance: AppearanceSettings;
  private tree: VaultTree;
  private contents = new Map<string, string>();
  private aliases = new Map<string, string[]>();
  private links: LinkGraph;
  private watcher: VaultWatcher | null = null;
  private queue: Promise<void> = Promise.resolve();
  private loadedFileCount = 0;

  private constructor(
    info: VaultInfo,
    root: string,
    settingsStore: VaultSettingsStore,
    settings: VaultSettings,
    appearance: AppearanceSettings,
    tree: VaultTree,
    links: LinkGraph,
  ) {
    this.info = info;
    this.root = root;
    this.settingsStore = settingsStore;
    this.settings = settings;
    this.appearance = appearance;
    this.tree = tree;
    this.links = links;
  }

  static async create(
    info: VaultInfo,
    events: VaultServiceEvents,
  ): Promise<VaultService> {
    const root = await canonicalizeRoot(info.path);
    const settingsStore = new VaultSettingsStore(root);
    const { settings, appearance } = await settingsStore.load();
    const tree = await buildTree(root);
    const service = new VaultService(
      info,
      root,
      settingsStore,
      settings,
      appearance,
      tree,
      { nodes: [], edges: [], unresolved: [] },
    );
    await service.loadAllContents();
    service.rebuildDerived();
    service.startWatcher(events);
    return service;
  }

  private async loadAllContents(): Promise<void> {
    this.contents.clear();
    this.aliases.clear();
    this.loadedFileCount = 0;
    const markdownFiles = this.tree.files.filter(isMarkdownPath);
    const concurrency = 8;
    let cursor = 0;

    const worker = async (): Promise<void> => {
      while (cursor < markdownFiles.length) {
        const relative = markdownFiles[cursor]!;
        cursor += 1;
        try {
          const absolute = await resolveInVault(this.root, relative);
          const result = await readTextFile(absolute, relative);
          this.contents.set(relative, result.content);
          this.aliases.set(relative, aliasesOf(result.content));
          this.loadedFileCount += 1;
        } catch {
          // Unreadable or oversized notes are skipped rather than blocking vault open.
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, markdownFiles.length) }, worker));
  }

  private rebuildDerived(): void {
    const markdownPaths = [...this.contents.keys()].sort((a, b) => a.localeCompare(b));
    const aliasRecord: Record<string, string[]> = {};
    for (const [key, value] of this.aliases) aliasRecord[key] = value;
    this.links = buildLinkGraph({
      markdownPaths,
      contents: this.contents,
      allPaths: this.tree.files,
      aliases: aliasRecord,
    });
    this.search.rebuild(this.contents, aliasRecord);
  }

  private startWatcher(events: VaultServiceEvents): void {
    this.watcher = new VaultWatcher(
      this.root,
      (batch) => {
        this.queue = this.queue
          .then(() => this.applyBatch(batch, events))
          .catch((error: unknown) => {
            events.onError(error instanceof Error ? error : new Error(String(error)));
          });
      },
      (error) => events.onError(error),
    );
    void this.watcher.start().catch((error: unknown) => {
      events.onError(error instanceof Error ? error : new Error(String(error)));
    });
  }

  private async applyBatch(batch: FileChangeBatch, events: VaultServiceEvents): Promise<void> {
    this.tree = await buildTree(this.root);

    const current = new Set(this.tree.files.filter(isMarkdownPath));
    for (const relative of [...this.contents.keys()]) {
      if (!current.has(relative)) {
        this.contents.delete(relative);
        this.aliases.delete(relative);
        this.search.remove(relative);
      }
    }

    const touched = new Set([...batch.added, ...batch.changed]);
    for (const relative of touched) {
      if (!current.has(relative)) continue;
      try {
        const absolute = await resolveInVault(this.root, relative);
        const result = await readTextFile(absolute, relative);
        this.contents.set(relative, result.content);
        const aliases = aliasesOf(result.content);
        this.aliases.set(relative, aliases);
        this.search.update(relative, result.content, aliases);
      } catch {
        // transient read failure during an external write; the next event retries
      }
    }

    for (const relative of batch.removed) {
      this.contents.delete(relative);
      this.aliases.delete(relative);
      this.search.remove(relative);
    }

    this.rebuildLinksOnly();
    events.onFileBatch(batch);
    events.onVaultChanged();
  }

  private rebuildLinksOnly(): void {
    const markdownPaths = [...this.contents.keys()].sort((a, b) => a.localeCompare(b));
    const aliasRecord: Record<string, string[]> = {};
    for (const [key, value] of this.aliases) aliasRecord[key] = value;
    this.links = buildLinkGraph({
      markdownPaths,
      contents: this.contents,
      allPaths: this.tree.files,
      aliases: aliasRecord,
    });
  }

  getTree(): VaultTree {
    return this.tree;
  }

  getLinks(): LinkGraph {
    return this.links;
  }

  getSettings(): VaultSettings {
    return { ...this.settings };
  }

  getAppearance(): AppearanceSettings {
    return { ...this.appearance };
  }

  getWorkspace(): Promise<PersistedWorkspaceV1 | null> {
    return this.settingsStore.readWorkspace();
  }

  saveWorkspace(workspace: PersistedWorkspaceV1): Promise<void> {
    return this.settingsStore.writeWorkspace(workspace);
  }

  async updateVaultSettings(patch: Partial<VaultSettings>): Promise<VaultSettings> {
    this.settings = await this.settingsStore.updateVault(patch);
    return { ...this.settings };
  }

  async updateAppearance(patch: Partial<AppearanceSettings>): Promise<AppearanceSettings> {
    this.appearance = await this.settingsStore.updateAppearance(patch);
    return { ...this.appearance };
  }

  async readFile(relative: string): Promise<ReadFileResult> {
    if (!isMarkdownPath(relative)) {
      throw new FileOpError('UNSUPPORTED', 'Only Markdown notes can be opened in the editor');
    }
    const absolute = await resolveInVault(this.root, relative);
    return readTextFile(absolute, relative);
  }

  async writeFile(
    relative: string,
    content: string,
    expectedMtimeMs?: number,
  ): Promise<WriteFileResult> {
    if (!isMarkdownPath(relative)) {
      throw new FileOpError('UNSUPPORTED', 'Only Markdown notes can be written');
    }
    const absolute = await resolveInVault(this.root, relative);
    const result = await writeTextFile(absolute, relative, content, expectedMtimeMs);
    this.contents.set(relative, content);
    const aliases = aliasesOf(content);
    this.aliases.set(relative, aliases);
    this.search.update(relative, content, aliases);
    this.rebuildLinksOnly();
    return { ...result, links: this.links };
  }

  async createEntry(
    relative: string,
    kind: 'file' | 'folder',
    content?: string,
  ): Promise<{ path: string; kind: 'file' | 'folder' }> {
    let target = toPosix(relative).replace(/^\/+/, '');
    if (kind === 'file' && !/\.[a-z0-9]{1,8}$/i.test(basename(target))) {
      target = `${target}.md`;
    }
    if (!target) throw new VaultPathError('INVALID_ARGUMENT', 'A name is required');
    assertValidName(basename(target));
    const absolute = await resolveInVault(this.root, target);
    if (await pathExists(absolute)) throw new FileOpError('EXISTS', `${basename(target)} already exists`);
    const fileContent = kind === 'file' ? (content ?? `# ${noteTitle(target)}\n`) : '';
    await createEntryAbsolute(absolute, kind, fileContent);
    this.tree = await buildTree(this.root);
    if (kind === 'file' && isMarkdownPath(target)) {
      this.contents.set(target, fileContent);
      const aliases = aliasesOf(fileContent);
      this.aliases.set(target, aliases);
      this.search.update(target, fileContent, aliases);
      this.rebuildLinksOnly();
    }
    return { path: target, kind };
  }

  async suggestUntitledPath(folder: string, extension = '.md'): Promise<string> {
    const directory = folder.replace(/^\/+|\/+$/g, '');
    const absolute = await resolveInVault(this.root, directory, { allowRoot: true });
    return uniquePath(absolute, directory, 'Untitled', extension);
  }

  async duplicateEntry(relative: string): Promise<{ sourcePath: string; path: string }> {
    const absolute = await resolveInVault(this.root, relative);
    const stat = await fs.stat(absolute);
    const folder = dirname(relative);
    const folderAbsolute = await resolveInVault(this.root, folder, { allowRoot: true });
    let target: string;
    if (stat.isDirectory()) {
      target = await uniquePath(folderAbsolute, folder, basename(relative));
    } else {
      const extension = path.extname(relative);
      const base = path.basename(relative, extension);
      target = await uniquePath(folderAbsolute, folder, base, extension);
    }
    const targetAbsolute = await resolveInVault(this.root, target);
    await copyEntryAbsolute(absolute, targetAbsolute);
    this.tree = await buildTree(this.root);
    if (stat.isDirectory()) {
      await this.loadAllContents();
    } else if (isMarkdownPath(target)) {
      try {
        const result = await readTextFile(targetAbsolute, target);
        this.contents.set(target, result.content);
        const aliases = aliasesOf(result.content);
        this.aliases.set(target, aliases);
        this.search.update(target, result.content, aliases);
      } catch {
        // The watcher will index the copy on its next batch if this read races the write.
      }
    }
    this.rebuildDerived();
    return { sourcePath: relative, path: target };
  }

  async renameEntry(
    relative: string,
    newRelative: string,
    updateLinks: boolean,
  ): Promise<{ path: string; newPath: string; linksUpdated: number }> {
    const target = toPosix(newRelative).replace(/^\/+/, '');
    assertValidName(basename(target));
    if (dirname(relative) !== dirname(target)) {
      throw new VaultPathError('INVALID_ARGUMENT', 'Rename must stay in the same folder');
    }
    if (relative === target) return { path: relative, newPath: target, linksUpdated: 0 };

    const oldAbsolute = await resolveInVault(this.root, relative);
    const newAbsolute = await resolveInVault(this.root, target);
    if (await pathExists(newAbsolute)) throw new FileOpError('EXISTS', `${basename(target)} already exists`);

    const stat = await fs.stat(oldAbsolute);
    const isFolder = stat.isDirectory();
    if (isFolder && target.startsWith(`${relative}/`)) {
      throw new VaultPathError('INVALID_ARGUMENT', 'Cannot move a folder inside itself');
    }

    const oldFiles = this.tree.files;
    const oldIndex = buildFileIndex(oldFiles, this.aliasRecord());
    const targetMap = new Map<string, string>();
    const newAllPaths: string[] = [];

    for (const file of oldFiles) {
      let mapped = file;
      if (file === relative || file.startsWith(`${relative}/`)) {
        mapped = target + file.slice(relative.length);
      }
      targetMap.set(file, mapped);
      newAllPaths.push(mapped);
    }

    await renameAbsolute(oldAbsolute, newAbsolute);
    this.tree = await buildTree(this.root);

    let linksUpdated = 0;
    if (updateLinks) {
      for (const [oldSource, content] of [...this.contents.entries()]) {
        if (!isMarkdownPath(oldSource)) continue;
        const newSource = targetMap.get(oldSource) ?? oldSource;
        const result = rewriteLinks(content, {
          targetMap,
          sourcePath: newSource,
          index: oldIndex,
          allPaths: newAllPaths,
          useMarkdownLinks: this.settings.useMarkdownLinks,
        });
        if (result.changed === 0) continue;
        linksUpdated += result.changed;
        const aliases = aliasesOf(result.content);
        const absolute = await resolveInVault(this.root, newSource);
        await writeTextFile(absolute, newSource, result.content);
        if (newSource !== oldSource) {
          this.contents.delete(oldSource);
          this.aliases.delete(oldSource);
        }
        this.contents.set(newSource, result.content);
        this.aliases.set(newSource, aliases);
        this.search.update(newSource, result.content, aliases);
      }
    }

    // Re-key moved note caches.
    for (const [oldSource, content] of [...this.contents.entries()]) {
      const newSource = targetMap.get(oldSource);
      if (!newSource || newSource === oldSource) continue;
      this.contents.delete(oldSource);
      this.contents.set(newSource, content);
      const aliases = this.aliases.get(oldSource);
      this.aliases.delete(oldSource);
      if (aliases) this.aliases.set(newSource, aliases);
    }

    this.rebuildDerived();
    return { path: relative, newPath: target, linksUpdated };
  }

  async deleteEntry(relative: string): Promise<{ path: string }> {
    const absolute = await resolveInVault(this.root, relative);
    await deleteToTrash(this.root, absolute, this.settings.trashOption);
    const prefix = `${relative}/`;
    for (const key of [...this.contents.keys()]) {
      if (key === relative || key.startsWith(prefix)) {
        this.contents.delete(key);
        this.aliases.delete(key);
        this.search.remove(key);
      }
    }
    this.tree = await buildTree(this.root);
    this.rebuildDerived();
    return { path: relative };
  }

  async searchVault(options: SearchOptions): Promise<SearchResponse> {
    return this.search.query(options);
  }

  private aliasRecord(): Record<string, string[]> {
    const record: Record<string, string[]> = {};
    for (const [key, value] of this.aliases) record[key] = value;
    return record;
  }

  async syncFromDisk(): Promise<{ tree: VaultTree; links: LinkGraph }> {
    await this.loadAllContents();
    this.tree = await buildTree(this.root);
    this.rebuildDerived();
    return { tree: this.tree, links: this.links };
  }

  async dispose(): Promise<void> {
    await this.watcher?.close();
    this.watcher = null;
  }

  get indexedFileCount(): number {
    return this.loadedFileCount;
  }

  getAbsolute(relative: string): Promise<string> {
    return resolveInVault(this.root, relative);
  }

  resolveDirectory(relative: string): Promise<string> {
    return resolveInVault(this.root, relative, { allowRoot: true });
  }

  configPath(...segments: string[]): string {
    return path.join(this.root, '.obsidia', ...segments);
  }
}
