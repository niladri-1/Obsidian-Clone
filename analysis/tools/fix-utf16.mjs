import fs from 'node:fs';

const inPath = process.argv[2];
const outPath = process.argv[3];
const buf = fs.readFileSync(inPath);
let text;
if (buf.length > 1 && buf[0] === 0xff && buf[1] === 0xfe) {
  text = buf.subarray(2).toString('utf16le');
} else {
  text = buf.toString('utf8');
}
fs.writeFileSync(outPath, text, 'utf8');
console.log('wrote', outPath, text.length, 'chars');
