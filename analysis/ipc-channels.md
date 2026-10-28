# IPC channels — observed surface and clone mapping

## 1. Observed surface (original)

Evidence: `ev_77a669f110dbc10e457fac83f9c4bd130b7fd12ceccd6221ffc763f3da9d47b3`
(`app-main/main.js`) and `analysis/evidence/main-ipc-surface.txt`.

Static scan of `main.pretty.js` finds **47 literal `ipcMain` channels** and **0** preload
`contextBridge` APIs. The original exposes Node directly to the renderer
(`contextIsolation:false`, `nodeIntegration:true`), so most renderer↔main traffic uses
`ipcRenderer.send`/`sendSync` plus `@electron/remote` rather than a typed bridge. Do **not**
copy this pattern.

| Domain | Channels (source lines in `main.pretty.js`) |
| --- | --- |
| Environment / identity | `terms` (6178), `is-quitting` (6181), `is-closing` (6184), `desktop-dir` (6188), `documents-dir` (6191), `resources` (6194), `version` (6197), `policy` (6200), `set-language` (6203), `file-url` (6208), `relaunch` (6211) |
| Update | `update` (6218), `latest-public-version` (6221), `check-update` (6224), `disable-update` (6231), `copy-asar` (6244), `disable-gpu` (6254), `insider-build` (6260), `cli` (6268) |
| Shell / integration | `frame` (6274), `adblock-lists` (6278), `adblock-frequency` (6282), `print-to-pdf` (6286) |
| Vault registry | `vault` (6297), `vault-list` (6305), `vault-remove` (6308), `vault-move` (6322), `vault-open` (6343), `vault-message` (6358) |
| Onboarding | `starter` (6367), `help` (6370), `sandbox` (6373), `context-menu` (6376), `request-url` (6379) |
| External navigation | `open-url` (6419), `open-file` (6423), `trash` (6434), `get-documents-path` (6441), `get-sandbox-vault-path` (6444), `get-default-vault-path` (6447) |
| Menus / window chrome | `set-menu` (6450), `update-menu-items` (6456), `render-menu` (6464), `set-icon` (6468), `get-icon` (6475) |
| Session | `create-browser-session` (6478), `register-cli` (6516, `ipcMain.handle`) |

Observed semantics worth preserving:

- `vault-open(path, create)` creates the directory only when `create` is true; opening an existing
  path with `create` returns `"Vault already exists"` (`main.pretty.js` 6343–6356).
- `vault-list` returns the registry object; `vault-remove` refuses while the vault window exists.
- `vault-move` returns `"EVAULTOPEN"` when the vault is open, otherwise `renameSync` result string.
- The registry is `userData/obsidian.json`; window state is `userData/<vaultId>.json`.

## 2. Clone IPC contract (design choice)

All clone calls are `ipcRenderer.invoke` through a frozen preload API. Every handler validates
`typeof` and shape, and all file paths are vault-relative. Handlers never expose absolute paths
except the current vault root (needed for "reveal in explorer", the window title and the picker's
path label).

### 2.1 Prescribed channels

| Channel | Request | Response | Notes |
| --- | --- | --- | --- |
| `vault:open` | `{ path: string, create?: boolean }` | `{ vault: VaultInfo, tree: VaultTree, settings: VaultSettings }` | Absolute path only from a native dialog or the persisted registry; `create` creates the folder and `.obsidia` |
| `vault:list` | `void` | `{ vaults: VaultInfo[], lastVaultId: string \| null }` | Registry in `userData` |
| `file:read` | `{ path: string }` | `{ path, content, mtimeMs, size }` | UTF-8 only, 5 MB cap |
| `file:write` | `{ path, content, expectedMtimeMs? }` | `{ path, mtimeMs, size, tree? }` | Atomic; optional optimistic-concurrency check |
| `file:create` | `{ path, kind: 'file'\|'folder', content? }` | `{ path, kind, tree }` | Creates parents inside vault; fails if exists |
| `file:rename` | `{ path, newPath, updateLinks?: boolean }` | `{ path, newPath, tree, linksUpdated }` | Vault-local trash not involved; link rewrite optional |
| `file:delete` | `{ path }` | `{ path, tree }` | Vault-local `.trash/` or permanent per setting |
| `file:watch` | `void` | `{ watching: true }` | Renderer subscribes to `file:changed` events |
| `search:query` | `{ query, limit?, caseSensitive?, regex? }` | `{ results: SearchResult[], total, tookMs }` | MiniSearch + literal/regex fallback |
| `settings:get` | `{ scope: 'vault'\|'app', key?: string }` | settings object | Vault settings from `.obsidia/*.json` |
| `settings:set` | `{ scope, patch: object }` | updated settings | Merge-preserving, atomic |

### 2.2 Additive channels (read-only or OS-level)

| Channel | Purpose |
| --- | --- |
| `vault:tree` | Refresh the tree after an external change |
| `vault:current` | Current vault metadata for the window |
| `vault:choose` | Native folder picker (create/open) |
| `links:graph` | `{ nodes, edges, unresolved }` for graph/backlinks |
| `file:stat` | Lightweight existence/mtime check |
| `shell:open-external` | Opens only `http:`/`https:`/`mailto:` URLs via `shell.openExternal` |
| `window:state` | Get/set maximised state and geometry (debounced) |

### 2.3 Event channels (main → renderer)

| Channel | Payload |
| --- | --- |
| `file:changed` | `{ type: 'add'\|'change'\|'unlink'\|'addDir'\|'unlinkDir', path, mtimeMs? }` |
| `vault:changed` | `{ tree, links }` after a batch of external changes |
| `settings:changed` | `{ scope, settings }` |
| `app:menu-command` | `{ command: string }` from the native menu |

### 2.4 Validation rules

- Unknown channels are not registered; the preload exposes only the functions above.
- `path` inputs: `string`, length ≤ 4096, no NUL, relative, resolved inside the active vault.
- Writes: cap 5 MB; content must be `string`; mtime must be a finite number if supplied.
- `search:query`: length ≤ 512; `limit` clamped to 1–200.
- `settings:set`: only known keys are accepted; unknown keys are ignored, and values are
  type-checked/clamped (font size 10–32, tab size 1–8, theme enum).
- `shell:open-external`: protocol allowlist, no `file:`/`javascript:`/`data:`.
