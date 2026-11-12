// Validates one research catalog chunk against docs/research/catalog/chunks.json and the entry format.
// Usage: node tools/validate-chunk.mjs <chunkId>      (exit 0 = valid, 1 = invalid, 2 = usage)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'docs', 'research', 'catalog');

const KINDS = ['annotation', 'configmap', 'flag', 'ecosystem'];
const SCOPES = ['ingress', 'ingressclass', 'service', 'controller'];
const BUCKETS = ['direct', 'policy', 'redesign', 'none'];
const OPS = ['equals', 'in', 'regex', 'contains', 'exists'];
const CHANNELS = ['standard', 'experimental', 'none'];
const LEVELS = ['core', 'extended', 'implementation-specific', 'none'];
const TARGETS = ['appRoutingGateway', 'agc', 'agcIngress', 'istio'];
const SUPPORT = ['yes', 'partial', 'no', 'unknown', 'n/a'];
const I2G = ['converted', 'partial', 'not-converted', 'unknown'];
const CONFIDENCE = ['high', 'medium', 'low'];

// [field, soft limit (warning), hard limit (error)]
const LIMITS = [['summary_en', 140, 200], ['note_en', 220, 280], ['note_fr', 240, 310]];
const HOW_LIMITS = { how_en: [160, 220], how_fr: [180, 250] };

export function validateEntries(entries, chunk) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(entries)) return { errors: ['file is not a JSON array'], warnings };

  const want = chunk.keys.map((k) => `${k.kind}:${k.key}`);
  const got = entries.map((e) => `${e && e.kind}:${e && e.key}`);
  const dupes = got.filter((k, i) => got.indexOf(k) !== i);
  if (dupes.length) errors.push(`duplicate entries: ${[...new Set(dupes)].join(', ')}`);
  const missing = want.filter((k) => !got.includes(k));
  const extra = got.filter((k) => !want.includes(k));
  if (missing.length) errors.push(`missing keys: ${missing.join(', ')}`);
  if (extra.length) errors.push(`unexpected keys: ${extra.join(', ')}`);

  const isStr = (v) => typeof v === 'string' && v.trim() !== '';
  const strOrNull = (v) => v === null || isStr(v);

  for (const e of entries) {
    if (!e || typeof e !== 'object') { errors.push('entry is not an object'); continue; }
    const at = `${e.kind}:${e.key}`;
    const err = (m) => errors.push(`${at}: ${m}`);
    const warn = (m) => warnings.push(`${at}: ${m}`);

    if (!isStr(e.key)) err('key must be a non-empty string');
    if (!KINDS.includes(e.kind)) err(`kind must be one of ${KINDS.join('|')}`);
    if (!isStr(e.group)) err('group must be a non-empty string');
    if (!['exact', 'prefix'].includes(e.match)) err('match must be exact|prefix');
    if (!SCOPES.includes(e.scope)) err(`scope must be one of ${SCOPES.join('|')}`);
    if (!strOrNull(e.nginxDefault)) err('nginxDefault must be a string or null');
    if (!BUCKETS.includes(e.bucket)) err(`bucket must be one of ${BUCKETS.join('|')}`);

    for (const [field, soft, hard] of LIMITS) {
      if (!isStr(e[field])) { err(`${field} is required`); continue; }
      if (e[field].length > hard) err(`${field} is ${e[field].length} chars (max ${hard})`);
      else if (e[field].length > soft) warn(`${field} is ${e[field].length} chars (target ${soft})`);
    }

    if (!Array.isArray(e.valueRules)) err('valueRules must be an array ([] when unused)');
    else e.valueRules.forEach((r, i) => {
      const where = `valueRules[${i}]`;
      if (!r || typeof r !== 'object') { err(`${where} is not an object`); return; }
      if (!isStr(r.when)) err(`${where}.when is required`);
      if (!r.test || !OPS.includes(r.test.op)) err(`${where}.test.op must be one of ${OPS.join('|')}`);
      else if (r.test.op !== 'exists') {
        const v = r.test.value;
        const ok = r.test.op === 'in' ? Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string') : typeof v === 'string';
        if (!ok) err(`${where}.test.value has the wrong type for op ${r.test.op}`);
        if (r.test.op === 'regex' && typeof v === 'string') {
          try { new RegExp(v); } catch (x) { err(`${where}.test.value is not a valid JavaScript regex: ${x.message}`); }
        }
      }
      if (!BUCKETS.includes(r.bucket)) err(`${where}.bucket must be one of ${BUCKETS.join('|')}`);
      // Optional: support per target when this value differs from the entry (e.g. a headers-only snippet).
      if (r.targets !== undefined) {
        if (!r.targets || typeof r.targets !== 'object' || Array.isArray(r.targets)) err(`${where}.targets must be an object`);
        else for (const [t, s] of Object.entries(r.targets)) {
          if (!TARGETS.includes(t)) err(`${where}.targets.${t} is not a target`);
          else if (!SUPPORT.includes(s)) err(`${where}.targets.${t} must be one of ${SUPPORT.join('|')}`);
        }
      }
      if (!isStr(r.note_en) || !isStr(r.note_fr)) err(`${where} needs note_en and note_fr`);
    });

    const g = e.gatewayApi;
    if (!g || typeof g !== 'object') err('gatewayApi is required');
    else {
      if (!isStr(g.construct)) err('gatewayApi.construct is required (use "none")');
      if (!CHANNELS.includes(g.channel)) err(`gatewayApi.channel must be one of ${CHANNELS.join('|')}`);
      if (!LEVELS.includes(g.support)) err(`gatewayApi.support must be one of ${LEVELS.join('|')}`);
    }

    let claimsSupport = false;
    if (!e.targets || typeof e.targets !== 'object') err('targets is required');
    else for (const t of TARGETS) {
      const c = e.targets[t];
      if (!c || typeof c !== 'object') { err(`targets.${t} is required`); continue; }
      if (!SUPPORT.includes(c.support)) err(`targets.${t}.support must be one of ${SUPPORT.join('|')}`);
      if (c.support === 'yes' || c.support === 'partial') claimsSupport = true;
      for (const [f, [soft, hard]] of Object.entries(HOW_LIMITS)) {
        if (!isStr(c[f])) { err(`targets.${t}.${f} is required`); continue; }
        if (c[f].length > hard) err(`targets.${t}.${f} is ${c[f].length} chars (max ${hard})`);
        else if (c[f].length > soft) warn(`targets.${t}.${f} is ${c[f].length} chars (target ${soft})`);
      }
    }

    if (!strOrNull(e.behaviorChange_en) || !strOrNull(e.behaviorChange_fr)) err('behaviorChange_en/fr must be strings or null');
    else if ((e.behaviorChange_en === null) !== (e.behaviorChange_fr === null)) err('behaviorChange_en and behaviorChange_fr must both be set or both be null');

    if (!I2G.includes(e.ingress2gateway)) err(`ingress2gateway must be one of ${I2G.join('|')}`);
    if (!CONFIDENCE.includes(e.confidence)) err(`confidence must be one of ${CONFIDENCE.join('|')}`);
    if (!Array.isArray(e.sources) || !e.sources.every((s) => typeof s === 'string')) err('sources must be an array of strings');
    else {
      if (claimsSupport && e.sources.length === 0) err('a yes or partial target claim needs at least one source');
      const notUrl = e.sources.filter((s) => !/^https?:\/\//.test(s));
      if (notUrl.length) warn(`sources that are not URLs: ${notUrl.join(' | ')}`);
    }

    if (e.bucket === 'direct' && g) {
      if (g.channel !== 'standard' || !['core', 'extended'].includes(g.support)) warn('bucket direct but gatewayApi is not standard core/extended');
      const weak = ['appRoutingGateway', 'agc', 'istio'].filter((t) => e.targets && e.targets[t] && !['yes', 'partial'].includes(e.targets[t].support));
      if (weak.length) warn(`bucket direct but ${weak.join(', ')} not yes/partial`);
    }
  }
  return { errors, warnings };
}

function main() {
  const id = process.argv[2];
  if (!id) { console.error('usage: node tools/validate-chunk.mjs <chunkId>'); process.exit(2); }
  const chunks = JSON.parse(fs.readFileSync(path.join(DIR, 'chunks.json'), 'utf8'));
  const chunk = chunks.find((c) => c.id === id);
  if (!chunk) { console.error(`unknown chunk ${id}; known: ${chunks.map((c) => c.id).join(', ')}`); process.exit(2); }
  const file = path.join(DIR, `${id}.json`);
  let entries;
  try { entries = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (x) { console.error(`cannot read or parse ${file}: ${x.message}`); process.exit(1); }
  const { errors, warnings } = validateEntries(entries, chunk);
  for (const w of warnings) console.log(`WARN  ${w}`);
  for (const e of errors) console.log(`ERROR ${e}`);
  if (errors.length) { console.log(`INVALID ${id}: ${errors.length} error(s), ${warnings.length} warning(s)`); process.exit(1); }
  console.log(`OK ${id}: ${entries.length} entries, ${warnings.length} warning(s)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
