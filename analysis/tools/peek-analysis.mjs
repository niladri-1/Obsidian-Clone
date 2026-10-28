import fs from 'node:fs';
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const show = (label, v) => console.log(label, JSON.stringify(v, null, 2)?.slice(0, 4000));
console.log('TOP KEYS:', Object.keys(data));
for (const k of Object.keys(data)) {
  if (k === 'modules' || k === 'files' || k === 'evidence' || k === 'nodes' || k === 'edges') {
    const v = data[k];
    console.log(k, Array.isArray(v) ? `array(${v.length})` : typeof v, Array.isArray(v) && v.length ? JSON.stringify(v[0]).slice(0, 600) : '');
    continue;
  }
  if (typeof data[k] === 'object') show(k, data[k]);
  else console.log(k, '=', String(data[k]).slice(0, 500));
}
