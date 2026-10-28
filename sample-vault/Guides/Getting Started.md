---
title: Getting Started
tags:
  - guide
---

# Getting Started

Obsidia stores every note as a plain Markdown file inside the folder you choose. There is
no database and no proprietary format: if you can read the file in a text editor, you can read
it here.

## Opening and editing

1. Pick a vault folder on the welcome screen.
2. Select a note in the explorer.
3. Type in the editor. Changes save automatically after a short pause, or immediately with
   `Ctrl+S`.

The title above the editor is editable. Press `Enter` to rename the file; links that point to it
are updated when *Always update links* is enabled.

## A note about saving

Saving is atomic: the app writes a temporary file next to the note and then replaces the
original. A crash during a save should leave either the old version or the new version, never a
half-written file.

> [!note] Conflicts
> If another program changes the file while you have unsaved edits, Obsidia shows a conflict
> banner. You can keep your version or reload the file from disk.

## Reading view

`Ctrl+E` toggles between source and reading view. Reading view renders:

- headings, tables, task lists, footnotes and fenced code;
- `[[wiki links]]` and `![[embeds]]`;
- `#tags` and callouts;
- images stored inside the vault.

## Backlinks

Open the right sidebar and choose **Backlinks** to see every note that links here. The outline
panel lists the headings in the current note.

Go back to [[Welcome]], or look at [[Ideas]] next.
