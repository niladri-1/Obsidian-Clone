import type { EditorView } from '@codemirror/view';

function selectedText(view: EditorView): string {
  const { from, to } = view.state.selection.main;
  return view.state.sliceDoc(from, to);
}

function replaceSelection(view: EditorView, text: string, selectFrom?: number, selectTo?: number): void {
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: {
      anchor: from + (selectFrom ?? text.length),
      head: from + (selectTo ?? text.length),
    },
  });
  view.focus();
}

export function wrapSelection(view: EditorView, before: string, after: string, placeholder: string): void {
  const selected = selectedText(view);
  const content = selected || placeholder;
  const from = view.state.selection.main.from;
  replaceSelection(view, `${before}${content}${after}`, before.length, before.length + content.length);
  if (!selected) view.dispatch({ selection: { anchor: from + before.length, head: from + before.length + content.length } });
}

function lineRange(view: EditorView): { from: number; to: number; text: string } {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  return { from: line.from, to: line.to, text: line.text };
}

function prefixLines(view: EditorView, prefix: string, toggle = true): void {
  const { from, to } = view.state.selection.ranges[0]!;
  const startLine = view.state.doc.lineAt(from);
  const endLine = view.state.doc.lineAt(to);
  const changes: Array<{ from: number; to: number; insert: string }> = [];
  for (let number = startLine.number; number <= endLine.number; number += 1) {
    const line = view.state.doc.line(number);
    const already = toggle && line.text.startsWith(prefix);
    changes.push({
      from: line.from,
      to: already ? line.from + prefix.length : line.from,
      insert: already ? '' : prefix,
    });
  }
  view.dispatch({ changes });
  view.focus();
}

export function toggleBold(view: EditorView): void {
  wrapSelection(view, '**', '**', 'bold text');
}

export function toggleItalic(view: EditorView): void {
  wrapSelection(view, '*', '*', 'italic text');
}

export function toggleStrikethrough(view: EditorView): void {
  wrapSelection(view, '~~', '~~', 'strikethrough');
}

export function toggleInlineCode(view: EditorView): void {
  wrapSelection(view, '`', '`', 'code');
}

export function toggleHighlight(view: EditorView): void {
  wrapSelection(view, '==', '==', 'highlight');
}

export function toggleBlockquote(view: EditorView): void {
  prefixLines(view, '> ');
}

export function toggleBulletList(view: EditorView): void {
  prefixLines(view, '- ');
}

export function toggleNumberedList(view: EditorView): void {
  prefixLines(view, '1. ');
}

export function toggleChecklist(view: EditorView): void {
  const { from, text } = lineRange(view);
  const task = /^(\s*(?:>\s*)*[-*+]\s+\[)([ xX])(\])/.exec(text);
  if (task) {
    const markerStart = from + task[1]!.length;
    const next = task[2]!.toLowerCase() === 'x' ? ' ' : 'x';
    view.dispatch({
      changes: { from: markerStart, to: markerStart + 1, insert: next },
    });
  } else {
    prefixLines(view, '- [ ] ', false);
  }
  view.focus();
}

export function insertCodeBlock(view: EditorView): void {
  const selected = selectedText(view);
  replaceSelection(view, `\`\`\`\n${selected}\n\`\`\`\n`);
}

export function insertTable(view: EditorView): void {
  replaceSelection(
    view,
    '| Column | Column |\n| --- | --- |\n| Cell | Cell |\n',
  );
}

export function insertCallout(view: EditorView): void {
  replaceSelection(view, '> [!note] Title\n> Body\n');
}

export function insertFootnote(view: EditorView): void {
  const selected = selectedText(view) || 'note';
  replaceSelection(view, `[^${selected}]`, 0, 0);
  const doc = view.state.doc.toString();
  const reference = `[^${selected}]: `;
  if (!doc.includes(reference)) {
    const end = view.state.doc.length;
    view.dispatch({ changes: { from: end, insert: `\n\n${reference}` } });
  }
}

export function insertMarkdownLink(view: EditorView): void {
  const selected = selectedText(view) || 'link text';
  replaceSelection(view, `[${selected}](url)`, selected.length + 3, selected.length + 6);
}

export function insertWikilink(view: EditorView): void {
  wrapSelection(view, '[[', ']]', 'note');
}

export function insertEmbed(view: EditorView): void {
  wrapSelection(view, '![[', ']]', 'note');
}

export type FormatCommand =
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'inline-code'
  | 'highlight'
  | 'blockquote'
  | 'bullet-list'
  | 'numbered-list'
  | 'checklist'
  | 'code-block'
  | 'table'
  | 'callout'
  | 'footnote'
  | 'link'
  | 'wikilink'
  | 'embed';

export function applyFormat(view: EditorView, command: FormatCommand): void {
  switch (command) {
    case 'bold':
      toggleBold(view);
      break;
    case 'italic':
      toggleItalic(view);
      break;
    case 'strikethrough':
      toggleStrikethrough(view);
      break;
    case 'inline-code':
      toggleInlineCode(view);
      break;
    case 'highlight':
      toggleHighlight(view);
      break;
    case 'blockquote':
      toggleBlockquote(view);
      break;
    case 'bullet-list':
      toggleBulletList(view);
      break;
    case 'numbered-list':
      toggleNumberedList(view);
      break;
    case 'checklist':
      toggleChecklist(view);
      break;
    case 'code-block':
      insertCodeBlock(view);
      break;
    case 'table':
      insertTable(view);
      break;
    case 'callout':
      insertCallout(view);
      break;
    case 'footnote':
      insertFootnote(view);
      break;
    case 'link':
      insertMarkdownLink(view);
      break;
    case 'wikilink':
      insertWikilink(view);
      break;
    case 'embed':
      insertEmbed(view);
      break;
    default:
      break;
  }
}
