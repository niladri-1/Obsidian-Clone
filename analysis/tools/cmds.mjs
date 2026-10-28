import fs from "node:fs";
const t = fs.readFileSync(process.argv[2], "utf8");
const re = /"([a-z][a-z0-9-]*:[a-z0-9:-]+)"/g;
const c = new Map();
let m;
while ((m = re.exec(t))) c.set(m[1], (c.get(m[1]) || 0) + 1);
const rows = [...c.entries()].sort((a, b) => b[1] - a[1]);
const filter = process.argv[3] ? new RegExp(process.argv[3]) : null;
let shown = 0;
for (const [k, n] of rows) {
  if (filter && !filter.test(k)) continue;
  console.log(n, k);
  if (++shown >= 400) break;
}
console.log("total ids:", rows.length);
