# F1: Kubernetes Gateway API, state of play on 2026-11-04

Research for `ingress-nginx-inventory`, an open-source, read-only CLI from CLAZA IT. This file covers the Gateway API specification only. It does not cover what each AKS target (`appRoutingGateway`, `agc`, `agcIngress`, `istio`) implements. That needs separate, per-target research (see section 6).

## How this was verified

- **Releases and dates** come from the `published_at` timestamps (UTC) returned by the GitHub Releases API, cross-checked against each release page [REL-API].
- **Channel and support level of each field** come from the Go API types at tag `v1.7.0`.
  - A field is Experimental-only if it carries a `<gateway:experimental>` marker; otherwise it ships in the Standard CRDs.
  - Support levels come from the `Support:` comments [HR, GW, SH, GR, TLSR, BTLS, LS].
- **Graduation versions** come from the same markers diffed across tags (v0.5.0 to v1.7.0) and from the release notes.
- **Served and storage versions** come from the generated CRDs under `config/crd/{standard,experimental}` at `v1.7.0` [CRD-STD, CRD-EXP].
- **Conformance feature names** come from `pkg/features` at `v1.7.0` [FEAT].
- **ingress-nginx behaviour** comes from its docs and source at its last tag, `controller-v1.15.1`.
- Anything I could not confirm is marked **UNVERIFIED**.

Conventions used below:

- **Std since** is the first SemVer release whose Standard-channel CRDs contain the resource or field.
- **Exp since** is the first release that shipped it in the Experimental channel (the channels were introduced in v0.5.0) [REL-0.5.0].
- **Support** is the level written in the v1.7.0 types:
  - **Core**: portable, and every implementation is expected to support it.
  - **Extended**: portable, but optional.
  - **Implementation-specific**: not portable and not covered by conformance tests [DOC-CONF].
- When levels overlap (for example, a Core field inside an Extended struct), the spec says "the minimum expressed support level should be interpreted" [DOC-CONF].

---

## 0. Headline findings

1. The latest release is **v1.7.0, published 2026-10-29**. The newest patch on the previous line is v1.6.3 (2026-10-06). No v1.8 pre-release exists yet [REL-API][REL-1.7.0].
2. In the last 12 months the following graduated to Standard:
   - HTTPRoute **CORS**, **ListenerSet**, **TLSRoute v1**, Gateway **frontend client-certificate validation** and **backend client certificate**: v1.5.0, 2026-02-27 [REL-1.5.0].
   - **TCPRoute/UDPRoute v1**: v1.6.0, 2026-06-29 [REL-1.6.0].
   - HTTPRoute **retries**: v1.7.0 [REL-1.7.0].
3. Still **Experimental-only** in v1.7.0:
   - The HTTPRoute **ExternalAuth** filter (GEP-1494).
   - **Session persistence** (GEP-1619). The route-level field is now *deprecated* in favour of the experimental `XBackend` resource (GEP-4894).
   - **Pre-routing listener filters** (GEP-5224).

   So Standard has no counterpart for ingress-nginx `auth-url` or `affinity: cookie` [HR#L333-L342][HR#L942-L953][REL-1.7.0].
4. **Regex matching and regex precedence are implementation-specific**. Gateway API matching is **case-sensitive**. ingress-nginx regex paths are **case-insensitive** (`~*`) and ordered by **descending path-string length**. Switching on `use-regex` or `rewrite-target` anywhere on a host turns *every* path of that host into a regex [HR#L192-L217][HR#L501-L550][IN-PATH].
5. The documented HTTP→HTTPS redirect needs the `scheme` field of `RequestRedirect`, which is **Extended** (`HTTPRouteSchemeRedirect`). Status 301/302 are Core; **303/307/308 are Extended** and are accepted by Standard CRDs only from **v1.5.0**. ingress-nginx's default HTTPS redirect code is **308** [HR#L1231-L1322][REL-1.6.2][IN-CFG#L800][IN-LUA#L157-L173].

---

## 1. Releases and dates (as of 2026-11-04)

### 1.1 Release list

| Tag | Kind | Published (UTC) | What matters for an ingress-nginx migration |
|---|---|---|---|
| **v1.7.0** | SemVer minor (marked Latest [REL-LATEST]) | **2026-10-29** | **Standard:** HTTPRoute `retry` (`codes`, `attempts`, `backoff`), the `TLSRouteModeMixed` conformance feature (the release notes spell it `TLSRouteMixedMode`; the string in `pkg/features` is `TLSRouteModeMixed`) [FEAT], and enforcement of unique rule names.<br>**New Experimental:** pre-routing listener filters (GEP-5224), Gateway address routability (GEP-5093), ClusterTrustBundle in `caCertificateRefs` (GEP-5075), `XTelemetryPolicy` (GEP-4768).<br>**Session persistence** moved to `XBackend`; the route-inline field is deprecated [REL-1.7.0][REL-1.7.0-rc.3] |
| v1.7.0-rc.3 / rc.1 | pre-release | 2026-10-23 / 2026-10-08 | rc.2 was retired [REL-1.7.0-rc.3] |
| v1.6.3 | patch | 2026-10-06 | Conformance-test changes and a Go toolchain build fix; no API change [REL-1.6.3] |
| v1.6.2 | patch | 2026-09-03 | "HTTPRequestRedirectFilter status codes 303, 307, and 308 are Extended conformance, not Core." [REL-1.6.2] |
| v1.6.1 | patch | 2026-07-16 | Test and conformance fixes [REL-API] |
| **v1.6.0** | SemVer minor | 2026-06-29 | **TCPRoute and UDPRoute GA (v1).**<br>`XBackend` added as Experimental.<br>HTTPRoute and GRPCRoute on the same hostname: rejection made optional.<br>Gateway `infrastructure.annotations` limit raised to 16 [REL-1.6.0].<br>The CEL rule requiring `tls` on HTTPS listeners, announced in rc.1/rc.2 (#4788, #4985), was **reverted before GA** (#5021) [CL-1.6] |
| monthly-2026.05 | monthly Experimental | 2026-05-06 | Snapshot of `main` [REL-API] |
| monthly-2026.04 | monthly Experimental | 2026-04-08 | [REL-API] |
| v1.5.1 | patch | 2026-03-14 | [REL-API] |
| **v1.5.0** | SemVer minor | **2026-02-27** | **GA:** client-certificate validation (GEP-91, GEP-3567), backend client certificate (GEP-3155), **ListenerSet** (GEP-1713), **HTTPRoute CORS** (GEP-1767), **TLSRoute v1** (GEP-2643). ReferenceGrant gains `v1`.<br>Adds the `safe-upgrades` admission policy [REL-1.5.0] |
| monthly-2026.01 | monthly Experimental | 2026-01-07 | [REL-API] |
| v1.4.1 | patch | 2025-12-04 | BackendTLSPolicy: the spec now says implementations "SHOULD NOT support more than one targetRef"; the CRD still accepts up to 16 [REL-1.4.1][HIST-BTLS-1.4.1][BTLS#L88-L120]. Its install YAML was corrected in place on 2026-02-10 (see open conflict 2) |
| monthly-2025.12 | first monthly | 2025-12-01 | Introduced the 303, 307 and 308 redirect codes on `main` [REL-M2512] |
| v1.4.0 | SemVer minor | 2025-10-06 | **GA:** BackendTLSPolicy v1 (GEP-1897) and GatewayClass `supportedFeatures`. Rule `name` becomes Standard.<br>**Experimental:** ExternalAuth (GEP-1494) [REL-1.4.0] |
| v1.3.0 | SemVer minor | 2025-04-24 | **GA:** percentage request mirroring (GEP-3171).<br>**Experimental:** CORS, `XListenerSet`, `XBackendTrafficPolicy` [REL-1.3.0] |
| v1.2.0 / v1.2.1 | minor / patch | 2024-10-03 / 2024-11-29 | **GA:** timeouts (GEP-1742), infrastructure labels and annotations (GEP-1867/1762), backend protocol `appProtocol` (GEP-1911).<br>**Experimental:** retries, percentage mirroring [REL-1.2.0] |
| v1.1.0 / v1.1.1 | minor / patch | 2024-05-09 / 2024-10-31 | **GA:** GRPCRoute v1 and mesh support.<br>**Experimental:** session persistence, frontend client-certificate validation [REL-1.1.0] |
| v1.0.0 | major | 2023-10-31 | Gateway, GatewayClass and HTTPRoute reach `v1` GA [REL-1.0.0] |

### 1.2 Release mechanics a tool must know

**Two channels.** "The Standard release channel includes: Resources that have graduated to Beta or GA API Versions … All fields that have graduated to Standard from the Experimental Channel." The Experimental channel "includes everything in the Standard release channel, plus: Resources with Alpha API Versions; All new fields before they graduate…" and "makes no backwards compatibility guarantees" [DOC-VERS].

**Cadence.** "We target a 4-months cadence for standard channel releases" [DOC-VERS].

**Monthly Experimental releases.** These "Only include experimental-install.yaml", "Are not allowed to change the Standard channel", and are "snapshots of the main branch" [DOC-VERS].
- The docs show the tag format as `monthly-2025-11`, but real tags use a dot (`monthly-2025.12`).
- Only four monthlies exist; the last is `monthly-2026.05` [REL-API].

**Detecting what is installed.** Every CRD carries `gateway.networking.k8s.io/bundle-version: vX.Y.Z` and `gateway.networking.k8s.io/channel: standard|experimental` [DOC-VERS][CRD-STD].

**Upgrade guard.** v1.7.0 ships a `ValidatingAdmissionPolicy` named `safe-upgrades.gateway.networking.k8s.io` that denies:
- installing Experimental CRDs over Standard ones;
- installing Gateway API CRDs whose `bundle-version` matches `v1.[0-6].\d+` or `v0`. Its message reads "Installing CRDs with version before v1.7.0 is prohibited by default" [VAP].

v1.5.0 introduced the policy with a "prior to 1.5" floor [REL-1.5.0].

**Install size.** "The Experimental channel CRDs are too large for a standard `kubectl apply`", so use `--server-side=true` [REL-1.5.0].

**Kubernetes versions.** The project commits to "Support a minimum of the most recent 5 Kubernetes minor versions" [DOC-VERS]. TLSRoute's CEL validation "requires Kubernetes 1.31 or higher" [REL-1.5.0].

### 1.3 API versions served by the v1.7.0 CRDs

| CRD | Standard channel | Experimental channel |
|---|---|---|
| GatewayClass, Gateway, HTTPRoute | `v1` (storage), `v1beta1` | same |
| GRPCRoute, ListenerSet | `v1` | `v1` |
| TLSRoute | `v1` only. `v1alpha2` and `v1alpha3` are deprecated and **not served** | `v1` plus deprecated `v1alpha2` and `v1alpha3` |
| TCPRoute, UDPRoute | `v1` only. `v1alpha2` is deprecated and not served | `v1` plus deprecated `v1alpha2` |
| BackendTLSPolicy | `v1` only. `v1alpha3` is not served | `v1`, `v1alpha3` |
| ReferenceGrant | `v1` and `v1beta1`. **The storage version is still `v1beta1`** | same |
| XBackend, XBackendTrafficPolicy, XMesh, XTelemetryPolicy (`gateway.networking.x-k8s.io`) | not present | `v1alpha1` |

Source for every row: the CRD YAML under [CRD-STD] and [CRD-EXP], plus [RGB].

The v1.5.0 notes said TLSRoute `v1alpha2` would be removed from the Experimental channel "in 1.6". It was not: the v1.7.0 Experimental TLSRoute CRD still serves `v1alpha2` and `v1alpha3` (both deprecated). A tool reading a cluster with Experimental CRDs can still meet `v1alpha2` TLSRoutes [REL-1.5.0][CRD-EXP].

---

## 2. Feature table (state at v1.7.0)

Field paths are relative to the resource `spec` unless stated otherwise. In this section, "Feature" means the conformance feature name an implementation can list in `GatewayClass.status.supportedFeatures` (Standard since v1.4.0, GEP-2162) [GC#L305-L311][FEAT][REL-1.4.0].

### 2.1 HTTPRoute matching

| Feature | Field (v1.7.0) | Channel | Support | Exp since → Std since | GEP | Conformance feature | Src |
|---|---|---|---|---|---|---|---|
| Path `Exact` | `rules[].matches[].path.type: Exact` | Standard | **Core** | Std v0.5.0 (v1beta1); `v1` GA in v1.0.0 | none (original HTTPRoute API) | `HTTPRoute` | [HR#L501-L582][HIST-0.5.0][REL-1.0.0] |
| Path `PathPrefix` (the default: `PathPrefix /`) | `…path.type: PathPrefix` | Standard | **Core** | Std v0.5.0 | none | `HTTPRoute` | [HR#L501-L582] |
| Path `RegularExpression` | `…path.type: RegularExpression` | Standard (the enum value is in Standard) | **Implementation-specific** (dialect is "POSIX, PCRE, RE2 or any other") | Std v0.5.0 | none for the field. GEP-4359 (Memorandum: portable regex subset). GEP-4360 (Provisional: regex rewrites). GEP-3965 (Experimental GEP; its `extension` match field is **not** in the v1.7.0 types) | none | [HR#L541-L549][GEP-4359][GEP-4360][GEP-3965] |
| Header match | `…matches[].headers[]` (≤16), `type: Exact` or `RegularExpression` | Standard | **Core** for `Exact`; Implementation-specific for `RegularExpression` | Std v0.5.0 | none | `HTTPRoute` | [HR#L584-L666] |
| Query-parameter match | `…matches[].queryParams[]` (≤16) | Standard | **Extended** for `Exact` (the enum comment says Core; the field comment says Extended, and Extended wins under the minimum rule); Implementation-specific for regex | Std v0.5.0 | none | `HTTPRouteQueryParamMatching` | [HR#L668-L735][DOC-CONF] |
| Method match | `…matches[].method` (GET…PATCH) | Standard | **Extended** | added in v0.4.0, Std v0.5.0 | none | `HTTPRouteMethodMatching` | [HR#L737-L823][REL-0.4.0] |
| Hostnames | `hostnames[]` (≤16; a `*.` prefix is a suffix match) | Standard | **Core** | Std v0.5.0 | none | `HTTPRoute` | [HR#L62-L127] |
| Route sizing limits | ≤16 rules, ≤64 matches per rule, **≤128 matches per route** (since v1.2.0), ≤16 filters per rule, ≤16 backendRefs per rule, ≤32 parentRefs | Standard | n/a | 128-match cap since v1.2.0 | none | n/a | [HR#L129-L143][HR#L219-L312][SH#L243-L259][HIST-1.2.0] |

### 2.2 HTTPRoute filters (`rules[].filters[]`, and `rules[].backendRefs[].filters[]`)

| Feature | Field | Channel | Support | Exp since → Std since | GEP | Conformance feature | Src |
|---|---|---|---|---|---|---|---|
| RequestHeaderModifier (`set`/`add`/`remove`, ≤16 each, static values) | `type: RequestHeaderModifier` | Standard | **Core** in a rule; Extended in a backendRef | Std v0.5.0 | none | `HTTPRoute`; `HTTPRouteBackendRequestHeaderModification` | [HR#L888-L894][HR#L971-L978][HIST-0.5.0] |
| ResponseHeaderModifier | `type: ResponseHeaderModifier` | Standard | **Extended** | Exp v0.6.0 → **Std v0.7.0** | GEP-1323 | `HTTPRouteResponseHeaderModification` | [HR#L896-L902][REL-0.6.0][REL-0.7.0] |
| RequestRedirect, the filter itself | `type: RequestRedirect` | Standard | **Core** | Std v0.5.0 | none | `HTTPRoute` | [HR#L919-L925] |
| ↳ `hostname` | `requestRedirect.hostname` | Standard | **Core** | Std v0.5.0 | none | `HTTPRoute` | [HR#L1253-L1260] |
| ↳ `scheme` (`http`, `https`) | `requestRedirect.scheme` | Standard | **Extended** | Std v0.5.0 | none | `HTTPRouteSchemeRedirect` | [HR#L1234-L1251][FEAT] |
| ↳ `port` | `requestRedirect.port` | Standard | **Extended** | Std v0.5.0 | none | `HTTPRoutePortRedirect` | [HR#L1271-L1298] |
| ↳ `path` (`ReplaceFullPath`, `ReplacePrefixMatch`) | `requestRedirect.path` | Standard | **Extended** | Exp v0.5.0 → **Std v0.7.0** | GEP-726 | `HTTPRoutePathRedirect` | [HR#L1262-L1269][REL-0.7.0] |
| ↳ `statusCode`: allowed values **301, 302, 303, 307, 308** (default 302) | `requestRedirect.statusCode` | Standard | **301/302 Core; 303/307/308 Extended** | Enum was only `301;302` through v1.4.x. 303/307/308 first appeared on `main` (monthly-2025.12) and are **in the Standard enum from v1.5.0** | none (PR #3823) | `HTTPRoute303RedirectStatusCode`, `HTTPRoute307RedirectStatusCode`, `HTTPRoute308RedirectStatusCode` | [HR#L1300-L1321][HIST-1.4.0][HIST-1.5.0][REL-M2512][REL-1.6.2] |
| URLRewrite `hostname` | `urlRewrite.hostname` | Standard | **Extended** | Exp v0.5.0 → **Std v0.7.0** | GEP-726 | `HTTPRouteHostRewrite` | [HR#L1324-L1344][REL-0.7.0] |
| URLRewrite `path` (`ReplaceFullPath`, or `ReplacePrefixMatch`, which requires exactly one `PathPrefix` match in the rule) | `urlRewrite.path` | Standard | **Extended** | Exp v0.5.0 → **Std v0.7.0** | GEP-726. Regex rewrite is GEP-4360 (Provisional, no API) | `HTTPRoutePathRewrite`; backend-level `HTTPRouteBackendURLRewrite` (tests provisional) | [HR#L151-L154][HR#L1148-L1229][GEP-4360][REL-1.7.0] |
| RequestMirror (to one endpoint of a `backendRef`; responses ignored; repeatable) | `type: RequestMirror` | Standard | **Extended** | Std v0.5.0; repeat allowed in spec text since v0.8.0 | none | `HTTPRouteRequestMirror`, `HTTPRouteRequestMultipleMirrors` | [HR#L904-L917][HR#L1346-L1377][HIST-0.8.0] |
| ↳ `percent` (0–100) or `fraction` (numerator/denominator), one or the other | `requestMirror.percent` / `.fraction` | Standard | **Extended** | Exp v1.2.0 → **Std v1.3.0** | GEP-3171 | `HTTPRouteRequestPercentageMirror` | [HR#L1379-L1398][SH#L1076-L1086][REL-1.3.0] |
| CORS (`allowOrigins`, `allowCredentials`, `allowMethods`, `allowHeaders`, `exposeHeaders`, `maxAge` default 5) | `type: CORS` | Standard | **Extended** | Exp v1.3.0 → **Std v1.5.0** (no repeats within a rule since v1.6.0) | GEP-1767 | `HTTPRouteCORS` | [HR#L934-L940][HR#L1401-L1635][REL-1.3.0][REL-1.5.0][REL-1.6.0] |
| ExternalAuth (`protocol: HTTP` or `GRPC`, Envoy `ext_authz`; "MUST fail closed") | `type: ExternalAuth` | **Experimental only** | Extended | **Exp v1.4.0**; still Experimental at v1.7.0 | GEP-1494 (Experimental) | Named only in API comments (`HTTPRouteExternalAuth`, `…GRPC`, `…HTTP`, `…ForwardBody`); **not** in `pkg/features` at v1.7.0 | [HR#L942-L953][HR#L1637-L1827][FEAT][REL-1.4.0] |
| ExtensionRef (vendor filter; an unresolved ref returns an error rather than being skipped) | `type: ExtensionRef` | Standard | **Implementation-specific** | Std v0.5.0 | none | none | [HR#L868-L873][HR#L955-L965] |
| Filters in `backendRefs[].filters[]` | `rules[].backendRefs[].filters` | Standard | The field comment says **Implementation-specific**; each filter type's comment says "Support in HTTPBackendRef: Extended" (inconsistent, see uncertainties) | Std v0.5.0 | none | e.g. `HTTPRouteBackendRequestHeaderModification` | [HR#L1896-L1911][HR#L971-L1044] |

Filter constraints (all Standard, enforced by CEL in v1.7.0):

- `RequestRedirect` "must not be used together with backendRefs".
- `RequestRedirect` and `URLRewrite` are mutually exclusive.
- `CORS`, `RequestHeaderModifier`, `ResponseHeaderModifier`, `RequestRedirect` and `URLRewrite` "cannot be repeated".
- Implementations "SHOULD implement filters in the order they are specified" [HR#L146-L154][HR#L225-L271].

### 2.3 HTTPRoute rule-level traffic policy and backends

| Feature | Field | Channel | Support | Exp since → Std since | GEP | Conformance feature | Src |
|---|---|---|---|---|---|---|---|
| Request timeout (whole transaction; `0s` should disable) | `rules[].timeouts.request` | Standard | **Extended** | Exp v1.0.0 → **Std v1.2.0** | GEP-1742 (+ GEP-2257 duration format) | `HTTPRouteRequestTimeout` | [HR#L345-L374][REL-1.0.0][REL-1.2.0] |
| Backend request timeout (per attempt; must not exceed `request`) | `rules[].timeouts.backendRequest` | Standard | **Extended** | Exp v1.0.0 → **Std v1.2.0** | GEP-1742 | `HTTPRouteBackendTimeout` | [HR#L348][HR#L376-L397] |
| Retries: `codes` (400–599; implementations **MUST** support 500, 502, 503, 504) | `rules[].retry.codes` | Standard | **Extended** | Exp v1.2.0 → **Std v1.7.0** | GEP-1731 | `HTTPRouteRetryCodes` | [HR#L400-L419][HR#L481-L499][REL-1.7.0] |
| Retries: `attempts` (default 1; explicit 0 disables) | `rules[].retry.attempts` | Standard | **Extended** | Exp v1.2.0 → **Std v1.7.0** | GEP-1731 | `HTTPRouteRetryConnectionError` (connection-failure retries) | [HR#L421-L435][REL-1.7.0] |
| Retries: `backoff` (base interval) | `rules[].retry.backoff` | Standard | **Implementation-specific** | Exp v1.2.0 → **Std v1.7.0** | GEP-1731 | none | [HR#L437-L478][REL-1.7.0] |
| Session persistence (`type` Cookie, which is Core within the struct, or Header, which is Extended; `cookie.name`, `cookie.path` default `/`, `lifetimeType`, `absoluteTimeout`) | `rules[].sessionPersistence` | **Experimental only**, and **Deprecated** in v1.7.0 ("use the Backend resource", GEP-4894) | Extended | **Exp v1.1.0** (with `BackendLBPolicy`, which merged into `XBackendTrafficPolicy` in v1.3.0); moved to `XBackend` in v1.7.0 | GEP-1619 (Experimental), GEP-4894 | none in `pkg/features` at v1.7.0 | [HR#L333-L342][SH#L923-L1074][REL-1.1.0][REL-1.3.0][REL-1.7.0] |
| Weighted backends (weight/sum; default 1; 0–1,000,000; "not a percentage") | `rules[].backendRefs[].weight` | Standard | **Core** for HTTPRoute (also Core for GRPCRoute; Extended for TLSRoute) | Std v0.5.0 | none | `HTTPRoute` | [HR#L301-L312][SH#L315-L333][GR#L299][TLSR#L167] |
| Backend Service kind | `backendRefs[]` | Standard | **Core** for Service, Extended for ServiceImport, Implementation-specific otherwise | Std v0.5.0 | none | `HTTPRoute` | [HR#L301-L305] |
| Invalid backend or no endpoints | n/a | Standard | All-invalid with no filters → **500**; proportional 500s; no ready endpoints "SHOULD return a 503" | v1.2.0 clarification | none | n/a | [HR#L273-L299][REL-1.2.0] |
| Rule name (unique per route) | `rules[].name` | Standard | **Extended** | Exp v1.2.0 → **Std v1.4.0**; uniqueness CEL enforced in Standard from v1.7.0 | GEP-995 | `HTTPRouteNamedRouteRule` | [HR#L133][HR#L156-L160][REL-1.4.0][REL-1.7.0] |
| ParentRef `port` (attach by listener port) | `parentRefs[].port` | Standard | **Extended** | **Std v1.1.0** | GEP-957 | `HTTPRouteParentRefPort` | [SH#L120-L155][REL-1.1.0] |

The duration format (GEP-2257) is a string matching `^([0-9]{1,5}(h|m|s|ms)){1,4}$` [SH#L885-L889].

### 2.4 Service `appProtocol` handling (backend protocol)

| Feature | Where | Channel | Support | Exp since → Std since | GEP | Conformance feature | Src |
|---|---|---|---|---|---|---|---|
| `kubernetes.io/h2c` (HTTP/2 cleartext) | core `Service.spec.ports[].appProtocol`, honoured on `backendRefs` | Standard (behaviour) | **Extended** ("Support for Kubernetes Service appProtocol: Extended") | Exp v1.0.0 → **Std v1.2.0** | GEP-1911 | `HTTPRouteBackendProtocolH2C` | [HR#L1889][REL-1.0.0][REL-1.2.0][GEP-1911] |
| `kubernetes.io/ws` (WebSocket cleartext) | same | Standard | **Extended** | Exp v1.0.0 → **Std v1.2.0** | GEP-1911 | `HTTPRouteBackendProtocolWebSocket` | same |
| `kubernetes.io/wss` (WebSocket over TLS) | same | Standard | **Extended**. With HTTPRoute, GEP-1911 allows it "Only if there is a corresponding BackendTLSPolicy" | Exp v1.0.0 → **Std v1.2.0** | GEP-1911, GEP-1897 | `HTTPRouteBackendProtocolWebSocket` | [GEP-1911] |
| Unsupported `appProtocol` | n/a | Standard | Backend invalid: `ResolvedRefs=False`, reason `UnsupportedProtocol` | v1.2.0 | GEP-1911 | n/a | [HR#L1836-L1852][GEP-1911] |
| `XBackend.spec.protocol` (`TCP`, `HTTP`, `HTTP2`, `HTTP11`, `H2C`, `MCP`, `GRPC`, `WSS`) | `XBackend` (`gateway.networking.x-k8s.io/v1alpha1`) | **Experimental only** | Core: HTTP, HTTP2, H2C, HTTP11. Extended: GRPC, MCP, TCP, WSS | Exp v1.6.0; `WSS` added in v1.7.0 | GEP-4894 | n/a | [XB#L85-L154][XB#L250-L296][REL-1.6.0][REL-1.7.0] |

GEP-1911 states the combinations as "Implementations MAY support…" and says "Absence of the appProtocol field does not imply the implementation should disable any features (eg. websocket upgrades)" [GEP-1911].

The `appProtocol` paragraph in the `BackendRef` and `HTTPBackendRef` godoc is still wrapped in `<gateway:experimental:description>`, so the Standard CRD descriptions omit it. The feature itself has been Standard since v1.2.0 [HR#L1836-L1852][SH#L290-L306][REL-1.2.0].

### 2.5 Other route kinds

| Feature | Resource | Channel | Support | Exp since → Std since | GEP | Conformance feature | Src |
|---|---|---|---|---|---|---|---|
| GRPCRoute | `GRPCRoute` `v1` | Standard | Core feature set of the GRPC profile.<br>Matching: exact service+method is **Core**; regex is Implementation-specific.<br>Filters: RequestHeaderModifier is **Core** per the types (see uncertainties), Response/Mirror Extended, ExtensionRef Implementation-specific | Exp v0.6.0 → **Std v1.1.0** | GEP-1016 | `GRPCRoute`, `GRPCRouteNamedRouteRule`, `GRPCRouteRequestHeaderModifier` | [GR#L355-L402][GR#L525-L600][REL-0.6.0][REL-1.1.0] |
| HTTPRoute and GRPCRoute on one hostname | n/a | Standard | The implementation "MAY reject one of the two routes"; if so, the oldest wins, then alphabetical order. Before v1.6.0 rejection was mandatory | changed in v1.6.0 | GEP-1016 | n/a | [GR#L144-L163][REL-1.6.0] |
| TLSRoute (SNI routing; ingress-nginx `ssl-passthrough`) | `TLSRoute` `v1` | Standard | **Core** for a `TLS` listener in `Passthrough` mode; Extended for `Terminate` mode (feature `TLSRouteModeTerminate`) and mixed mode (feature `TLSRouteModeMixed`, Standard since v1.7.0).<br>`hostnames` required (1–1024); exactly 1 rule; backend weight Extended | Exp v0.5.0 (`v1alpha2`; the API already existed in v0.4.0) → **Std v1.5.0** (`v1`) | GEP-2643 | `TLSRoute`, `TLSRouteModeTerminate`, `TLSRouteModeMixed` | [TLSR#L50-L176][REL-1.5.0][REL-1.7.0-rc.3][FEAT] |
| TCPRoute | `TCPRoute` `v1` | Standard | Its own conformance feature. Service backendRef: Core | Exp v0.5.0 (`v1alpha2`) → **Std v1.6.0** | GEP-2644 | `TCPRoute` | [TCPR][REL-0.5.0][REL-1.6.0] |
| UDPRoute | `UDPRoute` `v1` | Standard | Its own conformance feature. Service backendRef: Extended | Exp v0.5.0 (`v1alpha2`) → **Std v1.6.0** | GEP-2645 | `UDPRoute` | [UDPR][REL-0.5.0][REL-1.6.0] |

### 2.6 Gateway, listeners and TLS

| Feature | Field | Channel | Support | Exp since → Std since | GEP | Conformance feature | Src |
|---|---|---|---|---|---|---|---|
| Listener basics | `listeners[].{name,hostname,port,protocol}` (≤64 listeners; protocols HTTP, HTTPS, TLS, TCP, UDP or a domain-prefixed custom value) | Standard | **Core** | Std v0.5.0; GA in v1.0.0 | none | `Gateway` | [GW#L74-L253][GW#L591-L638] |
| Listener TLS mode | `listeners[].tls.mode`: `Terminate` (default) or `Passthrough` (Passthrough only with TLSRoute) | Standard | **Core** | Std v0.5.0 | GEP-2907 (Memorandum on TLS placement) | `Gateway` | [GW#L670-L690][GW#L786-L802] |
| Listener certificates | `listeners[].tls.certificateRefs[]` (≤64; cross-namespace needs a ReferenceGrant) | Standard | **Core** for one `kubernetes.io/tls` Secret; Implementation-specific for several, or other kinds | Std v0.5.0 | GEP-746, GEP-851 | `Gateway` | [GW#L692-L720] |
| Listener TLS options (e.g. minimum version, ciphers) | `listeners[].tls.options` (map, ≤16; un-prefixed keys reserved) | Standard | **Implementation-specific** | Std v0.5.0 | GEP-2907 | none | [GW#L722-L735][HIST-GW-0.5.0] |
| Listener TLS validation | CEL rules: `tls` is forbidden for protocols HTTP, TCP and UDP; if an HTTPS listener has `tls`, its mode must be `Terminate`; a protocol `TLS` listener must set `tls.mode`; mode `Terminate` needs `certificateRefs` or `options` | Standard | n/a | n/a | n/a | n/a | [GW#L246-L251][GW#L672] |
| Frontend client-certificate validation (mTLS) | **`spec.tls.frontend.default.validation.{caCertificateRefs,mode}`**, plus per-port overrides in `spec.tls.frontend.perPort[].{port,tls.validation}`. It applies to *all HTTPS listeners on a port*, not to a hostname | Standard | `spec.tls` is **Extended**.<br>`caCertificateRefs`: one ConfigMap with `ca.crt` is Core.<br>`mode`: `AllowValidOnly` is Core, `AllowInsecureFallback` is Extended | **Exp v1.1.0** as per-listener `tls.frontendValidation`; moved to Gateway level in v1.4.0 (still Experimental); **Std v1.5.0** | GEP-91, GEP-3567 | `GatewayFrontendClientCertificateValidation`, `GatewayFrontendClientCertificateValidationInsecureFallback` | [GW#L296-L302][GW#L738-L945][HIST-GW-1.1.0..1.5.0][REL-1.1.0][REL-1.5.0][GEP-91] |
| Gateway-to-backend client certificate | `spec.tls.backend.clientCertificateRef` | Standard | Core for a `kubernetes.io/tls` Secret, within an Extended `spec.tls` | **Exp v1.2.0** (`spec.backendTLS`); moved in v1.4.0; **Std v1.5.0** | GEP-3155 | `GatewayBackendClientCertificate` | [GW#L640-L668][REL-1.2.0][REL-1.5.0] |
| Listener isolation (a request matches at most one listener; HTTP 404 or gRPC Unimplemented otherwise) | behaviour | Standard | **Extended** | defined in v1.0.0 | none | `GatewayHTTPListenerIsolation` | [GW#L196-L216][REL-1.0.0] |
| Misdirected-request detection (HTTP 421) | behaviour | Standard | Feature exists; spec text is "SHOULD" | Spec text since v1.3.0 (GEP-3567). The feature name exists only **from v1.5.0** (absent from `pkg/features` at v1.3.0 and v1.4.0). Its conformance test has been limited to HTTP/2 since v1.5.1 (#4665) | GEP-3567 | `GatewayHTTPSListenerDetectMisdirectedRequests` | [GW#L392-L409][REL-1.3.0][HIST-FEAT-1.4.0][HIST-FEAT-1.5.0][REL-1.5.1][FEAT] |
| Infrastructure labels | `spec.infrastructure.labels` (≤8) | Standard | **Extended** | Exp v1.0.0 → **Std v1.2.0** | GEP-1867, GEP-1762 | `GatewayInfrastructure` (named `GatewayInfrastructurePropagation` in v1.2.0–v1.6.x) | [GW#L1207-L1225][REL-1.2.0][FEAT][HIST-FEAT-1.6.0] |
| Infrastructure annotations | `spec.infrastructure.annotations` (≤16 since v1.6.0, previously 8) | Standard | **Extended** | Exp v1.0.0 → **Std v1.2.0** | GEP-1867, GEP-1762 | same | [GW#L1227-L1240][REL-1.6.0] |
| Per-Gateway parameters | `spec.infrastructure.parametersRef` | Standard | **Implementation-specific** | Exp v1.1.0 → **Std v1.2.0** (the `infrastructure` stanza lost its experimental marker) | GEP-1867 | none | [GW#L1242-L1260][HIST-GW-1.1.0..1.2.0] |
| Static or requested addresses | `spec.addresses[]` (≤16; `value` optional since v1.3.0) | Standard | **Extended** | Std v0.5.0 | none | `GatewayStaticAddresses`, `GatewayAddressEmpty` | [GW#L255-L282][REL-1.3.0] |
| Route attachment policy | `listeners[].allowedRoutes.namespaces.from` (`All`, `Selector`, **`Same` is the default**), `allowedRoutes.kinds` | Standard | **Core** | Std v0.5.0 | none | `Gateway` | [GW#L457-L483][GW#L947-L1018] |
| Pre-routing listener filters (`ExternalAuth`, `ExtensionRef`; strict order; cannot change `Host`) | `listeners[].filters.requests[]` | **Experimental only** | Extended | **Exp v1.7.0** | GEP-5224 | `GatewayListenerFilters` (experimental) | [GW#L485-L589][REL-1.7.0] |
| Default Gateways | `spec.defaultScope`, `HTTPRoute.spec.useDefaultGateways` | **Experimental only** | n/a | Exp v1.4.0 | GEP-3793 (the GEP page lists it as Implementable) | none | [GW#L304-L324][SH#L261-L276][REL-1.4.0] |

### 2.7 Multi-tenancy and cross-namespace

| Feature | Resource or field | Channel | Support | Exp since → Std since | GEP | Conformance feature | Src |
|---|---|---|---|---|---|---|---|
| ReferenceGrant | `ReferenceGrant` (`v1` and `v1beta1`; storage `v1beta1`) | Standard | **Core** | `ReferencePolicy` v1alpha2 in v0.4.0, renamed in v0.5.0 → **Std v0.6.0** (`v1beta1`); `v1` added in v1.5.0 | GEP-709 | `ReferenceGrant` | [RG][RGB][REL-0.6.0][REL-1.5.0] |
| Cross-namespace `backendRefs` | `rules[].backendRefs[].namespace` | Standard | Needs a ReferenceGrant in the target namespace, else `ResolvedRefs=False` with `RefNotPermitted` | Std v0.5.0 | GEP-709 | n/a | [HR#L1829-L1834][HR#L1861-L1874] |
| Cross-namespace certificates | `listeners[].tls.certificateRefs[].namespace` | Standard | Needs a ReferenceGrant, else `RefNotPermitted` | Std v0.5.0 | GEP-746, GEP-709 | n/a | [GW#L701-L705] |
| ListenerSet (tenant-owned listeners and certificates merged into a parent Gateway) | `ListenerSet` `v1` with `spec.parentRef`, `spec.listeners[]` (≤64); parent `Gateway.spec.allowedListeners.namespaces.from` (**default `None`**) | Standard | **Extended** | Exp v1.3.0 (`XListenerSet`, `x-k8s.io` group) → **Std v1.5.0** (`ListenerSet`) | GEP-1713 | `ListenerSet` | [LS#L32-L225][GW#L291-L360][REL-1.3.0][REL-1.5.0] |
| ListenerSet and ReferenceGrant semantics | n/a | Standard | "A ListenerSet can reference secrets/backends in its own namespace without a ReferenceGrant". Gateway-level grants are not inherited | v1.5.0 | GEP-1713 | n/a | [LS#L48-L51] |
| BackendTLSPolicy (Gateway-to-backend TLS; ingress-nginx `proxy-ssl-*` and `backend-protocol: HTTPS`) | `BackendTLSPolicy` `v1`: `targetRefs` (Service, optional `sectionName`), `validation.hostname` (SNI, required), `validation.caCertificateRefs` (ConfigMap), `wellKnownCACertificates: System`, `subjectAltNames`, `options` | Standard | Spec **Extended**.<br>`hostname` and a single ConfigMap CA: Core.<br>`subjectAltNames`: Extended.<br>`wellKnownCACertificates` and `options`: Implementation-specific.<br>"SHOULD NOT support more than one targetRef" | Exp v1.0.0 (v1alpha2), v1alpha3 in v1.1.0 → **Std v1.4.0** (`v1`) | GEP-1897 | `BackendTLSPolicy`, `BackendTLSPolicySANValidation` | [BTLS#L55-L276][REL-1.0.0][REL-1.1.0][REL-1.4.0][REL-1.4.1][HIST-BTLS-1.4.0] |

### 2.8 Experimental-only resources that are relevant later

| Resource | Purpose | Channel | Since | GEP | Src |
|---|---|---|---|---|---|
| `XBackend` | Backend abstraction (external hostname or endpoint selector, `protocol`, TLS); the new home of session persistence | Experimental | v1.6.0 | GEP-4894 | [REL-1.6.0][REL-1.7.0][XB] |
| `XBackendTrafficPolicy` | Retry budgets (`retryConstraint`) and the deprecated `sessionPersistence` | Experimental | v1.3.0 | GEP-3388, GEP-1619 | [REL-1.3.0][XBTP] |
| `XTelemetryPolicy` | Tracing configuration (no metrics or access logs yet) | Experimental | v1.7.0 | GEP-4768 | [REL-1.7.0] |

### 2.9 Present in ingress-nginx, absent from Gateway API v1.7.0

I read every field of HTTPRoute, Gateway, ListenerSet, BackendTLSPolicy, `XBackend` and `XBackendTrafficPolicy` at v1.7.0. None of them has a field for:

- **rate limiting** (`limit-rps`, `limit-connections`);
- **client IP allow or deny lists** (`whitelist-source-range`, `denylist-source-range`);
- **request body size** (`proxy-body-size`);
- **connect, read or send timeouts as separate values** (only `request` and `backendRequest` exist);
- **raw NGINX snippets** (`configuration-snippet`, `server-snippet`, `stream-snippet`);
- **ModSecurity or WAF**;
- **HSTS**;
- **cookie-based matching** (`canary-by-cookie`);
- **request mirroring to an arbitrary URL** (`mirror-target` is a URL; Gateway API mirrors to a `backendRef`).

No GEP for rate limiting, IP filtering or body size appears in the GEP index [GEP-LIST]. These can only be carried by implementation-specific policies or by `ExtensionRef` [HR][GW][LS][BTLS][XB][XBTP][IN-ANN].

### 2.10 Quick map: ingress-nginx annotation → Gateway API construct

Annotation names and semantics are from the `controller-v1.15.1` annotations doc [IN-ANN]. In the fidelity column, *Std-Core* means a Standard-channel Core feature, and so on.

| ingress-nginx | Gateway API construct | Fidelity |
|---|---|---|
| `ssl-redirect` (default on when TLS is set), `force-ssl-redirect` | Separate HTTPRoute on the HTTP listener with `RequestRedirect{scheme: https}` | Std-**Extended** (`scheme`), with code caveats (see section 4) |
| `permanent-redirect`(+`-code`), `temporal-redirect`(+`-code`), `from-to-www-redirect`, `app-root` | `RequestRedirect` with `hostname`, `path`, `statusCode` | Std. `hostname` and 301/302 are Core; `path`, 303/307/308 and `scheme` are Extended |
| `rewrite-target` without capture groups | `URLRewrite.path` `ReplacePrefixMatch` / `ReplaceFullPath` | Std-Extended |
| `rewrite-target` with `$1` capture groups, plus `use-regex` | No Standard equivalent (GEP-4360 is Provisional) | **None** |
| `use-regex` | `path.type: RegularExpression` | Std, but **Implementation-specific** dialect and precedence |
| `upstream-vhost` | `URLRewrite.hostname` | Std-Extended |
| `enable-cors`, `cors-*` | `CORS` filter | Std-Extended (since v1.5.0) |
| `auth-url` and related | `ExternalAuth` filter | **Experimental only** |
| `auth-tls-secret`, `auth-tls-verify-client` | `spec.tls.frontend` (Gateway- or port-scoped) | Std-Extended; **not per host** |
| `affinity: cookie`, `session-cookie-*` | `sessionPersistence` / `XBackend` | **Experimental only** |
| `canary-weight` | `backendRefs[].weight` | Std-**Core** |
| `canary-by-header`(+`-value`) | `matches[].headers` `Exact` | Std-Core |
| `canary-by-header-pattern` | header `RegularExpression` | Std, Implementation-specific |
| `canary-by-cookie` | none | **None** |
| `mirror-target` | `RequestMirror` to a Service `backendRef` | Std-Extended (no arbitrary URL) |
| `proxy-read-timeout`, `proxy-send-timeout`, `proxy-connect-timeout` | `timeouts.request` / `backendRequest` | Std-Extended, **semantics differ** |
| `proxy-next-upstream`, `proxy-next-upstream-tries` | `retry.codes` / `retry.attempts` | Std-Extended (since **v1.7.0**) |
| `backend-protocol: GRPC` / `GRPCS` | `GRPCRoute` and/or `appProtocol: kubernetes.io/h2c`; TLS needs a BackendTLSPolicy | Std |
| `backend-protocol: HTTPS`, `proxy-ssl-*` | `BackendTLSPolicy` (+ `spec.tls.backend.clientCertificateRef`) | Std-Extended |
| `ssl-passthrough` | TLS listener `Passthrough` + `TLSRoute` | Std-Core (since v1.5.0) |
| `custom-headers` (uses NGINX `more_set_headers`, which acts on **response** headers [HEADERS-MORE]) | `ResponseHeaderModifier` (static values only) | Std-Extended |
| `x-forwarded-prefix` (a static value sent to the upstream with `proxy_set_header`, but **only inside the `rewrite-target` branch**: without a `rewrite-target` that differs from the path, ingress-nginx emits no header [IN-TPL#L775-L790]) | `RequestHeaderModifier` `set` (translate only when `rewrite-target` is also set) | Std-Core |
| `whitelist-source-range`, `limit-rps`, `proxy-body-size`, `*-snippet`, `enable-modsecurity` | none | **None** (implementation-specific policy) |

---

## 3. Match precedence and conflict resolution

### 3.1 What the spec says (quoted from v1.7.0)

**HTTPRoute rule and match precedence** [HR#L192-L217]:

> Proxy or Load Balancer routing configuration generated from HTTPRoutes MUST prioritize matches based on the following criteria, continuing on ties. Across all rules specified on applicable Routes, precedence must be given to the match having:
>
> * "Exact" path match.
> * "Prefix" path match with largest number of characters.
> * Method match.
> * Largest number of header matches.
> * Largest number of query param matches.
>
> Note: The precedence of RegularExpression path matches are implementation-specific.
>
> If ties still exist across multiple Routes, matching precedence MUST be determined in order of the following criteria, continuing on ties:
>
> * The oldest Route based on creation timestamp.
> * The Route appearing first in alphabetical order by "{namespace}/{name}".
>
> If ties still exist within an HTTPRoute, matching precedence MUST be granted to the FIRST matching rule (in list order) with a match meeting the above criteria.
>
> When no rules matching a request have been successfully attached to the parent a request is coming from, a HTTP 404 status code MUST be returned.

**Hostname precedence between HTTPRoutes** [HR#L104-L120]:

> In the event that multiple HTTPRoutes specify intersecting hostnames (e.g. overlapping wildcard matching and exact matching hostnames), precedence must be given to rules from the HTTPRoute with the largest number of:
>
> * Characters in a matching non-wildcard hostname.
> * Characters in a matching hostname.
>
> When multiple HTTPRoutes attach to the same Listener and yield identical Listener/Route intersected hostnames, implementations SHOULD evaluate precedence using the original hostnames configured on the Route, not the calculated Listener/Route hostname intersection.
>
> Resolving Route precedence using original Route hostname specificity is an Extended feature. Implementations that support this behavior SHOULD claim support for the `GatewayRouteHostnameIntersectionPrecedence` feature. …

The `GatewayRouteHostnameIntersectionPrecedence` feature was added in v1.7.0 and is "expected to move to Core conformance soon" [REL-1.7.0][FEAT].

**Path semantics that drive precedence** [HR#L524-L549]:

> [Exact] Matches the URL path exactly and with case sensitivity. This means that an exact path match on `/abc` will only match requests to `/abc`, NOT `/abc/`, `/Abc`, or `/abcd`.
>
> [PathPrefix] Matches based on a URL path prefix split by `/`. Matching is case-sensitive and done on a path element by element basis. … the paths `/abc`, `/abc/`, and `/abc/def` would all match the prefix `/abc`, but the path `/abcd` would not.
>
> [RegularExpression] Matches if the URL path matches the given regular expression with case sensitivity. Since `"RegularExpression"` has implementation-specific conformance, implementations can support POSIX, PCRE, RE2 or any other regular expression dialect.

**Wildcard hostnames** [HR#L89-L91]: "a match for `*.example.com` would match both `test.example.com`, and `foo.test.example.com`, but not `example.com`."

**Listener selection** [GW#L146-L166]:

> When the Listeners are distinct based only on Hostname, inbound request hostnames MUST match from the most specific to least specific Hostname values to choose the correct Listener and its associated set of Routes. Exact matches MUST be processed before wildcard matches, and wildcard matches MUST be processed before fallback (empty Hostname value) matches. … if there are multiple wildcard entries, more specific wildcard entries must be processed before less specific wildcard entries. … the higher the number of dots in the hostname to the right of the wildcard character, the higher the precedence.

**Across Routes on a Listener** [GW#L461-L471]:

> Although a client request may match multiple route rules, only one rule may ultimately receive the request. Matching precedence MUST be determined in order of the following criteria:
>
> * The most specific match as defined by the Route type.
> * The oldest Route based on creation timestamp. …
> * If everything else is equivalent, the Route appearing first in alphabetical order (namespace/name) should be given precedence. For example, foo/bar is given precedence over foo/baz.

**Mixed HTTPRoute and GRPCRoute** [GR#L144-L156]:

> If a Route (A) of type HTTPRoute or GRPCRoute is attached to a Listener and that listener already has another Route (B) of the other type attached and the intersection of the hostnames of A and B is non-empty, then the implementation MAY reject one of the two routes. An implementation that does so MUST accept exactly one of them, determined by the following criteria, in order: the oldest Route based on creation timestamp; the Route appearing first in alphabetical order by "{namespace}/{name}".

**Default rule when the field-level docs give none** [DOC-APIDESIGN]:

> Prefer not to break things that are working. Drop as little traffic as possible. Provide a consistent experience when conflicts occur. Make it clear which path has been chosen when a conflict has been identified … More specific matches should be given precedence over less specific ones. The resource with the oldest creation timestamp wins. If everything else is equivalent (including creation timestamp), precedences should be given to the resource appearing first in alphabetical order (namespace/name).

**Portable regex** is only a memorandum. GEP-4359 defines a POSIX-ERE-based subset and excludes "backreferences in patterns, inline flags such as `(?i)`, hex escapes, lazy quantifiers, and `{,n}` ranges". Its implementation table lists Envoy: RE2 and NGINX: PCRE [GEP-4359]. Envoy's matcher is "Google's RE2 regex engine" [ENVOY-RE2].

### 3.2 What ingress-nginx does (controller-v1.15.1)

- **Ordering by length.** "In NGINX, regular expressions follow a **first match** policy. In order to enable more accurate path matching, ingress-nginx first orders the paths by descending length before writing them to the NGINX template as location blocks" [IN-PATH].
  - In code, locations are stable-sorted by path in reverse lexical order and then by **string length, descending** [IN-CTRL#L995-L1003].
- **Regex is case-insensitive and host-wide.**
  - "The ingress controller supports **case insensitive** regular expressions in the `spec.rules.http.paths.path` field" [IN-PATH].
  - "If the `use-regex` OR `rewrite-target` annotation is used on any Ingress for a given host, then the case insensitive regular expression location modifier will be enforced on ALL paths for a given host regardless of what Ingress they are defined on" [IN-PATH].
  - In code, `enforceRegexModifier` returns true if any location needs a rewrite or regex. `buildLocation` then emits `~* "^<path>"` for every location on the host [IN-TPL#L506-L539][IN-NGXTPL#L987-L989].
- **Length beats specificity in regex mode.** Example from the docs: with `/foo/bar/bar` (Prefix) and `/foo/bar/[A-Z0-9]{3}` (ImplementationSpecific, `use-regex`), "A request to `test.com/foo/bar/bar` would match the `^/foo/bar/[A-Z0-9]{3}` location block instead of the longest EXACT matching path" [IN-PATH].
- **Non-regex path types.**
  - `Exact` renders as `location = "/p"`.
  - `Prefix` (without regex or rewrite) is normalised to `"/p/"` and gets an extra exact `= /p` location, which gives element-wise prefix matching.
  - `ImplementationSpecific` without regex renders as plain `"/p"` [IN-TPL#L523-L539][IN-LOC].
  - NGINX resolves prefix locations by "longest matching prefix", so `/p` also matches `/pq…`. With regex locations, "the search of regular expressions terminates on the first match" [NGINX-LOC].
- **Conflicts across Ingresses.** Ingresses are sorted by `creationTimestamp`, oldest first. On identical timestamps they are sorted by `namespace/name` with `return in > jn`, which is **descending** order [IN-STORE#L1102-L1116].
  - For the same path and the same `pathType`, the first location wins. Later ones are skipped with "Location … already configured for server …" [IN-CTRL#L815-L835].
- **Wildcard hosts.** "The wildcard character '\*' must appear by itself as the first DNS label and matches only a single label" [IN-PATH].
  - The code enforces this. `buildServerName` turns the host `*.example.com` into the regex server name `"~^(?<subdomain>[\w-]+)\.example\.com$"`, and `[\w-]+` cannot match a dot [IN-TPL#L1686-L1695][IN-NGXTPL#L639].
  - Plain NGINX would behave differently: "An asterisk can match several name parts. The name `*.example.org` matches not only `www.example.org` but `www.sub.example.org` as well" [NGINX-SRV]. So the single-label behaviour comes from ingress-nginx's regex, not from NGINX.
- **Canary precedence.** Header, cookie and weight routing exist only through canary Ingresses, with fixed precedence `canary-by-header -> canary-by-cookie -> canary-weight` [IN-ANN].

### 3.3 Where they differ (risk register for the tool)

| Dimension | Gateway API (v1.7.0) | ingress-nginx (v1.15.1) | Translation risk |
|---|---|---|---|
| Case sensitivity | Exact, PathPrefix and RegularExpression are case-sensitive | Regex locations use `~*` (case-insensitive). Once any path on a host uses regex or rewrite, **all** paths on that host do | Requests such as `/API` that matched before may 404 after migration |
| Regex dialect | Implementation-specific (Envoy-based implementations use RE2) | PCRE (NGINX) | Lookarounds, backreferences and inline flags may be rejected or behave differently. `(?i)` is outside the GEP-4359 portable subset |
| Regex ordering | Implementation-specific | First match in descending **string length** | Same input may route to a different backend |
| Non-regex prefix | Element-wise (`/abc` does not match `/abcd`) | `Prefix` is element-wise; `ImplementationSpecific` is a character prefix (`/abc` matches `/abcd`) | ImplementationSpecific paths can lose matches |
| Specificity inputs | Exact > longest prefix > method > #headers > #query params | Path only. Header and cookie only via canary Ingress | More expressive; canary rules must be rebuilt as matches |
| Hostname specificity | Exact before wildcard; wildcard spans several labels | Wildcard spans **one** label | Wildcard routes may capture more hosts |
| Tie-break across objects | Oldest wins, then **ascending** `{namespace}/{name}`, then first rule | Oldest wins, then **descending** `namespace/name`; later duplicates dropped | Rare (identical timestamps), but the winner can flip |
| Unmatched request | 404 is mandatory | Default backend (typically 404) | Equivalent in practice |

---

## 4. The documented HTTP→HTTPS redirect pattern

The official guide states that "To redirect HTTP traffic to HTTPS, you need to have a Gateway with both HTTP and HTTPS listeners." It continues: "You need an HTTPRoute that attaches to the HTTP listener and does the redirect to HTTPS. Here we set `sectionName` to be `http` so it only selects the listener named `http`." And: "You also need an HTTPRoute that attaches to the HTTPS listener that forwards HTTPS traffic to application backends" [DOC-REDIR].

The manifests below are verbatim from the `v1.7.0` examples, without their `#$ Used in` comment lines [EX-REDIR]. On 2026-11-04 they were re-checked against the same files on `main` (commit `15a4752`, 2026-11-02) and against the live guide; all three are identical. The `v1.7.0` tag copies were not re-read:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: redirect-gateway
spec:
  gatewayClassName: foo-lb
  listeners:
  - name: http
    protocol: HTTP
    port: 80
  - name: https
    protocol: HTTPS
    port: 443
    tls:
      mode: Terminate
      certificateRefs:
      - name: redirect-example
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: http-filter-redirect
spec:
  parentRefs:
  - name: redirect-gateway
    sectionName: http
  hostnames:
  - redirect.example
  rules:
  - filters:
    - type: RequestRedirect
      requestRedirect:
        scheme: https
        statusCode: 301
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: https-route
  labels:
    gateway: redirect-gateway
spec:
  parentRefs:
  - name: redirect-gateway
    sectionName: https
  hostnames:
  - redirect.example
  rules:
  - backendRefs:
    - name: example-svc
      port: 80
```

### Facts the tool must apply to this pattern

- **Support levels.**
  - The `RequestRedirect` filter is Core.
  - Its `scheme` field is **Extended** (`HTTPRouteSchemeRedirect`).
  - `statusCode` defaults to **302**. "statusCode 301 and 302 are Core; all others are Extended" [HR#L1234-L1251][HR#L1300-L1321][FEAT].
  - The guide recommends 301 "for permanent redirects like HTTP to HTTPS upgrades" and labels 307/308 as `HTTPRoute307RedirectStatusCode` / `HTTPRoute308RedirectStatusCode` Extended features [DOC-REDIR].
- **CRD version gate.** Standard CRDs before v1.5.0 accept only `statusCode` 301 or 302 [HIST-1.4.0][HIST-1.5.0].
- **Port.** "If redirect scheme is not-empty, the redirect port MUST be the well-known port associated with the redirect scheme … 'https' to port 443." Implementations "SHOULD NOT add the port number in the 'Location' header" for https on 443 [HR#L1271-L1291].
- **Rule shape.** A rule with `RequestRedirect` cannot also have `backendRefs` (CEL) [HR#L150].
- **sectionName is load-bearing.** The redirect route attaches with `sectionName: http`, and the serving route uses `sectionName: https`.
  - A route with no `sectionName` attaches to every listener that accepts it [SH#L106-L113].
  - Copying an Ingress into a single HTTPRoute without `sectionName` would therefore serve plain HTTP instead of redirecting it.
- **ingress-nginx defaults, which differ.**
  - "By default the controller redirects (308) to HTTPS if TLS is enabled for that ingress" [IN-ANN].
  - The redirect code comes from `http-redirect-code`, default **308** [IN-CM][IN-CFG#L658-L661][IN-CFG#L800][IN-LUA#L157-L173].
  - ingress-nginx's own `configmap.md` says "(301)" under `ssl-redirect`. The source and `annotations.md` say 308; trust the source.
  - **HSTS is on by default**: `hsts: true`, `max-age=31536000`, `includeSubDomains` on HTTPS responses [IN-CFG#L48][IN-CFG#L801-L804][IN-LUA#L179-L184].
  - Gateway API has no automatic redirect and no HSTS field. Reproducing HSTS needs a `ResponseHeaderModifier` (Extended) setting `Strict-Transport-Security` on the HTTPS route, or an implementation policy [HR#L896-L902].
  - Reproducing ingress-nginx exactly (308) requires `HTTPRoute308RedirectStatusCode` support and v1.5.0+ CRDs. Otherwise the migration changes behaviour to 301, which is not method-preserving per the guide [DOC-REDIR].

---

## 5. Other facts useful for the tool

- **Feature discovery.** `GatewayClass.status.supportedFeatures` ("MUST be sorted in ascending alphabetical order by the Name key", ≤64) is the in-cluster way to learn what an implementation claims [GC#L305-L311].
  - ExternalAuth and session persistence have **no** feature names in `pkg/features` at v1.7.0, so they cannot be discovered this way [FEAT].
  - The infrastructure feature string changed in v1.7.0, from `GatewayInfrastructurePropagation` (v1.2.0–v1.6.x) to `GatewayInfrastructure`, with no release-note mention. A checker should accept both [FEAT][HIST-FEAT-1.6.0].
    - Real reports agree. A conformance report run against v1.7.0 lists `GatewayInfrastructure` under `supportedFeatures`. Reports run against v1.6.x list `GatewayInfrastructurePropagation` [CONF-1.7-AGW].
- **Upstream guidance for ingress-nginx users.** "You can run a Gateway API controller alongside your existing Ingress-NGINX controller. They will each get a different external IP address", and ingress2gateway is recommended as the starting point [DOC-MIG-NGINX].
  - That page is stale: it still describes TLSRoute, ListenerSet and CORS as upcoming for a "February" release, and they shipped in v1.5.0.
  - ingress2gateway's latest release is **v1.2.0 (2026-07-07)** [I2G-REL].
- **ingress-nginx status.** The GitHub repository reports `archived: true`. The final controller release is **controller-v1.15.1, 2026-03-19** [IN-REPO-API][IN-REL].

---

## 6. Not covered here (needs target-specific research)

- **Which Gateway API bundle version and channel each target installs or supports**: `appRoutingGateway`, `agc`, `istio`. The 303/307/308 codes, `ListenerSet`, `CORS` and `retry` all depend on CRDs ≥ v1.5.0 or v1.7.0.
- **Whether a target's managed CRDs coexist with the v1.7.0 `safe-upgrades` admission policy**, which denies installing CRDs older than v1.7.0 [VAP].
- **Each target's `supportedFeatures`**: Extended items such as `HTTPRouteSchemeRedirect`, `HTTPRoute308RedirectStatusCode`, `HTTPRouteCORS`, `HTTPRouteRetryCodes`, `GatewayFrontendClientCertificateValidation` and `ListenerSet`.
- **Each target's regex dialect** and the case-sensitivity handling of `RegularExpression`.
- **`agcIngress`** uses the Ingress API with `alb.networking.azure.io` annotations, so the Gateway API tables above do not apply to it directly.

---

## Sources

All accessed 2026-11-04. GitHub `blob/v1.7.0` links are immutable tag permalinks.

### Gateway API releases and changelog

- [REL-API] Releases API (`published_at` timestamps): https://api.github.com/repos/kubernetes-sigs/gateway-api/releases?per_page=60
- [REL-LATEST] Release currently marked Latest (returned `v1.7.0`, re-checked 2026-11-04): https://api.github.com/repos/kubernetes-sigs/gateway-api/releases/latest
- [REL-1.7.0] https://github.com/kubernetes-sigs/gateway-api/releases/tag/v1.7.0
- [REL-1.7.0-rc.3] https://github.com/kubernetes-sigs/gateway-api/releases/tag/v1.7.0-rc.3
- [REL-1.6.3] https://github.com/kubernetes-sigs/gateway-api/releases/tag/v1.6.3
- [REL-1.6.2] https://github.com/kubernetes-sigs/gateway-api/releases/tag/v1.6.2
- [REL-1.6.0] https://github.com/kubernetes-sigs/gateway-api/releases/tag/v1.6.0
- [REL-1.6.0-rc.2] https://github.com/kubernetes-sigs/gateway-api/releases/tag/v1.6.0-rc.2
- [CL-1.6] https://github.com/kubernetes-sigs/gateway-api/blob/main/CHANGELOG/1.6-CHANGELOG.md
- [PR-4985] https://github.com/kubernetes-sigs/gateway-api/pull/4985
- [REL-1.5.0] https://github.com/kubernetes-sigs/gateway-api/releases/tag/v1.5.0
- [REL-1.5.1] https://github.com/kubernetes-sigs/gateway-api/releases/tag/v1.5.1
- [REL-1.5.0-rc.1] https://github.com/kubernetes-sigs/gateway-api/releases/tag/v1.5.0-rc.1
- [REL-1.4.1] https://github.com/kubernetes-sigs/gateway-api/releases/tag/v1.4.1
- [REL-1.4.0] https://github.com/kubernetes-sigs/gateway-api/releases/tag/v1.4.0
- [REL-1.3.0] https://github.com/kubernetes-sigs/gateway-api/releases/tag/v1.3.0
- [REL-1.2.0] https://github.com/kubernetes-sigs/gateway-api/releases/tag/v1.2.0
- [REL-1.1.0] https://github.com/kubernetes-sigs/gateway-api/releases/tag/v1.1.0
- [REL-1.0.0] https://github.com/kubernetes-sigs/gateway-api/releases/tag/v1.0.0
- [REL-0.7.0] https://github.com/kubernetes-sigs/gateway-api/releases/tag/v0.7.0
- [REL-0.6.0] https://github.com/kubernetes-sigs/gateway-api/releases/tag/v0.6.0
- [REL-0.5.0] https://github.com/kubernetes-sigs/gateway-api/releases/tag/v0.5.0
- [REL-0.4.0] https://github.com/kubernetes-sigs/gateway-api/releases/tag/v0.4.0
- [REL-M2512] https://github.com/kubernetes-sigs/gateway-api/releases/tag/monthly-2025.12

### Gateway API source at v1.7.0

Line anchors such as `#L192-L217` refer to these files.

- [HR] https://github.com/kubernetes-sigs/gateway-api/blob/v1.7.0/apis/v1/httproute_types.go
- [GW] https://github.com/kubernetes-sigs/gateway-api/blob/v1.7.0/apis/v1/gateway_types.go
- [SH] https://github.com/kubernetes-sigs/gateway-api/blob/v1.7.0/apis/v1/shared_types.go
- [GR] https://github.com/kubernetes-sigs/gateway-api/blob/v1.7.0/apis/v1/grpcroute_types.go
- [TLSR] https://github.com/kubernetes-sigs/gateway-api/blob/v1.7.0/apis/v1/tlsroute_types.go
- [TCPR] https://github.com/kubernetes-sigs/gateway-api/blob/v1.7.0/apis/v1/tcproute_types.go
- [UDPR] https://github.com/kubernetes-sigs/gateway-api/blob/v1.7.0/apis/v1/udproute_types.go
- [BTLS] https://github.com/kubernetes-sigs/gateway-api/blob/v1.7.0/apis/v1/backendtlspolicy_types.go
- [LS] https://github.com/kubernetes-sigs/gateway-api/blob/v1.7.0/apis/v1/listenerset_types.go
- [GC] https://github.com/kubernetes-sigs/gateway-api/blob/v1.7.0/apis/v1/gatewayclass_types.go
- [RG] https://github.com/kubernetes-sigs/gateway-api/blob/v1.7.0/apis/v1/referencegrant_types.go
- [RGB] https://github.com/kubernetes-sigs/gateway-api/blob/v1.7.0/apis/v1beta1/referencegrant_types.go
- [XB] https://github.com/kubernetes-sigs/gateway-api/blob/v1.7.0/apisx/v1alpha1/xbackend_types.go
- [XBTP] https://github.com/kubernetes-sigs/gateway-api/blob/v1.7.0/apisx/v1alpha1/xbackendtrafficpolicy_types.go
- [FEAT] https://github.com/kubernetes-sigs/gateway-api/tree/v1.7.0/pkg/features (`httproute.go`, `gateway.go`, `grpcroute.go`, `tlsroute.go`, `backendtlspolicy.go`)
- [CRD-STD] https://github.com/kubernetes-sigs/gateway-api/tree/v1.7.0/config/crd/standard
- [CRD-EXP] https://github.com/kubernetes-sigs/gateway-api/tree/v1.7.0/config/crd/experimental
- [VAP] https://github.com/kubernetes-sigs/gateway-api/blob/v1.7.0/config/crd/standard/gateway.networking.k8s.io_vap_safeupgrades.yaml
- [EX-REDIR] https://github.com/kubernetes-sigs/gateway-api/tree/v1.7.0/examples/standard/http-redirect-rewrite (`gateway-redirect-http-https.yaml`, `httproute-redirect-http.yaml`, `httproute-redirect-https.yaml`)

### Historical source used to date graduations

- [HIST-0.5.0] https://github.com/kubernetes-sigs/gateway-api/blob/v0.5.0/apis/v1beta1/httproute_types.go
- [HIST-GW-0.5.0] https://github.com/kubernetes-sigs/gateway-api/blob/v0.5.0/apis/v1beta1/gateway_types.go
- [HIST-0.8.0] https://github.com/kubernetes-sigs/gateway-api/blob/v0.8.0/apis/v1beta1/httproute_types.go
- [HIST-1.2.0] https://github.com/kubernetes-sigs/gateway-api/blob/v1.2.0/apis/v1/httproute_types.go
- [HIST-1.4.0] https://github.com/kubernetes-sigs/gateway-api/blob/v1.4.0/apis/v1/httproute_types.go
- [HIST-1.5.0] https://github.com/kubernetes-sigs/gateway-api/blob/v1.5.0/apis/v1/httproute_types.go
- [HIST-GW-1.1.0..1.5.0] https://github.com/kubernetes-sigs/gateway-api/blob/v1.1.0/apis/v1/gateway_types.go, then the same path at `v1.2.0`, `v1.3.0`, `v1.4.0` and `v1.5.0`
- [HIST-BTLS-1.4.0] https://github.com/kubernetes-sigs/gateway-api/blob/v1.4.0/apis/v1/backendtlspolicy_types.go
- [HIST-BTLS-1.4.1] https://github.com/kubernetes-sigs/gateway-api/blob/v1.4.1/apis/v1/backendtlspolicy_types.go
- [HIST-FEAT-1.4.0] https://github.com/kubernetes-sigs/gateway-api/blob/v1.4.0/pkg/features/gateway.go (identical to the same path at `v1.3.0`)
- [HIST-FEAT-1.5.0] https://github.com/kubernetes-sigs/gateway-api/blob/v1.5.0/pkg/features/gateway.go
- [HIST-FEAT-1.6.0] https://github.com/kubernetes-sigs/gateway-api/blob/v1.6.0/pkg/features/gateway.go

### Gateway API documentation and GEPs

- [DOC-VERS] https://gateway-api.sigs.k8s.io/docs/concepts/versioning/
- [DOC-CONF] https://gateway-api.sigs.k8s.io/docs/conformance/
- [DOC-REDIR] https://gateway-api.sigs.k8s.io/guides/user-guides/http-redirect-rewrite/ (source: https://github.com/kubernetes-sigs/gateway-api/blob/main/site/content/en/guides/user-guides/http-redirect-rewrite.md)
- [DOC-APIDESIGN] https://gateway-api.sigs.k8s.io/guides/api-design/ (the "Conflicts" section)
- [DOC-MIG-NGINX] https://gateway-api.sigs.k8s.io/guides/getting-started/migrating-from-ingress-nginx/
- [GEP-LIST] https://gateway-api.sigs.k8s.io/geps/list/ plus the state pages:
  - https://gateway-api.sigs.k8s.io/geps/by-state/
  - https://gateway-api.sigs.k8s.io/geps/by-state/experimental/
  - https://gateway-api.sigs.k8s.io/geps/by-state/implementable/
  - https://gateway-api.sigs.k8s.io/geps/by-state/provisional/
  - https://gateway-api.sigs.k8s.io/geps/by-state/memorandum/
- [GEP-91] https://gateway-api.sigs.k8s.io/geps/gep-91/
- [GEP-1911] https://gateway-api.sigs.k8s.io/geps/gep-1911/
- [GEP-3965] https://gateway-api.sigs.k8s.io/geps/gep-3965/
- [GEP-4359] https://gateway-api.sigs.k8s.io/geps/gep-4359/
- [GEP-4360] https://gateway-api.sigs.k8s.io/geps/gep-4360/
- [GEP-META] GEP status and title of record: `geps/gep-<N>/metadata.yaml` in https://github.com/kubernetes-sigs/gateway-api/tree/main/geps, read at commit `15a4752` (2026-11-02). All 65 GEPs were listed this way on 2026-11-04.
- [CONF-1.7-AGW] Conformance report run against v1.7.0: https://github.com/kubernetes-sigs/gateway-api/blob/main/conformance/reports/v1.7/agentgateway-agentgateway/v1.7.0-report.yaml. The reports under `conformance/reports/v1.6/` in the same tree were used for comparison.
- Other GEPs cited by number, all `https://gateway-api.sigs.k8s.io/geps/gep-<N>/`, all checked to return HTTP 200: 709, 726, 746, 820, 851, 957, 995, 1016, 1323, 1494, 1619, 1713, 1731, 1742, 1762, 1767, 1867, 1897, 2162, 2257, 2643, 2644, 2645, 2907, 3155, 3171, 3388, 3567, 3793, 4768, 4894, 5075, 5093, 5224

### ingress-nginx at its final tag (controller-v1.15.1)

- [IN-REL] https://github.com/kubernetes/ingress-nginx/releases/tag/controller-v1.15.1
- [IN-REPO-API] https://api.github.com/repos/kubernetes/ingress-nginx (`"archived": true`)
- [IN-PATH] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/docs/user-guide/ingress-path-matching.md
- [IN-ANN] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/docs/user-guide/nginx-configuration/annotations.md
- [IN-CM] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/docs/user-guide/nginx-configuration/configmap.md
- [IN-CFG] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/controller/config/config.go
- [IN-LUA] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/rootfs/etc/nginx/lua/lua_ingress.lua
- [IN-TPL] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/controller/template/template.go
- [IN-NGXTPL] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/rootfs/etc/nginx/template/nginx.tmpl
- [IN-LOC] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/controller/location.go
- [IN-STORE] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/controller/store/store.go
- [IN-CTRL] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/controller/controller.go

### Other

- [NGINX-LOC] https://nginx.org/en/docs/http/ngx_http_core_module.html#location
- [NGINX-SRV] https://nginx.org/en/docs/http/server_names.html (the "Wildcard names" section)
- [HEADERS-MORE] https://github.com/openresty/headers-more-nginx-module (`more_set_headers` acts on output, i.e. response, headers)
- [ENVOY-RE2] https://www.envoyproxy.io/docs/envoy/latest/api-v3/type/matcher/v3/regex.proto
- [I2G-REL] https://github.com/kubernetes-sigs/ingress2gateway/releases/tag/v1.2.0

---

## Open conflicts and gaps (UNVERIFIED items)

1. **Support level of 303/307/308.** The v1.5.0 to v1.6.1 types say `statusCode` is "Support: Core". v1.6.2 (#5173) and v1.7.0 say only 301/302 are Core. This file follows v1.7.0 [HIST-1.5.0][REL-1.6.2][HR#L1309].
2. **v1.4.1 standard YAML.** It was published 2025-12-04 and "mistakenly included changes from PR 3823" (the new redirect codes) until it was fixed in place on 2026-02-10. Clusters that installed v1.4.1 in that window may accept 303/307/308 [REL-1.4.1].
3. **HTTPS listeners without TLS.** v1.6.0-rc.2 announced "⚠️ Breaking Change: TLS must now be configured for listeners using the HTTPS protocol" (#4985, a CEL change) [REL-1.6.0-rc.2][PR-4985][CL-1.6].
   - The v1.6.0 and v1.7.0 Gateway CRDs contain no rule requiring `tls` on HTTPS listeners. Only "tls mode must be Terminate for protocol HTTPS" exists, and it applies when `tls` is present.
   - **Resolved 2026-11-04:** the change was reverted before v1.6.0 GA ("Revert: listeners: tls must be configured for protocol: HTTPS (experimental) (#5021)", listed under v1.6.0 in [CL-1.6]). The v1.6.0 release notes do not mention the requirement [REL-1.6.0].
   - So an HTTPS listener without `tls` is still accepted by the v1.7.0 CRDs (Gateway and ListenerSet). The godoc sentence "This field is required if the Protocol field is 'HTTPS' or 'TLS'" is enforced by CEL only for protocol `TLS` [GW#L442-L455][GW#L246-L248][LS#L113-L115][LS#L174-L185].
4. **GEP-3965 (implementation-specific matches)** is listed as Experimental, but the `extension` field it proposes is not in `HTTPRouteMatch` at v1.7.0 or on `main` (checked 2026-11-04) [GEP-3965][HR#L785-L823].
5. **"Guardrails VAP".** The versioning page describes a VAP that "Prevents setting any experimental fields of a resource unless an annotation is also present". The v1.7.0 CRD directories contain only `vap_safeupgrades.yaml`. On 2026-11-04 the whole repository tree at `main` (commit `15a4752`, 2026-11-02) was checked as well: it has no guardrails VAP file either. So the policy is **not shipped** in v1.7.0 or on `main`. Whether and when it will ship remains **UNVERIFIED** [DOC-VERS][CRD-STD][GEP-META].
6. **Monthly cadence.** The docs promise monthly Experimental releases, but only four exist and none has appeared since May 2026. The documented tag format (`monthly-2025-11`) also differs from the real tags (`monthly-2025.12`) [DOC-VERS][REL-API].
7. **Support levels that contradict themselves in the spec.**
   - The query-parameter `Exact` enum comment says Core, but the field says Extended.
   - `HTTPBackendRef.filters` says Implementation-specific, but the filter types say "Support in HTTPBackendRef: Extended". The conformance guide sides with Extended: "HTTPRoute includes Core support for filters defined within a Rule and Extended support when defined within BackendRef" [DOC-CONF].
   - The GRPCRoute `RequestHeaderModifier` type says Core, but `pkg/features` lists `GRPCRouteRequestHeaderModifier` as Extended.
   - The TLSRoute comment names the feature `TLSRouteTermination`, but `pkg/features` uses `TLSRouteModeTerminate` [HR][GR][TLSR][FEAT].
   - The v1.7.0 release notes call the mixed-mode feature `TLSRouteMixedMode`, but `pkg/features` uses `TLSRouteModeMixed` [REL-1.7.0-rc.3][FEAT].
   - `pkg/features/tcproute.go` heads its section "TCPRoute Conformance (Core)", yet puts `TCPRoute` in `TCPRouteExtendedFeatures` [FEAT].
8. **GEP-91 page vs shipped API.** The page's YAML and field names (`spec.tls.default.frontendValidation…`) do not match the shipped API (`spec.tls.frontend.default.validation…`). This file follows the v1.7.0 types and CRD [GEP-91][GW#L738-L945].
9. **ingress-nginx docs vs source.** `configmap.md` says `ssl-redirect` redirects with 301. The source (`http-redirect-code` default 308) and `annotations.md` say 308 [IN-CM][IN-CFG][IN-LUA][IN-ANN].
10. **GEP-3793 (Default Gateways).** The GEP pages list it as Implementable, while its fields have shipped in the Experimental channel since v1.4.0 [REL-1.4.0][GEP-LIST].
11. **Stale migration guide.** The upstream "Migrating from Ingress-NGINX" page still says the next release "currently target[s] February" [DOC-MIG-NGINX].
12. **Next release.** Gateway API's next minor (v1.8) date is not announced; only the "4-months cadence" target is documented [DOC-VERS].
13. **Advertising non-feature capabilities.** It is not established how implementations advertise ExternalAuth or session persistence support, given that `pkg/features` defines no names for them at v1.7.0 [FEAT].
14. **TLSRoute `v1alpha2` removal.** The v1.5.0 notes announced its removal from the Experimental channel "in 1.6". The v1.7.0 Experimental CRD still serves it (deprecated), alongside `v1alpha3`. When it will actually be removed is **UNVERIFIED** [REL-1.5.0][CRD-EXP].

---

## Verification log (2026-11-04)

A skeptical fact-check of this file, done on 2026-11-04.

### Method

- **Local primary copies first.** All of these were downloaded on 2026-11-04:
  - the Gateway API v1.7.0 Go types and CRDs (every CRD carries `bundle-version: v1.7.0`);
  - the historical types from v0.5.0 to v1.6.2;
  - the standard install YAML for v1.2.1 to v1.6.1;
  - `pkg/features` at v1.2.0 to v1.7.0;
  - the release bodies and the 1.6 and 1.7 changelogs;
  - the versioning, conformance, redirect, API-design and migration doc pages;
  - the ingress-nginx `controller-v1.15.1` source tree.
- **Online fetches: 9 of the 15 allowed.**
  - Three batched `git` blob fetches from `github.com/kubernetes-sigs/gateway-api` at `main` `15a4752` (2026-11-02):
    - the GEP `metadata.yaml` files for all 65 GEPs;
    - the full text of the GEPs whose content this file relies on: 91, 957, 1911, 3567, 3965 and 4359;
    - the redirect examples and the 1.3 to 1.5 changelogs.
  - Six web fetches:
    - the GitHub releases API, both the list and `latest`;
    - NGINX `location`;
    - NGINX `server_names`;
    - Envoy `regex.proto`;
    - the headers-more README.
- **Claims checked: about 450.** Each counts as one claim:
  - a table cell that carries a date, version, channel, support level, limit or feature name;
  - a quoted statement;
  - a bullet that makes a factual claim.

  Section 0 restates later facts and is counted once. The section 2.10 quick map was checked in full on the Gateway API side. On the ingress-nginx side it was sampled: 9 of 25 rows, covering annotation names, `custom-headers`, `x-forwarded-prefix`, `canary-by-header-pattern`, `mirror-target` and the default redirect code.
- **Result.** Every release date matched the `published_at` value (UTC) from the API. Apart from corrections 2 and 8 below, every channel, support level, `Std since` / `Exp since` version and limit in sections 2.1 to 2.8 matched the v1.7.0 types and CRDs and the historical tags. All quoted spec text in sections 3 and 4 matched. All GEP states quoted in the file match `metadata.yaml`.

### Corrections made in place

| # | Where | Old | New | Source |
|---|---|---|---|---|
| 1 | §1.1, v1.7.0 row | "the `TLSRouteMixedMode` feature" | "the `TLSRouteModeMixed` conformance feature". The release notes spell it `TLSRouteMixedMode`. A `supportedFeatures` checker must use `TLSRouteModeMixed` | https://github.com/kubernetes-sigs/gateway-api/blob/v1.7.0/pkg/features/tlsroute.go |
| 2 | §2.6, misdirected-request row | Version column: "v1.3.0 (GEP-3567)", next to the feature name | Spec text since v1.3.0. The feature name `GatewayHTTPSListenerDetectMisdirectedRequests` exists only **from v1.5.0** (absent at v1.3.0 and v1.4.0). Its conformance test has been limited to HTTP/2 since v1.5.1 (#4665) | https://github.com/kubernetes-sigs/gateway-api/blob/v1.4.0/pkg/features/gateway.go, https://github.com/kubernetes-sigs/gateway-api/blob/v1.5.0/pkg/features/gateway.go, https://github.com/kubernetes-sigs/gateway-api/releases/tag/v1.5.1 |
| 3 | Open conflict 3 | "How this is enforced remains **UNVERIFIED**" | **Resolved**: the HTTPS-listener `tls` requirement (#4788, #4985) was reverted before v1.6.0 GA (#5021). The v1.7.0 CRDs accept an HTTPS listener without `tls`; CEL forces `tls` only for protocol `TLS` | https://github.com/kubernetes-sigs/gateway-api/blob/main/CHANGELOG/1.6-CHANGELOG.md, https://github.com/kubernetes-sigs/gateway-api/blob/v1.7.0/apis/v1/gateway_types.go#L246-L248 |
| 4 | §1.1, v1.6.0 row | No mention of the HTTPS/TLS rule (while rc.2 called it a breaking change) | Adds "was reverted before GA (#5021)" | https://github.com/kubernetes-sigs/gateway-api/blob/main/CHANGELOG/1.6-CHANGELOG.md |
| 5 | §1.1, v1.4.1 row | "BackendTLSPolicy limited to one `targetRef`" | The spec says implementations "SHOULD NOT support more than one targetRef". The CRD still accepts up to 16, so this is guidance, not validation | https://github.com/kubernetes-sigs/gateway-api/blob/v1.4.1/apis/v1/backendtlspolicy_types.go, https://github.com/kubernetes-sigs/gateway-api/blob/v1.7.0/apis/v1/backendtlspolicy_types.go#L88-L120 |
| 6 | §1.1, v1.6.3 row | "Conformance only" | "Conformance-test changes and a Go toolchain build fix; no API change" | https://github.com/kubernetes-sigs/gateway-api/releases/tag/v1.6.3 |
| 7 | §2.10, `x-forwarded-prefix` row | "a static value sent to the upstream with `proxy_set_header`", mapped unconditionally | The header is emitted **only inside the `rewrite-target` branch**, so translate it only when `rewrite-target` is also set | https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/controller/template/template.go#L775-L790 |
| 8 | §2.4, `XBackend.spec.protocol` row | Anchor `[XB#L250-L290]` | `[XB#L250-L296]`, because the `WSS` constant sits at L294–L295 | https://github.com/kubernetes-sigs/gateway-api/blob/v1.7.0/apisx/v1alpha1/xbackend_types.go |
| 9 | Open conflict 5 (Guardrails VAP) | "It is probably unreleased (**UNVERIFIED**)" | Not shipped in v1.7.0 and not present anywhere in the `main` tree at `15a4752`. Only whether and when it will ship remains **UNVERIFIED** | https://github.com/kubernetes-sigs/gateway-api/tree/main/config/crd |
| 10 | §1.3 note, and new open conflict 14 | Silent | The v1.5.0 notes said TLSRoute `v1alpha2` would leave the Experimental channel "in 1.6". The v1.7.0 Experimental CRD still serves `v1alpha2` and `v1alpha3` | https://github.com/kubernetes-sigs/gateway-api/releases/tag/v1.5.0, https://github.com/kubernetes-sigs/gateway-api/tree/v1.7.0/config/crd/experimental |

### Evidence added without changing a claim

- **§3.2 wildcard hosts.** The single-label rule is enforced in code: `buildServerName` emits `~^(?<subdomain>[\w-]+)\.<domain>$`. Plain NGINX wildcards span several labels, which confirms the risk-register row. Sources: https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/controller/template/template.go#L1686-L1695 and https://nginx.org/en/docs/http/server_names.html
- **§5, the `GatewayInfrastructure` rename.** The v1.7.0 conformance report of an implementation lists `GatewayInfrastructure`; v1.6.x reports list `GatewayInfrastructurePropagation`. Source: https://github.com/kubernetes-sigs/gateway-api/blob/main/conformance/reports/v1.7/agentgateway-agentgateway/v1.7.0-report.yaml
- **§4 manifests.** These are identical on `main` at `15a4752` and in the live guide. Source: https://github.com/kubernetes-sigs/gateway-api/tree/main/examples/standard/http-redirect-rewrite
- **Open conflict 7.** The conformance guide states that BackendRef-level filters are Extended. Two more naming inconsistencies were added: `TLSRouteMixedMode` vs `TLSRouteModeMixed`, and the TCPRoute feature-set header. Sources: https://gateway-api.sigs.k8s.io/docs/conformance/ and https://github.com/kubernetes-sigs/gateway-api/tree/v1.7.0/pkg/features
- **§2.9, "no GEP" claim.** None of the 65 GEP titles at `main` covers rate limiting, IP allow or deny lists, body size, WAF or HSTS. Source: https://github.com/kubernetes-sigs/gateway-api/tree/main/geps
- **Sources section.** New entries: [REL-LATEST], [REL-1.5.1], [HIST-BTLS-1.4.1], [HIST-FEAT-1.4.0], [HIST-FEAT-1.5.0], [GEP-META], [CONF-1.7-AGW] and [NGINX-SRV].

### Claims left UNVERIFIED

1. Whether and when the documented "Guardrails VAP" will ship (open conflict 5).
2. The date of the next minor release, v1.8. Neither the docs nor the repository announce one (open conflict 12).
3. How implementations advertise ExternalAuth or session-persistence support, since `pkg/features` has no names for them (open conflict 13).
4. When TLSRoute `v1alpha2` will actually be removed from the Experimental channel (open conflict 14).
5. Which support level is authoritative where the spec contradicts itself (open conflict 7). The sources cannot settle this; the file applies the "minimum expressed support level" rule.
6. Whether a given cluster installed the faulty v1.4.1 Standard YAML between 2025-12-04 and 2026-02-10 (open conflict 2). This is cluster-specific: the tool must read the installed `statusCode` enum, not the `bundle-version` alone.
7. *Residual, not a factual doubt:* the three §4 example files were re-read on `main`, not at the `v1.7.0` tag.
