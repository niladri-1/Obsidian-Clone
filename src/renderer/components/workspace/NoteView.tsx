import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  BookOpen,
  Columns2,
  Copy,
  ExternalLink,
  FilePlus2,
  Files,
  MoreHorizontal,
  PenLine,
  RefreshCw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { basename, dirname, noteTitle } from '@shared/paths';
import { absoluteVaultPath, copyText } from '../../lib/clipboard';
import { useStore } from '../../store/useStore';
import { IconButton } from '../ui/IconButton';
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu';
import { NoteEditor } from '../editor/NoteEditor';
import { ReadingView } from '../reading/ReadingView';

interface NoteViewProps {
  paneId: string;
  path: string;
}

export function NoteView({ paneId, path }: NoteViewProps) {
  const buffer = useStore((state) => state.buffers[path]);
  const settings = useStore((state) => state.settings.vault);
  const viewMode = useStore(
    (state) => state.workspace.viewModes[path] ?? state.settings.vault.defaultViewMode,
  );
  const setContent = useStore((state) => state.setContent);
  const saveNote = useStore((state) => state.saveNote);
  const reloadNote = useStore((state) => state.reloadNote);
  const keepMine = useStore((state) => state.keepMine);
  const closeTab = useStore((state) => state.closeTab);
  const toggleReadingView = useStore((state) => state.toggleReadingView);
  const renameEntry = useStore((state) => state.renameEntry);
  const duplicateEntry = useStore((state) => state.duplicateEntry);
  const openNote = useStore((state) => state.openNote);
  const openToSide = useStore((state) => state.openToSide);
  const requestDelete = useStore((state) => state.requestDelete);
  const openTextPrompt = useStore((state) => state.openTextPrompt);
  const pushToast = useStore((state) => state.pushToast);
  const [title, setTitle] = useState(() => noteTitle(path));
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle(noteTitle(path));
  }, [path]);

  const reading = viewMode === 'reading';
  const crumbs = path.split('/');
  const folderParts = dirname(path) ? crumbs.slice(0, -1) : [];

  const commitTitle = (): void => {
    const next = title.trim();
    if (!next || next === noteTitle(path)) {
      setTitle(noteTitle(path));
      return;
    }
    void renameEntry(path, next);
  };

  const recreate = async (): Promise<void> => {
    if (!buffer) return;
    const result = await window.vaultApi.createEntry({
      path,
      kind: 'file',
      content: buffer.content,
    });
    if (!result.ok) {
      pushToast({ kind: 'error', message: result.error.message });
      return;
    }
    useStore.getState().handleVaultChanged({ tree: result.data.tree, links: result.data.links });
    await reloadNote(path);
    pushToast({ kind: 'success', message: 'Note recreated.' });
  };

  const menuItems: ContextMenuItem[] = [
    {
      label: reading ? 'Switch to editing view' : 'Switch to reading view',
      icon: reading ? <PenLine size={14} /> : <BookOpen size={14} />,
      shortcut: 'Ctrl+E',
      onSelect: () => toggleReadingView(path),
    },
    {
      label: 'Open in new tab',
      icon: <FilePlus2 size={14} />,
      onSelect: () => void openNote(path, { newTab: true }),
    },
    {
      label: 'Open to the right',
      icon: <Columns2 size={14} />,
      onSelect: () => void openToSide(path, 'vertical'),
    },
    {
      label: 'Rename note…',
      shortcut: 'F2',
      separatorBefore: true,
      onSelect: () =>
        openTextPrompt({
          kind: 'rename',
          path,
          title: 'Rename',
          label: 'New name',
          value: basename(path),
          confirmLabel: 'Rename',
        }),
    },
    {
      label: 'Make a copy',
      icon: <Files size={14} />,
      onSelect: () => void duplicateEntry(path),
    },
    {
      label: 'Copy path',
      icon: <Copy size={14} />,
      separatorBefore: true,
      onSelect: () => {
        void copyText(absoluteVaultPath(useStore.getState().vault?.path ?? '', path)).then((copied) =>
          pushToast(
            copied
              ? { kind: 'success', message: 'Path copied.' }
              : { kind: 'error', message: 'Clipboard access was denied.' },
          ),
        );
      },
    },
    {
      label: 'Copy vault-relative path',
      onSelect: () => {
        void copyText(path).then((copied) =>
          pushToast(
            copied
              ? { kind: 'success', message: 'Relative path copied.' }
              : { kind: 'error', message: 'Clipboard access was denied.' },
          ),
        );
      },
    },
    {
      label: 'Show in system explorer',
      icon: <ExternalLink size={14} />,
      onSelect: () => void window.vaultApi.reveal(path),
    },
    {
      label: 'Move to trash',
      icon: <Trash2 size={14} />,
      danger: true,
      separatorBefore: true,
      onSelect: () => requestDelete(path, 'file'),
    },
  ];

  if (!buffer) {
    return (
      <div className="note-area">
        <div className="empty-state">
          <span className="spinner" />
          <p>Loading note…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="note-area">
      <div className="editor-toolbar">
        <div className="toolbar-crumbs">
          {folderParts.map((part) => (
            <span key={part} className="crumb faint">
              / {part}
            </span>
          ))}
          <span className="crumb">/ {noteTitle(path)}</span>
        </div>
        <div className="toolbar-actions">
          <span
            className={clsx(
              'save-state',
              buffer.dirty && 'is-dirty',
              buffer.conflict && 'is-conflict',
            )}
          >
            <span className="save-dot" />
            {buffer.conflict ? 'Conflict' : buffer.missing ? 'Missing' : buffer.dirty ? 'Unsaved' : 'Saved'}
          </span>
          <IconButton
            label={reading ? 'Edit note (Ctrl+E)' : 'Reading view (Ctrl+E)'}
            onClick={() => toggleReadingView(path)}
          >
            {reading ? <PenLine size={16} /> : <BookOpen size={16} />}
          </IconButton>
          <IconButton label="Save note (Ctrl+S)" onClick={() => void saveNote(path)}>
            <Save size={16} />
          </IconButton>
          <IconButton
            label="More note actions"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setMenu({ x: rect.left, y: rect.bottom + 4 });
            }}
          >
            <MoreHorizontal size={16} />
          </IconButton>
        </div>
      </div>

      {buffer.conflict && (
        <div className="conflict-banner">
          <div className="banner-text">
            <div className="banner-title">This note changed on disk</div>
            <div className="banner-detail">
              Your unsaved edits were kept. Reload the file from disk or overwrite it with your
              version.
            </div>
          </div>
          <button type="button" className="button sm" onClick={() => void reloadNote(path)}>
            <RefreshCw size={13} />
            Reload
          </button>
          <button type="button" className="button sm primary" onClick={() => void keepMine(path)}>
            Keep mine
          </button>
        </div>
      )}

      {buffer.missing && (
        <div className="missing-banner">
          <div className="banner-text">
            <div className="banner-title">File no longer exists</div>
            <div className="banner-detail">
              {buffer.error ?? 'The note was moved or deleted outside the app.'}
            </div>
          </div>
          <button type="button" className="button sm" onClick={() => void recreate()}>
            Recreate
          </button>
          <button
            type="button"
            className="button sm ghost"
            onClick={() => void closeTab(paneId, path, true)}
          >
            <X size={13} />
            Close
          </button>
        </div>
      )}

      {buffer.loading ? (
        <div className="empty-state">
          <span className="spinner" />
          <p>Loading {noteTitle(path)}…</p>
        </div>
      ) : reading ? (
        <ReadingView key={path} path={path} content={buffer.content} />
      ) : (
        <>
          {settings.showInlineTitle && (
            <div className="note-title-row">
              <input
                ref={titleRef}
                className="note-title-input"
                aria-label="Note title"
                value={title}
                spellCheck={false}
                onChange={(event) => setTitle(event.target.value)}
                onFocus={(event) => event.currentTarget.select()}
                onBlur={commitTitle}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    event.currentTarget.blur();
                  } else if (event.key === 'Escape') {
                    setTitle(noteTitle(path));
                    event.currentTarget.blur();
                  }
                }}
              />
            </div>
          )}
          <NoteEditor
            key={path}
            path={path}
            content={buffer.content}
            cursor={buffer.cursor}
            scrollTop={buffer.scrollTop}
            showInlineTitle={settings.showInlineTitle}
            onChange={(next) => setContent(path, next)}
          />
        </>
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
          ariaLabel="Note actions"
        />
      )}
    </div>
  );
}
