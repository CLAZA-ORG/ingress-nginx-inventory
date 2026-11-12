// Prints the keys of one research catalog chunk (one JSON object per line), for the mapping agents.
// Usage: node tools/chunk-keys.mjs <chunkId>      (exit 0 = printed, 2 = usage)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chunks = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'research', 'catalog', 'chunks.json'), 'utf8'));
const id = process.argv[2];
const chunk = chunks.find((c) => c.id === id);
if (!chunk) {
  console.error(`usage: node tools/chunk-keys.mjs <chunkId>; known: ${chunks.map((c) => c.id).join(', ')}`);
  process.exit(2);
}
console.log(`chunk ${chunk.id} (${chunk.mode}): ${chunk.keys.length} keys`);
for (const k of chunk.keys) console.log(JSON.stringify(k));
