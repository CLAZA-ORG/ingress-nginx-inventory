// Writes catalog/*.json into ingress-inventory.mjs, between the lines // BEGIN CATALOG and
// // END CATALOG, one JSON line per entry for readable diffs.
// Usage: node tools/embed-catalog.mjs [--check]   (--check: exit 1 when the embedded block is stale)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'ingress-inventory.mjs');
const read = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog', file), 'utf8'));

export function catalogBlock() {
  const lines = ['// BEGIN CATALOG', 'export const CATALOG = {'];
  for (const [name, file] of [['annotations', 'annotations.json'], ['configmap', 'configmap.json'], ['flags', 'flags.json'], ['ecosystem', 'ecosystem.json'], ['defaults', 'behavior-defaults.json']]) {
    const list = read(file);
    lines.push(`  "${name}": [`);
    list.forEach((e, i) => lines.push(`    ${JSON.stringify(e)}${i < list.length - 1 ? ',' : ''}`));
    lines.push('  ],');
  }
  lines.push(`  "meta": ${JSON.stringify(read('meta.json'))}`, '};', '// END CATALOG');
  return lines.join('\n');
}

export function embed(source, block) {
  const start = source.indexOf('// BEGIN CATALOG');
  const end = source.indexOf('// END CATALOG');
  if (start < 0 || end < start) throw new Error('catalog markers not found in ingress-inventory.mjs');
  return source.slice(0, start) + block + source.slice(end + '// END CATALOG'.length);
}

function main() {
  const source = fs.readFileSync(SOURCE, 'utf8');
  const next = embed(source, catalogBlock());
  if (process.argv.includes('--check')) {
    if (next !== source) { console.error('embed-catalog: the embedded catalog differs from catalog/*.json; run npm run build'); process.exit(1); }
    console.log('embed-catalog: embedded catalog is up to date');
    return;
  }
  fs.writeFileSync(SOURCE, next);
  console.log(`embed-catalog: ${path.basename(SOURCE)} updated (${Math.round(next.length / 1024)} KiB)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
