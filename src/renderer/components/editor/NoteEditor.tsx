import { useEffect, useRef, useState } from 'react';
import {
  Bold,
  ClipboardPaste,
  Code,
  Code2,
  Copy,
  Highlighter,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  MessageSquare,
  Quote,
  Save,
  Scissors,
  Strikethrough,
  Table,
} from 'lucide-react';
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import {
  deleteMarkupBackward,
  insertNewlineContinueMarkup,
  markdown,
  markdownKeymap,
  markdownLanguage,
} from '@codemirror/lang-markdown';
import {
  bracketMatching,
  defaultHighlightStyle,
  foldKeymap,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
  syntaxTree,
} from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, type Range } from '@codemirror/state';
import {
  Decoration,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { tags as tagSet } from '@lezer/highlight';
import {
  buildFileIndex,
  parseTags,
  resolveWikilink,
  type FileIndex,
} from '@shared/links';
import { dirname, noteTitle, shortestLinkTarget } from '@shared/paths';
import { useStore } from '../../store/useStore';
import { registerEditorView, unregisterEditorView } from '../../lib/editorBridge';
import { applyFormat, toggleBold, toggleItalic, type FormatCommand } from '../../lib/format';
import { copyText } from '../../lib/clipboard';
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu';

interface NoteEditorProps {
  path: string;
  content: string;
  cursor?: { line: number; ch: number };
  scrollTop?: number;
  showInlineTitle: boolean;
  onChange: (content: string) => void;
}

const WIKILINK = /(!?)(\[\[)([^[\]\n]+?)(\]\])/g;
const TAG = /(?<![\w/#])#([\p{L}_][\p{L}\p{N}_/-]*)/gu;
const HEADING = /^(#{1,6})[ \t]+/;

const CODE_NODES = new Set([
  'InlineCode',
  'FencedCode',
  'CodeBlock',
  'CodeText',
  'Comment',
  'HTMLBlock',
  'HTMLTag',
]);

let indexedPaths: string[] | null = null;
let indexedFiles: FileIndex = buildFileIndex([]);

function fileIndex(paths: string[]): FileIndex {
  if (indexedPaths !== paths) {
    indexedFiles = buildFileIndex(paths);
    indexedPaths = paths;
  }
  return indexedFiles;
}

function insideCode(state: EditorState, pos: number): boolean {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1);
  while (node) {
    if (CODE_NODES.has(node.name)) return true;
    node = node.parent;
  }
  return false;
}

function wikiParts(body: string): { target: string; alias?: string; heading?: string } {
  const pipe = body.indexOf('|');
  const left = pipe === -1 ? body : body.slice(0, pipe);
  const alias = pipe === -1 ? undefined : body.slice(pipe + 1).trim() || undefined;
  const hash = left.indexOf('#');
  const target = (hash === -1 ? left : left.slice(0, hash)).trim();
  const heading = hash === -1 ? undefined : left.slice(hash + 1).trim() || undefined;
  return { target, ...(alias ? { alias } : {}), ...(heading ? { heading } : {}) };
}

/** Live-preview decorations: conceal syntax on inactive lines and mark links/tags. */
function buildDecorations(view: EditorView): DecorationSet {
  const state = useStore.getState();
  const index = fileIndex(state.tree.files);
  const ranges: Range<Decoration>[] = [];
  const activeLine = view.state.doc.lineAt(view.state.selection.main.head).number;

  for (const visible of view.visibleRanges) {
    let position = visible.from;
    while (position <= visible.to) {
      const line = stateDocLine(view, position);
      if (!line) break;
      const active = line.number === activeLine;
      const heading = HEADING.exec(line.text);
      if (heading) {
        const level = Math.min(6, heading[1]!.length);
        ranges.push(
          Decoration.line({ class: `cm-heading cm-heading-${level}` }).range(line.from),
        );
        if (!active) {
          ranges.push(Decoration.replace({}).range(line.from, line.from + heading[0].length));
        }
      }
      if (/^\s*>/.test(line.text)) {
        ranges.push(Decoration.line({ class: 'cm-quote' }).range(line.from));
      }

      if (!insideCode(view.state, line.from)) {
        WIKILINK.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = WIKILINK.exec(line.text)) !== null) {
          const start = line.from + match.index;
          const prefix = match[1] ?? '';
          const body = match[3] ?? '';
          const parts = wikiParts(body);
          const targetPath = parts.target ? resolveWikilink(parts.target, '', index) : null;
          const embed = prefix === '!';
          const pipeIndex = body.indexOf('|');
          const labelStart = start + prefix.length + 2 + (pipeIndex === -1 ? 0 : pipeIndex + 1);
          const labelEnd = start + match[0].length - 2;
          const classes = [
            'cm-wikilink',
            targetPath ? '' : 'cm-wikilink-unresolved',
            embed ? 'cm-embed' : '',
          ]
            .filter(Boolean)
            .join(' ');
          if (labelEnd > labelStart) {
            ranges.push(Decoration.mark({ class: classes }).range(labelStart, labelEnd));
          }
          if (!active) {
            const markerEnd = start + prefix.length + 2;
            ranges.push(Decoration.replace({}).range(start, markerEnd));
            if (pipeIndex !== -1) {
              ranges.push(
                Decoration.replace({}).range(markerEnd, start + prefix.length + 2 + pipeIndex + 1),
              );
            }
            ranges.push(
              Decoration.replace({}).range(start + match[0].length - 2, start + match[0].length),
            );
          }
        }

        TAG.lastIndex = 0;
        let tagMatch: RegExpExecArray | null;
        while ((tagMatch = TAG.exec(line.text)) !== null) {
          const value = (tagMatch[1] ?? '').replace(/[/-]+$/, '');
          if (!value) continue;
          const start = line.from + tagMatch.index;
          ranges.push(Decoration.mark({ class: 'cm-tag' }).range(start, start + tagMatch[0].length));
        }
      }

      if (line.to >= view.state.doc.length) break;
      position = line.to + 1;
    }
  }

  return Decoration.set(ranges, true);
}

function stateDocLine(view: EditorView, position: number) {
  try {
    return view.state.doc.lineAt(position);
  } catch {
    return null;
  }
}

const livePreviewExtension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

const editorHighlight = HighlightStyle.define([
  { tag: tagSet.heading1, class: 'cm-heading-1' },
  { tag: tagSet.heading2, class: 'cm-heading-2' },
  { tag: tagSet.heading3, fontWeight: '650' },
  { tag: tagSet.heading4, fontWeight: '650' },
  { tag: tagSet.heading5, fontWeight: '650' },
  { tag: tagSet.heading6, fontWeight: '650' },
  { tag: tagSet.strong, fontWeight: '700' },
  { tag: tagSet.emphasis, fontStyle: 'italic' },
  { tag: tagSet.strikethrough, textDecoration: 'line-through' },
  { tag: tagSet.link, color: 'var(--accent)' },
  { tag: tagSet.url, color: 'var(--text-faint)' },
  {
    tag: tagSet.monospace,
    fontFamily: 'var(--font-mono)',
    color: 'var(--color-cyan)',
  },
  { tag: tagSet.quote, class: 'cm-quote' },
  { tag: tagSet.processingInstruction, color: 'var(--text-faint)' },
  { tag: tagSet.contentSeparator, color: 'var(--text-faint)' },
  { tag: tagSet.meta, color: 'var(--text-faint)' },
]);

function collectTags(): string[] {
  const state = useStore.getState();
  const found = new Set<string>();
  for (const buffer of Object.values(state.buffers)) {
    for (const tag of parseTags(buffer.content)) found.add(tag.tag);
  }
  return [...found].sort((a, b) => a.localeCompare(b)).slice(0, 300);
}

function vaultCompletions(context: CompletionContext): CompletionResult | null {
  const link = context.matchBefore(/\[\[[^[\]\n]*$/);
  if (link) {
    const query = link.text.slice(2).trim().toLowerCase();
    const state = useStore.getState();
    const all = state.tree.files;
    const options: Completion[] = [];
    for (const path of all) {
      const title = noteTitle(path);
      const haystack = `${title} ${path}`.toLowerCase();
      if (query && !haystack.includes(query)) continue;
      const target = shortestLinkTarget(path, all);
      options.push({
        label: title,
        detail: dirname(path) || '/',
        type: 'text',
        apply: `${target}]]`,
        boost: query && title.toLowerCase().startsWith(query) ? 20 : 0,
      });
      if (options.length >= 200) break;
    }
    return { from: link.from + 2, options, validFor: /^[^[\]\n]*$/ };
  }

  const tag = context.matchBefore(/#[\p{L}\p{N}_/-]*$/u);
  if (tag) {
    const query = tag.text.slice(1).toLowerCase();
    const options = collectTags()
      .filter((value) => value.toLowerCase().includes(query))
      .slice(0, 120)
      .map((value) => ({
        label: `#${value}`,
        type: 'keyword',
        apply: `#${value} `,
      }));
    if (options.length === 0) return null;
    return { from: tag.from, options };
  }
  return null;
}

function settingsExtensions(
  settings: ReturnType<typeof useStore.getState>['settings']['vault'],
) {
  const extensions = [
    EditorState.tabSize.of(settings.tabSize),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({
      spellcheck: settings.spellcheck ? 'true' : 'false',
      autocapitalize: 'off',
      autocorrect: 'off',
    }),
    settings.showLineNumber
      ? [lineNumbers(), highlightActiveLineGutter()]
      : [highlightActiveLine()],
    keymap.of([
      { key: 'Mod-b', run: (view) => (toggleBold(view), true) },
      { key: 'Mod-i', run: (view) => (toggleItalic(view), true) },
      { key: 'Enter', run: insertNewlineContinueMarkup },
      { key: 'Backspace', run: deleteMarkupBackward },
      ...(settings.useTab ? [indentWithTab] : []),
    ]),
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    syntaxHighlighting(editorHighlight),
    history(),
    drawSelection(),
    dropCursor(),
    indentOnInput(),
    bracketMatching(),
    highlightSelectionMatches(),
    autocompletion({
      override: [vaultCompletions],
      activateOnTyping: true,
      closeOnBlur: true,
    }),
    keymap.of([
      ...closeBracketsKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...markdownKeymap,
      ...defaultKeymap,
    ]),
    settings.autoPairBrackets ? closeBrackets() : [],
    placeholder('Start writing…'),
  ];
  if (settings.livePreview) extensions.push(livePreviewExtension);
  return extensions;
}

const editorTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent' },
  '.cm-scroller': { overflow: 'auto' },
  '.cm-placeholder': { color: 'var(--text-faint)' },
});

export function NoteEditor({
  path,
  content,
  cursor,
  scrollTop,
  showInlineTitle,
  onChange,
}: NoteEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const suppressRef = useRef(false);
  const settingsCompartment = useRef(new Compartment()).current;
  const vault = useStore((state) => state.settings.vault);
  const reveal = useStore((state) => state.ui.reveal);
  const clearReveal = useStore((state) => state.clearReveal);
  const openNote = useStore((state) => state.openNote);
  const pushToast = useStore((state) => state.pushToast);
  const settingsRef = useRef(vault);
  settingsRef.current = vault;

  const initialCursor = useRef(cursor);
  const initialScroll = useRef(scrollTop ?? 0);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const copySelection = async (): Promise<void> => {
    const view = viewRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const text = view.state.sliceDoc(from, to);
    if (!text) {
      pushToast({ kind: 'info', message: 'Select some text first.' });
      return;
    }
    const copied = await copyText(text);
    pushToast(
      copied
        ? { kind: 'success', message: 'Copied to clipboard.' }
        : { kind: 'error', message: 'Clipboard access was denied.' },
    );
  };

  const cutSelection = async (): Promise<void> => {
    const view = viewRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const text = view.state.sliceDoc(from, to);
    if (!text) {
      pushToast({ kind: 'info', message: 'Select some text first.' });
      return;
    }
    const copied = await copyText(text);
    if (!copied) {
      pushToast({ kind: 'error', message: 'Clipboard access was denied.' });
      return;
    }
    view.dispatch({ changes: { from, to, insert: '' }, selection: { anchor: from } });
    view.focus();
  };

  const pasteSelection = async (): Promise<void> => {
    const view = viewRef.current;
    if (!view) return;
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      pushToast({ kind: 'error', message: 'Clipboard access was denied.' });
      return;
    }
    if (!text) return;
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
    });
    view.focus();
  };

  const selectAll = (): void => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
    view.focus();
  };

  const runFormat = (command: FormatCommand): void => {
    const view = viewRef.current;
    if (view) applyFormat(view, command);
  };

  const menuItems: ContextMenuItem[] = menu
    ? [
        {
          label: 'Cut',
          icon: <Scissors size={14} />,
          shortcut: 'Ctrl+X',
          onSelect: () => void cutSelection(),
        },
        {
          label: 'Copy',
          icon: <Copy size={14} />,
          shortcut: 'Ctrl+C',
          onSelect: () => void copySelection(),
        },
        {
          label: 'Paste',
          icon: <ClipboardPaste size={14} />,
          shortcut: 'Ctrl+V',
          onSelect: () => void pasteSelection(),
        },
        {
          label: 'Select all',
          shortcut: 'Ctrl+A',
          onSelect: selectAll,
        },
        {
          label: 'Bold',
          icon: <Bold size={14} />,
          shortcut: 'Ctrl+B',
          separatorBefore: true,
          onSelect: () => runFormat('bold'),
        },
        {
          label: 'Italic',
          icon: <Italic size={14} />,
          shortcut: 'Ctrl+I',
          onSelect: () => runFormat('italic'),
        },
        {
          label: 'Strikethrough',
          icon: <Strikethrough size={14} />,
          onSelect: () => runFormat('strikethrough'),
        },
        {
          label: 'Highlight',
          icon: <Highlighter size={14} />,
          onSelect: () => runFormat('highlight'),
        },
        {
          label: 'Inline code',
          icon: <Code size={14} />,
          onSelect: () => runFormat('inline-code'),
        },
        {
          label: 'Link',
          icon: <Link size={14} />,
          onSelect: () => runFormat('link'),
        },
        {
          label: 'Wiki link',
          onSelect: () => runFormat('wikilink'),
        },
        {
          label: 'Embed note',
          onSelect: () => runFormat('embed'),
        },
        {
          label: 'Bullet list',
          icon: <List size={14} />,
          separatorBefore: true,
          onSelect: () => runFormat('bullet-list'),
        },
        {
          label: 'Numbered list',
          icon: <ListOrdered size={14} />,
          onSelect: () => runFormat('numbered-list'),
        },
        {
          label: 'Checklist',
          icon: <ListChecks size={14} />,
          onSelect: () => runFormat('checklist'),
        },
        {
          label: 'Blockquote',
          icon: <Quote size={14} />,
          onSelect: () => runFormat('blockquote'),
        },
        {
          label: 'Table',
          icon: <Table size={14} />,
          separatorBefore: true,
          onSelect: () => runFormat('table'),
        },
        {
          label: 'Callout',
          icon: <MessageSquare size={14} />,
          onSelect: () => runFormat('callout'),
        },
        {
          label: 'Code block',
          icon: <Code2 size={14} />,
          onSelect: () => runFormat('code-block'),
        },
        {
          label: 'Footnote',
          onSelect: () => runFormat('footnote'),
        },
        {
          label: 'Save note',
          icon: <Save size={14} />,
          shortcut: 'Ctrl+S',
          separatorBefore: true,
          onSelect: () => void useStore.getState().saveNote(path),
        },
      ]
    : [];

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && !suppressRef.current) {
        onChangeRef.current(update.state.doc.toString());
      }
      if (update.selectionSet || update.docChanged) {
        const head = update.state.selection.main.head;
        const line = update.state.doc.lineAt(head);
        useStore.getState().setCursor(path, { line: line.number - 1, ch: head - line.from });
      }
    });

    const clickHandler = EditorView.domEventHandlers({
      mousedown: (event, view) => {
        if ((!event.ctrlKey && !event.metaKey) || event.button !== 0) return false;
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos === null) return false;
        const line = view.state.doc.lineAt(pos);
        const relative = pos - line.from;
        WIKILINK.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = WIKILINK.exec(line.text)) !== null) {
          if (relative < match.index || relative > match.index + match[0].length) continue;
          const parts = wikiParts(match[3] ?? '');
          if (!parts.target) return false;
          const state = useStore.getState();
          const resolved = resolveWikilink(parts.target, path, buildFileIndex(state.tree.files));
          event.preventDefault();
          if (resolved) {
            void openNote(resolved, parts.heading ? { revealHeading: parts.heading } : {});
          } else {
            pushToast({ kind: 'info', message: `No note matches “${parts.target}”.` });
          }
          return true;
        }
        return false;
      },
    });

    const state = EditorState.create({
      doc: content,
      extensions: [
        settingsCompartment.of(settingsExtensions(settingsRef.current)),
        editorTheme,
        updateListener,
        clickHandler,
      ],
    });

    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    registerEditorView(path, view);

    const start = initialCursor.current;
    if (start) {
      const lineNumber = Math.min(Math.max(1, start.line + 1), view.state.doc.lines);
      const line = view.state.doc.line(lineNumber);
      const ch = Math.min(Math.max(0, start.ch), line.length);
      view.dispatch({ selection: { anchor: line.from + ch } });
    }
    view.scrollDOM.scrollTop = initialScroll.current;

    let scrollFrame = 0;
    const onScroll = (): void => {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        useStore.getState().setScroll(path, view.scrollDOM.scrollTop);
      });
    };
    view.scrollDOM.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
      view.scrollDOM.removeEventListener('scroll', onScroll);
      unregisterEditorView(path, view);
      view.destroy();
      viewRef.current = null;
    };
    // The editor is intentionally created once per note; content and settings stream in below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: settingsCompartment.reconfigure(settingsExtensions(vault)),
    });
  }, [settingsCompartment, vault, path]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === content) return;
    const selection = view.state.selection.main;
    suppressRef.current = true;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: content },
      selection: {
        anchor: Math.min(selection.anchor, content.length),
        head: Math.min(selection.head, content.length),
      },
    });
    suppressRef.current = false;
  }, [content]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !reveal || reveal.path !== path) return;
    const doc = view.state.doc;
    let position = -1;
    if (typeof reveal.line === 'number') {
      position = doc.line(Math.min(Math.max(1, reveal.line), doc.lines)).from;
    } else if (reveal.heading) {
      const wanted = reveal.heading.trim().toLowerCase();
      for (let number = 1; number <= doc.lines; number += 1) {
        const line = doc.line(number);
        const match = HEADING.exec(line.text);
        if (!match) continue;
        const text = line.text
          .slice(match[0].length)
          .replace(/[#*_`~[\]]/g, '')
          .trim()
          .toLowerCase();
        if (text === wanted || text.includes(wanted)) {
          position = line.from;
          break;
        }
      }
    } else if (reveal.text) {
      const index = doc.toString().toLowerCase().indexOf(reveal.text.toLowerCase());
      if (index !== -1) position = index;
    }
    if (position !== -1) {
      view.dispatch({
        selection: { anchor: position },
        effects: EditorView.scrollIntoView(position, { y: 'center' }),
      });
      view.focus();
    }
    clearReveal(reveal.nonce);
  }, [reveal, path, clearReveal]);

  return (
    <>
      <div
        ref={hostRef}
        className={`editor-host${showInlineTitle ? ' with-title' : ''}${
          vault.readableLineLength ? ' readable' : ''
        }`}
        onContextMenu={(event) => {
          event.preventDefault();
          setMenu({ x: event.clientX, y: event.clientY });
        }}
      />
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
          ariaLabel="Editor actions"
        />
      )}
    </>
  );
}
