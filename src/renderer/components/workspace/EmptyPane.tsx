import { NotebookPen, Search } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { noteTitle } from '@shared/paths';

export function EmptyPane() {
  const tree = useStore((state) => state.tree);
  const recent = useStore((state) => state.workspace.recentFiles);
  const createNote = useStore((state) => state.createNote);
  const setQuickOpenOpen = useStore((state) => state.setQuickOpenOpen);
  const openNote = useStore((state) => state.openNote);

  const emptyVault = tree.files.length === 0;

  return (
    <div className="empty-state">
      <span className="empty-mark">
        <NotebookPen size={26} />
      </span>
      <h2>{emptyVault ? 'This vault is empty' : 'No note is open'}</h2>
      <p>
        {emptyVault
          ? 'Create your first note. It is saved as a plain Markdown file inside your vault folder.'
          : 'Open a note from the file explorer, jump to one with the quick switcher, or start something new.'}
      </p>
      <div className="empty-actions">
        <button type="button" className="button primary" onClick={() => void createNote()}>
          <NotebookPen size={15} />
          Create a note
        </button>
        <button type="button" className="button ghost" onClick={() => setQuickOpenOpen(true)}>
          <Search size={15} />
          Quick switcher
        </button>
      </div>
      {recent.length > 0 && (
        <div className="recent-list">
          <div className="recent-title">Recently opened</div>
          {recent.slice(0, 6).map((path) => (
            <button
              key={path}
              type="button"
              className="recent-item"
              onClick={() => void openNote(path)}
            >
              <span className="truncate">{noteTitle(path)}</span>
              <span className="recent-path">{path}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
