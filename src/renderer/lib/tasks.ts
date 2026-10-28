/**
 * Toggles the Nth GFM task checkbox in a Markdown document while preserving the rest of the
 * source. The index corresponds to the order of task markers in the document (0-based), which
 * matches the order produced by markdown-it-task-lists in the rendered reading view.
 */
export function toggleTaskInSource(source: string, index: number): { content: string; changed: boolean } {
  if (!Number.isInteger(index) || index < 0) return { content: source, changed: false };
  const taskRe = /^([ \t]*(?:>[ \t]*)*[-*+][ \t]+\[)([ xX])(\])/gm;
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = taskRe.exec(source)) !== null) {
    if (count === index) {
      const current = match[2]!;
      const next = current.toLowerCase() === 'x' ? ' ' : 'x';
      const start = match.index + match[1]!.length;
      const content = `${source.slice(0, start)}${next}${source.slice(start + 1)}`;
      return { content, changed: true };
    }
    count += 1;
  }
  return { content: source, changed: false };
}

export function countTasks(source: string): number {
  const matches = source.match(/^[ \t]*(?:>[ \t]*)*[-*+][ \t]+\[[ xX]\]/gm);
  return matches?.length ?? 0;
}
