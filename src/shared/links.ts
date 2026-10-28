import {
  basename,
  dirname,
  isExternalLink,
  isMarkdownPath,
  noteTitle,
  relativeLinkPath,
  resolveRelativePath,
  shortestLinkTarget,
  stripExtension,
  toPosix,
} from './paths';

export interface ParsedWikilink {
  start: number;
  end: number;
  raw: string;
  embed: boolean;
  target: string;
  heading?: string;
  alias?: string;
}

export interface ParsedMarkdownLink {
  start: number;
  end: number;
  raw: string;
  embed: boolean;
  text: string;
  target: string;
  title?: string;
}

export interface ParsedTag {
  start: number;
  end: number;
  tag: string;
}

export interface ParsedHeading {
  level: number;
  text: string;
  line: number;
}

export interface ParsedLinks {
  wikilinks: ParsedWikilink[];
  markdownLinks: ParsedMarkdownLink[];
  tags: ParsedTag[];
  headings: ParsedHeading[];
}

const WIKILINK_RE = /(!?)\[\[([^[\]\n]+?)\]\]/g;
const MARKDOWN_LINK_RE =
  /(!?)\[([^\]\n]*)\]\((?:[ \t]*)(<[^>\n]*>|[^)\s]+)(?:[ \t]+"([^"]*)")?[ \t]*\)/g;
const TAG_RE = /(?<![\w/#\\])#([\p{L}_][\p{L}\p{N}_/-]*)/gu;

/** Replace fenced/inline code and frontmatter with spaces while preserving offsets. */
export function maskNonProse(markdown: string): string {
  const lines = markdown.split('\n');
  let inFence = false;
  let fenceChar = '';
  let fenceLength = 0;

  // Frontmatter
  let frontmatterEnd = -1;
  if (lines[0]?.trim() === '---') {
    for (let i = 1; i < lines.length; i += 1) {
      if (lines[i]?.trim() === '---') {
        frontmatterEnd = i;
        break;
      }
    }
  }

  const masked = lines.map((line, index) => {
    if (frontmatterEnd !== -1 && index <= frontmatterEnd) return ' '.repeat(line.length);
    const fence = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (!inFence && fence) {
      inFence = true;
      fenceChar = fence[1]![0]!;
      fenceLength = fence[1]!.length;
      return ' '.repeat(line.length);
    }
    if (inFence) {
      if (fence && fence[1]![0] === fenceChar && fence[1]!.length >= fenceLength) {
        inFence = false;
      }
      return ' '.repeat(line.length);
    }
    return line.replace(/`[^`\n]*`/g, (match) => ' '.repeat(match.length));
  });

  return masked.join('\n');
}

export function parseWikilinks(markdown: string): ParsedWikilink[] {
  const masked = maskNonProse(markdown);
  const links: ParsedWikilink[] = [];
  for (const match of masked.matchAll(WIKILINK_RE)) {
    const start = match.index ?? 0;
    if (start > 0 && masked[start - 1] === '\\') continue;
    const raw = markdown.slice(start, start + match[0].length);
    const body = match[2] ?? '';
    const pipe = body.indexOf('|');
    const left = pipe === -1 ? body : body.slice(0, pipe);
    const alias = pipe === -1 ? undefined : body.slice(pipe + 1).trim() || undefined;
    const hash = left.indexOf('#');
    const target = (hash === -1 ? left : left.slice(0, hash)).trim();
    const heading = hash === -1 ? undefined : left.slice(hash + 1).trim() || undefined;
    if (!target && !heading) continue;
    links.push({
      start,
      end: start + match[0].length,
      raw,
      embed: match[1] === '!',
      target,
      ...(heading ? { heading } : {}),
      ...(alias ? { alias } : {}),
    });
  }
  return links;
}

export function parseMarkdownLinks(markdown: string): ParsedMarkdownLink[] {
  const masked = maskNonProse(markdown);
  const links: ParsedMarkdownLink[] = [];
  for (const match of masked.matchAll(MARKDOWN_LINK_RE)) {
    const start = match.index ?? 0;
    if (start > 0 && masked[start - 1] === '\\') continue;
    const target = (match[3] ?? '').replace(/^<|>$/g, '');
    if (!target) continue;
    links.push({
      start,
      end: start + match[0].length,
      raw: markdown.slice(start, start + match[0].length),
      embed: match[1] === '!',
      text: match[2] ?? '',
      target,
      ...(match[4] ? { title: match[4] } : {}),
    });
  }
  return links;
}

export function parseTags(markdown: string): ParsedTag[] {
  const masked = maskNonProse(markdown);
  const tags: ParsedTag[] = [];
  for (const match of masked.matchAll(TAG_RE)) {
    const value = (match[1] ?? '').replace(/[/-]+$/, '');
    if (!value || value.includes('//')) continue;
    const start = (match.index ?? 0) + (match[0].length - (match[1]?.length ?? 0) - 1);
    tags.push({ start, end: start + value.length + 1, tag: value });
  }
  return tags;
}

export function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_full, target: string, alias?: string) => alias || target)
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_full, target: string, alias?: string) => alias || target)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`]+/g, '')
    .replace(/\\([\\`*_{}\[\]()#+\-.!|>])/g, '$1')
    .trim();
}

export function parseHeadings(markdown: string): ParsedHeading[] {
  const masked = maskNonProse(markdown);
  const lines = masked.split('\n');
  const headings: ParsedHeading[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const atx = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
    if (atx) {
      headings.push({
        level: atx[1]!.length,
        text: stripInlineMarkdown(atx[2] ?? ''),
        line: index + 1,
      });
      continue;
    }
    const next = lines[index + 1] ?? '';
    if (line.trim() && /^ {0,3}(=+|-+)[ \t]*$/.test(next)) {
      headings.push({
        level: next.trim().startsWith('=') ? 1 : 2,
        text: stripInlineMarkdown(line.trim()),
        line: index + 1,
      });
      index += 1;
    }
  }
  return headings;
}

export function parseLinks(markdown: string): ParsedLinks {
  return {
    wikilinks: parseWikilinks(markdown),
    markdownLinks: parseMarkdownLinks(markdown),
    tags: parseTags(markdown),
    headings: parseHeadings(markdown),
  };
}

export interface FileIndex {
  paths: string[];
  byLower: Map<string, string>;
  byBasename: Map<string, string[]>;
  byAlias: Map<string, string[]>;
}

export function buildFileIndex(paths: string[], aliases: Record<string, string[]> = {}): FileIndex {
  const byLower = new Map<string, string>();
  const byBasename = new Map<string, string[]>();
  const byAlias = new Map<string, string[]>();

  for (const path of paths) {
    const normalized = toPosix(path).replace(/^\/+/, '');
    byLower.set(normalized.toLowerCase(), normalized);
    const base = basename(normalized).toLowerCase();
    const list = byBasename.get(base) ?? [];
    list.push(normalized);
    byBasename.set(base, list);
  }

  for (const [path, values] of Object.entries(aliases)) {
    for (const alias of values) {
      const key = alias.trim().toLowerCase();
      if (!key) continue;
      const list = byAlias.get(key) ?? [];
      list.push(path);
      byAlias.set(key, list);
    }
  }

  return { paths: [...byLower.values()], byLower, byBasename, byAlias };
}

function pickBest(candidates: string[]): string | null {
  if (candidates.length === 0) return null;
  const sorted = [...new Set(candidates)].sort((a, b) => {
    const depth = a.split('/').length - b.split('/').length;
    if (depth !== 0) return depth;
    if (a.length !== b.length) return a.length - b.length;
    return a.localeCompare(b);
  });
  return sorted[0] ?? null;
}

function withMarkdownExtension(target: string): string {
  const clean = target.trim().replace(/^\/+/, '');
  if (!clean) return clean;
  return /\.[a-z0-9]{1,8}$/i.test(clean) ? clean : `${clean}.md`;
}

export function resolveWikilink(
  target: string,
  sourcePath: string,
  index: FileIndex,
): string | null {
  const trimmed = target.trim();
  if (!trimmed) return sourcePath;

  const aliasMatches = index.byAlias.get(trimmed.toLowerCase());
  if (aliasMatches?.length) return pickBest(aliasMatches);

  const relative = resolveRelativePath(sourcePath, trimmed);
  if (relative) {
    const relativeWithExt = withMarkdownExtension(relative);
    const direct = index.byLower.get(relativeWithExt.toLowerCase());
    if (direct) return direct;
  }

  const exact = index.byLower.get(withMarkdownExtension(trimmed).toLowerCase());
  if (exact) return exact;

  const wanted = withMarkdownExtension(trimmed).toLowerCase();
  const suffixMatches = index.paths.filter((path) => path.toLowerCase().endsWith(`/${wanted}`));
  if (suffixMatches.length) return pickBest(suffixMatches);

  const baseMatches = index.byBasename.get(basename(wanted));
  if (baseMatches?.length) return pickBest(baseMatches);

  return null;
}

export function resolveMarkdownTarget(
  target: string,
  sourcePath: string,
  index: FileIndex,
): string | null {
  if (isExternalLink(target)) return null;
  const withoutFragment = target.split('#')[0]?.split('?')[0] ?? '';
  if (!withoutFragment) return sourcePath;

  let decoded = withoutFragment;
  try {
    decoded = decodeURIComponent(withoutFragment);
  } catch {
    // keep the raw value when the URL encoding is malformed
  }

  const relative = resolveRelativePath(sourcePath, decoded);
  if (!relative) return null;
  const direct = index.byLower.get(relative.toLowerCase());
  if (direct) return direct;
  const withExt = withMarkdownExtension(relative);
  const extended = index.byLower.get(withExt.toLowerCase());
  if (extended) return extended;
  return resolveWikilink(decoded, sourcePath, index);
}

export interface LinkGraphInput {
  markdownPaths: string[];
  contents: Map<string, string>;
  allPaths?: string[];
  aliases?: Record<string, string[]>;
}

export interface LinkGraphEdge {
  from: string;
  target: string;
  to: string | null;
  embed: boolean;
  alias?: string;
  heading?: string;
}

export interface LinkGraphResult {
  nodes: Array<{ path: string; title: string; linkCount: number }>;
  edges: LinkGraphEdge[];
  unresolved: Array<{ from: string; target: string }>;
}

export function buildLinkGraph(input: LinkGraphInput): LinkGraphResult {
  const allPaths = input.allPaths ?? input.markdownPaths;
  const index = buildFileIndex(allPaths, input.aliases ?? {});
  const markdownSet = new Set(input.markdownPaths);
  const edges: LinkGraphEdge[] = [];
  const unresolved: Array<{ from: string; target: string }> = [];

  for (const from of input.markdownPaths) {
    const content = input.contents.get(from) ?? '';
    const parsed = parseLinks(content);

    for (const link of parsed.wikilinks) {
      if (!link.target) continue;
      const to = resolveWikilink(link.target, from, index);
      if (to && markdownSet.has(to)) {
        edges.push({
          from,
          target: link.target,
          to,
          embed: link.embed,
          ...(link.alias ? { alias: link.alias } : {}),
          ...(link.heading ? { heading: link.heading } : {}),
        });
      } else if (!to) {
        unresolved.push({ from, target: link.target });
      }
    }

    for (const link of parsed.markdownLinks) {
      if (isExternalLink(link.target)) continue;
      if (link.target.startsWith('#')) continue;
      const to = resolveMarkdownTarget(link.target, from, index);
      if (to && markdownSet.has(to)) {
        edges.push({
          from,
          target: link.target,
          to,
          embed: link.embed,
          ...(link.text ? { alias: link.text } : {}),
        });
      } else if (!to && isMarkdownPath(link.target)) {
        unresolved.push({ from, target: link.target });
      }
    }
  }

  const counts = new Map<string, number>();
  for (const edge of edges) {
    counts.set(edge.from, (counts.get(edge.from) ?? 0) + 1);
    if (edge.to) counts.set(edge.to, (counts.get(edge.to) ?? 0) + 1);
  }

  return {
    nodes: input.markdownPaths.map((path) => ({
      path,
      title: noteTitle(path),
      linkCount: counts.get(path) ?? 0,
    })),
    edges,
    unresolved,
  };
}

export interface RewriteOptions {
  /** Map of vault paths (before rename) to their new paths. */
  targetMap: Map<string, string>;
  sourcePath: string;
  index: FileIndex;
  allPaths: string[];
  useMarkdownLinks: boolean;
}

interface Replacement {
  start: number;
  end: number;
  text: string;
}

/** Rewrites links in one note whose resolved target appears in `targetMap`. */
export function rewriteLinks(content: string, options: RewriteOptions): { content: string; changed: number } {
  const replacements: Replacement[] = [];
  const rewrite = (resolved: string | null): string | null => {
    if (!resolved) return null;
    const next = options.targetMap.get(resolved);
    return next && next !== resolved ? next : null;
  };

  for (const link of parseWikilinks(content)) {
    const newPath = rewrite(resolveWikilink(link.target, options.sourcePath, options.index));
    if (!newPath) continue;
    if (options.useMarkdownLinks) {
      const label = link.alias ?? noteTitle(newPath);
      const href = relativeLinkPath(options.sourcePath, newPath);
      const heading = link.heading ? `#${link.heading}` : '';
      replacements.push({
        start: link.start,
        end: link.end,
        text: `${link.embed ? '!' : ''}[${label}](${href}${heading})`,
      });
      continue;
    }
    const newTarget = shortestLinkTarget(newPath, options.allPaths);
    const heading = link.heading ? `#${link.heading}` : '';
    const alias = link.alias ? `|${link.alias}` : '';
    replacements.push({
      start: link.start,
      end: link.end,
      text: `${link.embed ? '!' : ''}[[${newTarget}${heading}${alias}]]`,
    });
  }

  for (const link of parseMarkdownLinks(content)) {
    if (isExternalLink(link.target)) continue;
    const newPath = rewrite(resolveMarkdownTarget(link.target, options.sourcePath, options.index));
    if (!newPath) continue;
    const href = relativeLinkPath(options.sourcePath, newPath);
    const targetIndex = link.raw.indexOf(link.target);
    if (targetIndex === -1) continue;
    const absoluteStart = link.start + targetIndex;
    const replacementText = link.raw.slice(targetIndex).startsWith('<') ? `<${href}>` : href;
    replacements.push({ start: absoluteStart, end: absoluteStart + link.target.length, text: replacementText });
  }

  if (replacements.length === 0) return { content, changed: 0 };

  replacements.sort((a, b) => b.start - a.start);
  let next = content;
  let lastStart = Number.POSITIVE_INFINITY;
  for (const replacement of replacements) {
    if (replacement.end > lastStart) continue;
    next = next.slice(0, replacement.start) + replacement.text + next.slice(replacement.end);
    lastStart = replacement.start;
  }
  return { content: next, changed: replacements.length };
}

/** All links that resolve to a given path (for backlinks / rename previews). */
export function incomingLinks(
  targetPath: string,
  markdownPaths: string[],
  contents: Map<string, string>,
  allPaths?: string[],
  aliases: Record<string, string[]> = {},
): Array<{ from: string; target: string; embed: boolean }> {
  const index = buildFileIndex(allPaths ?? markdownPaths, aliases);
  const result: Array<{ from: string; target: string; embed: boolean }> = [];
  for (const from of markdownPaths) {
    if (from === targetPath) continue;
    const parsed = parseLinks(contents.get(from) ?? '');
    for (const link of parsed.wikilinks) {
      if (link.target && resolveWikilink(link.target, from, index) === targetPath) {
        result.push({ from, target: link.target, embed: link.embed });
      }
    }
    for (const link of parsed.markdownLinks) {
      if (link.target.startsWith('#')) continue;
      if (resolveMarkdownTarget(link.target, from, index) === targetPath) {
        result.push({ from, target: link.target, embed: link.embed });
      }
    }
  }
  return result;
}

export function tagsFromBody(content: string): string[] {
  return [...new Set(parseTags(content).map((tag) => tag.tag.toLowerCase()))];
}

export function outgoingUnresolved(
  content: string,
  sourcePath: string,
  allPaths: string[],
  aliases: Record<string, string[]> = {},
): string[] {
  const index = buildFileIndex(allPaths, aliases);
  const unresolved = new Set<string>();
  for (const link of parseWikilinks(content)) {
    if (link.target && !resolveWikilink(link.target, sourcePath, index)) unresolved.add(link.target);
  }
  for (const link of parseMarkdownLinks(content)) {
    if (isExternalLink(link.target) || link.target.startsWith('#')) continue;
    if (isMarkdownPath(link.target) && !resolveMarkdownTarget(link.target, sourcePath, index)) {
      unresolved.add(link.target);
    }
  }
  return [...unresolved];
}

export { dirname, stripExtension };
