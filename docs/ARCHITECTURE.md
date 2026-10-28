# Architecture — clone implementation

Companion documents: `docs/FEATURE_SPEC.md` (scope), `analysis/architecture.md` (observed
Obsidian architecture and design rationale), `docs/TEST_PLAN.md` (verification).

## 1. Stack

| Layer | Choice |
| --- | --- |
| Shell | Electron 45 (main + preload + sandboxed renderer) |
| Build | electron-vite 6 / Vite 7, TypeScript 5.9, electron-builder 26 |
| UI | React 19, Zustand 5 + Immer 10 |
| Editor | CodeMirror 6 (`@codemirror/lang-markdown`, search, autocomplete, language-data) |
| Rendering | markdown-it 14 (+ anchor, footnote, task lists), DOMPurify 3, highlight.js 11 |
| Metadata | gray-matter (frontmatter), shared link/frontmatter parsers |
| Files | chokidar 4 (watch), custom atomic fs primitives |
| Search | MiniSearch 7 |
| Icons | lucide-react |
| Styling | plain CSS with custom properties (no UI framework, no Tailwind) |
| Tests | Vitest 5 (+ jsdom for Markdown tests), real temporary directories for fs tests |

No runtime network access. No telemetry. No native modules.

## 2. Process boundaries

```
┌────────────────────────────── main ───────────────────────────────┐
│ app lifecycle · secure windows · native menu · vaultfile protocol  │
│ VaultRegistry · VaultService · WindowStateStore                    │
│   paths (containment) → fsops (atomic) → tree / links / search     │
│   watcher → 120 ms batch → tree + link graph + search update       │
│ settings (vault .obsidia + userData)                              │
└──────────────▲───────────────────────────┬────────────────────────┘
               │ invoke (validated)        │ events (typed payloads)
┌──────────────┴───────────────────────────▼────────────────────────┐
│ preload: contextBridge.exposeInMainWorld('vaultApi', …)           │
└──────────────▲─────────────────────────────────────────────────────┘
               │ no Node, no ipcRenderer
┌──────────────┴───────────────────────────── renderer ─────────────┐
│ React shell · one Zustand store · CodeMirror · markdown-it         │
│ Canvas 2D graph · sidebar panels · overlay dialogs                 │
└────────────────────────────────────────────────────────────────────┘
```

### 2.1 Window security

`src/main/security.ts` is the single source of truth for renderer privileges
(`SECURE_RENDERER_PREFERENCES`). `src/main/window.ts` passes it to `BrowserWindow`:

```ts
webPreferences: {
  preload: join(__dirname, '../preload/index.js'),
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  sandbox: true,
  webviewTag: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  experimentalFeatures: false,
  navigateOnDragDrop: false,
  spellcheck: true, // availability only; the per-vault setting controls the editor attribute
}
```

Additional hardening:

- single-instance lock; a second launch focuses the existing window;
- `setWindowOpenHandler` denies every popup; allowlisted `http`/`https`/`mailto` URLs are passed
  to `shell.openExternal`;
- `will-navigate` blocks navigation away from the current document;
- `will-attach-webview` is cancelled;
- session permission requests and permission checks are denied;
- a strict production CSP (`src/main/security.ts` `PRODUCTION_CSP`) is attached to responses when
  `app.isPackaged`, and a build-only Vite plugin injects the same policy as a `<meta>` tag;
- development omits the CSP because Vite's React-refresh preamble uses an inline module;
- devtools appear in the native View menu only in unpackaged builds;
- the `vaultfile` scheme is registered as standard/secure with no CSP bypass.

## 3. Main modules

### 3.1 `vault/registry.ts`

Persists `{ version: 1, vaults: StoredVault[], lastVaultId }` in `userData/vaults.json` using the
same atomic writer. `StoredVault` is `{ id, path, name, lastOpenedAt }`; ids come from
`crypto.randomUUID()`.

- `list()` stats every stored path and adds `missing: true` when it is no longer a readable
  directory.
- `open(path, create)` canonicalises the path, creates it recursively when `create` is set
  (refusing an existing non-directory), verifies it is a readable directory, upserts by path
  (case-insensitive on win32), updates `lastOpenedAt`/`name`, and persists.
- corrupt JSON is renamed `vaults.json.corrupt-<timestamp>` and replaced with an empty registry;
- `remove(id)` refuses to forget the currently open vault at the IPC layer.

### 3.2 `vault/paths.ts`

```ts
resolveInVault(root: string, rel: string, options?: {
  allowRoot?: boolean;
  forUser?: boolean; // default true: block the app-managed folders
}): Promise<string>
```

Rules, in order:

1. `rel` is a string, length ≤ 4096, no `\0`.
2. reject absolute, drive-letter, UNC/`//`, and `~` prefixes.
3. convert `\` to `/`; `normalizeRelPath` drops empty/`.` segments and resolves interior `..`;
   an escape past the root throws.
4. reject Windows reserved basenames (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`), forbidden
   characters, and segments ending in a dot or space; segments are capped at 240 characters.
5. reject `.obsidia`, the legacy `.obsidian` folder, and `.trash` as the first segment for
   user-initiated operations.
6. resolve against the canonical vault root and assert the target is inside it.
7. realpath check: `realpath` the target if it exists, otherwise the nearest existing ancestor,
   and verify the real result is still inside the real vault root. This blocks symlinks and
   junctions, including for files that do not exist yet.
8. return the absolute native path; the renderer only ever sees vault-relative POSIX paths.

`assertValidName` validates single names for create/rename; `assertDirectChild` enforces that
rename targets stay in the same parent folder. The vault root itself is canonicalised by
`canonicalizeRoot` when a vault is opened.

### 3.3 `vault/fsops.ts`

- `readTextFile(absolute, relative)`: `stat` first (5 MB cap), read bytes, detect/retain a UTF-8
  BOM, strip NUL bytes, normalise CRLF to LF for the editor, and return
  `{ content, mtimeMs, size, hadBom, eol }`.
- `writeTextFile(absolute, relative, content, expectedMtimeMs?)`: when `expectedMtimeMs` is
  supplied, a missing file or an mtime difference greater than 2 ms returns `CONFLICT`; otherwise
  the existing EOL/BOM are detected and preserved through the atomic writer.
- `atomicWriteAbsolute(target, data, { eol, bom, mode })`: creates a sibling temp file named
  `.~<basename>.<uuid>.tmp` with mode `0600` and `wx`, writes, `sync`s, closes, then renames over
  the target. `EPERM`/`EBUSY`/`EACCES`/`ENOTEMPTY` renames retry up to five times (25/50/100/200/
  400 ms). The temp file is unlinked on failure and the directory is fsynced on POSIX. A
  successful write registers a self-write marker.
- `createEntryAbsolute`, `renameAbsolute`, `deleteToTrash`, `listDirectory`, `uniquePath`:
  `wx`/collision semantics, case-only rename through a temporary name on Windows, trash under
  `<vault>/.obsidia/trash/<timestamp>-<name>` with copy+unlink fallback for `EXDEV`, and
  `Untitled`, `Untitled 1`, … name allocation.
- self-write suppression: path → expiry map with a 2 s window, consulted by the watcher.

### 3.4 `vault/tree.ts`

Walks with `fs.promises.readdir(dir, { withFileTypes: true })`. `.obsidia`, legacy `.obsidian`,
`.trash`,
`node_modules`, `.git`, and any dot-prefixed name are hidden. Only Markdown (`md`, `markdown`) and
allowlisted attachment extensions are listed. Symlinked directories are never traversed;
`listDirectory` presents them as file-like entries. Sort is folders first, then
`localeCompare(..., { numeric: true, sensitivity: 'base' })`. Limits: depth 40, 50,000 entries
(`TOO_LARGE`). A watcher batch rebuilds the whole tree; there is no incremental tree patch.

`findNode` and `collectMarkdownFiles` are small helpers; `src/shared/paths.ts` owns path and
extension classification shared with the renderer.

### 3.5 Links — `src/shared/links.ts`

The parser and graph builder are framework-free and shared by main and renderer (there is no
`vault/links.ts`):

- `maskNonProse` replaces frontmatter, fenced code, inline code, and comments with spaces while
  preserving offsets, so links and tags are not discovered in code.
- `parseWikilinks`, `parseMarkdownLinks`, `parseTags`, `parseHeadings` return items with offsets;
  escaped brackets and escaped hashes are ignored.
- `resolveWikilink(target, sourcePath, index)` tries: exact vault-relative path (case-insensitive,
  `.md` optional), relative resolution, frontmatter alias, then basename/suffix match. Ambiguity
  prefers the shortest path, then lexical order.
- `buildLinkGraph({ markdownPaths, contents, allPaths, aliases })` returns `nodes`, `edges`
  (`from`, `target`, `to`, `embed`, `alias`, `heading`) and `unresolved`. Backlinks are derived
  from `edges` in the renderer, not embedded in the graph.
- `rewriteLinks(content, { targetMap, sourcePath, index, allPaths, useMarkdownLinks })` rewrites
  only links that resolve to a changed path, preserving aliases/headings and emitting either the
  shortest wikilink target or a relative Markdown link. `VaultService.renameEntry` calls it when
  `alwaysUpdateLinks` is on.

### 3.6 `vault/search.ts`

`SearchIndex` builds a MiniSearch document per Markdown note with fields `title`, `headings`,
`tags`, `aliases`, `body`; boosts are `4/2/2/3/1`, prefix matching on, fuzzy `0.15`, `OR`
combination. Body text is capped at 200,000 characters. Indexing is eager on vault open
(concurrency 8) and updated on each write/watcher change; it is not lazily batched.

`query({ query, limit, caseSensitive, wholeWord, regex })`:

- no flags: MiniSearch search, snippets from a normalised title/headings/body string;
- `regex`, `caseSensitive`, or `wholeWord`: a literal/regex scan across the in-memory documents;
  an invalid regex returns `{ error }` rather than throwing;
- results are capped at 200; `matchStart`/`matchLength` are offsets into the returned snippet, not
  the raw file, and the renderer escapes and marks that snippet itself.

### 3.7 `vault/watcher.ts`

chokidar with `ignoreInitial: true`, `depth: 40`, `followSymlinks: false`,
`awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 20 }`, and an ignore predicate for
`.obsidia`, legacy `.obsidian`, `.trash`, `node_modules`, `.git`, and dot-prefixed paths.
`add`/`change`/`unlink` and
directory events are coalesced in a 120 ms window into `{ added, changed, removed }`; add/remove
pairs cancel out. Self-writes are dropped using the fsops marker.

A batch triggers a fresh `buildTree`, re-reads touched Markdown, removes deleted documents from
the link/search caches, rebuilds the link graph, broadcasts `file:changed`, then `vault:changed`.
A watcher error is reported to the main process and flushes any pending batch; there is no
full-rescan scheduler.

### 3.8 `vault/settings.ts`

- Vault settings live in `<vault>/.obsidia/app.json`; appearance in `appearance.json`; workspace
  in `workspace.json`.
- Missing values fall back to `DEFAULT_VAULT_SETTINGS` / `DEFAULT_APPEARANCE`; known keys are
  type-checked, enum-checked, and clamped (tab size 1–8, font size 10–32, widths 160–520).
- Unknown root keys (`appAliases`, `appearanceAliases`, `workspaceAliases`) are kept and re-emitted
  on the next atomic write, so other tools' keys survive.
- Corrupt JSON is renamed `*.corrupt-<timestamp>` before defaults are used.
- The workspace is namespaced under `clone` plus a `lastOpenFiles` mirror; the rest of
  `workspace.json` is preserved. `readWorkspace()` requires `clone.version === 1` and sanitises
  panes (max 4), tabs (max 100), widths, recent files (deduped, max 40), expanded folders, and
  view modes; a missing/foreign `clone` returns `null`.
- `GlobalSettingsStore` writes `userData/settings.json` (`theme`, `zoom`, `lastVaultId`) with the
  same unknown-key preservation.

## 4. IPC layer

`src/shared/ipc.ts` defines channel constants, limits, request/response types, and the
`VaultApi` contract. `src/preload/index.ts` exposes exactly that contract plus `platform` through
`contextBridge`; `src/main/ipc.ts` registers handlers with hand-written guards.

Channels:

| Group | Channels |
| --- | --- |
| Vault | `vault:open`, `vault:list`, `vault:choose`, `vault:remove`, `vault:current`, `vault:tree` |
| Workspace | `workspace:load`, `workspace:save` |
| Files | `file:read`, `file:write`, `file:create`, `file:duplicate`, `file:rename`, `file:delete`, `file:watch` |
| Search / links | `search:query`, `links:graph` |
| Settings | `settings:get`, `settings:set` (`vault` \| `appearance` \| `app`) |
| Shell | `shell:open-external`, `shell:reveal` |
| Lifecycle | `app:quit-ready` (renderer → main) |
| Events | `file:changed`, `vault:changed`, `settings:changed`, `app:menu-command` |

`file:watch` only acknowledges; the watcher starts with the vault. Renderer-facing errors are
structured:

```ts
type IpcErrorCode = 'INVALID_ARGUMENT' | 'OUTSIDE_VAULT' | 'NOT_FOUND' | 'EXISTS' |
                    'CONFLICT' | 'TOO_LARGE' | 'UNSUPPORTED' | 'IO_ERROR' | 'NO_VAULT' |
                    'UNKNOWN';
type IpcResult<T> = { ok: true; data: T } | { ok: false; error: { code; message } };
```

Path arguments must be non-empty bounded strings; request objects are checked before reaching
the service; settings patches only accept known keys. Events are broadcast to every app window
via `webContents.send`, never to a caller-supplied sender. `vault:open` disposes the previous
`VaultService` (watcher, caches) before creating the next one.

## 5. Renderer architecture

### 5.1 Store

One flat Zustand store in `src/renderer/store/useStore.ts`, wrapped in the Immer middleware. The
authoritative shape is in `store/types.ts`:

- `status` (`loading` \| `picker` \| `error` \| `ready`), `bootError`;
- `vault`, `vaults`, `lastVaultId`, `tree`, `settings`, `links`, `workspace`;
- `buffers: Record<path, NoteBuffer>` where `NoteBuffer` carries `content`, `savedContent`,
  `mtimeMs`, `eol`, `hadBom`, `dirty`, `missing`, `conflict`, optional `externalContent`/
  `externalMtimeMs`, `loading`, `error`, `cursor`, `scrollTop`;
- `histories: Record<paneId, { stack, index }>`;
- `ui`: palette/quick-switch/settings/graph flags, graph-local toggle, search focus nonce,
  close/delete/text prompts, and a reveal request;
- `toasts`.

There are no slices or `selectors.ts`. `activePane(state)` and `activePathOf(state)` are exported
from the store module; panels derive their own views from buffers/links. Workspace changes are
persisted by a store subscription with a 500 ms debounce. `closeOtherTabs`, `closeTabsAfter` and
`closeAllTabs` close dirty tabs only after the normal prompt (they keep unsaved tabs open and report
it), while `openToSide` creates a pane in the requested direction and `duplicateEntry` copies a file
or folder through `file:duplicate` and refreshes the tree and link graph.

### 5.2 Opening and saving

`openNote(path, options)`:

1. rejects non-Markdown paths with a toast (no preview tab);
2. reuses an existing pane that already holds the tab unless `newTab` is set;
3. adds the tab, makes it active, records the view mode and recent file, and pushes history;
4. reads the file once into `buffers[path]`; a read failure removes the tab and shows the error.

`setContent` marks the buffer dirty and schedules a 1.5 s autosave. `saveNote`:

- skips conflicted buffers unless forced (`keepMine` is the explicit force path);
- writes with `expectedMtimeMs` (omitted when the file was deleted, so a save recreates it);
- on success updates `savedContent`/`mtimeMs` and adopts any `links` returned by main;
- on `CONFLICT`, re-reads the external content and shows reload/keep-mine;
- other failures keep the buffer dirty and show a toast.

`saveAll` saves dirty, non-conflicted, non-loading buffers and then flushes the workspace. Closing
the window uses a handshake: main sends `app:before-close`, the renderer calls `saveAll()` and
`notifyReadyToQuit()`, and main force-quits after 1.6 s if no acknowledgement arrives.

### 5.3 Editor integration

`components/editor/NoteEditor.tsx` creates one CodeMirror view per note (keyed by path) and keeps
it in sync through effects:

- a `Compartment` reconfigures tab size, line numbers, wrapping, spellcheck, auto-pair, live
  preview, Tab handling, and keymaps when settings change;
- a Markdown language, highlight styles, history, search, autocomplete, fold, and bracket
  extensions are installed once;
- live-preview decorations conceal heading/link syntax on inactive lines and mark headings,
  quotes, wikilinks (resolved/unresolved/embed), and tags; code spans/blocks are skipped;
- autocomplete offers vault note targets after `[[` and vault tags after `#`;
- `Ctrl/Cmd+B`/`I` format inside the editor, Enter continues lists/quotes, Backspace deletes
  markup;
- document changes push into the store; external content changes are applied with change
  suppression; cursor and scroll are recorded per buffer;
- a reveal request (from outline, links, or search) scrolls to a heading/line/text and clears
  itself;
- right-clicking the editor opens a formatting/clipboard menu (cut, copy, paste, select all,
  inline formatting, lists, block elements, save).

Commands reach the active view through `lib/editorBridge.ts`, which maps path → `EditorView`.
Formatting commands live in `lib/format.ts`; the command registry is `lib/commands.ts`.

### 5.4 Reading view

`lib/markdown.ts` builds markdown-it with `html: true`, `linkify: true`, anchor slugs, footnotes,
and task lists. Custom inline rules emit wikilinks, embeds, and tags; standard Markdown links are
resolved relative to the note. Note embeds transclude once (depth 1, cycle-guarded), images
resolve through `vaultfile://`, external images are replaced by a blocked notice, and fenced code
is highlighted with a copy button.

The full HTML string is then sanitised with DOMPurify: `style`, `script`, `iframe`, `object`,
`embed`, `form`, `link`, `meta`, `base`, `svg`, and `math` are forbidden; `style`, `srcset`, and
`formaction` attributes are forbidden; URI schemes are limited to `http`, `https`, `mailto`,
`tel`, `vaultfile`, and relative targets. External anchors get
`rel="noreferrer noopener"` and `target="_blank"`. Task checkboxes are interactive; clicks map
through `data-task-index` to `lib/tasks.ts`, which toggles the matching task in the source buffer.
Right-clicking a rendered note, attachment, external or tag link opens a link-specific menu (open,
open in new tab, open to the right, copy paths/URL/tag, reveal).

### 5.5 Graph

`components/overlays/GraphView.tsx` is a full-screen modal overlay, not a workspace leaf. It:

- builds nodes/edges from `links`, optionally filters to the active note plus immediate neighbours,
  and caps the display at the 500 highest-degree notes;
- seeds positions deterministically with a golden-angle spiral and runs a synchronous
  90–220-iteration force layout (repulsion, edge springs, weak centring);
- renders on Canvas 2D with device-pixel-ratio scaling, fit-to-view, wheel zoom, pointer pan and
  hover labels, and opens a note on click.

There is no WebGL, worker, or separate force-graph module.

### 5.6 Shell, panels, keyboard

`App.tsx` switches between loading, boot-error, vault-picker, and workspace shells. The workspace
is `TitleBar`, `Ribbon`, optional left sidebar + resizer, one or more `Pane`s with `TabStrip` and
`NoteView`/`EmptyPane`, status bar, and optional right sidebar. Panes support vertical/horizontal
split (user-toggleable), tab reorder, and per-pane history. Overlays are
`QuickSwitcher`, `CommandPalette`, `SettingsModal`, `GraphView`, `Dialogs`, and `Toasts`.
`components/ui/ContextMenu.tsx` is the shared portal menu used by the file explorer, tab strip,
note header, reading links and editor; it clamps to the viewport, supports arrow/Home/End
navigation, skips disabled items and restores the previous focus.

The left sidebar shows files or search; the right shows outline, links (backlinks, unresolved
targets, tags), or properties. `useGlobalHotkeys` implements the keyboard map and is deliberately
context-sensitive: `Ctrl+B` is bold inside `.cm-editor` and toggles the left sidebar elsewhere;
the native menu uses `Ctrl+Alt+B` for the sidebar. `useAppEvents` bridges main events, performs the
close handshake, and persists the workspace after changes.

### 5.7 Styling

`styles/tokens.css` defines an original neutral ramp and accent-derived colours;
`[data-theme="light"]`/`[data-theme="dark"]` override them and `useTheme.ts` resolves `system`.
`styles/app.css` contains all component styling (no CSS modules or utility framework). Layout
uses CSS grid for the shell and flex for panes; sidebar widths are inline styles driven by drag
resizers.

## 6. Failure handling

| Failure | Behaviour |
| --- | --- |
| Vault path missing | Registry lists it with `missing: true`; the picker can forget it. Opening it fails with a toast and the picker stays. |
| Unreadable file | `readFile` returns an error; the tab is removed and a toast is shown. |
| Invalid UTF-8 | Bytes decode with U+FFFD replacement characters; NULs are stripped. The note still opens (no warning toast). |
| Rename collision / invalid name | `EXISTS` / `INVALID_ARGUMENT` from the service; a toast is shown; no partial state. |
| Rename outside the same parent | Rejected by `VaultService.renameEntry`; the file is not moved. |
| Disk full / EACCES | `IO_ERROR`; temp file cleaned; buffer stays dirty; toast. |
| Watcher error | Pending batch flushed, an empty `file:changed` is broadcast, error logged; later events continue. No full rescan. |
| Corrupt settings JSON | File renamed `*.corrupt-<ts>`; defaults used. |
| Corrupt workspace JSON | File renamed `workspace.json.corrupt-<ts>`; empty workspace opened. Foreign keys still survive later writes. |
| Missing/foreign `clone` key | Workspace opens empty; the clone does not claim a foreign layout and preserves unknown keys when it next writes. |
| External edit while clean | Buffer reloads from disk via `file:changed`. |
| External edit while dirty | Conflict state with reload / keep-mine; `saveAll` never force-overwrites. |
| File deleted while open | Buffer marked `missing`; saving recreates it. |

## 7. Build and packaging

- `electron-vite` builds `src/main`, `src/preload`, and `src/renderer` into `out/`.
- `electron-builder.yml` targets Windows NSIS (x64), appId `com.obsidia.app`, product name
  "Obsidia", output `release/`; builds are unsigned and local.
- Filesystem footprint: `Obsidia-1.0.0-x64-setup.exe` (installer), `Obsidia.exe` (app),
  `%APPDATA%\Obsidia\` (Electron `userData`: `vaults.json`, `settings.json`,
  `window-state.json`), and `<vault>/.obsidia/` for per-vault settings. The legacy `.obsidian/`
  folder name is never created by this app and is never read or modified.
- ASAR is enabled. `vaultfile` is registered via `protocol.registerSchemesAsPrivileged` before
  `app.whenReady()`, and handled with containment, a 50 MB cap, a MIME allowlist, `nosniff`, and
  a restrictive per-response CSP.
- Local scripts: `dev`, `build` (typecheck + build), `start`, `typecheck`, `test`, `test:watch`,
  `smoke:ui`, `package`.

## 8. Traceability

| Spec | Implementation |
| --- | --- |
| FR-1 | `vault/registry.ts`, `components/overlays/VaultPicker.tsx`, `ipc.ts`, `window.ts` |
| FR-2 | `vault/tree.ts`, `vault/fsops.ts`, `shared/links.ts`, `vault/service.ts`, `components/panels/FileExplorer.tsx` |
| FR-3 | `components/editor/NoteEditor.tsx`, `lib/editorBridge.ts`, `lib/format.ts`, `store/useStore.ts` |
| FR-4 | `lib/markdown.ts`, `components/reading/ReadingView.tsx`, `lib/tasks.ts` |
| FR-5 | `shared/links.ts`, `shared/frontmatter.ts`, `vault/service.ts`, `components/panels/BacklinksPanel.tsx`, `PropertiesPanel.tsx` |
| FR-6 | `vault/search.ts`, `components/panels/SearchPanel.tsx`, `overlays/QuickSwitcher.tsx`, `overlays/CommandPalette.tsx`, `overlays/GraphView.tsx` |
| FR-7 | `vault/settings.ts`, `components/overlays/SettingsModal.tsx`, `styles/tokens.css` |
| FR-8 | `store/useStore.ts`, `window.ts`, `menu.ts`, `components/workspace/Pane.tsx`, `TabStrip.tsx` |
| FR-9 | `preload/index.ts`, `vault/paths.ts`, `vault/fsops.ts`, `security.ts`, `window.ts`, `vault-asset-protocol.ts` |
