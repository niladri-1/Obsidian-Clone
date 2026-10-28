# Obsidia

A local-first, desktop Markdown notebook built with Electron, React, TypeScript, and CodeMirror 6. Open a folder as a vault, edit Markdown with wiki links/backlinks, search, and split panes — all notes stay as plain `.md` files on disk.

## Features

- **Local-first** — Notes are ordinary Markdown files; no accounts, cloud sync, or telemetry.
- **Vault-based** — Pick any folder on disk as your vault. 
- **Editor** — CodeMirror 6 source editor with live preview/reading view, YAML frontmatter, tags, and inline title.
- **Navigation** — Wiki links, backlinks, outline, graph view, quick switcher, and command palette.
- **Workspace** — Tabs, split panes, per-vault workspace persistence in `.obsidia/` (separate from Obsidian's `.obsidian/`).
- **Search** — Full-vault search with snippets.
- **Safe by default** — Sandboxed renderer, context isolation, no Node integration, vault path containment, atomic writes.

## Requirements

- [Node.js](https://nodejs.org/) 20.19+ or 22.12+ (required by Vite 7)
- npm (comes with Node.js)
- Windows/macOS/Linux supported by Electron (this repo is primarily configured for Windows packaging)

## Installation

```bash
# Clone the repo
git clone <your-repo-url>
cd obsidia

# Install dependencies
npm install
```

## Development

Run the app in development mode with hot reload:

```bash
npm run dev
```

Type-check:

```bash
npm run typecheck
```

Run tests:

```bash
npm run test
```

Run tests in watch mode:

```bash
npm run test:watch
```

## Build

Build for production (outputs to `out/`):

```bash
npm run build
```

Preview the built app:

```bash
npm run start
```

## Packaging

Create a distributable installer (Windows NSIS by default):

```bash
npm run package
```

The installer will be written to `release/`.

## Usage

1. Launch the app (`npm run dev` or the packaged app).
2. Click **Open folder as vault** or **Create new vault** on the vault picker.
3. Create/edit notes from the file explorer. Notes are saved as `.md` files in your vault.
4. Use `Ctrl+P` (Command Palette), `Ctrl+O`/quick switcher, or `Ctrl+Shift+F` (search) to navigate quickly.

## Data Locations

- **Vault settings/workspace**: `<your-vault>/.obsidia/` (`app.json`, `appearance.json`, `workspace.json`, `trash/`)
- **App settings/recents**: Electron `userData/` directory (varies by OS)
- **Nothing is uploaded** — all data stays local.

## Security Notes

- Renderer runs in a sandbox with `contextIsolation: true`, `nodeIntegration: false`.
- All file paths are validated and constrained to the vault (with symlink checks).
- Only a whitelisted preload API is exposed to the renderer.
- Legacy `.obsidian/` folders are ignored and never read/written.

## License

MIT — see [LICENSE](LICENSE) for details.
