import {
  CalendarDays,
  FolderOpen,
  Network,
  Search,
  Settings,
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { IconButton } from '../ui/IconButton';

export function Ribbon() {
  const focusSearch = useStore((state) => state.focusSearch);
  const setGraphOpen = useStore((state) => state.setGraphOpen);
  const openDailyNote = useStore((state) => state.openDailyNote);
  const setSettingsOpen = useStore((state) => state.setSettingsOpen);
  const showPicker = useStore((state) => state.showPicker);

  return (
    <nav className="ribbon" aria-label="Ribbon">
      <span className="ribbon-spacer" />
      <IconButton label="Search vault (Ctrl+Shift+F)" onClick={() => focusSearch()}>
        <Search size={18} />
      </IconButton>
      <IconButton label="Graph view (Ctrl+G)" onClick={() => setGraphOpen(true)}>
        <Network size={18} />
      </IconButton>
      <IconButton label="Today's daily note" onClick={() => void openDailyNote()}>
        <CalendarDays size={18} />
      </IconButton>
      <IconButton label="Change vault" onClick={() => void showPicker()}>
        <FolderOpen size={18} />
      </IconButton>
      <IconButton label="Settings (Ctrl+,)" onClick={() => setSettingsOpen(true)}>
        <Settings size={18} />
      </IconButton>
    </nav>
  );
}
