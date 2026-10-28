import { useEffect, useMemo, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import { noteTitle } from '@shared/paths';
import { useStore } from '../../store/useStore';
import { fuzzyMatch } from '../../lib/fuzzy';
import { Modal } from '../ui/Modal';
import { Highlight } from '../ui/Highlight';

interface Candidate {
  path: string;
  score: number;
  indices: number[];
  recent: boolean;
}

export function QuickSwitcher() {
  const open = useStore((state) => state.ui.quickOpenOpen);
  const files = useStore((state) => state.tree.files);
  const recentFiles = useStore((state) => state.workspace.recentFiles);
  const openNote = useStore((state) => state.openNote);
  const setQuickOpenOpen = useStore((state) => state.setQuickOpenOpen);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(0);
  }, [open]);

  const recentRank = useMemo(() => {
    const map = new Map<string, number>();
    recentFiles.forEach((path, index) => map.set(path, index));
    return map;
  }, [recentFiles]);

  const candidates = useMemo<Candidate[]>(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      const ordered = [
        ...recentFiles.filter((path) => files.includes(path)),
        ...files.filter((path) => !recentRank.has(path)),
      ];
      return ordered.slice(0, 100).map((path) => ({
        path,
        score: 0,
        indices: [],
        recent: recentRank.has(path),
      }));
    }

    const results: Candidate[] = [];
    for (const path of files) {
      const match = fuzzyMatch(trimmed, path);
      if (!match) continue;
      const recent = recentRank.has(path);
      const recentBoost = recent ? 40 - Math.min(20, (recentRank.get(path) ?? 0) * 2) : 0;
      results.push({
        path,
        score: match.score + recentBoost,
        indices: match.indices,
        recent,
      });
    }
    results.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
    return results.slice(0, 100);
  }, [files, query, recentFiles, recentRank]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  if (!open) return null;

  const choose = (path: string, newTab: boolean): void => {
    setQuickOpenOpen(false);
    void openNote(path, newTab ? { newTab: true } : {});
  };

  const active = candidates[Math.min(selected, Math.max(0, candidates.length - 1))];

  return (
    <Modal
      bare
      top
      className="palette"
      onClose={() => setQuickOpenOpen(false)}
      ariaLabel="Quick switcher"
      closeLabel="Close quick switcher"
    >
      <div className="palette-input-row">
        <Search size={16} />
        <input
          className="palette-input"
          value={query}
          placeholder="Open a note by name or path…"
          aria-label="Quick switcher query"
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setSelected((index) =>
                candidates.length === 0 ? 0 : (index + 1) % candidates.length,
              );
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setSelected((index) =>
                candidates.length === 0
                  ? 0
                  : (index - 1 + candidates.length) % candidates.length,
              );
            } else if (event.key === 'Enter' && active) {
              event.preventDefault();
              choose(active.path, event.ctrlKey || event.metaKey);
            }
          }}
        />
        <span className="kbd">Esc</span>
      </div>

      <div className="palette-list" role="listbox" aria-label="Notes">
        {candidates.length === 0 ? (
          <div className="palette-empty">
            {files.length === 0
              ? 'This vault has no notes yet.'
              : `No note matches “${query.trim()}”.`}
          </div>
        ) : (
          candidates.map((candidate, index) => (
            <button
              key={candidate.path}
              type="button"
              role="option"
              aria-selected={index === selected}
              className={`palette-item${index === selected ? ' is-selected' : ''}`}
              onMouseEnter={() => setSelected(index)}
              onClick={(event) => choose(candidate.path, event.ctrlKey || event.metaKey)}
            >
              <span className="palette-icon">
                <FileText size={15} />
              </span>
              <span className="palette-main">
                <span className="palette-title">{noteTitle(candidate.path)}</span>
                <span className="palette-subtitle">
                  <Highlight text={candidate.path} indices={candidate.indices} />
                </span>
              </span>
              <span className="palette-meta">
                {candidate.recent && <span className="faint">recent</span>}
                {index === 0 && query.trim() !== '' && <span className="kbd">Enter</span>}
              </span>
            </button>
          ))
        )}
      </div>

      <div className="palette-footer">
        <span>↑↓ navigate</span>
        <span>Enter open</span>
        <span>Ctrl+Enter new tab</span>
        <span className="spacer" />
        <span>{candidates.length} notes</span>
      </div>
    </Modal>
  );
}
