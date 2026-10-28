export interface FuzzyMatch {
  score: number;
  indices: number[];
}

const BOUNDARY = /[\s/\\._-]/;

/**
 * Case-insensitive subsequence match with bonuses for word starts and contiguous runs.
 * Returns null when the query cannot be matched.
 */
export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  const needle = query.trim().toLowerCase();
  if (!needle) return { score: 0, indices: [] };
  const haystack = target.toLowerCase();
  const indices: number[] = [];
  let score = 0;
  let cursor = 0;
  let previousIndex = -1;

  for (let q = 0; q < needle.length; q += 1) {
    const char = needle[q]!;
    let found = -1;
    for (let index = cursor; index < haystack.length; index += 1) {
      if (haystack[index] === char) {
        found = index;
        break;
      }
    }
    if (found === -1) return null;
    indices.push(found);
    if (found === previousIndex + 1) score += 6;
    if (found === 0 || BOUNDARY.test(haystack[found - 1] ?? '')) score += 8;
    score += Math.max(0, 4 - (found - cursor) / 4);
    cursor = found + 1;
    previousIndex = found;
  }

  score += Math.max(0, 12 - (haystack.length - needle.length));
  if (haystack.startsWith(needle)) score += 20;
  if (haystack.endsWith(needle)) score += 6;
  return { score, indices };
}

export function rankByFuzzy<T>(
  items: T[],
  query: string,
  text: (item: T) => string,
): Array<{ item: T; score: number }> {
  const results: Array<{ item: T; score: number }> = [];
  for (const item of items) {
    const match = fuzzyMatch(query, text(item));
    if (match) results.push({ item, score: match.score });
  }
  return results.sort((a, b) => b.score - a.score);
}
