// Validates docs/research/catalog/behavior-defaults.json or meta.json against the formats the build expects.
// Usage: node tools/validate-data.mjs defaults|meta      (exit 0 = valid, 1 = invalid, 2 = usage)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'docs', 'research', 'catalog');

const TARGETS = ['appRoutingGateway', 'agc', 'agcIngress', 'istio'];
const CONFIDENCE = ['high', 'medium', 'low'];
const KEY_KINDS = ['configmap', 'annotation', 'flag'];
const CLASS_FAMILIES = ['ingress-nginx', 'aks-app-routing-nginx', 'other'];
const IMAGE_FAMILIES = ['community', 'microsoft', 'chainguard', 'other'];
const MATCH = ['exact', 'prefix', 'suffix'];
const SEVERITY = ['critical', 'high', 'medium', 'low'];

const isStr = (v) => typeof v === 'string' && v.trim() !== '';
const isUrl = (v) => isStr(v) && /^https?:\/\//.test(v);
const isVersion = (v) => isStr(v) && /^\d+\.\d+\.\d+$/.test(v);

function checker() {
  const errors = [];
  const warnings = [];
  const str = (at, obj, field, soft, hard) => {
    const v = obj ? obj[field] : undefined;
    if (!isStr(v)) { errors.push(`${at}.${field} is required`); return; }
    if (hard && v.length > hard) errors.push(`${at}.${field} is ${v.length} chars (max ${hard})`);
    else if (soft && v.length > soft) warnings.push(`${at}.${field} is ${v.length} chars (target ${soft})`);
  };
  const urls = (at, v, min) => {
    if (!Array.isArray(v) || v.length < min || !v.every(isUrl)) errors.push(`${at} must be an array of at least ${min} http(s) URL(s)`);
  };
  const oneOf = (at, v, list) => { if (!list.includes(v)) errors.push(`${at} must be one of ${list.join('|')}`); };
  return { errors, warnings, str, urls, oneOf };
}

function catalogKeys() {
  const chunks = JSON.parse(fs.readFileSync(path.join(DIR, 'chunks.json'), 'utf8'));
  return new Set(chunks.flatMap((c) => c.keys.map((k) => `${k.kind}:${k.key}`)));
}

export function validateDefaults(data) {
  const c = checker();
  if (!Array.isArray(data) || data.length === 0) return { errors: ['file must be a non-empty JSON array'], warnings: [] };
  const known = catalogKeys();
  const ids = new Set();
  data.forEach((e, i) => {
    const at = e && isStr(e.id) ? e.id : `[${i}]`;
    if (!e || typeof e !== 'object') { c.errors.push(`${at} is not an object`); return; }
    if (!/^B\d+$/.test(e.id || '')) c.errors.push(`${at}.id must look like B1, B2, ...`);
    else if (ids.has(e.id)) c.errors.push(`${at}: duplicate id`);
    ids.add(e.id);
    c.str(at, e, 'title_en', 80, 110); c.str(at, e, 'title_fr', 90, 120);
    c.str(at, e, 'nginx_en', 200, 260); c.str(at, e, 'nginx_fr', 220, 290);
    if (!Array.isArray(e.controlledBy)) c.errors.push(`${at}.controlledBy must be an array ([] when nothing controls it)`);
    else e.controlledBy.forEach((k, j) => {
      if (!k || !KEY_KINDS.includes(k.kind) || !isStr(k.key)) { c.errors.push(`${at}.controlledBy[${j}] needs kind (${KEY_KINDS.join('|')}) and key`); return; }
      if (!known.has(`${k.kind}:${k.key}`)) c.errors.push(`${at}.controlledBy[${j}] ${k.kind}:${k.key} is not a catalog key (annotations without prefix, flags with --)`);
    });
    if (!e.targets || typeof e.targets !== 'object') c.errors.push(`${at}.targets is required`);
    else for (const t of TARGETS) {
      const v = e.targets[t];
      if (!v || typeof v !== 'object') { c.errors.push(`${at}.targets.${t} is required`); continue; }
      c.str(`${at}.targets.${t}`, v, 'en', 220, 280); c.str(`${at}.targets.${t}`, v, 'fr', 240, 310);
    }
    c.str(at, e, 'impact_en', 220, 280); c.str(at, e, 'impact_fr', 240, 310);
    c.str(at, e, 'test_en', 260, 340); c.str(at, e, 'test_fr', 280, 370);
    if (typeof e.derived !== 'boolean') c.errors.push(`${at}.derived must be true or false`);
    c.urls(`${at}.sources`, e.sources, 1);
    c.oneOf(`${at}.confidence`, e.confidence, CONFIDENCE);
  });
  return { errors: c.errors, warnings: c.warnings };
}

export function validateMeta(m) {
  const c = checker();
  if (!m || typeof m !== 'object' || Array.isArray(m)) return { errors: ['file must be a JSON object'], warnings: [] };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.catalogDate || '')) c.errors.push('catalogDate must be YYYY-MM-DD');
  const v = m.versions || {};
  for (const f of ['ingressNginx', 'gatewayApi', 'ingress2gateway']) if (!isStr(v[f])) c.errors.push(`versions.${f} is required`);

  if (!m.targets || typeof m.targets !== 'object') c.errors.push('targets is required');
  else for (const t of TARGETS) {
    const x = m.targets[t];
    if (!x) { c.errors.push(`targets.${t} is required`); continue; }
    c.str(`targets.${t}`, x, 'name_en', 70, 90); c.str(`targets.${t}`, x, 'name_fr', 80, 100); c.str(`targets.${t}`, x, 'short', 16, 20);
    if (!isUrl(x.docs)) c.errors.push(`targets.${t}.docs must be a URL`);
  }

  if (!Array.isArray(m.status) || m.status.length < 3) c.errors.push('status must list at least 3 dated lines');
  else m.status.forEach((s, i) => {
    const at = `status[${i}]`;
    if (!isStr(s.id)) c.errors.push(`${at}.id is required`);
    if (!/^\d{4}-\d{2}(-\d{2})?$/.test(s.date || '')) c.errors.push(`${at}.date must be YYYY-MM or YYYY-MM-DD`);
    c.str(at, s, 'text_en', 200, 260); c.str(at, s, 'text_fr', 220, 290);
    if (!isUrl(s.source)) c.errors.push(`${at}.source must be a URL`);
  });

  const d = m.detection || {};
  if (!Array.isArray(d.ingressClassControllers) || !d.ingressClassControllers.length) c.errors.push('detection.ingressClassControllers is required');
  else d.ingressClassControllers.forEach((x, i) => {
    const at = `detection.ingressClassControllers[${i}]`;
    if (!isStr(x.value)) c.errors.push(`${at}.value is required`);
    c.oneOf(`${at}.match`, x.match, MATCH); c.oneOf(`${at}.family`, x.family, CLASS_FAMILIES); c.str(at, x, 'label', 60, 80);
    if (!isUrl(x.source)) c.errors.push(`${at}.source must be a URL`);
  });
  if (!Array.isArray(d.ingressClassNames)) c.errors.push('detection.ingressClassNames must be an array (classes recognised by name when the controller string is undocumented)');
  else d.ingressClassNames.forEach((x, i) => {
    const at = `detection.ingressClassNames[${i}]`;
    if (!isStr(x.name)) c.errors.push(`${at}.name is required`);
    c.oneOf(`${at}.family`, x.family, CLASS_FAMILIES); c.str(at, x, 'label', 60, 80);
    if (!isUrl(x.source)) c.errors.push(`${at}.source must be a URL`);
  });
  if (!Array.isArray(d.nginxImages) || !d.nginxImages.length) c.errors.push('detection.nginxImages is required');
  else d.nginxImages.forEach((x, i) => {
    const at = `detection.nginxImages[${i}]`;
    if (!isStr(x.repository)) c.errors.push(`${at}.repository is required (registry/path without tag or digest)`);
    c.oneOf(`${at}.match`, x.match, MATCH); c.oneOf(`${at}.family`, x.family, IMAGE_FAMILIES); c.str(at, x, 'label', 60, 80);
    if (typeof x.semverComparable !== 'boolean') c.errors.push(`${at}.semverComparable must be true or false (false when upstream CVE status cannot be derived from the tag)`);
    if (!isUrl(x.source)) c.errors.push(`${at}.source must be a URL`);
  });
  if (!Array.isArray(d.gatewayClasses) || !d.gatewayClasses.length) c.errors.push('detection.gatewayClasses is required');
  else d.gatewayClasses.forEach((x, i) => {
    const at = `detection.gatewayClasses[${i}]`;
    if (!isStr(x.name) && !isStr(x.controllerName)) c.errors.push(`${at} needs a name or a controllerName`);
    c.oneOf(`${at}.target`, x.target, TARGETS);
    if (!(x.controllerName === null || isStr(x.controllerName))) c.errors.push(`${at}.controllerName must be a string or null (null when undocumented)`);
    if (!isUrl(x.source)) c.errors.push(`${at}.source must be a URL`);
  });
  const a = d.appRouting || {};
  for (const f of ['namespace', 'crd']) if (!isStr(a[f])) c.errors.push(`detection.appRouting.${f} is required`);
  if (!Array.isArray(a.ingressClasses) || !a.ingressClasses.every(isStr)) c.errors.push('detection.appRouting.ingressClasses must be an array of class names');
  if (!isUrl(a.source)) c.errors.push('detection.appRouting.source must be a URL');

  if (!Array.isArray(m.vulnerabilities) || !m.vulnerabilities.length) c.errors.push('vulnerabilities is required');
  else m.vulnerabilities.forEach((x, i) => {
    const at = `vulnerabilities[${i}]`;
    if (!/^CVE-\d{4}-\d{4,}$/.test(x.id || '')) c.errors.push(`${at}.id must be a CVE id`);
    c.oneOf(`${at}.severity`, x.severity, SEVERITY);
    if (!Array.isArray(x.fixed) || !x.fixed.length || !x.fixed.every(isVersion)) c.errors.push(`${at}.fixed must list the first fixed version of each maintained minor line, e.g. ["1.11.5", "1.12.1"]`);
    c.str(at, x, 'summary_en', 140, 180); c.str(at, x, 'summary_fr', 160, 200);
    if (!isUrl(x.source)) c.errors.push(`${at}.source must be a URL`);
  });

  const g = m.ingress2gateway || {};
  for (const f of ['version', 'command']) if (!isStr(g[f])) c.errors.push(`ingress2gateway.${f} is required`);
  if (!isUrl(g.source)) c.errors.push('ingress2gateway.source must be a URL');
  return { errors: c.errors, warnings: c.warnings };
}

function main() {
  const which = process.argv[2];
  const files = { defaults: 'behavior-defaults.json', meta: 'meta.json' };
  if (!files[which]) { console.error('usage: node tools/validate-data.mjs defaults|meta'); process.exit(2); }
  const file = path.join(DIR, files[which]);
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (x) { console.error(`cannot read or parse ${file}: ${x.message}`); process.exit(1); }
  const { errors, warnings } = which === 'defaults' ? validateDefaults(data) : validateMeta(data);
  for (const w of warnings) console.log(`WARN  ${w}`);
  for (const e of errors) console.log(`ERROR ${e}`);
  if (errors.length) { console.log(`INVALID ${files[which]}: ${errors.length} error(s), ${warnings.length} warning(s)`); process.exit(1); }
  console.log(`OK ${files[which]}${Array.isArray(data) ? `: ${data.length} entries` : ''}, ${warnings.length} warning(s)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
