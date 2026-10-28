import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  ChevronRight,
  Columns2,
  Copy,
  ExternalLink,
  FilePlus2,
  Files,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { basename, dirname, noteTitle } from '@shared/paths';
import type { VaultNode } from '@shared/types';
import { absoluteVaultPath, copyText } from '../../lib/clipboard';
import { activePathOf, useStore } from '../../store/useStore';
import { IconButton } from '../ui/IconButton';
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu';

interface FlatRow {
  node: VaultNode;
  depth: number;
}

interface MenuState {
  x: number;
  y: number;
  path: string;
  kind: 'file' | 'folder';
}

function flatten(
  node: VaultNode,
  depth: number,
  expanded: Set<string>,
  rows: FlatRow[],
): void {
  for (const child of node.children ?? []) {
    rows.push({ node: child, depth });
    if (child.kind === 'folder' && expanded.has(child.path)) {
      flatten(child, depth + 1, expanded, rows);
    }
  }
}

export function FileExplorer() {
  const tree = useStore((state) => state.tree);
  const vault = useStore((state) => state.vault);
  const expandedFolders = useStore((state) => state.workspace.expandedFolders);
  const activePath = useStore((state) => activePathOf(state));
  const openNote = useStore((state) => state.openNote);
  const createNote = useStore((state) => state.createNote);
  const createFolder = useStore((state) => state.createFolder);
  const duplicateEntry = useStore((state) => state.duplicateEntry);
  const renameEntry = useStore((state) => state.renameEntry);
  const requestDelete = useStore((state) => state.requestDelete);
  const openToSide = useStore((state) => state.openToSide);
  const toggleFolder = useStore((state) => state.toggleFolder);
  const pushToast = useStore((state) => state.pushToast);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [menu, setMenu] = useState<MenuState | null>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  const expanded = useMemo(() => new Set(expandedFolders), [expandedFolders]);
  const rows = useMemo(() => {
    const list: FlatRow[] = [];
    flatten(tree.root, 0, expanded, list);
    return list;
  }, [tree.root, expanded]);

  useEffect(() => {
    if (renaming) {
      renameRef.current?.focus();
      const input = renameRef.current;
      if (input) {
        const dot = input.value.lastIndexOf('.');
        input.setSelectionRange(0, dot > 0 ? dot : input.value.length);
      }
    }
  }, [renaming]);

  const startRename = (path: string): void => {
    setRenaming(path);
    setRenameValue(basename(path));
  };

  const commitRename = (path: string): void => {
    const next = renameValue.trim();
    setRenaming(null);
    if (next && next !== basename(path)) void renameEntry(path, next);
  };

  const targetFolder = selectedFolder || '';

  const copyPath = (text: string, label: string): void => {
    void copyText(text).then((copied) =>
      pushToast(
        copied
          ? { kind: 'success', message: `${label} copied.` }
          : { kind: 'error', message: 'Clipboard access was denied.' },
      ),
    );
  };

  const menuItems: ContextMenuItem[] = menu
    ? [
        ...(menu.kind === 'file'
          ? [
              {
                label: 'Open in new tab',
                icon: <FilePlus2 size={14} />,
                onSelect: () => void openNote(menu.path, { newTab: true }),
              },
              {
                label: 'Open to the right',
                icon: <Columns2 size={14} />,
                onSelect: () => void openToSide(menu.path, 'vertical'),
              },
            ]
          : [
              {
                label: 'New note',
                icon: <FilePlus2 size={14} />,
                onSelect: () => void createNote(menu.path),
              },
              {
                label: 'New folder',
                icon: <FolderPlus size={14} />,
                onSelect: () => void createFolder(menu.path),
              },
            ]),
        {
          label: 'Rename…',
          separatorBefore: true,
          shortcut: 'F2',
          onSelect: () => startRename(menu.path),
        },
        {
          label: 'Make a copy',
          icon: <Files size={14} />,
          onSelect: () => void duplicateEntry(menu.path),
        },
        {
          label: 'Copy path',
          icon: <Copy size={14} />,
          separatorBefore: true,
          onSelect: () => copyPath(absoluteVaultPath(vault?.path ?? '', menu.path), 'Path'),
        },
        {
          label: 'Copy vault-relative path',
          onSelect: () => copyPath(menu.path, 'Relative path'),
        },
        {
          label: 'Show in system explorer',
          icon: <ExternalLink size={14} />,
          onSelect: () => void window.vaultApi.reveal(menu.path),
        },
        {
          label: 'Move to trash',
          icon: <Trash2 size={14} />,
          danger: true,
          separatorBefore: true,
          onSelect: () => requestDelete(menu.path, menu.kind),
        },
      ]
    : [];

  return (
    <div className="tree" role="tree" aria-label="Vault files">
      <div className="tree-toolbar">
        <span className="tree-scope" title={vault?.path}>
          {targetFolder ? `/${targetFolder}` : vault?.name ?? 'Vault'}
        </span>
        <IconButton
          label="New note in this folder (Ctrl+N)"
          onClick={() => void createNote(targetFolder)}
        >
          <FilePlus2 size={15} />
        </IconButton>
        <IconButton label="New folder (Ctrl+Shift+N)" onClick={() => void createFolder(targetFolder)}>
          <FolderPlus size={15} />
        </IconButton>
        <IconButton
          label="Refresh file list"
          onClick={() => {
            void window.vaultApi.getTree().then((result) => {
              if (result.ok) useStore.getState().handleVaultChanged(result.data);
              else pushToast({ kind: 'error', message: result.error.message });
            });
          }}
        >
          <RefreshCw size={14} />
        </IconButton>
      </div>

      {rows.length === 0 && (
        <div className="sidebar-empty">
          This vault is empty. Create a note to start writing.
        </div>
      )}

      {rows.map(({ node, depth }) => {
        const isFolder = node.kind === 'folder';
        const open = isFolder && expanded.has(node.path);
        const active = node.path === activePath;
        const editing = renaming === node.path;
        return (
          <div
            key={`${node.kind}:${node.path}`}
            role="treeitem"
            aria-level={depth + 1}
            aria-expanded={isFolder ? open : undefined}
            aria-selected={active}
            tabIndex={0}
            className={clsx(
              'tree-row',
              active && 'is-active',
              editing && 'is-renaming',
              isFolder && selectedFolder === node.path && 'is-drop-target',
            )}
            style={{ paddingLeft: `${6 + depth * 13}px` }}
            title={node.path}
            onClick={() => {
              if (isFolder) {
                setSelectedFolder(node.path);
                toggleFolder(node.path);
              } else {
                setSelectedFolder(dirname(node.path));
                void openNote(node.path);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                if (isFolder) {
                  setSelectedFolder(node.path);
                  toggleFolder(node.path);
                } else {
                  void openNote(node.path);
                }
              }
              if (event.key === 'F2') {
                event.preventDefault();
                startRename(node.path);
              }
              if (event.key === 'Delete') {
                event.preventDefault();
                requestDelete(node.path, node.kind);
              }
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              setSelectedFolder(isFolder ? node.path : dirname(node.path));
              setMenu({ x: event.clientX, y: event.clientY, path: node.path, kind: node.kind });
            }}
            onDoubleClick={() => {
              if (isFolder) startRename(node.path);
              else startRename(node.path);
            }}
          >
            <span
              className={clsx('tree-caret', open && 'is-open')}
              onClick={(event) => {
                if (!isFolder) return;
                event.stopPropagation();
                toggleFolder(node.path);
              }}
            >
              {isFolder ? <ChevronRight size={12} /> : null}
            </span>
            <span className="tree-icon">
              {isFolder ? (
                open ? (
                  <FolderOpen size={14} />
                ) : (
                  <Folder size={14} />
                )
              ) : (
                <FileText size={14} />
              )}
            </span>

            {editing ? (
              <input
                ref={renameRef}
                className="rename-input"
                value={renameValue}
                aria-label={`Rename ${basename(node.path)}`}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => setRenameValue(event.target.value)}
                onBlur={() => commitRename(node.path)}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitRename(node.path);
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    setRenaming(null);
                  }
                }}
              />
            ) : (
              <span className="tree-label">
                {isFolder ? basename(node.path) : noteTitle(node.path)}
              </span>
            )}

            {!editing && (
              <span className="row-actions">
                {isFolder && (
                  <button
                    type="button"
                    className="row-action"
                    aria-label={`New note in ${basename(node.path)}`}
                    title="New note in folder"
                    onClick={(event) => {
                      event.stopPropagation();
                      void createNote(node.path);
                    }}
                  >
                    <FilePlus2 size={13} />
                  </button>
                )}
                <button
                  type="button"
                  className="row-action"
                  aria-label={`More actions for ${basename(node.path)}`}
                  title="More actions"
                  onClick={(event) => {
                    event.stopPropagation();
                    const rect = event.currentTarget.getBoundingClientRect();
                    setMenu({
                      x: rect.left,
                      y: rect.bottom + 4,
                      path: node.path,
                      kind: node.kind,
                    });
                  }}
                >
                  <MoreHorizontal size={13} />
                </button>
              </span>
            )}
          </div>
        );
      })}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
          ariaLabel={`Actions for ${basename(menu.path)}`}
        />
      )}
    </div>
  );
}
