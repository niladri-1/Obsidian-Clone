# Test plan

Verification strategy for the clone. Automated tests live in `tests/` and run with Vitest.
Filesystem suites create real temporary directories under the OS temp folder and delete them
afterwards. Most suites run in Node; `tests/markdown.test.ts` opts into jsdom so DOMPurify can
sanitise rendered HTML.

The automated suite is intentionally unit/integration level. It covers the vault core, IPC
validation and the renderer's Markdown pipeline. A separate CDP smoke harness drives the built app
through the core note-taking flows (§3.0); drag/drop, native menus, CodeMirror edge cases and visual
layout remain manual checks (§3).

Last verified run (2026-10-27): `npm run test` → 12 files, 118 passed, 5 skipped.

## 1. Commands

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` for the node/electron, web and test configs |
| `npm run test` | Vitest run (watch off) |
| `npm run test:watch` | Development watch mode |
| `npm run build` | typecheck + electron-vite production build |
| `npm run smoke:ui` | CDP smoke run against the built app (build first) |
| `npm run dev` | Launch the app in development |
| `npm run start` | Launch the built app |
| `npm run package` | Build then electron-builder NSIS package (unsigned) |

## 2. Automated test matrix

Twelve suites. Each heading names the file that owns the cases; there are no hidden
`workspace.test.ts` or `rename-links.test.ts` files — workspace persistence lives in
`settings.test.ts` and rename/link integration lives in `vault-service.test.ts`.

### 2.1 Path containment and names (`tests/paths.test.ts`)

| Case | Expected |
| --- | --- |
| `notes/a.md` | resolves inside the vault |
| `notes/sub/../a.md` | normalises interior dot segments, stays inside |
| `../escape.md`, `notes/../../escape.md` | `OUTSIDE_VAULT` |
| `C:\Windows\win.ini`, `/etc/passwd`, `\\server\share\x.md`, `~/secret.md` | `OUTSIDE_VAULT` |
| empty string, NUL in a segment | `INVALID_ARGUMENT` |
| empty string with `{ allowRoot: true }` | resolves to the vault root |
| `CON`, `aux.md`, `lpt1`, `com9.txt` | `INVALID_ARGUMENT` |
| `notes/bad.`, `notes/bad ` | `INVALID_ARGUMENT` |
| `.obsidia/app.json`, `.obsidian/app.json`, `.trash/old.md` | `INVALID_ARGUMENT` for user operations |
| `.obsidia/app.json` with `{ forUser: false }` | allowed for internal config operations |
| `.obsidiax/note.md` | allowed (only the exact config folders are protected) |
| symlinked file pointing outside | `OUTSIDE_VAULT` (skipped when the host refuses symlinks) |
| symlinked directory pointing outside | `OUTSIDE_VAULT` (same skip) |
| `assertValidName` | accepts ordinary names; rejects separators, `.`, `..`, `NUL`, trailing dot/space |
| `assertDirectChild` | rename targets must stay in the same parent folder |

### 2.2 Atomic file operations (`tests/fsops.test.ts`)

- atomic write produces exact content, creates missing parent directories and leaves no `.~` temp
  residue;
- line endings normalise to the requested style (`lf` or `crlf`), and a UTF-8 BOM can be written
  and is detected on read;
- payloads above `LIMITS.maxNoteBytes` are rejected with `TOO_LARGE` before a file appears;
- POSIX files get mode `0600` (skipped on Windows);
- CRLF is normalised on read and preserved on write; new files use LF; BOM + CRLF round-trips;
- writes with an expected mtime reject an external modification with `CONFLICT` and leave the
  external content intact;
- reading a missing path returns `NOT_FOUND`; reading a directory returns `UNSUPPORTED`;
- the self-write suppression map reports a write as recent and expires after the 2 s window;
- create entry rejects duplicates with `EXISTS`; rename rejects collisions;
- `uniquePath` finds `Untitled 1.md`, then `Untitled 2.md`;
- local delete moves the file into `<vault>/.obsidia/trash/` with its original name; permanent
  delete removes it;
- listing does not descend into a symlinked directory (skipped when symlinks are unavailable).

### 2.3 Retry and cleanup (`tests/fsops-retry.test.ts`)

Mocks `rename` failures to exercise `atomicWriteAbsolute`:

- two transient `EBUSY` failures are retried and the third rename succeeds; the target is replaced
  and no temp file remains;
- persistent failure stops after five attempts with `IO_ERROR`, cleans the temp file and leaves
  the original content untouched;
- a non-transient `ENOENT` is not retried (one rename call) and also cleans up.

### 2.4 Tree construction (`tests/tree.test.ts`)

- folders sort before files, then natural numeric order (`Note 2.md` before `Note 10.md`);
- `.obsidia`, a legacy `.obsidian`, `.trash`, `.git`, `node_modules`, dotfiles and unsupported
  extensions are hidden;
- `files` contains supported attachments while `collectMarkdownFiles` contains only Markdown;
- `findNode` resolves folders, files, the root and misses;
- a symlinked directory is not traversed (skipped when the host refuses symlinks).

### 2.5 Links, tags and backlinks (`tests/links.test.ts`)

- parses `[[a]]`, `[[a|Alias]]`, `[[a#H]]`, `![[img.png]]`, `[[a#H|Alias]]` with exact source
  offsets;
- ignores wikilinks in frontmatter, inline code, fenced code and escaped brackets;
- parses inline, image, angle-bracket and titled Markdown links, plus escaped brackets;
- parses `#tag`, `#nested/a/b`, `#a-b`; skips headings, escaped hashes, mid-word hashes and code;
- deduplicates body tags case-insensitively;
- parses ATX and setext headings with line numbers; masks code without shifting offsets;
- resolves exact, case-insensitive, vault-absolute, basename and suffix targets; ambiguity
  prefers the shortest path; frontmatter aliases resolve; unresolved returns `null`;
- resolves relative Markdown targets from the source note; external URLs and `#heading` targets
  behave as documented;
- `shortestLinkTarget` shortens only unique basenames and `relativeLinkPath` emits `../` paths;
- `rewriteLinks` changes only links resolving to the renamed target, preserves aliases/headings and
  external links, supports Markdown output, and returns the input unchanged when nothing matches;
- graph building produces nodes, resolved edges and unresolved targets; backlinks and outgoing
  unresolved helpers agree with the graph.

### 2.6 Markdown rendering and sanitising (`tests/markdown.test.ts`)

Runs under jsdom.

- headings, tables, task lists, strikethrough and footnotes render; task checkboxes carry stable
  `data-task-index` values;
- fenced code is highlighted (`hljs language-*`) and gets a copy affordance;
- resolved and unresolved wikilinks become anchors with target metadata; aliases render;
- image embeds use `vaultfile://vault/...` with encoded paths; other attachments become links;
- note transclusion renders embedded bodies once and links back to the source; missing embeds are
  reported by `collectNoteEmbeds`;
- tags become anchors; callouts preserve title and body; external images are visibly blocked;
- ordinary raw HTML on the allowlist survives;
- the sanitiser removes `<script>`, event handlers (`onerror`, `onload`, `onclick`), `<iframe>`,
  `<svg>`, `javascript:` links and `data:text/html` links, both directly and through rendered
  Markdown;
- external links get `target="_blank"` and `rel="noreferrer noopener"`;
- helper checks cover wikilink-body parsing, heading slugification and unresolved-target listing.

### 2.7 Search (`tests/search.test.ts`)

- indexes title, body, headings, frontmatter tags and aliases;
- title matches rank above body-only matches;
- case-sensitive scanning distinguishes `ALPHA` from `alpha`;
- regular expressions work; an invalid expression returns `{ results: [], error }` instead of
  throwing;
- whole-word matching excludes `alphabet`;
- snippet offsets select the matched text and snippets never contain raw `<script`;
- result limits clamp (max 200) and blank queries return nothing;
- incremental `update`/`remove` changes counts and paths correctly.

### 2.8 Settings and workspace persistence (`tests/settings.test.ts`)

Vault settings:

- missing config returns defaults and creates `<vault>/.obsidia`;
- invalid `tabSize` clamps to 8, invalid `theme` falls back to `source`; unknown keys survive
  writes; updates merge with existing values;
- corrupt JSON is renamed to `app.json.corrupt-<timestamp>` and defaults are returned;
- appearance rejects non-hex accents and clamps font size to 10–32, normalising hex to lowercase.

Global settings:

- defaults, zoom clamping to `[0.5, 2]`, and preservation of unknown top-level keys across
  updates.

Workspace:

- `PersistedWorkspaceV1` round-trips panes, active pane, split direction, sidebar flags/widths,
  active views, recent files, expanded folders and per-note view modes;
- foreign `main` trees and unknown root keys survive a write; `clone` holds the app workspace and
  `lastOpenFiles` mirrors recent files;
- messy input is clamped: 4 panes, 100 tabs per pane, valid `activePaneId`, vertical split,
  widths 160–520, valid views, 40 unique recent files, only `source`/`reading` view modes;
- missing, foreign-version and corrupt workspace files return `null`, with corrupt JSON backed
  up;
- no `.~` temp files remain after a workspace write.

### 2.9 Window and protocol security (`tests/security.test.ts`)

- `SECURE_RENDERER_PREFERENCES` asserts `contextIsolation: true`, `nodeIntegration: false`,
  sandboxing on, `webviewTag: false`, `webSecurity: true`, no insecure content, experimental
  features off and no navigation on drag/drop; the preload path is the only addition;
- external protocols are exactly `http:`, `https:` and `mailto:`; `file:`, `javascript:`,
  `data:`, `vbscript:`, protocol-relative, relative and overlong URLs are rejected;
- the production CSP contains `default-src 'self'`, `script-src 'self'`, `object-src 'none'` and
  `frame-src 'none'`, with no `unsafe-eval` and no inline-script allowance;
- the window factory applies secure preferences and bounds, shows once, maximises only when
  requested, denies all new windows while opening allowlisted URLs externally, blocks navigation
  away from the app and blocks webview attachment;
- `WindowStateStore` persists geometry per vault, clamps bad sizes to 640×420, and defaults to
  1280×800 when the state file is corrupt.

### 2.10 IPC validation and orchestration (`tests/ipc.test.ts`)

Uses mocked Electron IPC and a real temporary vault.

- `file:read` serves content; non-string and overlong paths return `INVALID_ARGUMENT`;
- `file:write` rejects non-string content, oversized content (`TOO_LARGE`) and a non-number mtime
  without touching the file;
- `file:create` rejects traversal; `file:duplicate` rejects traversal and non-string paths, and
  allocates free sibling names; `search:query` rejects overlong queries; `settings:set` rejects
  unknown scopes; malformed rename and workspace payloads are rejected;
- `vault:remove` refuses the active vault but succeeds for an unknown id;
- `shell:open-external` rejects `file:` and `javascript:` and normalises an allowed URL before
  opening it;
- `settings:get` returns a bundle and `settings:set` persists vault and app patches;
- `vault:tree`, `links:graph`, `workspace:load` and `file:watch` work through the current vault;
- `shell:reveal` opens the vault root, reveals a file, and rejects escapes.

### 2.11 Preload surface (`tests/preload.test.ts`)

Mocks `contextBridge`/`ipcRenderer` and imports the real preload module.

- exposes exactly the documented 29 keys under `window.vaultApi` (asserted as a sorted key list);
- exposes no `require`, `process`, `ipcRenderer`, `shell`, `fs` or `path`;
- routes calls over `file:read`, `file:write`, `file:duplicate`, `settings:set` and
  `shell:open-external`, and sends `app:quit-ready` over `send`;
- subscriptions register on `file:changed` and unsubscribe with the same listener.

### 2.12 Vault service integration (`tests/vault-service.test.ts`)

Real temporary vaults, watcher disabled in assertions except through service effects.

- unique Untitled naming (`.md`, then ` 1.md`), note/folder creation, duplicate `EXISTS` and
  traversal rejection;
- Markdown writes refresh the link graph and return it; non-Markdown read/write is `UNSUPPORTED`;
  escaped paths are `OUTSIDE_VAULT`;
- file and folder rename keep the tree in sync, collisions return `EXISTS`, and cross-folder
  renames return `INVALID_ARGUMENT`;
- delete honours `trashOption`: local moves into `.obsidia/trash`, permanent removes;
- duplication allocates free sibling names (`a 1.md`, `a 2.md`), copies note content, copies
  folders recursively (including attachments), rejects traversal, and refreshes the tree;
- search finds current contents;
- rename link integration: with `updateLinks: true`, wikilinks (including heading/alias forms) and
  Markdown links to the moved note are rewritten, unrelated and external links untouched,
  `linksUpdated` is 3, the link graph points at the new path, and no temp files remain;
- with `updateLinks: false` referring notes stay byte-identical.

## 3. Manual QA checklist

### 3.0 Automated built-app smoke run

Run `npm run build` and then `npm run smoke:ui`. The harness copies `sample-vault/` to a temporary
vault, starts Electron with an isolated profile (and a seeded vault registry), drives the app over
the Chrome DevTools Protocol, writes screenshots plus `report.json` to a temp directory, and exits
non-zero on failure. It needs Node's built-in `WebSocket` global (Node 22+). Last run (2026-10-27):
**21/21 passed**, zero renderer errors.

1. Boot, shell, tree rows, one pane, 29-key preload surface.
2. Open `Welcome.md` in the source editor; title and saved state.
3. Outline lists headings.
4. File explorer context menu copies `Welcome.md` to `Welcome 1.md`, verifies content, then trashes
   the copy through the same menu.
5. Reading view renders callout, vault-protocol image, footnote, tasks, code and table.
6. Reading-view link context menu offers open-in-new-tab, open-to-the-right, copy path and reveal.
7. Clicking a reading-view task checkbox updates and saves the source.
8. Standard Markdown link (`[Ideas board](Projects/Ideas.md)`) opens its target.
9. Backlinks, unresolved link (`Scratchpad`) and tags.
10. Search for `atlas` and open the match.
11. Command palette → quick switcher opens `Projects/Ideas.md`.
12. Tab context menu → Split right creates a second pane with the note; closing the pane restores
    one pane.
13. Graph overlay global/local modes.
14. Dark theme applies and persists.
15. Split pane toggles on and off.
16. Create, rename and autosave a new note.
17. Editor context menu lists clipboard/formatting/save actions; ArrowDown/End move focus and Escape
    closes it.
18. Unsaved-close prompt saves and closes.
19. Delete moves the note into `.obsidia/trash/`.
20. Workspace and appearance restore after reload.
21. No renderer errors during the run.

### 3.1 First run

- [ ] Launch with no registry: vault picker is shown; "Create vault" creates the folder and
  `.obsidia`.
- [ ] Open `sample-vault`; tree appears; theme follows the OS.
- [ ] Relaunch: last vault reopens with the same tabs and active note.

### 3.2 Editing

- [ ] Edit, wait 1.5 s → saved; status bar shows saved state; disk content matches.
- [ ] `Ctrl+S` saves immediately; dirty indicator clears.
- [ ] Toggle reading view (`Ctrl+E`) and back; cursor is preserved.
- [ ] Undo/redo works across a save within the session.
- [ ] External edit while clean reloads; while dirty shows the conflict banner; Reload and Keep
  Mine both behave.
- [ ] Closing a dirty tab offers Save / Discard / Cancel; Cancel keeps the tab.
- [ ] Right-click editor text: cut/copy/paste/select all, inline formatting and save work; arrow
  keys, Home/End and Escape behave as a desktop menu.

### 3.3 Files

- [ ] Create a note in the root and inside a folder; names are unique.
- [ ] Rename a note with `alwaysUpdateLinks` on: links still navigate.
- [ ] Rename a folder: descendants and links update.
- [ ] Delete: confirmation appears; local mode moves the file to `.obsidia/trash/`; permanent
  mode removes it.
- [ ] Drag a file into the vault externally → it appears in the tree within ~1 s.
- [ ] Right-click a file and folder: open/new/rename/make-copy/copy-path/reveal/trash actions run
  against the correct target; copying a folder includes attachments; copied names are unique.

### 3.4 Links and panels

- [ ] Click a wikilink → opens the note; an unresolved link offers Create.
- [ ] Click a standard Markdown link to another note → opens the note; attachment links reveal
  the file; external links open in the browser.
- [ ] Backlinks match `sample-vault`; context snippets are correct.
- [ ] Outline updates while typing headings; clicking scrolls the note.
- [ ] Properties panel edits frontmatter and preserves other YAML.
- [ ] Clicking a tag opens search for that tag.
- [ ] Right-click a note link, attachment, external URL and tag: each menu offers the matching
  open/copy/reveal actions; Escape returns focus to the page.

### 3.5 Search / palette / graph

- [ ] Search finds body text and highlights terms; regex/case/whole-word toggles behave.
- [ ] Quick switcher fuzzy-matches; Enter opens; recent files appear first.
- [ ] Command palette executes each listed command without error.
- [ ] Graph shows expected edges; clicking a node opens it; local graph filters to neighbours.
- [ ] Daily note creates/opens `Daily/YYYY-MM-DD.md`.

### 3.6 Workspace

- [ ] Split, move tabs, close panes; relaunch restores the layout.
- [ ] Sidebar widths, visibility, expanded folders and per-note reading modes persist.
- [ ] Tab context menu closes others/after/all, splits right/down and copies paths; dirty tabs are
  not discarded without prompting.
- [ ] Window size/maximised restore per vault.
- [ ] Native menu commands work; `Ctrl+Alt+B` toggles the sidebar while `Ctrl+B` is bold in the
  editor.

### 3.7 Security / robustness

- [ ] Call the preload API from devtools with `../escape.md` → rejected.
- [ ] Open a note containing an XSS payload → no script execution in reading view.
- [ ] Corrupt `.obsidia/workspace.json` → app opens, backup created, no crash.
- [ ] Delete the vault folder while open → recoverable error, no crash loop.
- [ ] A note above the 5 MB limit is refused with a clear message.
- [ ] An external `file:`, `javascript:` or `data:` link does not open.

## 4. Performance checks

Not automated; record hardware and vault size with any result.

| Scenario | Target | Method |
| --- | --- | --- |
| 1,000-note vault cold open | < 2.5 s to interactive | stopwatch + console timing |
| Open 50 KB note | < 100 ms | devtools performance |
| Search 10,000 notes, first page | < 150 ms | search `tookMs` |
| Typing in a 5,000-line note | no frame drops | React/CodeMirror profiling |
| Tree with 10,000 files | smooth scrolling | flatten + memo inspection |

## 5. Acceptance traceability

| Spec criterion | Automated coverage | Manual |
| --- | --- | --- |
| 1 build/typecheck/test | `npm run build` (runs typecheck) + all 12 suites | — |
| 2 open/edit/save atomically | `fsops.test.ts`, `fsops-retry.test.ts`, `vault-service.test.ts` | 3.2 |
| 3 create/rename/delete | `tree.test.ts`, `fsops.test.ts`, `vault-service.test.ts` (rename + link rewrite) | 3.3 |
| 4 restore layout/state | `settings.test.ts` workspace cases | 3.6 |
| 5 external changes/conflict | `fsops.test.ts` mtime conflict; watcher behaviour is manual | 3.2 |
| 6 links/backlinks/graph/search/outline | `links.test.ts`, `search.test.ts`, `markdown.test.ts`, `vault-service.test.ts` | 3.4/3.5 |
| 7 render + sanitise | `markdown.test.ts` XSS and allowlist cases | 3.7 |
| 8 traversal rejection | `paths.test.ts`, `ipc.test.ts`, `vault-service.test.ts` | 3.7 |
| 9 renderer security options | `security.test.ts` preference/CSP/window cases, `preload.test.ts` | — |
| 10 parity report | review of `analysis/feature-matrix.md` + `PARITY_REPORT.md` | — |

## 6. Known test limitations

- No Playwright/Spectron runner is included; `scripts/smoke-ui.mjs` is a CDP harness for the built
  app and covers the core flows listed in 3.0. Window creation and navigation guards are unit-tested
  through a mocked Electron module; drag/drop, native menus and some rendering still need manual QA.
- Symlink cases skip themselves when the host refuses symlink creation (non-admin Windows
  without developer mode); the skip message is printed.
- POSIX permission mode and POSIX-specific path cases are skipped on Windows.
- The watcher is not driven by real filesystem events in the suite; batching, ignore rules and
  self-write suppression are covered indirectly. External-edit UX is manual.
- Visual regressions are not snapshot-tested; the design is original and still evolving.
- Vault scale beyond 10,000 notes is not benchmarked in this environment.
