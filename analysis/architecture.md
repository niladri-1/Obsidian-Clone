# Architecture — Obsidian 1.14.5 and the clean-room clone

This document separates three kinds of statements:

- **[Observed]** — recovered from static artifacts. Each claim carries an Evidence ID or a
  source path + line number in the prettified derived copy.
- **[Inferred]** — a conclusion drawn from observed facts; never presented as fact.
- **[Design choice]** — a decision for the clone in `src/`, including deliberate deviations.

Evidence anchors:

| Evidence ID | Subject |
| --- | --- |
| `ev_57a77ce03ffc7cd5a658b3e31a1ea453361b5ba9c6fc668406828c5c10ebc5e9` | PE inventory + partial full-tree JavaScript analysis |
| `ev_77a669f110dbc10e457fac83f9c4bd130b7fd12ceccd6221ffc763f3da9d47b3` | `app-main/main.js`, `package.json`, `index.html` |
| `ev_38afc11f5623a213607d0b854b0fc4609c080cdf5ae2706982e24ee46288dada` | `app-main/app.js` (CLI analysis, 2,916 findings, 195 modules) |

Source anchors use `app.pretty.js` / `main.pretty.js` (line-numbered derived copies of the
shipping bundles; see `analysis/inventory.md`).

---

## 1. Observed architecture

### 1.1 Process model

**[Observed]** The product is a two-layer Electron application:

1. A bootstrap ASAR (`resources/app.asar`) that selects, verifies and updates the product ASAR,
   then loads it. It keeps a 16-byte telemetry id in `userData/id`, writes `obsidian.log`, and
   fetches signed ASAR releases from GitHub / `releases.obsidian.md`
   (`_extracted/obsidian/app/main.js`).
2. The product main process (`app-main/main.js`) owning vault registry, windows, menus, IPC,
   sessions and dialogs.
3. Per-vault renderer windows loading `app://obsidian.md/index.html`, which loads `app.js`,
   `worker.js`, vendored CodeMirror/Pixi/Mermaid/PDF.js, and `app.css`
   (`_extracted/obsidian/app-main/index.html`).

### 1.2 Vault registry and window state

**[Observed]**

- Global registry lives at `userData/obsidian.json`, keyed by vault id, with `{path, ts, open}`
  entries. Stale vaults are pruned; a vault marked `open` is reopened on launch
  (`main.pretty.js` `vault-list`, `vault-remove`, `vault-move`, `vault-open` around lines
  6305–6360).
- `vault-open` creates the directory when the `create` flag is set (returning
  `"Vault already exists"` otherwise), then registers/opens it (`main.pretty.js` 6343–6357).
- `vault-move` refuses while a window is open with the sentinel `"EVAULTOPEN"`, then uses
  `renameSync` (`main.pretty.js` 6322–6341).
- Per-vault window geometry is stored in `userData/<vaultId>.json` as
  `x, y, width, height, isMaximized, devTools, zoom`; save is debounced 100 ms on resize/move and
  flushed on close; minimum size is 300×200 (`main.pretty.js` window state functions).
- Window defaults: 800×600, `minWidth 200`, `minHeight 150`, `show:false` until ready
  (`main.pretty.js` 5800–5818).

**[Inferred]** Vault identity is a stable generated id rather than the path, so a vault can be
moved/renamed without losing window state or cache.

### 1.3 Renderer composition

**[Observed]** `app.js` is a bespoke component/view system with a plugin-facing API:

- View types are registered through `registerViewType` / `registerViewWithExtensions`
  (`app.pretty.js` 157055, 158094–158097, 163516).
- Commands are registered through `addCommand` (`app.pretty.js` 113177+), with command ids such as
  `workspace:new-tab`, `switcher:open`, `markdown:toggle-preview`, `editor:toggle-source`,
  `file-explorer:new-file`, `backlink:open`, `graph:open`, `outline:open`, `search:open`.
- Key bindings go through a keymap/scope service (`app.pretty.js` 69620–69623 for the palette scope).

**[Observed]** No React/Vue/Svelte/Redux/MobX/Zustand dependency exists (0 hits). The DOM layer is
hand-written; state is held in service objects (`app.workspace`, `app.vault`, `app.metadataCache`,
`app.fileManager`).

### 1.4 Vault model and file I/O

**[Observed]**

- Per-vault configuration directory is the constant `.obsidian`
  (`app.pretty.js` 81348 `n.configDir = $P`, with `$P = ".obsidian"`).
- Known vault-level config files (Sync allowlist mapping, `app.pretty.js` 217135–217165):
  `workspace.json`, `workspace-mobile.json`, `app.json`, `types.json`, `appearance.json`,
  `hotkeys.json`, `core-plugins.json`, `core-plugins-migration.json`, `community-plugins.json`,
  `themes/<name>/theme.css|manifest.json`, `snippets/*.css`, plus plugin data folders.
- Workspace layout is read from `<configDir>/workspace.json` on desktop and
  `workspace-mobile.json` on mobile; it includes `lastOpenFiles` and is applied through
  `setLayout` (`app.pretty.js` 167575, 169099–169140). Saves are requested via
  `workspace.requestSaveLayout()` from many call sites (e.g. 86493, 87017).
- Default editor settings (`app.pretty.js` 81073–81115) include `livePreview:true`,
  `defaultViewMode:"source"`, `readableLineLength:true`, `showInlineTitle:true`,
  `useMarkdownLinks:false`, `newFileLocation:"root"`, `newLinkFormat:"shortest"`,
  `attachmentFolderPath:"/"`, `trashOption:"system"`, `alwaysUpdateLinks:false`,
  `autoPairBrackets:true`, `foldHeading:true`, `useTab:true`, `tabSize:4`.
- Text files are read with `readFile(path,"utf8")` and written with
  `writeFile(path,data,"utf8")` — a direct write, not a temp-file + rename
  (`app.pretty.js` 33254). `applyWriteOptions` restores ctime/mtime after writes.
- Deletion uses the OS trash (`shell.trashItem`) for the default `trashOption:"system"`.
- The watcher is `fs.watch(path,{persistent:false,encoding:"utf8",recursive:true})`; a change
  enqueues a `setTimeout(…,0)` and a serialized `queue()` that calls `reconcileFile`
  (`app.pretty.js` 33882–33912). Reconciliation distinguishes creation, modification and
  deletion, and emits vault events consumed by views and the metadata cache.

**[Inferred]** The serialized queue exists to avoid races between filesystem events and
programmatic writes; the layout/save debouncing limits disk churn on rapid tab operations.

### 1.5 Metadata cache and link graph

**[Observed]**

- A dedicated Web Worker named "Metadata Cache Worker" is constructed from `worker.js`
  (`app.pretty.js` 100982).
- The cache keeps per-file `fileCache`/`metadataCache` and global `resolvedLinks` /
  `unresolvedLinks` maps (`app.pretty.js` 100973, 100999, 101615, 95906, 95942).
- Cache writes go through `transactionSave("file"|"metadata", path, data)`, persisted with
  IndexedDB (`app.pretty.js` 101334, 101876–101882).
- Wikilink syntax is detected with `/!?\[\[/g` and parsed with
  `/^(!?)\[\[(.+?)]]/`; a stricter full-link parser `^(!?\[\[)(.*?)(\|(.*))?(]])$` is used for
  navigation, and markdown links are parsed separately. A leading `!` means embed.
- `getFirstLinkpathDest(linkpath, sourcePath)` resolves a link target using the vault's link
  resolution rules (`app.pretty.js` 100302, 90181, 95110).

**[Inferred]** Link resolution is shortest-path-first (`newLinkFormat:"shortest"` default), and
unresolved links are retained so the UI can offer "create note" affordances.

### 1.6 Search, graph, outline, backlinks

**[Observed]**

- Global search is a view (`global-search`, `search-view-container`) with an input, result list,
  and match highlighting classes; document search uses `cm-searchMatch` marks. There is no
  third-party index engine dependency (0 hits for Lunr/Elasticsearch).
- Graph view renders with PixiJS (`PIXI.Graphics`, `PIXI.Text`, `PIXI.Container`) and has global and
  local modes (`graph:open`, `graph:open-local`). A separate "Graph Worker" is constructed for
  simulation (`app.pretty.js` 138604 `/sim.js`).
- Backlinks are a view with `backlink`/`backlink-item` classes; the metadata graph provides both
  linked mentions and unresolved/unlinked candidates.
- Outline is a view (`outline`, `outline-view`) derived from headings in the metadata cache.

### 1.7 Security posture of the original

**[Observed]** The product main window sets `contextIsolation:false`, `nodeIntegration:true`,
`nodeIntegrationInWorker:true`, `webviewTag:true` (`main.pretty.js` 5814–5818; also 5294–5300),
and enables `@electron/remote` per webContents (`app/package.json` depends on
`@electron/remote` 2.1.3). Popups are allowed with the same insecure `webPreferences` block
(`main.pretty.js` 5288–5300), while attached webviews are hardened (5299–5325).

**[Inferred]** This is a legacy architecture chosen to let the renderer and community plugins use
Node directly. It is not a model to reproduce.

---

## 2. Clone architecture (design choices)

The clone is a fresh Electron + React + TypeScript application. It reproduces the *observable UX
and vault semantics*, not the original implementation.

### 2.1 Process and security model

```
┌──────────────────────────── main (Node) ────────────────────────────┐
│ vault registry · file ops (atomic) · chokidar watcher · search index │
│ link graph · settings persistence · native dialogs                   │
└───────────────▲──────────────────────────────────────────────────────┘
                │ contextBridge API, validated IPC (invoke only)
┌───────────────┴──────────────── renderer (sandboxed) ────────────────┐
│ React 18 · Zustand + Immer · CodeMirror 6 · markdown-it · DOMPurify  │
└──────────────────────────────────────────────────────────────────────┘
```

**[Design choice]** `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`,
`webviewTag:false`, `webSecurity:true`; a single preload exposes a frozen, whitelisted API.
The renderer never receives `fs`, `path`, `ipcRenderer` or absolute paths it can use for I/O.
No `@electron/remote`, no arbitrary URL loading, no `executeJavaScript` command bridge.

**[Design choice]** Every path from the renderer is a *vault-relative POSIX-style path*. The main
process resolves it against the active vault root and rejects:

- absolute paths, drive letters, UNC prefixes, `..` escapes after normalisation;
- paths whose realpath (or nearest existing ancestor's realpath) leaves the vault root — this also
  blocks symlink/junction escapes;
- NUL bytes and Windows reserved device names.

### 2.2 Main-process modules

| Module | Responsibility |
| --- | --- |
| `vault/registry.ts` | Vault list, add/open/remove, last-vault, id generation, settings path in `userData` |
| `vault/paths.ts` | `resolveInVault`, symlink checks, POSIX normalisation, reserved-name checks |
| `vault/fsops.ts` | Read, atomic write (temp + fsync + rename with retry/cleanup), create, rename, vault-local trash |
| `vault/watcher.ts` | chokidar watcher, debounce, ignore `.obsidia`/legacy `.obsidian`/trash, emit typed events |
| `vault/tree.ts` | Recursive tree (folders first, natural sort), allowed extensions |
| `vault/links.ts` | Wikilink + markdown-link extraction, resolution, backlinks, unresolved links, rename link updates |
| `vault/search.ts` | MiniSearch index; incremental add/update/remove; snippet extraction |
| `vault/settings.ts` | Vault `.obsidia/app.json` + `appearance.json` merge-preserving writes; global app prefs |
| `ipc.ts` | Channel registration + argument validation |
| `window.ts` | Secure `BrowserWindow` creation, window-state persistence |

Prescribed channels are implemented exactly: `vault:open`, `vault:list`, `file:read`,
`file:write`, `file:create`, `file:rename`, `file:delete`, `file:watch`, `search:query`,
`settings:get`, `settings:set`. Additive read-only channels: `vault:tree`, `vault:current`,
`vault:choose`, `links:graph`, `file:stat`, `shell:open-external`, `window:state`.

**[Design choice]** Mutating operations that touch the tree (`create`, `rename`, `delete`, `write`)
return the new `VaultTree` / affected metadata so the renderer can reconcile without a full refetch.

### 2.3 Atomic write protocol

```
1. validate path (resolveInVault + symlink check)
2. ensure parent exists (never create outside vault)
3. write payload to  <dir>/.tmp-<random>-<basename>  with mode 0600
4. fsync file handle, close
5. rename temp -> target; on EPERM/EBUSY/EACCES retry up to 5 times (25/50/100/200/400 ms)
6. fsync parent directory where supported
7. always unlink temp on failure
```

Self-writes are registered in a short-lived suppression map keyed by path+mtime size so the
watcher does not echo the application's own save back as an external change.

### 2.4 Renderer state

```
VaultState      { id, path, name, tree, files, folders }
WorkspaceState  { panes[], activePaneId, sidebar: {left, right}, activeLeftView,
                  activeRightView, tabs by id, recentFiles[] }
EditorState     { byPath: { content, dirty, mtime, mode: 'source'|'reading',
                            cursor, scroll, historyKey } }
UiState         { paletteOpen, switcherOpen, settingsOpen, graphOpen,
                  theme, zoom, toasts, contextMenu }
```

**[Design choice]** Zustand slices with Immer; persistence is explicit (debounced
`workspace:save`-equivalent via `settings:set` with key `workspace`), not `localStorage`, so the
layout survives a reinstall and stays inside the vault like the original `.obsidian/workspace.json`.
Unknown keys read from an existing `.obsidia/workspace.json` are preserved on write.

### 2.5 Editor and reading view

- CodeMirror 6 with markdown language, history, search, autocompletion; custom decorations for
  wikilinks, tags, headings, and embeds.
- `source` mode = syntax-highlighted markdown; `reading` mode = markdown-it rendered HTML,
  sanitised with DOMPurify, code highlighted with highlight.js.
- Live preview is approximated with inline decorations (styled headings/emphasis/code, clickable
  links) while keeping source characters editable. The clone does not claim pixel-level parity.
- Rename-with-link-update mirrors the observed `alwaysUpdateLinks` setting: when enabled, saving a
  rename rewrites wikilinks/markdown links that resolve to the old path.

### 2.6 Search, links, graph

- Main-process MiniSearch index over markdown (title boosted, headings, body, tags/frontmatter).
  Query returns path, title, score, matched terms and a plain-text snippet with offsets.
- Link graph built in main from a shared parser, refreshed incrementally on watcher events.
  `links:graph` returns `{ nodes, edges, unresolved }` for the graph view and backlinks panel.
- Graph view is original Canvas 2D force layout with pan/zoom and click-to-open; no PixiJS.

### 2.7 Deliberate deviations from the original

| Area | Original (observed) | Clone (design choice) | Reason |
| --- | --- | --- | --- |
| Renderer isolation | `nodeIntegration:true`, `contextIsolation:false`, `webviewTag:true` | sandboxed renderer + preload whitelist | security |
| File writes | direct `writeFile` | temp + fsync + rename + retry + cleanup | crash safety |
| Trash | OS trash via `shell.trashItem` | vault-local `.trash/` (configurable permanent delete) | never write outside vault |
| Config dir | `.obsidian` | `.obsidia` (merge-preserving, unknown keys kept); legacy `.obsidian` hidden and untouched | brand-owned config; no cross-app writes |
| Plugins/themes | community runtime, `@electron/remote` | not implemented; fixed first-party theme tokens | attack surface / scope |
| Graph engine | PixiJS/WebGL + worker | Canvas 2D force layout | simpler, original |
| Editor | CodeMirror 5 | CodeMirror 6 | maintained, smaller API surface |

## 3. Open questions / unknowns

- Exact original search ranking, snippet generation and fzf-style fuzzy matching are not fully
  recoverable from the bundle (minified, in-house implementation).
- The complete metadata cache schema (per-file headings/links/tags/embeds/frontmatter variants)
  was only partially reconstructed; the clone uses a documented subset.
- The original's exact live-preview decoration algorithm, plugin lifecycle and mobile layout are
  out of scope.
- Sync, Publish, Canvas, PDF, Mermaid/MathJax rendering, community marketplace and auto-update are
  intentionally excluded (see `analysis/feature-matrix.md`).
