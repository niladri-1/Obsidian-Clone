// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  collectNoteEmbeds,
  parseWikilinkBody,
  renderMarkdown,
  sanitizeHtml,
  slugifyHeading,
  unresolvedTargets,
  type MarkdownContext,
} from '../src/renderer/lib/markdown';

const contents = new Map<string, string>([
  ['notes/a.md', '# A\n\nsource'],
  ['notes/b.md', '# B\n\nEmbedded body'],
]);

const context: MarkdownContext = {
  sourcePath: 'notes/a.md',
  allPaths: ['notes/a.md', 'notes/b.md', 'assets/pic one.png', 'docs/manual.pdf'],
  getContent: (path) => contents.get(path),
};

describe('markdown rendering', () => {
  it('renders headings, tables, tasks, strikethrough and footnotes', () => {
    const html = renderMarkdown(
      [
        '# Heading',
        '',
        '| a | b |',
        '| - | - |',
        '| 1 | 2 |',
        '',
        '- [ ] open',
        '- [x] done',
        '',
        '~~gone~~',
        '',
        'Footnote[^1]',
        '',
        '[^1]: note text',
      ].join('\n'),
      context,
    );

    expect(html).toContain('<h1');
    expect(html).toContain('<table>');
    expect(html).toContain('task-list-item-checkbox');
    expect(html).toContain('data-task-index="0"');
    expect(html).toContain('data-task-index="1"');
    expect(html).toMatch(/<s>|<del>/);
    expect(html).toContain('footnote-ref');
  });

  it('highlights fenced code and adds a copy affordance', () => {
    const html = renderMarkdown('```ts\nconst value: number = 1;\n```', context);
    expect(html).toContain('class="code-block"');
    expect(html).toContain('class="hljs language-ts"');
    expect(html).toContain('hljs-keyword');
    expect(html).toContain('class="code-copy"');
  });

  it('renders resolved and unresolved wikilinks', () => {
    const html = renderMarkdown('[[b]] [[missing]] [[b|Label]]', context);
    expect(html).toContain('class="wikilink"');
    expect(html).toContain('data-target="notes/b.md"');
    expect(html).toContain('is-unresolved');
    expect(html).toContain('data-raw="missing"');
    expect(html).toContain('>Label</a>');
  });

  it('resolves standard markdown links to notes and attachments', () => {
    const html = renderMarkdown('[B](b.md) [manual](<../docs/manual.pdf>)', context);
    expect(html).toContain('data-vault-path="notes/b.md"');
    expect(html).toContain('data-vault-file="docs/manual.pdf"');
    expect(html).toContain('href="#"');
    expect(html).not.toContain('href="b.md"');
  });

  it('still sanitises dangerous standard markdown links', () => {
    const html = renderMarkdown('[bad](javascript:alert(1)) [remote](https://example.com)', context);
    expect(html.toLowerCase()).not.toContain('href="javascript:');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer noopener"');
  });

  it('renders image embeds through the vault protocol and attachments as links', () => {
    const html = renderMarkdown('![[pic one.png]] [[docs/manual.pdf]]', context);
    expect(html).toContain('src="vaultfile://vault/assets/pic%20one.png"');
    expect(html).toContain('class="embed-image"');
    expect(html).toContain('data-vault-file="docs/manual.pdf"');
    expect(html).toContain('class="wikilink attachment"');
  });

  it('transcludes note embeds once and exposes an embed link otherwise', () => {
    const html = renderMarkdown('![[b]] ![[a]]', context);
    expect(html).toContain('class="note-embed"');
    expect(html).toContain('Embedded body');
    expect(html).toContain('note-embed-link');
  });

  it('turns tags into anchors', () => {
    const html = renderMarkdown('A #project and #nested/tag.', context);
    expect(html).toContain('class="tag"');
    expect(html).toContain('data-tag="project"');
    expect(html).toContain('data-tag="nested/tag"');
  });

  it('renders callouts with title and body', () => {
    const html = renderMarkdown('> [!warning] Careful\n> Body text\n', context);
    expect(html).toContain('class="callout callout-warning"');
    expect(html).toContain('data-callout="warning"');
    expect(html).toContain('callout-title');
    expect(html).toContain('Body text');
  });

  it('resolves markdown images and marks external images as blocked', () => {
    const html = renderMarkdown(
      '![local](<assets/pic one.png>)\n\n![remote](https://example.com/x.png)',
      context,
    );
    expect(html).toContain('vaultfile://vault/assets/pic%20one.png');
    expect(html).toContain('External image blocked');
  });

  it('keeps ordinary raw HTML that passes the allowlist', () => {
    const html = renderMarkdown('<b>bold</b> and <span class="ok">span</span>', context);
    expect(html).toContain('<b>bold</b>');
    expect(html).toContain('class="ok"');
  });
});

describe('sanitiser', () => {
  it('removes scripts, event handlers and dangerous protocols', () => {
    const payloads = [
      '<script>alert(1)</script>',
      '<img src=x onerror="alert(1)">',
      '<iframe src="https://evil.example"></iframe>',
      '<svg onload="alert(1)"><circle /></svg>',
      '<a href="javascript:alert(1)">click</a>',
      '<a href="data:text/html,<script>alert(1)</script>">data</a>',
      '<div onclick="alert(1)">click</div>',
    ];
    for (const payload of payloads) {
      const html = sanitizeHtml(payload);
      expect(html.toLowerCase()).not.toContain('<script');
      expect(html.toLowerCase()).not.toContain('<iframe');
      expect(html.toLowerCase()).not.toContain('<svg');
      expect(html.toLowerCase()).not.toContain('onerror');
      expect(html.toLowerCase()).not.toContain('onload');
      expect(html.toLowerCase()).not.toContain('onclick');
      expect(html.toLowerCase()).not.toContain('javascript:');
      expect(html.toLowerCase()).not.toContain('href="data:text/html');
    }
  });

  it('sanitises dangerous markdown links and raw HTML in a rendered note', () => {
    const html = renderMarkdown(
      [
        '[js](javascript:alert(1))',
        '[data](data:text/html,<script>alert(1)</script>)',
        '<img src="x" onerror="alert(1)">',
      ].join('\n\n'),
      context,
    );
    expect(html.toLowerCase()).not.toContain('href="javascript:');
    expect(html.toLowerCase()).not.toContain('onerror');
    expect(html.toLowerCase()).not.toContain('<script');
  });

  it('adds safe rel/target attributes to external links', () => {
    const html = renderMarkdown('[site](https://example.com)', context);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer noopener"');
  });
});

describe('markdown helpers', () => {
  it('parses wikilink bodies with heading and alias', () => {
    expect(parseWikilinkBody('note#Heading|Alias')).toEqual({
      target: 'note',
      heading: 'Heading',
      alias: 'Alias',
    });
    expect(parseWikilinkBody('note')).toEqual({ target: 'note' });
  });

  it('slugifies headings for anchors', () => {
    expect(slugifyHeading('Hello, World!')).toBe('hello-world');
    expect(slugifyHeading('Über café')).toBe('uber-cafe');
    expect(slugifyHeading('???')).toBe('section');
  });

  it('lists missing note embeds and unresolved targets', () => {
    expect(collectNoteEmbeds('![[b]] ![[a]] ![[missing]]', context)).toEqual([]);
    const withoutB = { ...context, getContent: () => undefined };
    expect(collectNoteEmbeds('![[b]]', withoutB)).toEqual(['notes/b.md']);
    expect(unresolvedTargets('[[b]]', context)).toEqual([]);
    expect(unresolvedTargets('[[b]] [[nope]]', context)).toEqual(['nope']);
  });
});
