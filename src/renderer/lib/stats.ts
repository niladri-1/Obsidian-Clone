export interface TextStats {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  lines: number;
  readingMinutes: number;
}

export function textStats(source: string): TextStats {
  const trimmed = source.trim();
  const words = trimmed ? (trimmed.match(/[\p{L}\p{N}'’+-]+/gu)?.length ?? 0) : 0;
  const characters = source.length;
  const charactersNoSpaces = source.replace(/\s/g, '').length;
  const lines = source.length === 0 ? 0 : source.split(/\r?\n/).length;
  return {
    words,
    characters,
    charactersNoSpaces,
    lines,
    readingMinutes: Math.max(1, Math.round(words / 220)),
  };
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: value >= 10_000 ? 'compact' : 'standard' }).format(
    value,
  );
}
