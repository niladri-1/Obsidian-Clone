<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:7C3AED,100:4F46E5&height=200&section=header&text=Obsidia&fontSize=72&fontColor=ffffff&fontAlignY=38&desc=Local-first%20Markdown%20notes%20%E2%80%94%20inspired%20by%20Obsidian&descSize=18&descAlignY=60" alt="Obsidia" width="100%" />

<a href="https://github.com/niladri-1/Obsidian-Clone">
  <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=20&pause=1200&color=7C3AED&center=true&vCenter=true&width=640&lines=Vault-based+Markdown+notes;Wiki+links%2C+backlinks+%26+graph+view;Zero+accounts.+Zero+cloud.+Zero+telemetry." alt="Typing animation" />
</a>

<br/>

[![License: MIT](https://img.shields.io/badge/License-MIT-22C55E?style=for-the-badge)](LICENSE)
[![Version](https://img.shields.io/badge/Version-1.0.0-7C3AED?style=for-the-badge)](package.json)
[![Platform](https://img.shields.io/badge/Platform-Windows%20x64-0078D4?style=for-the-badge&logo=windows&logoColor=white)](#-packaging)
[![Local First](https://img.shields.io/badge/Local--First-100%25-F59E0B?style=for-the-badge)](#-security--privacy)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-EC4899?style=for-the-badge)](#-contributing)

<br/>

![Electron](https://img.shields.io/badge/Electron-47848F?style=for-the-badge&logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite_7-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![CodeMirror](https://img.shields.io/badge/CodeMirror_6-D30707?style=for-the-badge&logo=codemirror&logoColor=white)
![Zustand](https://img.shields.io/badge/Zustand-443E38?style=for-the-badge&logo=react&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)

</div>

<br/>

## 📖 Table of Contents

- [✨ Features](#-features)
- [🧰 Tech Stack](#-tech-stack)
- [🚀 Getting Started](#-getting-started)
- [📜 Scripts](#-scripts)
- [⌨️ Keyboard Shortcuts](#️-keyboard-shortcuts)
- [📦 Packaging](#-packaging)
- [🗂 Project Structure](#-project-structure)
- [💾 Data & Storage](#-data--storage)
- [🔐 Security & Privacy](#-security--privacy)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)
- [👨‍💻 Author](#-author)

<br/>

## ✨ Features

<table>
  <tr>
    <td width="50%" valign="top">

### 🗂 Vault-Based Notes
Open any folder as a vault. Every note is a plain `.md` file — portable, future-proof, and fully yours.

### 📝 Powerful Editor
CodeMirror 6 source editor with Markdown formatting commands, frontmatter support, inline titles, and a polished **Reading View** with callouts, footnotes, task lists, and syntax-highlighted code.

### 🔗 Wiki Links & Backlinks
Connect ideas with `[[wiki-links]]` and instantly see every note that references the current one.

### 🕸 Graph View
Explore your knowledge base visually with a global graph and a focused local graph.

    </td>
    <td width="50%" valign="top">

### 🧭 Fast Navigation
Command Palette, Quick Switcher, Outline panel, Properties panel, daily notes, and back/forward history.

### 🪟 Flexible Workspace
Multi-tab editing, split panes, collapsible sidebars, and a layout that persists per vault.

### 🔍 Full-Vault Search
Instant fuzzy search across every note, powered by MiniSearch with highlighted context snippets.

### 🎨 Personalized Appearance
Light, dark, and system themes, custom accent colors, UI & editor fonts, font size control, and `Ctrl + Scroll` zoom.

    </td>
  </tr>
</table>

<br/>

## 🧰 Tech Stack

| Layer | Technologies |
| :-- | :-- |
| **Shell** | Electron, electron-vite, electron-builder |
| **UI** | React 19, Zustand, Immer, Lucide React, clsx |
| **Editor** | CodeMirror 6 (autocomplete, search, language-data) |
| **Markdown** | markdown-it, anchor, footnote & task-list plugins, highlight.js, DOMPurify, gray-matter |
| **Search & Files** | MiniSearch, Chokidar |
| **Tooling** | TypeScript 5.9, Vite 7, Vitest, jsdom |

<br/>

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) **v20.19+** or **v22.12+**
- npm (bundled with Node.js)
- [Git](https://git-scm.com/)

### Installation

```bash
git clone https://github.com/niladri-1/Obsidian-Clone.git
cd Obsidian-Clone
npm install
```

### Run in Development

```bash
npm run dev
```

### Build & Preview

```bash
npm run build
npm run start
```

<br/>

## 📜 Scripts

| Command | Description |
| :-- | :-- |
| `npm run dev` | Start the app with hot reload |
| `npm run build` | Typecheck and compile main, preload, and renderer to `out/` |
| `npm run start` | Preview the production build |
| `npm run typecheck` | Run TypeScript checks for node, web, and test configs |
| `npm run test` | Run the Vitest suite once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run package` | Build and create the Windows x64 installer |
| `npm run smoke:ui` | Drive the built app through UI flows over Chrome DevTools Protocol |

<br/>

## ⌨️ Keyboard Shortcuts

| Action | Shortcut |
| :-- | :-- |
| Command Palette | `Ctrl` + `P` |
| Quick Switcher | `Ctrl` + `O` |
| New Note | `Ctrl` + `N` |
| Save / Save All | `Ctrl` + `S` / `Ctrl` + `Alt` + `S` |
| Close Tab | `Ctrl` + `W` |
| Rename | `F2` |
| Search Vault | `Ctrl` + `Shift` + `F` |
| Open Vault | `Ctrl` + `Shift` + `O` |
| Toggle Reading View | `Ctrl` + `E` |
| Graph View | `Ctrl` + `G` |
| Split Pane | `Ctrl` + `\` |
| Toggle Left / Right Sidebar | `Ctrl` + `B` / `Ctrl` + `Shift` + `B` |
| Back / Forward | `Alt` + `←` / `Alt` + `→` |
| Zoom In / Out / Reset | `Ctrl` + `=` / `Ctrl` + `-` / `Ctrl` + `0` |
| Settings | `Ctrl` + `,` |

<br/>

## 📦 Packaging

```bash
npm run package
```

Produces a Windows x64 NSIS installer in `release/`. Adjust `electron-builder.yml` to target other platforms.

<br/>

## 🗂 Project Structure

```text
Obsidian-Clone/
├── scripts/
│   └── smoke-ui.mjs          # End-to-end UI smoke test
├── src/
│   ├── main/                 # Electron main process
│   │   └── vault/            # fs ops, registry, search, settings, tree, watcher
│   ├── preload/              # Whitelisted contextBridge API
│   ├── renderer/             # React application
│   │   ├── components/       # editor, overlays, panels, reading, shell, ui, workspace
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── store/            # Zustand state
│   │   └── styles/
│   └── shared/               # Types, IPC contracts, links, paths, frontmatter
├── tests/                    # Vitest suites
├── electron-builder.yml
├── electron.vite.config.ts
└── package.json
```

<br/>

## 💾 Data & Storage

| Location | Purpose |
| :-- | :-- |
| `<vault>/*.md` | Your notes — plain Markdown, fully portable |
| `<vault>/.obsidia/` | Per-vault settings, appearance, workspace layout, and local trash |
| Electron `userData/` | Global settings, recent vaults, and window state |

> [!NOTE]
> Obsidia never touches `.obsidian/` folders, so existing Obsidian vaults can be opened side by side safely.

<br/>

## 🔐 Security & Privacy

- 🛡 **Sandboxed renderer** — `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- 🔌 **Whitelisted preload API** — only explicitly exposed methods reach the renderer
- 📁 **Vault containment** — every path is validated and confined to the open vault, with symlink checks
- 💾 **Atomic writes** — protection against corruption on crashes or power loss
- 🗑 **Safe deletion** — files move to `.obsidia/trash/` instead of being erased
- 📴 **Zero telemetry** — no accounts, no cloud sync, no tracking

<br/>

## 🤝 Contributing

Contributions, issues, and feature requests are welcome.

1. Fork the repository
2. Create your branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m "feat: add your feature"`
4. Push the branch: `git push origin feature/your-feature`
5. Open a Pull Request

Please run `npm run typecheck` and `npm run test` before submitting.

<br/>

## 📄 License

Distributed under the **MIT License**. See [LICENSE](LICENSE) for details.

<br/>

## 👨‍💻 Author

<div align="center">

### Niladri Chatterjee
**Full-Stack Developer · Kolkata, West Bengal, India 🇮🇳**

[![Portfolio](https://img.shields.io/badge/Portfolio-niladri1.vercel.app-7C3AED?style=for-the-badge&logo=vercel&logoColor=white)](https://niladri1.vercel.app)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-niladri1-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://linkedin.com/in/niladri1)
[![GitHub](https://img.shields.io/badge/GitHub-niladri--1-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/niladri-1)
[![Email](https://img.shields.io/badge/Email-code.niladri@gmail.com-EA4335?style=for-the-badge&logo=gmail&logoColor=white)](mailto:code.niladri@gmail.com)

<br/>

⭐ If you like this project, consider giving it a star.

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:7C3AED,100:4F46E5&height=100&section=footer" alt="Footer" width="100%" />

</div>