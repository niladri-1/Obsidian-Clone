// Print keyword contexts from a large single-line JS file with byte offsets.
// Usage: node ctx.mjs <file> <before> <after> <regex> [<regex> ...]
import fs from "node:fs";

const [file, beforeArg, afterArg, ...patterns] = process.argv.slice(2);
const before = Number(beforeArg);
const after = Number(afterArg);
const text = fs.readFileSync(file, "utf8");

for (const pat of patterns) {
  const re = new RegExp(pat, "g");
  let m;
  let n = 0;
  console.log(`\n### ${pat}`);
  while ((m = re.exec(text)) !== null) {
    n++;
    if (n > 12) { console.log("  ... (truncated)"); break; }
    const start = Math.max(0, m.index - before);
    const end = Math.min(text.length, m.index + m[0].length + after);
    console.log(`\n@${m.index} ${JSON.stringify(text.slice(start, end))}`);
    if (m[0].length === 0) re.lastIndex++;
  }
  console.log(`count=${n}`);
}
