# F6: kubernetes-sigs/ingress2gateway (i2gw)

- **Researched:** 2026-11-04
- **Scope:** latest release; installation (including Azure Cloud Shell); CLI usage for ingress-nginx (live cluster and files); implementation-specific emitters; how the ingress-nginx provider handles each `nginx.ingress.kubernetes.io/*` annotation at the latest tag; limitations and open issues that matter for the four AKS targets (`appRoutingGateway`, `agc`, `agcIngress`, `istio`).
- **Method:**
  - Read the source and the unit/e2e tests at tag **v1.2.0** (commit `afddc377909bc44b3f2664445839b021c1a3d971`, 2026-07-07).
  - Checked the GitHub releases API, the project README and CHANGELOG, Microsoft Learn, the Gateway API release artifacts, and the ingress-nginx sources at its last tag `controller-v1.15.1`.
  - Downloaded the v1.2.0 Linux archive and verified its SHA-256 and contents. **The binary was not executed.** Every behaviour below comes from source, tests or docs.
- **Marking:** **UNVERIFIED** marks an inference, a gap or a source conflict. Section 10 lists behaviour seen only in the source, not covered by upstream tests and not reproduced.

---

## 0. Summary

1. **Latest release:** v1.2.0, published 2026-07-07. There have been no commits on `main` since then (checked 2026-11-04). v1.0.0 (2026-03-20) was the first stable release.
2. **Microsoft's position:** Microsoft Learn's migration guide from app routing NGINX to app routing Gateway API (dated 2026-10-21) recommends `ingress2gateway`. It calls the output a starting point to review, and says to run the tool once per ingress class with `--providers=ingress-nginx --ingress-nginx-ingress-class=<class>`. The AKS add-on's default class is `webapprouting.kubernetes.azure.com`; the tool's default is `nginx`.
3. **No Azure or Istio emitter.**
   - Emitters: `standard` (default), `envoy-gateway`, `kgateway`, `agentgateway`, `airlock-microgateway` and `gce`.
   - For all four AKS targets the output is the standard emitter's, which then has to be edited by hand.
   - `gatewayClassName` (and the Gateway name) is the ingress class name. It must be rewritten to `approuting-istio`, `istio` or `azure-alb-external`.
4. **Annotation coverage:**
   - The provider references **46** `nginx.ingress.kubernetes.io/*` keys, out of the **117** in ingress-nginx's annotation table.
   - With the standard emitter:
     - **33** keys produce Gateway API output.
     - **6** produce no output and a warning (body size, IP allow/deny, cookie affinity). Some non-AKS emitters convert them.
     - **7** produce a warning only.
   - Every other key in the prefix gets a generic `Unsupported annotation` warning.
   - Non-nginx annotations, such as the AKS Key Vault annotation, are dropped **silently**.
5. **Version gating on AKS:**
   - Some output needs recent Gateway API CRDs:
     - the CORS filter needs Standard v1.5;
     - TLSRoute v1 (from `ssl-passthrough`) needs Standard v1.5;
     - BackendTLSPolicy v1 needs Standard v1.4.
   - AKS Managed Gateway API installs Standard-channel CRDs only: v1.2.1 up to K8s 1.33, v1.3.0 on 1.34, v1.4.1 on 1.35, v1.5.1 on 1.36, v1.6.1 on 1.37 and later.
   - So that output only applies on recent AKS versions.
6. **Behaviour changes to call out in an offer:**
   - Timeouts become `timeouts.request` = 10 × the largest nginx timeout.
   - Regex hosts become case-insensitive `(?i)…​.*` RegularExpression matches.
   - `ImplementationSpecific` paths become segment-based `PathPrefix`.
   - Capture-group rewrites (`$1`) are dropped.
   - An HTTPS backend without the full `proxy-ssl-*` set gets no BackendTLSPolicy (an ERROR is reported).
   - ConfigMap behaviour, such as HSTS (on by default in ingress-nginx), is not read.

---

## 1. Releases and project status

| Tag | Published (UTC) | Highlights | Source |
|---|---|---|---|
| **v1.2.0** (Latest) | 2026-07-07 19:10 | `airlock-microgateway` emitter; "Fixed warning with regex rewrites" (#412); `Report.Notifications()` accessor (#410) | [release](https://github.com/kubernetes-sigs/ingress2gateway/releases/tag/v1.2.0), [CHANGELOG](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/CHANGELOG.md) |
| v1.1.0 | tagged 2026-04-29, published 2026-05-12 | Traefik provider; ingress-nginx `from-to-www-redirect`, `app-root`, `ssl-passthrough` (TLSRoute moved to the Standard channel); GCE Cloud CDN | [API](https://api.github.com/repos/kubernetes-sigs/ingress2gateway/releases), [CHANGELOG](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/CHANGELOG.md) |
| v1.0.0 | 2026-03-20 20:37 | Emitters framework; broad ingress-nginx annotation support; e2e suite; "Upgraded Gateway API to v1.5" | [CHANGELOG](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/CHANGELOG.md), [K8s blog](https://kubernetes.io/blog/2026/03/20/ingress2gateway-1-0-release/) |
| v1.0.0-rc1 | 2026-03-05 (pre-release) | | [releases](https://github.com/kubernetes-sigs/ingress2gateway/releases) |
| v0.5.0 | 2026-01-15 (tag 2026-01-13) | | [releases](https://github.com/kubernetes-sigs/ingress2gateway/releases) |

- **Release announcement.** The Kubernetes blog announced v1.0 on 2026-03-20. Its authors are Beka Modebadze (Google) and Steven Jin (Microsoft). It says: "Before the 1.0 release, Ingress2Gateway only supported three Ingress-NGINX annotations. For the 1.0 release, Ingress2Gateway supports over 30 common annotations" ([blog](https://kubernetes.io/blog/2026/03/20/ingress2gateway-1-0-release/)).
- **Activity.**
  - The newest commit on `main` is the v1.2.0 changelog (2026-07-07). Nothing has been pushed since; the repo's `pushed_at` is 2026-07-07T18:57Z ([commits](https://github.com/kubernetes-sigs/ingress2gateway/commits/main), checked 2026-11-04).
  - 16 issues and PRs are open. Several carry `lifecycle/stale`, applied by a bot that says "The Kubernetes project currently lacks enough contributors to adequately respond to all issues" ([#417](https://github.com/kubernetes-sigs/ingress2gateway/issues/417)).
- **Gateway API version.**
  - Built against `sigs.k8s.io/gateway-api v1.5.0` ([go.mod](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/go.mod)).
  - The README's support table maps "v1.0 → v1.5.0" and notes that the output is "generally forward-compatible with Gateway API v1.4" ([README](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/README.md)).
  - Upstream Gateway API has tags up to v1.7.0 (`git ls-remote`, 2026-11-04).
- **Governance.** i2gw is a sub-project of Gateway API (SIG Network) ([README](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/README.md)).

---

## 2. Installation

### 2.1 Release binaries (v1.2.0)

- **Assets** ([API](https://api.github.com/repos/kubernetes-sigs/ingress2gateway/releases)):
  - `checksums.txt`
  - `ingress2gateway_Linux_x86_64.tar.gz` (this is linux/amd64)
  - `ingress2gateway_Linux_arm64.tar.gz` and `_Linux_i386.tar.gz`
  - `ingress2gateway_Darwin_{arm64,x86_64}.tar.gz`
  - `ingress2gateway_Windows_{x86_64,arm64,i386}.zip`
- **Naming.** The archive names come from goreleaser (`amd64` → `x86_64`) ([.goreleaser.yaml](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/.goreleaser.yaml)).
- **Static build.** Builds use `CGO_ENABLED=0`, so the binary is static ([.goreleaser.yaml#L11](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/.goreleaser.yaml#L11)).
- **Checksum.** The linux/amd64 SHA-256 is `9aaef850521a6b217bc358fc2267429629990dfe624ede601178c73f32ccad6d` ([checksums.txt](https://github.com/kubernetes-sigs/ingress2gateway/releases/download/v1.2.0/checksums.txt)). It was verified by download on 2026-11-04.
- **Archive contents** (verified by `tar -tzvf`, not executed): `ingress2gateway` (≈42 MB), `README.md`, `LICENSE`, `CHANGELOG.md`.
- **No signatures.** The release has no signature, SBOM or provenance files; `checksums.txt` is the only integrity artifact ([API](https://api.github.com/repos/kubernetes-sigs/ingress2gateway/releases)).

Cloud Shell or any Linux amd64 machine. The download and checksum steps were verified; the run step was not:

```bash
VER=v1.2.0
curl -fsSLO "https://github.com/kubernetes-sigs/ingress2gateway/releases/download/${VER}/ingress2gateway_Linux_x86_64.tar.gz"
curl -fsSLO "https://github.com/kubernetes-sigs/ingress2gateway/releases/download/${VER}/checksums.txt"
sha256sum --ignore-missing -c checksums.txt     # expect: ingress2gateway_Linux_x86_64.tar.gz: OK
tar -xzf ingress2gateway_Linux_x86_64.tar.gz ingress2gateway
./ingress2gateway version
```

### 2.2 `go install`

- **Command:** `go install github.com/kubernetes-sigs/ingress2gateway@v1.2.0`. The module path is `github.com/kubernetes-sigs/ingress2gateway` and `main.go` is at the root ([go.mod](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/go.mod)).
- **Stale docs.** The README and the 1.0 blog still say `@v1.0.0` ([README](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/README.md), [blog](https://kubernetes.io/blog/2026/03/20/ingress2gateway-1-0-release/)).
- **Go version.** go.mod declares `go 1.25.5`, and the README's build-from-source section says "Go 1.25.5 or later" ([go.mod](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/go.mod), [README](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/README.md)).
- **Version string.** A `go install` build reports version `dev`:
  - `var Version = "dev"` is overridden only by goreleaser's `-ldflags -X …Version={{.Version}}` ([ingress2gateway.go#L40](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/ingress2gateway.go#L40), [.goreleaser.yaml#L17](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/.goreleaser.yaml#L17)).
  - The `version` command does not read the module version ([cmd/version.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/cmd/version.go)).
  - So generated resources are annotated `ingress2gateway-dev` (§3.3).

### 2.3 Homebrew

- **Command:** `brew install ingress2gateway` ([README](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/README.md)).
- **Formula:** stable **1.2.0**, with bottles for macOS (Apple Silicon and Intel) and Linux (x86_64 and ARM64), license Apache-2.0 ([formulae.brew.sh](https://formulae.brew.sh/formula/ingress2gateway)).

### 2.4 Azure Cloud Shell

- **Facts:**
  - Cloud Shell runs Azure Linux. It preinstalls kubectl, Helm, Git, GitHub CLI, `make` and **Go**; the Go version is not stated ([Cloud Shell features](https://learn.microsoft.com/en-us/azure/cloud-shell/features)).
  - You "can install any tool that doesn't require root permissions… most packages that can be installed with `wget`" ([same](https://learn.microsoft.com/en-us/azure/cloud-shell/features)).
  - `$HOME` persists only when a storage account is mounted. Ephemeral sessions lose files ([same](https://learn.microsoft.com/en-us/azure/cloud-shell/features)).
  - The Cloud Shell image installs `golang` and `kubelogin` ([base.Dockerfile](https://github.com/Azure/CloudShell/blob/master/linux/base.Dockerfile), [tools.Dockerfile](https://github.com/Azure/CloudShell/blob/master/linux/tools.Dockerfile)).
  - Homebrew is not listed.
- **Conclusion:** the static linux binary (§2.1) should run in Cloud Shell without root. **UNVERIFIED:**
  - Not executed in Cloud Shell.
  - Cloud Shell's CPU architecture is not documented; check `uname -m` before choosing the archive.
  - The Go version is not documented. `go install` needs ≥ 1.25.5, or toolchain auto-download.
- **Private clusters.** Live mode needs API-server access. Offline mode (`--input-file`, §3) works from exported YAML.

---

## 3. CLI usage (v1.2.0)

**Commands:** `ingress2gateway print` and `ingress2gateway version` ([cmd/root.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/cmd/root.go)).

**Global persistent flags:**
- `--kubeconfig`: sets the `KUBECONFIG` env var.
- `--no-color`: disables ANSI colours in the stderr report.

Both are defined in [cmd/root.go#L41-L44](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/cmd/root.go#L41-L44).

### 3.1 `print` flags

All flags are defined in [cmd/print.go#L403-L433](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/cmd/print.go#L403-L433).

| Flag | Default | Notes |
|---|---|---|
| `--providers` | (required) | Comma-separated. Use **`ingress-nginx`** for community ingress-nginx and the AKS add-on. `nginx` is for F5 NGINX Ingress Controller (`nginx.org/*`) ([nginx provider README](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/nginx/README.md)). |
| `--ingress-nginx-ingress-class` | `nginx` | **One** class per run: a single string, used as `sets.New(class)` ([ingressnginx.go#L36-L43](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/ingressnginx.go#L36-L43), [resource_reader.go#L51](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/resource_reader.go#L51)). |
| `-A`, `--all-namespaces` | false | Mutually exclusive with `-n`. |
| `-n`, `--namespace` | (current context namespace) | Without `-n`/`-A` in live mode, only the **current kubeconfig namespace** is converted ([print.go#L350-L370](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/cmd/print.go#L350-L370), [README](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/README.md)). |
| `--input-file` | none | Repeatable or comma-separated; YAML or JSON; `kind: List` supported. **Directories are rejected** with "provided input path … is a directory" ([print.go#L110-L117](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/cmd/print.go#L110-L117)). With files and no `-n`, all namespaces are processed. |
| `-o`, `--output` | `yaml` | `yaml`, `json` or `kyaml`. |
| `--emitter` | `standard` | `agentgateway`, `airlock-microgateway`, `envoy-gateway`, `gce`, `kgateway`, `standard` (§4). |
| `--allow-experimental-gw-api` | false | **No effect in v1.2.0** (§9, L16). |
| Other provider flags | | `--gce-gateway-class-name`, `--openapi3-*`. There is **no** flag for gatewayClassName, Gateway name or parentRef for ingress-nginx ([#417](https://github.com/kubernetes-sigs/ingress2gateway/issues/417)). |

### 3.2 What it reads

- **Live mode:**
  - Connects with controller-runtime `config.GetConfig()` and lists in the namespace scope ([ingress2gateway.go#L42-L56](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/ingress2gateway.go)).
  - With `--providers=ingress-nginx` it reads **only Ingresses and Services**: no Secrets, ConfigMaps, IngressClasses or NginxIngressController CRs ([provider resource_reader.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/resource_reader.go), [common resource_reader.go#L35-L90](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/common/resource_reader.go)).
  - Required RBAC is therefore `list` on `ingresses.networking.k8s.io` and `services`. This is inferred from the code.
- **Class selection:**
  - Effective class = `spec.ingressClassName`, else the `kubernetes.io/ingress.class` annotation. It must equal the flag value ([common/utils.go#L33](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/common/utils.go#L33)).
  - Ingresses with no class, which rely on a default IngressClass, are **skipped**. IngressClass objects are not read ([#117](https://github.com/kubernetes-sigs/ingress2gateway/issues/117), [#417](https://github.com/kubernetes-sigs/ingress2gateway/issues/417)).
- **Named service ports:** resolved from Services. A missing Service or port name is a field error, which aborts the run (see §3.3) ([common/utils.go#L112-L136](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/common/utils.go)). In file mode, put Services in the input.

### 3.3 Output behaviour

- **Streams.** Resources go to **stdout**. Notifications go to **stderr** as boxed text blocks: `ERROR` / `WARN` / `INFO`, then `source: INGRESS-NGINX|STANDARD_EMITTER…`, then `object: <Kind>: ns/name`.
  - Sources: [print.go#L162](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/cmd/print.go#L162), [report.go#L109-L180](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/notifications/report.go#L109-L180).
  - There is **no JSON or other machine-readable notification output**. Since v1.2.0, Go library users can call `Report.Notifications()` ([report.go#L71](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/notifications/report.go#L71)).
- **Generator annotation.** Every Gateway, route, BackendTLSPolicy and ReferenceGrant gets `gateway.networking.k8s.io/generator: ingress2gateway-<version>` ([ingress2gateway.go#L35](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/ingress2gateway.go#L35), [print.go#L189](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/cmd/print.go#L189)). This lets a tool find i2gw-generated objects in a cluster.
- **All-or-nothing.** Any field-level conversion error makes `print` fail with `# Encountered N errors`. **No YAML is printed** ([ingress2gateway.go#L110](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/ingress2gateway.go#L110), [print.go#L156-L160](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/cmd/print.go#L156-L160)).
- **Extensions.** Implementation-specific resources from non-standard emitters are always printed as YAML, even with `-o json` ([print.go#L307](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/cmd/print.go#L307)).
- **Ordering.** Document order, and the order of backendRefs and header `set` entries, comes from Go map iteration. It is **not deterministic** ([print.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/cmd/print.go), [emitters/utils.go#L58](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/emitters/utils/utils.go#L58), [headers.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/headers.go)). Sort before diffing or golden-testing. This is inferred from the code.
- **Empty result.** "No resources found" is printed to stdout when nothing matched ([print.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/cmd/print.go)).

### 3.4 Recommended commands for the inventory report

- **Basis:** Microsoft Learn's guidance (run once per class) ([MS Learn migration](https://learn.microsoft.com/en-us/azure/aks/app-routing-nginx-to-gateway-api-migration)) and the flags above.
- **Finding the classes.** The AKS add-on can run several NginxIngressControllers, each with its own class. List them with `kubectl get nginxingresscontrollers -o custom-columns=NAME:.metadata.name,CLASS:.spec.ingressClassName` ([MS Learn migration](https://learn.microsoft.com/en-us/azure/aks/app-routing-nginx-to-gateway-api-migration)).

```bash
# Live cluster, one run per ingress-nginx class (AKS app routing default class shown)
ingress2gateway print --providers=ingress-nginx \
  --ingress-nginx-ingress-class=webapprouting.kubernetes.azure.com \
  --all-namespaces --no-color \
  > i2gw-webapprouting.yaml 2> i2gw-webapprouting.notes.txt

# Community ingress-nginx default class "nginx" (the class flag can be omitted)
ingress2gateway print --providers=ingress-nginx --all-namespaces --no-color \
  > i2gw-nginx.yaml 2> i2gw-nginx.notes.txt

# Offline (private clusters / review): export Ingresses AND Services (named ports), then convert
kubectl get ingresses.networking.k8s.io,services -A -o yaml > i2gw-input.yaml
ingress2gateway print --providers=ingress-nginx --ingress-nginx-ingress-class=<class> \
  --input-file i2gw-input.yaml --no-color > i2gw.yaml 2> i2gw.notes.txt
```

- **Exit code.** Exit code 0 does not mean the translation is complete. Read the stderr notes (§7).
- **Offline caveat.** Do not add `-n` when the input is a `kind: List` file (§10, O4).

---

## 4. Providers, emitters and implementation-specific output

- **Architecture.**
  - Providers turn Ingresses into an intermediate representation (IR).
  - A common emitter applies shared logic: timeouts, rewrites, CORS.
  - The selected emitter writes Gateway API plus optional extension resources ([docs/emitters.md](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/docs/emitters.md), [README](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/README.md)).
- **Scope rule** ([docs/emitters.md](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/docs/emitters.md)):
  - Emitters may output only upstream Gateway API resources, GEP-713 policies, or extensionRef-compatible resources.
  - "We would not allow anything resembling raw Envoy config, such as Istio's EnvoyFilter."
  - Third-party emitters need code owners and security contacts.

| Emitter | Adds | gatewayClassName | Source |
|---|---|---|---|
| `standard` (default) | Gateway API only; always warns about URL normalization; reports IR it cannot express | **= ingress class name** (unchanged) | [standard.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/emitters/standard/standard.go) |
| `envoy-gateway` | `BackendTrafficPolicy.spec.requestBuffer.limit` (from body size); `SecurityPolicy.spec.authorization` with `clientCIDRs` (from allow/deny lists); rule names `rule-N` | unchanged | [emitter.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/emitters/envoygateway/emitter.go), [buffer.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/emitters/envoygateway/buffer.go), [iprange.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/emitters/envoygateway/iprange.go) |
| `kgateway` | `TrafficPolicy` (buffer) | forced to `kgateway` | [emitter.go#L57-L61](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/emitters/kgateway/emitter.go#L57-L61) |
| `agentgateway` | body size → warning only | forced to `agentgateway` | [agentgateway.go#L48-L51](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/emitters/agentgateway/agentgateway.go#L48-L51) |
| `airlock-microgateway` (v1.2.0) | drops TLSRoute/TCPRoute/UDPRoute/GRPCRoute with warnings; `GatewayParameters` enabling regex | forced to `airlock-microgateway` | [emitter.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/emitters/airlockmicrogateway/emitter.go) |
| `gce` | GKE policies; the only emitter that uses cookie session affinity | GKE | [gce.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/emitters/gce/gce.go) |

- **No Istio, AKS app routing (`approuting-istio`) or AGC emitter exists.** `istio` is only an *input* provider, which reads Istio Gateway and VirtualService ([README](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/README.md)). The i2gw source and docs contain no Azure-specific code: a grep for `azure`, `webapprouting` and `alb.networking` returned nothing.
- **Alternative for `agc`.** Microsoft's [Application Gateway for Containers Migration Utility](https://github.com/Azure/Application-Gateway-for-Containers-Migration-Utility) v1.0.0 (tag commit 2026-01-28):
  - Converts AGIC or NGINX Ingresses (`--provider nginx --ingress-class nginx`, from cluster or files) into Gateway API (`azure-alb-external`) plus AGC policies (RoutePolicy, HealthCheckPolicy, WAFPolicy, FrontendTLSPolicy, BackendTLSPolicy).
  - Covers some keys i2gw does not, e.g. `force-ssl-redirect`, `session-cookie-*`, `auth-tls-*`, ModSecurity ([CHANGELOG v1.0.0](https://github.com/Azure/Application-Gateway-for-Containers-Migration-Utility/blob/v1.0.0/CHANGELOG.md)).
  - Outputs Gateway API only, not Ingress ([README](https://github.com/Azure/Application-Gateway-for-Containers-Migration-Utility)).
  - It has a tag but no GitHub release, and is built with Go 1.25. **UNVERIFIED** whether prebuilt binaries are published.
- **`agcIngress`.** No tool found automates the keep-Ingress path: i2gw and the AGC utility both output Gateway API only.

---

## 5. Base translation (ingress-nginx provider + standard emitter)

| Ingress input | Output (v1.2.0) | Source |
|---|---|---|
| Ingresses of class C in namespace N | **One Gateway per (N, C)**: `metadata.name: C`, `namespace: N`, `spec.gatewayClassName: C` | [common/converter.go#L330-L345](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/common/converter.go#L330-L345) |
| `rules[].host` H | Listener `<H-dashed>-http` (80/HTTP). If TLS also covers H: `<H-dashed>-https` (443/HTTPS, `tls.certificateRefs` = Secret names from `tls[].secretName`, mode defaults to Terminate). A host-less rule gives `http`/`https`. | [converter.go#L351-L390](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/common/converter.go) |
| Rules sharing (N, C, H) across Ingresses | **One HTTPRoute** `<first-ingress-name>-<H-dashed>` (or `-all-hosts`), `parentRefs: [{name: C}]`, `hostnames: [H]`, one rule per distinct (pathType, path) | [converter.go#L414-L460](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/common/converter.go), [utils.go#L94-L110](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/common/utils.go#L94-L110) |
| `pathType` | Exact → `Exact`; Prefix → `PathPrefix`; ImplementationSpecific → `PathPrefix` (RegularExpression on regex hosts, §6); missing → field error (run aborts) | [converter.go#L496-L527](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/common/converter.go), [ingressnginx/converter.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/converter.go) |
| `spec.defaultBackend` | HTTPRoute `<ingress>-default-backend`, no hostnames | [converter.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/common/converter.go) |
| Host served on port 80 only | WARN: "Ingress NGINX serves TLS traffic for host … with a self-signed certificate. This behavior will not be translated…" | [ingressnginx/converter.go#L91-L117](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/converter.go#L91-L117) |
| TLS host (ssl-redirect default true) | Extra HTTPRoute `<route>-http` (parentRef `port: 80`, per-rule `RequestRedirect {scheme: https, statusCode: 308}`). The main route gets parentRef `port: 443` and `sectionName: <H-dashed>-https`. | [redirect.go#L220-L355](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/redirect.go#L220-L355) |
| Path ending in `/` | Rule `Exact /path` → `RequestRedirect {path: ReplaceFullPath /path/, 301}`. This mimics NGINX's implicit slash redirect; on the HTTP side it is combined with the HTTPS upgrade. | [redirect.go#L383-L460](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/redirect.go#L383) |
| Every run (standard emitter) | WARN: "Gateway API does not support configuring URL normalization (RFC 3986, Section 6)…" | [standard.go#L48](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/emitters/standard/standard.go#L48) |

- **Semantic change for `ImplementationSpecific`:**
  - ingress-nginx writes a non-regex `ImplementationSpecific` path as a plain prefix location `location "/foo"`. Only `Prefix` paths get the extra exact and trailing-slash locations ([template.go buildLocation](https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/controller/template/template.go), [location.go](https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/controller/location.go)).
  - An nginx prefix location matches any URI that *starts with* the string ([nginx docs](https://nginx.org/en/docs/http/ngx_http_core_module.html#location)). Gateway API `PathPrefix` is segment-based.
  - So `/foo` no longer matches `/foobar` after conversion ([redirect.go pathPrefixCovers comment](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/redirect.go)).

---

## 6. ingress-nginx annotation matrix (provider at v1.2.0)

- **Counts:**
  - The provider defines 46 annotation keys. 45 are in its `parsedAnnotations` list ([annotations.go#L101](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/annotations.go#L101)).
  - `from-to-www-redirect` is converted but missing from that list, which causes a spurious warning (O1).
  - All 46 keys are in the 117-key table of ingress-nginx's annotations page ([annotations.md @ controller-v1.15.1](https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/docs/user-guide/nginx-configuration/annotations.md)). The comparison was scripted on 2026-11-04.
- **How features apply.** Most features read the *non-canary* Ingress of each rule ([utils.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/utils.go)). Features apply to HTTPRoutes; GRPCRoutes only get canary weights.
- **Status legend:**
  - **CONV**: converted to Gateway API by the standard emitter.
  - **PART**: converted with a semantic change or a precondition.
  - **IR**: not emitted by the standard emitter (WARN "Failed to apply …"); some non-AKS emitters convert it.
  - **WARN**: recognised, warning only.

| Key (`nginx.ingress.kubernetes.io/…`) | Status | Gateway API emitted (standard) | Notes | Source |
|---|---|---|---|---|
| `canary` | CONV | `rules[].backendRefs[].weight` on the shared rule | Canary-only, with no weight/header: canary 0, primary = total | [canary.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/canary.go) |
| `canary-weight` | CONV | canary weight = value; primary = total − value | Invalid or negative → ERROR note, treated as unset; capped at total. GRPCRoute: weights only. | [canary.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/canary.go) |
| `canary-weight-total` | CONV | sets the total (default 100) | ≤0 or invalid → ERROR note, 100 | same |
| `canary-by-header` | CONV | Extra rule: `matches[{path (copied), headers[{name: H, value: "always"}]}]` → canary. Without a header value, also `value: "never"` → primary. Without a weight, the canary is removed from the default rule. | Header match type defaults to Exact | [canary.go#L140-L185](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/canary.go#L140-L185) |
| `canary-by-header-value` | CONV | the header value above (exact) | | same |
| `canary-by-header-pattern` | WARN | — | "uses unsupported annotation" | [canary.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/canary.go) |
| `canary-by-cookie` | WARN | — | same | same |
| `rewrite-target` | PART | `filters[{type: URLRewrite, urlRewrite.path {type: ReplaceFullPath, replaceFullPath: <value>}}]` | Also forces RegularExpression on every path of the host (as nginx does). If the value contains `$<digit>` on a regex host, it is **not emitted**: WARN "Path rewrites with capture group references are not supported". v1.1.0 emitted `$1` literally ([#411](https://github.com/kubernetes-sigs/ingress2gateway/issues/411)); v1.2.0 changed detection to `\$\d` ([#412](https://github.com/kubernetes-sigs/ingress2gateway/pull/412)). Host-less rules: O2. | [rewrite.go#L32-L106](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/rewrite.go#L32), [common_emitter.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/emitters/common_emitter/emitter.go) |
| `app-root` | CONV | `RequestRedirect {path: ReplaceFullPath <value>, statusCode: 302}` on an `Exact "/"` rule (added, or the existing rule loses its backendRefs) | Absolute URL → WARN, ignored | [approot.go#L56-L120](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/approot.go#L56) |
| `use-regex` | PART | All matches of every route for that host: `path {type: RegularExpression, value: "(?i)<path>.*"}` | Host-wide, as in nginx ([nginx doc](https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/docs/user-guide/nginx-configuration/annotations.md)). INFO "Using case-insensitive regex path matches. You may want to change this." RegularExpression support is "Implementation Specific" in Gateway API ([httproute_types.go](https://github.com/kubernetes-sigs/gateway-api/blob/v1.5.0/apis/v1/httproute_types.go)). Host-less rules: O2. | [regex.go#L33-L86](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/regex.go#L33) |
| `permanent-redirect` | CONV | `RequestRedirect {scheme, hostname, port (from URL), path: ReplaceFullPath (URL path or "/"), statusCode: 301}`; backendRefs removed | The URL query string is not carried (no field). Empty or invalid URL → ERROR, skipped. | [redirect.go#L47-L200](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/redirect.go#L47) |
| `permanent-redirect-code` | CONV | `statusCode` | Accepts 301/302/303/307/308; anything else → WARN, 301 | same |
| `temporal-redirect` | CONV | as above, default 302 | Takes priority over permanent (WARN if both are present) | same |
| `temporal-redirect-code` | CONV | `statusCode` | Accepts 301/302/303/307; anything else → WARN, 302 | same |
| `ssl-redirect` | CONV | See §5. `"false"` → the HTTP rule is copied, so it is still served on HTTP. | Evaluated per rule. Default 308 matches nginx `http-redirect-code` 308 ([configmap.md](https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/docs/user-guide/nginx-configuration/configmap.md)). | [redirect.go#L220-L355](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/redirect.go#L220) |
| `from-to-www-redirect` | CONV | HTTPRoute `00-<route>-<src-dashed>-www-redirect`, `hostnames: [www.H or H]`, `RequestRedirect {hostname: H, statusCode: 301}`, parentRefs to `<src>-http` (80) and `<src>-https` (443). Adds those listeners to the Gateway; the HTTPS listener **reuses the destination host's TLS config**. | Spurious "Unsupported annotation" WARN (O1). Non-boolean value → field error (run aborts). | [redirect.go#L488-L632](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/redirect.go#L488) |
| `proxy-redirect-from`, `proxy-redirect-to` | WARN | — | | [redirect.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/redirect.go) |
| `upstream-vhost` | CONV | `RequestHeaderModifier.set [{name: Host, value}]` | Microsoft's AGC utility maps this to URLRewrite instead ([CHANGELOG](https://github.com/Azure/Application-Gateway-for-Containers-Migration-Utility/blob/v1.0.0/CHANGELOG.md)). **UNVERIFIED** whether Istio and AGC honour a Host override set through a header modifier. | [headers.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/headers.go) |
| `connection-proxy-header` | CONV | `RequestHeaderModifier.set [{name: Connection, value}]` | | same |
| `x-forwarded-prefix` | PART | `RequestHeaderModifier.set [{X-Forwarded-Prefix}]` **only when `rewrite-target` is also set** and the rewrite is emitted; otherwise **silently dropped** | In nginx this header is independent of rewrite ([annotations.md](https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/docs/user-guide/nginx-configuration/annotations.md)) | [rewrite.go#L78](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/rewrite.go#L78) |
| `custom-headers` | WARN | — | "…uses '…' which is not supported." | [headers.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/headers.go) |
| `proxy-connect-timeout`, `proxy-send-timeout`, `proxy-read-timeout` | PART | `rules[].timeouts.request = 10 × max(values)` (integer seconds; e.g. read 60 → `10m0s`; the unit test turns 10 s into `1m40s`). `backendRequest` is not set. | WARN "ingress-nginx only supports TCP-level timeouts; i2gw has made a best-effort translation…". Invalid or ≤0 → WARN, skipped. | [timeouts.go#L86](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/timeouts.go#L86), [common_emitter.go#L33](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/emitters/common_emitter/emitter.go#L33), [emitter_test.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/emitters/common_emitter/emitter_test.go) |
| `proxy-body-size`, `client-body-buffer-size` | IR | — WARN "Failed to apply … Most Gateway API implementations have reasonable body size and buffering defaults" | Size converted k→Ki, m→Mi, g→Gi. `envoy-gateway` → BackendTrafficPolicy, `kgateway` → TrafficPolicy, `agentgateway` → warning. | [bodysize.go#L141](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/bodysize.go#L141) |
| `backend-protocol` | PART | `HTTP`/`AUTO_HTTP`/absent/`HTTPS` → HTTPRoute. `GRPC`/`GRPCS` → **GRPCRoute** (`matches[].method {service, method}` parsed from `/service/method`) with WARN "GRPC support is not fully implemented…". **`FCGI`, other or empty → WARN and the Ingress is left out of the output entirely.** | Routing upper-cases the value, but the BackendTLSPolicy check is case-sensitive (see next row) | [ingressnginx/converter.go#L63-L85](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/converter.go#L63-L85), [common/converter.go#L530-L615](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/common/converter.go) |
| `proxy-ssl-verify` (`on`), `proxy-ssl-secret`, `proxy-ssl-name`, `proxy-ssl-server-name` (`on`) | PART | Only when **all four** are set and backend-protocol is `HTTPS`/`GRPCS` (**exact upper case**): `BackendTLSPolicy` (`gateway.networking.k8s.io/v1`) `<service>-backend-tls`, `targetRefs [{group: "", kind: Service, name}]`, `validation.hostname = proxy-ssl-name`, `validation.caCertificateRefs [{kind: ConfigMap, name: <secret name>}]` | INFO: you must create that ConfigMap with key `ca.crt`. WARN: client certificate (mTLS) not configured. Secret in another namespace → ERROR, no policy. Conflicts → first wins, WARN. **Any field missing → ERROR "failed strict validation…", no policy, and the route still points at the Service.** Lowercase `https` → skipped with **no** notification ([PR #420](https://github.com/kubernetes-sigs/ingress2gateway/pull/420), open). | [backend_tls.go#L90-L205](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/backend_tls.go#L90) |
| `proxy-ssl-verify-depth`, `proxy-ssl-protocols` | WARN | — | Warned only on HTTPS/GRPCS Ingresses | same |
| `enable-cors` + `cors-allow-origin`, `cors-allow-methods`, `cors-allow-headers`, `cors-expose-headers`, `cors-allow-credentials`, `cors-max-age` | CONV | `filters[{type: CORS, cors {allowOrigins, allowMethods, allowHeaders, exposeHeaders, allowCredentials, maxAge}}]` | Defaults copied from nginx: origins `*`; methods GET, PUT, POST, DELETE, PATCH, OPTIONS; headers DNT, Keep-Alive, User-Agent, X-Requested-With, If-Modified-Since, Cache-Control, Content-Type, Range, Authorization; credentials true; max-age 1728000. Emitted whatever the experimental flag says. The CORS filter is **Standard only from Gateway API v1.5** (§8.1). | [cors.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/cors.go), [common_emitter.go#L76-L90](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/emitters/common_emitter/emitter.go#L76) |
| `whitelist-source-range`, `denylist-source-range` | IR | — WARN "Failed to apply … IP-based authorization is not supported" | `envoy-gateway` → SecurityPolicy | [iprange.go#L77](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/iprange.go#L77) |
| `affinity` (`cookie`), `session-cookie-expires` | IR | — WARN (on the Service) "failed to parse … Session affinity is not supported" | Only the `gce` emitter uses it. Other `session-cookie-*` keys get the generic warning. | [session_affinity.go#L54-L76](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/session_affinity.go#L54) |
| `ssl-passthrough` (`true`) | CONV | `TLSRoute` (`gateway.networking.k8s.io/v1`) `<route>-tls-passthrough`, one rule with the deduplicated backends. Gateway listener `<H-dashed>-tls-passthrough` (443, `protocol: TLS`, `tls.mode: Passthrough`). The HTTPRoute is removed, or its passthrough backends are stripped. | TLSRoute v1 is **Standard only from v1.5**. ingress-nginx needed the controller flag `--enable-ssl-passthrough` ([annotations.md](https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/docs/user-guide/nginx-configuration/annotations.md)); i2gw does not check it. | [ssl_passthrough.go#L37-L280](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/ssl_passthrough.go#L37) |

- **Count check:** 33 CONV/PART + 6 IR + 7 WARN = 46. This is consistent with the blog's "over 30" ([blog](https://kubernetes.io/blog/2026/03/20/ingress2gateway-1-0-release/)).
- **Every other key → WARN `Unsupported annotation <key>` and nothing else** ([ingressnginx/converter.go#L119-L126](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/converter.go#L119-L126)). That covers 71 of the 117 table keys:
  - Auth and access: `auth-*` (url, type, secret, realm, tls-*, snippet, cache, keepalive…), `enable-global-auth`, `satisfy`.
  - Snippets: `configuration-snippet`, `server-snippet`, `stream-snippet`, `modsecurity-snippet`.
  - Rate and connection limits: `limit-rps`, `limit-connections`.
  - Redirect and host aliasing: `force-ssl-redirect`, `server-alias`.
  - Load balancing and upstream selection: `load-balance`, `upstream-hash-by`, `service-upstream`.
  - Buffering and proxy tuning: `proxy-buffer*`, `proxy-request-buffering`, `proxy-next-upstream*`, `proxy-http-version`, `proxy-cookie-*`, `proxy-ssl-ciphers`, `preserve-trailing-slash`.
  - Sessions: `session-cookie-*` (all but `-expires`), `affinity-mode`, `affinity-canary-behavior`.
  - Mirroring: `mirror-*`.
  - Error handling and default backend: `custom-http-errors`, `default-backend`.
  - Observability: `enable-access-log`, `enable-opentelemetry`, `enable-rewrite-log`, `opentelemetry-trust-incoming-span`.
  - WAF: `enable-modsecurity`, `enable-owasp-core-rules`, `modsecurity-transaction-id`.
  - TLS: `ssl-ciphers`, `ssl-prefer-server-ciphers`.
  - Other: `http2-push-preload`.
  - The maintainers' feasibility triage says snippets will never be supported ("Note that any `snippet` annotation will not be supported") and lists several keys as impossible ([#232](https://github.com/kubernetes-sigs/ingress2gateway/issues/232)).
- **Hard-coded prefix.** i2gw hard-codes `nginx.ingress.kubernetes.io/` ([annotations.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/annotations.go)). A controller started with a custom `--annotations-prefix` would get no translation and no warnings. This is inferred.
- **Keys outside the prefix are ignored with no warning.** Examples: `kubernetes.azure.com/tls-cert-keyvault-uri`, `cert-manager.io/*`, `external-dns.alpha.kubernetes.io/*`. The only check is a prefix test ([converter.go#L121](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/converter.go#L121)).
- **ConfigMap is never read** ([#232](https://github.com/kubernetes-sigs/ingress2gateway/issues/232): "ConfigMap not read"). Settings it cannot see include:
  - HSTS, which is on by default (`hsts: "true"`, `hsts-max-age: "31536000"`, `hsts-include-subdomains: "true"`);
  - `proxy-body-size` (default `1m`);
  - `ssl-redirect`;
  - `use-forwarded-headers`.

  Defaults are documented in [configmap.md](https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/docs/user-guide/nginx-configuration/configmap.md).

---

## 7. Notifications the inventory can mirror (exact text, v1.2.0)

Rendered labels are `ERROR`, `WARN ` and `INFO ` ([report.go#L169](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/notifications/report.go#L169)).

- WARN `Unsupported annotation <key>`
- WARN `<val> backend-protocol is not supported in Gateway API conversion for ingress <ns>/<name>`: the Ingress is dropped.
- WARN `GRPC support is not fully implemented. Some Ingress-NGINX GRPC behaviors may not be correctly translated, and untranslated behavior may not be notified.`
- WARN `Ingress NGINX serves TLS traffic for host "<h>" with a self-signed certificate. This behavior will not be translated and the host will not be accessible via HTTPS.`
- INFO `Using case-insensitive regex path matches. You may want to change this.`
- WARN `ingress-nginx only supports TCP-level timeouts; i2gw has made a best-effort translation to Gateway API timeouts.request. Please verify that this meets your needs. …`
- WARN `Failed to apply <annotation paths> from <ns/name>: <msg>`, where `<msg>` is one of:
  - `Path rewrites with capture group references are not supported`
  - `Most Gateway API implementations have reasonable body size and buffering defaults`
  - `IP-based authorization is not supported`
- WARN (Service) `failed to parse <ns/name> from Ingress <paths>: Session affinity is not supported`
- ERROR `Ingress <ns>/<name> requested backend TLS but failed strict validation requirements to emit a BackendTLSPolicy: …`
- WARN `Gateway API does not support configuring URL normalization (RFC 3986, Section 6). …`, printed on every standard run.

Sources: [converter.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/converter.go), [regex.go#L84](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/regex.go#L84), [timeouts.go#L86](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/timeouts.go#L86), [emitters/utils.go#L147](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/emitters/utils/utils.go#L147), [backend_tls.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/backend_tls.go), [standard.go#L48](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/emitters/standard/standard.go#L48).

---

## 8. AKS targets

### 8.1 Gateway API CRD versions: i2gw output vs. AKS Managed Gateway API

- **What AKS installs.**
  - AKS Managed Gateway API installs **Standard-channel only** CRDs, and experimental CRDs "are disallowed" ([MS Learn managed-gateway-api](https://learn.microsoft.com/en-us/azure/aks/managed-gateway-api), ms.date 2026-09-10).
  - `approuting-istio` requires it ("self-managed Gateway API CRDs … unsupported") ([MS Learn app-routing-gateway-api](https://learn.microsoft.com/en-us/azure/aks/app-routing-gateway-api)).
  - The Istio add-on Gateway API also requires it ([MS Learn istio-gateway-api](https://learn.microsoft.com/en-us/azure/aks/istio-gateway-api)).
- **How the table was checked.** Feature presence comes from the upstream Standard install manifests (`standard-install.yaml` of [v1.2.1](https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.1/standard-install.yaml), [v1.3.0](https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.3.0/standard-install.yaml), [v1.4.1](https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.4.1/standard-install.yaml) and [v1.5.1](https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.5.1/standard-install.yaml)), plus the type markers in [v1.4.1](https://github.com/kubernetes-sigs/gateway-api/blob/v1.4.1/apis/v1/httproute_types.go) and [v1.5.1](https://github.com/kubernetes-sigs/gateway-api/blob/v1.5.1/apis/v1/httproute_types.go) `httproute_types.go`. The v1.5 promotions are confirmed by the [Gateway API v1.5 blog](https://kubernetes.io/blog/2026/04/21/gateway-api-v1-5/).

| AKS K8s | Managed bundle (Standard) | HTTPRoute CORS filter (`enable-cors`) | TLSRoute v1 (`ssl-passthrough`) | BackendTLSPolicy v1 (`proxy-ssl-*`) |
|---|---|---|---|---|
| ≤ 1.33 | v1.2.1 | no `CORS` in the filter type enum → **rejected** | CRD absent | CRD absent |
| 1.34 | v1.3.0 | experimental only → **rejected** | CRD absent | CRD absent |
| 1.35 | v1.4.1 | experimental only → **rejected** | CRD absent | ✓ (v1 served) |
| 1.36 | v1.5.1 | ✓ | ✓ | ✓ |
| ≥ 1.37 | v1.6.1 | expected ✓ (not checked) | expected ✓ | expected ✓ |

- **Everything else i2gw emits is accepted by every bundle since v1.2.1.** That covers Gateway, HTTPRoute with Exact/PathPrefix/RegularExpression matches, RequestRedirect, URLRewrite, RequestHeaderModifier, `timeouts`, weights, parentRef `port`/`sectionName`, and GRPCRoute v1. Checked in the v1.2.1 and v1.3.0 Standard manifests (links above).
- **"Rejected" is an inference.** It comes from CRD enum validation; it was not tested on a cluster.

### 8.2 Per-target notes for the i2gw output (standard emitter)

| Target | Edits needed after i2gw | Output that does not carry over (beyond §6) | Sources |
|---|---|---|---|
| `appRoutingGateway` | `gatewayClassName: approuting-istio` (i2gw writes the ingress class, e.g. `webapprouting.kubernetes.azure.com`). Rename the Gateway and update `parentRefs`. Optionally consolidate Gateways. Key Vault TLS uses listener `tls.options` (`kubernetes.azure.com/tls-cert-keyvault-uri`, `kubernetes.azure.com/tls-cert-service-account`) with Workload Identity. Prerequisites: `--enable-gateway-api --enable-app-routing-istio`, Azure CLI ≥ 2.86.0, Istio add-on disabled and its CRDs removed. | Request header/body size limits, Lua, local and global rate limiting cannot be configured, and EnvoyFilter is not supported. CRD gating per §8.1. TLSRoute support is not documented (**UNVERIFIED**). The Istio minor version follows the AKS version (e.g. AKS 1.34 → Istio 1.28 as of March 2026). | [migration guide](https://learn.microsoft.com/en-us/azure/aks/app-routing-nginx-to-gateway-api-migration), [app-routing-gateway-api](https://learn.microsoft.com/en-us/azure/aks/app-routing-gateway-api), [DNS/TLS](https://learn.microsoft.com/en-us/azure/aks/app-routing-gateway-api-dns-tls) |
| `istio` | `gatewayClassName: istio`; same Gateway renaming. Add-on revision `asm-1-26`+, Managed Gateway API required. Key Vault TLS integration also works with `istio` when the app routing operator is enabled. | TLSRoute (SNI passthrough) is "not supported on … `asm-1-29`", and available from `asm-1-30`. EnvoyFilter is allowed but outside Azure support. Cannot be enabled together with `appRoutingGateway`. | [istio-gateway-api](https://learn.microsoft.com/en-us/azure/aks/istio-gateway-api), [DNS/TLS](https://learn.microsoft.com/en-us/azure/aks/app-routing-gateway-api-dns-tls) |
| `agc` | `gatewayClassName: azure-alb-external`. Gateway annotations: managed mode needs `alb.networking.azure.io/alb-namespace` and `alb.networking.azure.io/alb-name`; BYO mode needs `alb.networking.azure.io/alb-id` plus `spec.addresses[{type: alb.networking.azure.io/alb-frontend, value: <frontend>}]`. | AGC supports GatewayClass, Gateway (HTTP/HTTPS listeners, **ports 80 and 443 only**), HTTPRoute, GRPCRoute and ReferenceGrant. So i2gw's TLS-passthrough listener and TLSRoute are not supported, and the upstream BackendTLSPolicy is not listed. Matching is documented as "prefix/exact" only: RegularExpression, CORS filter and `timeouts` support are not documented (**UNVERIFIED**). Limits: **5 frontends per AGC**, 64 listeners per Gateway, 200 listeners, routes and rules per AGC (limits page dated 2024-02-27). | [AGC overview](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/overview) (ms.date 2026-11-03), [traffic splitting how-to](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-traffic-splitting-gateway-api), [AGC limits](https://github.com/MicrosoftDocs/azure-docs/blob/main/includes/application-gateway-for-containers-limits.md) |
| `agcIngress` | i2gw is **not applicable**: it only outputs Gateway API. | — | [README](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/README.md) |

### 8.3 AKS-specific consequences of i2gw's design

1. **Class flag.** The AKS add-on's default class is `webapprouting.kubernetes.azure.com`. Without the class flag i2gw finds nothing on an add-on-only cluster, and each NginxIngressController class needs its own run ([MS Learn migration](https://learn.microsoft.com/en-us/azure/aks/app-routing-nginx-to-gateway-api-migration), [resource_reader.go#L51](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/resource_reader.go#L51)).
2. **One Gateway per namespace.** ingress-nginx is one shared controller with one LB IP per controller.
   - i2gw instead emits one Gateway per namespace and class ([common/converter.go#L330-L345](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/common/converter.go#L330-L345)).
   - On `approuting-istio` and `istio`, each Gateway gets its own Deployment, LoadBalancer Service, HPA (minimum 2) and PDB ([app-routing-gateway-api](https://learn.microsoft.com/en-us/azure/aks/app-routing-gateway-api), [istio-gateway-api](https://learn.microsoft.com/en-us/azure/aks/istio-gateway-api)). So N namespaces means N public IPs and at least 2N proxy pods unless Gateways are consolidated. This is inferred from those docs.
   - On AGC managed mode, each Gateway provisions a Frontend, and the limit is 5 per AGC ([AGC overview](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/overview), [limits](https://github.com/MicrosoftDocs/azure-docs/blob/main/includes/application-gateway-for-containers-limits.md)).
   - i2gw cannot target an existing shared Gateway ([#417](https://github.com/kubernetes-sigs/ingress2gateway/issues/417), open).
3. **Key Vault certificates.**
   - On Ingress, the add-on uses `kubernetes.azure.com/tls-cert-keyvault-uri` and `secretName: keyvault-<ingress>` ([app-routing-dns-ssl](https://learn.microsoft.com/en-us/azure/aks/app-routing-dns-ssl)).
   - i2gw ignores the annotation silently and references `keyvault-<ingress>` as a plain Secret in `certificateRefs`.
   - On Gateway, Key Vault wiring is a different mechanism: listener `tls.options` with Workload Identity ([DNS/TLS](https://learn.microsoft.com/en-us/azure/aks/app-routing-gateway-api-dns-tls)). This is a manual step.
4. **Cutover.** Microsoft's migration is side-by-side with a DNS flip: each data plane has its own Azure Load Balancer IP, and the existing IP cannot be moved ([MS Learn migration](https://learn.microsoft.com/en-us/azure/aks/app-routing-nginx-to-gateway-api-migration)).
5. **Test environment ≠ AKS.**
   - Upstream e2e runs the ingress-nginx feature tests with the standard emitter against **upstream Istio 1.29.0**, with **experimental** Gateway API v1.5.0 CRDs.
   - It also forces `gatewayClassName` after conversion ("TODO: Hack! Force correct gateway class since i2gw doesn't seem to infer that from the ingress at the moment") ([istio.go#L33](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/e2e/implementation/istio.go#L33), [gwapi.go#L36-L37](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/e2e/framework/gwapi.go#L36-L37), [testcase.go#L306](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/e2e/framework/testcase.go#L306), [e2e README](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/e2e/README.md)).
   - **Covered by e2e:** canary (weight and header), CORS, redirects (permanent/temporal with codes, ssl-redirect, www), regex, rewrite-target with x-forwarded-prefix, app-root, timeouts, backend TLS, ssl-passthrough.
   - **Not covered:** upstream-vhost, connection-proxy-header, body size, IP ranges, affinity, gRPC ([provider_ingressnginx_test.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/e2e/provider_ingressnginx_test.go)).
   - Implementation smoke tests also run on Kong, kgateway, Envoy Gateway and agentgateway ([implementation_test.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/e2e/implementation_test.go)).

---

## 9. Known limitations (verified in source or docs)

| # | Limitation | Source |
|---|---|---|
| L1 | No AKS, Istio or AGC emitter; gatewayClassName and Gateway name = ingress class | §4, §5 |
| L2 | One class per run; default `nginx` | [resource_reader.go#L51](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/resource_reader.go#L51) |
| L3 | Class-less Ingresses skipped; IngressClass objects not read | [#117](https://github.com/kubernetes-sigs/ingress2gateway/issues/117), [#417](https://github.com/kubernetes-sigs/ingress2gateway/issues/417) |
| L4 | Controller ConfigMap and NginxIngressController CRs not read (HSTS, global body size, …) | [#232](https://github.com/kubernetes-sigs/ingress2gateway/issues/232), [configmap.md](https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/docs/user-guide/nginx-configuration/configmap.md) |
| L5 | Snippets, auth (basic, external, mTLS), rate limits, WAF, mirroring, `force-ssl-redirect`, `server-alias`, `default-backend`, `custom-http-errors`: warning only | §6 |
| L6 | Capture-group rewrites not translated; regex made case-insensitive and host-wide | [rewrite.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/rewrite.go), [regex.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/regex.go) |
| L7 | Timeouts approximated as 10× request timeout | [common_emitter.go#L33](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/emitters/common_emitter/emitter.go#L33) |
| L8 | HTTPS backends without the full `proxy-ssl-*` set get no BackendTLSPolicy; lowercase `https` silently skipped | [backend_tls.go#L90](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/backend_tls.go#L90), [PR #420](https://github.com/kubernetes-sigs/ingress2gateway/pull/420) |
| L9 | BackendTLSPolicy needs a ConfigMap CA (`ca.crt`) you create; mTLS client certs not translated | [backend_tls.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/backend_tls.go) |
| L10 | `FCGI` or unknown `backend-protocol` → whole Ingress omitted (warning) | [converter.go#L72-L74](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/converter.go#L72-L74) |
| L11 | gRPC: only routing and canary weights; other annotations not applied to GRPCRoutes | [converter.go#L84](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/converter.go#L84) |
| L12 | No splitting: Gateway API caps Gateway listeners at 64 and HTTPRoute rules (and hostnames) at 16. Many hosts in one namespace, or more than 16 distinct paths per host plus generated redirect rules, gives manifests the API server rejects. | [#124](https://github.com/kubernetes-sigs/ingress2gateway/issues/124) (open), [gateway_types.go#L237](https://github.com/kubernetes-sigs/gateway-api/blob/v1.5.0/apis/v1/gateway_types.go#L237), [httproute_types.go](https://github.com/kubernetes-sigs/gateway-api/blob/v1.5.0/apis/v1/httproute_types.go) |
| L13 | Any field error aborts the whole run (no partial output) | [ingress2gateway.go#L110](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/ingress2gateway.go#L110) |
| L14 | Human-readable stderr report only; no JSON report | [report.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/notifications/report.go) |
| L15 | Non-deterministic document order | §3.3 |
| L16 | `--allow-experimental-gw-api` is plumbed into the common emitter but never read ("TODO: Implement common logic such as filtering by maturity status…"). The unit test "experimental denied + cors in sidecar -> cors added" confirms CORS is emitted either way. | [common_emitter.go#L94](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/emitters/common_emitter/emitter.go#L94), [emitter_test.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/emitters/common_emitter/emitter_test.go) |
| L17 | `--input-file` rejects directories | [print.go#L110-L117](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/cmd/print.go#L110-L117) |
| L18 | Generated HTTP→HTTPS redirect route and port-80 listeners are always added for TLS hosts. The blog: "you may not want to serve HTTP at all". | [blog](https://kubernetes.io/blog/2026/03/20/ingress2gateway-1-0-release/), [#417](https://github.com/kubernetes-sigs/ingress2gateway/issues/417) |
| L19 | Project quiet since 2026-07-07; triage bot marking issues stale | §1 |

**Open issues and PRs relevant to AKS** (state on 2026-11-04):

| # | Title | State | Relevance | Link |
|---|---|---|---|---|
| 420 | fix: normalize backend protocol annotation to uppercase | open PR, `needs-ok-to-test` | L8 | [link](https://github.com/kubernetes-sigs/ingress2gateway/pull/420) |
| 417 | More configuration options for the generated gateway resources | open, stale | Class-less Ingresses, parentRef to an existing Gateway, skip the redirect route | [link](https://github.com/kubernetes-sigs/ingress2gateway/issues/417) |
| 411 | ReplaceFullPath with RegularExpression doesnt work in HTTPRoute with istio | open, stale | Literal `$1` on Istio (Istio-based AKS targets); detection changed in v1.2.0 | [link](https://github.com/kubernetes-sigs/ingress2gateway/issues/411) |
| 232 | Additional annotations support for ingress-nginx | open | Maintainers' triage of which annotations are possible or impossible | [link](https://github.com/kubernetes-sigs/ingress2gateway/issues/232) |
| 124 | Make sure generated Gateway-API object fields obey kubebuilder max item validation | open | L12 | [link](https://github.com/kubernetes-sigs/ingress2gateway/issues/124) |
| 117 | Add support for `IngressClass` objects | open | L3 | [link](https://github.com/kubernetes-sigs/ingress2gateway/issues/117) |
| 67 | Add a `ingresses-only` flag | open | Scope control | [link](https://github.com/kubernetes-sigs/ingress2gateway/issues/67) |

[#408](https://github.com/kubernetes-sigs/ingress2gateway/issues/408) and [#409](https://github.com/kubernetes-sigs/ingress2gateway/pull/409) are about the Istio *input* provider (VirtualService CORS), so they do not affect ingress-nginx → Istio.

---

## 10. Source-reading observations (UNVERIFIED: not executed, not covered by upstream tests)

- **O1.** `from-to-www-redirect` is converted but is the only provider key missing from `parsedAnnotations`. Expect a spurious `Unsupported annotation nginx.ingress.kubernetes.io/from-to-www-redirect` WARN next to the generated redirect route ([annotations.go#L38](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/annotations.go#L38) vs. [#L101](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/annotations.go#L101)). Confirmed by a scripted diff of the constants against the list.
- **O2.** Host-less rules with `use-regex`/`rewrite-target` are not converted to regex: `regexHosts` skips `rule.Host == ""`. A capture-group target such as `/$2` on such a rule would be emitted literally as `ReplaceFullPath`. This is the #411 symptom ([regex.go#L47](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/regex.go#L47), [rewrite.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/rewrite.go)).
- **O3.** `NameFromHost` maps runs of non-alphanumerics to `-` and strips the leading `-`, so `*.example.com` and `example.com` (or `a-b.x` and `a.b.x`) produce the same listener name and the same HTTPRoute name `<ingress>-example-com`. One listener is dropped, and within one Ingress one route can overwrite the other ([common/utils.go#L94](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/common/utils.go#L94), [converter.go#L359-L390](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/common/converter.go)).
- **O4.** With `--input-file` and `-n`, the namespace filter runs before `kind: List` expansion. A List document (as produced by `kubectl get -o yaml`) has no namespace, so it is dropped entirely ([common/resource_reader.go#L133](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/common/resource_reader.go#L133)).
- **O5.** Two non-canary Ingresses with the same namespace, class, host, pathType and path add the field error "multiple non-canary backends". The canary feature runs on every rule. A canary Ingress with no matching primary adds "canary backend without non-canary backend". Either way the whole run aborts (L13) ([canary.go#L225-L265](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/canary.go#L225)).
- **O6.** Precedence:
  - The README says the oldest Ingress (by creation timestamp) takes precedence in conflicts.
  - The ingress-nginx provider sorts only by Ingress name, and nothing outside tests references `CreationTimestamp` ([storage.go#L59](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/storage.go#L59), [README](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/README.md)).
  - The HTTPRoute name uses the first Ingress in that order.
- **O7.** For AKS classes the Gateway is named `webapprouting.kubernetes.azure.com`.
  - Istio names its provisioned resources `<gateway>-<class>`. MS Learn notes that names must be valid DNS names under 63 characters, and documents `gateway.istio.io/name-override` ([app-routing-gateway-api](https://learn.microsoft.com/en-us/azure/aks/app-routing-gateway-api)).
  - A Service name containing dots is not a valid DNS-1035 label, so rename the Gateway. Whether Istio would fail or sanitise the name is **UNVERIFIED**.
- **O8.** Several JSON files passed together are joined with YAML `---` separators ([print.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/cmd/print.go)). Whether apimachinery's YAML-or-JSON decoder accepts that mix is **UNVERIFIED**. Prefer one YAML file.

---

## 11. Conflicts and gaps

- **README vs. code.**
  - The README shows `go install …@v1.0.0` while the latest release is v1.2.0.
  - The CHANGELOG for v1.0.0 says `--input-file` reads "multiple input files and directories", but v1.2.0 code rejects directories.
  - The flag help says `--allow-experimental-gw-api` gates "Experimental Gateway API fields (e.g. URLRewrite)", but the flag is unused and URLRewrite is Standard.
  - The README table says `rules[].host` listeners use "port 80 … protocol HTTPS"; the code sets `HTTP` on port 80.
  - Sources: [README](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/README.md), [CHANGELOG](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/CHANGELOG.md), [print.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/cmd/print.go), [converter.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/common/converter.go).
- **Provider README gaps.** The provider README omits `affinity`/`session-cookie-expires` and `from-to-www-redirect`, which the code handles ([provider README](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/ingressnginx/README.md)).
- **TLSRoute on Istio 1.29.**
  - Upstream e2e passes `ssl-passthrough` on upstream Istio 1.29.0 with experimental CRDs.
  - AKS says TLSRoute is not supported on add-on revision `asm-1-29` and is available from `asm-1-30`.
  - The reason is not documented (**UNVERIFIED**) ([istio-gateway-api](https://learn.microsoft.com/en-us/azure/aks/istio-gateway-api), [e2e](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/e2e/provider_ingressnginx_test.go)).
- **CORS on older Istio.** Istio support for the HTTPRoute CORS filter on Istio < 1.29 is **UNVERIFIED**; the Istio 1.27 and 1.28 change notes do not mention it ([1.28 notes](https://istio.io/latest/news/releases/1.28.x/announcing-1.28/change-notes/)). On AKS ≤ 1.35 the CRD rejects it anyway (§8.1).
- **AGC gaps.**
  - Support for RegularExpression path matches, the `timeouts` field, the CORS filter and the upstream BackendTLSPolicy is not documented.
  - The AGC limits page is dated 2024-02-27 and may be stale.
  - Sources: [AGC overview](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/overview), [limits](https://github.com/MicrosoftDocs/azure-docs/blob/main/includes/application-gateway-for-containers-limits.md).
- **Not checked.**
  - Whether the AKS add-on's managed NGINX keeps upstream defaults (e.g. HSTS on).
  - Cloud Shell CPU architecture and Go version.
  - Whether `go install` toolchain auto-download works in Cloud Shell.
- **AGC Migration Utility.** It has a v1.0.0 tag but no GitHub release, so binary distribution is unknown ([repo](https://github.com/Azure/Application-Gateway-for-Containers-Migration-Utility)).

---

## 12. Sources

**ingress2gateway (tag v1.2.0 unless noted)**
- Releases: https://github.com/kubernetes-sigs/ingress2gateway/releases · v1.2.0: https://github.com/kubernetes-sigs/ingress2gateway/releases/tag/v1.2.0 · API: https://api.github.com/repos/kubernetes-sigs/ingress2gateway/releases · checksums: https://github.com/kubernetes-sigs/ingress2gateway/releases/download/v1.2.0/checksums.txt
- README: https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/README.md · CHANGELOG: https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/CHANGELOG.md · emitters design: https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/docs/emitters.md · go.mod: https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/go.mod · .goreleaser.yaml: https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/.goreleaser.yaml
- CLI: https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/cmd/print.go · https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/cmd/root.go · https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/cmd/version.go · core: https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/ingress2gateway.go · report: https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/notifications/report.go
- ingress-nginx provider: https://github.com/kubernetes-sigs/ingress2gateway/tree/v1.2.0/pkg/i2gw/providers/ingressnginx. Files: README.md, annotations.go, ingressnginx.go, converter.go, resource_reader.go, storage.go, utils.go, canary.go, rewrite.go, regex.go, headers.go, redirect.go, approot.go, backend_protocol.go, backend_tls.go, timeouts.go, bodysize.go, cors.go, iprange.go, session_affinity.go, ssl_passthrough.go.
- common provider code: https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/common/converter.go · https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/common/utils.go · https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/common/resource_reader.go
- emitters: https://github.com/kubernetes-sigs/ingress2gateway/tree/v1.2.0/pkg/i2gw/emitters (common_emitter/emitter.go and emitter_test.go, standard/standard.go, utils/utils.go, envoygateway/*, kgateway/emitter.go, agentgateway/agentgateway.go, airlockmicrogateway/emitter.go, gce/gce.go) · IR: https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/emitter_intermediate/intermediate_representation.go
- nginx (F5) provider README: https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/pkg/i2gw/providers/nginx/README.md
- e2e: https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/e2e/README.md · https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/e2e/implementation/istio.go · https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/e2e/framework/testcase.go · https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/e2e/framework/gwapi.go · https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/e2e/provider_ingressnginx_test.go · https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/e2e/implementation_test.go
- Issues/PRs: https://github.com/kubernetes-sigs/ingress2gateway/issues/411 · https://github.com/kubernetes-sigs/ingress2gateway/pull/412 · https://github.com/kubernetes-sigs/ingress2gateway/issues/417 · https://github.com/kubernetes-sigs/ingress2gateway/pull/420 · https://github.com/kubernetes-sigs/ingress2gateway/issues/232 · https://github.com/kubernetes-sigs/ingress2gateway/issues/124 · https://github.com/kubernetes-sigs/ingress2gateway/issues/117 · https://github.com/kubernetes-sigs/ingress2gateway/issues/67 · https://github.com/kubernetes-sigs/ingress2gateway/issues/408 · https://github.com/kubernetes-sigs/ingress2gateway/pull/409 · commits: https://github.com/kubernetes-sigs/ingress2gateway/commits/main
- Kubernetes blog, Ingress2Gateway 1.0 (2026-03-20): https://kubernetes.io/blog/2026/03/20/ingress2gateway-1-0-release/
- Homebrew: https://formulae.brew.sh/formula/ingress2gateway

**Gateway API**
- v1.5 blog (promotions to Standard, v1.5.0 released 2026-02-27): https://kubernetes.io/blog/2026/04/21/gateway-api-v1-5/
- Standard install manifests: https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.1/standard-install.yaml · https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.3.0/standard-install.yaml · https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.4.1/standard-install.yaml · https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.5.1/standard-install.yaml
- Types: https://github.com/kubernetes-sigs/gateway-api/blob/v1.5.0/apis/v1/httproute_types.go · https://github.com/kubernetes-sigs/gateway-api/blob/v1.5.0/apis/v1/gateway_types.go · https://github.com/kubernetes-sigs/gateway-api/blob/v1.4.1/apis/v1/httproute_types.go · https://github.com/kubernetes-sigs/gateway-api/blob/v1.5.1/apis/v1/httproute_types.go · https://github.com/kubernetes-sigs/gateway-api/blob/v1.2.1/apis/v1/shared_types.go

**ingress-nginx (last tag controller-v1.15.1)**
- Annotations: https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/docs/user-guide/nginx-configuration/annotations.md
- ConfigMap: https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/docs/user-guide/nginx-configuration/configmap.md
- Locations: https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/controller/template/template.go · https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/controller/location.go
- nginx `location` semantics: https://nginx.org/en/docs/http/ngx_http_core_module.html#location

**Microsoft (Learn and GitHub)**
- Migrate app routing NGINX → app routing Gateway API (ms.date 2026-10-21): https://learn.microsoft.com/en-us/azure/aks/app-routing-nginx-to-gateway-api-migration
- App routing Gateway API: https://learn.microsoft.com/en-us/azure/aks/app-routing-gateway-api
- Managed Gateway API: https://learn.microsoft.com/en-us/azure/aks/managed-gateway-api
- Istio add-on Gateway API: https://learn.microsoft.com/en-us/azure/aks/istio-gateway-api
- App routing Gateway API DNS/TLS: https://learn.microsoft.com/en-us/azure/aks/app-routing-gateway-api-dns-tls
- App routing NGINX Key Vault/DNS: https://learn.microsoft.com/en-us/azure/aks/app-routing-dns-ssl
- AGC overview (ms.date 2026-11-03): https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/overview
- AGC Gateway manifests (managed/BYO): https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-traffic-splitting-gateway-api
- AGC limits include: https://github.com/MicrosoftDocs/azure-docs/blob/main/includes/application-gateway-for-containers-limits.md
- AGC Migration Utility: https://github.com/Azure/Application-Gateway-for-Containers-Migration-Utility · https://github.com/Azure/Application-Gateway-for-Containers-Migration-Utility/blob/v1.0.0/CHANGELOG.md
- Cloud Shell features: https://learn.microsoft.com/en-us/azure/cloud-shell/features · image: https://github.com/Azure/CloudShell/blob/master/linux/base.Dockerfile · https://github.com/Azure/CloudShell/blob/master/linux/tools.Dockerfile

**Istio**
- 1.28 change notes: https://istio.io/latest/news/releases/1.28.x/announcing-1.28/change-notes/
