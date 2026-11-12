// Consistency checks over the research catalog that the format validator cannot make: bucket rules,
// target support against the verified feature matrix (docs/research/facts/DIGEST.md section 2), and
// mechanisms a target does not have. Prints one line per finding; exit 1 when there are findings.
// Usage: node tools/catalog-lint.mjs [chunkId ...]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'docs', 'research', 'catalog');
const TARGETS = ['appRoutingGateway', 'agc', 'agcIngress', 'istio'];
const RANK = { 'n/a': 0, unknown: 1, no: 1, partial: 2, yes: 3 };

// Best support the digest matrix allows per theme, in TARGETS order (DIGEST.md section 2).
const MATRIX = [
  { theme: 'CORS', re: /^(enable-cors|cors-)/, max: ['partial', 'yes', 'no', 'partial'] },
  { theme: 'rate limiting', re: /^(limit-(rps|rpm|connections|burst-multiplier)|global-rate-limit)/, max: ['no', 'partial', 'no', 'partial'] },
  { theme: 'WAF', re: /^(enable-modsecurity|enable-owasp-core-rules|modsecurity-)/, max: ['no', 'yes', 'no', 'no'] },
  { theme: 'external auth', re: /^(auth-(url|signin|response-headers|request-redirect|method|cache-key|cache-duration|keepalive|proxy-set-headers|always-set-cookie|snippet|signin-redirect-param)|enable-global-auth|global-auth-)/, max: ['no', 'no', 'no', 'partial'] },
  { theme: 'basic auth', re: /^auth-(type|secret|secret-type|realm)$/, max: ['no', 'no', 'no', 'partial'] },
  { theme: 'session affinity', re: /^(affinity|affinity-mode)$|^session-cookie-/, max: ['no', 'yes', 'yes', 'partial'] },
  { theme: 'body size', re: /^(proxy-body-size|client-max-body-size)$/, max: ['no', 'unknown', 'unknown', 'partial'] },
  // Matrix cell "partial" on app routing is about mirror percentages (AKS 1.34+); a full mirror works everywhere.
  { theme: 'mirroring', re: /^mirror-/, max: ['yes', 'yes', 'no', 'yes'] },
  { theme: 'canary weights', re: /^canary(-weight|-weight-total)?$/, max: ['yes', 'yes', 'no', 'yes'] },
  { theme: 'frontend mTLS', re: /^auth-tls-/, max: ['partial', 'yes', 'no', 'yes'] },
  { theme: 'TLS passthrough', re: /^(ssl-passthrough|--enable-ssl-passthrough)$/, max: ['partial', 'no', 'no', 'partial'] },
  // proxy-next-upstream-timeout bounds total time, which HTTPRoute timeouts.request can do: not a retry setting.
  { theme: 'retries', re: /^(proxy-next-upstream(-tries)?|retry-non-idempotent)$/, max: ['no', 'partial', 'partial', 'partial'] },
  { theme: 'error pages', re: /^(custom-http-errors|default-backend)$/, max: ['no', 'partial', 'unknown', 'partial'] },
  { theme: 'TCP/UDP', re: /^--(tcp|udp)-services-configmap$/, max: ['partial', 'no', 'no', 'partial'] },
];
const NO_ISTIO_CRDS = /DestinationRule|AuthorizationPolicy|EnvoyFilter|RequestAuthentication|PeerAuthentication|WasmPlugin/;

const chunks = JSON.parse(fs.readFileSync(path.join(DIR, 'chunks.json'), 'utf8'));
const only = process.argv.slice(2);
const findings = [];
for (const c of chunks) {
  if (only.length && !only.includes(c.id)) continue;
  const entries = JSON.parse(fs.readFileSync(path.join(DIR, `${c.id}.json`), 'utf8'));
  for (const e of entries) {
    const at = `${c.id} ${e.kind}:${e.key}`;
    const add = (m) => findings.push(`${at}: ${m}`);
    const sup = (t) => (e.targets && e.targets[t] && e.targets[t].support) || 'unknown';
    const how = (t) => (e.targets && e.targets[t] && e.targets[t].how_en) || '';
    const g = e.gatewayApi || {};

    // Bucket rules (validator warnings made explicit, plus rule buckets).
    const weak = ['appRoutingGateway', 'agc', 'istio'].filter((t) => RANK[sup(t)] < 2);
    if (e.bucket === 'direct' && weak.length) add(`bucket direct but ${weak.map((t) => `${t}=${sup(t)}`).join(', ')}`);
    if (e.bucket === 'direct' && g.channel === 'experimental') add('bucket direct with an experimental construct');
    for (const r of e.valueRules || []) {
      const rsup = (t) => (r.targets && r.targets[t]) || sup(t);
      const rweak = ['appRoutingGateway', 'agc', 'istio'].filter((t) => RANK[rsup(t)] < 2);
      if (r.bucket === 'direct' && rweak.length) add(`valueRule "${r.when}" is direct but targets say ${rweak.map((t) => `${t}=${rsup(t)}`).join(', ')} (add rule targets?)`);
    }
    // Mechanisms a target does not have.
    if (RANK[sup('appRoutingGateway')] >= 2 && NO_ISTIO_CRDS.test(how('appRoutingGateway'))) add(`appRoutingGateway ${sup('appRoutingGateway')} relies on an Istio CRD it does not support: "${how('appRoutingGateway')}"`);
    if (sup('istio') === 'yes' && /EnvoyFilter/.test(how('istio')) && !/HTTPRoute|Gateway API|BackendTLSPolicy|AuthorizationPolicy|DestinationRule/.test(how('istio'))) add(`istio yes through EnvoyFilter only (Allowed, not Azure-supported: partial at best): "${how('istio')}"`);
    // Matrix ceilings.
    const name = e.kind === 'flag' ? e.key : e.key;
    for (const m of MATRIX) {
      if (!m.re.test(name) || e.kind === 'ecosystem') continue;
      TARGETS.forEach((t, i) => {
        if (RANK[sup(t)] > RANK[m.max[i]]) add(`${m.theme}: ${t}=${sup(t)} exceeds the matrix (${m.max[i]})`);
      });
    }
  }
}
for (const f of findings) console.log(f);
console.log(`${findings.length} finding(s)`);
process.exit(findings.length ? 1 : 0);
