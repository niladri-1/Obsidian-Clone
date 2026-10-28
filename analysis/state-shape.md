# State shape — persisted workspace and clone state model

## 1. Observed persisted layout (original)

Evidence: `app.pretty.js` 169653–169700 (`getLayout`/`saveLayout`), 169280–169520
(`setLayout`/`deserializeLayout`), 88612 (`split.serialize` adds `direction`), 90114
(`leaf.serialize` adds `state`/`pinned`/`group`), 167587–167700 (`lastOpenFiles` tracker).

`getLayout()` produces exactly:

```jsonc
{
  "main":    { /* split tree */ },
  "left":    { /* split tree */ },
  "right":   { /* split tree */ },
  "left-ribbon": { /* ribbon */ },
  "floating": { /* only when floating panes exist */ },
  "active": "leaf-id",
  "lastOpenFiles": ["note.md", "folder/other.md"]
}
```

The tree node shapes are:

```jsonc
// split
{ "type": "split", "direction": "vertical" | "horizontal",
  "children": [ /* split or leaf nodes */ ], "dimension": 40 }

// leaf (tab group)
{ "type": "leaf", "id": "…", "pinned": true, "group": "…",
  "state": { "type": "markdown", "state": { "file": "notes/a.md", "mode": "source" } } }
```

It is persisted with `JSON.stringify(layout, null, 2)` to
`<configDir>/workspace.json` on desktop and `workspace-mobile.json` on mobile
(`app.pretty.js` 169672–169695). Saves are requested from UI call sites via
`workspace.requestSaveLayout()` and debounced (1000 ms observed in the save helper).

Other persisted state observed:

| Store | Location | Shape (observed keys) |
| --- | --- | --- |
| Global vault registry | `userData/obsidian.json` | `{ vaults: { <id>: { path, ts, open } }, … }` |
| Window state | `userData/<vaultId>.json` | `{ x, y, width, height, isMaximized, devTools, zoom }` |
| Vault app settings | `<vault>/.obsidian/app.json` | keys listed at `app.pretty.js` 81073–81115 |
| Appearance | `<vault>/.obsidian/appearance.json` | theme, accent, fonts (keys at `app.pretty.js` `YP`) |
| Metadata cache | IndexedDB via `transactionSave("file"\|"metadata", path, data)` | per-file cache records |
| Recent files | inside `workspace.json` `lastOpenFiles` | ordered string array |

**[Inferred]** `mode` on a markdown leaf records `source` vs `preview`; `pinned` keeps a tab from
being replaced by navigation; `group` links split leaves into a tab group.

## 2. Clone state model (design choice)

The clone keeps the same *ideas* with a smaller, flat schema. The authoritative persisted types
are in `src/shared/types.ts`; the renderer types are in `src/renderer/store/types.ts`.

```ts
type ViewMode = 'source' | 'reading';

interface VaultInfo {
  id: string;
  path: string;
  name: string;
  lastOpenedAt: number;
  missing?: boolean;
}

interface VaultSettings {
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
  tabSize: number;          // sanitised to 1–8
  livePreview: boolean;
  spellcheck: boolean;
  propertiesInDocument: 'visible' | 'hidden';
  promptDelete: boolean;
}

interface AppearanceSettings {
  theme: 'system' | 'light' | 'dark';
  accentColor: string;      // lower-case #rrggbb, '' = default
  baseFontSize: number;     // sanitised to 10–32
}

interface AppSettings {
  theme: 'system' | 'light' | 'dark';
  zoom: number;             // sanitised to 0.5–2
  lastVaultId: string | null;
}

interface PaneState {
  id: string;
  tabs: string[];           // vault-relative Markdown paths
  activeTab: string | null;
}

interface PersistedWorkspaceV1 {
  version: 1;
  panes: PaneState[];
  activePaneId: string;
  splitDirection: 'vertical' | 'horizontal';
  leftOpen: boolean;
  rightOpen: boolean;
  leftWidth: number;        // 160–520
  rightWidth: number;       // 160–520
  activeLeftView: 'files' | 'search';
  activeRightView: 'outline' | 'backlinks' | 'properties';
  recentFiles: string[];    // max 40, unique
  expandedFolders: string[];
  viewModes: Record<string, ViewMode>;
}
```

`src/shared/types.ts` also defines `WorkspaceState` with the same fields; the renderer stores and
persists the `PersistedWorkspaceV1` shape directly (there is no nested `workspace` wrapper).

### 2.1 Persisted workspace file

Written to `<vault>/.obsidia/workspace.json` as:

```jsonc
{
  "clone": {
    "version": 1,
    "panes": [{ "id": "pane-1", "tabs": ["notes/a.md"], "activeTab": "notes/a.md" }],
    "activePaneId": "pane-1",
    "splitDirection": "vertical",
    "leftOpen": true,
    "rightOpen": true,
    "leftWidth": 260,
    "rightWidth": 300,
    "activeLeftView": "files",
    "activeRightView": "outline",
    "recentFiles": ["notes/a.md"],
    "expandedFolders": ["notes"],
    "viewModes": { "notes/a.md": "source" }
  },
  "lastOpenFiles": ["notes/a.md"],
  "main": { "type": "split", "direction": "vertical", "children": [] }
}
```

**[Design choice]** The `clone` key is namespaced inside Obsidia's own `.obsidia/workspace.json`,
which the original application never reads. Obsidia preserves every key it does not own when
rewriting the file. `lastOpenFiles` is mirrored from `recentFiles` for interoperability. A workspace
file whose `clone` key is missing, has a different `version` or fails sanitisation reads as `null`;
the renderer then uses `defaultWorkspace()` — one empty pane, both sidebars open, widths 260/300 —
and does **not** open the first Markdown file or overwrite the foreign tree.

### 2.2 Renderer store shape

One flat Zustand store (`useStore`) with a single `workspace` object:

```ts
interface AppStore {
  status: 'loading' | 'picker' | 'error' | 'ready';
  bootError: string | null;
  vault: VaultInfo | null;
  vaults: VaultInfo[];
  lastVaultId: string | null;
  tree: VaultTree;
  settings: SettingsBundle;           // { vault, appearance, app }
  workspace: PersistedWorkspaceV1;
  buffers: Record<string, NoteBuffer>;
  links: LinkGraph;
  histories: Record<string, { stack: string[]; index: number }>;
  ui: UIState;
  toasts: Toast[];
  // actions: vault lifecycle, tabs/panes, editing, files, panels, overlays, persistence
}

interface NoteBuffer {
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

interface UIState {
  paletteOpen: boolean;
  quickOpenOpen: boolean;
  settingsOpen: boolean;
  settingsSection: 'editor' | 'appearance' | 'files' | 'hotkeys' | 'about';
  graphOpen: boolean;
  graphLocal: boolean;
  focusSearchNonce: number;
  closePrompt: { paneId: string; path: string } | null;
  deleteTarget: { path: string; kind: 'file' | 'folder' } | null;
  reveal: { path: string; text?: string; line?: number; heading?: string; nonce: number } | null;
  textPrompt: {
    kind: 'rename' | 'new-note' | 'new-folder';
    path?: string; parentDir?: string;
    title: string; label: string; value: string; confirmLabel: string;
  } | null;
}
```

`histories` is per pane, capped at 100 entries, and stores only note paths (not editor undo
history). Buffer mode is not stored in `NoteBuffer`; the active mode lives in
`workspace.viewModes[path]`, falling back to `settings.vault.defaultViewMode`.

### 2.3 Concurrency and persistence rules

- **Autosave** is 1500 ms after `setContent` for each path. A pending timer is cancelled when the
  tab is closed, the note is discarded or the entry is deleted. A conflicted buffer does not
  schedule autosave. `Ctrl+S` calls `saveNote` immediately.
- **Writes** send `expectedMtimeMs` (omitted only for a note marked missing). A mismatch returns
  `CONFLICT`; the renderer re-reads the file, stores `externalContent`/`externalMtimeMs`, shows a
  banner and never overwrites silently. Reload replaces the buffer; Keep Mine forces a save.
  `saveAll` skips conflicted buffers, so closing a vault or the app cannot resolve a conflict by
  accident.
- **External changes** arrive as `FileChangeBatch` events from chokidar. The main watcher batches
  for 120 ms with an 80 ms write-stability window, ignores `.obsidia`, legacy `.obsidian`, `.trash`,
  `.git`,
  `node_modules`, dotfiles and symlinked directories, and suppresses writes the app itself made
  for 2 s. A clean buffer reloads silently; a dirty buffer becomes conflicted with the external
  text; a removed note becomes `missing`.
- **Dirty-tab close** opens a prompt with Save / Discard / Cancel. Discard resets `content` to
  `savedContent` and clears conflict without writing; Save closes only if the write succeeds.
  The app close handshake sends `app:before-close`, saves all non-conflicted buffers, persists the
  workspace, then replies `app:quit-ready`.
- **Workspace persistence** is debounced 500 ms from a store subscription on `workspace` identity
  changes; `saveAll`, vault switching and the close handshake persist immediately. `beforeunload`
  makes a best-effort save for reloads. Main sanitises and clamps every write and uses
  `atomicWriteAbsolute`.
- **Sanitisation/clamping** happens in `main/vault/settings.ts`: at most 4 panes, 100 tabs per
  pane, valid active ids, widths 160–520, unique recent files capped at 40, valid view modes only,
  and view modes/tabs/recent/expanded-folder entries are filtered against the tree on open.
- **Window geometry** is not renderer state. `WindowStateStore` persists it per vault id in
  `<userData>/window-state.json`, defaulting to 1280×800 and clamping to 640–6000 × 420–4000.

### 2.4 Derived values

The store exposes only small helpers; most derivation happens in components with `useMemo`.

| Value | Derivation |
| --- | --- |
| active pane | `activePane(state)` → id match, else first pane |
| active file | `activePathOf(state)` → active pane's `activeTab` |
| note label | `noteLabel(path)` → shared `noteTitle` |
| text stats | `textStats(content)` in `lib/stats.ts`: words, characters, no-space characters, lines, reading minutes |
| outline | `OutlinePanel` parses the active buffer with `parseHeadings` and highlights the last heading at/before the cursor line |
| backlinks | `BacklinksPanel` groups `links.edges` by `from` where `to === activePath`; source contents are loaded with `api.readFile` for context snippets |
| unresolved links | `outgoingUnresolved(content, path, tree.files)` |
| tags | `parseTags(content)` plus `frontmatterTags(parseFrontmatter(content).data)`, merged case-insensitively |
| graph | main process `LinkGraph` snapshot in `links`; graph view caps at 500 nodes, highest degree first |
| search | `api.search` query results (MiniSearch unless regex/case/whole-word); the store does not cache results |

The clone does not persist a metadata cache to IndexedDB. The link graph and search index are
rebuilt in the main process on vault open and updated incrementally from file batches.
