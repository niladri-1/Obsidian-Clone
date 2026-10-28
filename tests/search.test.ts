import { beforeEach, describe, expect, it } from 'vitest';
import { SearchIndex } from '../src/main/vault/search';

let index: SearchIndex;

beforeEach(() => {
  index = new SearchIndex();
  index.rebuild(
    new Map([
      ['notes/alpha.md', '# Alpha\n\nThe alpha project body mentions a needle.'],
      ['notes/beta.md', '# Beta\n\nAlpha appears here too. #project'],
      ['notes/gamma.md', '# Gamma\n\nalphabet soup'],
      ['notes/upper.md', '# Upper\n\nAlpha'],
      ['notes/lower.md', '# Lower\n\nalpha'],
    ]),
  );
});

describe('search indexing', () => {
  it('finds title, body, heading and tag terms', () => {
    expect(index.query({ query: 'alpha' }).results.length).toBeGreaterThan(0);
    expect(index.query({ query: 'needle' }).results[0]?.path).toBe('notes/alpha.md');
    expect(index.query({ query: 'beta' }).results[0]?.path).toBe('notes/beta.md');
    expect(index.query({ query: 'project' }).results[0]?.path).toBe('notes/beta.md');
  });

  it('ranks a title match above a body-only match', () => {
    const results = index.query({ query: 'alpha' }).results;
    expect(results[0]?.path).toBe('notes/alpha.md');
    expect(results.map((result) => result.path)).toContain('notes/beta.md');
  });

  it('supports case-sensitive scanning', () => {
    const fresh = new SearchIndex();
    fresh.rebuild(
      new Map([
        ['notes/upper.md', 'Upper ALPHA'],
        ['notes/lower.md', 'Lower alpha'],
      ]),
    );
    const upper = fresh.query({ query: 'ALPHA', caseSensitive: true });
    expect(upper.results.map((result) => result.path)).toEqual(['notes/upper.md']);
    const lower = fresh.query({ query: 'alpha', caseSensitive: true });
    expect(lower.results.map((result) => result.path)).toEqual(['notes/lower.md']);
  });

  it('supports regular expressions and reports invalid ones without throwing', () => {
    const results = index.query({ query: 'B.t.', regex: true });
    expect(results.results[0]?.path).toBe('notes/beta.md');
    const invalid = index.query({ query: '[', regex: true });
    expect(invalid.results).toEqual([]);
    expect(invalid.error).toMatch(/^Invalid regular expression/);
  });

  it('enforces whole-word matching', () => {
    const results = index.query({ query: 'alpha', wholeWord: true });
    expect(results.results.map((result) => result.path)).not.toContain('notes/gamma.md');
    expect(results.results.map((result) => result.path)).toContain('notes/alpha.md');
  });

  it('returns snippet offsets relative to the snippet text', () => {
    const result = index.query({ query: 'needle' }).results[0];
    expect(result).toBeDefined();
    expect(result!.snippet.slice(result!.matchStart, result!.matchStart + result!.matchLength)).toBe(
      'needle',
    );
    expect(result!.snippet).not.toContain('<script');
  });

  it('clamps the result limit and handles an empty query', () => {
    const limited = index.query({ query: 'alpha', limit: 1 });
    expect(limited.results).toHaveLength(1);
    expect(limited.total).toBeGreaterThanOrEqual(1);
    expect(index.query({ query: '   ' })).toMatchObject({ results: [], total: 0 });
    expect(index.query({ query: 'alpha', limit: 10_000 }).results.length).toBeLessThanOrEqual(200);
  });

  it('updates and removes documents incrementally', () => {
    const fresh = new SearchIndex();
    fresh.rebuild(new Map([['notes/one.md', '# One\n\nkumquat']]));
    expect(fresh.query({ query: 'kumquat' }).total).toBe(1);
    fresh.update('notes/two.md', '# Two\n\nkumquat too');
    expect(fresh.query({ query: 'kumquat' }).total).toBe(2);
    fresh.remove('notes/one.md');
    const remaining = fresh.query({ query: 'kumquat' });
    expect(remaining.total).toBe(1);
    expect(remaining.results[0]?.path).toBe('notes/two.md');
  });

  it('indexes frontmatter tags and aliases', () => {
    const fresh = new SearchIndex();
    fresh.rebuild(
      new Map([
        [
          'notes/meta.md',
          '---\ntags: [project, meta]\naliases: [Meta Note]\n---\n# Meta\n\nbody',
        ],
      ]),
    );
    expect(fresh.query({ query: 'project' }).results[0]?.path).toBe('notes/meta.md');
    expect(fresh.query({ query: 'Meta Note' }).results[0]?.path).toBe('notes/meta.md');
  });
});
