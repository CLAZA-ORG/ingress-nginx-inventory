# DIGEST: ingress-nginx to four AKS targets (facts as of 2026-11-04)

From F1–F8 with all Verification-log corrections; the F-files keep the detail. UNVERIFIED = sources silent or in conflict; Derived = inferred. F6 and F7 had no verification pass: verified files win (§7).

- **Targets:** `appRoutingGateway` (`approuting-istio`: ingress-only Istio, no Istio CRDs or EnvoyFilter), `agc` and `agcIngress` (AGC via Gateway API or Ingress), `istio` (add-on `asm-1-xx`).
- **489 keys** = 150 annotations + 233 ConfigMap keys + 87 flags (F9 JSON) + 19 ecosystem keys (G10, chunk E1 of `docs/research/catalog/chunks.json`).

## 1. Status

- **ingress-nginx.** Retirement announced 2025-11-11: best-effort maintenance to March 2026, then no fixes [100]. Final releases v1.15.1, v1.14.5, v1.13.9 on 2026-03-19 [11]; archived 2026-03-24 [11]; no CVE after CVE-2026-4342 in the feed of 2026-11-03 [101]. Above v1.15.1 = fork or vendor build (Chainguard: to v1.15.12) [13].
- **AKS app routing NGINX.** Critical security patches "through November 2026", day unpublished [51], then none (blog 2026-11-02) [102]; no extension, #5516 open [24]. Release 2026-10-25 shipped v1.13.10-13, v1.15.1-23 [28]; v1.13.10/11 have no upstream tag (MCR: up to v1.13.11-3, v1.15.1-29) [106].
- **appRoutingGateway.** GA in AKS release 2026-04-28; default for new AKS Automatic 1.36+ [27]; Managed Gateway API GA then, per the AKS blog only [103].
- **istio.** No formal GA notice; commit 3f2f22f (2026-05-27) dropped "preview", its message says GA; the overview still says "not yet supported" [19]. Needs asm-1-26+ and Managed Gateway API [57]. End of life: asm-1-29 ~Dec 2026, asm-1-30 ~Jan 2027, asm-1-31 ~Mar 2027 [61].
- **agc, agcIngress.** GA (Azure Updates, 2024-02-27) [104]. ALB Controller 1.13.0: Gateway API v1.6.2, K8s >= 1.32; the AKS add-on (preview) pins 1.10.x (AKS <= 1.35) or 1.11.x (1.36+) [63]. Last conformance report: v1.2.1, ALB 1.7.9, 2025-07-18 [43].
- **Gateway API.** v1.7.0, 2026-10-29 [35]. AKS managed CRDs, standard only: K8s <= 1.33 v1.2.1, 1.34 v1.3.0, 1.35 v1.4.1, 1.36 v1.5.1, 1.37+ v1.6.1 [53]; AKS 1.37 GA 2026-10-25 [28].

CVE issues: [12]; CVSS 3.1, "–" = vector only.

- **Fixed in v1.11.5, v1.12.1 (IngressNightmare):** CVE-2025-1974 (131009) admission controller RCE, 9.8; CVE-2025-1097 (131007) `auth-tls-match-cn`, 8.8; CVE-2025-1098 (131008) mirror annotations, 8.8; CVE-2025-24514 (131006) `auth-url`, 8.8; CVE-2025-24513 (131005) auth secret path traversal, 4.8.
- **v1.12.5, v1.13.1:** CVE-2025-15566 (136789) `auth-proxy-set-headers`, –.
- **v1.13.7, v1.14.3:** CVE-2026-1580 (136677) `auth-method`; CVE-2026-24512 (136678) `rules.http.paths.path`; CVE-2026-24513 (136679) `auth-url` bypass; CVE-2026-24514 (136680) admission controller DoS; all –.
- **v1.13.8, v1.14.4, v1.15.0:** CVE-2026-3288 (137560) `rewrite-target`, 8.8.
- **v1.13.9, v1.14.5, v1.15.1:** CVE-2026-4342 (137893) comment-based injection, 8.8.
- IngressNightmare affected all versions below v1.11.5, and v1.12.0; fixes released 2025-03-25 UTC [11]; CVE-2025-24514 needs annotation validation off (default on since v1.12.0). Signals: `--validating-webhook` (CVE-2025-1974, CVE-2025-24513, CVE-2026-24514); `auth-method`, `ImplementationSpecific` or `rewrite-target` in use; an upstream build older than v1.13.9/v1.14.5/v1.15.1 in its line, or a line before 1.13.
- AKS shipped v1.11.5 on 2025-04-06, operator v0.2.17 (Feb-2026 CVEs) on 2026-02-08 [29]; no `--validating-webhook` [30]. Never map Microsoft builds to CVE status by semver.

## 2. Feature matrix (rows of F2 §B.16, F3 §13, F4 §8)

Cell = `verdict: how [n]`, verdicts from the verified files. IExt = IngressExtension; EF = EnvoyFilter (Allowed on `istio`, not Azure-supported); ETP = externalTrafficPolicy. Istio-target gates by AKS minor [53]: mirror % 1.34+; BackendTLSPolicy 1.35+; CORS, 303/307/308, TLSRoute, ListenerSet, `spec.tls.frontend` 1.36+; TCP/UDPRoute 1.37+; `retry`, `sessionPersistence`, ExternalAuth never. AGC gates by ALB Controller [63]: regex 1.4.12; CORS, timeouts, 307/308 1.11.1; mirror 1.12.1; ListenerSet, JWT, private 1.13.0. Mirror row: F2 counts LTS <= 1.33, F4 not.

| Feature | appRoutingGateway | agc | agcIngress | istio |
|---|---|---|---|---|
| Path Exact | yes: Core [41] | yes: Core passed [43] | unknown: never documented [68] | yes: Core [42] |
| Path PathPrefix | yes: Core, element-wise [41] | yes: Core [67] | yes: `Prefix` [68] | yes: Core [57] |
| Path regex | yes: RE2, whole path, case-sensitive [95] | yes: RE2, ALB 1.4.12+ [67] | unknown: no regex documented [66] | yes: RE2, whole path, case-sensitive [95] |
| Header match | yes: Exact; regex as RE2 [41] | yes: Exact or regex [67] | no: no match field [66] | yes: Exact; regex as RE2 [44] |
| Query match | yes: Extended [41] | yes: Exact or regex [67] | no: no match field [66] | yes: Extended [42] |
| Method match | yes: Extended [41] | yes: passed [43] | no: no match field [66] | yes: Extended [42] |
| RequestHeaderModifier | yes: Core [41] | yes: static; `Host` not settable [69] | yes: IExt per host, static [66] | yes: Core [42] |
| ResponseHeaderModifier | yes: Extended [41] | yes: passed [43] | yes: IExt per host [66] | yes: Extended [42] |
| RequestRedirect | partial: 303/307/308 only AKS 1.36+ [53] | yes: 307/308 ALB 1.11.1+; 303 UNVERIFIED [63] | partial: IExt per host; 307/308 UNVERIFIED [66] | partial: 303/307/308 only AKS 1.36+ [40] |
| HTTP->HTTPS pattern | yes: route on `http` listener; 308 needs 1.36+ [108] | yes: explicit route on :80 [70] | partial: 2nd Ingress, IExt `scheme: https` [71] | yes: explicit route only [44] |
| URLRewrite hostname | yes: Extended [41] | yes: passed [43] | yes: IExt `urlRewrite` [66] | yes: Extended [42] |
| URLRewrite path | yes: no capture groups [41] | yes: no capture groups [43] | yes: IExt, per host [66] | yes: no capture groups [42] |
| RequestMirror (+%) | partial: % only AKS 1.34+ [53] | yes: % too, ALB 1.12.1+ [72] | no: no field [66] | yes: % needs AKS 1.34+ [42] |
| Weighted backends | yes: Core [41] | yes: `weight` [73] | no: no field [66] | yes: Core [42] |
| Timeouts | yes: both fields, all bundles [35] | yes: ALB 1.11.1+; default 60 s total [65] | partial: IExt per Service only [66] | yes: `backendRequest` overrides `request` [44] |
| Retries | no: no `retry`; Istio default 2, fixed [45] | partial: automatic, fixed [64] | partial: automatic, fixed [64] | partial: mesh-wide policy only (Allowed) [58] |
| Session affinity | no: no field, no DestinationRule [52] | yes: RoutePolicy, cookie only [74] | yes: IExt, cookie only [74] | partial: DestinationRule hash (soft) [97] |
| CORS | partial: AKS 1.36+ [40] | yes: ALB 1.11.1+ [75] | no: Gateway API only [75] | partial: AKS 1.36+; else EF [40] |
| External auth | no: none; ExternalAuth experimental [52] | no: JWT AuthPolicy only (preview) [76] | no: no JWT on Ingress either [76] | partial: AuthorizationPolicy CUSTOM (Allowed) [58] |
| Basic auth | no: none [52] | no: none [66] | no: none [66] | partial: ext_authz or EF `basic_auth` [96] |
| Backend TLS | partial: AKS 1.35+; no client cert [42] | yes: AGC BackendTLSPolicy + client cert [66] | partial: IExt HTTPS + trusted root [66] | yes: BackendTLSPolicy 1.35+ or DestinationRule [42][97] |
| gRPC | yes: GRPCRoute [41] | yes: incl. streaming [77] | no: not on Ingress [77] | yes: GRPCRoute [42] |
| WebSockets | yes: declared in conformance [41] | yes: automatic [78] | no: Gateway API only [78] | yes: declared in conformance [41] |
| TLS termination | yes: Secret; <= 2 certs per listener [44] | yes: RSA+ECDSA, <= 2 per host [79] | yes: `spec.tls` Secret [79] | yes: Secret; <= 2 certs per listener [57] |
| Key Vault certs | yes: listener `tls.options` (operator) [54] | no: sync to a Secret first [71] | no: sync to a Secret first [71] | yes: CSI driver syncs a Secret [57] |
| cert-manager | unknown: undocumented by Microsoft [112] | yes: HTTP-01 `gatewayHTTPRoute` [80] | yes: HTTP-01 Ingress solver [81] | yes: self-managed, not Azure-supported [112] |
| Frontend mTLS | partial: AKS 1.36+; claimed from Istio 1.31 [42] | yes: FrontendTLSPolicy [66] | no: Gateway-only policy [66] | yes: `tls.options` MUTUAL; native 1.36+ [44] |
| TLS passthrough | partial: AKS 1.36+ (inferred) [42] | no: HTTP/HTTPS only [64] | no: HTTP/HTTPS only [64] | partial: AKS 1.36+ and asm-1-30+ [57] |
| TCP/UDP routes | partial: TCP on AKS 1.37+; no UDP [42] | no: ports 80/443 only [64] | no: ports 80/443 only [64] | partial: TCP on 1.37 + asm-1-31; no UDP [42] |
| TLS versions, ciphers | unknown: Istio option undocumented on AKS [44] | partial: 2 predefined policies [82] | no: fixed `2023-06` [82] | partial: ciphers per listener; min TLS mesh-wide [44][58] |
| Rate limiting | no: unsupported [52] | partial: WAF rate-limit rules [105] | no: no WAF on Ingress [71] | partial: EF local (per pod) or global [99] |
| IP lists, client IP | partial: L4 allow-list; ETP Local [57] | partial: NSG, WAF IPMatch; IP in XFF [65] | partial: subnet NSG, no WAF; IP in XFF [65] | yes: AuthorizationPolicy + ETP Local [98] |
| WAF | no: Azure WAF in front [52] | yes: WebApplicationFirewallPolicy [87] | no: not supported [71] | no: WasmPlugin blocked [59] |
| Error pages, default backend | no: none documented [52] | partial: catch-all route; no pages [34] | unknown: undocumented [34] | partial: catch-all route; pages via EF [109] |
| Body size limit | no: unsupported [52] | unknown: undocumented [65] | unknown: undocumented [65] | partial: EF buffer filter [52] |
| Static IP, IP reuse | partial: `azure-pip-name`; NGINX IP not movable [56] | no: anycast FQDN; no BYO IP [25] | no: same as agc [25] | yes: `azure-pip-name` or `azure-load-balancer-ipv4` [62] |
| Internal LB | yes: `azure-load-balancer-internal` [57] | partial: preview; Private Link only [84] | partial: preview; class via annotation [84] | yes: `azure-load-balancer-internal` [57] |
| LBs per Gateway | yes: one LB IP per Gateway [52] | yes: 1 frontend each, <= 5 per AGC [88] | yes: frontends on a shared AGC [88] | yes: one LB IP per Gateway [62] |
| Cross-namespace | yes: `allowedRoutes`, ReferenceGrant [44] | yes: + ListenerSet (ALB 1.13) [63] | partial: backends namespace-local [68] | yes: `allowedRoutes`, ReferenceGrant [57] |
| Logs, metrics, tracing | partial: access logs only [52] | partial: no tracing [26] | partial: no tracing [26] | partial: tracing only Allowed [60] |

## 3. Gateway API features (v1.7.0)

Channel and support from the v1.7.0 types [36] and `pkg/features` [38]; versions from releases [35].

| Construct | Channel | Support | Std since |
|---|---|---|---|
| Path Exact, PathPrefix; header Exact; hostnames (`*.` = any depth, not apex); listeners, TLS Terminate, one Secret; RequestHeaderModifier; RequestRedirect, `hostname`, 301/302 (default 302); `weight`; Service backends; `allowedRoutes` (default `Same`) | Std | Core | v0.5.0 |
| Query, method match; redirect `scheme`, `port`; RequestMirror; `spec.addresses` | Std | Extended | v0.5.0 |
| RegularExpression matches; ExtensionRef; listener `tls.options` | Std | Impl-specific | v0.5.0 |
| ResponseHeaderModifier; redirect `path`; URLRewrite `hostname`, `path` | Std | Extended | v0.7.0 |
| ReferenceGrant (storage `v1beta1`; `v1` from v1.5.0) | Std | Core | v0.6.0 |
| GRPCRoute / parentRef `port` | Std | Core / Extended | v1.1.0 |
| `timeouts`; `appProtocol` h2c, ws, wss; `infrastructure` labels, annotations (`parametersRef`: Impl-specific) | Std | Extended | v1.2.0 |
| Mirror `percent`/`fraction` | Std | Extended | v1.3.0 |
| BackendTLSPolicy; rule `name` | Std | Extended | v1.4.0 |
| CORS; redirect 303/307/308 (older Std CRDs: 301/302 only [39]); ListenerSet; `spec.tls.frontend`; TLSRoute Terminate | Std | Extended | v1.5.0 |
| TLSRoute Passthrough; `spec.tls.backend.clientCertificateRef` (in Extended `spec.tls`) | Std | Core | v1.5.0 |
| TCPRoute, UDPRoute | Std | own features | v1.6.0 |
| `retry.codes`, `.attempts` (`backoff`: Impl-specific) | Std | Extended | v1.7.0 |
| ExternalAuth (Exp v1.4.0); `sessionPersistence` (deprecated for XBackend); listener filters; XBackend, XBackendTrafficPolicy, XTelemetryPolicy | Exp only | Extended or none | – |

- No field in any channel for rate limits, IP lists, body size, separate connect/read/send timeouts, snippets, WAF, HSTS, cookie matching, mirroring to a URL [36].
- Matching is case-sensitive; precedence: Exact, longest prefix, method, most headers, most query params, oldest, ascending `{namespace}/{name}`, first rule; regex order implementation-specific; no match = 404 [37].
- In `supportedFeatures`, `GatewayInfrastructurePropagation` became `GatewayInfrastructure` (v1.7.0); ExternalAuth and session persistence have no name [38].

## 4. ingress2gateway

- **Version.** v1.2.0 (2026-07-07), latest, no commits since; Gateway API v1.5.0 [20]. No Istio, AKS or AGC emitter, no Ingress output (none for `agcIngress`); Gateway name and `gatewayClassName` = the ingress class: rewrite to `approuting-istio`, `istio` or `azure-alb-external` [21].
- **Command** (one run per class, as Microsoft advises [56]; flags [22]):

```bash
ingress2gateway print --providers=ingress-nginx \
  --ingress-nginx-ingress-class=webapprouting.kubernetes.azure.com \
  --all-namespaces --no-color > i2gw.yaml 2> i2gw.notes.txt
# offline: --input-file <kubectl get ingresses.networking.k8s.io,services -A -o yaml output>
```

- **Behaviour.** Reads only Ingresses and Services (no ConfigMap: HSTS, 1m body default invisible); default class `nginx`; skips class-less Ingresses; any field error aborts the run; random order; one Gateway per namespace and class [22][23].
- **Converted (22)** [23]: `canary`, `canary-weight`, `canary-weight-total`, `canary-by-header`, `canary-by-header-value`; `app-root` (302); `permanent-redirect` + `-code` (301); `temporal-redirect` + `-code` (302); `ssl-redirect` (port-80 route, 308); `from-to-www-redirect` (301); `upstream-vhost` (sets `Host`); `connection-proxy-header`; `enable-cors` + six `cors-*` keys; `ssl-passthrough` (TLSRoute).
- **Partial (11)**: `rewrite-target` (ReplaceFullPath; host turns regex; `$n` targets dropped); `use-regex` (host-wide `(?i)<path>.*`); `x-forwarded-prefix` (only with an emitted rewrite, as in NGINX [4]); `proxy-connect-timeout`, `proxy-send-timeout`, `proxy-read-timeout` (`timeouts.request` = 10 x max); `backend-protocol` (GRPC/GRPCS to GRPCRoute; FCGI or unknown drops the Ingress); `proxy-ssl-verify`, `-secret`, `-name`, `-server-name` (BackendTLSPolicy only with all four and upper-case HTTPS/GRPCS; no client cert).
- **Warned only (13)**, e.g. `proxy-body-size`, `whitelist-source-range`, `affinity`, `canary-by-cookie`, `custom-headers` (F6 §6). Other prefixed keys: "Unsupported annotation"; unprefixed keys dropped silently.
- **On AKS (Derived).** The `ssl-redirect` 308 and `-code` values 303/307/308 fail the v1.2.1–v1.4.1 CRDs, i.e. AKS <= 1.35 [39] (F6 §8.1 missed this). On `agc`, `Host` is not settable by header [69]: map `upstream-vhost` to URLRewrite `hostname`.

## 5. Silent default changes (F5)

Envoy = upstream Istio defaults read in source, for both Istio targets (AKS overrides UNVERIFIED). n/d = not documented for AGC.

| Row [src] | ingress-nginx v1.15.1 | Envoy (Istio) | AGC |
|---|---|---|---|
| B1 HTTP->HTTPS [3][44][70] | 308 for every host of a non-canary Ingress with `spec.tls` | none; route default 302 | none; explicit route |
| B2 HSTS [3] | 1 y + subdomains on every HTTPS response (Derived) | none | n/d |
| B3 Unknown SNI [5][94] | default or fake cert, then 404 | refused unless a hostname-less listener (Derived) | n/d |
| B4 TLS [1][93][82] | 1.2, 1.3; ECDHE + 2 DHE suites | 1.2–1.3; no DHE; X25519, P-256 | 1.2, 1.3; AES-GCM; P-384, P-256 |
| B5 HTTP/2 [1][91] | ALPN; 128 streams | ALPN; 1024 streams | always on |
| B6 HTTP/1.0 [91] | accepted | 426 | n/d |
| B7 Body size [1][47] | 1 MiB, then 413 | unlimited | n/d |
| B8 Request headers [110][90] | header > 8 KiB: 400; line: 414 | > 60 KiB or > 100: 431 | n/d |
| B9 `_` in names [1][91] | dropped | forwarded | n/d |
| B10 Name case [16][91] | kept | lower-cased | n/d |
| B11 Buffering [1][47] | request buffered, response streamed | both streamed (Derived) | n/d |
| B12 Upstream headers [1][91] | > 4 KiB: 502 | > 60 KiB or > 100: 502 (Derived) | n/d |
| B13 Client IP [30][52] | add-on ETP `Local` (Helm: `Cluster`) | Gateway ETP `Cluster`: node IPs | only in XFF |
| B14 XFF, X-Real-IP [2][92][65] | XFF replaced; X-Real-IP set | XFF appended; no X-Real-IP | XFF appended |
| B15 X-Forwarded-Host/Port, request ID [2][92][65] | set; ID kept or made | not set; ID replaced | XFF, XFP, new ID; client ID n/d |
| B16 Timeouts [1][48][65] | connect 5 s; read/send 60 s idle; no total | no route or idle timeout; connect 10 s | 60 s total; idle 5 min; connect 5 s |
| B17 Retries [1][45][64] | error + timeout, 3 tries, idempotent | 2, any method, connect errors only | automatic, n/d |
| B18 Keep-alive [1][91][111][65] | upstream 60 s; client 75 s | 1 h; Azure LB resets idle at 4 min | client 5 min |
| B19 WebSocket [2][47][78] | works; closed after 60 s idle | works; LB's 4 min idle only | `agc` 5 min idle; none on Ingress |
| B20 Backend protocol [4][49][65] | HTTP/1.1 unless `backend-protocol` GRPC(S) | h2c for `kubernetes.io/h2c`, `http2*`, `grpc*` ports | HTTP/1.1; gRPC on HTTP/2 |
| B21 Prefix, trailing `/` [7][95] | `ImplementationSpecific` = char prefix; `/foo/` 301s `/foo` (Derived) | segment prefix; no redirect | Ingress: Prefix only documented |
| B22 Regex [4][95][67] | `use-regex` or differing `rewrite-target`: host-wide `~*` PCRE, start-anchored | RE2, case-sensitive, whole path | RE2; rest n/d |
| B23 Precedence [5][48] | longest first; duplicates: oldest wins (log at `--v=3`) | Exact > Prefix > regex; `PathPrefix /` hides regex (Derived) | regex n/d |
| B24 Wildcard host [4][37] | one label | any depth | n/d |
| B25 Normalisation [110][47] | matches decoded, merged path; forwards raw | resolves dot-segments; keeps `//`, `%2F` | n/d |
| B26 Unknown host/path [5][18] | default backend, HTML 404 | 404, empty body | n/d |
| B27 Compression [1][47][64] | off | off | none documented |
| B28 `Server` header [1][50][70] | none | `istio-envoy` + `x-envoy-upstream-service-time` | redirects: `Microsoft-Azure-Application-LB/AGC` |
| B29 Upstream failure [15][18][83] | refused 502, timeout 504, no endpoints 503 | refused 503, protocol 502, timeout 504, bad backend 500 | no endpoints or bad backend: 500 |
| B30 Error bodies [1][18] | NGINX HTML; no interception | plain text or empty | n/d |

## 6. Detection data

| IngressClass | `spec.controller` (match it, not the name) |
|---|---|
| `nginx` (community) [9] | `k8s.io/ingress-nginx`; also Chainguard fork, Traefik provider [14][113] |
| `webapprouting.kubernetes.azure.com` (AKS default NIC) [31] | `webapprouting.kubernetes.azure.com/nginx`; an existing class keeps its value |
| NIC `spec.ingressClassName`, default `nginx.approuting.kubernetes.azure.com` [32] | `approuting.kubernetes.azure.com/<url-escaped NIC name>`, <= 250 chars |
| `azure-alb-external`, `azure-alb-internal` (preview; `agcIngress`) [84] | UNVERIFIED (no IngressClass documented) |
| `nginx` (F5 NGINX Ingress Controller, not retired) [17] | `nginx.org/ingress-controller` |

| GatewayClass | `controllerName` |
|---|---|
| `approuting-istio` | `istio.aks.azure.com/gateway-controller`, only in the AKS GA blog's sample output [103]: read the live value |
| `istio` | AKS value UNVERIFIED; upstream default `istio.io/gateway-controller` [46] |
| `azure-alb-external` / `azure-alb-internal` (preview) | `alb.networking.azure.io/alb-controller` [85] / UNVERIFIED [84] |

- **Ownership.** `spec.ingressClassName` decides alone (its class's `spec.controller` = `--controller-class`); else `kubernetes.io/ingress.class` = `--ingress-class` (default `nginx`); else only with `--watch-ingress-without-class=true`; then namespace scope, `--deep-inspect`, `--disable-catch-all` (drops Ingresses with `spec.defaultBackend`) [6]; prefix `--annotations-prefix` [8].
- **Workloads.** `args[0]` `/nginx-ingress-controller`, or the image (same CMD); upstream label `app.kubernetes.io/name=ingress-nginx` [9]. AKS pods have `app.kubernetes.io/managed-by=aks-app-routing-operator`, `kubernetes.azure.com/managedby=aks` instead; AKS ConfigMap: `allow-snippet-annotations: "true"`, `annotations-risk-level: Critical`, `allow-cross-namespace-resources: "true"` (upstream false, High, false) [30]. ALB Controller pods: `app=alb-controller` [85].
- **Images.** `registry.k8s.io/ingress-nginx/controller[-chroot]` (v1.3.0+), earlier `k8s.gcr.io/ingress-nginx/controller`, `quay.io/kubernetes-ingress-controller/nginx-ingress-controller`: match the path [10]. AKS: `mcr.microsoft.com/oss/kubernetes/ingress/nginx-ingress-controller`, `mcr.microsoft.com/oss/v2/ingress-nginx/controller` (Dalec; strip `-N`) [30][106]. AGC: `mcr.microsoft.com/application-lb/images/alb-controller` [107].
- **Namespaces.** `ingress-nginx` (static: `ingress-nginx-controller`, webhook `ingress-nginx-admission`) [9]; `app-routing-system` (AKS: `nginx` or `<prefix>-<n>` objects, `nginx-metrics`; survives removal) [30]; `aks-istio-system` (`istiod` for approuting-istio; `istiod-asm-1-xx`, `istio-asm-1-xx`, `istio-shared-configmap-asm-1-xx` for the add-on; both `istio-gateway-class-defaults`) [52][57]; proxies `<gateway>-approuting-istio` / `<gateway>-istio` [52]; ALB Controller: `azure-alb-system` (Helm default) or `kube-system` (add-on) [85][86].
- **CRDs.** `nginxingresscontrollers.approuting.kubernetes.azure.com` (v1alpha1, cluster, `nic`) [33]; AKS-managed Gateway API CRDs carry `gateway.networking.k8s.io/bundle-version`, `channel: standard`, `app.kubernetes.io/managed-by: aks` [53]; `alb.networking.azure.io` v1 ApplicationLoadBalancer, RoutePolicy, HealthCheckPolicy, FrontendTLSPolicy, BackendTLSPolicy, WebApplicationFirewallPolicy, BackendLoadBalancingPolicy, IngressExtension; v1alpha1 AuthPolicy, MCPRoute [66]. Leftover `*.istio.io` CRDs block `approuting-istio`; the Istio targets exclude each other [52].
- **Annotations.** AGC Ingress: `alb.networking.azure.io/alb-name` + `alb-namespace` (managed) or `alb-id` + `alb-frontend` (BYO); `alb-ingress-extension` [68]. AKS Key Vault: `kubernetes.azure.com/tls-cert-keyvault-uri` [55]. i2gw output: `gateway.networking.k8s.io/generator` [22]. Retired HTTP application routing add-on: class annotation value `addon-http-application-routing` [89]. Lookalikes: F8 §5.

## 7. Still UNVERIFIED

Beyond the UNVERIFIED, unknown and n/d marks above:
- **AKS NGINX:** end day; fate of running NGINX; Microsoft builds' patches, who gets v1.15.1; operator after v0.2.27; upstream defaults (HSTS) kept.
- **appRoutingGateway:** Istio minor per AKS version (1.31 inferred); TLSRoute, TCPRoute, ListenerSet (no positive statement); webhooks vs `gateway.istio.io/tls-terminate-mode`, `tls-cipher-suites`; retry default kept; metrics, tracing; log format (text vs JSON); `defaults-for-class` value; price.
- **istio:** formal GA; `PILOT_ENABLE_ALPHA_GATEWAY_API`; `TrafficExtension`; EnvoyFilter `targetRefs` version; frontend validation (1.30.5 report: unsupported; 1.28–1.30 code enforces; F2: 1.31 only); coexistence with app routing NGINX; per-gateway `numTrustedProxies`; gateway pod patching; lifecycle vs upstream.
- **agc, agcIngress:** upstream BackendTLSPolicy; post-v1.2.1 listener isolation, `ParentRefPort`, backend header modifier, h2c, WebSocket; ReferenceGrant version (`v1alpha1` claimed); `ingressClassName: azure-alb-internal`; multiple mirrors; retry rules; affinity with round robin; shared frontends; status address type; Helm vs managed CRDs; add-on gaps; BackendTLSPolicy behind Ingress.
- **Envoy/Istio:** AKS overrides; Envoy build (FIPS); `HTTP10`; client `X-Real-IP`, `Proxy`; MeshNetworks; stale connections (`connect-failure` vs `reset`); non-websocket `Upgrade`.
- **ingress-nginx:** HSTS over a backend's; plaintext h2c; keep-alive extra retry; gzip of compressed bodies; `Server` over HTTP/2; `DefaultIngressClass` on AKS; Chainguard CVE IDs; Traefik versions.
- **Gateway API:** guardrails VAP; v1.8 date; advertising ExternalAuth, session persistence; TLSRoute `v1alpha2` removal; self-contradicting support levels; v1.4.1 YAML faulty 2025-12-04 to 2026-02-10 (read the installed enum).
- **ingress2gateway:** O1–O8 (F6 §10); Cloud Shell run; `Host` header on Istio; TLSRoute on asm-1-29; CORS before Istio 1.29.
- **Conflicts:** cert-manager `config.enableGatewayAPI=true` (Microsoft, v1.19.3) [80] vs `config.gatewayAPI.enabled=true` (cert-manager docs, 2026-11-06) [112]; Key Vault on `istio`: F4 CSI only, F2 operator `tls.options` too [54]; legacy class: F2 verified, F8 not; AGC regex, CORS, timeouts: F3 yes (followed), F6 undocumented.

## Sources

Accessed 2026-11-04 (cert-manager 2026-11-06); URL = base + entry.

- `https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/` + [1] internal/ingress/controller/config/config.go, [2] rootfs/etc/nginx/template/nginx.tmpl, [3] rootfs/etc/nginx/lua/lua_ingress.lua, [4] internal/ingress/controller/template/template.go, [5] internal/ingress/controller/controller.go, [6] internal/ingress/controller/store/store.go, [7] internal/ingress/controller/location.go, [8] pkg/flags/flags.go, [9] deploy/static/provider/cloud/deploy.yaml, [10] Changelog.md
- `https://github.com/` + [11] kubernetes/ingress-nginx/releases, [12] kubernetes/kubernetes/issues/<no.>, [13] chainguard-forks/ingress-nginx/releases, [14] chainguard-forks/ingress-nginx/blob/main/internal/ingress/controller/ingressclass/ingressclass.go, [15] nginx/nginx/blob/release-1.27.1/src/http/ngx_http_upstream.c, [16] nginx/nginx/blob/release-1.27.1/src/http/modules/ngx_http_proxy_module.c, [17] nginx/kubernetes-ingress/blob/main/deployments/common/ingress-class.yaml, [18] envoyproxy/envoy/blob/v1.36.0/source/common/router/router.cc, [19] MicrosoftDocs/azure-aks-docs/commit/3f2f22fbea677d6dc7e40ac498400373d85e70cc, [20] kubernetes-sigs/ingress2gateway/releases/tag/v1.2.0, [21] kubernetes-sigs/ingress2gateway/blob/v1.2.0/README.md, [22] kubernetes-sigs/ingress2gateway/blob/v1.2.0/cmd/print.go, [23] kubernetes-sigs/ingress2gateway/tree/v1.2.0/pkg/i2gw/providers
- `https://github.com/Azure/` + [24] AKS/issues/5516, [25] AKS/issues/5630, [26] AKS/issues/5026, [27] AKS/releases/tag/2026-04-28, [28] AKS/releases/tag/2026-10-25, [29] AKS/blob/master/CHANGELOG.md, [30] aks-app-routing-operator/blob/v0.2.27/pkg/manifests/nginx.go, [31] aks-app-routing-operator/blob/v0.2.27/pkg/controller/nginxingress/default.go, [32] aks-app-routing-operator/blob/v0.2.27/pkg/controller/nginxingress/nginx_ingress_controller.go, [33] aks-app-routing-operator/blob/v0.2.27/api/v1alpha1/nginxingresscontroller_types.go, [34] Application-Gateway-for-Containers-Migration-Utility/blob/main/resources/nginx_issues.go
- `https://github.com/kubernetes-sigs/gateway-api/` + [35] releases, [36] tree/v1.7.0/apis, [37] blob/v1.7.0/apis/v1/httproute_types.go, [38] tree/v1.7.0/pkg/features, [39] releases/download/v1.4.1/standard-install.yaml, [40] releases/download/v1.5.1/standard-install.yaml, [41] blob/main/conformance/reports/v1.4.0/istio-istio/1.28.0-default-report.yaml, [42] blob/main/conformance/reports/v1.6/istio-istio/1.31.0-default-report.yaml, [43] blob/main/conformance/reports/v1.2.1/azure-application-gateway-for-containers/standard-v1.2.1-default-report.yaml
- `https://github.com/istio/istio/blob/` + [44] release-1.31/pilot/pkg/config/kube/gateway/conversion.go, [45] release-1.31/pilot/pkg/networking/core/route/retry/retry.go, [46] release-1.31/pilot/pkg/features/pilot.go, [47] release-1.29/pilot/pkg/networking/core/listener_builder.go, [48] release-1.29/pilot/pkg/networking/core/route/route.go, [49] release-1.29/pkg/config/kube/conversion.go, [50] release-1.29/pilot/pkg/networking/util/proxy_headers.go
- `https://learn.microsoft.com/en-us/azure/aks/` + [51] app-routing, [52] app-routing-gateway-api, [53] managed-gateway-api, [54] app-routing-gateway-api-dns-tls, [55] app-routing-dns-ssl, [56] app-routing-nginx-to-gateway-api-migration, [57] istio-gateway-api, [58] istio-meshconfig, [59] istio-about, [60] istio-telemetry, [61] istio-support-policy, [62] load-balancer-standard
- `https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/` + [63] alb-controller-release-notes, [64] overview, [65] application-gateway-for-containers-components, [66] api-specification-kubernetes, [67] how-to-path-header-query-string-routing-gateway-api, [68] how-to-multiple-site-hosting-ingress-api, [69] how-to-header-rewrite-gateway-api, [70] how-to-url-redirect-gateway-api, [71] migrate-from-agic-to-agc, [72] how-to-request-mirroring-gateway-api, [73] how-to-traffic-splitting-gateway-api, [74] session-affinity, [75] cross-origin-resource-sharing, [76] jwt-validation, [77] grpc, [78] websockets, [79] ecdsa-rsa-certificates, [80] how-to-cert-manager-lets-encrypt-gateway-api, [81] how-to-cert-manager-lets-encrypt-ingress-api, [82] tls-policy, [83] troubleshooting-guide, [84] private-ingress, [85] quickstart-deploy-application-gateway-for-containers-alb-controller-helm, [86] quickstart-deploy-application-gateway-for-containers-alb-controller-addon
- `https://learn.microsoft.com/en-us/` + [87] azure/web-application-firewall/ag/waf-application-gateway-for-containers-overview, [88] azure/azure-resource-manager/management/azure-subscription-service-limits, [89] previous-versions/azure/aks/http-application-routing
- `https://www.envoyproxy.io/docs/envoy/latest/` + [90] api-v3/extensions/filters/network/http_connection_manager/v3/http_connection_manager.proto, [91] api-v3/config/core/v3/protocol.proto, [92] configuration/http/http_conn_man/headers, [93] api-v3/extensions/transport_sockets/tls/v3/common.proto, [94] api-v3/config/listener/v3/listener.proto, [95] api-v3/config/route/v3/route_components.proto, [96] configuration/http/http_filters/basic_auth_filter
- `https://istio.io/` + [97] latest/docs/reference/config/networking/destination-rule/, [98] latest/docs/tasks/security/authorization/authz-ingress/, [99] latest/docs/tasks/policy-enforcement/rate-limit/
- [100] https://kubernetes.io/blog/2025/11/11/ingress-nginx-retirement/, [101] https://kubernetes.io/docs/reference/issues-security/official-cve-feed/, [102] https://blog.aks.azure.com/2026/11/02/automatic-enhancements, [103] https://blog.aks.azure.com/2026/06/10/app-routing-gateway-api-ga, [104] https://azure.microsoft.com/updates?id=general-availability-application-gateway-for-containers, [105] https://azure.microsoft.com/updates?id=525419, [106] https://mcr.microsoft.com/v2/oss/v2/ingress-nginx/controller/tags/list, [107] https://mcr.microsoft.com/v2/application-lb/images/alb-controller/tags/list, [108] https://gateway-api.sigs.k8s.io/guides/user-guides/http-redirect-rewrite/, [109] https://gateway-api.sigs.k8s.io/guides/getting-started/migrating-from-ingress/, [110] https://nginx.org/en/docs/http/ngx_http_core_module.html, [111] https://cloud-provider-azure.sigs.k8s.io/topics/loadbalancer/, [112] https://cert-manager.io/docs/usage/gateway/, [113] https://doc.traefik.io/traefik/reference/install-configuration/providers/kubernetes/kubernetes-ingress-nginx/
