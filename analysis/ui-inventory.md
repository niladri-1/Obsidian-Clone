# UI inventory — observed surfaces and clone mapping

Evidence for UI strings/classes: `analysis/evidence/ui-strings.txt` (frequency scan of
`app.pretty.js`) and `app.pretty.js` class registrations; visual structure from
`_extracted/obsidian/app-main/app.css` (observed only — values are **not** copied).

## 1. Observed shell layout

**[Observed]** The workspace is a tree of splits and leaves, with these persistent regions:

```
┌─────────────────────────────────────────────────────────────────────┐
│ title bar / window chrome                                           │
├──────┬───────────────────────┬──────────────────────┬───────────────┤
│ left │ left sidebar          │ main split (leaves)  │ right sidebar │
│ ribb │ (file explorer,       │  tab header          │ (outline,     │
│ on   │  search, bookmarks…)  │  editor / preview    │  backlinks,   │
│      │                       │  status bar          │  properties)  │
└──────┴───────────────────────┴──────────────────────┴───────────────┘
```

Observed CSS/class tokens (frequency in `app.pretty.js`):

| Token | Count | Region |
| --- | ---: | --- |
| `view` | 43 | generic view base |
| `tab` | 29 | tab headers |
| `preview` | 29 | reading/preview mode |
| `global-search` | 15 | search view |
| `properties` | 12 | properties panel |
| `file-explorer` | 11 | file tree |
| `file-explorer-context-menu` | 9 | tree context menu |
| `live-preview` | 9 | editor live preview |
| `pane` | 8 | split pane |
| `outline` | 8 | outline view |
| `backlinks` | 4 | backlinks view |
| `tab-header` | 5 | tab strip |
| `sidebar-toggle-button-icon` | 4 | ribbon toggles |
| `status-bar-item-segment` | 3 | status bar |
| `search-result-container` | 5 | search results |
| `obsidian-search-match-highlight` | 5 | search hit highlight |

## 2. Observed commands (ids)

Recovered from `addCommand` registrations and command strings (`app.pretty.js` 113177+,
plus string scan). Command ids are part of the plugin API surface:

| Area | Command ids |
| --- | --- |
| Workspace | `workspace:new-tab`, `workspace:close`, `workspace:split-vertical`, `workspace:split-horizontal`, `workspace:next-tab`, `workspace:previous-tab` |
| Navigation | `switcher:open`, `command-palette:open`, `app:go-back`, `app:go-forward`, `app:open-settings`, `app:open-vault`, `app:toggle-left-sidebar`, `app:toggle-right-sidebar` |
| Files | `file-explorer:new-file`, `file-explorer:new-folder`, `file-explorer:reveal-active-file` |
| Views | `markdown:toggle-preview`, `editor:toggle-source`, `search:open`, `backlink:open`, `graph:open`, `graph:open-local`, `outline:open`, `bookmarks:open`, `properties:open` |
| Editor | `editor:insert-wikilink`, `editor:insert-embed`, `editor:insert-link`, `editor:insert-tag`, `editor:insert-callout`, `editor:insert-codeblock`, `editor:insert-mathblock`, `editor:insert-table`, `editor:insert-footnote`, `editor:attach-file`, `editor:toggle-bold`, `editor:toggle-italics`, `editor:toggle-strikethrough`, `editor:toggle-highlight`, `editor:toggle-code`, `editor:toggle-blockquote`, `editor:toggle-checklist-status`, `editor:save-file` |
| Daily notes | `daily-notes:goto-prev`, `daily-notes:goto-next` |
| Theme | `theme:set` |

**[Inferred]** Key bindings are user-configurable through `hotkeys.json`; defaults follow
platform conventions (Ctrl/Cmd+P palette, Ctrl/Cmd+O switcher, Ctrl/Cmd+E toggle reading view,
Ctrl/Cmd+W close tab, Ctrl/Cmd+Shift+F search).

## 3. Observed theme token structure

**[Observed]** `app.css` defines semantic variables in a shared block then overrides them under
`.theme-light` (line 2981) and `.theme-dark` (line 3031):

- accent triplet `--accent-h`, `--accent-s`, `--accent-l`;
- neutral ramp `--color-base-00` … `--color-base-100`;
- semantic surfaces `--background-primary`, `--background-primary-alt`,
  `--background-secondary`, `--background-modifier-hover/-border`;
- text `--text-normal`, `--text-muted`, `--text-faint`, `--text-accent`, `--text-error`;
- interaction `--interactive-normal`, `--interactive-hover`, `--interactive-accent`,
  `--interactive-accent-hover`;
- status colours `--color-red`, `--color-orange`, `--color-yellow`, `--color-green`,
  `--color-cyan`, `--color-blue`, `--color-purple`, `--color-pink`.

**[Design choice]** The clone reuses the *token names* (a public de-facto convention for
Obsidian-compatible CSS) but defines an **original palette** and original component styles.
No Obsidian CSS values, icons, fonts or theme files are copied.

## 4. Clone component inventory

| Component | Region | Behaviour |
| --- | --- | --- |
| `TitleBar` | top | Vault name, quick-switcher button, window controls area (frameless-safe), dirty indicator |
| `Ribbon` | far left | New note, search, graph, settings, toggle sidebars; tooltips with shortcuts |
| `Sidebar` | left/right | Collapsible; resizable width; remembers active view |
| `FileExplorer` | left | Tree with folders-first natural sort, expand/collapse, active highlight, context menu (new note/folder, rename, delete, copy path), inline rename |
| `SearchPanel` | left | Query input, case/regex toggles, result list with snippets and highlighted terms, click to open |
| `Tabs` | main | Per-pane tab strip, overflow, middle-click close, drag to reorder within a pane, dirty dot, split button |
| `Pane` | main | One tab group; supports vertical/horizontal split; active pane ring |
| `EditorPane` | main | CodeMirror 6 source editor, toolbar (mode toggle, backlinks, outline, more), autosave/debounced save |
| `ReadingView` | main | markdown-it + DOMPurify rendering, heading anchors, wikilink navigation, task checkboxes, code copy, image embeds |
| `OutlinePanel` | right | Live heading tree, click to scroll |
| `BacklinksPanel` | right | Linked mentions with context, unlinked mentions, create-note action for unresolved links |
| `PropertiesPanel` | right | Frontmatter key/value view; add/edit/remove keys; tags |
| `StatusBar` | bottom | Word/char count, line:col, vault name, save state, sync-free indicator |
| `CommandPalette` | overlay | Fuzzy command list, keyboard navigation |
| `QuickSwitcher` | overlay | Fuzzy file jump with recent-first boost |
| `SettingsModal` | overlay | Editor, appearance, files & links, hotkeys reference, about |
| `GraphView` | main tab | Canvas 2D force graph, zoom/pan, hover labels, click to open, local graph toggle |
| `ContextMenu` | overlay | Portal menu with keyboard dismissal and viewport clamping |
| `ConflictBanner` | main | Appears when a file changed on disk while dirty |

## 5. Interaction contract

| Action | Mouse | Keyboard |
| --- | --- | --- |
| New note | ribbon / context menu | `Ctrl+N` |
| Quick open | title bar button | `Ctrl+O` |
| Command palette | title bar button | `Ctrl+P` |
| Save | toolbar (autosave also on) | `Ctrl+S` |
| Close tab | middle click / × | `Ctrl+W` |
| Toggle reading | toolbar | `Ctrl+E` |
| Search vault | ribbon / sidebar | `Ctrl+Shift+F` |
| Toggle left sidebar | ribbon | `Ctrl+B` |
| Toggle right sidebar | ribbon | `Ctrl+Shift+B` |
| Split pane | tab menu | `Ctrl+\` |
| Back/forward | title bar | `Alt+←` / `Alt+→` |
| Graph | ribbon | `Ctrl+G` |
| Zoom | — | `Ctrl+=` / `Ctrl+-` / `Ctrl+0` |

Accessibility: all interactive elements are native buttons/inputs with `aria-label`, focus-visible
styles, roving tabindex in tree/palette, `role="tree"`/`treeitem` for the explorer, and Escape
closes overlays. Reduced-motion is respected.

## 6. Not reproduced (and why)

| Surface | Reason |
| --- | --- |
| Canvas, Bases, PDF viewer, Mermaid/MathJax | separate large subsystems outside note-taking parity |
| Community plugin/theme browser | remote code execution surface; excluded by design |
| Sync, Publish | server-backed products |
| Mobile layout | desktop target |
| Exact pixel metrics/animations | original assets and CSS are not copied |
