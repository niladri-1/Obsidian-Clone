import { Files, FolderOpen, PanelLeftClose, PanelRightClose, Search } from 'lucide-react';
import { noteTitle } from '@shared/paths';
import { activePathOf, useStore } from '../../store/useStore';
import { IconButton } from '../ui/IconButton';
import { Segmented } from '../ui/Toggle';
import { FileExplorer } from '../panels/FileExplorer';
import { SearchPanel } from '../panels/SearchPanel';
import { OutlinePanel } from '../panels/OutlinePanel';
import { BacklinksPanel } from '../panels/BacklinksPanel';
import { PropertiesPanel } from '../panels/PropertiesPanel';

interface SidebarProps {
  side: 'left' | 'right';
}

type LeftView = 'files' | 'search';
type RightView = 'outline' | 'backlinks' | 'properties';

export function Sidebar({ side }: SidebarProps) {
  const leftOpen = useStore((state) => state.workspace.leftOpen);
  const rightOpen = useStore((state) => state.workspace.rightOpen);
  const leftWidth = useStore((state) => state.workspace.leftWidth);
  const rightWidth = useStore((state) => state.workspace.rightWidth);
  const activeLeftView = useStore((state) => state.workspace.activeLeftView);
  const activeRightView = useStore((state) => state.workspace.activeRightView);
  const activePath = useStore((state) => activePathOf(state));
  const setLeftOpen = useStore((state) => state.setLeftOpen);
  const setRightOpen = useStore((state) => state.setRightOpen);
  const setActiveLeftView = useStore((state) => state.setActiveLeftView);
  const setActiveRightView = useStore((state) => state.setActiveRightView);

  if (side === 'left') {
    return (
      <aside
        className="sidebar sidebar-left"
        style={{ width: leftWidth, display: leftOpen ? undefined : 'none' }}
        aria-label="Vault sidebar"
      >
        <div className="sidebar-header">
          <span className="sidebar-title">Vault</span>
          <Segmented<LeftView>
            value={activeLeftView}
            label="Vault panel"
            onChange={setActiveLeftView}
            options={[
              { value: 'files', label: <Files size={14} />, title: 'File explorer' },
              { value: 'search', label: <Search size={14} />, title: 'Search the vault (Ctrl+Shift+F)' },
            ]}
          />
          <IconButton label="Hide left sidebar" onClick={() => setLeftOpen(false)}>
            <PanelLeftClose size={15} />
          </IconButton>
        </div>
        <div className="sidebar-body">
          {activeLeftView === 'files' ? <FileExplorer /> : <SearchPanel />}
        </div>
        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-vault-button"
            onClick={() => void useStore.getState().showPicker()}
            title="Change vault"
          >
            <FolderOpen size={14} />
            <span className="truncate">Change vault</span>
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="sidebar sidebar-right"
      style={{ width: rightWidth, display: rightOpen ? undefined : 'none' }}
      aria-label="Note sidebar"
    >
      <div className="sidebar-header">
        <span className="sidebar-title truncate" title={activePath ?? 'No note'}>
          {activePath ? noteTitle(activePath) : 'Note'}
        </span>
        <Segmented<RightView>
          value={activeRightView}
          label="Note panel"
          onChange={setActiveRightView}
          options={[
            { value: 'outline', label: 'Outline', title: 'Headings in this note' },
            { value: 'backlinks', label: 'Links', title: 'Backlinks, unresolved links and tags' },
            { value: 'properties', label: 'Props', title: 'Frontmatter properties' },
          ]}
        />
        <IconButton label="Hide right sidebar" onClick={() => setRightOpen(false)}>
          <PanelRightClose size={15} />
        </IconButton>
      </div>
      <div className="sidebar-body">
        {activeRightView === 'outline' && <OutlinePanel />}
        {activeRightView === 'backlinks' && <BacklinksPanel />}
        {activeRightView === 'properties' && <PropertiesPanel />}
      </div>
    </aside>
  );
}
