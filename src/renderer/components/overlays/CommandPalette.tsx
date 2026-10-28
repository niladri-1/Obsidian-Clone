import { useEffect, useMemo, useState } from 'react';
import { Command as CommandIcon, CornerDownLeft } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { commands, executeCommand, type Command } from '../../lib/commands';
import { fuzzyMatch } from '../../lib/fuzzy';
import { Modal } from '../ui/Modal';
import { Highlight } from '../ui/Highlight';

interface Candidate {
  command: Command;
  score: number;
  indices: number[];
}

export function CommandPalette() {
  const open = useStore((state) => state.ui.paletteOpen);
  const setPaletteOpen = useStore((state) => state.setPaletteOpen);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(0);
  }, [open]);

  const candidates = useMemo<Candidate[]>(() => {
    const trimmed = query.trim().replace(/^>+\s*/, '');
    if (!trimmed) {
      return commands.map((command) => ({ command, score: 0, indices: [] }));
    }
    const results: Candidate[] = [];
    for (const command of commands) {
      const label = fuzzyMatch(trimmed, command.label);
      const category = fuzzyMatch(trimmed, `${command.category} ${command.label}`);
      const match = label ?? category;
      if (!match) continue;
      results.push({
        command,
        score: match.score + (label ? 10 : 0),
        indices: label ? label.indices : [],
      });
    }
    results.sort((a, b) => b.score - a.score || a.command.label.localeCompare(b.command.label));
    return results;
  }, [query]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  if (!open) return null;

  const run = (command: Command): void => {
    setPaletteOpen(false);
    void executeCommand(command.id);
  };

  const active = candidates[Math.min(selected, Math.max(0, candidates.length - 1))];

  return (
    <Modal
      bare
      top
      className="palette"
      onClose={() => setPaletteOpen(false)}
      ariaLabel="Command palette"
      closeLabel="Close command palette"
    >
      <div className="palette-input-row">
        <CommandIcon size={16} />
        <input
          className="palette-input"
          value={query}
          placeholder="Run a command…"
          aria-label="Command palette query"
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
              run(active.command);
            }
          }}
        />
        <span className="kbd">Esc</span>
      </div>

      <div className="palette-list" role="listbox" aria-label="Commands">
        {candidates.length === 0 ? (
          <div className="palette-empty">No command matches “{query.trim()}”.</div>
        ) : (
          candidates.map((candidate, index) => (
            <button
              key={candidate.command.id}
              type="button"
              role="option"
              aria-selected={index === selected}
              className={`palette-item${index === selected ? ' is-selected' : ''}`}
              onMouseEnter={() => setSelected(index)}
              onClick={() => run(candidate.command)}
            >
              <span className="palette-icon">
                <CommandIcon size={15} />
              </span>
              <span className="palette-main">
                <span className="palette-title">
                  <Highlight text={candidate.command.label} indices={candidate.indices} />
                </span>
                <span className="palette-subtitle">{candidate.command.category}</span>
              </span>
              <span className="palette-meta">
                {candidate.command.hotkey && <span className="kbd">{candidate.command.hotkey}</span>}
                {index === selected && <CornerDownLeft size={12} />}
              </span>
            </button>
          ))
        )}
      </div>

      <div className="palette-footer">
        <span>↑↓ navigate</span>
        <span>Enter run</span>
        <span className="spacer" />
        <span>{candidates.length} commands</span>
      </div>
    </Modal>
  );
}
