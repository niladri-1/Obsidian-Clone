import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  basename,
  dirname,
  isMarkdownPath,
  noteTitle,
} from '@shared/paths';
import type {
  AppSettings,
  PersistedWorkspaceV1,
  ReadFileResult,
  SettingsBundle,
  ViewMode,
} from '@shared/types';
import {
  defaultWorkspace,
  emptyLinks,
  emptyTree,
  type AppStore,
  type NoteBuffer,
  type RevealRequest,
  type Toast,
  type UIState,
} from './types';

const api = window.vaultApi;

const autosaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const AUTOSAVE_DELAY = 1500;

const DEFAULT_SETTINGS: SettingsBundle = {
  vault: {
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
  },
  appearance: { theme: 'system', accentColor: '', baseFontSize: 16 },
  app: { theme: 'system', zoom: 1, lastVaultId: null },
};

const INITIAL_UI: UIState = {
  paletteOpen: false,
  quickOpenOpen: false,
  settingsOpen: false,
  settingsSection: 'editor',
  graphOpen: false,
  graphLocal: false,
  focusSearchNonce: 0,
  closePrompt: null,
  deleteTarget: null,
  reveal: null,
  textPrompt: null,
};

function bufferFrom(data: ReadFileResult): NoteBuffer {
  return {
    path: data.path,
    content: data.content,
    savedContent: data.content,
    mtimeMs: data.mtimeMs,
    eol: data.eol,
    hadBom: data.hadBom,
    dirty: false,
    missing: false,
    conflict: false,
  };
}

function emptyBuffer(path: string): NoteBuffer {
  return {
    path,
    content: '',
    savedContent: '',
    mtimeMs: 0,
    eol: 'lf',
    hadBom: false,
    dirty: false,
    missing: false,
    conflict: false,
    loading: true,
  };
}

export function activePane(state: Pick<AppStore, 'workspace'>) {
  return (
    state.workspace.panes.find((pane) => pane.id === state.workspace.activePaneId) ??
    state.workspace.panes[0]
  );
}

export function activePathOf(state: AppStore): string | null {
  return activePane(state)?.activeTab ?? null;
}

function isUnder(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

function remap(path: string, from: string, to: string): string {
  if (path === from) return to;
  if (path.startsWith(`${from}/`)) return to + path.slice(from.length);
  return path;
}

function normalizeWorkspace(input: PersistedWorkspaceV1 | null): PersistedWorkspaceV1 {
  if (!input) return defaultWorkspace();
  const workspace: PersistedWorkspaceV1 = {
    ...defaultWorkspace(),
    ...input,
    panes: input.panes.length
      ? input.panes.map((pane) => ({ ...pane, tabs: [...pane.tabs] }))
      : defaultWorkspace().panes,
    expandedFolders: [...input.expandedFolders],
    recentFiles: [...input.recentFiles],
    viewModes: { ...input.viewModes },
  };
  if (!workspace.panes.some((pane) => pane.id === workspace.activePaneId)) {
    workspace.activePaneId = workspace.panes[0]!.id;
  }
  return workspace;
}

function folderForNewNote(state: AppStore): string {
  const location = state.settings.vault.newFileLocation;
  if (location === 'folder') {
    const configured = state.settings.vault.newFileFolderPath;
    return configured === '/' ? '' : configured;
  }
  if (location === 'current') {
    const current = activePathOf(state);
    return current ? dirname(current) : '';
  }
  return '';
}

function siblingNames(state: AppStore, folder: string): Set<string> {
  const names = new Set<string>();
  const prefix = folder ? `${folder}/` : '';
  for (const file of state.tree.files) {
    if (!file.startsWith(prefix)) continue;
    const rest = file.slice(prefix.length);
    if (!rest.includes('/')) names.add(rest.toLowerCase());
  }
  for (const dir of state.tree.folders) {
    if (!dir.startsWith(prefix)) continue;
    const rest = dir.slice(prefix.length);
    if (!rest.includes('/')) names.add(rest.toLowerCase());
  }
  return names;
}

function uniqueName(existing: Set<string>, base: string, extension: string): string {
  for (let index = 0; index < 999; index += 1) {
    const candidate = index === 0 ? `${base}${extension}` : `${base} ${index}${extension}`;
    if (!existing.has(candidate.toLowerCase())) return candidate;
  }
  return `${base}-${Date.now()}${extension}`;
}

function scheduleAutosave(get: () => AppStore, path: string): void {
  const existing = autosaveTimers.get(path);
  if (existing) clearTimeout(existing);
  autosaveTimers.set(
    path,
    setTimeout(() => {
      autosaveTimers.delete(path);
      void get().saveNote(path);
    }, AUTOSAVE_DELAY),
  );
}

function cancelAutosave(path: string): void {
  const timer = autosaveTimers.get(path);
  if (timer) clearTimeout(timer);
  autosaveTimers.delete(path);
}

function setBufferFromResult(store: AppStore, data: ReadFileResult): void {
  const current = store.buffers[data.path];
  if (!current) return;
  current.content = data.content;
  current.savedContent = data.content;
  current.mtimeMs = data.mtimeMs;
  current.eol = data.eol;
  current.hadBom = data.hadBom;
  current.dirty = false;
  current.missing = false;
  current.conflict = false;
  current.loading = false;
  delete current.externalContent;
  delete current.externalMtimeMs;
  delete current.error;
}

function pushHistory(store: AppStore, paneId: string, path: string): void {
  const history = store.histories[paneId] ?? { stack: [], index: -1 };
  const current = history.stack[history.index];
  if (current === path) return;
  history.stack = [...history.stack.slice(0, history.index + 1), path].slice(-100);
  history.index = history.stack.length - 1;
  store.histories[paneId] = history;
}

/** Closes a set of tabs, leaving dirty ones open instead of silently destroying edits. */
async function closeTabsSafely(
  get: () => AppStore,
  paneId: string,
  tabs: string[],
): Promise<void> {
  if (tabs.length === 0) return;
  const buffers = get().buffers;
  const dirty = tabs.filter((tab) => buffers[tab]?.dirty);
  const dirtySet = new Set(dirty);
  for (const tab of tabs) {
    if (dirtySet.has(tab)) continue;
    await get().closeTab(paneId, tab, true);
  }
  if (dirty.length > 0) {
    get().pushToast({
      kind: 'info',
      message:
        dirty.length === 1
          ? '1 unsaved tab was kept open.'
          : `${dirty.length} unsaved tabs were kept open.`,
    });
  }
}

export const useStore = create<AppStore>()(
  immer((set, get) => ({
    status: 'loading',
    bootError: null,
    vault: null,
    vaults: [],
    lastVaultId: null,
    tree: emptyTree(),
    settings: DEFAULT_SETTINGS,
    workspace: defaultWorkspace(),
    buffers: {},
    links: emptyLinks(),
    histories: {},
    ui: INITIAL_UI,
    toasts: [],

    bootstrap: async () => {
      if (get().status === 'ready') return;
      set((state) => {
        state.status = 'loading';
        state.bootError = null;
      });
      try {
        const listed = await api.listVaults();
        if (!listed.ok) throw new Error(listed.error.message);
        set((state) => {
          state.vaults = listed.data.vaults;
          state.lastVaultId = listed.data.lastVaultId;
        });
        const last = listed.data.vaults.find(
          (vault) => vault.id === listed.data.lastVaultId && !vault.missing,
        );
        if (last) {
          await get().openVaultByPath(last.path);
          if (get().status === 'ready') return;
        }
        set((state) => {
          state.status = 'picker';
        });
      } catch (error) {
        set((state) => {
          state.status = 'error';
          state.bootError = error instanceof Error ? error.message : String(error);
        });
      }
    },

    refreshVaultList: async () => {
      const listed = await api.listVaults();
      if (!listed.ok) {
        get().pushToast({ kind: 'error', message: listed.error.message });
        return;
      }
      set((state) => {
        state.vaults = listed.data.vaults;
        state.lastVaultId = listed.data.lastVaultId;
      });
    },

    showPicker: async () => {
      await get().refreshVaultList();
      set((state) => {
        state.status = 'picker';
      });
    },

    removeVault: async (id) => {
      const result = await api.removeVault(id);
      if (!result.ok) {
        get().pushToast({ kind: 'error', message: result.error.message });
        return;
      }
      await get().refreshVaultList();
      get().pushToast({ kind: 'success', message: 'Vault removed from recent list.' });
    },

    returnToVault: () => {
      if (!get().vault) return;
      set((state) => {
        state.status = 'ready';
        state.bootError = null;
      });
    },

    chooseAndOpenVault: async (mode) => {
      const chosen = await api.chooseVault(mode);
      if (!chosen.ok) {
        get().pushToast({ kind: 'error', message: chosen.error.message });
        return;
      }
      if (!chosen.data.path) return;
      await get().openVaultByPath(chosen.data.path, mode === 'create');
    },

    openVaultByPath: async (vaultPath, createFlag = false) => {
      const before = get();
      if (before.vault) {
        await before.saveAll();
        await before.persistWorkspace(true);
      }
      set((state) => {
        state.status = 'loading';
        state.bootError = null;
      });

      const opened = await api.openVault({ path: vaultPath, create: createFlag });
      if (!opened.ok) {
        set((state) => {
          state.status = state.vault ? 'ready' : 'picker';
          state.bootError = opened.error.message;
        });
        get().pushToast({ kind: 'error', message: opened.error.message });
        return;
      }

      const data = opened.data;
      const existing = new Set(data.tree.files);
      const workspace = normalizeWorkspace(data.workspace);

      workspace.panes = workspace.panes.map((pane) => {
        const tabs = pane.tabs.filter((tab) => existing.has(tab) && isMarkdownPath(tab));
        return {
          ...pane,
          tabs,
          activeTab:
            pane.activeTab && tabs.includes(pane.activeTab) ? pane.activeTab : (tabs[0] ?? null),
        };
      });
      if (!workspace.panes.some((pane) => pane.id === workspace.activePaneId)) {
        workspace.activePaneId = workspace.panes[0]!.id;
      }
      workspace.expandedFolders = workspace.expandedFolders.filter((folder) =>
        data.tree.folders.includes(folder),
      );
      workspace.recentFiles = workspace.recentFiles.filter((file) => existing.has(file)).slice(0, 40);
      for (const key of Object.keys(workspace.viewModes)) {
        if (!existing.has(key)) delete workspace.viewModes[key];
      }

      const uniqueTabs = [...new Set(workspace.panes.flatMap((pane) => pane.tabs))];
      const reads = await Promise.all(
        uniqueTabs.map(async (tab) => ({ tab, result: await api.readFile(tab) })),
      );

      const buffers: Record<string, NoteBuffer> = {};
      const failed = new Set<string>();
      for (const { tab, result } of reads) {
        if (result.ok) {
          buffers[tab] = bufferFrom(result.data);
        } else {
          failed.add(tab);
        }
      }
      if (failed.size > 0) {
        workspace.panes = workspace.panes.map((pane) => {
          const tabs = pane.tabs.filter((tab) => !failed.has(tab));
          return {
            ...pane,
            tabs,
            activeTab:
              pane.activeTab && tabs.includes(pane.activeTab) ? pane.activeTab : (tabs[0] ?? null),
          };
        });
      }

      const histories: Record<string, { stack: string[]; index: number }> = {};
      for (const pane of workspace.panes) {
        histories[pane.id] = {
          stack: pane.activeTab ? [pane.activeTab] : [],
          index: pane.activeTab ? 0 : -1,
        };
      }

      set((state) => {
        state.status = 'ready';
        state.vault = data.vault;
        state.settings = {
          vault: data.settings,
          appearance: data.appearance,
          app: state.settings.app,
        };
        state.tree = data.tree;
        state.links = data.links;
        state.workspace = workspace;
        state.buffers = buffers;
        state.histories = histories;
        state.lastVaultId = data.vault.id;
        state.bootError = null;
      });
      await get().refreshVaultList();
    },

    openNote: async (path, options = {}) => {
      if (!isMarkdownPath(path)) {
        get().pushToast({ kind: 'info', message: 'Only Markdown notes open in the editor.' });
        return;
      }
      const state = get();
      if (!state.vault) return;

      let paneId = options.paneId ?? state.workspace.activePaneId;
      if (!state.workspace.panes.some((pane) => pane.id === paneId)) {
        paneId = state.workspace.panes[0]!.id;
      }
      if (!options.newTab) {
        const existingPane = state.workspace.panes.find((pane) => pane.tabs.includes(path));
        if (existingPane) paneId = existingPane.id;
      }

      const alreadyLoaded = !!state.buffers[path] && !state.buffers[path]!.loading;
      set((draft) => {
        const pane = draft.workspace.panes.find((candidate) => candidate.id === paneId);
        if (!pane) return;
        if (!pane.tabs.includes(path)) pane.tabs.push(path);
        pane.activeTab = path;
        draft.workspace.activePaneId = paneId;
        if (!draft.buffers[path]) draft.buffers[path] = emptyBuffer(path);
        const mode = options.viewMode ?? draft.workspace.viewModes[path] ?? draft.settings.vault.defaultViewMode;
        draft.workspace.viewModes[path] = mode;
        draft.workspace.recentFiles = [path, ...draft.workspace.recentFiles.filter((entry) => entry !== path)].slice(0, 40);
        if (!options.skipHistory) pushHistory(draft, paneId, path);
      });

      if (!alreadyLoaded) {
        const result = await api.readFile(path);
        if (result.ok) {
          set((draft) => {
            if (!draft.buffers[path]?.loading) return;
            draft.buffers[path] = bufferFrom(result.data);
          });
        } else {
          set((draft) => {
            draft.buffers[path] = {
              ...(draft.buffers[path] ?? emptyBuffer(path)),
              loading: false,
              error: result.error.message,
            };
            for (const pane of draft.workspace.panes) {
              pane.tabs = pane.tabs.filter((tab) => tab !== path);
              if (pane.activeTab === path) pane.activeTab = pane.tabs[0] ?? null;
            }
          });
          get().pushToast({ kind: 'error', message: result.error.message });
          return;
        }
      }

      if (options.revealText || options.revealLine) {
        get().setReveal({
          path,
          ...(options.revealText ? { text: options.revealText } : {}),
          ...(options.revealLine ? { line: options.revealLine } : {}),
        });
      }
      if (options.revealHeading) {
        get().setReveal({ path, heading: options.revealHeading });
      }
    },

    activateTab: async (paneId, path) => {
      set((draft) => {
        const pane = draft.workspace.panes.find((candidate) => candidate.id === paneId);
        if (!pane || !pane.tabs.includes(path)) return;
        pane.activeTab = path;
        draft.workspace.activePaneId = paneId;
        draft.workspace.recentFiles = [path, ...draft.workspace.recentFiles.filter((entry) => entry !== path)].slice(0, 40);
      });
      if (!get().buffers[path]) {
        await get().openNote(path, { paneId, skipHistory: true });
      }
    },

    closeTab: async (paneId, path, force = false) => {
      const buffer = get().buffers[path];
      if (buffer?.dirty && !force) {
        set((draft) => {
          draft.ui.closePrompt = { paneId, path };
        });
        return;
      }
      cancelAutosave(path);
      set((draft) => {
        const pane = draft.workspace.panes.find((candidate) => candidate.id === paneId);
        if (!pane) return;
        const index = pane.tabs.indexOf(path);
        pane.tabs = pane.tabs.filter((tab) => tab !== path);
        if (pane.activeTab === path) {
          pane.activeTab = pane.tabs[Math.min(Math.max(index, 0), pane.tabs.length - 1)] ?? null;
        }
        const stillOpen = draft.workspace.panes.some((candidate) => candidate.tabs.includes(path));
        if (!stillOpen && !draft.buffers[path]?.conflict) delete draft.buffers[path];
      });
    },

    closeOtherTabs: async (paneId, path) => {
      const pane = get().workspace.panes.find((candidate) => candidate.id === paneId);
      if (!pane) return;
      await closeTabsSafely(
        get,
        paneId,
        pane.tabs.filter((tab) => tab !== path),
      );
      await get().activateTab(paneId, path);
    },

    closeTabsAfter: async (paneId, path) => {
      const pane = get().workspace.panes.find((candidate) => candidate.id === paneId);
      if (!pane) return;
      const index = pane.tabs.indexOf(path);
      if (index === -1) return;
      await closeTabsSafely(get, paneId, pane.tabs.slice(index + 1));
      await get().activateTab(paneId, path);
    },

    closeAllTabs: async (paneId) => {
      const pane = get().workspace.panes.find((candidate) => candidate.id === paneId);
      if (!pane) return;
      await closeTabsSafely(get, paneId, [...pane.tabs]);
    },

    setActivePane: (paneId) => {
      set((draft) => {
        if (draft.workspace.panes.some((pane) => pane.id === paneId)) {
          draft.workspace.activePaneId = paneId;
        }
      });
    },

    openToSide: async (path, direction) => {
      if (!get().vault) return;
      const id = `pane-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      set((draft) => {
        draft.workspace.panes.push({ id, tabs: [], activeTab: null });
        draft.workspace.activePaneId = id;
        draft.workspace.splitDirection = direction;
        draft.histories[id] = { stack: [], index: -1 };
      });
      await get().openNote(path, { paneId: id, newTab: true, skipHistory: true });
    },

    toggleSplit: () => {
      set((draft) => {
        if (draft.workspace.panes.length > 1) {
          const first = draft.workspace.panes[0]!;
          draft.workspace.panes = [first];
          draft.workspace.activePaneId = first.id;
          return;
        }
        const source = draft.workspace.panes[0]!;
        const id = `pane-${Date.now().toString(36)}`;
        draft.workspace.panes.push({
          id,
          tabs: source.activeTab ? [source.activeTab] : [],
          activeTab: source.activeTab,
        });
        draft.workspace.activePaneId = id;
        draft.histories[id] = {
          stack: source.activeTab ? [source.activeTab] : [],
          index: source.activeTab ? 0 : -1,
        };
      });
    },

    setSplitDirection: (direction) => {
      set((draft) => {
        draft.workspace.splitDirection = direction;
      });
    },

    closePane: (paneId) => {
      set((draft) => {
        if (draft.workspace.panes.length <= 1) return;
        const pane = draft.workspace.panes.find((candidate) => candidate.id === paneId);
        draft.workspace.panes = draft.workspace.panes.filter((candidate) => candidate.id !== paneId);
        if (draft.workspace.activePaneId === paneId) {
          draft.workspace.activePaneId = draft.workspace.panes[0]!.id;
        }
        delete draft.histories[paneId];
        if (!pane) return;
        for (const tab of pane.tabs) {
          const stillOpen = draft.workspace.panes.some((candidate) => candidate.tabs.includes(tab));
          if (!stillOpen) {
            cancelAutosave(tab);
            delete draft.buffers[tab];
          }
        }
      });
    },

    reorderTab: (paneId, fromIndex, toIndex) => {
      set((draft) => {
        const pane = draft.workspace.panes.find((candidate) => candidate.id === paneId);
        if (!pane) return;
        if (fromIndex < 0 || fromIndex >= pane.tabs.length) return;
        if (toIndex < 0 || toIndex >= pane.tabs.length || fromIndex === toIndex) return;
        const [moved] = pane.tabs.splice(fromIndex, 1);
        if (moved === undefined) return;
        pane.tabs.splice(toIndex, 0, moved);
      });
    },

    setContent: (path, content) => {
      set((draft) => {
        const buffer = draft.buffers[path];
        if (!buffer) return;
        buffer.content = content;
        buffer.dirty = content !== buffer.savedContent;
        buffer.error = undefined;
      });
      const buffer = get().buffers[path];
      if (buffer && !buffer.conflict) scheduleAutosave(get, path);
    },

    saveNote: async (path, force = false) => {
      const buffer = get().buffers[path];
      if (!buffer) return false;
      if (buffer.conflict && !force) return false;
      if (!buffer.dirty && !buffer.conflict && !buffer.missing) return true;

      const content = buffer.content;
      const expected = buffer.missing ? undefined : buffer.mtimeMs;
      const result = await api.writeFile(path, content, expected);

      if (result.ok) {
        set((draft) => {
          const next = draft.buffers[path];
          if (!next) return;
          next.savedContent = content;
          next.mtimeMs = result.data.mtimeMs;
          next.dirty = next.content !== content;
          next.conflict = false;
          next.missing = false;
          next.error = undefined;
          delete next.externalContent;
          delete next.externalMtimeMs;
          if (result.data.links) draft.links = result.data.links;
        });
        return true;
      }

      if (result.error.code === 'CONFLICT') {
        const external = await api.readFile(path);
        set((draft) => {
          const next = draft.buffers[path];
          if (!next) return;
          next.conflict = true;
          if (external.ok) {
            next.externalContent = external.data.content;
            next.externalMtimeMs = external.data.mtimeMs;
          }
        });
        get().pushToast({
          kind: 'error',
          message: 'This note changed on disk. Reload it or keep your version.',
        });
        return false;
      }

      set((draft) => {
        const next = draft.buffers[path];
        if (next) {
          next.error = result.error.message;
          if (result.error.code === 'NOT_FOUND') next.missing = true;
        }
      });
      get().pushToast({ kind: 'error', message: result.error.message });
      return false;
    },

    saveAll: async () => {
      // Conflicted buffers are deliberately not overwritten here: "keep mine" is an explicit
      // user decision, never a side effect of closing a vault or the app.
      const dirty = Object.values(get().buffers)
        .filter((buffer) => buffer.dirty && !buffer.conflict && !buffer.loading)
        .map((buffer) => buffer.path);
      await Promise.all(dirty.map((path) => get().saveNote(path)));
      await get().persistWorkspace(true);
    },

    reloadNote: async (path) => {
      const result = await api.readFile(path);
      if (result.ok) {
        set((draft) => {
          const buffer = draft.buffers[path];
          if (!buffer) return;
          setBufferFromResult(draft, result.data);
          buffer.loading = false;
        });
      } else {
        set((draft) => {
          const buffer = draft.buffers[path];
          if (!buffer) return;
          buffer.conflict = false;
          buffer.missing = true;
          buffer.loading = false;
          buffer.error = result.error.message;
        });
      }
    },

    keepMine: async (path) => {
      const saved = await get().saveNote(path, true);
      if (saved) get().pushToast({ kind: 'success', message: 'Kept your version.' });
    },

    setViewMode: (path, mode) => {
      set((draft) => {
        draft.workspace.viewModes[path] = mode;
      });
    },

    toggleReadingView: (path) => {
      const current = get().workspace.viewModes[path] ?? get().settings.vault.defaultViewMode;
      get().setViewMode(path, current === 'source' ? 'reading' : 'source');
    },

    setCursor: (path, cursor) => {
      set((draft) => {
        const buffer = draft.buffers[path];
        if (buffer) buffer.cursor = cursor;
      });
    },

    setScroll: (path, scrollTop) => {
      set((draft) => {
        const buffer = draft.buffers[path];
        if (buffer) buffer.scrollTop = scrollTop;
      });
    },

    createNote: async (parentDir, name) => {
      const state = get();
      if (!state.vault) return;
      const folder = parentDir ?? folderForNewNote(state);
      const existing = siblingNames(state, folder);
      const fileName = name?.trim()
        ? `${name.trim().replace(/\.md$/i, '')}.md`
        : uniqueName(existing, 'Untitled', '.md');
      const path = folder ? `${folder}/${fileName}` : fileName;
      const result = await api.createEntry({ path, kind: 'file' });
      if (!result.ok) {
        get().pushToast({ kind: 'error', message: result.error.message });
        return;
      }
      set((draft) => {
        draft.tree = result.data.tree;
        draft.links = result.data.links;
      });
      await get().openNote(result.data.path);
    },

    createFolder: async (parentDir, name) => {
      const state = get();
      if (!state.vault) return;
      const folder = parentDir ?? folderForNewNote(state);
      const existing = siblingNames(state, folder);
      const folderName = name?.trim() || uniqueName(existing, 'Untitled folder', '');
      const path = folder ? `${folder}/${folderName}` : folderName;
      const result = await api.createEntry({ path, kind: 'folder' });
      if (!result.ok) {
        get().pushToast({ kind: 'error', message: result.error.message });
        return;
      }
      set((draft) => {
        draft.tree = result.data.tree;
        draft.links = result.data.links;
        if (!draft.workspace.expandedFolders.includes(path)) {
          draft.workspace.expandedFolders.push(path);
        }
      });
    },

    duplicateEntry: async (path) => {
      const result = await api.duplicateEntry({ path });
      if (!result.ok) {
        get().pushToast({ kind: 'error', message: result.error.message });
        return;
      }
      set((draft) => {
        draft.tree = result.data.tree;
        draft.links = result.data.links;
      });
      get().pushToast({
        kind: 'success',
        message: `Made a copy: ${basename(result.data.path)}`,
      });
    },

    requestDelete: (path, kind) => {
      if (get().settings.vault.promptDelete) {
        set((draft) => {
          draft.ui.deleteTarget = { path, kind };
        });
        return;
      }
      // Delete without ever placing the target in UI state: that would render the dialog for a
      // frame before the asynchronous delete finishes.
      void get().confirmDelete({ path, kind });
    },

    confirmDelete: async (targetArg) => {
      const target = targetArg ?? get().ui.deleteTarget;
      if (!target) return;
      const result = await api.deleteEntry({ path: target.path });
      if (!result.ok) {
        get().pushToast({ kind: 'error', message: result.error.message });
        set((draft) => {
          draft.ui.deleteTarget = null;
        });
        return;
      }
      set((draft) => {
        draft.tree = result.data.tree;
        draft.links = result.data.links;
        draft.ui.deleteTarget = null;
        draft.workspace.recentFiles = draft.workspace.recentFiles.filter(
          (file) => !isUnder(file, target.path),
        );
        draft.workspace.expandedFolders = draft.workspace.expandedFolders.filter(
          (folder) => !isUnder(folder, target.path),
        );
        for (const pane of draft.workspace.panes) {
          const tabs = pane.tabs.filter((tab) => !isUnder(tab, target.path));
          if (pane.activeTab && isUnder(pane.activeTab, target.path)) {
            pane.activeTab = tabs[0] ?? null;
          }
          pane.tabs = tabs;
        }
        for (const key of Object.keys(draft.buffers)) {
          if (isUnder(key, target.path)) {
            cancelAutosave(key);
            delete draft.buffers[key];
          }
        }
      });
      get().pushToast({
        kind: 'success',
        message:
          get().settings.vault.trashOption === 'permanent'
            ? `Deleted ${basename(target.path)}.`
            : `Moved ${basename(target.path)} to the vault trash.`,
      });
    },

    renameEntry: async (path, newName) => {
      const state = get();
      const trimmed = newName.trim();
      if (!trimmed || trimmed === basename(path)) return;
      const parent = dirname(path);
      const isFile = isMarkdownPath(path);
      const finalName = isFile && !/\.md$/i.test(trimmed) ? `${trimmed}.md` : trimmed;
      const newPath = parent ? `${parent}/${finalName}` : finalName;
      if (newPath === path) return;

      // Save dirty notes beneath the renamed entry so no edits are lost.
      const dirty = Object.values(state.buffers)
        .filter((buffer) => buffer.dirty && isUnder(buffer.path, path))
        .map((buffer) => buffer.path);
      for (const dirtyPath of dirty) await state.saveNote(dirtyPath, true);

      const result = await api.renameEntry({
        path,
        newPath,
        updateLinks: get().settings.vault.alwaysUpdateLinks,
      });
      if (!result.ok) {
        get().pushToast({ kind: 'error', message: result.error.message });
        return;
      }

      set((draft) => {
        draft.tree = result.data.tree;
        draft.links = result.data.links;
        draft.workspace.recentFiles = draft.workspace.recentFiles.map((file) =>
          remap(file, path, newPath),
        );
        draft.workspace.expandedFolders = draft.workspace.expandedFolders.map((folder) =>
          remap(folder, path, newPath),
        );
        const modes: Record<string, ViewMode> = {};
        for (const [key, mode] of Object.entries(draft.workspace.viewModes)) {
          modes[remap(key, path, newPath)] = mode;
        }
        draft.workspace.viewModes = modes;
        for (const pane of draft.workspace.panes) {
          pane.tabs = pane.tabs.map((tab) => remap(tab, path, newPath));
          if (pane.activeTab) pane.activeTab = remap(pane.activeTab, path, newPath);
        }
        for (const history of Object.values(draft.histories)) {
          history.stack = history.stack.map((entry) => remap(entry, path, newPath));
        }
        const buffers: Record<string, NoteBuffer> = {};
        for (const [key, buffer] of Object.entries(draft.buffers)) {
          const mapped = remap(key, path, newPath);
          buffers[mapped] = { ...buffer, path: mapped };
        }
        draft.buffers = buffers;
      });

      // Link rewriting happens on disk while the watcher suppresses self-writes,
      // so refresh every open clean buffer.
      const openPaths = Object.keys(get().buffers);
      for (const openPath of openPaths) {
        const buffer = get().buffers[openPath];
        if (!buffer || buffer.dirty || buffer.missing) continue;
        const refreshed = await api.readFile(openPath);
        if (refreshed.ok) {
          set((draft) => {
            const target = draft.buffers[openPath];
            if (target && !target.dirty) setBufferFromResult(draft, refreshed.data);
          });
        }
      }

      if (result.data.linksUpdated > 0) {
        get().pushToast({
          kind: 'success',
          message: `Updated ${result.data.linksUpdated} link${result.data.linksUpdated === 1 ? '' : 's'}.`,
        });
      }
    },

    openDailyNote: async () => {
      const state = get();
      if (!state.vault) return;
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
        now.getDate(),
      ).padStart(2, '0')}`;
      const path = `Daily/${date}.md`;
      if (state.tree.files.includes(path)) {
        await get().openNote(path);
        return;
      }
      const result = await api.createEntry({
        path,
        kind: 'file',
        content: `# ${date}\n\n`,
      });
      if (!result.ok) {
        get().pushToast({ kind: 'error', message: result.error.message });
        return;
      }
      set((draft) => {
        draft.tree = result.data.tree;
        draft.links = result.data.links;
      });
      await get().openNote(path);
    },

    toggleFolder: (path) => {
      set((draft) => {
        const index = draft.workspace.expandedFolders.indexOf(path);
        if (index === -1) draft.workspace.expandedFolders.push(path);
        else draft.workspace.expandedFolders.splice(index, 1);
      });
    },

    setExpandedFolders: (folders) => {
      set((draft) => {
        draft.workspace.expandedFolders = folders;
      });
    },

    setLeftOpen: (open) => {
      set((draft) => {
        draft.workspace.leftOpen = open;
      });
    },

    setRightOpen: (open) => {
      set((draft) => {
        draft.workspace.rightOpen = open;
      });
    },

    setLeftWidth: (width) => {
      set((draft) => {
        draft.workspace.leftWidth = Math.min(520, Math.max(160, Math.round(width)));
      });
    },

    setRightWidth: (width) => {
      set((draft) => {
        draft.workspace.rightWidth = Math.min(520, Math.max(160, Math.round(width)));
      });
    },

    setActiveLeftView: (view) => {
      set((draft) => {
        draft.workspace.activeLeftView = view;
        draft.workspace.leftOpen = true;
      });
    },

    setActiveRightView: (view) => {
      set((draft) => {
        draft.workspace.activeRightView = view;
        draft.workspace.rightOpen = true;
      });
    },

    focusSearch: () => {
      set((draft) => {
        draft.workspace.activeLeftView = 'search';
        draft.workspace.leftOpen = true;
        draft.ui.focusSearchNonce += 1;
      });
    },

    updateVaultSettings: async (patch) => {
      const result = await api.setVaultSettings(patch);
      if (result.ok) {
        set((draft) => {
          draft.settings = result.data;
        });
      } else {
        get().pushToast({ kind: 'error', message: result.error.message });
      }
    },

    updateAppearance: async (patch) => {
      const result = await api.setAppearance(patch);
      if (result.ok) {
        set((draft) => {
          draft.settings = result.data;
        });
      } else {
        get().pushToast({ kind: 'error', message: result.error.message });
      }
    },

    updateAppSettings: async (patch: Partial<AppSettings>) => {
      set((draft) => {
        draft.settings.app = { ...draft.settings.app, ...patch };
      });
      const result = await api.setAppSettings(patch);
      if (result.ok) {
        set((draft) => {
          draft.settings = result.data;
        });
      } else {
        get().pushToast({ kind: 'error', message: result.error.message });
      }
    },

    goBack: async () => {
      const paneId = get().workspace.activePaneId;
      const history = get().histories[paneId];
      if (!history || history.index <= 0) return;
      const nextIndex = history.index - 1;
      const path = history.stack[nextIndex];
      if (!path) return;
      set((draft) => {
        const target = draft.histories[paneId];
        if (target) target.index = nextIndex;
      });
      await get().openNote(path, { paneId, skipHistory: true });
    },

    goForward: async () => {
      const paneId = get().workspace.activePaneId;
      const history = get().histories[paneId];
      if (!history || history.index >= history.stack.length - 1) return;
      const nextIndex = history.index + 1;
      const path = history.stack[nextIndex];
      if (!path) return;
      set((draft) => {
        const target = draft.histories[paneId];
        if (target) target.index = nextIndex;
      });
      await get().openNote(path, { paneId, skipHistory: true });
    },

    persistWorkspace: async (immediate = false) => {
      const state = get();
      if (!state.vault) return;
      const result = await api.saveWorkspace(state.workspace);
      if (!result.ok && immediate) {
        get().pushToast({ kind: 'error', message: result.error.message });
      }
    },

    handleFileBatch: async (batch) => {
      const paths = [...new Set([...batch.changed, ...batch.removed])];
      for (const path of paths) {
        const buffer = get().buffers[path];
        if (!buffer) continue;
        if (batch.removed.includes(path) && !batch.changed.includes(path)) {
          set((draft) => {
            const target = draft.buffers[path];
            if (target) target.missing = true;
          });
          continue;
        }
        const result = await api.readFile(path);
        if (!result.ok) {
          if (result.error.code === 'NOT_FOUND') {
            set((draft) => {
              const target = draft.buffers[path];
              if (target) target.missing = true;
            });
          }
          continue;
        }
        set((draft) => {
          const target = draft.buffers[path];
          if (!target) return;
          if (result.data.content === target.content) {
            target.savedContent = result.data.content;
            target.mtimeMs = result.data.mtimeMs;
            target.dirty = false;
            target.conflict = false;
            target.missing = false;
            delete target.externalContent;
            delete target.externalMtimeMs;
            return;
          }
          if (target.dirty) {
            target.conflict = true;
            target.externalContent = result.data.content;
            target.externalMtimeMs = result.data.mtimeMs;
            return;
          }
          target.content = result.data.content;
          target.savedContent = result.data.content;
          target.mtimeMs = result.data.mtimeMs;
          target.dirty = false;
          target.conflict = false;
          target.missing = false;
          delete target.externalContent;
          delete target.externalMtimeMs;
        });
      }
    },

    handleVaultChanged: (payload) => {
      set((draft) => {
        draft.tree = payload.tree;
        draft.links = payload.links;
        const files = new Set(payload.tree.files);
        draft.workspace.recentFiles = draft.workspace.recentFiles.filter((file) => files.has(file));
        draft.workspace.expandedFolders = draft.workspace.expandedFolders.filter((folder) =>
          payload.tree.folders.includes(folder),
        );
      });
    },

    handleSettingsChanged: (payload) => {
      set((draft) => {
        draft.settings = payload.settings;
      });
    },

    setReveal: (request) => {
      set((draft) => {
        draft.ui.reveal = { ...request, nonce: Date.now() + Math.random() } satisfies RevealRequest;
      });
    },

    clearReveal: (nonce) => {
      set((draft) => {
        if (draft.ui.reveal?.nonce === nonce) draft.ui.reveal = null;
      });
    },

    openTextPrompt: (prompt) => {
      set((draft) => {
        draft.ui.textPrompt = prompt;
      });
    },

    closeTextPrompt: () => {
      set((draft) => {
        draft.ui.textPrompt = null;
      });
    },

    discardNote: (path) => {
      cancelAutosave(path);
      set((draft) => {
        const buffer = draft.buffers[path];
        if (!buffer) return;
        buffer.content = buffer.savedContent;
        buffer.dirty = false;
        buffer.conflict = false;
        buffer.error = undefined;
        delete buffer.externalContent;
        delete buffer.externalMtimeMs;
      });
    },

    submitTextPrompt: async (value) => {
      const prompt = get().ui.textPrompt;
      if (!prompt) return;
      set((draft) => {
        draft.ui.textPrompt = null;
      });
      const trimmed = value.trim();
      if (!trimmed) return;
      if (prompt.kind === 'rename' && prompt.path) {
        await get().renameEntry(prompt.path, trimmed);
      } else if (prompt.kind === 'new-note') {
        await get().createNote(prompt.parentDir ?? '', trimmed);
      } else if (prompt.kind === 'new-folder') {
        await get().createFolder(prompt.parentDir ?? '', trimmed);
      }
    },

    setClosePrompt: (prompt) => {
      set((draft) => {
        draft.ui.closePrompt = prompt;
      });
    },

    setDeleteTarget: (target) => {
      set((draft) => {
        draft.ui.deleteTarget = target;
      });
    },

    setPaletteOpen: (open) => {
      set((draft) => {
        draft.ui.paletteOpen = open;
      });
    },

    setQuickOpenOpen: (open) => {
      set((draft) => {
        draft.ui.quickOpenOpen = open;
      });
    },

    setSettingsOpen: (open, section) => {
      set((draft) => {
        draft.ui.settingsOpen = open;
        if (section) draft.ui.settingsSection = section;
      });
    },

    setGraphOpen: (open) => {
      set((draft) => {
        draft.ui.graphOpen = open;
      });
    },

    setGraphLocal: (local) => {
      set((draft) => {
        draft.ui.graphLocal = local;
      });
    },

    pushToast: (toast) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const entry: Toast = { id, ...toast };
      set((draft) => {
        draft.toasts.push(entry);
      });
      setTimeout(
        () => {
          get().dismissToast(id);
        },
        toast.action ? 9000 : 5000,
      );
    },

    dismissToast: (id) => {
      set((draft) => {
        draft.toasts = draft.toasts.filter((toast) => toast.id !== id);
      });
    },
  })),
);

export function noteLabel(path: string): string {
  return noteTitle(path);
}
