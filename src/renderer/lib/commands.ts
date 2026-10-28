import { openSearchPanel } from '@codemirror/search';
import { basename, noteTitle } from '@shared/paths';
import type { EditorView } from '@codemirror/view';
import { activePane, activePathOf, useStore } from '../store/useStore';
import { getEditorView } from './editorBridge';
import { applyFormat, type FormatCommand } from './format';

const api = window.vaultApi;

export interface Command {
  id: string;
  label: string;
  category: string;
  hotkey?: string;
  run: () => void | Promise<void>;
}

function store() {
  return useStore.getState();
}

function currentPath(): string | null {
  return activePathOf(store());
}

function withEditor(action: (view: EditorView) => void): void {
  const path = currentPath();
  const view = getEditorView(path);
  if (!view) {
    store().pushToast({
      kind: 'info',
      message: 'Switch to editing view to use formatting commands.',
    });
    return;
  }
  action(view);
}

function format(command: FormatCommand) {
  return () => withEditor((view) => applyFormat(view, command));
}

async function copyActivePath(): Promise<void> {
  const path = currentPath();
  if (!path) return;
  try {
    await navigator.clipboard.writeText(path);
    store().pushToast({ kind: 'success', message: 'Vault-relative path copied.' });
  } catch {
    store().pushToast({ kind: 'error', message: 'Clipboard access was denied.' });
  }
}

function activeBuffer() {
  const path = currentPath();
  return path ? store().buffers[path] : undefined;
}

export const commands: Command[] = [
  {
    id: 'file:new-note',
    label: 'New note',
    category: 'File',
    hotkey: 'Ctrl+N',
    run: () => store().createNote(),
  },
  {
    id: 'file:new-note-named',
    label: 'New note with name…',
    category: 'File',
    run: () => {
      const state = store();
      state.openTextPrompt({
        kind: 'new-note',
        parentDir: '',
        title: 'New note',
        label: 'Note name',
        value: '',
        confirmLabel: 'Create note',
      });
    },
  },
  {
    id: 'file:new-folder',
    label: 'New folder',
    category: 'File',
    hotkey: 'Ctrl+Shift+N',
    run: () => store().createFolder(),
  },
  {
    id: 'file:save',
    label: 'Save note',
    category: 'File',
    hotkey: 'Ctrl+S',
    run: async () => {
      const path = currentPath();
      if (path) await store().saveNote(path);
    },
  },
  {
    id: 'file:save-all',
    label: 'Save all notes',
    category: 'File',
    hotkey: 'Ctrl+Alt+S',
    run: () => store().saveAll(),
  },
  {
    id: 'file:close-tab',
    label: 'Close tab',
    category: 'File',
    hotkey: 'Ctrl+W',
    run: () => {
      const state = store();
      const pane = activePane(state);
      if (pane?.activeTab) void state.closeTab(pane.id, pane.activeTab);
    },
  },
  {
    id: 'file:rename',
    label: 'Rename current note…',
    category: 'File',
    hotkey: 'F2',
    run: () => {
      const path = currentPath();
      if (!path) return;
      store().openTextPrompt({
        kind: 'rename',
        path,
        title: 'Rename',
        label: 'New name',
        value: basename(path),
        confirmLabel: 'Rename',
      });
    },
  },
  {
    id: 'file:delete',
    label: 'Delete current note',
    category: 'File',
    run: () => {
      const path = currentPath();
      if (path) store().requestDelete(path, 'file');
    },
  },
  {
    id: 'file:copy-path',
    label: 'Copy vault-relative path',
    category: 'File',
    run: copyActivePath,
  },
  {
    id: 'file:reveal-active',
    label: 'Reveal current note in file manager',
    category: 'File',
    run: async () => {
      const path = currentPath();
      if (path) await api.reveal(path);
    },
  },
  {
    id: 'vault:open',
    label: 'Open vault…',
    category: 'Vault',
    hotkey: 'Ctrl+Shift+O',
    run: () => store().chooseAndOpenVault('open'),
  },
  {
    id: 'vault:create',
    label: 'Create vault…',
    category: 'Vault',
    run: () => store().chooseAndOpenVault('create'),
  },
  {
    id: 'vault:switch',
    label: 'Switch vault…',
    category: 'Vault',
    run: () => store().showPicker(),
  },
  {
    id: 'vault:reveal',
    label: 'Show vault folder',
    category: 'Vault',
    run: async () => {
      await api.reveal('');
    },
  },
  {
    id: 'nav:quick-open',
    label: 'Quick switcher',
    category: 'Navigate',
    hotkey: 'Ctrl+O',
    run: () => store().setQuickOpenOpen(true),
  },
  {
    id: 'nav:command-palette',
    label: 'Command palette',
    category: 'Navigate',
    hotkey: 'Ctrl+P',
    run: () => store().setPaletteOpen(true),
  },
  {
    id: 'search:focus',
    label: 'Search vault',
    category: 'Navigate',
    hotkey: 'Ctrl+Shift+F',
    run: () => store().focusSearch(),
  },
  {
    id: 'nav:daily-note',
    label: "Open today's daily note",
    category: 'Navigate',
    run: () => store().openDailyNote(),
  },
  {
    id: 'nav:back',
    label: 'Go back',
    category: 'Navigate',
    hotkey: 'Alt+Left',
    run: () => store().goBack(),
  },
  {
    id: 'nav:forward',
    label: 'Go forward',
    category: 'Navigate',
    hotkey: 'Alt+Right',
    run: () => store().goForward(),
  },
  {
    id: 'view:toggle-left',
    label: 'Toggle left sidebar',
    category: 'View',
    hotkey: 'Ctrl+B',
    run: () => store().setLeftOpen(!store().workspace.leftOpen),
  },
  {
    id: 'view:toggle-right',
    label: 'Toggle right sidebar',
    category: 'View',
    hotkey: 'Ctrl+Shift+B',
    run: () => store().setRightOpen(!store().workspace.rightOpen),
  },
  {
    id: 'view:toggle-reading',
    label: 'Toggle reading view',
    category: 'View',
    hotkey: 'Ctrl+E',
    run: () => {
      const path = currentPath();
      if (path) store().toggleReadingView(path);
    },
  },
  {
    id: 'view:split',
    label: 'Toggle split pane',
    category: 'View',
    hotkey: 'Ctrl+\\',
    run: () => store().toggleSplit(),
  },
  {
    id: 'view:graph',
    label: 'Open graph view',
    category: 'View',
    hotkey: 'Ctrl+G',
    run: () => store().setGraphOpen(true),
  },
  {
    id: 'view:graph-local',
    label: 'Toggle local graph',
    category: 'View',
    run: () => {
      store().setGraphOpen(true);
      store().setGraphLocal(!store().ui.graphLocal);
    },
  },
  {
    id: 'view:zoom-in',
    label: 'Zoom in',
    category: 'View',
    hotkey: 'Ctrl+=',
    run: () => {
      const zoom = Math.min(2, Math.round((store().settings.app.zoom + 0.1) * 10) / 10);
      void store().updateAppSettings({ zoom });
    },
  },
  {
    id: 'view:zoom-out',
    label: 'Zoom out',
    category: 'View',
    hotkey: 'Ctrl+-',
    run: () => {
      const zoom = Math.max(0.5, Math.round((store().settings.app.zoom - 0.1) * 10) / 10);
      void store().updateAppSettings({ zoom });
    },
  },
  {
    id: 'view:zoom-reset',
    label: 'Reset zoom',
    category: 'View',
    hotkey: 'Ctrl+0',
    run: () => void store().updateAppSettings({ zoom: 1 }),
  },
  {
    id: 'app:settings',
    label: 'Open settings',
    category: 'App',
    hotkey: 'Ctrl+,',
    run: () => store().setSettingsOpen(true, 'editor'),
  },
  {
    id: 'app:shortcuts',
    label: 'Keyboard shortcuts',
    category: 'App',
    run: () => store().setSettingsOpen(true, 'hotkeys'),
  },
  {
    id: 'app:about',
    label: 'About Obsidia',
    category: 'App',
    run: () => store().setSettingsOpen(true, 'about'),
  },
  {
    id: 'app:theme-cycle',
    label: 'Cycle theme',
    category: 'App',
    run: () => {
      const current = store().settings.appearance.theme;
      const next = current === 'dark' ? 'light' : current === 'light' ? 'system' : 'dark';
      void store().updateAppearance({ theme: next });
    },
  },
  {
    id: 'edit:find',
    label: 'Find in note',
    category: 'Edit',
    hotkey: 'Ctrl+F',
    run: () => withEditor((view) => openSearchPanel(view)),
  },
  {
    id: 'format:bold',
    label: 'Format: bold',
    category: 'Format',
    hotkey: 'Ctrl+B',
    run: format('bold'),
  },
  { id: 'format:italic', label: 'Format: italic', category: 'Format', run: format('italic') },
  {
    id: 'format:strikethrough',
    label: 'Format: strikethrough',
    category: 'Format',
    run: format('strikethrough'),
  },
  {
    id: 'format:inline-code',
    label: 'Format: inline code',
    category: 'Format',
    run: format('inline-code'),
  },
  {
    id: 'format:highlight',
    label: 'Format: highlight',
    category: 'Format',
    run: format('highlight'),
  },
  {
    id: 'format:blockquote',
    label: 'Format: blockquote',
    category: 'Format',
    run: format('blockquote'),
  },
  {
    id: 'format:bullet-list',
    label: 'Format: bullet list',
    category: 'Format',
    run: format('bullet-list'),
  },
  {
    id: 'format:numbered-list',
    label: 'Format: numbered list',
    category: 'Format',
    run: format('numbered-list'),
  },
  {
    id: 'format:checklist',
    label: 'Format: checklist',
    category: 'Format',
    run: format('checklist'),
  },
  {
    id: 'format:code-block',
    label: 'Insert: code block',
    category: 'Format',
    run: format('code-block'),
  },
  { id: 'format:table', label: 'Insert: table', category: 'Format', run: format('table') },
  { id: 'format:callout', label: 'Insert: callout', category: 'Format', run: format('callout') },
  { id: 'format:footnote', label: 'Insert: footnote', category: 'Format', run: format('footnote') },
  { id: 'format:link', label: 'Insert: markdown link', category: 'Format', run: format('link') },
  {
    id: 'format:wikilink',
    label: 'Insert: wikilink',
    category: 'Format',
    run: format('wikilink'),
  },
  { id: 'format:embed', label: 'Insert: embed', category: 'Format', run: format('embed') },
];

const byId = new Map(commands.map((command) => [command.id, command]));

export async function executeCommand(id: string): Promise<void> {
  if (id === 'file:rename-current') {
    // legacy alias used by older menu builds
    id = 'file:rename';
  }
  const command = byId.get(id);
  if (!command) {
    store().pushToast({ kind: 'info', message: `Unknown command: ${id}` });
    return;
  }
  try {
    await command.run();
  } catch (error) {
    store().pushToast({
      kind: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export function commandForNote(path: string | null): string {
  if (!path) return 'Open a note';
  const label = noteTitle(path);
  const buffer = activeBuffer();
  if (!buffer) return label;
  return buffer.dirty ? `${label} •` : label;
}
