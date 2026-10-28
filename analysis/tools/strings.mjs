import fs from "node:fs";
const file = process.argv[2];
const t = fs.readFileSync(file, "utf8");
const m = t.match(/"[a-z][a-z0-9-]{2,30}"/g) || [];
const c = new Map();
for (const s of m) c.set(s, (c.get(s) || 0) + 1);
const want = process.argv[3] ? new RegExp(process.argv[3]) : null;
const rows = [...c.entries()]
  .filter(([k]) => !want || want.test(k.slice(1, -1)))
  .sort((a, b) => b[1] - a[1]);
for (const [k, n] of rows.slice(0, 120)) console.log(n, k);
