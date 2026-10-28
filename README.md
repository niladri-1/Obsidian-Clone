<p align="center">
  <h1 align="center">Obsidia</h1>
  <p align="center">
    <strong>A clean, local-first Markdown note-taking app inspired by Obsidian.</strong><br/>
    Clone of Obsidian, built and reverse-engineered by <strong>REA (Reverse Engineer Anything)</strong>.
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/CodeMirror-7C3AED?style=for-the-badge&logo=codemirror&logoColor=white" alt="CodeMirror 6" />
  <img src="https://img.shields.io/badge/Zustand-000000?style=for-the-badge&logo=zustand&logoColor=white" alt="Zustand" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT License" />
</p>

---

## About This Project

**Obsidia** is a faithful, local-first clone of the [Obsidian](https://obsidian.md/) note-taking app, created by **REA (Reverse Engineer Anything)** through reverse engineering and reimplementation. 

It preserves the core Obsidian experience — vault-based Markdown notes, linking, backlinks, search, and a powerful workspace — while being built from the ground up with modern web technologies. **All your notes stay local as plain `.md` files. No accounts, no cloud sync, no telemetry.**

---

## ✨ Features

- 🗂 **Vault-Based** - Open any folder on your disk as a vault. Your notes remain in standard Markdown format.
- 📝 **Powerful Editor** - Built on CodeMirror 6 with source editing, reading view, frontmatter support, and inline titles.
- 🔗 **Wiki Links & Backlinks** - Seamlessly link notes together with `[[wiki-links]]` and explore connections.
- 🧭 **Navigation** - Command Palette (`Ctrl+P`), Quick Switcher, Graph View, Outline, and Backlinks panel.
- 🗃 **Workspace Management** - Multi-tab support, split panes, and persistent workspace layout per vault.
- 🔍 **Full-Vault Search** - Lightning-fast search across all notes with context snippets.
- 🎨 **Customizable Appearance** - Light, dark, and system themes, accent colors, custom UI/editor fonts, font size control, and Ctrl+Scroll zoom.
- 🔐 **Secure by Default** - Sandboxed renderer, context isolation, node integration disabled, vault path containment, and atomic writes.
- 🗑️ **Safe Deletion** - Vault-local trash in `.obsidia/trash/` to prevent accidental data loss.

---

## 📦 Installation

### Prerequisites

Before you begin, ensure you have the following installed:

- [Node.js](https://nodejs.org/) **v20.19+** or **v22.12+** (required for Vite 7)
- [npm](https://www.npmjs.com/) (comes bundled with Node.js)
- Git (optional, but recommended for cloning)

### Clone & Install

```bash
# Clone the repository
git clone https://github.com/your-username/obsidia.git

# Navigate to the project directory
cd obsidia

# Install all dependencies
npm install
```

---

## 🚀 How To Run

### Development Mode (With Hot Reload)

This is the best way to run the app while making changes or just testing it out:

```bash
npm run dev
```

The app will launch in a new Electron window with live reload enabled.

### Production Build

To build the app for production:

```bash
npm run build
```

This compiles both the main and renderer processes and outputs them to the `out/` directory.

### Preview Production Build

After building, you can preview the compiled app:

```bashnpm run start
```

---

## 📦 Packaging For Distribution

To create an installer for your operating system:

```bash
npm run package
```

By default, this packages a **Windows x64** installer using NSIS. The output will be found in the `release/` directory as an `.exe` installer.

> *Note: You can modify `electron-builder.yml` to package for macOS, Linux, or different architectures.*

---

## 🧪 Testing & Type Checking

```bash
# Run TypeScript type checking across all configs
npm run typecheck

# Run all tests
npm run test

# Run tests in watch mode during development
npm run test:watch
```

---

## 📖 How To Use

1. **Launch the App** - Run in dev mode or open the packaged installer.
2. **Choose a Vault** - On first launch, you'll be greeted by the Vault Picker. Click `Open folder as vault` to select an existing folder, or create a new vault.
3. **Start Writing** - Create notes from the file explorer. All notes are saved as `.md` files directly in your chosen vault.
4. **Link & Navigate** - Use `[[Note Name]]` to create wiki links, press `Ctrl+P` for the Command Palette, or `Ctrl+O` for Quick Switcher.
5. **Customize** - Go to `Settings > Appearance` to tweak fonts, zoom, themes, and more to fit your workflow.

---

## 📁 Data & Storage

| Location | Purpose |
| --- | --- |
| `<your-vault>/.obsidia/` | Per-vault settings, appearance, workspace layout, and local trash. |
| `Electron userData/` | Global app settings, recent vaults, and window state. *(Path varies by OS: `%APPDATA%\Obsidia` on Windows, `~/Library/Application Support/Obsidia` on macOS, `~/.config/Obsidia` on Linux)* |
| `<your-vault>/*.md` | **Your actual notes.** These remain untouched and fully portable. |

> **Important:** Obsidia never touches `.obsidian/` folders. Your existing Obsidian vaults are safe to use with Obsidia side by side.

---

## 🔐 Security & Privacy

- **Sandboxed Renderer** - Runs with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
- **Whitelisted Preload API** - Only explicitly allowed APIs are exposed to the renderer.
- **Vault Containment** - All file operations are strictly validated and restricted to your opened vault. Symlink checks are enforced.
- **Atomic Writes** - Files are written safely to prevent corruption on crashes or power loss.
- **Zero Telemetry** - Completely offline. No data collection, tracking, or external network requests.

---

## 🤝 Contributing

Contributions are welcome! Feel free to open issues, submit pull requests, or suggest new features. Since this is a reverse-engineered recreation, bug reports with reproduction steps are especially helpful.

---

## 📄 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for more details.

---

<p align="center">
  Made with ❤️ by <strong>REA (Reverse Engineer Anything)</strong> | Inspired by <a href="https://obsidian.md/">Obsidian</a>
</p>
