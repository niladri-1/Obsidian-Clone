import { Fragment } from 'react';

interface HighlightProps {
  text: string;
  indices: number[];
}

/** Renders a string with fuzzy-match positions wrapped in a highlight span. */
export function Highlight({ text, indices }: HighlightProps) {
  if (indices.length === 0) return <>{text}</>;
  const wanted = new Set(indices);
  const nodes: Array<{ char: string; hit: boolean }> = [];
  for (let index = 0; index < text.length; index += 1) {
    const hit = wanted.has(index);
    const last = nodes[nodes.length - 1];
    if (last && last.hit === hit) last.char += text[index];
    else nodes.push({ char: text[index] ?? '', hit });
  }
  return (
    <>
      {nodes.map((node, index) => (
        <Fragment key={index}>
          {node.hit ? <span className="match-char">{node.char}</span> : node.char}
        </Fragment>
      ))}
    </>
  );
}
