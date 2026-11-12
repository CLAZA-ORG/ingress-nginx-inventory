# Security

## Report a vulnerability

Email **contact@claza.cloud** with "ingress-nginx-inventory security" in the subject. Please do not open a public issue for a vulnerability. We acknowledge reports within 5 working days.

## What the tool reads, and what it never reads

- It runs only `kubectl version`, `kubectl config current-context` and `kubectl get` on: IngressClasses, Ingresses, Deployments, DaemonSets, Services, the ConfigMaps named by a detected controller's `--configmap`, `--tcp-services-configmap` and `--udp-services-configmap` flags, and, when these types exist, NginxIngressControllers, GatewayClasses, Gateways, HTTPRoutes and the annotations of the `gateways.gateway.networking.k8s.io` CRD.
- Every call goes through one allowlist function. Any argument that names Secrets, in any form, is refused, and tests check it.
- It never reads Secrets: TLS secret names come from `Ingress.spec.tls[].secretName`.
- From controller workloads it keeps the image, an allowlist of controller flags, pod template labels, namespace, name and replica count. Container environment values and other arguments are never written out. `$(VAR)` references in flag values are expanded only from env entries that point at the pod's own namespace or name.
- It starts no program other than kubectl, never through a shell, opens no network connection of its own and sends no telemetry.
- It writes only `report.md`, `ingress-inventory.json`, a marker file and, with `--anonymize`, `anonymization-map.local.json`, all in the `--out` directory.

The least-privilege role in [docs/rbac/read-only-clusterrole.yaml](docs/rbac/read-only-clusterrole.yaml) grants `get` and `list` on those objects only, ConfigMaps by name, and no Secrets.

## Verify a release

Each release publishes `ingress-inventory.mjs` and a `SHA256SUMS` file. In the directory where you downloaded both:

```bash
sha256sum -c SHA256SUMS      # must print: ingress-inventory.mjs: OK
```

Each release also carries a build provenance attestation, signed by the GitHub Actions workflow that published it. With the GitHub CLI:

<!-- TODO before publishing: REPO_URL placeholder (CLAZA-ORG). -->
```bash
gh attestation verify ingress-inventory.mjs --repo CLAZA-ORG/ingress-nginx-inventory
```

A matching checksum and attestation prove the file is the one the release workflow published from this repository. It does not prove what the code does: the tool is one readable file, so read it, or at least the allowlist in `isAllowedKubectlCall`, before running it against a production cluster.

## Anonymized reports

`--anonymize` pseudonymises identifiers in `report.md` and `ingress-inventory.json`. The lookup table, `anonymization-map.local.json`, maps the pseudonyms back to real names: keep it on your machine and never share it.
