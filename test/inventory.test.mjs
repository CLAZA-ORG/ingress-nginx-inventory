// Tests for ingress-inventory.mjs (node --test). UPDATE_GOLDEN=1 refreshes test/golden/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  CATALOG, I18N, FLAG_DEFAULTS, parseArgs, UsageError, isAllowedKubectlCall, kubectlArgs, collectLive, loadFromDir,
  analyze, anonymize, renderMarkdown, matchValueRule, isVersionFixed, parseVersion, parseControllerFlags, main, frTypo,
} from '../ingress-inventory.mjs';
import { catalogBlock, embed } from '../tools/embed-catalog.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'test', 'fixtures');
const GOLDEN = path.join(ROOT, 'test', 'golden');
const NOW = '2026-11-09T12:00:00Z';

const ns = (o, namespace) => ({ ...o, metadata: { ...o.metadata, namespace } });
const ingress = (namespace, name, spec, annotations = {}) => ({ apiVersion: 'networking.k8s.io/v1', kind: 'Ingress', metadata: { namespace, name, annotations }, spec });
const rule = (host, p = '/') => ({ host, http: { paths: [{ path: p, pathType: 'Prefix', backend: { service: { name: 'web', port: { number: 80 } } } }] } });
const ingressClass = (name, controller) => ({ kind: 'IngressClass', metadata: { name }, spec: { controller } });
const deployment = (namespace, name, image, args, extra = {}) => ({
  kind: 'Deployment', metadata: { namespace, name },
  spec: { replicas: 1, template: { metadata: { labels: { app: name } }, spec: { containers: [{ name: 'controller', image, ...(args ? { args } : {}), ...extra }] } } },
});
const snapshot = (parts) => ({
  mode: 'offline', context: 'test', version: null, ingressClasses: [], ingresses: [], deployments: [], daemonsets: [], services: [],
  configMaps: [], nics: null, gatewayClasses: null, gateways: null, httpRoutes: null, gatewayCrd: null, warnings: [], notes: [], ...parts,
});
const COMMUNITY = 'registry.k8s.io/ingress-nginx/controller:v1.15.1';

test('kubectl allowlist accepts the documented calls and refuses everything else', () => {
  const ok = [
    ['version', '-o', 'json'], ['config', 'current-context'],
    ['get', 'ingresses.networking.k8s.io', '-A', '-o', 'json'], ['get', 'ingressclasses.networking.k8s.io', '-o', 'json'],
    ['get', 'configmap', 'ingress-nginx-controller', '-n', 'ingress-nginx', '-o', 'json'],
    ['get', 'crd', 'gateways.gateway.networking.k8s.io', '-o', 'jsonpath={.metadata.annotations}'],
  ];
  for (const core of ok) assert.equal(isAllowedKubectlCall(kubectlArgs(core, { context: 'c', kubeconfig: '/k' })), true, core.join(' '));
  const bad = [
    ['apply', '-f', 'x.yaml'], ['delete', 'ingress', 'a'], ['patch', 'ingress', 'a'], ['exec', 'pod', '--', 'sh'], ['logs', 'pod'],
    ['get', 'secrets', '-A', '-o', 'json'], ['get', 'secret', '-A', '-o', 'json'], ['get', 'sec', '-A', '-o', 'json'],
    ['get', 'configmap', 'my-secret', '-n', 'ns', '-o', 'json'], ['get', 'configmap', '-A', '-o', 'json'],
    ['get', 'ingresses.networking.k8s.io', '-A', '-o', 'yaml'], ['get', 'pods', '-A', '-o', 'json'],
    ['get', 'ingresses.networking.k8s.io', '-A', '-o', 'json', '--token=abc'], ['get', 'configmap', 'a', '-n', 'Bad_NS', '-o', 'json'],
  ];
  for (const core of bad) assert.equal(isAllowedKubectlCall(kubectlArgs(core)), false, core.join(' '));
});

test('usage errors exit 2, help and version exit 0', () => {
  assert.throws(() => parseArgs(['--bogus']), UsageError);
  assert.throws(() => parseArgs(['--out']), UsageError);
  assert.throws(() => parseArgs(['--lang', 'de']), UsageError);
  assert.throws(() => parseArgs(['--from-dir', 'x', '--kubectl', 'k']), UsageError);
  const quiet = { out: () => {}, err: () => {} };
  assert.equal(main(['--bogus'], {}, quiet), 2);
  assert.equal(main(['--help'], {}, quiet), 0);
  assert.equal(main(['--version'], {}, quiet), 0);
});

test('both languages have the same I18N keys', () => {
  assert.deepEqual(Object.keys(I18N.fr).sort(), Object.keys(I18N.en).sort());
});

test('the embedded catalog matches catalog/*.json', () => {
  const source = fs.readFileSync(path.join(ROOT, 'ingress-inventory.mjs'), 'utf8');
  assert.equal(embed(source, catalogBlock()), source, 'run npm run build');
  assert.ok(CATALOG.meta && CATALOG.annotations.length > 100 && CATALOG.defaults.length >= 30);
});

test('the source uses no API newer than Node 18', () => {
  const source = fs.readFileSync(path.join(ROOT, 'ingress-inventory.mjs'), 'utf8').split('// BEGIN CATALOG')[0]
    + fs.readFileSync(path.join(ROOT, 'ingress-inventory.mjs'), 'utf8').split('// END CATALOG')[1];
  for (const re of [/\.toSorted\(/, /\.toReversed\(/, /\.toSpliced\(/, /\.with\(/, /Object\.groupBy/, /Map\.groupBy/, /Promise\.withResolvers/, /Array\.fromAsync/, /\.union\(/, /\/[a-z]*v[a-z]*\.test/, /with \{ type:/, /globSync/, /styleText/, /loadEnvFile/]) {
    assert.equal(re.test(source), false, String(re));
  }
});

test('valueRules: first match wins; equals, in and contains ignore case and spaces', () => {
  const rules = [
    { test: { op: 'equals', value: 'GRPC' } }, { test: { op: 'in', value: ['https', 'grpcs'] } },
    { test: { op: 'regex', value: '\\$\\d' } }, { test: { op: 'contains', value: 'lua' } }, { test: { op: 'exists' } },
  ];
  assert.equal(matchValueRule(rules, ' grpc '), 0);
  assert.equal(matchValueRule(rules, 'HTTPS'), 1);
  assert.equal(matchValueRule(rules, '/$2'), 2);
  assert.equal(matchValueRule(rules, 'access_by_LUA_block'), 3);
  assert.equal(matchValueRule(rules, 'anything'), 4);
  assert.equal(matchValueRule([], 'x'), -1);
});

test('CVE rule: fixed per maintained line, or above every listed line', () => {
  const fixed = ['1.11.5', '1.12.1'];
  assert.equal(isVersionFixed(parseVersion('v1.11.4'), fixed), false);
  assert.equal(isVersionFixed(parseVersion('v1.11.5'), fixed), true);
  assert.equal(isVersionFixed(parseVersion('v1.12.0'), fixed), false);
  assert.equal(isVersionFixed(parseVersion('v1.13.0'), fixed), true);
  assert.equal(isVersionFixed(parseVersion('v1.10.9'), fixed), false);
});

test('controller flags: both pflag forms, defaults, $(POD_NAMESPACE) only from fieldRef', () => {
  const { flags } = parseControllerFlags(['--configmap', '$(POD_NAMESPACE)/cm', '--watch-ingress-without-class', '--ingress-class=public', '--secret-thing=$(TOKEN)'], { POD_NAMESPACE: 'ingress' });
  assert.equal(flags['--configmap'], 'ingress/cm');
  assert.equal(flags['--watch-ingress-without-class'], 'true');
  assert.equal(flags['--ingress-class'], 'public');
  assert.equal(flags['--controller-class'], FLAG_DEFAULTS['--controller-class']);
  assert.equal(Object.prototype.hasOwnProperty.call(flags, '--secret-thing'), false);
});

test('attribution follows ingress-nginx: field first, then annotation, classless only when watched', () => {
  const snap = snapshot({
    ingressClasses: [ingressClass('nginx', 'k8s.io/ingress-nginx'), ingressClass('traefik', 'traefik.io/ingress-controller'), { ...ingressClass('default-nginx', 'k8s.io/ingress-nginx'), metadata: { name: 'default-nginx', annotations: { 'ingressclass.kubernetes.io/is-default-class': 'true' } } }],
    deployments: [deployment('ingress-nginx', 'ctrl', COMMUNITY, ['/nginx-ingress-controller', '--disable-catch-all=true'])],
    ingresses: [
      ingress('a', 'field', { ingressClassName: 'nginx', rules: [rule('a.example.com')] }, { 'kubernetes.io/ingress.class': 'traefik' }),
      ingress('a', 'annotation', { rules: [rule('b.example.com')] }, { 'kubernetes.io/ingress.class': 'nginx' }),
      ingress('a', 'empty-annotation', { rules: [rule('c.example.com')] }, { 'kubernetes.io/ingress.class': '' }),
      ingress('a', 'classless', { rules: [rule('d.example.com')] }),
      ingress('a', 'other', { ingressClassName: 'traefik', rules: [rule('e.example.com')] }),
      ingress('a', 'catch-all', { ingressClassName: 'nginx', defaultBackend: { service: { name: 'web', port: { number: 80 } } }, rules: [rule('f.example.com')] }),
    ],
  });
  const m = analyze(snap, { now: NOW });
  const by = Object.fromEntries(m.ingresses.map((i) => [i.name, i]));
  assert.deepEqual(by.field.servedBy, ['c1']);
  assert.equal(by.field.via, 'field');
  assert.deepEqual(by.annotation.servedBy, ['c1']);
  assert.equal(by['empty-annotation'].servedBy.length, 0);
  assert.equal(by.classless.placement.reason, 'classless', 'a default class never applies to an existing classless Ingress');
  assert.equal(by.other.placement.status, 'other');
  assert.equal(by['catch-all'].placement.reason, 'catchAll');
  assert.ok(m.ambiguities.some((a) => a.type === 'fieldAnnotationMismatch'));
});

test('watch-namespace, two controllers on one Ingress, Microsoft builds and image-only controllers', () => {
  const env = [{ name: 'POD_NAMESPACE', valueFrom: { fieldRef: { fieldPath: 'metadata.namespace' } } }];
  const snap = snapshot({
    ingressClasses: [ingressClass('nginx', 'k8s.io/ingress-nginx')],
    deployments: [
      deployment('team-a', 'scoped', COMMUNITY, ['/nginx-ingress-controller', '--watch-namespace=$(POD_NAMESPACE)'], { env }),
      deployment('ingress-nginx', 'global', 'registry.k8s.io/ingress-nginx/controller:v1.11.3', null),
      deployment('app-routing-system', 'nginx', 'mcr.microsoft.com/oss/v2/ingress-nginx/controller:v1.13.10-13', ['/nginx-ingress-controller', '--ingress-class', 'other', '--controller-class', 'webapprouting.kubernetes.azure.com/nginx']),
    ],
    ingresses: [ingress('team-a', 'shared', { ingressClassName: 'nginx', rules: [rule('a.example.com')] }), ingress('team-b', 'only-global', { ingressClassName: 'nginx', rules: [rule('b.example.com')] })],
  });
  const m = analyze(snap, { now: NOW });
  const c = Object.fromEntries(m.controllers.map((x) => [x.name, x]));
  assert.equal(c.scoped.flags['--watch-namespace'], 'team-a');
  assert.equal(c.global.verdict.status, 'vulnerable', 'an image with no args still runs the controller');
  assert.equal(c.nginx.verdict.status, 'vendor');
  const by = Object.fromEntries(m.ingresses.map((i) => [i.name, i]));
  assert.equal(by.shared.servedBy.length, 2);
  assert.ok(m.ambiguities.some((a) => a.type === 'multipleControllers'));
  assert.deepEqual(by['only-global'].servedBy, [c.global.id]);
});

test('community-basic: counts, buckets, security flags and network', () => {
  const m = analyze(loadFromDir(path.join(FIX, 'community-basic')), { now: NOW });
  assert.equal(m.controllers.length, 1);
  assert.equal(m.controllers[0].verdict.status, 'vulnerable');
  assert.equal(m.scope.ingresses, 4);
  assert.equal(m.scope.ingressesTotal, 5);
  assert.equal(m.scope.routes, 3, 'shared (host, path) pairs count once');
  assert.equal(m.regexHosts.length, 1);
  const codes = m.security.map((s) => s.code).sort();
  assert.deepEqual(codes, ['configSnippets', 'cveUnfixed', 'snippetAnnotations', 'snippetsAllowed', 'webhook']);
  assert.equal(m.network.services.length, 1);
  assert.equal(m.network.services[0].externalTrafficPolicy, 'Local');
  assert.equal(m.tcpUdp[0].entries.length, 1);
  const json = JSON.stringify(m);
  assert.equal(json.includes('do-not-print-me'), false, 'container env values are never output');
  for (const body of ['X-Shop: 1', 'location /internal']) assert.equal(json.includes(body), false, `snippet values are never output (${body})`);
  const snippet = m.annotations.find((r) => r.name === 'configuration-snippet');
  assert.equal(snippet.bucket, 'direct', 'headers-only snippet value rule');
  assert.equal(snippet.targets.appRoutingGateway, 'yes', 'a value rule can override target support');
});

test('catalog lint: buckets and support agree with the verified feature matrix', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'catalog-lint.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout);
});

test('unknown keys and a custom annotation prefix', () => {
  const snap = snapshot({
    ingressClasses: [ingressClass('nginx', 'k8s.io/ingress-nginx')],
    deployments: [deployment('ingress-nginx', 'ctrl', COMMUNITY, ['/nginx-ingress-controller', '--annotations-prefix=custom.example.com'])],
    ingresses: [ingress('a', 'x', { ingressClassName: 'nginx', rules: [rule('a.example.com')] }, {
      'custom.example.com/proxy-body-size': '8m', 'custom.example.com/proxy-bodysize': '8m', 'nginx.ingress.kubernetes.io/ssl-redirect': 'false', 'nginx.org/client-max-body-size': '4m',
    })],
  });
  const m = analyze(snap, { now: NOW });
  const by = Object.fromEntries(m.annotations.map((r) => [`${r.kind}:${r.name}`, r]));
  assert.ok(by['annotation:proxy-body-size'], 'catalog keys are read under the custom prefix');
  assert.equal(by['unknown:proxy-bodysize'].bucket, 'unknown');
  assert.equal(by['otherPrefix:nginx.ingress.kubernetes.io/ssl-redirect'].bucket, 'unknown');
  assert.equal(by['f5:nginx.org/client-max-body-size'].bucket, 'none');
});

test('empty cluster: a report with no controller', () => {
  const m = analyze(snapshot({}), { now: NOW });
  assert.equal(m.controllers.length, 0);
  assert.equal(m.scope.routes, 0);
  assert.match(renderMarkdown(m, { lang: 'en' }), /No ingress-nginx controller was found/);
});

test('live mode through a fake runner gives the same analysis as offline mode', () => {
  const dir = path.join(FIX, 'community-basic');
  const file = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    assert.equal(isAllowedKubectlCall(args), true, args.join(' '));
    const [a, b, c] = args;
    if (a === 'version') return { status: 0, stdout: file('version.json') };
    if (a === 'config') return { status: 0, stdout: 'test-context\n' };
    const map = { 'ingressclasses.networking.k8s.io': 'ingressclasses.json', 'ingresses.networking.k8s.io': 'ingresses.json', 'deployments.apps': 'deployments.json', services: 'services.json' };
    if (map[b]) return { status: 0, stdout: file(map[b]) };
    if (b === 'daemonsets.apps') return { status: 0, stdout: '{"kind":"List","items":[]}' };
    if (b === 'configmap') {
      const cm = JSON.parse(file('configmaps.json')).items.find((x) => x.metadata.name === c);
      return cm ? { status: 0, stdout: JSON.stringify(cm) } : { status: 1, stderr: 'Error from server (NotFound)' };
    }
    return { status: 1, stderr: "error: the server doesn't have a resource type" };
  };
  const live = analyze(collectLive({}, { runner }), { now: NOW });
  const offline = analyze(loadFromDir(dir), { now: NOW });
  assert.equal(live.context, 'test-context');
  for (const k of ['controllers', 'ingresses', 'scope', 'annotations', 'configMaps', 'security', 'network']) assert.deepEqual(live[k], offline[k], k);
  assert.ok(calls.every((args) => !args.some((a) => /secret/i.test(a))));
});

test('anonymization leaves no identifier from the fixture', () => {
  const m = analyze(loadFromDir(path.join(FIX, 'community-basic')), { now: NOW });
  const { model, map } = anonymize(m, { salt: Buffer.from('test-salt') });
  const text = JSON.stringify(model) + renderMarkdown(model, { lang: 'en' }) + renderMarkdown(model, { lang: 'fr' });
  for (const id of ['shop.example.com', 'blog.example.com', 'shop-web', 'shop-api', 'shop-tls', '20.0.113.10', '203.0.113.0/24', '198.51.100.7/32', 'pip-shop-prod', 'rg-network-prod', '"shop"', '/api(']) {
    assert.equal(text.includes(id), false, id);
  }
  assert.ok(map.DO_NOT_SHARE);
  assert.equal(Object.values(map.entries).some((e) => e.value === 'shop.example.com'), true);
});

test('French typography: non-breaking spaces, never inside code or URLs', () => {
  assert.equal(frTypo('Note : oui ; non ?'), 'Note : oui ; non ?');
  assert.equal(frTypo('`a : b` https://x.example/a?b'), '`a : b` https://x.example/a?b');
  assert.equal(frTypo('| ? |'), '| ? |');
  assert.equal(frTypo('Contexte: x; y'), 'Contexte : x ; y');
  assert.equal(frTypo('a &lt;ip&gt; b'), 'a &lt;ip&gt; b');
});

test('golden reports (community-basic, en and fr)', () => {
  const m = analyze(loadFromDir(path.join(FIX, 'community-basic')), { now: NOW });
  for (const lang of ['en', 'fr']) {
    const file = path.join(GOLDEN, `community-basic.${lang}.md`);
    const text = renderMarkdown(m, { lang });
    if (process.env.UPDATE_GOLDEN === '1' || !fs.existsSync(file)) { fs.mkdirSync(GOLDEN, { recursive: true }); fs.writeFileSync(file, text); }
    assert.equal(text, fs.readFileSync(file, 'utf8'), `${lang} report changed; check it, then UPDATE_GOLDEN=1 npm test`);
  }
});

test('end to end: main writes the files and refuses a foreign directory', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iiv-'));
  const out = path.join(tmp, 'out');
  const quiet = { out: () => {}, err: () => {} };
  assert.equal(main(['--from-dir', path.join(FIX, 'community-basic'), '--out', out, '--anonymize', '--quiet'], { INGRESS_INVENTORY_NOW: NOW }, quiet), 0);
  assert.deepEqual(fs.readdirSync(out).sort(), ['.ingress-inventory', 'anonymization-map.local.json', 'ingress-inventory.json', 'report.md']);
  const foreign = path.join(tmp, 'foreign');
  fs.mkdirSync(foreign); fs.writeFileSync(path.join(foreign, 'keep.txt'), 'x');
  assert.equal(main(['--from-dir', path.join(FIX, 'community-basic'), '--out', foreign], {}, quiet), 2);
  assert.equal(main(['--from-dir', path.join(tmp, 'missing')], {}, quiet), 1);
  fs.rmSync(tmp, { recursive: true, force: true });
});
