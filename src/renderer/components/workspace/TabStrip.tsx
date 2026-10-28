import { useState } from 'react';
import clsx from 'clsx';
import { Columns2, Copy, ExternalLink, Plus, Rows2, X } from 'lucide-react';
import { noteTitle } from '@shared/paths';
import { absoluteVaultPath, copyText } from '../../lib/clipboard';
import { useStore } from '../../store/useStore';
import { IconButton } from '../ui/IconButton';
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu';

interface TabStripProps {
  paneId: string;
  tabs: string[];
  activeTab: string | null;
}

interface MenuState {
  x: number;
  y: number;
  path: string;
}

const api = window.vaultApi;

export function TabStrip({ paneId, tabs, activeTab }: TabStripProps) {
  const buffers = useStore((state) => state.buffers);
  const vaultRoot = useStore((state) => state.vault?.path ?? '');
  const paneCount = useStore((state) => state.workspace.panes.length);
  const splitDirection = useStore((state) => state.workspace.splitDirection);
  const activateTab = useStore((state) => state.activateTab);
  const closeTab = useStore((state) => state.closeTab);
  const closeOtherTabs = useStore((state) => state.closeOtherTabs);
  const closeTabsAfter = useStore((state) => state.closeTabsAfter);
  const closeAllTabs = useStore((state) => state.closeAllTabs);
  const createNote = useStore((state) => state.createNote);
  const toggleSplit = useStore((state) => state.toggleSplit);
  const openToSide = useStore((state) => state.openToSide);
  const closePane = useStore((state) => state.closePane);
  const reorderTab = useStore((state) => state.reorderTab);
  const setSplitDirection = useStore((state) => state.setSplitDirection);
  const pushToast = useStore((state) => state.pushToast);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);

  const menuItems: ContextMenuItem[] = menu
    ? [
        {
          label: 'Close tab',
          icon: <X size={14} />,
          shortcut: 'Ctrl+W',
          onSelect: () => void closeTab(paneId, menu.path),
        },
        {
          label: 'Close other tabs',
          icon: <X size={14} />,
          disabled: tabs.length <= 1,
          onSelect: () => void closeOtherTabs(paneId, menu.path),
        },
        {
          label: 'Close tabs to the right',
          icon: <X size={14} />,
          disabled: tabs.indexOf(menu.path) >= tabs.length - 1,
          onSelect: () => void closeTabsAfter(paneId, menu.path),
        },
        {
          label: 'Close all tabs',
          icon: <X size={14} />,
          onSelect: () => void closeAllTabs(paneId),
        },
        {
          label: 'Split right',
          icon: <Columns2 size={14} />,
          separatorBefore: true,
          onSelect: () => void openToSide(menu.path, 'vertical'),
        },
        {
          label: 'Split down',
          icon: <Rows2 size={14} />,
          onSelect: () => void openToSide(menu.path, 'horizontal'),
        },
        {
          label: 'Copy path',
          icon: <Copy size={14} />,
          separatorBefore: true,
          onSelect: () => {
            void copyText(absoluteVaultPath(vaultRoot, menu.path)).then((copied) =>
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
          icon: <Copy size={14} />,
          onSelect: () => {
            void copyText(menu.path).then((copied) =>
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
          onSelect: () => void api.reveal(menu.path),
        },
      ]
    : [];

  return (
    <div className="tabs" role="tablist" aria-label="Open notes">
      {tabs.map((path, index) => {
        const buffer = buffers[path];
        const isActive = path === activeTab;
        return (
          <div
            key={path}
            role="tab"
            tabIndex={isActive ? 0 : -1}
            aria-selected={isActive}
            className={clsx('tab', isActive && 'is-active', dropIndex === index && 'is-drop-target')}
            title={path}
            draggable
            onClick={() => void activateTab(paneId, path)}
            onAuxClick={(event) => {
              if (event.button === 1) {
                event.preventDefault();
                void closeTab(paneId, path);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                void activateTab(paneId, path);
              }
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu({ x: event.clientX, y: event.clientY, path });
            }}
            onDragStart={(event) => {
              setDragIndex(index);
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', path);
            }}
            onDragOver={(event) => {
              if (dragIndex === null) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setDropIndex(index);
            }}
            onDragLeave={() => setDropIndex(null)}
            onDrop={(event) => {
              event.preventDefault();
              if (dragIndex !== null) reorderTab(paneId, dragIndex, index);
              setDragIndex(null);
              setDropIndex(null);
            }}
            onDragEnd={() => {
              setDragIndex(null);
              setDropIndex(null);
            }}
          >
            <span className="tab-title">{noteTitle(path)}</span>
            {buffer?.dirty && <span className="tab-dirty" title="Unsaved changes" />}
            <button
              type="button"
              className="tab-close"
              aria-label={`Close ${noteTitle(path)}`}
              title="Close tab"
              onClick={(event) => {
                event.stopPropagation();
                void closeTab(paneId, path);
              }}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
      <div className="tabs-fill" />
      <div className="tabs-actions">
        <IconButton label="New note (Ctrl+N)" onClick={() => void createNote()}>
          <Plus size={15} />
        </IconButton>
        <IconButton
          label={paneCount > 1 ? 'Use one pane' : 'Split pane (Ctrl+\\)'}
          active={paneCount > 1}
          onClick={() => toggleSplit()}
        >
          <Columns2 size={15} />
        </IconButton>
        {paneCount > 1 && (
          <>
            <IconButton
              label="Toggle split direction"
              onClick={() =>
                setSplitDirection(splitDirection === 'vertical' ? 'horizontal' : 'vertical')
              }
            >
              {splitDirection === 'vertical' ? <Rows2 size={15} /> : <Columns2 size={15} />}
            </IconButton>
            <IconButton label="Close pane" onClick={() => closePane(paneId)}>
              <X size={15} />
            </IconButton>
          </>
        )}
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
          ariaLabel="Tab actions"
        />
      )}
    </div>
  );
}
