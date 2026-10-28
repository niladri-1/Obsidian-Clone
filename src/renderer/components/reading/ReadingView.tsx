import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import clsx from 'clsx';
import { Columns2, Copy, ExternalLink, FilePlus2, Hash, Search } from 'lucide-react';
import { basename, noteTitle } from '@shared/paths';
import {
  frontmatterTags,
  parseFrontmatter,
} from '@shared/frontmatter';
import { parseTags } from '@shared/links';
import { useStore } from '../../store/useStore';
import { requestSearch } from '../../lib/bus';
import { toggleTaskInSource } from '../../lib/tasks';
import { absoluteVaultPath, copyText } from '../../lib/clipboard';
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu';
import {
  collectNoteEmbeds,
  renderMarkdown,
  slugifyHeading,
} from '../../lib/markdown';

interface ReadingViewProps {
  path: string;
  content: string;
}

const api = window.vaultApi;

type LinkMenuTarget =
  | { kind: 'note'; path: string; heading?: string }
  | { kind: 'attachment'; path: string }
  | { kind: 'external'; url: string }
  | { kind: 'tag'; tag: string }
  | { kind: 'unresolved'; raw: string };

interface LinkMenuState {
  x: number;
  y: number;
  target: LinkMenuTarget;
}

/** Finds the DOM node a `[[note#heading]]` or search reveal should scroll to. */
function findRevealTarget(
  root: HTMLElement,
  request: { heading?: string; text?: string; line?: number },
): HTMLElement | null {
  if (request.heading) {
    const slug = slugifyHeading(request.heading);
    const byId = root.querySelector<HTMLElement>(`#${CSS.escape(slug)}`);
    if (byId) return byId;
    const wanted = request.heading.trim().toLowerCase();
    for (const heading of root.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')) {
      const text = heading.textContent?.trim().toLowerCase() ?? '';
      if (text === wanted || text.includes(wanted)) return heading;
    }
  }
  if (request.text) {
    const wanted = request.text.trim().toLowerCase();
    if (wanted) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const text = node.textContent?.toLowerCase() ?? '';
        const index = text.indexOf(wanted);
        if (index !== -1) {
          const parent = node.parentElement;
          if (parent) return parent;
        }
        node = walker.nextNode();
      }
    }
  }
  return null;
}

export function ReadingView({ path, content }: ReadingViewProps) {
  const allPaths = useStore((state) => state.tree.files);
  const buffers = useStore((state) => state.buffers);
  const readableLineLength = useStore((state) => state.settings.vault.readableLineLength);
  const reveal = useStore((state) => state.ui.reveal);
  const clearReveal = useStore((state) => state.clearReveal);
  const openNote = useStore((state) => state.openNote);
  const setContent = useStore((state) => state.setContent);
  const saveNote = useStore((state) => state.saveNote);
  const pushToast = useStore((state) => state.pushToast);
  const setActiveLeftView = useStore((state) => state.setActiveLeftView);
  const openToSide = useStore((state) => state.openToSide);
  const vaultRoot = useStore((state) => state.vault?.path ?? '');
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const loadedRef = useRef<Record<string, string>>({});
  const [loaded, setLoaded] = useState<Record<string, string>>({});
  const [menu, setMenu] = useState<LinkMenuState | null>(null);
  const savedScroll = useRef<number | null>(buffers[path]?.scrollTop ?? null);
  const restored = useRef(false);

  const parsed = useMemo(() => parseFrontmatter(content), [content]);

  const getContent = (target: string): string | undefined =>
    buffers[target]?.content ?? loadedRef.current[target];

  const html = useMemo(
    () =>
      renderMarkdown(parsed.body, {
        sourcePath: path,
        allPaths,
        getContent,
      }),
    // `buffers` is intentionally part of the key: embedded notes render live content.
    [parsed.body, path, allPaths, buffers, loaded],
  );

  useEffect(() => {
    const context = { sourcePath: path, allPaths, getContent };
    const missing = collectNoteEmbeds(parsed.body, context).filter(
      (embed) => !(embed in loadedRef.current),
    );
    if (missing.length === 0) return;
    let cancelled = false;
    void Promise.all(
      missing.map(async (embed) => ({ embed, result: await api.readFile(embed) })),
    ).then((results) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const { embed, result } of results) {
        if (result.ok) next[embed] = result.data.content;
      }
      if (Object.keys(next).length === 0) return;
      loadedRef.current = { ...loadedRef.current, ...next };
      setLoaded(loadedRef.current);
    });
    return () => {
      cancelled = true;
    };
    // Embed membership is derived from the note body; buffer changes are handled by `html`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed.body, path, allPaths]);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll || restored.current) return;
    restored.current = true;
    const top = savedScroll.current;
    if (top) scroll.scrollTop = top;
  }, [html]);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    let frame = 0;
    const onScroll = (): void => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        useStore.getState().setScroll(path, scroll.scrollTop);
      });
    };
    scroll.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      scroll.removeEventListener('scroll', onScroll);
    };
  }, [path]);

  useEffect(() => {
    if (!reveal || reveal.path !== path) return;
    const root = bodyRef.current;
    const scroll = scrollRef.current;
    if (!root || !scroll) return;
    const target = findRevealTarget(root, reveal);
    if (target) {
      target.scrollIntoView({ block: 'center' });
    } else if (typeof reveal.line === 'number') {
      const lines = Math.max(1, parsed.body.split(/\r?\n/).length);
      const ratio = Math.min(1, Math.max(0, (reveal.line - 1) / lines));
      scroll.scrollTop = ratio * scroll.scrollHeight;
    }
    clearReveal(reveal.nonce);
  }, [reveal, path, html, parsed.body, clearReveal]);

  const tags = useMemo(() => {
    const values = new Set<string>();
    for (const tag of parseTags(parsed.body)) values.add(tag.tag);
    for (const tag of frontmatterTags(parsed.data)) values.add(tag);
    return [...values].sort((a, b) => a.localeCompare(b)).slice(0, 12);
  }, [parsed.body, parsed.data]);

  const onClick = (event: MouseEvent<HTMLDivElement>): void => {
    const element = event.target as HTMLElement;
    const copy = element.closest<HTMLElement>('.code-copy');
    if (copy) {
      event.preventDefault();
      const code = copy.dataset.code ?? '';
      void navigator.clipboard
        .writeText(code)
        .then(() => pushToast({ kind: 'success', message: 'Code copied.' }))
        .catch(() => pushToast({ kind: 'error', message: 'Clipboard access was denied.' }));
      return;
    }

    const checkbox = element.closest<HTMLInputElement>('input.task-list-item-checkbox');
    if (checkbox) {
      event.preventDefault();
      const index = Number(checkbox.dataset.taskIndex);
      const buffer = useStore.getState().buffers[path];
      if (!buffer || !Number.isInteger(index)) return;
      const next = toggleTaskInSource(buffer.content, index);
      if (!next.changed) {
        pushToast({ kind: 'info', message: 'This task could not be located in the source.' });
        return;
      }
      setContent(path, next.content);
      void saveNote(path);
      return;
    }

    const anchor = element.closest<HTMLAnchorElement>('a');
    if (!anchor) return;

    const file = anchor.dataset.vaultFile;
    if (file) {
      event.preventDefault();
      void api.reveal(file).then((result) => {
        if (!result.ok) pushToast({ kind: 'error', message: result.error.message });
        else pushToast({ kind: 'info', message: 'Attachment revealed in the file manager.' });
      });
      return;
    }

    const target = anchor.dataset.target ?? anchor.dataset.vaultPath;
    if (target) {
      event.preventDefault();
      void openNote(
        target,
        anchor.dataset.heading ? { revealHeading: anchor.dataset.heading } : {},
      );
      return;
    }

    const raw = anchor.dataset.raw;
    if (raw !== undefined) {
      event.preventDefault();
      pushToast({ kind: 'info', message: `No note matches “${raw}”.` });
      return;
    }

    const tag = anchor.dataset.tag;
    if (tag) {
      event.preventDefault();
      setActiveLeftView('search');
      requestSearch(`#${tag}`);
      return;
    }

    const href = anchor.getAttribute('href') ?? '';
    if (href.startsWith('#')) {
      event.preventDefault();
      const id = decodeURIComponent(href.slice(1));
      const targetNode =
        bodyRef.current?.querySelector<HTMLElement>(`#${CSS.escape(id)}`) ??
        document.getElementById(id);
      targetNode?.scrollIntoView({ block: 'start' });
    }
  };

  const onContextMenu = (event: MouseEvent<HTMLDivElement>): void => {
    const element = event.target as HTMLElement;
    const anchor = element.closest<HTMLAnchorElement>('a');
    if (!anchor) return;
    const notePath = anchor.dataset.target ?? anchor.dataset.vaultPath;
    const attachment = anchor.dataset.vaultFile;
    const tag = anchor.dataset.tag;
    const raw = anchor.dataset.raw;
    const href = anchor.getAttribute('href') ?? '';
    let target: LinkMenuTarget | null = null;
    if (notePath) target = { kind: 'note', path: notePath, heading: anchor.dataset.heading };
    else if (attachment) target = { kind: 'attachment', path: attachment };
    else if (tag) target = { kind: 'tag', tag };
    else if (raw !== undefined) target = { kind: 'unresolved', raw };
    else if (/^(?:https?|mailto|tel):/i.test(href)) target = { kind: 'external', url: href };
    if (!target) return;
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, target });
  };

  const copyToClipboard = (text: string, label: string): void => {
    void copyText(text).then((copied) =>
      pushToast(
        copied
          ? { kind: 'success', message: `${label} copied.` }
          : { kind: 'error', message: 'Clipboard access was denied.' },
      ),
    );
  };

  const revealEntry = (relative: string): void => {
    void api.reveal(relative).then((result) => {
      if (!result.ok) pushToast({ kind: 'error', message: result.error.message });
      else pushToast({ kind: 'info', message: 'Revealed in the system file manager.' });
    });
  };

  const buildLinkMenuItems = (target: LinkMenuTarget): ContextMenuItem[] => {
    if (target.kind === 'note') {
      const notePath = target.path;
      const heading = target.heading;
      return [
        {
          label: 'Open',
          icon: <FilePlus2 size={14} />,
          onSelect: () => void openNote(notePath, heading ? { revealHeading: heading } : {}),
        },
        {
          label: 'Open in new tab',
          icon: <FilePlus2 size={14} />,
          onSelect: () => void openNote(notePath, { newTab: true }),
        },
        {
          label: 'Open to the right',
          icon: <Columns2 size={14} />,
          onSelect: () => void openToSide(notePath, 'vertical'),
        },
        {
          label: 'Copy path',
          icon: <Copy size={14} />,
          separatorBefore: true,
          onSelect: () => copyToClipboard(absoluteVaultPath(vaultRoot, notePath), 'Path'),
        },
        {
          label: 'Copy vault-relative path',
          onSelect: () => copyToClipboard(notePath, 'Relative path'),
        },
        {
          label: 'Show in system explorer',
          icon: <ExternalLink size={14} />,
          onSelect: () => revealEntry(notePath),
        },
      ];
    }
    if (target.kind === 'attachment') {
      const filePath = target.path;
      return [
        {
          label: 'Open attachment',
          icon: <ExternalLink size={14} />,
          onSelect: () => revealEntry(filePath),
        },
        {
          label: 'Copy path',
          icon: <Copy size={14} />,
          separatorBefore: true,
          onSelect: () => copyToClipboard(absoluteVaultPath(vaultRoot, filePath), 'Path'),
        },
        {
          label: 'Copy file name',
          onSelect: () => copyToClipboard(basename(filePath), 'File name'),
        },
        {
          label: 'Show in system explorer',
          icon: <ExternalLink size={14} />,
          onSelect: () => revealEntry(filePath),
        },
      ];
    }
    if (target.kind === 'external') {
      const url = target.url;
      return [
        {
          label: 'Open in browser',
          icon: <ExternalLink size={14} />,
          onSelect: () => void api.openExternal(url),
        },
        {
          label: 'Copy URL',
          icon: <Copy size={14} />,
          onSelect: () => copyToClipboard(url, 'URL'),
        },
      ];
    }
    if (target.kind === 'tag') {
      const tag = target.tag;
      return [
        {
          label: `Search for #${tag}`,
          icon: <Search size={14} />,
          onSelect: () => {
            setActiveLeftView('search');
            requestSearch(`#${tag}`);
          },
        },
        {
          label: 'Copy tag',
          icon: <Copy size={14} />,
          onSelect: () => copyToClipboard(`#${tag}`, 'Tag'),
        },
      ];
    }
    const raw = target.raw;
    return [
      {
        label: 'Copy link text',
        icon: <Copy size={14} />,
        onSelect: () => copyToClipboard(raw, 'Link text'),
      },
    ];
  };

  const linkMenuItems: ContextMenuItem[] = menu ? buildLinkMenuItems(menu.target) : [];

  return (
    <>
    <div ref={scrollRef} className="reading-scroll">
      <div
        className={clsx('reading-inner', readableLineLength && 'is-readable')}
        data-note-path={path}
      >
        <h1 className="reading-title">{noteTitle(path)}</h1>
        <div className="reading-meta">
          <span>{path}</span>
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              className="tag-chip"
              title={`Search for #${tag}`}
              onClick={() => {
                setActiveLeftView('search');
                requestSearch(`#${tag}`);
              }}
            >
              <Hash size={10} />
              {tag}
            </button>
          ))}
        </div>
        <div
          ref={bodyRef}
          className="markdown-body"
          onClick={onClick}
          onContextMenu={onContextMenu}
          // The HTML is produced by markdown-it and then sanitised by DOMPurify in
          // `renderMarkdown`; scripts, event handlers and unsafe URLs are removed there.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
    {menu && (
      <ContextMenu
        x={menu.x}
        y={menu.y}
        items={linkMenuItems}
        onClose={() => setMenu(null)}
        ariaLabel="Link actions"
      />
    )}
    </>
  );
}
