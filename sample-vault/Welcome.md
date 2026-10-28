---
title: Welcome to Obsidia
tags:
  - welcome
  - guide
aliases:
  - Home
  - Start Here
---

# Welcome to Obsidia

This sample vault shows the core note-taking workflow: Markdown files on disk, wiki-style
links, tags, frontmatter, reading view, search, and a graph of how notes connect.

> [!tip] Start here
> Open the file explorer on the left and follow the links below. Switch between source and
> reading view with `Ctrl+E`.

## A short tour

- [[Getting Started]] — the basics of editing and saving.
- [[Ideas]] — a small project board with tasks and a table.
- [[Glossary]] — shared vocabulary for this vault.
- [[2026-10-27]] — today's daily note.
- [Ideas board](Projects/Ideas.md) — the same note linked with standard Markdown syntax.

## What this vault demonstrates

| Feature | Where to look |
| --- | --- |
| Wiki links | This page, [[Glossary]] |
| Embeds | The image below and the note embed at the bottom |
| Tags | `#welcome`, `#guide` |
| Frontmatter | The properties panel on the right |
| Tasks | [[Ideas]] |
| Code blocks | This page |

![The atlas mark](<assets/atlas-mark.svg>)

```ts
type Note = {
  path: string;
  content: string;
};

const note: Note = { path: 'Welcome.md', content: '# Hello' };
```

## Things to try

- [ ] Rename a note and turn on *Always update links* in settings.
- [ ] Search for `atlas` and open the highlighted result.
- [ ] Open the graph view from the ribbon.
- [ ] Create a note from an unresolved link such as [[Scratchpad]].

A footnote works too.[^1]

[^1]: Footnotes are rendered in reading view and remain plain Markdown in source view.

![[Getting Started#A note about saving]]

---

Back to [[Welcome|the top]].
