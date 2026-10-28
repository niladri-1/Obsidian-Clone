import {
  ArrowLeft,
  ArrowRight,
  Moon,
  Network,
  PanelLeft,
  PanelRight,
  Plus,
  Search,
  Settings,
  Sun,
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { IconButton } from '../ui/IconButton';

export function TitleBar() {
  const leftOpen = useStore((state) => state.workspace.leftOpen);
  const rightOpen = useStore((state) => state.workspace.rightOpen);
  const activePaneId = useStore((state) => state.workspace.activePaneId);
  const history = useStore((state) => state.histories[activePaneId]);
  const theme = useStore((state) => state.settings.appearance.theme);
  const setLeftOpen = useStore((state) => state.setLeftOpen);
  const setRightOpen = useStore((state) => state.setRightOpen);
  const showPicker = useStore((state) => state.showPicker);
  const focusSearch = useStore((state) => state.focusSearch);
  const createNote = useStore((state) => state.createNote);
  const goBack = useStore((state) => state.goBack);
  const goForward = useStore((state) => state.goForward);
  const setGraphOpen = useStore((state) => state.setGraphOpen);
  const setSettingsOpen = useStore((state) => state.setSettingsOpen);
  const updateAppearance = useStore((state) => state.updateAppearance);

  const canBack = !!history && history.index > 0;
  const canForward = !!history && history.index >= 0 && history.index < history.stack.length - 1;
  const dark = theme === 'dark';

  return (
    <header className="title-bar">
      <div className="titlebar-left">
        <button
          type="button"
          className="vault-chip"
          onClick={() => void showPicker()}
          title="Switch vault"
        >
          <span className="vault-dot" />
          <span className="truncate">Obsidia</span>
        </button>
        <span className="title-divider" />
        <IconButton label="Go back" onClick={() => void goBack()} disabled={!canBack}>
          <ArrowLeft size={16} />
        </IconButton>
        <IconButton label="Go forward" onClick={() => void goForward()} disabled={!canForward}>
          <ArrowRight size={16} />
        </IconButton>
      </div>

      <div className="titlebar-center">
        <button
          type="button"
          className="search-strip"
          onClick={() => focusSearch()}
          title="Search the vault (Ctrl+Shift+F)"
        >
          <Search size={14} />
          <span className="search-strip-label">Search vault…</span>
          <span className="kbd">Ctrl+Shift+F</span>
        </button>
      </div>

      <div className="titlebar-right">
        <IconButton label="New note (Ctrl+N)" onClick={() => void createNote()}>
          <Plus size={16} />
        </IconButton>
        <IconButton
          label="Toggle left sidebar"
          active={leftOpen}
          onClick={() => setLeftOpen(!leftOpen)}
        >
          <PanelLeft size={16} />
        </IconButton>
        <IconButton
          label="Toggle right sidebar"
          active={rightOpen}
          onClick={() => setRightOpen(!rightOpen)}
        >
          <PanelRight size={16} />
        </IconButton>
        <IconButton label="Graph view (Ctrl+G)" onClick={() => setGraphOpen(true)}>
          <Network size={16} />
        </IconButton>
        <IconButton
          label={dark ? 'Use light theme' : 'Use dark theme'}
          onClick={() => void updateAppearance({ theme: dark ? 'light' : 'dark' })}
        >
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </IconButton>
        <IconButton label="Settings (Ctrl+,)" onClick={() => setSettingsOpen(true)}>
          <Settings size={16} />
        </IconButton>
      </div>
    </header>
  );
}
