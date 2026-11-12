// Builds catalog/*.json from the research catalog in docs/research/catalog/ (chunk files,
// behavior-defaults.json, meta.json). Fails (exit 1) when any validator reports an error.
// Usage: node tools/merge-research.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateEntries } from './validate-chunk.mjs';
import { validateDefaults, validateMeta } from './validate-data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESEARCH = path.join(ROOT, 'docs', 'research', 'catalog');
const OUT = path.join(ROOT, 'catalog');
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const read = (file) => JSON.parse(fs.readFileSync(path.join(RESEARCH, file), 'utf8'));

const byKind = { annotation: [], configmap: [], flag: [], ecosystem: [] };
const problems = [];
for (const chunk of read('chunks.json')) {
  let entries;
  try { entries = read(`${chunk.id}.json`); } catch (x) { problems.push(`${chunk.id}: ${x.message}`); continue; }
  const { errors } = validateEntries(entries, chunk);
  if (errors.length) { problems.push(...errors.map((e) => `${chunk.id}: ${e}`)); continue; }
  for (const e of entries) byKind[e.kind].push(e);
}
const defaults = read('behavior-defaults.json');
problems.push(...validateDefaults(defaults).errors.map((e) => `behavior-defaults.json: ${e}`));
const meta = read('meta.json');
problems.push(...validateMeta(meta).errors.map((e) => `meta.json: ${e}`));

if (problems.length) {
  for (const p of problems) console.error(`ERROR ${p}`);
  console.error(`merge-research: ${problems.length} error(s); catalog/ not written`);
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });
const write = (file, data) => fs.writeFileSync(path.join(OUT, file), `${JSON.stringify(data, null, 2)}\n`);
const byKey = (a, b) => cmp(a.key, b.key);
write('annotations.json', byKind.annotation.sort(byKey));
write('configmap.json', byKind.configmap.sort(byKey));
write('flags.json', byKind.flag.sort(byKey));
write('ecosystem.json', byKind.ecosystem.sort(byKey));
write('behavior-defaults.json', defaults.slice().sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1))));
write('meta.json', meta);
console.log(`catalog/: ${byKind.annotation.length} annotations, ${byKind.configmap.length} ConfigMap keys, ${byKind.flag.length} flags, ${byKind.ecosystem.length} ecosystem keys, ${defaults.length} defaults`);
