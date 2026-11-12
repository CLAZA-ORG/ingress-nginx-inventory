# Research catalog

Source of `catalog/*.json`, which `npm run build` merges and embeds in `ingress-inventory.mjs`.
Catalog date: 2026-11-09. Facts as of 2026-11-04 (see `../facts/DIGEST.md`).

## Files

| File | Content |
|---|---|
| `chunks.json` | the 489 keys, split into 16 chunks, with the ingress-nginx v1.15.1 default and description of each |
| `A1`–`A6.json` | 150 annotations (prefix `nginx.ingress.kubernetes.io/` omitted) |
| `E1.json` | 19 ecosystem keys: IngressClass selection, cert-manager, ExternalDNS, Azure load balancer settings on the controller Service |
| `C1`–`C5.json`, `L1`–`L2.json` | 233 controller ConfigMap keys |
| `L3`–`L4.json` | 87 controller flags |
| `behavior-defaults.json` | 30 default behaviours that change after migration (B1–B30, from F5) |
| `meta.json` | catalog date, versions, target names, dated status lines, detection data, CVE fixed versions, ingress2gateway command |

## Entry format

`tools/validate-chunk.mjs` defines and checks it; `tools/validate-data.mjs` does the same for the two data files.
Each entry gives the ingress-nginx default, a bucket, `valueRules` (the first matching rule overrides the
bucket and the note, and, when it has `targets`, the support per target), the Gateway API construct with
its channel and support level, the support on each target with how to do it (English and French), the
behaviour change if the key is dropped, a note for the report, the ingress2gateway status, sources and
a confidence level.

## Definitions

Buckets:
- **direct**: standard-channel Core or Extended Gateway API that `appRoutingGateway`, `agc` and `istio` all support (yes or partial); mechanical translation.
- **policy**: needs an experimental Gateway API feature, an implementation-specific resource, or support differs between targets.
- **redesign**: no equivalent in Gateway API or in the targets' extension points; the behaviour moves elsewhere or is dropped.
- **none**: NGINX-internal tuning or nothing to translate (a behaviour change can still apply).

Support per target: **yes** (documented and supported), **partial** (limits, preview, some values, or some
supported AKS or ALB Controller versions only), **no**, **unknown** (documentation silent), **n/a**.

Targets: `appRoutingGateway` (AKS application routing Gateway API implementation, no Istio CRDs),
`agc` (Application Gateway for Containers, Gateway API), `agcIngress` (AGC, Ingress API),
`istio` (AKS Istio add-on, Gateway API ingress).

## Method and status

1. Research files F1–F9, each fact-checked against primary sources (F6 and F7 single-pass), condensed in `DIGEST.md`.
2. Mapping: one agent per chunk, from the digest, the facts files and local copies of the sources.
3. Checks done: format validation of every chunk; `tools/catalog-lint.mjs` (buckets against the
   definitions, support against the verified feature matrix, mechanisms a target lacks), 0 findings;
   manual review of the 26 most-used annotations and 18 high-impact flags and ConfigMap keys, 3 entries corrected.
4. Not done: a full second pass over every entry. Entries with confidence medium or low deserve a check
   before they drive a decision.

## Editing

Edit the chunk file, then run `node tools/validate-chunk.mjs <chunk>`, `node tools/catalog-lint.mjs`,
`npm run build`, and `UPDATE_GOLDEN=1 npm test` after reviewing the changed reports.
