# Feature specification — Local-first Markdown vault app

Status: **approved for implementation** (clean-room clone of the note-taking experience analysed
in `analysis/`). This document is the authority for scope; `docs/ARCHITECTURE.md` describes how it
is built, `docs/TEST_PLAN.md` how it is verified.

## 1. Product statement

A desktop, local-first Markdown note-taking application. The user opens a folder ("vault") of
plain `.md` files, navigates it as a tree, edits notes with wiki-style links, and reads them in a
rendered view. All data stays in the user's folder; there is no account, telemetry, sync, or
cloud dependency.

The app must feel familiar to a user of Obsidian-style tools (as analysed in
`analysis/feature-matrix.md`) without copying any Obsidian code, assets, styles, icons, fonts or
trademarks.

## 2. Goals

1. Open/create/switch local vaults and persist recent vaults.
2. Browse, create, rename, delete, and watch notes and folders.
3. Edit Markdown with a first-class editor; read it in a clean rendered view.
4. Support `[[wikilinks]]`, embeds, tags, frontmatter and backlinks.
5. Provide fast vault search, quick switcher, command palette, outline and graph.
6. Persist workspace layout and settings per vault without clobbering unknown keys.
7. Keep the renderer sandboxed and every filesystem operation inside the vault.

## 3. Non-goals

Sync, Publish, collaboration, accounts, mobile, Canvas/Bases/PDF, Mermaid/MathJax, community
plugins/themes, CSS snippets, auto-update, telemetry, vim mode. See `analysis/feature-matrix.md`
§6 for evidence and rationale.

## 4. Personas and key flows

**P1 — Writer.** Opens an existing notes folder, jumps between notes via quick switcher, writes,
links notes, reads back, closes the app and finds the same tabs next launch.

**P2 — Organiser.** Creates folders and notes, renames a note and expects links to keep working,
deletes a note and can recover it from the vault trash, notices edits made by another editor
appear live.

**P3 — Researcher.** Searches the whole vault, follows backlinks, looks at the graph, reads
frontmatter properties, and exports nothing (all local).

## 5. Functional requirements

### FR-1 Vault lifecycle

- **FR-1.1** On first launch, show a vault picker with: recent vaults, "Open folder", "Create
  vault".
- **FR-1.2** Opening a folder validates it is a readable directory and remembers it in
  `userData/vaults.json` with a stable id, path, name and last-opened timestamp.
- **FR-1.3** Creating a vault creates the directory (recursively) and its `.obsidia/` config
  folder.
- **FR-1.4** The app reopens the last vault (or shows the picker if it no longer exists).
- **FR-1.5** Switching vaults is available from the title bar; the previous vault's layout and
  settings are flushed before switching.
- **FR-1.6** The active vault is named in the title bar and in the window title; its full path is
  shown in the vault picker and Settings › About. "Reveal vault folder" opens the OS file manager
  at the vault root (allowed OS action, no write).

### FR-2 File tree and file operations

- **FR-2.1** Show a recursive tree of folders and supported files; folders first, natural
  case-insensitive sort. Hide `.obsidia`, a legacy `.obsidian`, `.trash`, and dotfiles by default.
- **FR-2.2** Expand/collapse folders; state is remembered for the session and in the persisted
  workspace.
- **FR-2.3** Create note/folder at the vault root, in the selected folder, or relative to the
  active note (setting `newFileLocation`); default names are unique (`Untitled`, `Untitled 1`, …).
- **FR-2.4** Rename files/folders with inline edit; validate names (no `<>:"/\|?*`, no reserved
  Windows names, no trailing dot/space, no collision).
- **FR-2.5** Delete with confirmation (`promptDelete`); move to `<vault>/.obsidia/trash/` with a
  timestamp prefix. `trashOption: "permanent"` deletes after confirmation.
- **FR-2.6** When renaming a note with `alwaysUpdateLinks` enabled, rewrite resolvable
  wikilinks/markdown links across the vault to the new path/name.
- **FR-2.7** Context menu on tree items: Open in new tab, Open to the right, New note, New folder,
  Rename, Make a copy, Copy path, Copy vault-relative path, Show in system explorer, Move to trash.
- **FR-2.8** All operations reject paths that escape the vault (traversal, absolute, symlink).
- **FR-2.9** External changes (other editor, sync client, terminal) appear within ~1 s without a
  manual refresh.
- **FR-2.10** Make a copy duplicates a note or folder recursively to a free sibling name; copied
  content is indexed immediately. Symlinks are skipped rather than followed.

### FR-3 Editor

- **FR-3.1** Tabs per pane. Open files from tree, search, links, quick switcher, graph.
- **FR-3.2** Dirty state indicator; save on `Ctrl+S` and debounced autosave (1.5 s after typing
  stops). Closing a dirty tab asks to Save / Discard / Cancel.
- **FR-3.3** Markdown syntax highlighting, line numbers (setting), tab size (setting), soft wrap,
  undo/redo, find in note (`Ctrl+F`).
- **FR-3.4** Wiki-link syntax highlighted and clickable (`Ctrl/Cmd+Click` or click in reading
  view); `[[` triggers an autocomplete of vault notes; unresolved links are visually distinct.
- **FR-3.5** Auto-pair `[` `(` `"` `'` and `[[` when enabled; continue lists and checkboxes on
  Enter; smart indent for lists.
- **FR-3.6** Formatting commands: bold, italic, strikethrough, inline code, highlight, blockquote,
  bullet/numbered/checklist list, code block, table, callout, footnote, link, wikilink, embed.
- **FR-3.7** Cursor line/column and word count update live.
- **FR-3.8** If a file changes on disk while the buffer is dirty, show a conflict banner with
  Reload / Keep mine; never silently overwrite external changes.
- **FR-3.9** Restore cursor/scroll per file within the session.
- **FR-3.10** Right-click the editor for cut/copy/paste/select-all, inline formatting, list and
  block commands, and save.

### FR-4 Reading view

- **FR-4.1** Toggle source/reading per tab with `Ctrl+E`; the mode is persisted.
- **FR-4.2** Render CommonMark + GFM tables, task lists, footnotes, strikethrough and autolinks.
- **FR-4.3** Sanitise all rendered HTML with DOMPurify; block scripts, event handlers, `javascript:`
  URLs and inline iframes.
- **FR-4.4** Render wikilinks, embeds (note transclusion one level; images), tags, callouts.
- **FR-4.5** Syntax-highlight fenced code with highlight.js and offer Copy.
- **FR-4.6** Heading anchors produce an outline and support `[[note#heading]]` scrolling.
- **FR-4.7** Checkboxes in reading view toggle the source task and save.
- **FR-4.8** Readable line length setting constrains measure and centres content.
- **FR-4.9** Right-click a rendered note/attachment/external/tag link for open, copy and reveal
  actions appropriate to that link type.

### FR-5 Links and properties

- **FR-5.1** Parse `[[target]]`, `[[target|alias]]`, `[[target#heading]]`, `![[…]]`, standard
  markdown links, and `#tag`.
- **FR-5.2** Resolve targets case-insensitively by vault-relative path or basename, shortest path
  first; store unresolved links.
- **FR-5.3** Backlinks panel lists notes that link to the active note with a context snippet;
  unresolved outgoing links list "Create note" actions.
- **FR-5.4** Properties panel shows YAML frontmatter, allows adding/editing/removing scalar keys
  and tags, and writes valid YAML back atomically.
- **FR-5.5** Tags are normalised (strip leading `#`, case-insensitive index) and searchable.

### FR-6 Search and navigation

- **FR-6.1** Global search (`Ctrl+Shift+F`) over note titles, headings, body and tags.
- **FR-6.2** Results show title, path, highlighted snippet and score; click opens at the match
  when possible. Empty query shows recent files.
- **FR-6.3** Options: case-sensitive, whole word, regex (regex validated; invalid regex shows an
  inline error, never throws).
- **FR-6.4** Quick switcher (`Ctrl+O`) fuzzy-matches paths/aliases, recent-first, Enter opens,
  `Ctrl+Enter` opens in a new tab.
- **FR-6.5** Command palette (`Ctrl+P`) lists all app commands with fuzzy filtering and key
  hints.
- **FR-6.6** Outline panel shows headings of the active note; click scrolls; updates live.
- **FR-6.7** Graph view shows notes as nodes and links as edges, pan/zoom, hover labels, click to
  open, and a local-graph mode for the active note.
- **FR-6.8** Back/forward navigation history per pane (`Alt+←/→`).
- **FR-6.9** Daily note command opens/creates `Daily/YYYY-MM-DD.md`.

### FR-7 Settings and appearance

- **FR-7.1** Settings modal with sections: Editor, Appearance, Files & links, Hotkeys (reference),
  About.
- **FR-7.2** Editor: readable line length, show inline title, line numbers, tab size, use tabs,
  live preview decorations, auto-pair, spellcheck.
- **FR-7.3** Appearance: theme system/light/dark, accent colour, base font size; applied live.
- **FR-7.4** Files & links: default new-note location, attachment folder, use Markdown links,
  update links on rename, delete behaviour, confirm delete.
- **FR-7.5** Settings persist per vault for vault-scoped keys and globally for theme/window state.
- **FR-7.6** Original theme: CSS variables with light/dark tokens and a configurable accent; no
  copied values or assets.
- **FR-7.7** Minimal shell chrome: slim title bar, tab strip and status bar; no decorative
  dividers or accent underlines; the status bar shows only word count (details in its tooltip),
  cursor position, backlink count when non-zero, the view toggle, save state, and zoom when it
  differs from 100%.

### FR-8 Workspace and window

- **FR-8.1** Tabs, split panes (vertical/horizontal), active pane, sidebar visibility and active
  views persist across restarts.
- **FR-8.2** Restore last open files and active note for the vault.
- **FR-8.3** Window geometry/maximised state persists per vault; minimum 640×420.
- **FR-8.4** Native menu mirrors app commands (New note, Open vault, Save, Toggle sidebar,
  Settings, About) and dispatches to the renderer.
- **FR-8.5** Unsaved buffers are saved/flushed before quit; no data loss on normal exit.
- **FR-8.6** Tab context menu: Close tab, Close other tabs, Close tabs to the right, Close all
  tabs, Split right/down, Copy path, Copy vault-relative path, Show in system explorer. Closing
  others/all keeps dirty tabs open with a notice rather than discarding edits.

### FR-9 Security and integrity

- **FR-9.1** Renderer: `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`,
  `webviewTag:false`, `webSecurity:true`; no remote module, no `eval` of remote content.
- **FR-9.2** Preload exposes only the documented API (invoke wrappers + event subscriptions) via
  `contextBridge`; no `ipcRenderer` leakage.
- **FR-9.3** Every path argument is validated in the main process: relative, normalised, inside
  the vault, no NUL, no symlink escape, no reserved device names.
- **FR-9.4** Writes are atomic (temp file in the same directory, fsync, rename with retries,
  cleanup). Partial files must never appear at the target path.
- **FR-9.5** Size limits: 5 MB per note write/read; search query ≤ 512 chars.
- **FR-9.6** External URL opening is protocol-allowlisted (`http`, `https`, `mailto`); `file:` and
  `javascript:` are rejected.
- **FR-9.7** No telemetry, no network calls at runtime except user-initiated external links.

## 6. Non-functional requirements

| ID | Requirement |
| --- | --- |
| NFR-1 | Cold start to usable editor < 2.5 s for a 1,000-note vault on a mid-range laptop |
| NFR-2 | Open note < 100 ms local; search results first page < 150 ms for 10,000 notes |
| NFR-3 | No UI jank while indexing: indexing is incremental and off the editor critical path |
| NFR-4 | Vault tree of 20,000 files renders with virtualised/flattened list (no per-node heavy DOM) |
| NFR-5 | Works at 100–200 % DPI; keyboard reachable; visible focus; respects reduced motion |
| NFR-6 | Graceful handling of unreadable files, invalid UTF-8, huge files, missing vault |
| NFR-7 | Windows 10/11 x64 primary target; code must stay cross-platform (path handling) |

## 7. UX specification

### 7.1 Layout

```
┌───────────────────────────────────────────────────────────────────┐
│ TitleBar: [vault ▾] [◀ ▶] [🔍 Quick open] [⚙]                     │
├──────┬──────────────────┬──────────────────────────┬──────────────┤
│Ribbon│ Left sidebar     │ Main area                │ Right sidebar│
│      │ Files | Search   │ Tabs                     │ Outline      │
│      │                  │ Editor / Reading         │ Backlinks    │
│      │                  │                          │ Properties   │
├──────┴──────────────────┴──────────────────────────┴──────────────┤
│ StatusBar: words · Ln, Col · backlinks · view · saved              │
└───────────────────────────────────────────────────────────────────┘
```

- Sidebars collapse to zero width with a ribbon toggle; widths are draggable and persisted.
- The empty state offers "Create a note", "Open quick switcher", and recent files.
- Loading uses skeletons, not blocking spinners; errors use toasts with a retry where meaningful.
- **Quiet chrome.** Shell bars are deliberately slim — 36 px title bar, 32 px tab strip, 22 px
  status bar — with no decorative dividers, no accent underline on the active tab, and a borderless
  search field. The status bar keeps only essentials: word count (character count and reading time
  move to its tooltip), cursor position, backlink count when non-zero, the source / reading toggle
  as an icon, save state, and zoom only when it is not 100%. The vault name lives in the title bar
  and window title instead.

### 7.2 Visual language

- Calm, high-contrast neutral surfaces; one accent hue; 6–10 px radii; 1 px borders.
- No copied Obsidian colours: the clone palette is defined in `src/renderer/styles/tokens.css`
  from a neutral ramp and a user-selectable accent.
- Typography: system UI stack for chrome, a readable serif/sans stack for notes (no bundled
  proprietary fonts).

### 7.3 Keyboard map

`Ctrl+N` new note · `Ctrl+O` quick open · `Ctrl+P` command palette · `Ctrl+S` save ·
`Ctrl+W` close tab · `Ctrl+E` toggle reading · `Ctrl+Shift+F` search · `Ctrl+B` left sidebar ·
`Ctrl+Shift+B` right sidebar · `Ctrl+\` split · `Ctrl+G` graph · `Ctrl+=/-/0` zoom ·
`Alt+←/→` history · `Escape` close overlay.

### 7.4 Empty, error and edge states

| State | Behaviour |
| --- | --- |
| No vault open | Vault picker with recents; cannot reach editor |
| Vault missing on launch | Picker + inline "folder not found" message; entry kept for removal |
| Empty vault | Empty state with create-note CTA |
| File deleted externally while open | Tab shows "File no longer exists" with Close/Recreate |
| Dirty + external change | Conflict banner (Reload / Keep mine) |
| Unsupported binary | Read-only info panel; image preview when applicable |
| Huge file (>5 MB) | Refuse to open with explanation; no editor freeze |
| Search index building | Progress hint in search panel, results stream as available |

## 8. Data formats

### 8.1 Vault settings — `<vault>/.obsidia/app.json`

```jsonc
{
  "alwaysUpdateLinks": false,
  "autoPairBrackets": true,
  "defaultViewMode": "source",
  "newFileLocation": "root",
  "newFileFolderPath": "/",
  "attachmentFolderPath": "/",
  "trashOption": "local",
  "useMarkdownLinks": false,
  "readableLineLength": true,
  "showInlineTitle": true,
  "showLineNumber": false,
  "useTab": true,
  "tabSize": 4,
  "livePreview": true,
  "spellcheck": true,
  "propertiesInDocument": "visible"
}
```

Unknown keys are preserved. Invalid values fall back to defaults on read and are repaired on
write.

### 8.2 Appearance — `<vault>/.obsidia/appearance.json`

```jsonc
{ "theme": "system", "accentColor": "", "baseFontSize": 16 }
```

### 8.3 Workspace — `<vault>/.obsidia/workspace.json`

Namespaced under `clone` (see `analysis/state-shape.md` §2.1). Unknown keys and foreign layout
trees are preserved.

### 8.4 Note format

UTF-8 Markdown with optional YAML frontmatter. Line endings are preserved on save: if the file
was CRLF, it stays CRLF; new files use the platform default (LF on POSIX, CRLF on Windows is not
required — the editor stores `\n`).

## 9. Acceptance criteria

A build is accepted when:

1. `npm run typecheck`, `npm run test`, and `npm run build` pass on a clean checkout.
2. The app opens `sample-vault/`, shows the tree, opens a note, edits and saves it, and the file
   on disk changes atomically (no `.tmp` remains).
3. Creating, renaming (with link update), and deleting a note works; deleted notes land in
   `<vault>/.obsidia/trash/`.
4. Closing and relaunching restores the tabs, active note, sidebars and theme.
5. External edits appear without restart; dirty buffers show the conflict banner.
6. Wikilinks/backlinks/graph/search/outline agree with the sample vault contents.
7. Reading view renders tables, tasks, code, callouts and embeds, and strips a hostile HTML
   payload (verified by test).
8. A path such as `..\..\Windows\System32\drivers\etc\hosts`, an absolute path, and a symlink to
   outside the vault are all rejected by IPC (unit + integration test).
9. Renderer `webPreferences` are exactly the secure set in FR-9.1 (asserted by a unit test on the
   window factory).
10. `PARITY_REPORT.md` accurately lists implemented/partial/omitted features and deviations.
