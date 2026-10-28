import { describe, expect, it } from 'vitest';
import {
  buildFileIndex,
  buildLinkGraph,
  incomingLinks,
  maskNonProse,
  outgoingUnresolved,
  parseHeadings,
  parseMarkdownLinks,
  parseTags,
  parseWikilinks,
  resolveMarkdownTarget,
  resolveWikilink,
  rewriteLinks,
  tagsFromBody,
} from '../src/shared/links';
import { relativeLinkPath, shortestLinkTarget } from '../src/shared/paths';

const paths = ['alias.md', 'notes/a.md', 'notes/b.md', 'other/a.md', 'x/y/deep.md'];

describe('wikilink parsing', () => {
  it('parses targets, aliases, headings, embeds and offsets', () => {
    const source = '[[a]] [[a|Alias]] [[a#H]] ![[img.png]] [[a#H|Alias]]';
    const links = parseWikilinks(source);
    expect(links).toHaveLength(5);
    expect(links[0]).toMatchObject({ target: 'a', embed: false });
    expect(links[1]).toMatchObject({ target: 'a', alias: 'Alias' });
    expect(links[2]).toMatchObject({ target: 'a', heading: 'H' });
    expect(links[3]).toMatchObject({ target: 'img.png', embed: true });
    expect(links[4]).toMatchObject({ target: 'a', heading: 'H', alias: 'Alias' });
    for (const link of links) {
      expect(source.slice(link.start, link.end)).toBe(link.raw);
    }
  });

  it('ignores wikilinks inside frontmatter, code and escaped brackets', () => {
    const source = [
      '---',
      'link: [[frontmatter]]',
      '---',
      '`[[inline]]`',
      '```',
      '[[fenced]]',
      '```',
      '\\[[escaped]]',
      '[[real]]',
    ].join('\n');
    expect(parseWikilinks(source).map((link) => link.target)).toEqual(['real']);
  });
});

describe('markdown link and tag parsing', () => {
  it('parses inline, image and angle-bracket links', () => {
    const links = parseMarkdownLinks(
      '[x](y.md) ![img](img.png) [t](<a b.md> "title") \\[escaped](z.md)',
    );
    expect(links).toHaveLength(3);
    expect(links[0]).toMatchObject({ text: 'x', target: 'y.md', embed: false });
    expect(links[1]).toMatchObject({ target: 'img.png', embed: true });
    expect(links[2]).toMatchObject({ target: 'a b.md', title: 'title' });
  });

  it('parses tags but skips headings, escaped hashes and mid-word hashes', () => {
    const tags = parseTags(
      '#tag #nested/a/b #a-b\n## Heading\nword#not #2024 \\#escaped\n`#code`',
    ).map((tag) => tag.tag);
    expect(tags).toEqual(['tag', 'nested/a/b', 'a-b']);
  });

  it('deduplicates body tags case-insensitively', () => {
    expect(tagsFromBody('#One #one #TWO')).toEqual(['one', 'two']);
  });

  it('parses ATX and setext headings with line numbers', () => {
    const headings = parseHeadings(
      [
        '# Top',
        '',
        'Setext',
        '======',
        '',
        '### Three ###',
        '',
        '## Sub',
        '-------',
        '',
        '```',
        '# not a heading',
        '```',
      ].join('\n'),
    );
    expect(headings).toEqual([
      { level: 1, text: 'Top', line: 1 },
      { level: 1, text: 'Setext', line: 3 },
      { level: 3, text: 'Three', line: 6 },
      { level: 2, text: 'Sub', line: 8 },
    ]);
  });

  it('masks prose without changing offsets', () => {
    const source = 'a `code`\n```\nfence\n```\nb';
    const masked = maskNonProse(source);
    expect(masked).toHaveLength(source.length);
    expect(masked).not.toContain('code');
    expect(masked).not.toContain('fence');
  });
});

describe('link resolution', () => {
  const index = buildFileIndex(paths, { 'alias.md': ['Alias Name'] });

  it('resolves exact, relative, case-insensitive and vault-absolute targets', () => {
    expect(resolveWikilink('notes/a', 'notes/b.md', index)).toBe('notes/a.md');
    expect(resolveWikilink('NOTES/A', 'notes/b.md', index)).toBe('notes/a.md');
    expect(resolveWikilink('/notes/a', 'notes/b.md', index)).toBe('notes/a.md');
    expect(resolveWikilink('a', 'notes/b.md', index)).toBe('notes/a.md');
  });

  it('resolves by basename and suffix, preferring the shortest path', () => {
    expect(resolveWikilink('deep', 'notes/b.md', index)).toBe('x/y/deep.md');
    expect(resolveWikilink('y/deep', 'notes/b.md', index)).toBe('x/y/deep.md');
    expect(resolveWikilink('a', 'root.md', index)).toBe('notes/a.md');
  });

  it('resolves frontmatter aliases', () => {
    expect(resolveWikilink('Alias Name', 'notes/b.md', index)).toBe('alias.md');
  });

  it('returns null for unresolved targets', () => {
    expect(resolveWikilink('missing', 'notes/b.md', index)).toBeNull();
  });

  it('resolves markdown targets relative to the source note', () => {
    expect(resolveMarkdownTarget('a.md', 'notes/b.md', index)).toBe('notes/a.md');
    expect(resolveMarkdownTarget('../other/a.md', 'notes/b.md', index)).toBe('other/a.md');
    expect(resolveMarkdownTarget('https://example.com', 'notes/b.md', index)).toBeNull();
    expect(resolveMarkdownTarget('#heading', 'notes/b.md', index)).toBe('notes/b.md');
  });

  it('shortens link targets only when the basename is unique', () => {
    expect(shortestLinkTarget('notes/a.md', paths)).toBe('notes/a');
    expect(shortestLinkTarget('notes/b.md', paths)).toBe('b');
    expect(relativeLinkPath('notes/b.md', 'notes/a.md')).toBe('a.md');
    expect(relativeLinkPath('notes/b.md', 'x/y/deep.md')).toBe('../x/y/deep.md');
  });
});

describe('link rewriting', () => {
  const source = [
    '[[notes/a]] [[notes/a#H|Alias]] [[notes/b]]',
    '[A](notes/a.md) [B](notes/b.md) [ext](https://example.com)',
  ].join('\n');

  function renameOptions(useMarkdownLinks: boolean) {
    return {
      targetMap: new Map([
        ['notes/a.md', 'notes/renamed.md'],
        ['notes/b.md', 'notes/b.md'],
        ['alias.md', 'alias.md'],
        ['other/a.md', 'other/a.md'],
        ['x/y/deep.md', 'x/y/deep.md'],
      ]),
      sourcePath: 'notes/b.md',
      index: buildFileIndex(paths),
      allPaths: ['alias.md', 'notes/renamed.md', 'notes/b.md', 'other/a.md', 'x/y/deep.md'],
      useMarkdownLinks,
    };
  }

  it('rewrites only links that resolve to the renamed path', () => {
    const result = rewriteLinks(source, renameOptions(false));
    expect(result.content).toContain('[[renamed]]');
    expect(result.content).toContain('[[renamed#H|Alias]]');
    expect(result.content).toContain('[[notes/b]]');
    expect(result.content).toContain('[B](notes/b.md)');
    expect(result.content).toContain('[ext](https://example.com)');
    expect(result.changed).toBe(3);
  });

  it('can emit markdown links with relative paths', () => {
    const result = rewriteLinks(source, renameOptions(true));
    expect(result.content).toContain('[renamed](renamed.md)');
    expect(result.content).toContain('[Alias](renamed.md#H)');
  });

  it('returns the original content when nothing resolves to the map', () => {
    const result = rewriteLinks('[[unrelated]]', {
      ...renameOptions(false),
      targetMap: new Map([['notes/a.md', 'notes/renamed.md']]),
    });
    expect(result).toEqual({ content: '[[unrelated]]', changed: 0 });
  });
});

describe('link graphs and backlinks', () => {
  const contents = new Map([
    ['notes/a.md', '# A\nSee [[b]] and [[missing]].'],
    ['notes/b.md', '# B\nBack to [[a]].'],
    ['notes/c.md', '[A](../notes/a.md)'],
  ]);

  it('builds nodes, resolved edges and unresolved targets', () => {
    const graph = buildLinkGraph({
      markdownPaths: ['notes/a.md', 'notes/b.md', 'notes/c.md'],
      contents,
      allPaths: paths.concat('notes/c.md'),
    });
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: 'notes/a.md', to: 'notes/b.md' }),
        expect.objectContaining({ from: 'notes/b.md', to: 'notes/a.md' }),
      ]),
    );
    expect(graph.unresolved).toContainEqual({ from: 'notes/a.md', target: 'missing' });
  });

  it('computes incoming links and outgoing unresolved targets', () => {
    const backlinks = incomingLinks('notes/a.md', [...contents.keys()], contents, paths);
    expect(backlinks.map((entry) => entry.from).sort()).toEqual(['notes/b.md', 'notes/c.md']);
    expect(outgoingUnresolved(contents.get('notes/a.md')!, 'notes/a.md', paths)).toEqual([
      'missing',
    ]);
  });
});
