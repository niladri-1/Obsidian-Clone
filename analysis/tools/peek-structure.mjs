import fs from 'node:fs';
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const nr = data.normalized_result;
console.log('normalized_result keys:', Object.keys(nr));
for (const k of Object.keys(nr)) {
  const v = nr[k];
  if (Array.isArray(v)) console.log(' ', k, `array(${v.length})`);
  else if (v && typeof v === 'object') console.log(' ', k, 'object keys:', Object.keys(v).join(','));
  else console.log(' ', k, '=', String(v).slice(0, 200));
}
console.log('locations:', data.locations?.length, 'evidence_links:', data.evidence_links?.length);
console.log('limitations:', JSON.stringify(data.limitations));
console.log('coverage:', JSON.stringify(data.relationship_coverage));
