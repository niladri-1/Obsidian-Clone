import { useEffect, useMemo, useState } from 'react';
import { FilePlus2, Hash, Link2, Unlink } from 'lucide-react';
import { basename, dirname, noteTitle, normalizeRelPath } from '@shared/paths';
import { outgoingUnresolved, parseTags } from '@shared/links';
import { frontmatterTags, parseFrontmatter } from '@shared/frontmatter';
import { activePathOf, useStore } from '../../store/useStore';
import { requestSearch } from '../../lib/bus';

const api = window.vaultApi;

interface BacklinkEntry {
  path: string;
  target: string;
  embed: boolean;
  count: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A short, line-oriented excerpt around the first mention of the link target. */
function contextSnippet(content: string, target: string): string {
  const lines = content.split(/\r?\n/);
  const needle = target.toLowerCase();
  let index = lines.findIndex((line) => line.toLowerCase().includes(needle));
  if (index === -1) index = lines.findIndex((line) => line.trim().length > 0);
  if (index === -1) return '';
  const start = Math.max(0, index - 1);
  const excerpt = lines
    .slice(start, Math.min(lines.length, index + 2))
    .join('\n')
    .trim();
  return excerpt.length > 260 ? `${excerpt.slice(0, 257)}…` : excerpt;
}

function Context({ text, target }: { text: string; target: string }) {
  if (!text) return null;
  if (!target) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(target)})`, 'ig'));
  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === target.toLowerCase() ? <mark key={index}>{part}</mark> : part,
      )}
    </>
  );
}

export function BacklinksPanel() {
  const path = useStore((state) => activePathOf(state));
  const content = useStore((state) => (path ? state.buffers[path]?.content : undefined));
  const edges = useStore((state) => state.links.edges);
  const allPaths = useStore((state) => state.tree.files);
  const openNote = useStore((state) => state.openNote);
  const setActiveLeftView = useStore((state) => state.setActiveLeftView);
  const handleVaultChanged = useStore((state) => state.handleVaultChanged);
  const pushToast = useStore((state) => state.pushToast);
  const [contents, setContents] = useState<Record<string, string>>({});

  const incoming = useMemo<BacklinkEntry[]>(() => {
    if (!path) return [];
    const grouped = new Map<string, BacklinkEntry>();
    for (const edge of edges) {
      if (edge.to !== path) continue;
      const current = grouped.get(edge.from);
      if (current) {
        current.count += 1;
        continue;
      }
      grouped.set(edge.from, {
        path: edge.from,
        target: edge.target,
        embed: edge.embed,
        count: 1,
      });
    }
    return [...grouped.values()].sort(
      (a, b) => b.count - a.count || a.path.localeCompare(b.path),
    );
  }, [edges, path]);

  const sources = useMemo(() => incoming.map((entry) => entry.path).join('|'), [incoming]);

  useEffect(() => {
    if (!sources) {
      setContents({});
      return;
    }
    let cancelled = false;
    const paths = sources.split('|').filter(Boolean);
    void Promise.all(
      paths.map(async (source) => ({ source, result: await api.readFile(source) })),
    ).then((reads) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const { source, result } of reads) {
        if (result.ok) next[source] = result.data.content;
      }
      setContents(next);
    });
    return () => {
      cancelled = true;
    };
  }, [sources]);

  const unresolved = useMemo(() => {
    if (!path || !content) return [];
    const found = outgoingUnresolved(content, path, allPaths);
    return [...new Set(found)].sort((a, b) => a.localeCompare(b));
  }, [path, content, allPaths]);

  const tags = useMemo(() => {
    if (!content) return [];
    const parsed = parseFrontmatter(content);
    const values = new Set<string>([
      ...frontmatterTags(parsed.data),
      ...parseTags(content).map((tag) => tag.tag.toLowerCase()),
    ]);
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [content]);

  const createNote = async (target: string): Promise<void> => {
    if (!path) return;
    const clean = target.trim().replace(/^\/+/, '');
    if (!clean) return;
    let relative: string;
    try {
      relative = normalizeRelPath(dirname(path) && !clean.includes('/') ? `${dirname(path)}/${clean}` : clean);
    } catch {
      pushToast({ kind: 'error', message: 'That link target is not a valid note path.' });
      return;
    }
    const notePath = /\.md$/i.test(relative) ? relative : `${relative}.md`;
    const result = await api.createEntry({ path: notePath, kind: 'file' });
    if (!result.ok) {
      pushToast({ kind: 'error', message: result.error.message });
      return;
    }
    handleVaultChanged({ tree: result.data.tree, links: result.data.links });
    await openNote(result.data.path);
  };

  const searchTag = (tag: string): void => {
    setActiveLeftView('search');
    requestSearch(`#${tag}`);
  };

  if (!path) {
    return <div className="sidebar-empty">Open a note to see links and properties.</div>;
  }

  return (
    <>
      <div className="panel-section">
        <div className="panel-heading">
          <Link2 size={12} />
          Backlinks
          <span className="count">{incoming.length}</span>
        </div>
        {incoming.length === 0 ? (
          <div className="sidebar-empty">
            No notes link here yet. Add <code>[[{noteTitle(path)}]]</code> elsewhere to see it
            listed.
          </div>
        ) : (
          incoming.map((entry) => (
            <button
              key={entry.path}
              type="button"
              className="backlink-item"
              title={entry.path}
              onClick={() => void openNote(entry.path)}
            >
              <span className="backlink-title">
                {noteTitle(entry.path)}
                {entry.count > 1 && <span className="muted"> · {entry.count} links</span>}
              </span>
              <span className="backlink-context">
                {contents[entry.path] !== undefined ? (
                  <Context text={contextSnippet(contents[entry.path], entry.target)} target={entry.target} />
                ) : (
                  <span className="faint">{basename(entry.path)} · loading context…</span>
                )}
              </span>
            </button>
          ))
        )}
      </div>

      <div className="panel-section">
        <div className="panel-heading">
          <Unlink size={12} />
          Unresolved links
          <span className="count">{unresolved.length}</span>
        </div>
        {unresolved.length === 0 ? (
          <div className="sidebar-empty">Every outgoing link resolves to a note.</div>
        ) : (
          unresolved.map((target) => (
            <div key={target} className="unresolved-row">
              <span className="unresolved-name" title={target}>
                {target}
              </span>
              <button
                type="button"
                className="button sm ghost"
                title={`Create ${target}`}
                onClick={() => void createNote(target)}
              >
                <FilePlus2 size={12} />
                Create
              </button>
            </div>
          ))
        )}
      </div>

      <div className="panel-section">
        <div className="panel-heading">
          <Hash size={12} />
          Tags
          <span className="count">{tags.length}</span>
        </div>
        {tags.length === 0 ? (
          <div className="sidebar-empty">
            No tags in this note. Type <code>#topic</code> or add <code>tags</code> to the
            frontmatter.
          </div>
        ) : (
          <div className="tag-list">
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                className="tag-chip"
                title={`Search #${tag}`}
                onClick={() => searchTag(tag)}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
