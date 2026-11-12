# ingress-nginx-inventory — build specification (v0.1.0)

Internal spec for the first release. The tool is free and open source (MIT). It is the first step of
CLAZA IT's "Sortie d'ingress-nginx sur AKS" offer: free inventory → fixed-price plan → migration.

## 1. Purpose

A read-only CLI that inventories how a Kubernetes cluster (AKS first, any cluster works) uses
ingress-nginx, and writes a migration-readiness report for moving to the Gateway API on one of four
AKS targets:

| id | Target |
|---|---|
| `appRoutingGateway` | AKS application routing add-on, Gateway API implementation (Istio-based) |
| `agc` | Application Gateway for Containers, Gateway API |
| `agcIngress` | Application Gateway for Containers, Ingress API (keep Ingress objects, change controller) |
| `istio` | AKS Istio-based service mesh add-on, Gateway API ingress |

Research inputs (verified, with sources): `docs/research/facts/F1…F9`, catalog groups in
`docs/research/catalog/*.json` and `docs/research/catalog/README.md`.

## 2. Hard constraints

1. **One file**, `ingress-inventory.mjs`, zero dependencies. Runs on the Node.js version of Azure Cloud
   Shell (see F7) and newer. Use only ES2022 syntax and `node:` built-ins available in Node 18
   (`fs`, `path`, `child_process`, `crypto`, `url`, `os`, `process`). Forbidden: `Array.prototype.toSorted`
   / `toReversed` / `toSpliced` / `with`, `Object.groupBy`, `Map.groupBy`, `Promise.withResolvers`,
   `Array.fromAsync`, Set methods (`union`, …), RegExp `v` flag, JSON import attributes,
   `fs.globSync`, `util.styleText`, `process.loadEnvFile`.
2. **Read-only.** Every kubectl call goes through one function with an allowlist: verbs `get`,
   `version`, `config current-context`. Never `secrets` (or `secret`, `sec`) in any form. No other
   process, no network call, no telemetry. The only writes are the output files under `--out`.
3. **Never read Secrets.** TLS secret *names* come from `Ingress.spec.tls[].secretName` only.
4. **Never output container env or arbitrary args.** From controller workloads keep only: image,
   the allowlisted flags below, pod template labels, namespace/name, replicas. `$(VAR)` references in
   flag values are expanded only from env entries whose `valueFrom.fieldRef.fieldPath` is
   `metadata.namespace` or `metadata.name` (the workload's own namespace or name); other references
   stay as written. Env values are never printed.
5. **Deterministic** for the same input: sort everything; the clock is injectable
   (`INGRESS_INVENTORY_NOW` env var, ISO string) for golden tests.
6. **Offline mode** `--from-dir <dir>` analyses exported JSON files (same shapes as `kubectl get -o json`).
7. **Embedded catalog** between the markers `// BEGIN CATALOG` and `// END CATALOG`, written by
   `tools/embed-catalog.mjs` from `catalog/*.json`. A test fails if the block and the JSON files differ.
8. **Bilingual**: `--lang en|fr`; default `en`, or `fr` when `LC_ALL`/`LANG` starts with `fr`. All
   user-facing strings live in one `I18N` table; a test checks both languages have the same keys.
   French strings (I18N and catalog `*_fr` fields) are written with ordinary spaces; the renderer
   applies French typography to them (U+202F before `;` `!` `?`, U+00A0 before `:` and inside « »),
   never inside code spans, URLs, times or table syntax.
9. **Exit codes**: 0 success (findings are not errors), 1 fatal (kubectl missing, cluster unreachable,
   cannot list Ingresses, unreadable `--from-dir`), 2 usage error.

## 3. CLI

```
node ingress-inventory.mjs [options]

  --context <name>      kubectl context (default: current context)
  --kubeconfig <path>   passed through to kubectl
  --kubectl <path>      kubectl binary (default: kubectl on PATH)
  --from-dir <dir>      analyse exported JSON files instead of calling kubectl
  --out <dir>           output directory (default: ./ingress-inventory-<context>-<YYYYMMDD-HHmm>)
  --lang en|fr          report language
  --anonymize           pseudonymise identifiers; writes the lookup table to a separate local file
  --quiet               only print output paths
  -h, --help            usage
  -v, --version         version
```

Unknown options and missing values → usage error (exit 2). The `--out` directory is created if
missing; refuse to write into an existing non-empty directory unless it was created by this tool
(marker file `.ingress-inventory`), to avoid clobbering.

## 4. Data collection

Live mode runs, with `--request-timeout=60s` and `--context`/`--kubeconfig` when given, through
`spawnSync(kubectl, args, { encoding: 'utf8', maxBuffer: 1 GiB, windowsHide: true })` — never a shell:

| # | Command | On failure |
|---|---|---|
| 1 | `kubectl version -o json` | warn, continue |
| 2 | `kubectl config current-context` (only if `--context` absent) | warn, use `unknown-context` |
| 3 | `kubectl get ingressclasses.networking.k8s.io -o json` | warn, continue |
| 4 | `kubectl get ingresses.networking.k8s.io -A -o json` | **fatal** |
| 5 | `kubectl get deployments.apps -A -o json`, `kubectl get daemonsets.apps -A -o json` | warn |
| 6 | `kubectl get services -A -o json` | warn |
| 7 | `kubectl get configmap <name> -n <ns> -o json` for each `--configmap`, `--tcp-services-configmap`, `--udp-services-configmap` of a detected NGINX controller | warn |
| 8 | optional, silent when the resource type does not exist: `nginxingresscontrollers.approuting.kubernetes.azure.com`, `gatewayclasses.gateway.networking.k8s.io`, `gateways.gateway.networking.k8s.io -A`, `httproutes.gateway.networking.k8s.io -A`, and `crd gateways.gateway.networking.k8s.io -o jsonpath={.metadata.annotations}` (bundle version and channel) | ignore |

The collection layer takes an injectable runner `(args) => { status, stdout, stderr }` so tests cover
live mode without spawning anything.

Offline mode reads these files from `--from-dir` (missing optional files are skipped with a note):
`ingresses.json` (required), `ingressclasses.json`, `deployments.json`, `daemonsets.json`,
`services.json`, `configmaps.json` (a List of the controller ConfigMaps only), `version.json`,
`nginxingresscontrollers.json`, `gatewayclasses.json`, `gateways.json`, `httproutes.json`.
The README gives the exact kubectl commands, including through `az aks command invoke` for private
clusters (see F7), and warns to export ConfigMaps only from the controller namespace.

## 5. Analysis

### 5.1 Controllers
Follow the decision rules in F8 §0; detection data comes from `catalog/meta.json` (`detection`).
- **Workloads first.** A Deployment/DaemonSet container runs ingress-nginx when its image repository
  matches `detection.nginxImages`, or its first arg or command is `/nginx-ingress-controller`
  (F8 §0.1; an ingress-nginx image with no args still runs the controller with default flags). Do not
  rely on the `app.kubernetes.io/name=ingress-nginx` label alone (AKS app routing pods lack it).
- **Flags** are parsed in both `--flag=value` and `--flag value` forms (pflag); an absent flag takes
  its default (F8 §6). Allowlist: `--annotations-prefix`, `--controller-class`, `--ingress-class`,
  `--watch-ingress-without-class`, `--ingress-class-by-name`, `--watch-namespace`,
  `--watch-namespace-selector`, `--configmap`, `--tcp-services-configmap`, `--udp-services-configmap`,
  `--default-ssl-certificate`, `--enable-ssl-passthrough`, `--default-backend-service`,
  `--publish-service`, `--publish-status-address`, `--update-status`, `--disable-catch-all`,
  `--deep-inspect`, `--validating-webhook`, `--enable-annotation-validation`.
- **IngressClass ownership** by `spec.controller` equal to `--controller-class`, or by name only with
  `--ingress-class-by-name` (F8 §1.2.1); never by class name otherwise (`nginx` is also the F5 NGINX
  default). Other controllers are labelled from `detection.ingressClassControllers` (AGIC, Traefik,
  Kong, HAProxy, Contour, Istio, Cilium, Envoy Gateway, **F5 NGINX Ingress Controller**, ...) and
  reported as "not affected by the ingress-nginx retirement"; classes whose controller string is
  undocumented (AGC `azure-alb-external`, `azure-alb-internal`) are recognised by name from
  `detection.ingressClassNames`.
- **Version** from the image tag (ignore digests). Image families with `semverComparable: false`
  (Microsoft builds such as `v1.13.10-13`) and versions above the last upstream releases are vendor
  builds: report the version and say the CVE status must be checked with the vendor (F8 §0.6, §2.4).
  Otherwise apply `vulnerabilities[].fixed`: a version is fixed when a listed version has the same
  major.minor and the version is greater or equal, or when its minor is above every listed minor.
- Admission webhook: `--validating-webhook` set → exposure note for the CVEs F8 §6 lists.
- App routing add-on: namespace and NginxIngressController resources (names, ingressClassName,
  load balancer annotations).
- Status lines (dated, with source URLs) come from `meta.json` `status`.

### 5.2 Which Ingresses ingress-nginx serves
Replay ingress-nginx's own decision per controller instance (F8 §0.4, §1.2), first match wins:
1. `spec.ingressClassName` set → served only if that class is owned (5.1); the annotation is ignored.
2. else the `kubernetes.io/ingress.class` annotation → served only if it equals `--ingress-class`
   exactly (an empty value is rejected).
3. else (classless) → served only with `--watch-ingress-without-class=true`. The default IngressClass
   does **not** apply here: the API server sets it only at creation, so a classless Ingress stays
   classless (F8 §1.2.4). Report classless Ingresses explicitly.
4. then the filters: namespace scope (`--watch-namespace`; a `--watch-namespace-selector` is reported
   as "not evaluated"), `--disable-catch-all=true` (ignores every Ingress with `spec.defaultBackend`),
   and `--deep-inspect` (default true; ignores Ingresses whose host, path or TLS fields match the
   blocked patterns in F8 §1.2.3).
Report ambiguity (several controllers claiming one Ingress, field and annotation that disagree; F8
§0.5). Others are listed per controller; Ingresses no controller serves are "unassigned".

### 5.3 Routes — the pricing unit (must match the offer sheet)
`routes` = number of distinct `(host, path)` pairs across `spec.rules[].http.paths[]` of the Ingresses
served by ingress-nginx; host = `rule.host` or `*`; path = `path.path` or `/`. Each
`spec.defaultBackend` adds one. Also count: Ingress objects, namespaces, distinct hosts, TLS hosts,
distinct TLS secret names, `ImplementationSpecific` paths, regex paths, distinct backend Services.

### 5.4 Annotations
- Prefix per controller from `--annotations-prefix` (default `nginx.ingress.kubernetes.io`).
- Look each key up in the catalog (kind `annotation`); ecosystem keys (kind `ecosystem`, exact or
  prefix match); `nginx.org/*` keys are reported as F5-controller annotations ignored by ingress-nginx.
- `valueRules`: the first matching rule overrides bucket and note. Ops: `equals` (trimmed,
  case-insensitive), `in`, `regex`, `contains`, `exists`.
- Unknown keys → bucket `unknown` ("not in catalog: typo, custom prefix or removed annotation").
- `use-regex` or a `rewrite-target` on any Ingress of a host changes path matching for every path of
  that host across all Ingresses (F8 §6): flag the whole host.
- Aggregate per key: Ingress count, up to 5 distinct values (never print snippet values: print the
  line count), bucket, Gateway API construct, per-target support, note.

### 5.5 Controller ConfigMap
Report only keys present in the ConfigMap (catalog kind `configmap`, valueRules, unknown handling).
Snippet keys and `allow-snippet-annotations: "true"` raise a security note. TCP/UDP services ConfigMaps:
count entries; map with the catalog flag entries.

### 5.6 Defaults that change
`catalog/behavior-defaults.json` (built from the verified F5) lists default behaviours that change
after migration. Show each with the NGINX default *as configured in this cluster* (a ConfigMap
override replaces the default), the per-target behaviour, the impact and the test to run.

### 5.7 Network
LoadBalancer (and NodePort) Services whose selector matches an NGINX controller pod template:
addresses from `status.loadBalancer.ingress`, internal LB annotation, pinned IP (`azure-pip-name`,
`azure-load-balancer-ipv4`, `spec.loadBalancerIP`), `externalTrafficPolicy`, ports. Notes come from
the catalog `ecosystem` entries with scope `service`. Remind that Front Door origins, DNS records,
App Gateway backends and firewall/NSG allow-lists pointing at these addresses change at cutover.

### 5.8 Gateway API already present
GatewayClasses matched to targets by name from `detection.gatewayClasses`, reporting the live
`spec.controllerName` (the `approuting-istio` controller name is not documented; never hard-code an
undocumented one). CRD bundle version and channel from the CRD annotations
`gateway.networking.k8s.io/bundle-version` and `gateway.networking.k8s.io/channel`; the AKS managed
bundle is standard channel only and follows the Kubernetes minor (F2), which decides which Gateway
API features are usable. Counts of Gateways and HTTPRoutes.

## 6. Outputs

Files in `--out`: `report.md`, `ingress-inventory.json` (`schemaVersion: 1`, same data), the marker
file, and with `--anonymize` also `anonymization-map.local.json` (top-level key `"DO_NOT_SHARE"`).

Console (localized, < 12 lines): tool name and version with "read-only", context, controllers found
with status, counts (Ingresses, namespaces, routes), buckets, output paths.

### report.md sections (localized)
0. Title, metadata (context or pseudonym, generated at, tool and catalog versions, live/offline,
   anonymized), and "Read-only: this tool only ran `kubectl get`; nothing left this machine."
1. **Summary** — one screen: controllers and support status with dated sources; security flags;
   scope (Ingresses, namespaces, routes, hosts, TLS); translation profile (keys and Ingresses per
   bucket); load balancer addresses that will change; targets already enabled; next step.
2. **Annotations** — table sorted by bucket (redesign, unknown, policy, direct, none) then usage:
   key | Ingresses | bucket | Gateway API | app routing GW | AGC | AGC Ingress | Istio | note.
   Support cells: ✓ yes, ~ partial, ✗ no, ? unknown (legend under the table).
3. **Controller settings** (non-default ConfigMap keys).
4. **Defaults that change** (5.6).
5. **TCP/UDP, SSL passthrough, default certificate, default backend.**
6. **Network and load balancers.**
7. **Inventory per namespace** in `<details>` blocks: Ingress | class | hosts | routes | TLS | keys by bucket.
8. **Other controllers and unassigned Ingresses.**
9. **Next steps**: choose a target; draft manifests with ingress2gateway (exact command from F6);
   handle policy and redesign items; plan address, DNS and certificate changes; test the defaults;
   cutover and rollback. Then one short paragraph: CLAZA IT delivers a fixed-price migration plan from
   this report (link). No price in the tool, no hype.
10. **About**: catalog date, sources, disclaimer (informational, verify in your environment; not
    affiliated with Microsoft, the Kubernetes project or F5).

Constants at the top of the file, flagged `TODO before publishing`:
`REPO_URL = 'https://github.com/CLAZA-ORG/ingress-nginx-inventory'`,
`OFFER_URL = { fr: 'https://claza.cloud/sortie-ingress-nginx-aks/', en: 'https://claza.cloud/en/aks-ingress-nginx-migration/' }`.

## 7. Anonymization

Stable pseudonyms per run (HMAC-SHA256 with a random 16-byte salt, 6 hex chars): context
`cluster-…`, namespace `ns-…`, Ingress/Service/workload names `ing-…`/`svc-…`/`wl-…`, hosts
`h-….example`, TLS secrets `sec-…`, IPs `ip-…`, CIDRs `cidr-…`, path segments `p-…` (structure kept;
regex flags and counts computed before pseudonymising). In annotation and ConfigMap values, replace
every token that looks like a hostname, IP, CIDR, URL or e-mail. Snippet values are never printed.
A test asserts that no identifier from the fixtures appears in anonymized outputs.

## 8. Catalog files

`catalog/annotations.json`, `catalog/configmap.json`, `catalog/flags.json`, `catalog/ecosystem.json`
(entries as in `docs/research/catalog/README.md`, sorted by key; the research chunks
`docs/research/catalog/<chunk>.json` are checked by `tools/validate-chunk.mjs`),
`catalog/behavior-defaults.json` and `catalog/meta.json` (copied from `docs/research/catalog/`, formats
enforced by `tools/validate-data.mjs`: defaults = id, title, NGINX default, `controlledBy` catalog
keys, per-target behaviour, impact, test, sources; meta = catalog date, versions, target names,
dated status lines, detection data, CVE fixed versions, the ingress2gateway command).
`tools/merge-research.mjs` builds `catalog/` from `docs/research/catalog/` deterministically and
fails when any validator reports an error.

## 9. Tests (`node --test`, no dependencies)

Fixtures in `test/fixtures/<scenario>/` (offline-mode files):
`community-basic` (vulnerable community controller, default class, regex rewrite, ssl-redirect
false, body size, canary, allow-list, configuration snippet, ConfigMap with snippets allowed and HSTS
off, pinned public IP with `externalTrafficPolicy: Local`, one TCP service), `app-routing` (AKS add-on
classes and NginxIngressController resources, cert-manager and ExternalDNS annotations, app routing
GatewayClass present), `mixed-controllers` (AGIC, Traefik, F5 NGINX with `nginx.org/*`, legacy class
annotation, no-class Ingress with `--watch-ingress-without-class`, unassigned Ingress),
`custom-prefix`, `unknown-annotations`, `empty`.

Tests: kubectl allowlist (rejects apply/delete/patch/exec/secrets); detection and attribution per
fixture; the routes count; valueRules ops; unknown keys; ConfigMap and snippet flags; anonymization
leak scan; i18n key parity; golden reports (`community-basic` in en and fr, fixed clock;
`UPDATE_GOLDEN=1` refreshes); catalog embed sync; forbidden-API scan of the source; usage errors
exit 2; live mode through an injected fake runner.

## 10. Repository files

`ingress-inventory.mjs`, `catalog/`, `tools/embed-catalog.mjs`, `tools/merge-research.mjs`, `test/`,
`README.md` (English), `README.fr.md` (French), `LICENSE` (MIT, "Copyright (c) 2026 CLAZA IT"),
`SECURITY.md` (report to contact@claza.cloud), `CHANGELOG.md`, `package.json` (`"type": "module"`,
`engines.node` per F7, scripts `test`, `build`), `.gitignore`, `docs/rbac/read-only-clusterrole.yaml`
(least privilege from F7, no secrets).

README: what it does and why now (dated, sourced); Cloud Shell quick start (`az aks get-credentials`,
download a pinned release, verify the SHA-256, `node ingress-inventory.mjs --lang fr`); private
clusters (`az aks command invoke` + `--from-dir`, jump box); the exact kubectl commands it runs and
what it never does; outputs and `--anonymize`; how to read buckets and targets; limitations
(catalog date; verify; not official); next step with ingress2gateway; license; one short line on
CLAZA IT's fixed-price plan.
