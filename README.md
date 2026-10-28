# Obsidia

A local-first, desktop Markdown notebook built with Electron, React and TypeScript. Open a folder
of notes ("vault"), browse it as a tree, write Markdown with wiki-style links, and read it in a
rendered view. Every note stays a plain `.md` file on disk. There is no account, cloud, telemetry
or runtime network dependency.

This repository is a **clean-room** implementation. It was built from behavioural analysis of a
third-party application's shipped JavaScript (see [`analysis/`](analysis/)) and shares no source
code, icons, themes, fonts or trademarks with it. The original installer is not redistributed and
is not required to build or run this project.

## Status

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passing (main, preload, renderer, tests) |
| `npm run test` | 118 passed, 5 skipped (12 files) |
| `npm run build` | Passing (`out/main`, `out/preload`, `out/renderer`) |
| Built-app smoke | 21/21 checks pass (`npm run smoke:ui`) |

The prototype covers the note-taking core: vault lifecycle, file tree, Markdown editing and
reading, wiki links/backlinks, search, quick switcher, command palette, outline, graph, properties,
workspace persistence and a configurable light/dark theme. See
[`PARITY_REPORT.md`](PARITY_REPORT.md) for a feature-by-feature comparison and
[`analysis/feature-matrix.md`](analysis/feature-matrix.md) for the original evidence.

## Requirements

- **Node.js** 20.19+ or 22.12+ (required by Vite 7)
- **npm** 10+
- **Windows 10/11 x64** is the primary target and the only platform exercised here
- Linux and macOS should build from the same sources but are not currently tested

## Quick start

```powershell
npm install
npm run dev
```

On first launch, choose **Open folder** and select the bundled [`sample-vault/`](sample-vault), or
create an empty folder. The picker remembers recent vaults and reopens the last one on the next
launch.

To run the production build instead of the development server:

```powershell
npm run build
npm run start
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Electron + Vite development app with HMR |
| `npm run build` | Typecheck, then build main, preload and renderer into `out/` |
| `npm run start` | Launch the built app (`electron-vite preview`) |
| `npm run typecheck` | TypeScript for the Node/Electron, web and test projects |
| `npm run test` | Vitest unit and integration suites (run once) |
| `npm run test:watch` | Vitest watch mode |
| `npm run smoke:ui` | CDP smoke run of the built app (build first; Node 22+) |
| `npm run package` | Build and produce a Windows x64 NSIS installer in `release/` |

## Using the app

- **Vault picker** — open or create a vault; recent vaults can be reopened or forgotten.
- **File explorer** — create notes/folders, rename inline, delete to the vault trash, make a copy,
  copy a path, or reveal an item in the OS file manager.
- **Editor** — CodeMirror 6 with Markdown highlighting, wiki-link and tag autocomplete, live
  preview decorations, formatting commands, find-in-note, autosave and conflict handling.
- **Reading view** — CommonMark/GFM rendering with tables, tasks, footnotes, callouts, code
  highlighting, note transclusion and images from inside the vault. Rendered HTML is sanitised.
- **Right-click menus** — files, folders, tabs, notes, links and editor text expose core actions
  (open in new tab/to the side, rename, make a copy, copy paths, reveal, trash, formatting). Menus
  support arrow-key/Home/End navigation and restore focus when dismissed.
- **Right sidebar** — outline, backlinks (with context), unresolved outgoing links, tags and YAML
  properties.
- **Search** — full-vault search with case, whole-word and regular-expression options.
- **Navigation** — quick switcher, command palette, back/forward history, recent files, daily note
  and a global/local link graph.

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+N` / `Ctrl+Shift+N` | New note / new folder |
| `Ctrl+S` / `Ctrl+Alt+S` | Save note / save all |
| `Ctrl+O` / `Ctrl+P` | Quick switcher / command palette |
| `Ctrl+Shift+F` | Search vault |
| `Ctrl+E` | Toggle source and reading view |
| `Ctrl+W` | Close tab |
| `F2` | Rename current note |
| `Ctrl+\` | Toggle split pane |
| `Ctrl+G` or `Ctrl+Shift+E` | Graph view |
| `Ctrl+,` | Settings |
| `Alt+←` / `Alt+→` | Back / forward |
| `Ctrl+=` / `Ctrl+-` / `Ctrl+0` | Zoom in / out / reset |
| `Ctrl+B` | Bold in the editor; toggle left sidebar elsewhere |
| `Ctrl+Alt+B` / `Ctrl+Shift+B` | Toggle left / right sidebar |
| `Ctrl+F` | Find in the current note |

`Ctrl+B` is context-sensitive because the editor owns bold. The native menu uses
`Ctrl+Alt+B` for the left sidebar so it never shadows the editor shortcut.

## How this differs from Obsidian

Obsidia follows Obsidian's core note-taking model, but it is **not a drop-in replacement** and does
not read Obsidian's `.obsidian/` configuration: its own settings live in `.obsidia/`. The table
below states the user-visible differences plainly. Statements about Obsidian come from the static
analysis in [`analysis/`](analysis/); they are not a claim that the original was executed or that
its behaviour is complete.

| Area | Obsidian 1.14.5 (observed) | Obsidia |
| --- | --- | --- |
| Product scope | Commercial app with a plugin marketplace, themes, sync, Publish and mobile clients | Clean-room desktop app with its own name and UI; no accounts, telemetry, sync or network services. Packaging uses the default Electron icon |
| Tabs and panes | Nested split tree, stacked tabs, pinned/linked tabs, pop-out windows, drag-to-split | At most two panes, tab reorder, per-pane history; tab menu adds close others/after/all and split right/down, but no pin, link or pop-out |
| File explorer | Drag-and-drop moves, bookmarks/starred files, file recovery snapshots, configurable sort | Create/rename/delete/copy/reveal; a context menu covers open in new tab, open to the right, make a copy, copy paths and trash; no drag-move, bookmarks or snapshots |
| Editor | CodeMirror 5 plus plugin extensions and a full Live Preview/Vim implementation | CodeMirror 6 Markdown source editor with approximated inline live preview, autocomplete, formatting and a right-click command menu; no Vim or plugin modes |
| Reading view | Plugin renderers, Canvas, Bases, PDF/audio/video viewers, MathJax/KaTeX, Mermaid | Built-in CommonMark/GFM subset: tables, tasks, footnotes, callouts, code highlighting, images and one-level note embeds; no plugin blocks, math, diagrams or rich media viewers |
| Linking | Block references, block transclusion, unlinked mentions and automatic updates when files are moved anywhere | Wiki/Markdown links, aliases, heading targets, backlinks, unresolved outgoing links and tags; no block references or unlinked mentions |
| Search | Search operators, replace, grouping and saved queries | Full-vault text search with fuzzy ranking, case, whole-word and regex toggles, safe snippets; no operator syntax or replace |
| Properties | Typed property UI, inline properties and Bases databases | YAML frontmatter editor that preserves unknown keys; no typed property system or Bases |
| Graph | WebGL/PixiJS graph with filters, groups, depth and arrows | Canvas 2D force graph with pan/zoom, global/local modes and a 500-node display cap; no filters, groups or arrows |
| Vault config folder | `.obsidian/` with `app.json`, `appearance.json` and `workspace.json` | Own `.obsidia/` folder with the same file names; a legacy `.obsidian/` folder is hidden and never read or modified |
| Workspace | Multiple saved workspaces/layouts, persisted navigation history, pop-out leaves | One workspace per vault under the `clone` key, panes/tabs/recents/sidebar state persisted, history session-only |
| Appearance | Community themes, CSS snippets, per-vault themes | Original light/dark/system tokens, accent colour and base font size; no community themes or snippets |
| Delete | System trash by default, with an optional vault `.trash` folder | Vault-local `.obsidia/trash/` or permanent delete, always inside the vault |
| Make a copy | Copies the file and immediately starts an inline rename on the copy (`app.pretty.js` 86950–86985, 87280–87314) | Copies to a free sibling name such as `Welcome 1.md` and reports it in a toast; no automatic rename step |
| Security model | Observed renderer config allows Node integration and exposes a broad host API (`main.pretty.js` 5814–5818) and writes notes directly (`app.pretty.js` 33254) | Sandboxed, context-isolated renderer, whitelisted preload, atomic writes, path containment, DOMPurify and a strict production CSP |
| Integration | `obsidian://` URIs, auto-update, installer/mobile distribution | No custom URI handler, auto-update, telemetry or installer-delivered updates |
| Hotkeys | Rebindable through settings | Fixed shortcuts listed in Settings → Hotkeys; no rebinding |
| Daily notes | Configurable folder, format and template | Fixed `Daily/YYYY-MM-DD.md` with no template |
| Context menus | Core plus plugin-contributed items, native-style sections | Core file/tab/note/link/editor menus with keyboard navigation; no plugin-contributed items |

The clone intentionally chooses stricter, smaller behaviour where the original relies on its plugin
runtime or privileged renderer. The remaining functional gaps are repeated in
[Known limitations](#known-limitations) for a quick checklist.

## Project layout

```text
analysis/                 static reverse-engineering notes and retained evidence
docs/                     feature spec, implementation architecture and test plan
sample-vault/             a small original vault for first-run testing
src/
  shared/                 contracts, types, path helpers, link parser, frontmatter
  main/                   Electron main process
    vault/                registry, path containment, atomic I/O, tree, links, search, watcher
    ipc.ts                validated IPC handlers
    window.ts, security.ts, menu.ts, index.ts
    vault-asset-protocol.ts
  preload/                the only renderer bridge (`window.vaultApi`)
  renderer/               React UI
    store/                Zustand store and persistence
    components/           shell, workspace, editor, reading, panels, overlays
    lib/                  markdown, formatting, commands, fuzzy matching, editor bridge
    styles/               original tokens and application CSS
out/                      build output (generated)
tests/                    Vitest suites
scripts/                  built-app CDP smoke harness
```

For module responsibilities and process boundaries see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md);
for the product contract see [`docs/FEATURE_SPEC.md`](docs/FEATURE_SPEC.md).

## Vault data

Obsidia keeps its own settings in the `.obsidia/` folder inside each vault. Obsidian's
`.obsidian/` folder, if present, is hidden and left untouched:

| Path | Contents |
| --- | --- |
| `<vault>/.obsidia/app.json` | Vault-scoped editor, file and link settings |
| `<vault>/.obsidia/appearance.json` | Theme, accent and base font size |
| `<vault>/.obsidia/workspace.json` | Panes, tabs, sidebars, recent files (namespaced under `clone`) |
| `<vault>/.obsidia/trash/` | Deleted notes, prefixed with a timestamp |

Unknown keys in these files are preserved on write, including entries written by other tools.
Obsidia only claims its own `clone` subtree in `workspace.json`, so a foreign workspace layout is
not destroyed. Notes are UTF-8 Markdown with optional YAML frontmatter; line endings and a UTF-8 BOM
are preserved.

Application-wide data lives under Electron's `userData` directory — on Windows
`%APPDATA%\Obsidia\`: the vault registry (`vaults.json`), global settings (`settings.json`) and
per-vault window geometry (`window-state.json`). Nothing is written outside the selected vault and
`userData`.

## Security model

The renderer is treated as untrusted:

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webviewTag: false`,
  `webSecurity: true`; no remote module and no arbitrary navigation.
- A single preload script exposes a frozen, whitelisted `window.vaultApi`; `ipcRenderer`, `fs` and
  `path` are never exposed.
- Every renderer path is vault-relative. The main process normalises it, rejects absolute/UNC/drive
  paths and `..`, rejects Windows reserved names, and verifies the real path (or nearest existing
  ancestor) is still inside the vault, which blocks symlink and junction escapes.
- Writes are atomic: a temporary file in the same directory, fsync, then rename with retries and
  cleanup. A failed write cannot leave a half-written note at the target path.
- Rendered Markdown is sanitised with DOMPurify; scripts, event handlers, iframes and
  `javascript:`/unsafe `data:` URLs are removed.
- External links are limited to `http`, `https` and `mailto`. Images from the vault are served
  through a custom `vaultfile://` protocol with containment checks and a MIME allowlist.
- The production renderer ships a strict CSP; development omits it because Vite's React-refresh
  preamble requires an inline module.
- No telemetry, no auto-update, no background network requests, no OS trash. Deletion stays inside
  the vault.

## Testing

```powershell
npm run typecheck
npm run test
npm run build
```

The suites cover path containment and symlink rejection, atomic writes and retry injection, tree
sorting and file operations, link parsing/resolution/rewriting, Markdown rendering and XSS
sanitisation, search modes, settings and workspace preservation, renderer/window security, preload
surface, IPC validation and rename-link integration. Filesystem tests use real temporary
directories; renderer-library tests use jsdom.

The five skips are environment-dependent: symlink tests are skipped when the host disallows symlink
creation, and the POSIX permission test is skipped on Windows. See
[`docs/TEST_PLAN.md`](docs/TEST_PLAN.md) for the matrix and manual QA checklist.

A CDP-driven smoke run exercises the built app against a throwaway copy of `sample-vault/`:

```powershell
npm run build
npm run smoke:ui
```

It checks boot and the 29-key preload surface, opening a note, outline, reading view (callout,
image, footnote, task, code, table), the task toggle writing to disk, a standard Markdown link
opening its target, file/link/tab/editor context menus (including duplicate-to-trash, split right
and keyboard navigation), backlinks/unresolved links/tags, search, quick switcher, graph, theme
persistence, split panes, create/rename/autosave, unsaved-close Save, delete to vault trash,
workspace restore after reload, and a clean renderer console. The last run passed 21/21. Screenshots
and `report.json` are written to a temporary directory printed at the end. The harness uses Node's
built-in `WebSocket` global, so run it on Node 22 or newer.

## Packaging

```powershell
npm run package
```

This produces an unsigned NSIS installer in `release/`. Builds are local and unsigned; they are
not distributed with the analysed third-party executable or its assets. Last run (2026-10-27):

- `release/Obsidia-1.0.0-x64-setup.exe` — 121.35 MB, SHA-256
  `87D89B88DFAF8A5B7000D1C7D692A68582B39BE41CED2918592862FB12B40113`;
- x64, per-user, non-one-click NSIS, appId `com.obsidia.app`, shortcut/executable named `Obsidia`,
  default Electron icon, no code-signing certificate configured.

## Known limitations

- No sync, Publish, collaboration, mobile app, accounts or telemetry.
- No community plugins, custom themes, CSS snippets, Canvas, Bases, PDF viewer, MathJax/KaTeX,
  Mermaid, Vim mode or auto-update. These are explicit non-goals.
- No `obsidian://` URI handler, pop-out windows, pinned/linked tabs or saved workspace layouts.
- Obsidia writes its own `.obsidia/` config and does not import settings from an existing
  `.obsidian/` folder; that folder is kept untouched.
- The contextual menus cover the core actions only; plugin-contributed menu items do not exist.
- "Make a copy" does not start Obsidian's follow-up inline rename; the copy keeps a free name and a
  toast reports it.
- Rename is limited to the same parent folder; there is no move-by-rename or drag-and-drop move.
- Attachments already inside the vault render in reading view, and linked files can be revealed in
  the OS file manager. There is no paste/drag upload pipeline; `attachmentFolderPath` is persisted
  but not yet used to place new attachments.
- Opening a non-Markdown file shows a message rather than an image/PDF preview.
- Live preview is an approximation using inline editor decorations, not pixel parity with the
  analysed application.
- There is no Playwright/Spectron suite. A CDP smoke harness (`npm run smoke:ui`) covers the core
  note-taking flows end to end; drag/drop, native menus and remaining window behaviour are manual
  QA. Performance targets in the spec have not been benchmarked on 10,000-note vaults.
- The production renderer chunk is large (about 4 MB) because highlight.js currently imports every
  language grammar. This affects build size, not correctness.
- Hotkeys are fixed; the settings screen lists them but does not offer rebinding.

## Analysis provenance

The behavioural analysis is documented in:

- [`analysis/inventory.md`](analysis/inventory.md) — installer and artifact inventory
- [`analysis/architecture.md`](analysis/architecture.md) — observed process model, vault model, I/O
- [`analysis/feature-matrix.md`](analysis/feature-matrix.md) — feature inventory with evidence
- [`analysis/ipc-channels.md`](analysis/ipc-channels.md) — observed IPC surface
- [`analysis/file-layout.md`](analysis/file-layout.md) — vault and configuration layout
- [`analysis/state-shape.md`](analysis/state-shape.md) — settings and workspace shapes
- [`analysis/ui-inventory.md`](analysis/ui-inventory.md) — visible surfaces and commands

Retained REA evidence is in `analysis/evidence/`. The exported
`obsidian-1.14.5.bundle.json` is intentionally retained in full (~190 MB); it is a local analysis
artefact and is not part of a distributable build. Derived, line-numbered copies of the analysed
bundles live under `_extracted/` and are likewise not redistributed.

The analysed installer (`Obsidian-1.14.5.exe`) is kept outside the build inputs. It is never
executed by the app, bundled by electron-builder, or included in a release.

## License

MIT for this clean-room implementation. See [`LICENSE`](LICENSE). Third-party dependencies retain
their own licenses; the analysed application's code and assets are not included.
