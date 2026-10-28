import MiniSearch, { type SearchResult as MiniSearchResult } from 'minisearch';
import matter from 'gray-matter';
import { LIMITS } from '../../shared/ipc';
import { parseHeadings, parseTags } from '../../shared/links';
import { noteTitle } from '../../shared/paths';
import type { SearchOptions, SearchResponse, SearchResult } from '../../shared/types';

interface NoteDoc {
  id: string;
  path: string;
  title: string;
  headings: string;
  tags: string;
  aliases: string;
  body: string;
}

const MAX_BODY_INDEX = 200_000;

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function documentFor(path: string, content: string, extraAliases: string[] = []): NoteDoc {
  let body = content;
  let data: Record<string, unknown> = {};
  try {
    const parsed = matter(content);
    body = parsed.content;
    data = parsed.data as Record<string, unknown>;
  } catch {
    // A malformed frontmatter block must not make the note unindexable.
  }

  const tags = new Set(parseTags(body).map((tag) => tag.tag.toLowerCase()));
  for (const tag of toStringArray(data.tags ?? data.tag)) {
    tags.add(tag.replace(/^#/, '').toLowerCase());
  }

  const aliases = new Set([...toStringArray(data.aliases ?? data.alias), ...extraAliases]);

  return {
    id: path,
    path,
    title: noteTitle(path),
    headings: parseHeadings(body)
      .map((heading) => heading.text)
      .join(' '),
    tags: [...tags].join(' '),
    aliases: [...aliases].join(' '),
    body: body.slice(0, MAX_BODY_INDEX),
  };
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeSnippet(
  haystack: string,
  needle: string,
  caseSensitive: boolean,
): { snippet: string; start: number; length: number } {
  const clean = normalizeWhitespace(haystack);
  const source = caseSensitive ? clean : clean.toLowerCase();
  const target = caseSensitive ? needle : needle.toLowerCase();
  let index = target ? source.indexOf(target) : -1;
  if (index === -1) {
    const firstToken = (needle.split(/\s+/)[0] ?? '').trim();
    if (firstToken) {
      index = source.indexOf(caseSensitive ? firstToken : firstToken.toLowerCase());
    }
  }
  if (index === -1) {
    return { snippet: clean.slice(0, 180), start: 0, length: 0 };
  }
  const from = Math.max(0, index - 60);
  const to = Math.min(clean.length, index + Math.max(needle.length, 1) + 90);
  const prefix = from > 0 ? '…' : '';
  const suffix = to < clean.length ? '…' : '';
  return {
    snippet: prefix + clean.slice(from, to) + suffix,
    start: index - from + prefix.length,
    length: Math.max(needle.length, 1),
  };
}

export class SearchIndex {
  private mini = new MiniSearch<NoteDoc>({
    idField: 'id',
    fields: ['title', 'headings', 'tags', 'aliases', 'body'],
    storeFields: ['path', 'title'],
    searchOptions: {
      boost: { title: 4, headings: 2, tags: 2, aliases: 3, body: 1 },
      prefix: true,
      fuzzy: 0.15,
      combineWith: 'OR',
    },
  });

  private docs = new Map<string, NoteDoc>();

  get size(): number {
    return this.docs.size;
  }

  rebuild(contents: Map<string, string>, aliases: Record<string, string[]> = {}): void {
    this.mini = new MiniSearch<NoteDoc>({
      idField: 'id',
      fields: ['title', 'headings', 'tags', 'aliases', 'body'],
      storeFields: ['path', 'title'],
      searchOptions: {
        boost: { title: 4, headings: 2, tags: 2, aliases: 3, body: 1 },
        prefix: true,
        fuzzy: 0.15,
        combineWith: 'OR',
      },
    });
    this.docs.clear();
    const batch: NoteDoc[] = [];
    for (const [path, content] of contents) {
      const doc = documentFor(path, content, aliases[path] ?? []);
      this.docs.set(path, doc);
      batch.push(doc);
    }
    if (batch.length) this.mini.addAll(batch);
  }

  update(path: string, content: string, aliases: string[] = []): void {
    const existing = this.docs.get(path);
    if (existing) {
      try {
        this.mini.remove(existing);
      } catch {
        // index may have been rebuilt concurrently
      }
    }
    const doc = documentFor(path, content, aliases);
    this.docs.set(path, doc);
    try {
      this.mini.add(doc);
    } catch {
      // duplicate ids are ignored
    }
  }

  remove(path: string): void {
    const existing = this.docs.get(path);
    if (!existing) return;
    try {
      this.mini.remove(existing);
    } catch {
      // ignore
    }
    this.docs.delete(path);
  }

  getBody(path: string): string {
    return this.docs.get(path)?.body ?? '';
  }

  query(options: SearchOptions): SearchResponse {
    const started = performance.now();
    const query = (options.query ?? '').slice(0, LIMITS.maxQueryLength).trim();
    const limit = Math.min(Math.max(options.limit ?? 40, 1), LIMITS.maxSearchResults);

    if (!query) {
      return { results: [], total: 0, tookMs: Math.round(performance.now() - started) };
    }

    if (options.regex || options.caseSensitive || options.wholeWord) {
      return this.scan(query, options, limit, started);
    }

    const raw: MiniSearchResult[] = this.mini.search(query);
    const results: SearchResult[] = [];
    for (const hit of raw) {
      const doc = this.docs.get(String(hit.id));
      if (!doc) continue;
      const combined = `${doc.title}\n${doc.headings}\n${doc.body}`;
      const snippet = makeSnippet(combined, query, false);
      results.push({
        path: doc.path,
        title: doc.title,
        score: hit.score,
        snippet: snippet.snippet,
        matchStart: snippet.start,
        matchLength: snippet.length,
      });
      if (results.length >= limit) break;
    }

    return {
      results,
      total: raw.length,
      tookMs: Math.round(performance.now() - started),
    };
  }

  private scan(
    query: string,
    options: SearchOptions,
    limit: number,
    started: number,
  ): SearchResponse {
    let matcher: (text: string) => number;
    if (options.regex) {
      let regex: RegExp;
      try {
        regex = new RegExp(query, options.caseSensitive ? '' : 'i');
      } catch (error) {
        return {
          results: [],
          total: 0,
          tookMs: Math.round(performance.now() - started),
          error: `Invalid regular expression: ${(error as Error).message}`,
        };
      }
      matcher = (text: string) => {
        regex.lastIndex = 0;
        const match = regex.exec(text);
        return match && match.index >= 0 ? match.index : -1;
      };
    } else {
      const tokens = query.split(/\s+/).filter(Boolean).slice(0, 8);
      const wholeWordPatterns = options.wholeWord
        ? tokens.map(
            (token) =>
              new RegExp(
                `(?<![\\p{L}\\p{N}_])${escapeRegExp(token)}(?![\\p{L}\\p{N}_])`,
                options.caseSensitive ? 'gu' : 'giu',
              ),
          )
        : null;
      matcher = (text: string) => {
        const haystack = options.caseSensitive ? text : text.toLowerCase();
        let earliest = -1;
        for (let indexToken = 0; indexToken < tokens.length; indexToken += 1) {
          const token = tokens[indexToken]!;
          const needle = options.caseSensitive ? token : token.toLowerCase();
          let index: number;
          if (wholeWordPatterns) {
            const pattern = wholeWordPatterns[indexToken]!;
            pattern.lastIndex = 0;
            const match = pattern.exec(text);
            index = match?.index ?? -1;
          } else {
            index = haystack.indexOf(needle);
          }
          if (index === -1) return -1;
          if (earliest === -1 || index < earliest) earliest = index;
        }
        return earliest;
      };
    }

    const results: SearchResult[] = [];
    for (const doc of this.docs.values()) {
      const titleIndex = matcher(doc.title);
      const bodyIndex = matcher(`${doc.headings} ${doc.body}`);
      if (titleIndex === -1 && bodyIndex === -1) continue;
      const snippet = makeSnippet(
        bodyIndex === -1 ? doc.title : `${doc.headings}\n${doc.body}`,
        query,
        options.caseSensitive ?? false,
      );
      results.push({
        path: doc.path,
        title: doc.title,
        score: (titleIndex === -1 ? 0 : 10) + (bodyIndex === -1 ? 0 : 1),
        snippet: snippet.snippet,
        matchStart: snippet.start,
        matchLength: snippet.length,
      });
    }

    results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
    return {
      results: results.slice(0, limit),
      total: results.length,
      tookMs: Math.round(performance.now() - started),
    };
  }
}
