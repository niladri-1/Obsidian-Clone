import fs from 'node:fs';
const src = fs.readFileSync(process.argv[2], 'utf8');
const lines = src.split(/\r?\n/);
const re = /(ipcMain\.(?:on|handle|handleOnce|once|emit)|ipcRenderer\.(?:send|sendSync|invoke|on|once))\s*\(\s*["'`]([^"'`]+)["'`]/g;
const hits = [];
lines.forEach((line, i) => {
  let m;
  while ((m = re.exec(line))) hits.push({ line: i + 1, api: m[1], channel: m[2] });
});
const byChannel = new Map();
for (const h of hits) {
  const k = h.channel;
  if (!byChannel.has(k)) byChannel.set(k, { channel: k, apis: new Set(), lines: [] });
  byChannel.get(k).apis.add(h.api);
  byChannel.get(k).lines.push(h.line);
}
console.log('total call sites:', hits.length, 'unique channels:', byChannel.size);
for (const v of [...byChannel.values()].sort((a, b) => a.channel.localeCompare(b.channel))) {
  console.log(`${v.channel}\t${[...v.apis].join(',')}\t${v.lines.slice(0, 4).join(',')}`);
}
