# Parity report — Obsidian 1.14.5 vs. Obsidia

This report compares the observed behaviour of **Obsidian 1.14.5** with **Obsidia 1.0.0**.

- The original was analysed **statically only**. It was never launched for this work, so all
  statements about its behaviour are derived from shipped JavaScript, CSS, HTML and metadata.
- The clone was built independently. It contains no original source, icons, themes, fonts,
  trademarks or copied UI text.
- Evidence identifiers (`ev_…`) and derived line anchors refer to
  `analysis/evidence/` and the prettified copies described in `analysis/inventory.md`. A line
  anchor is not a claim that the original was executed.

Status vocabulary:

| Status | Meaning |
| --- | --- |
| **Full** | The user-visible capability is present and behaves equivalently for the documented cases. |
| **Partial** | The capability exists with a narrower scope, different underlying engine or known gap. |
| **Improved** | Deliberately stronger than the original (usually security or integrity). |
| **Not implemented** | Explicitly out of scope for this build. |
| **Unknown** | Static analysis could not establish the original behaviour. |

## 1. Summary

Obsidia reaches functional parity for the core note-taking loop: open/create a vault, browse a
folder tree, edit Markdown, render a reading view, follow wiki links, inspect backlinks and
properties, search the vault, navigate with tabs/splits/quick switcher/command palette, and restore
the workspace. File, tab, note, link and editor context menus cover the corresponding Obsidian
actions, with keyboard navigation. It also adds a graph view, daily notes, outline, tags and a
configurable theme.

It is intentionally **not** a binary- or UI-level replica. The original is a bespoke DOM application
with CodeMirror 5, PixiJS and a plugin runtime; the clone uses React, CodeMirror 6, markdown-it and a
Canvas 2D graph. Several security properties are stronger by design (sandboxed renderer, atomic
writes, vault-local trash, path containment, sanitised HTML).

The main parity gaps are: community plugins/themes, sync/Publish, Canvas/Bases/PDF, MathJax/KaTeX,
Mermaid, Vim mode, auto-update, bookmarks and unlinked mentions, attachment upload/paste,
move-by-rename, arbitrary nested split layouts, configurable daily-note format, persisted
back/forward history, and hotkey rebinding.

## 2. Evidence basis

| Evidence | Subject | Use in this report |
| --- | --- | --- |
| `ev_57a77ce03ffc7cd5a658b3e31a1ea453361b5ba9c6fc668406828c5c10ebc5e9` | PE inventory and partial full-tree JavaScript analysis | Artifact identity, package layout, partial tree facts |
| `ev_77a669f110dbc10e457fac83f9c4bd130b7fd12ceccd6221ffc763f3da9d47b3` | `app-main/main.js`, `package.json`, `index.html` | Window model, vault registry, IPC, menu |
| `ev_38afc11f5623a213607d0b854b0fc4609c080cdf5ae2706982e24ee46288dada` | `app-main/app.js` CLI analysis | Renderer modules, commands, links, cache |
| `analysis/evidence/app-js.summary.json` | Condensed CLI analysis | Module/finding statistics |
| `analysis/evidence/main-ipc-surface.txt` | 47 literal main-process channels | IPC comparison |
| `analysis/evidence/ui-strings.txt` | Recovered UI strings and view names | Surface inventory |
| `_extracted/pretty/app.pretty.js` | Derived, line-numbered renderer copy | Behaviour anchors |
| `_extracted/pretty/main.pretty.js` | Derived, line-numbered main-process copy | Window/vault anchors |

The complete retained REA bundle is `analysis/evidence/obsidian-1.14.5.bundle.json`. It is a local
analysis artefact and is not part of the application build.

## 3. Vault and file system

| Capability | Observed in Obsidian 1.14.5 | Clone | Status |
| --- | --- | --- | --- |
| Open an existing folder as a vault | `vault-open` registers the path and opens a window; `create` creates the directory | `vault:open` validates a directory, assigns a stable id, opens it | **Full** |
| Create a new vault | Creates the folder recursively when the `create` flag is set (`main.pretty.js` 6343–6357) | Picker "Create vault"; creates the folder and `.obsidia/` | **Full** |
| Recent-vault registry | `userData/obsidian.json`, keyed by vault id with `{path, ts, open}`; `vault-list` (`main.pretty.js` 6305–6360) | `userData/vaults.json` with `{version, vaults, lastVaultId}`; on Windows `userData` is `%APPDATA%\Obsidia`; picker lists recents | **Full** |
| Application identity | Name `Obsidian`, AUMID/trademark assets owned by the vendor | Name `Obsidia`, appId `com.obsidia.app`, `Obsidia.exe`, installer `Obsidia-1.0.0-x64-setup.exe`, userData `%APPDATA%\Obsidia` | **Distinct identity** — no shared name, icon or assets |
| Remove a vault | `vault-remove` (`main.pretty.js` 6308–6341) | `vault:remove`, active vault protected | **Full** |
| Move a vault on disk | `vault-move` with `EVAULTOPEN` guard and `renameSync` (`main.pretty.js` 6322–6341) | Not exposed; open the moved folder again | **Not implemented** |
| Vault config directory | Constant `.obsidian` (`app.pretty.js` 81348) | Own `.obsidia/` directory with merge-preserving writes; a legacy `.obsidian/` folder is hidden and never read or modified | **Partial** — separate config, no settings import |
| Default vault settings | `livePreview:true`, source mode, readable line length, shortest links, attachment root, system trash, etc. (`app.pretty.js` 81073–81115) | Equivalent defaults, except local trash; documented in `analysis/file-layout.md` | **Full** |
| Recursive file tree, folders first | Explorer tree; view name `file-explorer` in `ui-strings.txt` | Recursive tree, folders-first natural sort, hidden config/trash/dot dirs | **Full** |
| Create note/folder | `file-explorer:new-file`, `:new-folder` commands | Explorer commands, context menu and command palette | **Full** |
| Rename file/folder | Inline rename in the explorer | Inline rename and note-title rename | **Partial** — same parent folder only; no move-by-rename |
| Make a copy | File menu copies via `vault.copy` to a free name, then opens it with an inline rename (`app.pretty.js` 86950–86985, 87280–87314) | File/tab/note menus call `file:duplicate`; recursive copy to a free sibling name, tree/index refresh, success toast | **Partial** — no automatic inline rename; folder copies skip symlinks and enforce safety caps |
| Delete to trash | Default `trashOption:"system"` via OS trash (`app.pretty.js` 81073–81115) | Vault-local `.obsidia/trash/` or permanent delete | **Improved** — deletion never writes outside the vault |
| Update links on rename | `alwaysUpdateLinks` setting (`app.pretty.js` 103470, 103494) | Same setting; rewrites resolvable wiki/Markdown links, preserving aliases/headings | **Full** for same-folder renames |
| External changes reflected live | Recursive `fs.watch` with serialized reconcile queue (`app.pretty.js` 33882–33912) | chokidar watcher, debounced batches, tree/link/search/index updates, conflict detection | **Full** |
| Conflict handling | Reconcile path reloads clean editors; inferred dirty-buffer conflict flow | mtime-checked writes return `CONFLICT`; banner offers Reload / Keep mine | **Full** |
| Attachments and images | Vault attachments, embeds and an attachment-folder setting | Vault attachments render via `vaultfile://`; images and note embeds work | **Partial** — no paste/drag upload pipeline; `attachmentFolderPath` is not used for placement |
| Atomic writes | Direct `writeFile(path,data,"utf8")` (`app.pretty.js` 33254) | Temp file + fsync + rename + retry + cleanup | **Improved** |
| Path containment | Host API for first-party/plugin use; no renderer sandbox | All paths validated in main, symlink-aware, reserved names rejected | **Improved** |

## 4. Editing and reading

| Capability | Observed in Obsidian 1.14.5 | Clone | Status |
| --- | --- | --- | --- |
| Markdown source editor | CodeMirror 5 bundle (`lib/codemirror`, `cm-*`) | CodeMirror 6 with Markdown language and syntax highlighting | **Partial** — different engine; no Vim/legacy CM extensions |
| Reading/preview mode | `markdown:toggle-preview`; leaf state `mode`; view string "preview" (`app.pretty.js` 90114, `ui-strings.txt`) | Per-tab `source`/`reading` mode, `Ctrl+E`, persisted | **Full** |
| Live preview styling | `livePreview:true` default and `live-preview` classes (`app.pretty.js` 81096) | Inline CodeMirror decorations for headings, emphasis, code, links, tags | **Partial** — approximate, not pixel parity |
| Wiki links | `!?[[` detection and dedicated parser; alias/heading forms | `[[target]]`, `[[target|alias]]`, `[[target#heading]]`, escaped forms ignored | **Full** |
| Embeds | Leading `!` marks an embed; note and attachment embeds | Note transclusion one level and image embeds; missing targets become safe links | **Partial** — no PDF/audio/video embed viewer |
| Markdown links | Separate Markdown-link parser | Inline links, images, angle-bracket destinations; note links open in reading view | **Full** |
| Tags | Tag indexing in the metadata cache | Body and frontmatter tags, case-insensitive index, tag chips | **Full** |
| YAML frontmatter/properties | Properties view and `propertiesInDocument` | Properties panel edits scalar keys and tags; preserves other YAML | **Full** |
| Callouts | Callout command and styles | `> [!note]` parsing with title/body and variants | **Full** |
| Task lists | Checklist commands | GFM task rendering, editor format command, click-to-toggle in reading view | **Full** |
| Code blocks and highlighting | Prism outside CodeMirror | highlight.js in reading view; CodeMirror language highlighting in source | **Full** |
| Tables | Insert-table command | markdown-it tables plus insert-table command | **Full** |
| Footnotes | Insert-footnote command | markdown-it footnote rendering and insert command | **Full** |
| Math (MathJax/KaTeX) | MathJax bundled | Not rendered | **Not implemented** |
| Mermaid diagrams | Mermaid bundled | Not rendered | **Not implemented** |
| Auto-pair brackets/quotations | Defaults true (`app.pretty.js` 81086–81089) | `closeBrackets` and Markdown-aware pairing when enabled | **Full** |
| Vim mode | `vimMode:false` default, bundled vim.js (`app.pretty.js` 81093) | None | **Not implemented** |
| Spellcheck | Window preference `spellcheck:true` (`main.pretty.js` 5817) | Native spellchecker enabled; per-vault attribute toggle | **Full** |
| HTML safety | Original renderer can execute plugin and inline content by design | markdown-it output sanitised by DOMPurify; strict CSP in production | **Improved** |
| Reading task interaction | Inferred from Markdown task support | Checkbox toggles the source task and saves | **Full** (clone behaviour) |
| Note transclusion | Embeds include notes | One-level transclusion with cycle guard | **Partial** — no recursive depth control |

## 5. Navigation and workspace

| Capability | Observed in Obsidian 1.14.5 | Clone | Status |
| --- | --- | --- | --- |
| Tabs | `workspace:new-tab`/close commands; tab strip; tab menu closes others/after/all and splits (`app.pretty.js` 70350–70710) | Per-pane tabs, reorder, middle-click/close, dirty prompt, tab menu close others/after/all and split right/down | **Full** for core tab actions; no pin/link/pop-out |
| Split panes | Nested split tree with vertical/horizontal direction (`app.pretty.js` 88612) | Two panes, direction toggle, per-pane tabs/history | **Partial** — no arbitrary nested split tree |
| Sidebars and ribbon | Left/right splits and ribbon layout (`app.pretty.js` 169653–169665) | Left files/search, right outline/backlinks/properties, ribbon, resizable widths | **Full** |
| Quick switcher | `switcher:open` command | `Ctrl+O`, fuzzy path/alias matching, recent-first, new-tab modifier | **Full** |
| Command palette | `command-palette:open` command | `Ctrl+P`, fuzzy filter, categories and key hints | **Full** |
| Back/forward history | Per-leaf history serialized into workspace state (`app.pretty.js` 89991–89999) | Per-pane session history with `Alt+←/→` | **Partial** — history is not persisted across restarts |
| Recent files | `lastOpenFiles` in workspace (`app.pretty.js` 167587–167640) | `recentFiles` in workspace, capped at 40, recent-first | **Full** |
| Outline | Outline view from cached headings (`ui-strings.txt`: `outline`) | Live heading parse, click-to-scroll, heading reveal from links | **Full** |
| Backlinks | `resolvedLinks`/`unresolvedLinks` metadata graph (`app.pretty.js` 95906–95942, 100973–100999) | Resolved backlinks with context, unresolved outgoing links with Create, tag list | **Partial** — no unlinked mentions |
| Bookmarks | `bookmarks:open` command | None | **Not implemented** |
| Daily notes | Daily-note commands (`daily-notes:goto-prev/next`) | Opens/creates `Daily/YYYY-MM-DD.md` | **Partial** — fixed folder/format, no template |
| Global/local graph | PixiJS/WebGL graph plus "Graph Worker" (`app.pretty.js` 138604) | Canvas 2D deterministic force layout, pan/zoom, local mode, click-to-open | **Partial** — different engine and visual limits |
| Workspace persistence | `workspace.json` layout with `main`/`left`/`right`/`active`/`lastOpenFiles` (`app.pretty.js` 169653–169700) | Own schema under `clone`; foreign keys/trees preserved, not imported | **Partial** — format-compatible storage, different schema |
| Context menus | File-explorer menu with open/new/rename/copy/delete and plugin `file-menu` items (`app.pretty.js` 86832–87004); tab menu with close/split/pin/link/pop-out (`app.pretty.js` 70350–70710, 70611–70710); link and editor menus | File, tab, note, reading-link and editor menus; keyboard navigation, focus restore, disabled-item skipping; no plugin items | **Partial** — core actions covered, plugin contributions and some leaf actions absent |
| Window geometry | Per-vault `userData/<vaultId>.json` (observed window-state functions) | `userData/window-state.json` keyed by vault id; clamps bad bounds | **Full** |

## 6. Search and metadata

| Capability | Observed in Obsidian 1.14.5 | Clone | Status |
| --- | --- | --- | --- |
| Full-text vault search | Global search view (`global-search` in `ui-strings.txt`) | MiniSearch over title/headings/body/tags/path plus literal scan | **Full** |
| Match highlighting | Search match classes in the search view | Safe snippet offsets rendered as `<mark>` | **Full** |
| Case-sensitive / regex options | Search UI options; in-house engine | Case, whole-word and regex toggles; invalid regex returns an inline error | **Full** |
| Metadata cache | Dedicated worker, per-file cache, IndexedDB persistence (`app.pretty.js` 100982, 101334) | In-memory link graph/search index rebuilt on open and updated incrementally | **Partial** — no cross-session cache database |
| Shortest link resolution | `newLinkFormat:"shortest"` default (`app.pretty.js` 81105) | Exact path, suffix, basename and alias resolution; shortest then lexical | **Full** |
| Unresolved links | `unresolvedLinks` map (`app.pretty.js` 100999) | Stored in graph; panel offers Create; graph shows unresolved targets | **Full** |
| Search ranking parity | In-house fzf-style matching and ranking (unknown exact algorithm) | MiniSearch boost + literal title scan | **Partial** — different ranking |
| Incremental index updates | Metadata cache transactions and vault events | Watcher batches update tree, links and search index | **Full** |

## 7. Appearance, settings and platform

| Capability | Observed in Obsidian 1.14.5 | Clone | Status |
| --- | --- | --- | --- |
| Light/dark/system theme | `.theme-light`/`.theme-dark` classes and theme dispatch | `system`/`light`/`dark`, live OS preference listener | **Full** |
| Accent colour | `--accent-h/s/l` variables and `accentColor` | Original token palette derived from a user accent | **Full** |
| Base font size | Appearance settings | 10–32 px, applied to note surfaces | **Full** |
| Readable line length | Default true (`app.pretty.js` 81076) | Toggle constrains measure and centres content | **Full** |
| Inline title | Default true (`app.pretty.js` 81080) | Editable title above the editor, rename on Enter/blur | **Full** |
| Settings modal | Settings views/panes | Editor, Appearance, Files & links, Hotkeys reference, About | **Full** |
| Hotkey customisation | `hotkeys.json` mapping (`app.pretty.js` 217135+) | Fixed shortcuts with a reference screen | **Not implemented** |
| CSS snippets / community themes | `snippets/`, `themes/` config mapping (`app.pretty.js` 217135+) | Original first-party theme only | **Not implemented** |
| External links open in browser | `open-url` / `request-url` main channels | `shell:open-external` allowlist: http/https/mailto | **Improved** |
| Native menu | `set-menu` / `render-menu` channels | Native File/Edit/View/Go/Help menu dispatching renderer commands | **Full** |
| Auto-update | Signed ASAR fetch from release servers (`_extracted/obsidian/app/main.js`) | None | **Not implemented** |
| Sync / Publish | Server products | None | **Not implemented** |
| Canvas / Bases / PDF viewer | Bundled subsystems | None | **Not implemented** |
| Community plugins/themes | Runtime plugin API and marketplace | None; fixed first-party surface | **Not implemented** |
| Telemetry id | `userData/id` in bootstrap | None | **Improved** (no telemetry) |

## 8. Deliberate differences

These are design decisions, not accidental omissions.

| Area | Obsidian 1.14.5 (observed) | Obsidia (design choice) | Why |
| --- | --- | --- | --- |
| Renderer privileges | `contextIsolation:false`, `nodeIntegration:true`, `webviewTag:true` (`main.pretty.js` 5814–5818) | Sandboxed renderer, context isolation, whitelisted preload | A renderer compromise must not become arbitrary filesystem/Node access |
| File writes | Direct `writeFile` (`app.pretty.js` 33254) | Atomic temp + fsync + rename with retries and cleanup | Crash/power-loss safety; no half-written notes |
| Delete | OS trash (`trashOption:"system"` default) | Vault-local `.obsidia/trash/` (or permanent delete) | "Never write outside the vault" rule |
| Path handling | Renderer/plugins can use host APIs | Every operation validated against a canonical vault root, including symlink escapes | Blocks traversal and junction escapes |
| Attachments | Embedded viewers for images/PDF/audio/video | `vaultfile://` with containment and MIME allowlist; images/notes only | Smaller attack surface and no unsafe file loading |
| HTML rendering | Renderer executes first-party/plugin content | markdown-it → DOMPurify with strict allowlist; strict production CSP | Prevents script injection from notes |
| Graph | PixiJS/WebGL with worker | Canvas 2D deterministic force layout | Original implementation; no GPU/worker dependency |
| Editor | CodeMirror 5 | CodeMirror 6 | Maintained, smaller integration surface |
| Workspace file | Full Obsidian layout tree | Clone schema under `clone`; foreign data preserved | Avoid destroying an Obsidian workspace while remaining compatible in storage |
| Plugins/themes | Runtime community ecosystem | Not implemented | Scope and security; no remote code execution |
| Auto-update | Remote ASAR fetch | None | Local builds only; no runtime network |
| Rename | Can change folder/path | Rename is same-parent; no move | Keeps link rewriting and tree updates predictable |
| Daily notes | Configurable format/template | Fixed `Daily/YYYY-MM-DD.md` | Small, predictable first implementation |

## 9. Known gaps and unknowns

**Gaps**

- No upload/paste flow for attachments; `attachmentFolderPath` is stored but unused for new files.
- Non-Markdown files cannot be opened as tabs, so there is no image/PDF preview tab.
- No arbitrary nested splits (maximum two panes).
- Back/forward stacks are not persisted across restarts.
- No unlinked mentions in the backlinks panel.
- No bookmarks, configurable daily-note templates, hotkey rebinding, workspace layout import, or
  move-by-rename.
- "Make a copy" does not start the original's follow-up inline rename; the copy is created with a
  free name and announced in a toast.
- Context menus implement core actions and keyboard navigation but no plugin-contributed items,
  pinned/linked tabs or pop-out actions.
- No community plugins/themes, CSS snippets, Canvas, Bases, PDF, MathJax, Mermaid, Vim, sync,
  Publish, mobile, auto-update or telemetry.
- No Playwright/Spectron suite. A CDP smoke harness (`npm run smoke:ui`) drives the built app
  through the 21 core flows listed in `docs/TEST_PLAN.md` §3.0; remaining window and input
  behaviour is manual QA.
- Performance targets (1,000-note cold start, 10,000-note search, 5,000-line typing) were not
  benchmarked in this environment.
- The renderer bundle is about 4 MB because highlight.js imports all language grammars.

**Unknowns about the original**

- Exact search ranking, fuzzy matching and snippet selection are minified/in-house and could not be
  reconstructed. The clone does not claim ranking parity.
- The full metadata-cache schema and IndexedDB transaction format were only partially recovered.
  The clone implements an explicit in-memory subset.
- Some cross-module relations in `app.js` exceeded the retained analysis budget (see
  `analysis/inventory.md` §5), so a few behaviours remain inferred rather than observed.
- No runtime observation of the original was performed; anything that depends on server-side
  feature flags, licensing, or plugin runtime behaviour is outside this comparison.

## 10. Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passes for `tsconfig.node.json`, `tsconfig.web.json`, `tsconfig.test.json` |
| `npm run test` | 12 suites, 118 passed, 5 skipped (environment-dependent) |
| `npm run build` | Passes; emits `out/main/index.js`, `out/preload/index.js`, renderer bundles |
| `npm run smoke:ui` | Built app on a copy of `sample-vault`: 21/21 checks, 0 renderer errors |
| `npm run package` | `release/Obsidia-1.0.0-x64-setup.exe`, unsigned NSIS x64 installer, 121.35 MB, SHA-256 `87D89B88DFAF8A5B7000D1C7D692A68582B39BE41CED2918592862FB12B40113` (not signed; default icon) |

Automated coverage includes path containment and symlink rejection, atomic-write retry/cleanup,
tree sorting and CRUD, recursive duplication and free-name allocation, link parsing/resolution/
rewriting, Markdown rendering and XSS sanitisation, search modes and invalid regex, settings/
workspace preservation and clamping, window security, preload surface, IPC validation and
rename-link integration. See `docs/TEST_PLAN.md`.

The five skips are environment-dependent: four symlink tests when Windows refuses symlink creation
and one POSIX mode test on Windows. They are reported as skips rather than silent passes.

Parity is assessed against static evidence only. The clone has not been compared side-by-side with
a running Obsidian instance, and no pixel/visual comparison is claimed.

## 11. Requirements traceability

| Spec area | Implementation | Verification |
| --- | --- | --- |
| FR-1 vault lifecycle | `src/main/vault/registry.ts`, `src/main/ipc.ts`, `VaultPicker.tsx` | `ipc.test.ts`, manual first-run |
| FR-2 files and tree | `path`/`fsops`/`tree`/`links`, `FileExplorer.tsx` | `paths`, `fsops`, `tree`, `vault-service` tests |
| FR-3 editor | `NoteEditor.tsx`, `store/useStore.ts`, `lib/format.ts` | Typecheck, smoke §3.0, manual QA |
| FR-4 reading view | `lib/markdown.ts`, `ReadingView.tsx` | `markdown.test.ts`, smoke §3.0 |
| FR-5 links/properties | `shared/links.ts`, `BacklinksPanel.tsx`, `PropertiesPanel.tsx` | `links.test.ts`, `vault-service.test.ts`, smoke §3.0 |
| FR-6 search/navigation | `vault/search.ts`, `SearchPanel`, `QuickSwitcher`, `CommandPalette`, `GraphView` | `search.test.ts`, smoke §3.0, manual QA |
| FR-7 settings/appearance | `vault/settings.ts`, `SettingsModal.tsx`, `tokens.css` | `settings.test.ts`, smoke §3.0 |
| FR-8 workspace/window | `store/useStore.ts`, `window.ts`, `menu.ts` | `security.test.ts`, smoke §3.0, manual QA |
| FR-9 security/integrity | `security.ts`, `preload/index.ts`, `vault/paths.ts`, `fsops.ts`, `vault-asset-protocol.ts` | `security`, `preload`, `ipc`, `paths`, `fsops-retry` tests |
