# Inventory — Obsidian 1.14.5 (Windows x64 installer)

Status: **static analysis only**. The installer and application were never executed for this
report. No Obsidian source code, icons, fonts, themes or trademarks are reused in the clone.

## 1. Artifact under analysis

| Property | Value |
| --- | --- |
| File | `Obsidian-1.14.5.exe` (repository root, untouched) |
| Size | 342,084,056 bytes |
| SHA-256 | `4b95aa855062fb253439c392a32b536c3f9f22ac7fad04f1a6cbf176ecbcfa2a` |
| Container | PE32 executable, NSIS-3 Unicode installer (`Type=PE`, inner `Nsis`) |
| Product version | 1.14.5 |
| Company / copyright metadata | `Obsidian` / `Copyright © Dynalist Inc.` |
| REA evidence | `ev_57a77ce03ffc7cd5a658b3e31a1ea453361b5ba9c6fc668406828c5c10ebc5e9` (PE inventory, partial full-tree JS analysis) |

## 2. Extraction method

Static only, using 7-Zip against the NSIS payload (no installer execution):

1. `7z l Obsidian-1.14.5.exe` → lists NSIS script + `$PLUGINSDIR`.
2. `7z x` extracts `$PLUGINSDIR/app-64.7z` (Electron payload archive).
3. `7z x app-64.7z` → unpacked Electron application tree.
4. `npx asar extract` on `resources/app.asar` and `resources/obsidian.asar`.

Two ASAR layers exist by design:

| Layer | Path | Role |
| --- | --- | --- |
| Bootstrap | `_extracted/obsidian/app/` | Tiny loader (`main.js`, 480 KB asar) that verifies and selects the signed application ASAR, handles auto-update, logging, telemetry id |
| Application | `_extracted/obsidian/app-main/` | Real product code: renderer bundle, main process, CSS, workers, vendored libraries, i18n |

### Hashes of extracted artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `_extracted/nsis/app-64.7z` | 120,082,347 | `a1b71679df7ff64026bc1e7585c9daa5050ee5743019104df1b71098aae8a067` |
| `_extracted/obsidian/Obsidian.exe` | 239,528,720 | `55f75ba5fd0bb63b43d323c3d82bf3717cce8ded89453183b454cadc0ec42477` |
| `_extracted/obsidian/resources/app.asar` | 480,128 | `f727888bd5346b83e8e8584b23f5dd6d6bb093fe11b28d3e413e3afe38f8b04c` |
| `_extracted/obsidian/resources/obsidian.asar` | 28,177,896 | `3a349274f789b62c5b35ad19de10311909a94e8783033569c2210a4bac491780` |
| `_extracted/obsidian/app-main/app.js` | 3,942,126 | `95b9fd3944625c3b88116878b03d655147fed8cdfe6ddf931f2064ead78ccd5b` |
| `_extracted/obsidian/app-main/main.js` | 203,702 | `5d90e3738f7db8fb8ea00d01556d71310fd557c4a3c785601274c2bb875a2cba` |
| `_extracted/obsidian/app-main/app.css` | 668,223 | `866e50ac84dd8ad2775e0047ebd3ec5bd03e5af722aff259e6c4ea3cec42d7ba` |
| `_extracted/obsidian/app-main/index.html` | 1,445 | `48b72d620f92677a3dbbc3e91786fc939bbe54d572162eedd3ee938a4f40024f` |
| `_extracted/obsidian/app-main/worker.js` | 239,777 | `a42f7927658132927e124131fdb7fc69fdb2853097c24158e0fdb245b87c34ae` |

## 3. Application tree (selected)

```
_extracted/obsidian/
├─ Obsidian.exe
├─ resources/
│  ├─ app.asar              # bootstrap loader (extracted to app/)
│  └─ obsidian.asar         # product code  (extracted to app-main/)
└─ app-main/
   ├─ index.html            # renderer document, script load order
   ├─ app.js                # 3.94 MB renderer bundle (main UI, vault, cache, views)
   ├─ main.js               # 203 KB Electron main process (vaults, windows, menus, IPC)
   ├─ app.css               # 668 KB theme + component styles
   ├─ worker.js             # "Metadata Cache Worker"
   ├─ app.json? (runtime)   # per-vault settings created at runtime
   ├─ lib/
   │  ├─ codemirror/        # vendored CodeMirror 5 (modes.min.js, vim.js, overlay.js…)
   │  ├─ pixi.min.js        # graph view renderer
   │  ├─ mermaid.min.js
   │  └─ pdfjs/
   ├─ i18n/                 # ~100 locale .txt files
   ├─ sandbox/              # starter notes for the sandbox vault
   ├─ entrance/             # starter.js, help.js, quicklook.js
   └─ app.asar.unpacked/    # native modules: btime, get-fonts
```

### Derived, line-citeable copies

The shipping bundles are minified. To make static evidence reproducible, Prettier was used to
produce UTF-8 readable copies. These are **derived copies of the analysed artifact**, kept only
for citation, never shipped or reused as source:

- `_extracted/pretty/app.pretty.js` — 230,585 lines; line numbers in analysis docs refer to this file.
- `_extracted/pretty/main.pretty.js` — formatted `app-main/main.js`.

`analysis/evidence/` also contains:

- `app-js.analysis.utf8.json` — REA CLI analysis of `app.js` (converted from the PowerShell UTF-16LE redirect),
  Evidence ID `ev_38afc11f5623a213607d0b854b0fc4609c080cdf5ae2706982e24ee46288dada`.
  Statistics: 39 relevant files, 3,942,126 text bytes, 1,123,389 AST nodes visited, 2,916 findings,
  195 modules, 0 parse failures.
- `app-js.summary.json` — condensed summary derived from the above.
- `main-ipc-surface.txt` — all 47 literal `ipcMain` channels with source lines.

## 4. Toolchain inventory

Observed in `index.html` and string analysis of `app.js`:

| Library | Evidence | Notes |
| --- | --- | --- |
| Electron | main process, `BrowserWindow`, `ipcMain` | Chromium + Node runtime |
| CodeMirror 5 (legacy) | `lib/codemirror`, `CodeMirror` strings, `modes.min.js` | Editor engine, not CM6 |
| PixiJS | `lib/pixi.min.js`, `PIXI.Graphics/Text/Container` | Graph view only |
| Mermaid | `lib/mermaid.min.js` | Diagram rendering |
| MathJax | `MathJax` strings | Math rendering |
| PDF.js | `lib/pdfjs` | PDF viewer |
| i18next | locale `.txt` files + `i18next` strings | Localisation |
| moment | date handling | Daily notes, timestamps |
| Turndown | HTML→Markdown | Paste / HTML import |
| Prism | syntax highlighting outside CM | Code blocks |
| Native addons | `btime`, `get-fonts` in `app.asar.unpacked` | Birthtime preservation, font enumeration |

**Absent** (0 hits): React, Vue, Svelte, Redux, MobX, Zustand, Lunr. The UI is a bespoke
component system with a DOM-oriented view lifecycle. Search is implemented in-house on top of the
metadata cache rather than a third-party index engine.

## 5. Evidence limitations

- `app.js` is minified and bundled; module boundaries are webpack factories, not authored files.
  REA recovered 195 modules and 2,916 findings but could not retain the full semantic graph for
  `app.js` due to the parent result budget (recorded in `normalized_result.limitations`), so
  some cross-module relations remain unknown.
- The full-tree REA analysis `ev_57a77c…` timed out at `lib/codemirror/modes.min.js` after
  retaining 2,522 nodes; only partial tree facts are cited from it.
- Behaviour is inferred from inert static syntax. No statement below implies runtime execution
  was observed, except where explicitly marked as an inference.
- Build-time constants, feature flags and server-controlled behaviour cannot be recovered fully.

## 6. Handling and safety

- `Obsidian-1.14.5.exe` is never modified; hashes above allow verification.
- Extracted material is used for analysis only and is not redistributed in the clone.
- User-facing strings in the clone are original; Obsidian UI text recovered during analysis is
  referenced for behaviour mapping, not copied.
