# Feature matrix — Obsidian 1.14.5 vs. the clean-room clone

Legend: **P0** = required for the clone to be usable as a note-taking app; **P1** = valuable
parity, implemented where feasible; **Out** = explicitly out of scope.
Status values: `implemented`, `partial`, `out`.
"Tested" means the behaviour has direct automated coverage; `manual` means it is exercised by the
manual QA checklist in `docs/TEST_PLAN.md`. Integrated flows are also covered by the CDP smoke run
(`scripts/smoke-ui.mjs`, `npm run smoke:ui`).

Evidence: `ev_57a77c…` (tree), `ev_77a669…` (main process), `ev_38afc1…` (`app.js`),
`app.pretty.js` / `main.pretty.js` line anchors, `analysis/evidence/ui-strings.txt`.

## 1. Vault and files

| # | Feature | Observed in original | Evidence | Priority | Clone status |
| --- | --- | --- | --- | --- | --- |
| V1 | Open an existing folder as a vault | `vault-open` registers path, opens window | `main.pretty.js` 6343–6356 | P0 | implemented — tested (`ipc.test.ts`) |
| V2 | Create a new vault (empty folder) | `mkdirSync(recursive)` when `create` flag | `main.pretty.js` 6346–6354 | P0 | implemented — tested (`ipc.test.ts`) |
| V3 | Vault registry / recent vaults | `userData/obsidian.json`, `vault-list` | `main.pretty.js` 6305, 6297 | P0 | implemented — tested (`settings.test.ts`, `ipc.test.ts`) |
| V4 | Remove/move vault entry | `vault-remove`, `vault-move` (`EVAULTOPEN`) | `main.pretty.js` 6308–6341 | P1 | partial — remove implemented/tested, move absent |
| V5 | Recursive file tree, folders first | file explorer tree | ui-strings (`file-explorer`) | P0 | implemented — tested (`tree.test.ts`) |
| V6 | Create note / folder | `file-explorer:new-file`, `:new-folder` | command inventory | P0 | implemented — tested (`vault-service.test.ts`) |
| V7 | Rename note/folder | context menu + inline rename | command inventory | P0 | partial — same-parent only; tested (`vault-service.test.ts`) |
| V8 | Delete to trash | `trashOption:"system"` default; OS trash | `app.pretty.js` 81073–81115 | P0 | partial — vault-local trash instead of OS trash (deliberate); tested (`fsops.test.ts`, `vault-service.test.ts`) |
| V9 | Update links on rename | `alwaysUpdateLinks` setting | `app.pretty.js` 103470, 103494 | P1 | implemented — tested (`vault-service.test.ts`) |
| V10 | External file changes reflected live | `fs.watch` recursive + reconcile queue | `app.pretty.js` 33882–33912 | P0 | implemented — manual |
| V11 | Attachments / images in notes | attachment folder setting, `![[image.png]]` | `app.pretty.js` 81073+ | P1 | partial — rendering/reveal implemented; no paste/drag upload; tested (`markdown.test.ts`) |
| V12 | Conflict handling for external edits | reconcile triggers editor reload | inferred | P1 | implemented — manual |
| V13 | Make a copy (file/folder) | file menu copies to a free name, then opens the copy for inline rename | `app.pretty.js` 86950–86985, 87280–87314 | P1 | partial — recursive copy to a free sibling name; no inline rename; tested (`vault-service.test.ts`, `ipc.test.ts`) |

## 2. Editing and reading

| # | Feature | Observed | Evidence | Priority | Clone status |
| --- | --- | --- | --- | --- | --- |
| E1 | Markdown source editor | CodeMirror-based editor | `lib/codemirror`, `cm-*` classes | P0 | implemented with CodeMirror 6 (different engine) |
| E2 | Reading/preview mode | `markdown:toggle-preview`, `leaf.state.mode` | `app.pretty.js` 90114; ui-strings (`preview` 29) | P0 | implemented — tested (`markdown.test.ts`) |
| E3 | Live preview inline styling | `livePreview:true` default, `live-preview` class | `app.pretty.js` 81096; ui-strings | P1 | partial — inline decorations, not pixel parity |
| E4 | Wikilinks `[[note]]`, `[[note|alias]]`, `[[note#heading]]` | dedicated parsers | `app.pretty.js` link regexes | P0 | implemented — tested (`links.test.ts`) |
| E5 | Embeds `![[note]]` / `![[image.png]]` | leading `!` documented by parser | link parser | P1 | partial — note + image embeds; no PDF/audio/video viewer; tested (`markdown.test.ts`) |
| E6 | Markdown links | separate markdown-link parser | `app.pretty.js` 1612618 offset | P0 | implemented — tested (`links.test.ts`, `markdown.test.ts`) |
| E7 | Tags `#tag` | tag indexing in metadata cache | `app.js` metadata cache | P1 | implemented — tested (`links.test.ts`, `search.test.ts`) |
| E8 | YAML frontmatter / properties | properties view, `propertiesInDocument` | ui-strings (`properties` 12) | P1 | implemented — manual |
| E9 | Callouts `> [!note]` | callout command and CSS | command inventory | P1 | implemented — tested (`markdown.test.ts`) |
| E10 | Task lists | checklist commands | `editor:toggle-checklist-status` | P0 | implemented — tested (`markdown.test.ts`) |
| E11 | Code blocks + syntax highlighting | Prism/CM modes | `app.js` strings | P0 | implemented — tested (`markdown.test.ts`) |
| E12 | Tables | insert-table command | command inventory | P0 | implemented — tested (`markdown.test.ts`) |
| E13 | Footnotes | insert-footnote command | command inventory | P1 | implemented — tested (`markdown.test.ts`) |
| E14 | Math (MathJax/KaTeX) | MathJax bundled | `lib/` | Out | out |
| E15 | Mermaid diagrams | Mermaid bundled | `lib/mermaid.min.js` | Out | out |
| E16 | Auto-pair brackets/markdown | defaults true | `app.pretty.js` 81086–81089 | P1 | implemented — manual |
| E17 | Vim mode | `vimMode:false` default, `vim.js` | `app.pretty.js` 81093 | Out | out |
| E18 | Spellcheck | `spellcheck:true` window pref | `main.pretty.js` 5817 | P1 | implemented — native spellchecker plus per-vault toggle |

## 3. Navigation and workspace

| # | Feature | Observed | Evidence | Priority | Clone status |
| --- | --- | --- | --- | --- | --- |
| N1 | Tabs | tab strip, `workspace:new-tab/close` | ui-strings (`tab` 29) | P0 | implemented — manual |
| N2 | Split panes (vertical/horizontal) | split tree, split commands | `app.pretty.js` 88612, commands | P1 | partial — two panes, direction toggle |
| N3 | Sidebars + ribbon | left/right splits, `left-ribbon` | `app.pretty.js` 169653–169665 | P0 | implemented — manual |
| N4 | Quick switcher | `switcher:open` | command inventory | P0 | implemented — manual |
| N5 | Command palette | `command-palette:open` | command inventory | P0 | implemented — manual |
| N6 | Back/forward history | per-leaf history serialize | `app.pretty.js` 89991–89999 | P1 | partial — session only, not persisted |
| N7 | Recent files | `lastOpenFiles` | `app.pretty.js` 167587–167640 | P1 | implemented — tested (`settings.test.ts`) |
| N8 | Outline panel | outline view from headings | ui-strings (`outline` 8) | P1 | implemented — manual |
| N9 | Backlinks + unlinked mentions | `resolvedLinks`/`unresolvedLinks` | `app.pretty.js` 95906, 95942 | P0 | partial — backlinks, unresolved outgoing, tags; no unlinked mentions; tested (`links.test.ts`, `vault-service.test.ts`) |
| N10 | Bookmarks | `bookmarks:open` | command inventory | P1 | out |
| N11 | Daily notes | `daily-notes:goto-prev/next` | command inventory | P1 | partial — fixed `Daily/YYYY-MM-DD.md` |
| N12 | Global/local graph | PixiJS graph + graph worker | `app.pretty.js` 138604 | P1 | partial — Canvas 2D, local/global modes |
| N13 | Workspace persistence | `workspace.json` | `app.pretty.js` 169653–169695 | P0 | partial — own `clone` schema; foreign keys preserved, not imported; tested (`settings.test.ts`) |
| N14 | Right-click context menus | file menu, tab menu, link and editor menus | `app.pretty.js` 86832–87004, 70350–70710, 88340–88409, 171035+ | P1 | partial — file/tab/note/link/editor menus with keyboard navigation; no plugin items; tested (smoke §3.0) |

## 4. Search and metadata

| # | Feature | Observed | Evidence | Priority | Clone status |
| --- | --- | --- | --- | --- | --- |
| S1 | Full-text vault search | global search view | ui-strings (`global-search` 15) | P0 | implemented — tested (`search.test.ts`) |
| S2 | Match highlighting | `obsidian-search-match-highlight` | ui-strings | P0 | implemented — tested (`search.test.ts`) |
| S3 | Case-sensitive / regex options | search UI toggles | inferred from search view | P1 | implemented — case, whole-word, regex; tested (`search.test.ts`) |
| S4 | Metadata cache (headings/links/tags) | worker + IndexedDB | `app.pretty.js` 100982, 101334 | P1 | partial — in-memory subset, rebuilt per session |
| S5 | Link resolution shortest path | `newLinkFormat:"shortest"` | `app.pretty.js` 81105 | P0 | implemented — tested (`links.test.ts`) |
| S6 | Unresolved link tracking | `unresolvedLinks` | `app.pretty.js` 100999 | P1 | implemented — tested (`links.test.ts`) |

## 5. Appearance and settings

| # | Feature | Observed | Evidence | Priority | Clone status |
| --- | --- | --- | --- | --- | --- |
| A1 | Light/dark/system theme | `.theme-light` / `.theme-dark`, `theme:set` | `app.css` 2981/3031 | P0 | implemented — manual |
| A2 | Accent colour | `--accent-h/s/l`, `accentColor` | `app.css` 2940 | P1 | implemented — manual |
| A3 | Base font size | appearance settings | `app.pretty.js` appearance keys | P1 | implemented — tested (`settings.test.ts`) |
| A4 | Readable line length | default true | `app.pretty.js` 81076 | P1 | implemented — manual |
| A5 | Show inline title | default true | `app.pretty.js` 81080 | P1 | implemented — manual |
| A6 | Settings modal | settings views/panes | ui-strings | P0 | implemented — manual |
| A7 | Hotkey customisation | `hotkeys.json` | config mapping 217135+ | Out | out (reference list only) |
| A8 | CSS snippets / themes / plugins | `snippets/`, `themes/`, `plugins/` | config mapping 217135+ | Out | out (security/scope) |

## 6. Platform / integration

| # | Feature | Observed | Evidence | Priority | Clone status |
| --- | --- | --- | --- | --- | --- |
| P1 | External links open in browser | `open-url`, `request-url` | `main-ipc-surface.txt` 6419/6379 | P0 | implemented — protocol allowlist; tested (`security.test.ts`, `ipc.test.ts`) |
| P2 | Native menu | `set-menu`, `render-menu` | `main-ipc-surface.txt` 6450/6464 | P1 | implemented — manual |
| P3 | Window state persistence | `userData/<vaultId>.json` | `main.pretty.js` geometry functions | P1 | implemented — tested (`security.test.ts`) |
| P4 | Auto-update | signed ASAR fetch | `app/main.js` | Out | out |
| P5 | Sync / Publish | server products | — | Out | out |
| P6 | Canvas / Bases / PDF viewer | bundled subsystems | `app.js`, `lib/pdfjs` | Out | out |
| P7 | Community plugins/themes | runtime plugin API | `plugins/` mapping | Out | out |
| P8 | Telemetry id | `userData/id` | `app/main.js` | Out | out (no telemetry) |

## 7. Security and data-integrity improvements (clone-only)

| # | Property | Original | Clone | Verified by |
| --- | --- | --- | --- | --- |
| X1 | Renderer isolation | `contextIsolation:false`, `nodeIntegration:true` (`main.pretty.js` 5814–5818) | `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true` | `security.test.ts`, `preload.test.ts` |
| X2 | Write safety | direct `writeFile` (`app.pretty.js` 33254) | temp + fsync + rename + retry + cleanup | `fsops.test.ts`, `fsops-retry.test.ts` |
| X3 | Path containment | host-level API for plugins | every path validated against vault root, symlink-aware | `paths.test.ts`, `ipc.test.ts` |
| X4 | Delete safety | OS trash outside vault | vault-local `.trash` (or permanent delete) | `fsops.test.ts` |
| X5 | Remote content | `webviewTag:true`, `@electron/remote` | no webviews, no remote module, protocol allowlist | `security.test.ts`, `markdown.test.ts` |
| X6 | Update channel | remote ASAR download | no auto-update; user-installed builds | review |

## 8. Verification map

| Test suite | Covers |
| --- | --- |
| `paths.test.ts` | traversal, drive/UNC, NUL, reserved names, config/trash protection, symlink escapes, rename parent rule |
| `fsops.test.ts` | atomic write, parent creation, EOL/BOM, size cap, mtime conflicts, self-write suppression, CRUD, trash |
| `fsops-retry.test.ts` | transient rename retry, permanent-failure cleanup, non-retryable errors |
| `tree.test.ts` | folders-first natural sort, hidden paths, supported files, symlinked directories |
| `links.test.ts` | wiki/Markdown/tag/heading parsing, masking, resolution, aliases, rewriting, graph/backlinks |
| `markdown.test.ts` | GFM rendering, code, wiki links, standard Markdown links, embeds, callouts, tags, sanitisation, XSS payloads, helpers |
| `search.test.ts` | fields, ranking, case/whole-word/regex, invalid regex, snippets, incremental updates |
| `settings.test.ts` | defaults, clamping, unknown-key preservation, corrupt backups, appearance, global settings, workspace persistence |
| `security.test.ts` | renderer preferences, external URL allowlist, CSP, window factory, navigation/webview denial, window state |
| `preload.test.ts` | exact bridge surface, no Node/Electron leakage, channel routing, subscriptions |
| `ipc.test.ts` | argument validation, traversal, search limits, settings scopes, active-vault guard, external URLs, reveal |
| `vault-service.test.ts` | unique names, CRUD, link refresh, rename link integration, trash/permanent delete, recursive duplication, search |

A CDP smoke run (`scripts/smoke-ui.mjs`, `npm run smoke:ui`) covers the integrated UI flows listed
in `docs/TEST_PLAN.md` §3.0 against a copy of `sample-vault/`.
