// Prints consistency views over the research catalog chunks, for the final critic.
// Usage: node tools/catalog-stats.mjs [section]   sections: summary | constructs | themes | unknown | all (default)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateEntries } from './validate-chunk.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'docs', 'research', 'catalog');
const TARGETS = ['appRoutingGateway', 'agc', 'agcIngress', 'istio'];
const SHORT = { appRoutingGateway: 'ARG', agc: 'AGC', agcIngress: 'AGCi', istio: 'IST' };

const THEMES = {
  cors: /cors/, 'rate limiting': /limit-(rps|rpm|connections|rate|burst)|global-rate-limit/, 'ip allow/deny': /(allow|white|deny)list|source-range|block-cidrs/,
  waf: /modsecurity|owasp|waf/, 'external auth': /^auth-(url|signin|response|request|method|cache|keepalive|proxy|always|snippet)|global-auth/, 'basic auth': /^auth-(type|secret|realm)/,
  'session affinity': /affinity|session-cookie/, 'regex and rewrite': /use-regex|rewrite-target|app-root/, 'client certificates': /auth-tls/, passthrough: /passthrough/,
  timeouts: /timeout/, retries: /next-upstream/, redirects: /redirect/, hsts: /hsts/, compression: /gzip|brotli/, 'body size': /body-size|client-max-body/,
  'backend tls/protocol': /backend-protocol|proxy-ssl/, canary: /canary/, mirroring: /mirror/, snippets: /snippet/, 'forwarded headers': /forward|real-ip|proxy-protocol/,
};

function load() {
  const chunks = JSON.parse(fs.readFileSync(path.join(DIR, 'chunks.json'), 'utf8'));
  const out = [];
  for (const c of chunks) {
    const file = path.join(DIR, `${c.id}.json`);
    if (!fs.existsSync(file)) { out.push({ chunk: c, missing: true, entries: [] }); continue; }
    let entries = [];
    try { entries = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (x) { out.push({ chunk: c, parseError: x.message, entries: [] }); continue; }
    out.push({ chunk: c, entries, check: validateEntries(entries, c) });
  }
  return out;
}

const support = (e) => TARGETS.map((t) => `${SHORT[t]}=${(e.targets && e.targets[t] && e.targets[t].support) || '-'}`).join(' ');

function summary(data) {
  console.log('## Chunks');
  for (const d of data) {
    if (d.missing) { console.log(`${d.chunk.id}: MISSING`); continue; }
    if (d.parseError) { console.log(`${d.chunk.id}: PARSE ERROR ${d.parseError}`); continue; }
    const b = {}; const conf = {};
    d.entries.forEach((e) => { b[e.bucket] = (b[e.bucket] || 0) + 1; conf[e.confidence] = (conf[e.confidence] || 0) + 1; });
    console.log(`${d.chunk.id} (${d.chunk.mode}): ${d.entries.length}/${d.chunk.keys.length} entries, errors ${d.check.errors.length}, warnings ${d.check.warnings.length}, buckets ${JSON.stringify(b)}, confidence ${JSON.stringify(conf)}`);
  }
}

function constructs(data) {
  console.log('\n## Gateway API constructs with more than one channel/support combination');
  const map = new Map();
  for (const d of data) for (const e of d.entries) {
    const g = e.gatewayApi || {};
    const name = String(g.construct || '').trim();
    if (!name || name.toLowerCase() === 'none') continue;
    if (!map.has(name)) map.set(name, new Map());
    const combo = `${g.channel}/${g.support}`;
    if (!map.get(name).has(combo)) map.get(name).set(combo, []);
    map.get(name).get(combo).push(`${e.kind}:${e.key}`);
  }
  let n = 0;
  for (const [name, combos] of [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (combos.size < 2) continue;
    n++;
    console.log(`- ${name}`);
    for (const [combo, keys] of combos) console.log(`    ${combo}: ${keys.join(', ')}`);
  }
  if (!n) console.log('(none)');
}

function themes(data) {
  console.log('\n## Per-target support by theme (check that the same feature gets the same answer)');
  const all = data.flatMap((d) => d.entries);
  for (const [theme, re] of Object.entries(THEMES)) {
    const hits = all.filter((e) => re.test(String(e.key)));
    if (!hits.length) continue;
    console.log(`### ${theme}`);
    for (const e of hits.sort((a, b) => a.key.localeCompare(b.key))) console.log(`  ${e.kind}:${e.key} [${e.bucket}] ${support(e)}`);
  }
}

function unknown(data) {
  console.log('\n## Entries with an unknown target or low confidence');
  for (const d of data) for (const e of d.entries) {
    const unk = TARGETS.filter((t) => e.targets && e.targets[t] && e.targets[t].support === 'unknown');
    if (unk.length || e.confidence === 'low') console.log(`  ${d.chunk.id} ${e.kind}:${e.key} confidence=${e.confidence}${unk.length ? ` unknown=${unk.join(',')}` : ''}`);
  }
}

const section = process.argv[2] || 'all';
const data = load();
if (section === 'summary' || section === 'all') summary(data);
if (section === 'constructs' || section === 'all') constructs(data);
if (section === 'themes' || section === 'all') themes(data);
if (section === 'unknown' || section === 'all') unknown(data);
