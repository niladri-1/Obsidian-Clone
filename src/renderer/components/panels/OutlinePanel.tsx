import { useMemo } from 'react';
import clsx from 'clsx';
import { ListTree } from 'lucide-react';
import { parseHeadings } from '@shared/links';
import { activePathOf, useStore } from '../../store/useStore';

/** Headings of the active note, linked to the editor/reading reveal mechanism. */
export function OutlinePanel() {
  const path = useStore((state) => activePathOf(state));
  const content = useStore((state) => (path ? state.buffers[path]?.content : undefined));
  const cursorLine = useStore((state) =>
    path ? (state.buffers[path]?.cursor?.line ?? 0) : 0,
  );
  const reading = useStore((state) =>
    path
      ? (state.workspace.viewModes[path] ?? state.settings.vault.defaultViewMode) === 'reading'
      : false,
  );
  const setReveal = useStore((state) => state.setReveal);

  const headings = useMemo(() => parseHeadings(content ?? ''), [content]);

  const currentIndex = useMemo(() => {
    if (headings.length === 0) return -1;
    const line = cursorLine + 1;
    let index = -1;
    for (let i = 0; i < headings.length; i += 1) {
      if (headings[i]!.line <= line) index = i;
      else break;
    }
    return index === -1 ? 0 : index;
  }, [headings, cursorLine]);

  if (!path) {
    return <div className="sidebar-empty">Open a note to see its outline.</div>;
  }

  if (headings.length === 0) {
    return (
      <div className="sidebar-empty">
        <ListTree size={18} style={{ display: 'block', margin: '0 auto 8px', opacity: 0.6 }} />
        No headings yet. Start a line with <code>#</code> to add one.
      </div>
    );
  }

  return (
    <div className="outline-list" role="list" aria-label="Note outline">
      {headings.map((heading, index) => (
        <button
          key={`${heading.line}-${index}`}
          type="button"
          role="listitem"
          className={clsx('outline-item', index === currentIndex && 'is-current')}
          style={{ paddingLeft: `${7 + (heading.level - 1) * 12}px` }}
          title={`Line ${heading.line}`}
          onClick={() =>
            setReveal({
              path,
              heading: heading.text,
              line: heading.line,
            })
          }
        >
          <span className="outline-hash">{'#'.repeat(heading.level)}</span>
          <span className="outline-text">{heading.text}</span>
        </button>
      ))}
      {reading && (
        <div className="search-summary">Clicking a heading scrolls the reading view.</div>
      )}
    </div>
  );
}
