# File layout — observed vault semantics and clone repository

## 1. Observed vault layout (original)

Evidence: `app.pretty.js` 81348 (`configDir = ".obsidian"`), 217135–217165 (config filename
mapping), 167575 (`workspace.json`), 169099–169140 (desktop vs mobile workspace file); plus
`ev_38afc11f5623a213607d0b854b0fc4609c080cdf5ae2706982e24ee46288dada`.

```
<vault root>/
├─ .obsidian/                    # per-vault configuration directory
│  ├─ app.json                   # vault-level editor/app settings
│  ├─ appearance.json            # theme, accent, fonts
│  ├─ hotkeys.json               # custom key bindings
│  ├─ core-plugins.json          # enabled built-in plugins
│  ├─ core-plugins-migration.json
│  ├─ community-plugins.json     # enabled community plugins
│  ├─ workspace.json             # desktop layout + lastOpenFiles
│  ├─ workspace-mobile.json      # mobile layout
│  ├─ types.json                 # file-type registrations
│  ├─ plugins/<id>/…             # community plugin bundles + data.json
│  ├─ themes/<name>/…            # theme.css, manifest.json
│  └─ snippets/*.css             # CSS snippets
├─ notes/…                       # user markdown (any depth)
├─ attachments/…                 # attachments (setting: attachmentFolderPath)
└─ …                             # .canvas / .base files supported by the product
```

**[Observed]** Markdown (`.md`), `.canvas` and `.base` are treated as first-class supported types
(`app.pretty.js` 217160), and the default attachment folder is the vault root (`/`),
new-note location is the vault root, and new links use the shortest-path format
(`app.pretty.js` 81073–81115). Deleting uses the OS trash by default (`trashOption:"system"`).

**[Inferred]** The vault is just a folder; configuration is scoped per folder, and the same folder
can be opened by another copy of the app because all state is inside `.obsidian` plus global
per-user registry files.

## 2. Clone repository layout (design choice)

```
Obsidian-clone/
├─ analysis/                       # evidence, tools, observed/inferred analysis
│  ├─ evidence/                    # REA JSON, summaries, IPC surface
│  ├─ tools/                       # small node helpers used for analysis
│  ├─ inventory.md
│  ├─ architecture.md
│  ├─ feature-matrix.md
│  ├─ ipc-channels.md
│  ├─ file-layout.md
│  ├─ state-shape.md
│  └─ ui-inventory.md
├─ docs/
│  ├─ FEATURE_SPEC.md              # authoritative scope + acceptance criteria
│  ├─ ARCHITECTURE.md              # clone implementation architecture
│  └─ TEST_PLAN.md                 # automated + manual test matrix
├─ src/
│  ├─ main/
│  │  ├─ index.ts                  # app lifecycle, session, protocol, IPC wiring
│  │  ├─ window.ts                 # secure BrowserWindow + window-state persistence
│  │  ├─ menu.ts                   # native application menu
│  │  ├─ ipc.ts                    # channel registration and validation
│  │  ├─ vault-asset-protocol.ts   # vaultfile:// handler for images/attachments
│  │  └─ vault/
│  │     ├─ paths.ts               # resolveInVault, traversal/symlink guards
│  │     ├─ fsops.ts               # atomic write, create, rename, trash
│  │     ├─ tree.ts                # vault tree builder
│  │     ├─ links.ts               # wikilink/markdown-link graph, rename rewrite
│  │     ├─ search.ts              # MiniSearch index
│  │     ├─ settings.ts            # merge-preserving vault/app settings
│  │     ├─ watcher.ts             # chokidar watcher + batching
│  │     └─ registry.ts            # vault list persisted in userData
│  ├─ preload/
│  │  └─ index.ts                  # contextBridge whitelist
│  ├─ shared/
│  │  ├─ types.ts                  # shared domain types
│  │  ├─ ipc.ts                    # channel names + request/response types
│  │  ├─ links.ts                  # framework-free link parser (main + renderer)
│  │  ├─ frontmatter.ts            # minimal YAML-ish frontmatter reader
│  │  └─ paths.ts                  # POSIX path helpers (no node:path in renderer)
│  └─ renderer/
│     ├─ index.html
│     ├─ main.tsx
│     ├─ App.tsx
│     ├─ state/
│     │  ├─ store.ts               # Zustand + Immer store
│     │  ├─ workspace-slice.ts
│     │  ├─ editor-slice.ts
│     │  └─ ui-slice.ts
│     ├─ components/
│     │  ├─ TitleBar.tsx
│     │  ├─ Ribbon.tsx
│     │  ├─ Sidebar.tsx
│     │  ├─ FileExplorer.tsx
│     │  ├─ SearchPanel.tsx
│     │  ├─ Tabs.tsx
│     │  ├─ Pane.tsx
│     │  ├─ EditorPane.tsx
│     │  ├─ ReadingView.tsx
│     │  ├─ OutlinePanel.tsx
│     │  ├─ BacklinksPanel.tsx
│     │  ├─ PropertiesPanel.tsx
│     │  ├─ StatusBar.tsx
│     │  ├─ CommandPalette.tsx
│     │  ├─ QuickSwitcher.tsx
│     │  ├─ SettingsModal.tsx
│     │  ├─ GraphView.tsx
│     │  └─ ContextMenu.tsx
│     ├─ editor/
│     │  ├─ CodeMirrorEditor.tsx
│     │  ├─ markdown-extensions.ts # wikilink/tag decorations, autocomplete
│     │  └─ editor-theme.ts
│     ├─ lib/
│     │  ├─ markdown.ts            # markdown-it pipeline + DOMPurify
│     │  ├─ wikilink-resolve.ts    # renderer-side link resolution helpers
│     │  ├─ fuzzy.ts               # quick-switcher scoring
│     │  ├─ force-graph.ts         # Canvas 2D force layout
│     │  └─ format.ts              # word count, dates, bytes
│     └─ styles/
│        ├─ tokens.css             # original palette + theme variables
│        ├─ app.css                # shell/sidebar/tabs/modals
│        ├─ editor.css             # CodeMirror
│        └─ preview.css            # reading view
├─ tests/
│  ├─ paths.test.ts
│  ├─ fsops.test.ts
│  ├─ links.test.ts
│  ├─ markdown.test.ts
│  ├─ search.test.ts
│  ├─ settings.test.ts
│  └─ workspace.test.ts
├─ sample-vault/                   # original demo notes (no Obsidian assets)
├─ electron.vite.config.ts
├─ electron-builder.yml
├─ vitest.config.ts
├─ tsconfig.json
├─ tsconfig.node.json
├─ tsconfig.web.json
├─ package.json
├─ README.md
└─ PARITY_REPORT.md
```

## 3. Clone vault layout (design choice)

```
<vault root>/
├─ .obsidia/
│  ├─ app.json            # clone-owned keys; unknown keys preserved on write
│  ├─ appearance.json     # { theme, accentColor, baseFontSize }
│  ├─ workspace.json      # panes, tabs, sidebar state, lastOpenFiles
│  └─ trash/              # vault-local trash (never outside the vault)
├─ notes/…
└─ attachments/…
```

- Only `.md`/`.markdown` are indexed and editable; common image formats are previewable through
  the `vaultfile://` protocol; other files are listed but shown as unsupported.
- The clone never writes `.obsidia` files that it does not own wholesale without merging:
  `app.json`, `appearance.json` and `workspace.json` are read, shallow-merged, and written
  atomically, preserving unknown keys.
- Global app preferences live in `userData/settings.json`; the vault registry lives in
  `userData/vaults.json`. Neither is inside a user vault.
- Paths exposed over IPC are vault-relative POSIX strings. Absolute paths exist only in the main
  process and in the vault info returned for display.
