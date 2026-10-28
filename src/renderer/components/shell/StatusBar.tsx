import { useMemo } from 'react';
import { Eye, Link2, PenLine } from 'lucide-react';
import clsx from 'clsx';
import { activePathOf, useStore } from '../../store/useStore';
import { formatCount, textStats } from '../../lib/stats';

export function StatusBar() {
  const activePath = useStore((state) => activePathOf(state));
  const buffer = useStore((state) => (activePath ? state.buffers[activePath] : undefined));
  const viewMode = useStore((state) =>
    activePath
      ? (state.workspace.viewModes[activePath] ?? state.settings.vault.defaultViewMode)
      : 'source',
  );
  const edges = useStore((state) => state.links.edges);
  const zoom = useStore((state) => state.settings.app.zoom);
  const toggleReadingView = useStore((state) => state.toggleReadingView);

  const stats = useMemo(() => textStats(buffer?.content ?? ''), [buffer?.content]);
  const backlinks = useMemo(
    () => (activePath ? edges.filter((edge) => edge.to === activePath).length : 0),
    [edges, activePath],
  );

  const state = buffer?.conflict
    ? 'Conflict'
    : buffer?.missing
      ? 'Missing'
      : buffer?.dirty
        ? 'Unsaved'
        : 'Saved';
  const dotClass = buffer?.conflict || buffer?.missing ? 'is-error' : buffer?.dirty ? 'is-dirty' : 'is-saved';

  return (
    <footer className="status-bar">
      <div className="status-group">
        <span
          className="status-item"
          title={`${formatCount(stats.characters)} characters · ${stats.readingMinutes} min read`}
        >
          {formatCount(stats.words)} words
        </span>
        {buffer?.cursor && (
          <span className="status-item" title="Cursor position">
            Ln {buffer.cursor.line + 1}, Col {buffer.cursor.ch + 1}
          </span>
        )}
      </div>
      <span className="status-spacer" />
      <div className="status-group">
        {activePath && backlinks > 0 && (
          <span className="status-item" title={`${backlinks} backlinks to this note`}>
            <Link2 size={11} />
            {backlinks}
          </span>
        )}
        {activePath && (
          <button
            type="button"
            className="status-button status-item"
            onClick={() => toggleReadingView(activePath)}
            title={
              viewMode === 'reading'
                ? 'Reading view — switch to source (Ctrl+E)'
                : 'Source view — switch to reading (Ctrl+E)'
            }
            aria-label={viewMode === 'reading' ? 'Switch to source view' : 'Switch to reading view'}
          >
            {viewMode === 'reading' ? <Eye size={11} /> : <PenLine size={11} />}
          </button>
        )}
        <span className={clsx('status-item', 'save-state', buffer?.dirty && 'is-dirty', buffer?.conflict && 'is-conflict')}>
          <span className={clsx('status-dot', dotClass)} />
          {state}
        </span>
        {zoom !== 1 && (
          <span className="status-item" title="Interface zoom">
            {Math.round(zoom * 100)}%
          </span>
        )}
      </div>
    </footer>
  );
}
