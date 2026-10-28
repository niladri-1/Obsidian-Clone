import MarkdownIt, { type StateCore, type StateInline } from 'markdown-it';
import anchor from 'markdown-it-anchor';
import footnote from 'markdown-it-footnote';
import taskLists from 'markdown-it-task-lists';
import hljs from 'highlight.js';
import DOMPurify from 'dompurify';
import {
  buildFileIndex,
  parseWikilinks,
  resolveMarkdownTarget,
  resolveWikilink,
  type FileIndex,
} from '@shared/links';
import {
  basename,
  isAttachmentPath,
  isExternalLink,
  isImagePath,
  isMarkdownPath,
  noteTitle,
  toVaultFileUrl,
} from '@shared/paths';
import { parseFrontmatter } from '@shared/frontmatter';

export interface MarkdownContext {
  sourcePath: string;
  allPaths: string[];
  getContent: (path: string) => string | undefined;
}

const SAFE_PROTOCOLS = /^(?:(?:https?|mailto|tel|vaultfile):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

let hooksInstalled = false;

function installSanitizerHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') ?? '';
      if (/^(?:https?|mailto|tel):/i.test(href)) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noreferrer noopener');
      }
      if (href === '#') node.setAttribute('rel', 'nofollow');
    }
    if (node.tagName === 'IMG') {
      node.setAttribute('referrerpolicy', 'no-referrer');
    }
  });
}

const SANITIZE_CONFIG = {
  ADD_ATTR: [
    'target',
    'rel',
    'loading',
    'checked',
    'disabled',
    'type',
    'data-target',
    'data-raw',
    'data-heading',
    'data-alias',
    'data-tag',
    'data-vault-path',
    'data-vault-file',
    'data-task-index',
    'data-code',
    'data-callout',
  ],
  FORBID_TAGS: [
    'style',
    'script',
    'iframe',
    'object',
    'embed',
    'form',
    'link',
    'meta',
    'base',
    'svg',
    'math',
  ],
  FORBID_ATTR: ['style', 'srcset', 'formaction'],
  ALLOWED_URI_REGEXP: SAFE_PROTOCOLS,
  KEEP_CONTENT: true,
};

export function sanitizeHtml(html: string): string {
  installSanitizerHooks();
  return DOMPurify.sanitize(html, SANITIZE_CONFIG) as unknown as string;
}

export function slugifyHeading(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'section';
}

interface WikiParts {
  target: string;
  heading?: string;
  alias?: string;
}

export function parseWikilinkBody(body: string): WikiParts {
  const pipe = body.indexOf('|');
  const left = pipe === -1 ? body : body.slice(0, pipe);
  const alias = pipe === -1 ? undefined : body.slice(pipe + 1).trim() || undefined;
  const hash = left.indexOf('#');
  const target = (hash === -1 ? left : left.slice(0, hash)).trim();
  const heading = hash === -1 ? undefined : left.slice(hash + 1).trim() || undefined;
  return { target, ...(heading ? { heading } : {}), ...(alias ? { alias } : {}) };
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function displayFor(parts: WikiParts, resolved: string | null): string {
  if (parts.alias) return parts.alias;
  if (resolved) return noteTitle(resolved);
  if (parts.target) return noteTitle(parts.target);
  return parts.heading ?? 'note';
}

function resolveAttachment(target: string, sourcePath: string, index: FileIndex): string | null {
  if (!target) return null;
  const resolved = resolveWikilink(target, sourcePath, index);
  if (resolved) return resolved;
  const base = basename(target).toLowerCase();
  return index.byBasename.get(base)?.[0] ?? null;
}

function wikilinkHtml(parts: WikiParts, context: MarkdownContext, index: FileIndex): string {
  const resolved =
    parts.target || parts.heading
      ? resolveWikilink(parts.target, context.sourcePath, index)
      : null;
  const label = displayFor(parts, resolved);
  const heading = parts.heading ? ` data-heading="${escape(parts.heading)}"` : '';
  const alias = parts.alias ? ` data-alias="${escape(parts.alias)}"` : '';
  const raw = escape(parts.target || parts.heading || '');

  if (resolved && isMarkdownPath(resolved)) {
    return `<a class="wikilink" href="#" data-target="${escape(resolved)}"${heading}${alias}>${escape(label)}</a>`;
  }
  if (resolved && isAttachmentPath(resolved)) {
    return `<a class="wikilink attachment" href="#" data-vault-file="${escape(resolved)}"${alias}>${escape(label)}</a>`;
  }
  return `<a class="wikilink is-unresolved" href="#" data-raw="${raw}"${heading}${alias}>${escape(label)}</a>`;
}

function embedHtml(
  parts: WikiParts,
  context: MarkdownContext,
  index: FileIndex,
  depth: number,
  seen: Set<string>,
): string {
  const resolved = resolveAttachment(parts.target, context.sourcePath, index);
  const label = displayFor(parts, resolved);

  if (!resolved) {
    return `<span class="wiki-embed is-unresolved" data-raw="${escape(parts.target || parts.heading || '')}">![[${escape(
      parts.target || parts.heading || '',
    )}]]</span>`;
  }

  if (isImagePath(resolved)) {
    return `<img class="embed-image" src="${escape(toVaultFileUrl(resolved))}" alt="${escape(
      parts.alias ?? noteTitle(resolved),
    )}" loading="lazy">`;
  }
  if (isAttachmentPath(resolved)) {
    return `<a class="attachment note-embed-file" href="#" data-vault-file="${escape(
      resolved,
    )}">${escape(label)}</a>`;
  }
  if (!isMarkdownPath(resolved)) return escape(label);

  const content = context.getContent(resolved);
  if (depth >= 1 || seen.has(resolved) || content === undefined) {
    return `<a class="wikilink note-embed-link" href="#" data-target="${escape(resolved)}">${escape(
      label,
    )}</a>`;
  }

  const parsed = parseFrontmatter(content);
  const nextSeen = new Set(seen);
  nextSeen.add(resolved);
  const html = renderInternal(parsed.body, { ...context, sourcePath: resolved }, index, depth + 1, nextSeen);
  return `<span class="note-embed" data-target="${escape(resolved)}"><span class="note-embed-title">${escape(
    noteTitle(resolved),
  )}</span><span class="note-embed-body">${html}</span></span>`;
}

function indexTaskCheckboxes(html: string): string {
  let index = 0;
  return html.replace(/<input\b[^>]*class="task-list-item-checkbox"[^>]*>/g, (match) =>
    match.replace(/>$/, ` data-task-index="${index++}">`),
  );
}

function createMarkdown(
  context: MarkdownContext,
  index: FileIndex,
  depth: number,
  seen: Set<string>,
): MarkdownIt {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    breaks: false,
    typographer: false,
  });

  md.use(anchor, {
    level: [1, 2, 3, 4, 5, 6],
    slugify: slugifyHeading,
    uniqueSlugStartIndex: 2,
    tabIndex: false,
  });
  md.use(footnote);
  md.use(taskLists, { enabled: true, label: true, labelAfter: true });

  md.inline.ruler.before('image', 'vault_embed', (state: StateInline, silent: boolean) => {
    const start = state.pos;
    if (state.src.charCodeAt(start) !== 0x21) return false;
    if (state.src.charCodeAt(start + 1) !== 0x5b || state.src.charCodeAt(start + 2) !== 0x5b) {
      return false;
    }
    if (start > 0 && state.src.charCodeAt(start - 1) === 0x5c) return false;
    const end = state.src.indexOf(']]', start + 3);
    if (end === -1) return false;
    const body = state.src.slice(start + 3, end);
    if (!body || body.includes('\n') || body.includes('[[')) return false;
    if (!silent) {
      const token = state.push('vault_embed', '', 0);
      token.content = embedHtml(parseWikilinkBody(body), context, index, depth, seen);
    }
    state.pos = end + 2;
    return true;
  });

  md.inline.ruler.before('link', 'vault_wikilink', (state: StateInline, silent: boolean) => {
    const start = state.pos;
    if (state.src.charCodeAt(start) !== 0x5b) return false;
    if (state.src.charCodeAt(start - 1) === 0x21) return false;
    if (state.src.charCodeAt(start + 1) !== 0x5b) return false;
    if (start > 0 && state.src.charCodeAt(start - 1) === 0x5c) return false;
    const end = state.src.indexOf(']]', start + 2);
    if (end === -1) return false;
    const body = state.src.slice(start + 2, end);
    if (!body || body.includes('\n') || body.includes('[[')) return false;
    if (!silent) {
      const token = state.push('vault_wikilink', '', 0);
      token.content = wikilinkHtml(parseWikilinkBody(body), context, index);
    }
    state.pos = end + 2;
    return true;
  });

  md.inline.ruler.before('link', 'vault_tag', (state: StateInline, silent: boolean) => {
    const start = state.pos;
    if (state.src.charCodeAt(start) !== 0x23) return false;
    if (start > 0) {
      const previous = state.src[start - 1]!;
      if (!/[\s([{>'"]/.test(previous)) return false;
    }
    const match = /^#([\p{L}_][\p{L}\p{N}_/-]*)/u.exec(state.src.slice(start));
    if (!match) return false;
    const tag = (match[1] ?? '').replace(/[/-]+$/, '');
    if (!tag || tag.includes('//')) return false;
    if (!silent) {
      const token = state.push('vault_tag', '', 0);
      token.content = `<a class="tag" href="#" data-tag="${escape(tag)}">#${escape(tag)}</a>`;
    }
    state.pos = start + 1 + tag.length;
    return true;
  });

  md.renderer.rules.vault_wikilink = (tokens, idx) => tokens[idx]?.content ?? '';
  md.renderer.rules.vault_embed = (tokens, idx) => tokens[idx]?.content ?? '';
  md.renderer.rules.vault_tag = (tokens, idx) => tokens[idx]?.content ?? '';

  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx]!;
    const info = token.info.trim().split(/\s+/)[0] ?? '';
    const language = info || 'text';
    let highlighted: string;
    if (info && hljs.getLanguage(info)) {
      try {
        highlighted = hljs.highlight(token.content, { language: info, ignoreIllegals: true }).value;
      } catch {
        highlighted = md.utils.escapeHtml(token.content);
      }
    } else {
      highlighted = md.utils.escapeHtml(token.content);
    }
    const languageClass = info ? ` language-${escape(info)}` : '';
    return [
      '<div class="code-block">',
      `<div class="code-head"><span class="code-lang">${escape(language)}</span>`,
      `<button type="button" class="code-copy" data-code="${escape(token.content)}">Copy</button></div>`,
      `<pre class="hljs"><code class="hljs${languageClass}">${highlighted}</code></pre>`,
      '</div>',
    ].join('');
  };

  md.renderer.rules.image = (tokens, idx, options, _env, self) => {
    const token = tokens[idx]!;
    const raw = token.attrGet('src') ?? '';
    const alt = token.content;
    if (isExternalLink(raw)) {
      return `<span class="blocked-image">External image blocked: ${escape(alt || raw)}</span>`;
    }
    const resolved = resolveMarkdownTarget(raw, context.sourcePath, index);
    if (resolved && isImagePath(resolved)) {
      token.attrSet('src', toVaultFileUrl(resolved));
      token.attrSet('class', 'md-image');
      token.attrSet('loading', 'lazy');
      token.attrSet('alt', alt);
      return self.renderToken(tokens, idx, options);
    }
    return `<span class="blocked-image">Image not found: ${escape(alt || raw)}</span>`;
  };

  // Resolve standard markdown links relative to the current note and mark external links.
  md.core.ruler.after('linkify', 'vault_links', (state: StateCore) => {
    for (const blockToken of state.tokens) {
      if (blockToken.type !== 'inline' || !blockToken.children) continue;
      for (const token of blockToken.children) {
        if (token.type !== 'link_open') continue;
        const href = token.attrGet('href') ?? '';
        if (!href) continue;
        if (isExternalLink(href)) {
          token.attrSet('target', '_blank');
          token.attrSet('rel', 'noreferrer noopener');
          token.attrJoin('class', 'external-link');
          continue;
        }
        if (href.startsWith('#')) {
          token.attrJoin('class', 'internal-anchor');
          continue;
        }
        const resolved = resolveMarkdownTarget(href, context.sourcePath, index);
        if (!resolved) continue;
        if (isMarkdownPath(resolved)) {
          token.attrSet('href', '#');
          token.attrSet('data-vault-path', resolved);
          token.attrJoin('class', 'wikilink');
        } else if (isAttachmentPath(resolved)) {
          token.attrSet('href', '#');
          token.attrSet('data-vault-file', resolved);
          token.attrJoin('class', 'attachment');
        }
      }
    }
  });

  // Callouts: transform the first paragraph of a blockquote that starts with `[!type]`.
  md.core.ruler.after('inline', 'vault_callouts', (state: StateCore) => {
    const tokens = state.tokens;
    for (let indexToken = 0; indexToken < tokens.length; indexToken += 1) {
      const open = tokens[indexToken]!;
      if (open.type !== 'blockquote_open') continue;
      const inline = tokens[indexToken + 2];
      if (!inline || inline.type !== 'inline' || !inline.children) continue;
      const match = /^\[!([\w-]+)\]([+-]?)[ \t]*(.*)(?:\n|$)/.exec(inline.content);
      if (!match) continue;
      const type = (match[1] ?? 'note').toLowerCase();
      const collapse = match[2] ?? '';
      const title = match[3] ?? '';
      open.attrJoin('class', `callout callout-${type}`);
      open.attrSet('data-callout', type);
      if (collapse) {
        open.attrJoin('class', 'is-collapsible');
        if (collapse === '-') open.attrJoin('class', 'is-collapsed');
      }
      const remainder = inline.content.slice(match[0].length).trim();
      inline.content = remainder;
      inline.children = [];
      if (remainder) {
        state.md.inline.parse(remainder, state.md, state.env, inline.children);
      }
      if (title) {
        const titleToken = new state.Token('html_inline', '', 0);
        titleToken.content = `<span class="callout-title">${state.md.utils.escapeHtml(title)}</span>`;
        inline.children.unshift(titleToken);
      }
    }
  });

  return md;
}

function renderInternal(
  source: string,
  context: MarkdownContext,
  index: FileIndex,
  depth: number,
  seen: Set<string>,
): string {
  const md = createMarkdown(context, index, depth, seen);
  const html = md.render(source);
  return indexTaskCheckboxes(html);
}

export function renderMarkdown(source: string, context: MarkdownContext): string {
  const index = buildFileIndex(context.allPaths);
  const html = renderInternal(source, context, index, 0, new Set([context.sourcePath]));
  return sanitizeHtml(html);
}

/** Wiki-embedded notes that must be read before the reading view can transclude them. */
export function collectNoteEmbeds(source: string, context: MarkdownContext): string[] {
  const index = buildFileIndex(context.allPaths);
  const paths = new Set<string>();
  for (const link of parseWikilinks(source)) {
    if (!link.embed) continue;
    const resolved = resolveAttachment(link.target, context.sourcePath, index);
    if (resolved && isMarkdownPath(resolved) && context.getContent(resolved) === undefined) {
      paths.add(resolved);
    }
  }
  return [...paths];
}

/** Outgoing unresolved link targets, used by the backlinks panel. */
export function unresolvedTargets(source: string, context: MarkdownContext): string[] {
  const index = buildFileIndex(context.allPaths);
  const unresolved = new Set<string>();
  for (const link of parseWikilinks(source)) {
    if (link.target && !resolveWikilink(link.target, context.sourcePath, index)) {
      unresolved.add(link.target);
    }
  }
  return [...unresolved];
}
