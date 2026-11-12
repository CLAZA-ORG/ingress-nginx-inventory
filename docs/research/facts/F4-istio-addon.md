# F4 - AKS Istio-based service mesh add-on (`istio`): ingress with the Gateway API

- Fact file: F4. Target id: `istio`. As of: 2026-11-04.
- Scope: the AKS Istio-based service mesh add-on (`serviceMeshProfile.mode: Istio`, revisions `asm-1-xx`) used for north-south ingress through the Kubernetes Gateway API (GatewayClass `istio`). The add-on's older managed ingress gateways (`aks-istio-ingressgateway-external` / `-internal`, driven by Istio `Gateway` + `VirtualService`) appear only in section 7, as a fallback.
- Method: Microsoft Learn pages fetched live on 2026-11-04 (their `updated_at` stamps are in section 12), Azure/AKS release notes pulled from the GitHub API (2024-02 to 2026-10-25), the Gateway API standard-channel CRD bundles that AKS installs (downloaded and inspected field by field), Istio's Gateway API conformance reports, and Istio source code on the `release-1.29`, `release-1.30` and `release-1.31` branches.
- Conventions: `[Sx]` points to section 12. **Derived** = a conclusion that combines two or more primary sources, which are named. **UNVERIFIED** = primary sources are silent or conflict. Nothing here is guessed.

---

## 1. Summary

1. **Supported revisions today:** `asm-1-29` (end of life ~Dec 2026, expected), `asm-1-30` (~Jan 2027), `asm-1-31` (~Mar 2027; shipped in AKS release 2026-10-25). `asm-1-28` reached end of life in Aug 2026 [S1][S20]. A new revision arrives roughly every quarter. Minor upgrades are manual canary upgrades and never automatic [S9].
2. **Gateway API ingress is a documented add-on feature.** It uses GatewayClass `istio` and the Istio automated deployment model. It requires the AKS **Managed Gateway API** CRDs and `asm-1-26` or later [S4][S5]. The Learn article lost its preview tags on 2026-05-27 in docs commit `3f2f22f`, whose message body says the feature is generally available [S31]. No release note or blog post announces that GA, and the add-on overview page still says Gateway API is "not yet supported" (stale) [S3].
3. **No sidecars are needed for ingress-only use.** istiod and the gateway pods still run, and canary minor upgrades are still required [S4].
4. **The add-on cannot run at the same time as the app routing Gateway API implementation** (`approuting-istio`, our target `appRoutingGateway`) [S4][S23].
5. **The usable Gateway API surface depends on the AKS minor version, not only on Istio.** Managed Gateway API installs standard-channel CRDs only: bundle v1.2.1 for AKS 1.26-1.33, v1.3.0 for 1.34, v1.4.1 for 1.35, v1.5.1 for 1.36, and v1.6.1 for 1.37+. Experimental CRDs are disallowed [S5][S18].
   - **Derived:** BackendTLSPolicy needs AKS 1.35+.
   - CORS, 303/307/308 redirects, TLSRoute, ListenerSet and Gateway-level client certificate validation need AKS 1.36+.
   - TCPRoute needs AKS 1.37 with `asm-1-31`.
   - HTTPRoute `retry` and `sessionPersistence` are unusable on every AKS version today [S26-S30][S36-S38].
6. **Gaps that need `EnvoyFilter`:** rate limiting, request body size limits, custom error pages and basic auth have no Gateway API or Istio API. They need `EnvoyFilter` (basic auth can also go through an ext_authz provider), which the add-on **allows but does not support** [S3][S22]. Microsoft's app routing page itself sends ingress-nginx users who need body size limits, Lua or rate limiting to this add-on with a gateway-scoped `EnvoyFilter`, outside Azure support [S63]. WAF is not available: `WasmPlugin` is blocked [S3].
7. **Native Istio APIs cover the rest.** IP allow/deny (`AuthorizationPolicy`), external auth (`AuthorizationPolicy` CUSTOM plus `extensionProviders`, which is an "Allowed" MeshConfig field), soft session affinity (`DestinationRule` consistentHash) and backend TLS (`DestinationRule` or BackendTLSPolicy) [S2][S40][S43][S46].

---

## 2. Revisions and support windows

### 2.1 Release calendar
Source: [S1], updated 2026-10-27. Patch levels are from the AKS release notes [S15]-[S20].

| Revision | Upstream Istio | AKS release | AKS end of life | Compatible AKS (standard) | Compatible AKS LTS | Status on 2026-11-04 | Latest AKS patch seen |
| --- | --- | --- | --- | --- | --- | --- | --- |
| asm-1-26 | May 2025 | Jul 2025 | Apr 2026 | 1.29-1.34 | 1.28-1.34 | deprecated (release 2026-04-28) | n/a |
| asm-1-27 | Aug 2025 | Sep 2025 | May 2026 | 1.29-1.35 | 1.29-1.35 | deprecated (release 2026-05-29) | 1.27.9-6 |
| asm-1-28 | Nov 2025 | Jan 2026 | Aug 2026 | 1.30-1.35 | 1.30-1.35 | past end of life per calendar; no deprecation note found in release notes | 1.28.9-2 (2026-07-17) |
| asm-1-29 | Feb 2026 | Apr 2026 | ~Dec 2026 (expected) | 1.31-1.36 | 1.31-1.36 | supported; next to be deprecated | 1.29.8-3 (2026-10-25) |
| asm-1-30 | May 2026 | Jul 2026 | ~Jan 2027 (expected) | 1.32-1.37 | 1.32-1.37 | supported | 1.30.5-3 (2026-10-25) |
| asm-1-31 | Aug 2026 | Oct 2026 | ~Mar 2027 (expected) | 1.32-1.37 | 1.32-1.37 | newest; "now available" in release 2026-10-25, rolling out by region | n/a |

### 2.2 Policy rules
All from [S1] unless marked.

- At least two revisions are supported at any time. Revision `n-2` stays supported until **six weeks after** revision `n` starts rolling out to all regions. "Deprecated" means no new installs; existing meshes keep working but should be upgraded for support and security patches.
- If no revision is given at install, AKS installs the **`n-1`** revision. Use `az aks mesh get-revisions --location <region>` to see what a region offers. It now reports separate `KubernetesOfficial` and `AKSLongTermSupport` compatibility.
- Patches to istiod and the Istio ingress gateways roll out automatically with AKS releases and respect the cluster's `default` planned maintenance window. Sidecars only pick up patches when their pods restart [S9].
  - **UNVERIFIED:** whether Gateway API gateway Deployments (rendered by istiod) roll automatically. The upgrade guide only names "ingress pods".
- The add-on **does not upgrade itself**. On auto-upgrading clusters, including AKS Automatic, an outdated mesh revision "can eventually block the cluster's automatic upgrade" [S3][S9].
- Minor upgrades are **canary** upgrades: `az aks mesh upgrade start --revision asm-1-xx`, then `complete` or `rollback`. You may skip one revision (`n+2`) if both are supported and compatible [S9][S70].
- Before a canary upgrade, copy `istio-shared-configmap-<old>` to `istio-shared-configmap-<new>` in `aks-istio-system` [S2][S9].
- LTS: for `asm-1-25`+ and AKS LTS 1.28+, every supported LTS version has at least one compatible revision. A newer revision may be declared compatible when the older one reaches end of life.

### 2.3 Upstream discrepancy (UNVERIFIED which side is authoritative)
- Upstream Istio 1.29 reached end of life on **Oct 15, 2026**, yet AKS lists `asm-1-29` until ~Dec 2026 and shipped a `1.29.8-3` patch on 2026-10-25 [S1][S15][S53].
- Upstream Istio 1.30 supports Kubernetes **1.32-1.36**; AKS lists `asm-1-30` as compatible with **1.32-1.37** [S1][S53].
- Upstream Istio 1.29 supports Kubernetes **1.31-1.35**; AKS lists `asm-1-29` as compatible with **1.31-1.36** [S1][S53].
- AKS end-of-life months run 1-2 months behind upstream: Istio 1.28 ended Jul 1, 2026 (AKS: Aug 2026); 1.30 is expected ~Dec 2026 (AKS: ~Jan 2027); 1.31 ~Feb 2027 (AKS: ~Mar 2027). Upstream 1.31 supports Kubernetes 1.32-1.37, matching AKS [S1][S53] (upstream page fetched 2026-11-04).
- AKS states that each revision "follows upstream lifecycle for end of life and patch availability" [S1], so these mismatches are open questions.

---

## 3. Gateway API ingress on the add-on

### 3.1 Status
- The add-on "supports both Istio's own ingress traffic management API and the Kubernetes Gateway API for ingress traffic management". The Learn article covers the **automated deployment** model and allows the manual model [S4].
- Commit "Remove preview tags from istio-gateway-api docs" landed on **2026-05-27**. The January 2026 version was still titled "(preview)" [S31].
- On 2026-04-28 (AKS release v20260428), Managed Gateway API and the app routing Istio implementation became GA [S23][S24].
- The commit that removed the preview tags (`3f2f22fbea677d6dc7e40ac498400373d85e70cc`, 2026-05-27) states in its message body that Istio Gateway API ingress in the AKS Istio add-on is now generally available [S31].
- **UNVERIFIED (formal announcement):** no release note, blog post or Azure update explicitly announces GA of Gateway API ingress *for the Istio add-on*. I searched the Azure/AKS release notes 2024-02 to 2026-10-25 and the AKS blog; [S23] and [S24] cover only the app routing implementation and Managed Gateway API.
- **Conflict:** the add-on overview page (updated 2026-09-17) still says "Gateway API for Istio ingress gateway or managing mesh traffic (GAMMA) is currently not yet supported with Istio add-on" [S3].
  - The dedicated Gateway API page (updated 2026-09-14) contradicts the ingress half of that sentence [S4].
  - GAMMA (Gateway API for mesh traffic) has no AKS documentation; treat it as unsupported.

### 3.2 Prerequisites and enablement
- **Managed Gateway API** must be on: `az aks update -g <rg> -n <cluster> --enable-gateway-api`, or `az aks create ... --enable-gateway-api --enable-azure-service-mesh`. It needs azure-cli 2.86.0+ [S5].
- The add-on must be on **`asm-1-26` or later** [S4][S5]. In practice that means `asm-1-29` or later today (section 2.1).
- For ingress-only use, skip the sidecar-injection steps [S4]. Injection, when wanted, is per namespace with `istio.io/rev=asm-X-Y`. The `istio-injection=enabled` label is ignored by the add-on [S8].
- The add-on can't be enabled with Open Service Mesh or a self-managed Istio. It doesn't support Windows containers, virtual nodes, ambient mode or multi-cluster [S3].

### 3.3 GatewayClass and controller
- `gatewayClassName: istio` [S4][S23].
- **UNVERIFIED:** the AKS `controllerName`. Upstream istiod defaults to `istio.io/gateway-controller` (env `PILOT_GATEWAY_API_CONTROLLER_NAME`), and the default GatewayClass name is `istio` [S50]. The tool should read `GatewayClass.spec.controllerName` from the cluster.
- For contrast: the app routing Gateway API implementation uses GatewayClass `approuting-istio` [S23].

### 3.4 Deployment model
From [S4] unless marked.

**Generated resources.** Each `Gateway` gets its own `Deployment`, `Service` (type LoadBalancer by default), `HorizontalPodAutoscaler` and `PodDisruptionBudget`.
- They are named `<gateway-name>-istio` and live in the Gateway's namespace. Override the name with the `gateway.istio.io/name-override` annotation (under 63 characters).
- AKS defaults are HPA **minReplicas 2, maxReplicas 5** and PDB **minAvailable 1**.
- Upstream Istio does not create an HPA or PDB by default: its template defines them, but they render only when a ConfigMap overlay supplies `horizontalPodAutoscaler` / `podDisruptionBudget`. AKS supplies them through its defaults ConfigMap [S47][S67].

**Customization goes through allow-listed fields only. Other fields are blocked by add-on webhooks.**
- GatewayClass level: the AKS-reconciled ConfigMap `istio-gateway-class-defaults` in `aks-istio-system`, labelled `gateway.istio.io/defaults-for-class: istio`. Only one ConfigMap per GatewayClass is allowed. If you created one yourself before enabling Managed Gateway API, delete it first.
- Gateway level: a ConfigMap referenced from `spec.infrastructure.parametersRef`. Gateway-level settings win over class-level ones.
- Deployment allow list: labels, annotations, `minReadySeconds`, `replicas`, pod labels/annotations, node/pod (anti-)affinity, container `resources`/`resizePolicy`/`stdin`, `nodeSelector`, `nodeName`, `tolerations`, `topologySpreadConstraints`, `terminationGracePeriodSeconds`.
- Service allow list: labels, annotations, `type`, `loadBalancerSourceRanges`, `loadBalancerClass`, `externalTrafficPolicy`, `internalTrafficPolicy`, `healthCheckNodePort`.
- HPA allow list: `behavior`, `metrics`, `minReplicas` (must not be below 2), `maxReplicas`.
- PDB allow list: `minAvailable`, `unhealthyPodEvictionPolicy`.
- Release 2026-10-25 added Service `spec.ports` and the Deployment seccomp profile to the ConfigMap customization [S15]. The Learn allow-list tables don't show these yet.

**Load balancer settings.** Put Azure LB annotations under `spec.infrastructure.annotations`. The doc's example is the internal LB plus subnet annotations.
- Upstream Istio copies infrastructure annotations onto the generated ServiceAccount, Deployment, pod template and Service [S47].
- The add-on adds Azure LB health-probe annotations to the Service for the default `externalTrafficPolicy: Cluster`.

**Security defaults.** Since release 2026-08-07, Gateway API gateway Deployments set `automountServiceAccountToken: false` [S16].

**Scheduling.** Ingress, egress and gateway pods prefer nodes labelled `azureservicemesh/istio.replica.preferred: true` with weight 100, and AKS system nodes with weight 50, from `asm-1-30` on. Before `asm-1-30` the weights are reversed, so gateways prefer the **system pool** [S8][S17].

**Telemetry.** `Telemetry` CRDs are installed with the add-on. Gateway access logs are enabled with a `Telemetry` resource.

**Egress and third-party sidecars.**
- Gateway API **egress** is supported only with the manual deployment model.
- Injecting non-Microsoft sidecars into managed gateway pods gets best-effort support only.

### 3.5 Sidecars
"You can use this setup for ingress without adding sidecars to your applications. The managed Istio control plane and gateway proxies still run." [S4]
- Without sidecars on backends, gateway-to-backend traffic is not mesh mTLS.
- Use `BackendTLSPolicy` or a `DestinationRule` (section 6.7) for TLS to backends.

**Conflict:** the AKS blog comparison table says sidecar injection is "Enabled cluster-wide" for the mesh add-on [S23]. That conflicts with the opt-in, per-namespace label model in [S8] and with ingress-only use in [S4]. The Learn comparison table on the app routing page says "Sidecar injection and Istio CRD support: Supported" for the add-on [S63], so read the blog as "available", not "on".

### 3.6 Relationship with `appRoutingGateway`
- The two can't be enabled at the same time. Disable one, then enable the other in a separate operation [S4][S23].
- Microsoft's positioning: choose the mesh add-on "if you want Gateway API based ingress on a full service mesh" (mTLS, traffic policies, telemetry). Choose app routing "if you just wish to have ingress via the Gateway API without Istio-specific features" [S23].
- App routing upgrades in place. The mesh add-on needs canary upgrades for minor versions and upgrades patches in place [S23][S63].
- On AKS Automatic 1.36+, app routing Gateway API is the default. Disable it to use the Istio add-on [S17].
- **UNVERIFIED:** whether the add-on can coexist with the app routing **NGINX** mode during a migration. No source states either way; only the exclusion with the Gateway API mode is documented.

### 3.7 Upgrades and Gateways
- While two revisions are installed, "the control plane for the higher minor revision takes ownership of the Gateways by default". To pin a Gateway, add an `istio.io/rev` label, and update it before completing or rolling back [S4].
- Classic add-on ingress gateways keep a single LoadBalancer Service, and one IP, across a canary upgrade; pods of both revisions serve traffic [S9].

---

## 4. Which Gateway API features are actually usable

### 4.1 Managed CRD bundles by AKS minor
Mapping from [S5]; the 1.37 bundle was confirmed by release 2026-09-04 [S18]. The other columns come from inspecting the official `standard-install.yaml` assets [S36]-[S38].

| AKS minor | Bundle (standard) | CRDs installed | HTTPRoute fields (standard channel) | Gateway fields |
| --- | --- | --- | --- | --- |
| 1.26-1.33 (LTS) | v1.2.1 | GatewayClass, Gateway, HTTPRoute, GRPCRoute, ReferenceGrant (v1beta1) | `timeouts`; redirect `statusCode` 301, 302; mirror without percentage | `infrastructure`, `addresses`, listener `tls.options` |
| 1.34 | v1.3.0 | same as v1.2.1 | + mirror `percent` / `fraction` | same |
| 1.35 | v1.4.1 | + BackendTLSPolicy (v1 only served) | same as v1.3.0 | same |
| 1.36 | v1.5.1 | + TLSRoute (v1 only served), ListenerSet v1; ReferenceGrant v1 served | + `CORS` filter type; redirect `statusCode` 301, 302, 303, 307, 308 | + `spec.tls.frontend` (client certificate validation), `allowedListeners` |
| 1.37+ | v1.6.1 | + TCPRoute v1, UDPRoute v1 (v1alpha2 not served) | same as v1.5.1 | same as v1.5.1 |

Not present in **any** AKS bundle today:
- HTTPRoute `retry`. It graduated to Standard only in Gateway API **v1.7.0** on 2026-10-29 [S30].
- `sessionPersistence`, which is still experimental [S29][S30].
- The ExternalAuth filter, which is experimental [S28].
- Managed Gateway API refuses experimental CRDs [S5].

### 4.2 What Istio implements, by revision
Sources: [S48][S49][S32]-[S34][S26].

| Revision (Istio) | TLSRoute watched | TCPRoute watched | ListenerSet | BackendTLSPolicy | Conformance evidence |
| --- | --- | --- | --- | --- | --- |
| asm-1-29 (1.29) | v1alpha2 only (alpha API, off unless `PILOT_ENABLE_ALPHA_GATEWAY_API=true`) | v1alpha2 only (alpha) | `XListenerSet` (x-k8s.io) | v1 | none published for 1.29 |
| asm-1-30 (1.30) | v1 (+ v1alpha2) | v1alpha2 only (alpha) | v1 | v1 | 1.30.5 against Gateway API v1.5.1 (experimental channel) |
| asm-1-31 (1.31) | v1 (+ v1alpha2) | v1 (+ v1alpha2) | v1 | v1 | 1.31.0 against Gateway API v1.6.0 (experimental channel) |

**Listener protocol gates.** `PILOT_ENABLE_ALPHA_GATEWAY_API` defaults to `false` in 1.29, 1.30 and 1.31 [S49]. With the default:
- Istio 1.29 rejects `protocol: TLS` and `protocol: TCP` listeners ("supported, but only when PILOT_ENABLE_ALPHA_GATEWAY_API=true is configured") and reports `allowedListeners` as unsupported.
- Istio 1.30 accepts `TLS` listeners but still rejects `TCP` listeners.
- Istio 1.31 accepts both [S48].

**HTTPRoute filters.** Istio converts `RequestHeaderModifier`, `ResponseHeaderModifier`, `RequestRedirect`, `RequestMirror`, `URLRewrite` and `CORS`. Any other filter type, including `ExtensionRef`, is rejected with `unsupported filter type` [S48].

**Regex matches.** Path, header and query regex matches become RE2 regexes [S48]. Envoy requires "the entire path (without the query string)" to match [S58].

**Redirects.** Istio passes `statusCode` straight through (codes 301, 302, 303, 307, 308) [S48].

**Session persistence.** Not implemented. Istio's source carries a TODO saying it would need a StatefulSession filter that Istio doesn't support on DestinationRule [S51].

**Istio 1.31 conformance (Gateway API v1.6.0).**
- GATEWAY-HTTP supported:
  - BackendTLSPolicy, BackendTLSPolicySANValidation, GatewayFrontendClientCertificateValidation (+InsecureFallback), GatewayHTTPListenerIsolation, GatewayInfrastructurePropagation, GatewayPort8080, GatewayStaticAddresses.
  - HTTPRoute303/307/308RedirectStatusCode, BackendProtocolH2C, BackendProtocolWebSocket, BackendRequestHeaderModification, BackendTimeout, CORS, DestinationPortMatching, HostRewrite, MethodMatching, NamedRouteRule, ParentRefPort, PathRedirect, PathRewrite, PortRedirect, QueryParamMatching.
  - RequestMirror, RequestMultipleMirrors, RequestPercentageMirror, RequestTimeout, ResponseHeaderModification, Retry (+BackendTimeout, ConnectionError), SchemeRedirect, ListenerSet.
- Unsupported: GatewayBackendClientCertificate, GatewayHTTPSListenerDetectMisdirectedRequests.
- Also passed: GATEWAY-GRPC, GATEWAY-TCP (TCPRoute) and GATEWAY-TLS (TLSRouteModeMixed, TLSRouteModeTerminate). There is no UDP profile [S32].
- Caveat: these reports use the **experimental** channel. On AKS, only what the standard bundle in 4.1 exposes is usable.

### 4.3 Resulting availability of version-gated features
**Derived** from 4.1 and 4.2.

| Feature | AKS 1.34 | AKS 1.35 | AKS 1.36 | AKS 1.37 | Revision constraint |
| --- | --- | --- | --- | --- | --- |
| Mirror percentage | yes | yes | yes | yes | none |
| BackendTLSPolicy | no (use DestinationRule) | yes | yes | yes | Istio 1.28+ implements v1 [S33]; 1.28 code builds the v1 type and 1.29-1.31 watch v1 [S49][S71] |
| CORS filter | no | no | yes | yes | all supported revisions |
| Redirect 303/307/308 | no | no | yes | yes | conformance-claimed from 1.30.5; 1.29 passes codes through [S48] |
| TLSRoute (passthrough) | no | no | yes with asm-1-30+ | yes with asm-1-30+ | AKS doc: not on asm-1-29 [S4] |
| ListenerSet | no | no | yes with asm-1-30+ | yes with asm-1-30+ | Istio 1.30+ watches v1 |
| Gateway `spec.tls.frontend` | no (use `tls.options`) | no (use `tls.options`) | yes | yes | strict validation is in Istio 1.28+ code; `AllowInsecureFallback` and the conformance claim only from 1.31; see 6.8 |
| TCPRoute | no | no | no | yes with asm-1-31 | Istio 1.31 first to watch TCPRoute v1 |
| HTTPRoute retry | no | no | no | no | standard only from Gateway API v1.7.0 |
| sessionPersistence | no | no | no | no | not implemented by Istio |

AKS LTS clusters on 1.31-1.33 get bundle v1.2.1. They have no mirror percentage and no BackendTLSPolicy.

Only compatible pairs exist: `asm-1-29` is not offered on AKS 1.37, and `asm-1-30` / `asm-1-31` are not offered on AKS 1.31 (LTS) [S1]. So "AKS 1.37" in this table means `asm-1-30` or `asm-1-31`.

---

## 5. Support policy: blocked, allowed, supported

### 5.1 Categories [S1]
- **Blocked:** rejected by add-on admission webhooks.
- **Supported:** covered by Azure support.
- **Allowed:** usable, but "aren't covered by Azure support".

### 5.2 Blocked CRDs and hard limits [S3]
- Blocked custom resources: `ProxyConfig`, `WorkloadEntry`, `WorkloadGroup`, `IstioOperator`, `WasmPlugin`.
- The classic add-on ingress gateways allow Service annotation and `externalTrafficPolicy` customization; "port or protocol configuration is currently not supported" [S3]. Their Deployment also takes the `proxy.istio.io/config` pod annotation, and their HPA can be edited (`minReplicas` not below 2) [S6][S65].
- Since release 2025-03-16, AKS validates Istio custom resources that have no `istio.io/rev` label [S21].
- **UNVERIFIED:** the add-on status of `TrafficExtension` (`extensions.istio.io/v1alpha1`, alpha). Istio 1.30 introduced it; it "supersedes `WasmPlugin` as the recommended extensibility API", runs Lua scripts and Wasm plugins, and can target Gateways with `targetRefs` [S55][S49]. No AKS source mentions it. The add-on does install `extensions.istio.io` CRDs [S63].

### 5.3 `EnvoyFilter`
History from [S15]-[S22]; current state from [S3]:
- 2024-07-16: only Lua EnvoyFilters allowed.
- 2024-08-05: Lua, local rate limit and gzip compression allowed.
- 2025-10-12: "Envoy filters of all types are now allowed in the Istio add-on for AKS. While you can use them to customize traffic handling, issues caused by Envoy filters aren't covered by Microsoft Support."
- Current: allowed, outside the support scope.
- Upstream warns that EnvoyFilter "must be used with care, as incorrect configurations could potentially destabilize the entire mesh", that parts of the API are "deeply tied to the internal implementation in Istio networking subsystem", and that the Envoy configuration should be "carefully monitored across Istio proxy version upgrades" [S42].
- EnvoyFilter can target a Gateway API `Gateway` (same namespace) or `GatewayClass` (root namespace) through `targetRefs`, per the Istio 1.31 reference, or use a `workloadSelector`; at most one of the two can be set [S42].
  - **UNVERIFIED:** which Istio version added `targetRefs` to EnvoyFilter; the reference doesn't say. Gateway pods carry `gateway.networking.k8s.io/gateway-name` (the only gateway-name label since asm-1-24), so a `workloadSelector` on that label works on every supported revision [S47][S21].

### 5.4 MeshConfig through the shared ConfigMap [S2]
- Create `istio-shared-configmap-<asm-revision>` in `aks-istio-system`, with the mesh config under `data.mesh`.
- Never edit the AKS-reconciled default `istio-<asm-revision>`. Where they overlap, the default ConfigMap's settings take precedence.
- MeshConfig fields not listed are **blocked** (example: `configSources`). Unrecognized fields are denied by admission control.

| Field (ingress-relevant) | Class | Notes |
| --- | --- | --- |
| `defaultConfig` (ProxyConfig) | Supported | per-field classes in 5.5 |
| `accessLogFile`, `accessLogFormat`, `accessLogEncoding` | Supported | Telemetry API encouraged |
| `extensionProviders`, `defaultProviders` | Allowed | needed for external auth (6.3) and tracing providers; "extension providers ... are outside the support scope" |
| `enableTracing` | Allowed | |
| `defaultHttpRetryPolicy` | Allowed | mesh-wide retries (6.5) |
| `tlsDefaults`, `meshMTLS` | Allowed | minimum TLS version (6.10) |
| `pathNormalization` | Allowed | |
| `h2UpgradePolicy`, `localityLbSetting`, `connectTimeout`, `tcpKeepalive` | Allowed | also settable in DestinationRule |
| `outboundTrafficPolicy`, `discoverySelectors` | Supported | |
| `defaultTrafficPolicy` | Supported | from asm-1-31 |
| `serviceEntryVisibility`, `zoneAwareLbSetting` | Allowed | from asm-1-31 |
| `ingressService`, `ingressSelector` | Allowed | Kubernetes Ingress support of Istio |

### 5.5 ProxyConfig fields (`meshConfig.defaultConfig`) [S2]
- **Supported:** `drainDuration`, `terminationDrainDuration`, `concurrency`, `holdApplicationUntilProxyStarts`; `connectionSettings` from asm-1-31.
- **Allowed:** `gatewayTopology` (added 2025-04-27 [S21]), `proxyHeaders` (added 2025-08-08 [S22]), `tracing`, `proxyMetadata`, `extraStatTags`, `proxyStatsMatcher`, `privateKeyProvider`, others.
- Unlisted fields are blocked.
- Per-pod `proxy.istio.io/config` annotations override them. This is documented for the classic ingress gateway Deployment, for example `gatewayTopology.numTrustedProxies` [S6].

### 5.6 Telemetry API (v1, asm-1-22+) [S7]
- **Supported:** `accessLogging.match`, `accessLogging.disabled`, `metrics.overrides`.
- **Allowed:** `accessLogging.providers` (the default `envoy` provider is supported), `metrics.providers` (Azure Monitor managed Prometheus is supported), `tracing.*` (all allowed, not supported).
- Anything else is blocked.

### 5.7 Gateway API resources
- The Gateway ConfigMap allow lists are in 3.4.
- With Managed Gateway API, "Experimental channel CRDs are disallowed". AKS support applies only to Managed Gateway API used with a supported add-on [S5].

---

## 6. How to configure common ingress-nginx needs on `istio`

### 6.1 Local rate limiting
No Gateway API or Istio rate-limit API exists. Istio documents rate limiting only through `EnvoyFilter`:
- Local: `envoy.filters.http.local_ratelimit`.
- Global: `envoy.filters.http.ratelimit` plus an external gRPC rate-limit service (Redis-backed in the example) [S41].

On the add-on this is **Allowed, not Supported** (5.3). Skeleton adapted from [S41]; validate before use:

```yaml
apiVersion: networking.istio.io/v1alpha3
kind: EnvoyFilter
metadata: {name: gw-local-ratelimit, namespace: <gateway-ns>}
spec:
  targetRefs:                      # Istio 1.31 reference; older revisions: workloadSelector
  - {group: gateway.networking.k8s.io, kind: Gateway, name: <gateway>}   # labels: {gateway.networking.k8s.io/gateway-name: <gateway>}
  configPatches:
  - applyTo: HTTP_FILTER
    match: {context: GATEWAY, listener: {filterChain: {filter: {name: envoy.filters.network.http_connection_manager}}}}
    patch:
      operation: INSERT_BEFORE
      value:
        name: envoy.filters.http.local_ratelimit
        typed_config:
          "@type": type.googleapis.com/envoy.extensions.filters.http.local_ratelimit.v3.LocalRateLimit
          stat_prefix: http_local_rate_limiter
          token_bucket: {max_tokens: 100, tokens_per_fill: 100, fill_interval: 1s}
          filter_enabled: {runtime_key: local_rate_limit_enabled, default_value: {numerator: 100, denominator: HUNDRED}}
          filter_enforced: {runtime_key: local_rate_limit_enforced, default_value: {numerator: 100, denominator: HUNDRED}}
```

Gateway pods carry the label `gateway.networking.k8s.io/gateway-name: <gateway>` [S47]. Local limits apply **per gateway pod**, and AKS runs at least 2 pods (HPA 2-5). An nginx per-IP `limit-rate` style limit therefore doesn't translate 1:1. Keying by client IP needs descriptors; this needs testing.

### 6.2 IP allow and deny lists, client IP preservation
**L7 option.** Use an `AuthorizationPolicy` attached to the Gateway with `targetRefs` (kind `Gateway`, group `gateway.networking.k8s.io`, same namespace) [S40][S44]. Use `action: ALLOW` for allow lists and `action: DENY` for deny lists. Choose the source field as follows:
- `ipBlocks` uses the packet source IP. It is only meaningful with Service `externalTrafficPolicy: Local` [S44].
- `remoteIpBlocks` uses `X-Forwarded-For` or PROXY protocol. It requires `numTrustedProxies` [S40][S44].

**Client IP via `externalTrafficPolicy: Local`.**
- The field is on the Gateway Service allow list.
- The add-on sets port-80 health-probe annotations for the default `Cluster` policy. When you switch to `Local`, unset `service.beta.kubernetes.io/port_80_health-probe_port`, `..._protocol` and `..._request-path` in the class-level or per-Gateway ConfigMap [S4].
- With `Local`, run gateway pods on several nodes [S44].

**`numTrustedProxies`, mesh-wide.** Set `meshConfig.defaultConfig.gatewayTopology.numTrustedProxies` in the shared ConfigMap. The field is Allowed, not Supported [S2][S45].

**`numTrustedProxies`, per gateway.** Upstream uses the pod annotation `proxy.istio.io/config: '{"gatewayTopology":{"numTrustedProxies":N}}'` [S45]. On the add-on it is documented only for the classic ingress Deployment [S6].
- **Derived:** for Gateway API gateways, set it through the allow-listed Deployment field `spec.template.metadata.annotations`, or through `spec.infrastructure.annotations`, which upstream copies to the pod template [S4][S47].
- **UNVERIFIED** on AKS.

**L4 option.** Use Service `spec.loadBalancerSourceRanges`, which is allow-listed and enforced by Azure NSG rules [S4].
- The classic ingress also documents `service.beta.kubernetes.io/azure-allowed-ip-ranges` and `azure-allowed-service-tags` [S6].

PROXY protocol "should not be used for L7 traffic, or for Istio gateways behind L7 load balancers" [S45].

### 6.3 External authentication (CUSTOM action)
**Step 1: register the provider.** Add it to `extensionProviders` in `istio-shared-configmap-<asm-revision>`. The field is Allowed, not Supported [S2].
- Use `envoyExtAuthzHttp` (fields `service`, `port`, `timeout` default 600s, `failOpen`, `includeRequestHeadersInCheck`, `headersToUpstreamOnAllow`, `headersToDownstreamOnAllow`, `headersToDownstreamOnDeny`) or `envoyExtAuthzGrpc` [S39][S46].

**Step 2: enforce it.** Use an `AuthorizationPolicy` with `action: CUSTOM` and `provider.name: <provider>`. Attach it to the Gateway with `targetRefs`, and scope it with `rules.to.operation` (hosts, paths) [S39][S40].

**Semantics.**
- CUSTOM is evaluated **before** DENY and ALLOW and "cannot bypass" their decisions.
- At most one extension provider is allowed per workload [S40].
- Only Envoy `ext_authz` providers are supported. An authorizer outside the mesh needs a `ServiceEntry` [S39].

**JWT validation without an external service.** Use `RequestAuthentication` with an `AuthorizationPolicy`. These are standard Istio security CRDs and are not on the blocked list [S3].

### 6.4 CORS with HTTPRoute
- Gateway API `CORS` filter (`type: CORS`) on an HTTPRoute rule. Istio converts it to a VirtualService `corsPolicy` [S48].
- The filter exists only in the AKS **1.36+** bundles (v1.5.1 / v1.6.1). On AKS 1.34-1.35 the filter type isn't in the CRD [S27][S37][S38].
- Fallbacks on older clusters: `EnvoyFilter` (Allowed, not Supported), or the classic ingress with VirtualService `corsPolicy` (section 7).

### 6.5 Retries and timeouts
**Istio defaults.**
- "The Envoy timeout for HTTP requests is disabled in Istio by default" [S52].
- Default retry: 2 attempts with `retryOn: connect-failure,refused-stream,unavailable,cancelled,retriable-status-codes`, and no retriable status codes configured, in the 1.29, 1.30 and 1.31 source [S66]. The MeshConfig reference likewise gives 2 attempts for five error conditions [S46]. It can be changed mesh-wide with `meshConfig.defaultHttpRetryPolicy`; `attempts: 0` disables retries globally [S46].

**Timeouts.** `HTTPRoute.rules[].timeouts.request` becomes the route timeout. `timeouts.backendRequest` becomes the per-try timeout when a retry is set, otherwise the route timeout [S48]. Both fields are in every AKS bundle [S36].

**Retries.** `HTTPRoute.rules[].retry` is **not** in any AKS standard bundle [S36]-[S38][S30]. Istio implements it (default 2 attempts when `retry` is set) [S48], but the field can't be stored on AKS today.
- The only lever is the mesh-wide `defaultHttpRetryPolicy`, which is Allowed, not Supported [S2].
- Per-route retry tuning is impossible through the Gateway API on AKS today.

### 6.6 Session affinity
- Gateway API `sessionPersistence` is unavailable: it isn't in the standard CRDs and Istio doesn't implement it [S51].
- Use an Istio `DestinationRule` on the backend Service host with `trafficPolicy.loadBalancer.consistentHash`: `httpCookie` (name, ttl), `httpHeaderName`, `httpQueryParameterName` or `useSourceIp` [S43].
- This is **soft** affinity: "less reliable at maintaining affinity than common 'sticky sessions' implementations" and dependent on a consistent endpoint view [S43].
- Gateways apply DestinationRules to their upstream traffic. Istio itself turns Gateway API backend policies into DestinationRules [S51], and DestinationRule `credentialName` is documented as applying "only at gateways" when there is no `workloadSelector` [S43].

```yaml
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata: {name: app-affinity, namespace: app-ns}
spec:
  host: app.app-ns.svc.cluster.local
  trafficPolicy:
    loadBalancer:
      consistentHash:
        httpCookie: {name: route, ttl: 3600s}
```

### 6.7 Backend TLS
- **BackendTLSPolicy v1** (`targetRefs` to the Service, `validation.caCertificateRefs` or `wellKnownCACertificates`, `hostname`) on AKS **1.35+** bundles [S36]. Istio 1.28 shipped "BackendTLSPolicy v1: Full Gateway API v1.4 support" [S33]. Istio 1.30.5 and 1.31.0 pass BackendTLSPolicy conformance [S32][S34].
- **DestinationRule** `trafficPolicy.tls` on any version, with `mode: SIMPLE` (or `MUTUAL`), `sni` and `subjectAltNames`.
  - `credentialName` must be in "the namespace of the proxy using the certificates", meaning the **gateway's** namespace.
  - Without CA settings, the proxy verifies against OS CA certificates [S43].

### 6.8 Frontend mTLS (client certificate validation)
- **Any AKS version:** the Istio listener option `tls.options: {gateway.istio.io/tls-terminate-mode: MUTUAL}` with `tls.mode: Terminate`. The CA goes in key `ca.crt` of the same Secret [S54]. Istio code handles `MUTUAL`, `OPTIONAL_MUTUAL`, `ISTIO_SIMPLE` and `ISTIO_MUTUAL` [S48].
- **AKS 1.36+:** Gateway API `spec.tls.frontend.default.validation.caCertificateRefs` (Secret or ConfigMap holding `ca.crt`). This is the method in the Istio 1.31 docs [S56]. Istio accepts **one** CA ref only [S48]. Per-port overrides use `spec.tls.frontend.perPort`.
- **Conformance versus code:** Istio 1.28 release notes claim "Support for FrontendTLSValidation (GEP-91)" [S33]. The Istio 1.30.5 conformance report lists `GatewayFrontendClientCertificateValidation` as **unsupported** [S34], and only the 1.31.0 report claims it [S32].
  - Source code: 1.28, 1.29 and 1.30 already turn `spec.tls.frontend` (`default` and `perPort`) `caCertificateRefs` into `MUTUAL`, with one CA ref and a `// TODO: add 'Mode'` note. Only 1.31 handles `mode: AllowInsecureFallback` (mapped to `OPTIONAL_MUTUAL`) [S48].
  - **UNVERIFIED:** why the 1.30.5 report marks the feature unsupported. Prefer `asm-1-31` for the Gateway API-native form, and test strict mode on `asm-1-29`/`asm-1-30`.
- Neither form is shown in AKS docs.

### 6.9 TLS passthrough
- Listener `protocol: TLS` with `tls.mode: Passthrough`, plus a `TLSRoute` [S4].
- AKS: "not supported on ... `asm-1-29`. Support for the `TLSRoute` resource will be available for ... `asm-1-30` and onwards" [S4].
- **Derived:** this also needs AKS **1.36+**, because only the v1.5.1+ bundles contain TLSRoute, and they serve only `v1` [S37][S38]. Istio watches TLSRoute v1 from 1.30 [S49]. Microsoft does not state the AKS-version dependency.

### 6.10 TLS protocol and cipher options
- **Cipher suites:** listener `tls.options: {gateway.istio.io/tls-cipher-suites: "<comma-separated>"}`. The option exists in Istio 1.29+ code, not in 1.26-1.28 [S48].
- **Minimum TLS version:** mesh-wide only, through `meshConfig.tlsDefaults.minProtocolVersion`.
  - The TLSConfig default minimum is TLS 1.2 and the maximum is TLS 1.3 [S46].
  - It applies to the downstream TLS context of `SIMPLE`, `MUTUAL` and `OPTIONAL_MUTUAL` servers, gateway listeners included; per-server settings override it (1.29 source) [S69]. Istio 1.27.6 fixed its mapping [S57].
  - On AKS `tlsDefaults` is Allowed, not Supported [S2].
- **No per-listener min/max version through the Gateway API.** Istio's code says "Not yet implemented: TLS mode, https redirect, max protocol version, SANs, VerifyCertificate" [S48].

### 6.11 TCP routes
- TCPRoute v1 needs AKS **1.37**: Managed Gateway API ships the v1.6.1 bundle "adding the graduated `TCPRoute` and `UDPRoute` resources" [S18].
- It also needs `asm-1-31`. Istio watches TCPRoute v1 only from 1.31; 1.29 and 1.30 watch the alpha `v1alpha2` version, which the v1.6.1 bundle doesn't serve [S38][S49]. In 1.29 and 1.30 a `protocol: TCP` listener is also rejected unless `PILOT_ENABLE_ALPHA_GATEWAY_API=true` [S48]. **Derived;** Microsoft doesn't document TCPRoute for the add-on.
- UDP: "Non-TCP based protocols, such as UDP, are not proxied" [S59]. Istio has no UDP conformance profile [S32].

### 6.12 Certificates
- **Kubernetes Secrets:** listener `certificateRefs` to a `kubernetes.io/tls` Secret [S4]. Cross-namespace references need a ReferenceGrant. Istio accepts up to 2 server certificates per listener [S48].
- **Azure Key Vault:** documented, but indirect. The Key Vault provider for the Secrets Store CSI driver add-on syncs the certificate into a `kubernetes.io/tls` Secret through a `SecretProviderClass` with `secretObjects`. A pod must mount the volume for the Secret to exist. `certificateRefs.name` must equal the synced `secretName` [S4].
- **cert-manager:** self-managed, outside Azure support.
  - cert-manager writes the Secret, or uses the Gateway annotations `cert-manager.io/issuer` / `cluster-issuer`.
  - Gateway support is beta since cert-manager 1.15 and is enabled with the Helm value `config.gatewayAPI.enabled: true`.
  - The HTTP-01 solver is `gatewayHTTPRoute`.
  - It works with standard-channel CRDs. ListenerSet support needs Gateway API v1.5+ (standard channel) plus `config.gatewayAPI.enableListenerSet: true` and the `ListenerSets` feature gate (cert-manager 1.20+) [S60].

### 6.13 Static IP, internal LB, LBs per Gateway, observability
**Static IP.** Prefer the annotations `service.beta.kubernetes.io/azure-pip-name` or `azure-load-balancer-ipv4` (+ `azure-load-balancer-resource-group` when the IP is in another resource group) [S10].
- On Gateway API gateways, put them in `spec.infrastructure.annotations` [S4].
- Upstream Istio also maps `spec.addresses[0]` to the Service's deprecated `loadBalancerIP` [S47]. AKS says `loadBalancerIP` still works but is deprecated and not dual-stack [S10].

**Internal LB.** `service.beta.kubernetes.io/azure-load-balancer-internal: "true"` and, optionally, `...-internal-subnet` under `spec.infrastructure.annotations` [S4].

**Load balancers per Gateway.** Each Gateway is one Deployment (HPA min 2) plus one LoadBalancer Service. "Each new service that you deploy gets a new dedicated frontend IP" on the cluster's Azure Standard LB [S4][S10].
- To consolidate, add listeners or hostnames to one Gateway, or use ListenerSet (AKS 1.36+, asm-1-30+).

**Observability.**
- Access logs: `Telemetry` (`accessLogging.providers: envoy`), created in `aks-istio-system` for mesh-wide scope [S4][S7].
- Metrics: Azure Monitor managed Prometheus (supported). The upstream gateway template adds `prometheus.io/scrape` annotations on port 15020 [S47].
- Tracing: allowed, not supported [S7].

---

## 7. Fallback: the add-on's classic Istio ingress gateways

Setup: `az aks mesh enable-ingress-gateway --ingress-gateway-type external` (or `internal`) creates `aks-istio-ingressgateway-external` / `-internal` in `aks-istio-ingress`. Istio `Gateway` resources select `istio: aks-istio-ingressgateway-external` (or `-internal`) [S6].

**What it adds over the Gateway API on older AKS versions:**
- VirtualService per-route `retries` and `corsPolicy`.
- Server TLS `minProtocolVersion`, `maxProtocolVersion`, `cipherSuites`, `httpsRedirect`.
- `MUTUAL` and `PASSTHROUGH` TLS modes [S6][S46][S61].

**Limits:**
- The documented Services expose ports 80 and 443 (plus status port 15021) [S6], and port/protocol configuration isn't supported [S3].
- It's not the Gateway API target, and it keeps Istio-proprietary objects. This is a stop-gap, not the recommended end state.

---

## 8. Feature matrix (column `istio`)

How to read it:
- **yes:** available on every AKS version in standard support today (1.34-1.37) with asm-1-29/30/31, through the Gateway API or a first-class Istio API. Only compatible pairs count: asm-1-29 runs on AKS 1.34-1.36, asm-1-30 and asm-1-31 on 1.34-1.37 [S1][S11].
- **partial:** limited to some AKS/asm versions, needs Istio-specific workarounds with different semantics, or needs configuration the add-on classes as "Allowed" (not Azure-supported), such as EnvoyFilter.
- **no:** not available.
- **unknown:** sources are silent or conflict.

| Feature | istio |
| --- | --- |
| Path match Exact | yes - HTTPRoute `path.type: Exact` (core; Istio passes all GATEWAY-HTTP core conformance) - <https://github.com/kubernetes-sigs/gateway-api/blob/main/conformance/reports/v1.6/istio-istio/1.31.0-default-report.yaml> |
| Path match PathPrefix | yes - HTTPRoute `path.type: PathPrefix` (core; used in the AKS add-on sample) - <https://learn.microsoft.com/en-us/azure/aks/istio-gateway-api> |
| Path match RegularExpression | yes - `path.type: RegularExpression` (in every AKS bundle) becomes an Envoy RE2 regex that must match the whole path; review nginx regex paths for anchoring and PCRE-only syntax - <https://github.com/istio/istio/blob/release-1.31/pilot/pkg/config/kube/gateway/conversion.go> |
| Header match | yes - `matches[].headers` Exact (core) or RegularExpression (Istio maps it to RE2) - <https://github.com/istio/istio/blob/release-1.31/pilot/pkg/config/kube/gateway/conversion.go> |
| Query param match | yes - `matches[].queryParams` Exact or RegularExpression; HTTPRouteQueryParamMatching in Istio 1.28, 1.30.5 and 1.31 conformance - <https://github.com/kubernetes-sigs/gateway-api/blob/main/conformance/reports/v1.6/istio-istio/1.31.0-default-report.yaml> |
| Method match | yes - `matches[].method`; HTTPRouteMethodMatching supported - <https://github.com/kubernetes-sigs/gateway-api/blob/main/conformance/reports/v1.6/istio-istio/1.31.0-default-report.yaml> |
| RequestHeaderModifier | yes - filter `RequestHeaderModifier` set/add/remove (core) - <https://github.com/kubernetes-sigs/gateway-api/blob/main/conformance/reports/v1.6/istio-istio/1.31.0-default-report.yaml> |
| ResponseHeaderModifier | yes - filter `ResponseHeaderModifier` (HTTPRouteResponseHeaderModification) - <https://github.com/kubernetes-sigs/gateway-api/blob/main/conformance/reports/v1.6/istio-istio/1.31.0-default-report.yaml> |
| RequestRedirect (scheme, hostname, path, port, allowed status codes) | partial - scheme, hostname, path (ReplaceFullPath/ReplacePrefixMatch) and port all work; statusCode 301/302 on every AKS bundle, 303/307/308 only in the AKS 1.36+ bundles (CRD enum); Istio passes the code through - <https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.5.1/standard-install.yaml> |
| HTTP to HTTPS redirect pattern | yes - HTTP listener plus an HTTPRoute with `RequestRedirect` `scheme: https` (301); Istio's own `httpsRedirect` is not implemented for Gateway API listeners - <https://gateway-api.sigs.k8s.io/guides/getting-started/migrating-from-ingress/> |
| URLRewrite hostname | yes - filter `URLRewrite.hostname` (HTTPRouteHostRewrite) - <https://github.com/kubernetes-sigs/gateway-api/blob/main/conformance/reports/v1.6/istio-istio/1.31.0-default-report.yaml> |
| URLRewrite path (ReplaceFullPath, ReplacePrefixMatch) | yes - `URLRewrite.path` ReplaceFullPath and ReplacePrefixMatch (HTTPRoutePathRewrite) - <https://github.com/kubernetes-sigs/gateway-api/blob/main/conformance/reports/v1.6/istio-istio/1.31.0-default-report.yaml> |
| RequestMirror (including percentage) | yes - RequestMirror, multiple mirrors and `percent`/`fraction` mirroring supported; percentage fields exist only in AKS bundles v1.3.0+ (AKS 1.34+), so LTS 1.31-1.33 clusters get 100% mirroring only - <https://github.com/kubernetes-sigs/gateway-api/blob/main/conformance/reports/v1.6/istio-istio/1.31.0-default-report.yaml> |
| Weighted backendRefs (traffic splitting) | yes - `backendRefs[].weight` (core) - <https://github.com/kubernetes-sigs/gateway-api/blob/main/conformance/reports/v1.6/istio-istio/1.31.0-default-report.yaml> |
| Timeouts (request, backendRequest) | yes - `timeouts.request` becomes the route timeout, `timeouts.backendRequest` the per-try timeout (or route timeout when no retry); Istio's default is no timeout - <https://github.com/istio/istio/blob/release-1.31/pilot/pkg/config/kube/gateway/conversion.go> |
| Retries | partial - HTTPRoute `retry` is in no AKS standard bundle (Standard only from Gateway API v1.7.0); Istio's default (2 attempts on connect-failure,refused-stream,unavailable,cancelled,retriable-status-codes, no status codes configured) applies to all routes; mesh-wide tuning via `defaultHttpRetryPolicy` is Allowed, not supported - <https://learn.microsoft.com/en-us/azure/aks/istio-meshconfig> |
| Session persistence or affinity | partial - no Gateway API `sessionPersistence` (experimental, not implemented by Istio); use a DestinationRule `consistentHash` (httpCookie, header, query param, source IP) on the backend host = soft affinity - <https://istio.io/latest/docs/reference/config/networking/destination-rule/> |
| CORS | partial - HTTPRoute `CORS` filter only on AKS 1.36+ (v1.5.1/v1.6.1 bundles; Istio converts it to corsPolicy); on AKS 1.34-1.35 only EnvoyFilter or the classic VirtualService - <https://github.com/kubernetes-sigs/gateway-api/releases/tag/v1.5.0> |
| External authentication | partial - `AuthorizationPolicy` `action: CUSTOM` (targetRefs to the Gateway) plus an `envoyExtAuthzHttp`/`Grpc` provider in `meshConfig.extensionProviders` (Allowed, not supported); one provider per workload - <https://learn.microsoft.com/en-us/azure/aks/istio-meshconfig> |
| Basic authentication | partial - no native API; use an ext_authz provider (CUSTOM) or an EnvoyFilter inserting `envoy.filters.http.basic_auth` (htpasswd SHA only); both outside Azure support - <https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_filters/basic_auth_filter> |
| BackendTLSPolicy or backend HTTPS | yes - BackendTLSPolicy v1 on AKS 1.35+ bundles (Istio 1.28+ implements v1), or DestinationRule `trafficPolicy.tls` (SIMPLE, sni, credentialName in the gateway namespace) on any version - <https://istio.io/latest/news/releases/1.28.x/announcing-1.28/> |
| gRPC (GRPCRoute) | yes - GRPCRoute v1 is in every AKS bundle; Istio passes GATEWAY-GRPC conformance - <https://github.com/kubernetes-sigs/gateway-api/blob/main/conformance/reports/v1.6/istio-istio/1.31.0-default-report.yaml> |
| WebSockets and HTTP upgrade | yes - Envoy proxies HTTP/1.1 upgrades; HTTPRouteBackendProtocolWebSocket supported in the Istio 1.28.0, 1.30.5 and 1.31.0 conformance reports (none published for 1.29) - <https://github.com/kubernetes-sigs/gateway-api/blob/main/conformance/reports/v1.4.0/istio-istio/1.28.0-default-report.yaml> |
| TLS termination with Kubernetes secrets | yes - listener `tls.mode: Terminate` plus `certificateRefs` to a kubernetes.io/tls Secret (cross-namespace needs a ReferenceGrant; max 2 certs per listener) - <https://learn.microsoft.com/en-us/azure/aks/istio-gateway-api> |
| TLS certificates from Azure Key Vault | yes - documented through the Key Vault provider for the Secrets Store CSI driver add-on syncing into a kubernetes.io/tls Secret (a pod must mount the SecretProviderClass); no direct Key Vault reference on the Gateway - <https://learn.microsoft.com/en-us/azure/aks/istio-gateway-api> |
| cert-manager integration | yes - self-managed cert-manager writes the Secret used by `certificateRefs`; Gateway annotations are beta since 1.15 (`config.gatewayAPI.enabled`); not covered by Azure support - <https://cert-manager.io/docs/usage/gateway/> |
| Frontend client certificate validation (mTLS) | yes - listener `tls.options` `gateway.istio.io/tls-terminate-mode: MUTUAL` with `ca.crt` in the same Secret (all versions); Gateway API `spec.tls.frontend` needs AKS 1.36+, strict mode is in Istio 1.28+ code but conformance-claimed (with AllowInsecureFallback) only by Istio 1.31; one CA ref - <https://istio.io/v1.27/docs/tasks/traffic-management/ingress/secure-ingress/> |
| TLS passthrough (TLSRoute) | partial - TLSRoute plus a `tls.mode: Passthrough` listener; Microsoft supports it from asm-1-30; TLSRoute v1 exists only in the AKS 1.36+ bundles, so it needs AKS 1.36+ and asm-1-30+ (derived) - <https://learn.microsoft.com/en-us/azure/aks/istio-gateway-api> |
| TCPRoute and UDPRoute | partial - TCPRoute v1 only on AKS 1.37 (bundle v1.6.1) with asm-1-31 (first Istio to watch v1; derived); UDP no: Istio does not proxy UDP - <https://github.com/Azure/AKS/releases/tag/2026-09-04> |
| TLS protocol and cipher options | partial - ciphers per listener via `tls.options` `gateway.istio.io/tls-cipher-suites` (Istio 1.29+); minimum version only mesh-wide via `meshConfig.tlsDefaults.minProtocolVersion` (Allowed); no per-listener min/max version - <https://github.com/istio/istio/blob/release-1.31/pilot/pkg/config/kube/gateway/conversion.go> |
| Rate limiting (mechanism) | partial - no Gateway API or Istio API; EnvoyFilter with `envoy.filters.http.local_ratelimit` (per pod) or ratelimit plus an external RLS (global); all EnvoyFilter types are allowed but excluded from Azure support - <https://istio.io/latest/docs/tasks/policy-enforcement/rate-limit/> |
| IP allow and deny lists (mechanism) and client IP preservation | yes - `AuthorizationPolicy` (targetRefs Gateway) ALLOW/DENY with `ipBlocks` plus Service `externalTrafficPolicy: Local` (allow-listed; unset the add-on probe annotations), or `remoteIpBlocks` plus numTrustedProxies; L4 option: `loadBalancerSourceRanges` - <https://istio.io/latest/docs/tasks/security/authorization/authz-ingress/> |
| WAF (mechanism) | no - Istio has no WAF and the add-on blocks WasmPlugin (TrafficExtension, Istio 1.30+, also runs Wasm but has no AKS status: UNVERIFIED); put an Azure WAF (Front Door or Application Gateway) in front of the gateway - <https://learn.microsoft.com/en-us/azure/aks/istio-about> |
| Custom error pages and default backend | partial - default backend = an explicit catch-all HTTPRoute (PathPrefix `/`); custom error pages only via EnvoyFilter (not Azure-supported) - <https://gateway-api.sigs.k8s.io/guides/getting-started/migrating-from-ingress/> |
| Request body size limit | partial - no API field; only an EnvoyFilter inserting `envoy.filters.http.buffer` with `max_request_bytes` (413, buffers the whole body); not Azure-supported - <https://www.envoyproxy.io/docs/envoy/latest/api-v3/extensions/filters/http/buffer/v3/buffer.proto> |
| Static public IP or reuse of an existing IP | yes - `spec.infrastructure.annotations` `service.beta.kubernetes.io/azure-pip-name` or `azure-load-balancer-ipv4` (+ `azure-load-balancer-resource-group`); Istio also maps `spec.addresses[0]` to the deprecated `loadBalancerIP` - <https://learn.microsoft.com/en-us/azure/aks/load-balancer-standard> |
| Internal (private) load balancer | yes - `spec.infrastructure.annotations` `service.beta.kubernetes.io/azure-load-balancer-internal: "true"` (+ `azure-load-balancer-internal-subnet`) - <https://learn.microsoft.com/en-us/azure/aks/istio-gateway-api> |
| Load balancers per Gateway | yes - one per Gateway: each Gateway gets its own Envoy Deployment (HPA min 2) and LoadBalancer Service = a dedicated frontend IP on the AKS-managed Azure LB; consolidate with more listeners or ListenerSet (AKS 1.36+, asm-1-30+) - <https://learn.microsoft.com/en-us/azure/aks/load-balancer-standard> |
| Cross-namespace routes (ReferenceGrant, allowedRoutes) | yes - `listeners[].allowedRoutes.namespaces` (Same/All/Selector) and ReferenceGrant (v1beta1 served in every AKS bundle) for cross-namespace backends and Secrets - <https://learn.microsoft.com/en-us/azure/aks/istio-gateway-api> |
| Access logs, metrics, tracing | partial - access logs via the Telemetry API (`envoy` provider supported) and metrics via Azure Monitor managed Prometheus are Supported; tracing (`tracing.*`) is only Allowed (not Azure-supported), so the row is partial per the legend - <https://learn.microsoft.com/en-us/azure/aks/istio-telemetry> |

---

## 9. Implications for ingress-nginx-inventory

These are rules the tool can apply; each restates sourced facts.

**Detect the add-on.**
- ARM `serviceMeshProfile.mode == "Istio"` and `serviceMeshProfile.istio.revisions` [S2][S8].
- In-cluster: namespace `aks-istio-system`, Deployments `istiod-asm-1-xx`, ConfigMaps `istio-asm-1-xx` (AKS default) and `istio-shared-configmap-asm-1-xx` (user overrides) [S2].
- `istio-gateway-class-defaults` in `aks-istio-system` does **not** identify the add-on on its own. AKS creates it when Managed Gateway API is on together with either the add-on [S4] or the app routing Gateway API implementation, which also runs istiod in `aks-istio-system` (Deployment `istiod`, no revision suffix) [S63].
  - Tell them apart by the GatewayClass (`istio` versus `approuting-istio`), the istiod Deployment name (`istiod-asm-1-xx` versus `istiod`) and the ConfigMap label `gateway.istio.io/defaults-for-class` (`istio` for the add-on [S4]).
  - **UNVERIFIED:** the label value on the app routing instance; [S63] doesn't show it.

**Detect Managed Gateway API and its bundle.**
- CRD annotations `app.kubernetes.io/managed-by: aks`, `gateway.networking.k8s.io/bundle-version` and `gateway.networking.k8s.io/channel: standard` [S5].
- Gate every finding on bundle version and revision (tables 4.1-4.3). The same Ingress can be "translates" on AKS 1.36 and "blocked until upgrade" on AKS 1.35. Examples: CORS, 308 redirects, SSL passthrough.

**Mutual exclusion.** Flag clusters with app routing in Gateway API mode (`approuting-istio`): `istio` and `appRoutingGateway` can't both be targets on one cluster [S4].

**Support scope.** Mark EnvoyFilter-based translations (rate limit, body size, custom errors, basic auth) as **"works, not supported by Microsoft"**, not as "yes" [S3].

**Translation hazards.**
- Regex paths become RE2 full-path matches [S58].
- `ExtensionRef` filters are rejected by Istio [S48].
- Per-route retries can't be expressed [S30][S36]-[S38].
- Sticky sessions become soft affinity [S43].

**Revision hygiene.** Report the installed revision against the calendar. `asm-1-29` is expected to reach end of life around Dec 2026 [S1].

**ingress2gateway.** No release has an Istio emitter, up to v1.2.0 (latest, 2026-07-07) and on `main`. Emitters: standard (default), agentgateway, airlock-microgateway (added in v1.2.0), envoy-gateway, gce, kgateway; `istio` exists only as an input provider. Istio-specific objects (AuthorizationPolicy, DestinationRule, EnvoyFilter) must come from our own generator [S62][S68].

---

## 10. Implications for a migration offer

**Positioning.** Microsoft points app routing NGINX users to the app routing Gateway API implementation. The Istio add-on is the choice when the customer wants mesh features: mTLS, traffic policies, telemetry [S23][S25]. App routing NGINX support runs through November 2026, critical security patches only [S25][S24][S64]. Microsoft's app routing Gateway API page also sends ingress-nginx users who need request header or body size limits, Lua, or local and global rate limiting to Gateway API ingress on this add-on, with a gateway-scoped `EnvoyFilter` outside Azure support [S63].

**Operating cost of `istio`, to price into the offer:**
- Canary minor upgrade roughly every quarter; each revision is supported about 5-9 months from its AKS release (asm-1-26: Jul 2025 to Apr 2026; asm-1-31: Oct 2026 to ~Mar 2027) [S1][S9].
- At least 2 gateway pods per Gateway [S4].
- One Azure LB frontend IP per Gateway [S10].
- Before asm-1-30, gateway pods prefer the system node pool unless nodes are labelled `azureservicemesh/istio.replica.preferred=true` [S8].

**Sell AKS upgrades together with the migration.** Several common ingress-nginx features need AKS 1.36+ (CORS, passthrough, 303/307/308, ListenerSet) or 1.37 with asm-1-31 (TCP) on this target (4.3).

**Risk register items.**
- EnvoyFilter-only features are outside Microsoft support [S3].
- No WAF in-cluster; plan Azure WAF in front.
- External auth and mesh-wide retry/TLS defaults rely on "Allowed" MeshConfig fields [S2].

---

## 11. Conflicts, gaps and UNVERIFIED items

1. **GA status of Gateway API ingress on the add-on.**
   - Preview tags were removed on 2026-05-27 by commit `3f2f22f`, whose message body says the feature is generally available [S31].
   - No formal GA announcement was found [S15]-[S22][S23][S24].
   - The add-on overview still says Gateway API is "not yet supported" [S3].
2. **"Sidecar injection: Enabled cluster-wide"** in the AKS blog table [S23] versus opt-in, per-namespace injection and ingress-only use in Learn [S4][S8]. The Learn comparison table says "Supported" [S63], which favors the Learn reading.
3. **Upstream versus AKS lifecycle.** Istio 1.29 upstream end of life was 2026-10-15, while asm-1-29 is listed until ~Dec 2026. AKS lists asm-1-30 as compatible with AKS 1.37; upstream Istio 1.30 lists Kubernetes 1.32-1.36. AKS lists asm-1-29 with AKS 1.36; upstream 1.29 stops at 1.35. AKS end-of-life months trail upstream by 1-2 months for 1.28, 1.30 and 1.31 [S1][S53].
4. **asm-1-28.** The calendar puts its end of life in Aug 2026, but no deprecation note appears in the release notes up to 2026-10-25 [S1][S15]-[S20].
5. **No Microsoft-published Gateway API version per revision.** Section 4.2 is derived from upstream source and conformance reports. Conformance runs on the experimental channel; AKS installs standard only.
6. **TLSRoute needs AKS 1.36+** and **TCPRoute needs AKS 1.37 plus asm-1-31**. Both are derived from the CRD bundles and Istio's watched API versions; Microsoft states neither. Whether AKS sets `PILOT_ENABLE_ALPHA_GATEWAY_API` is not documented.
7. **Frontend validation.** Istio 1.28 release notes claim FrontendTLSValidation, but the 1.30.5 conformance report marks it unsupported and only 1.31 claims it [S32]-[S34]. The 1.28-1.30 source implements strict `spec.tls.frontend` validation; only 1.31 adds `AllowInsecureFallback` [S48]. Why 1.30.5 doesn't claim the feature is unknown.
8. **Possible webhook rejections, not documented by AKS.**
   - Istio listener `tls.options` keys (`gateway.istio.io/tls-terminate-mode`, `gateway.istio.io/tls-cipher-suites`).
   - Non-load-balancer `spec.infrastructure.annotations` such as `proxy.istio.io/config`. Azure LB annotations such as `azure-pip-name` are within documented use: [S4] sends load balancer settings to `spec.infrastructure.annotations`, Service `metadata.annotations` is allow-listed, and the classic gateway page lists `azure-pip-name` and `azure-load-balancer-ipv4` [S6].
   - AKS validates Gateway customizations with webhooks [S4] and does not list which Gateway fields or annotations it inspects.
9. **`numTrustedProxies` per Gateway API gateway** through pod annotations is derived (allow list plus upstream template), not documented by AKS.
10. **DestinationRule on Gateway API gateways.** Consistent hashing and TLS on gateway upstreams is standard Istio behavior, inferred from Istio's own implementation and the DestinationRule reference. No AKS or Istio page shows it with HTTPRoute explicitly; test it.
11. **`TrafficExtension`** (Istio 1.30+): no AKS statement on whether it is installed, allowed or blocked.
12. **Automatic patching of Gateway API gateway pods** with AKS releases is documented only for "istiod and ingress pods" [S9].
13. **Coexistence with app routing NGINX mode** during migration is not documented either way.
14. **Learn allow-list tables are behind the release notes.** Service `spec.ports` and the Deployment seccomp profile were added in release 2026-10-25 [S15] but aren't in the Learn tables [S4].
15. **The GatewayClass `istio` controllerName on AKS** is not documented; upstream default is `istio.io/gateway-controller` [S50].
16. **Upstream release-date mismatches.** Istio's supported-releases page lists 1.30 on May 14, 2026 and 1.31 on Aug 27, 2026; the release announcements say May 18 and Aug 31 [S53]. Section 2.1 uses months only.
17. **EnvoyFilter `targetRefs` by revision.** The Istio 1.31 reference documents it but not the version that added it [S42]. `workloadSelector` on `gateway.networking.k8s.io/gateway-name` is the revision-safe form.
18. **`istio-gateway-class-defaults` is shared by the add-on and app routing Gateway API** [S4][S63]. The `gateway.istio.io/defaults-for-class` value on the app routing instance is not documented.

---

## 12. Sources

Microsoft Learn, fetched 2026-11-04; `updated_at` shown:
- [S1] Support policy for the Istio add-on (updated 2026-10-27): https://learn.microsoft.com/en-us/azure/aks/istio-support-policy
- [S2] Configure the Istio add-on, MeshConfig allow lists (updated 2026-10-27): https://learn.microsoft.com/en-us/azure/aks/istio-meshconfig
- [S3] Istio add-on overview and limitations (updated 2026-09-17): https://learn.microsoft.com/en-us/azure/aks/istio-about
- [S4] Kubernetes Gateway API ingress for the Istio add-on (updated 2026-09-14): https://learn.microsoft.com/en-us/azure/aks/istio-gateway-api
- [S5] AKS Managed Gateway API installation (updated 2026-09-10): https://learn.microsoft.com/en-us/azure/aks/managed-gateway-api
- [S6] External or internal ingresses for the Istio add-on, classic gateways and annotations (updated 2026-09-08): https://learn.microsoft.com/en-us/azure/aks/istio-deploy-ingress
- [S7] Istio add-on telemetry, Telemetry API support scope (updated 2025-07-21): https://learn.microsoft.com/en-us/azure/aks/istio-telemetry
- [S8] Deploy the Istio add-on (updated 2026-09-09): https://learn.microsoft.com/en-us/azure/aks/istio-deploy-addon
- [S9] Upgrade the Istio add-on (updated 2026-09-17): https://learn.microsoft.com/en-us/azure/aks/istio-upgrade
- [S10] Use a public Standard Load Balancer in AKS (updated 2026-09-10): https://learn.microsoft.com/en-us/azure/aks/load-balancer-standard
- [S11] Supported Kubernetes versions in AKS, release calendar (updated 2026-10-21): https://learn.microsoft.com/en-us/azure/aks/supported-kubernetes-versions

Azure/AKS release notes (GitHub):
- [S15] Release 2026-10-25 (asm-1-31 available; patches 1.29.8-3, 1.30.5-3; ConfigMap `spec.ports` and seccomp): https://github.com/Azure/AKS/releases/tag/2026-10-25
- [S16] Release 2026-08-07 (Gateway API deployments `automountServiceAccountToken: false`): https://github.com/Azure/AKS/releases/tag/2026-08-07
- [S17] Release 2026-06-19 (asm-1-30 node affinity weights; Istio CNI default for new asm-1-30 installs; AKS Automatic 1.36): https://github.com/Azure/AKS/releases/tag/2026-06-19
- [S18] Release 2026-09-04 (Managed Gateway API on 1.37 = v1.6.1 with TCPRoute/UDPRoute): https://github.com/Azure/AKS/releases/tag/2026-09-04
- [S19] Release 2026-07-17 (asm-1-30 available; asm-1-28 patched to 1.28.9-2): https://github.com/Azure/AKS/releases/tag/2026-07-17
- [S20] Release 2026-05-29 (asm-1-27 deprecated) and 2026-04-28 (asm-1-29 available, asm-1-26 deprecated; app routing Gateway API GA): https://github.com/Azure/AKS/releases/tag/2026-05-29 , https://github.com/Azure/AKS/releases/tag/2026-04-28
- [S21] Release 2025-04-27 (`gatewayTopology` allowed) and 2025-03-16 (validation of Istio CRs without `istio.io/rev`; `externalTrafficPolicy` customizable): https://github.com/Azure/AKS/releases/tag/2025-04-27 , https://github.com/Azure/AKS/releases/tag/2025-03-16
- [S22] EnvoyFilter history: 2025-10-12 (all types allowed, unsupported), 2024-08-05 (Lua, local rate limit, gzip; Telemetry API v1), 2024-07-16 (Lua only); 2025-08-08 (`proxyHeaders` allowed): https://github.com/Azure/AKS/releases/tag/2025-10-12 , https://github.com/Azure/AKS/releases/tag/2024-08-05 , https://github.com/Azure/AKS/releases/tag/2024-07-16 , https://github.com/Azure/AKS/releases/tag/2025-08-08

AKS blog:
- [S23] Announcing Gateway API support for App Routing (2026-03-18, with GA update; comparison table, mutual exclusivity): https://blog.aks.azure.com/2026/03/18/app-routing-gateway-api
- [S24] App routing Gateway API GA (2026-06-10; Managed Gateway API GA; NGINX support through November 2026): https://blog.aks.azure.com/2026/06/10/app-routing-gateway-api-ga
- [S25] Update on the Application Routing add-on and Ingress-NGINX (2025-11-13): https://blog.aks.azure.com/2025/11/13/ingress-nginx-update

Kubernetes Gateway API:
- [S26] Release v1.6.0 (TCPRoute/UDPRoute GA; client-cert validation promoted): https://github.com/kubernetes-sigs/gateway-api/releases/tag/v1.6.0
- [S27] Release v1.5.0 (TLSRoute v1, ListenerSet, CORS filter, client certificate validation to Standard; ReferenceGrant v1): https://github.com/kubernetes-sigs/gateway-api/releases/tag/v1.5.0
- [S28] Release notes index (ExternalAuth and other experimental items): https://github.com/kubernetes-sigs/gateway-api/releases
- [S29] Gateway API guides index, migrating from Ingress (no default backend; redirect pattern): https://gateway-api.sigs.k8s.io/guides/getting-started/migrating-from-ingress/
- [S30] Release v1.7.0 (2026-10-29; HTTPRoute retry promoted to Standard; session persistence moved to XBackend, experimental): https://github.com/kubernetes-sigs/gateway-api/releases/tag/v1.7.0
- [S32] Istio 1.31.0 conformance report (Gateway API v1.6.0, experimental channel): https://github.com/kubernetes-sigs/gateway-api/blob/main/conformance/reports/v1.6/istio-istio/1.31.0-default-report.yaml
- [S34] Istio 1.30.5 conformance report (Gateway API v1.5.1): https://github.com/kubernetes-sigs/gateway-api/blob/main/conformance/reports/v1.5/istio-istio/1.30.5-default-report.yaml
- [S35] Istio 1.28.0 conformance report (Gateway API v1.4.0): https://github.com/kubernetes-sigs/gateway-api/blob/main/conformance/reports/v1.4.0/istio-istio/1.28.0-default-report.yaml
- [S36] Standard CRD bundles v1.2.1, v1.3.0, v1.4.1 (inspected: kinds, served versions, HTTPRoute/Gateway fields): https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.1/standard-install.yaml , https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.3.0/standard-install.yaml , https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.4.1/standard-install.yaml
- [S37] Standard CRD bundle v1.5.1: https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.5.1/standard-install.yaml
- [S38] Standard CRD bundle v1.6.1: https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.6.1/standard-install.yaml

Istio documentation (pages show Istio 1.31.3 unless noted):
- [S39] External Authorization task: https://istio.io/latest/docs/tasks/security/authorization/authz-custom/
- [S40] AuthorizationPolicy reference (targetRefs, CUSTOM order, ipBlocks/remoteIpBlocks, one provider per workload): https://istio.io/latest/docs/reference/config/security/authorization-policy/
- [S41] Enabling Rate Limits using Envoy: https://istio.io/latest/docs/tasks/policy-enforcement/rate-limit/
- [S42] EnvoyFilter reference (targetRefs, warnings): https://istio.io/latest/docs/reference/config/networking/envoy-filter/
- [S43] DestinationRule reference (consistentHash soft affinity; ClientTLSSettings, credentialName namespace rule): https://istio.io/latest/docs/reference/config/networking/destination-rule/
- [S44] Ingress IP-based access control (ipBlocks vs remoteIpBlocks, externalTrafficPolicy: Local, Gateway API targetRef): https://istio.io/latest/docs/tasks/security/authorization/authz-ingress/
- [S45] Configuring gateway network topology (numTrustedProxies, proxy.istio.io/config, PROXY protocol): https://istio.io/latest/docs/ops/configuration/traffic-management/network-topologies/
- [S46] MeshConfig reference (defaultHttpRetryPolicy, tlsDefaults/TLSConfig, gatewayTopology, extensionProviders): https://istio.io/latest/docs/reference/config/istio.mesh.v1alpha1/ ; VirtualService reference (default retry policy, timeout disabled, RE2): https://istio.io/latest/docs/reference/config/networking/virtual-service/
- [S52] Traffic management concepts (timeouts disabled by default; retry twice; consistent hash soft affinity): https://istio.io/latest/docs/concepts/traffic-management/
- [S53] Istio supported releases (1.27-1.31 dates, end of life, Kubernetes ranges): https://istio.io/latest/docs/releases/supported-releases/
- [S54] Secure Gateways, Istio 1.27 (Gateway API mTLS via `gateway.istio.io/tls-terminate-mode: MUTUAL`, `ca.crt` in the Secret): https://istio.io/v1.27/docs/tasks/traffic-management/ingress/secure-ingress/
- [S55] Introducing the TrafficExtension API (Istio 1.30): https://istio.io/latest/blog/2026/traffic-extension-api/
- [S56] Secure Gateways, latest (Gateway API `spec.tls.frontend.default.validation.caCertificateRefs`): https://istio.io/latest/docs/tasks/traffic-management/ingress/secure-ingress/
- [S57] Announcing Istio 1.27.6 (tlsDefaults.minProtocolVersion mapping fix): https://istio.io/latest/news/releases/1.27.x/announcing-1.27.6/
- [S59] Protocol selection ("Non-TCP based protocols, such as UDP, are not proxied"): https://istio.io/latest/docs/ops/configuration/traffic-management/protocol-selection/
- [S61] Istio Gateway reference (ServerTLSSettings min/maxProtocolVersion, cipherSuites, httpsRedirect; TCP/TLS ports): https://istio.io/latest/docs/reference/config/networking/gateway/
- [S33] Announcing Istio 1.28 (BackendTLSPolicy v1, FrontendTLSValidation, InferencePool v1): https://istio.io/latest/news/releases/1.28.x/announcing-1.28/
- Istio Kubernetes Gateway API task (automated and manual deployment, GatewayClass defaults, resource attachment): https://istio.io/latest/docs/tasks/traffic-management/ingress/gateway-api/
- Istio cert-manager integration: https://istio.io/latest/docs/ops/integrations/certmanager/
- Announcing Istio 1.30 (TLSRoute termination and mixed mode; ListenerSet status): https://istio.io/latest/news/releases/1.30.x/announcing-1.30/
- Announcing Istio 1.31 (AllowInsecureFallback for client certificate validation): https://istio.io/latest/news/releases/1.31.x/announcing-1.31/

Istio source:
- [S47] Gateway deployment template, release-1.31 (infrastructure annotations propagation, `loadBalancerIP` from `spec.addresses`, pod labels): https://github.com/istio/istio/blob/release-1.31/manifests/charts/istio-control/istio-discovery/files/kube-gateway.yaml
- [S48] Gateway API conversion, release-1.31 (filters, regex, retry/timeout mapping, redirect codes, TLS options, frontend validation, 2-certificate limit): https://github.com/istio/istio/blob/release-1.31/pilot/pkg/config/kube/gateway/conversion.go ; release-1.29: https://github.com/istio/istio/blob/release-1.29/pilot/pkg/config/kube/gateway/conversion.go ; release-1.30 (TCP-only alpha gate, frontend validation without `Mode`): https://github.com/istio/istio/blob/release-1.30/pilot/pkg/config/kube/gateway/conversion.go ; release-1.28: https://github.com/istio/istio/blob/release-1.28/pilot/pkg/config/kube/gateway/conversion.go
- [S49] Watched Gateway API versions (GVKs) per release: https://github.com/istio/istio/blob/release-1.29/pkg/config/schema/gvk/resources.gen.go , https://github.com/istio/istio/blob/release-1.30/pkg/config/schema/gvk/resources.gen.go , https://github.com/istio/istio/blob/release-1.31/pkg/config/schema/gvk/resources.gen.go ; alpha flag: https://github.com/istio/istio/blob/release-1.31/pilot/pkg/features/experimental.go
- [S50] Default GatewayClass name and controller name (`PILOT_GATEWAY_API_DEFAULT_GATEWAYCLASS_NAME=istio`, `PILOT_GATEWAY_API_CONTROLLER_NAME=istio.io/gateway-controller`): https://github.com/istio/istio/blob/release-1.31/pilot/pkg/features/pilot.go
- [S51] Backend policies, release-1.31 (BackendTLSPolicy and XBackendTrafficPolicy turned into DestinationRules; sessionPersistence TODO): https://github.com/istio/istio/blob/release-1.31/pilot/pkg/config/kube/gateway/backend_policies.go

Other primary sources:
- [S31] MicrosoftDocs commit history for istio-gateway-api.md ("Remove preview tags", 2026-05-27; latest commit 2026-09-14): https://github.com/MicrosoftDocs/azure-aks-docs/commits/main/articles/aks/istio-gateway-api.md ; the commit, whose body says the feature is generally available: https://github.com/MicrosoftDocs/azure-aks-docs/commit/3f2f22fbea677d6dc7e40ac498400373d85e70cc
- [S58] Envoy RouteMatch.safe_regex ("The entire path (without the query string) must match the regex"): https://www.envoyproxy.io/docs/envoy/latest/api-v3/config/route/v3/route_components.proto
- Envoy buffer filter `max_request_bytes` (413): https://www.envoyproxy.io/docs/envoy/latest/api-v3/extensions/filters/http/buffer/v3/buffer.proto
- Envoy basic auth filter (htpasswd SHA only): https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_filters/basic_auth_filter
- [S60] cert-manager Gateway API usage: https://cert-manager.io/docs/usage/gateway/
- [S62] kubernetes-sigs/ingress2gateway README (providers and emitters, `main`): https://github.com/kubernetes-sigs/ingress2gateway

Added by the 2026-11-04 verification:
- [S63] Learn, application routing add-on with the Kubernetes Gateway API. Covers the comparison table with the Istio add-on, the Limitations (EnvoyFilter route for ingress-nginx features, buffer filter, Istio CRD cleanup including `extensions.istio.io`), the shared `istio-gateway-class-defaults`, and the `istiod` Deployment name. Local copy of MicrosoftDocs `main` (ms.date 2026-08-31): https://learn.microsoft.com/en-us/azure/aks/app-routing-gateway-api
- [S64] Learn, application routing add-on, ingress-nginx retirement include ("official support for critical security patches ... through November 2026"): https://learn.microsoft.com/en-us/azure/aks/app-routing ; include: https://github.com/MicrosoftDocs/azure-aks-docs/blob/main/articles/aks/includes/ingress-nginx-retirement.md
- [S65] Learn, Istio add-on scale and HPA customization (classic gateways, `minReplicas` not below 2): https://learn.microsoft.com/en-us/azure/aks/istio-scale
- [S66] Istio default retry policy source (identical defaults in release-1.29, 1.30 and 1.31): https://github.com/istio/istio/blob/release-1.31/pilot/pkg/networking/core/route/retry/retry.go
- [S67] Istio gateway deployment controller, release-1.28 (`requiredOverlays`: HPA and PDB render only when a ConfigMap overlay supplies them; checked on release-1.28 only): https://github.com/istio/istio/blob/release-1.28/pilot/pkg/config/kube/gateway/deploymentcontroller.go
- [S68] ingress2gateway CHANGELOG (v1.0.0 emitters; airlock-microgateway added in v1.2.0) and releases (v1.2.0 published 2026-07-07): https://github.com/kubernetes-sigs/ingress2gateway/blob/main/CHANGELOG.md , https://github.com/kubernetes-sigs/ingress2gateway/releases
- [S69] Istio downstream TLS defaults, release-1.29 (`applyDownstreamTLSDefaults` for SIMPLE/MUTUAL/OPTIONAL_MUTUAL servers): https://github.com/istio/istio/blob/release-1.29/pilot/pkg/networking/core/listener.go
- [S70] AKS release 2024-10-25 (skip one revision when upgrading the mesh): https://github.com/Azure/AKS/releases/tag/2024-10-25
- [S71] Istio gateway controller, release-1.28 (BackendTLSPolicy informer on the `gatewayv1` type): https://github.com/istio/istio/blob/release-1.28/pilot/pkg/config/kube/gateway/controller.go

---

## Verification log (2026-11-04)

Skeptical re-check of this file against primary sources.

**Local sources used (downloaded 2026-11-04):**
- MicrosoftDocs `azure-aks-docs` `main` (shallow clone, commit `2b46865`): the istio-*, managed-gateway-api and app-routing-* articles.
- AKS `CHANGELOG.md` up to release 2026-10-25, plus the GitHub releases JSON.
- Gateway API standard bundles v1.2.1, v1.3.0, v1.4.1, v1.5.1 and v1.6.1, the v1.7.0 CRDs, release bodies and dates.
- Istio conformance reports 1.28.0, 1.30.5 and 1.31.0, and the list of report files.
- Istio source from `release-1.26` to `release-1.31`: conversion, GVKs, features, retry, listener, deployment template and controller.
- ingress2gateway `main` README and CHANGELOG.

**Online fetches (14 of 15 allowed):**
- Istio supported-releases page.
- GitHub commits API for `istio-gateway-api.md` (2 reads).
- AKS blog posts of 2026-03-18 and 2026-06-10.
- Istio references: AuthorizationPolicy, DestinationRule (2 reads), EnvoyFilter, MeshConfig (2 reads).
- Envoy basic_auth filter.
- cert-manager Gateway usage.
- Istio TrafficExtension blog.

### Claims checked: 349
Table cells are counted one by one.

| Area | Checked |
| --- | --- |
| Revisions and support windows (calendar 42 cells, policy rules 11, upstream gaps, cadence) | 58 |
| Gateway API status, GatewayClass, deployment model (sections 1.2-1.4, 3) | 48 |
| Gateway API surface (4.1: 24, 4.2: 23, 4.3: 51, summary item 5) | 103 |
| Support policy: blocked CRDs, EnvoyFilter, MeshConfig, ProxyConfig, Telemetry (section 5, summary 6-7) | 41 |
| Configuration recipes (section 6) | 45 |
| Classic gateways (section 7) | 4 |
| Feature matrix (section 8, every cell) | 40 |
| Implications (sections 9-10) | 10 |

### Corrections (old, new, source)
1. **Summary 5.** Old: cited `[S5][S14]`, but S14 is not defined anywhere. New: `[S5][S18]`. Source: https://github.com/Azure/AKS/releases/tag/2026-09-04
2. **Summary 6.** Old: EnvoyFilter policy cited to `[S15]` (release 2026-10-25, which says nothing on EnvoyFilter). New: `[S22]`. Also added the ext_authz alternative for basic auth and Microsoft's own advice to use a gateway-scoped EnvoyFilter on this add-on. Sources: https://github.com/Azure/AKS/releases/tag/2025-10-12 , https://learn.microsoft.com/en-us/azure/aks/app-routing-gateway-api
3. **Summary 2, 3.1 and 11.1 (GA status).** Old: "I found no separate GA announcement". New: the commit that removed the preview tags (`3f2f22f`, 2026-05-27) states GA in its message body. A formal release note or blog announcement is still absent. Source: https://github.com/MicrosoftDocs/azure-aks-docs/commit/3f2f22fbea677d6dc7e40ac498400373d85e70cc
4. **2.2.** Old: skip-one-revision rule cited `[S9][S21]`; S21 (2025-03-16, 2025-04-27) doesn't contain it. New: `[S9][S70]`. Source: https://github.com/Azure/AKS/releases/tag/2024-10-25
5. **6.5 and matrix "Retries".** Old: default `retryOn: connect-failure,refused-stream,unavailable,cancelled`. New: `connect-failure,refused-stream,unavailable,cancelled,retriable-status-codes`, 2 attempts, no status codes configured. This is identical in 1.29, 1.30 and 1.31, and the MeshConfig reference lists five conditions. Sources: https://github.com/istio/istio/blob/release-1.31/pilot/pkg/networking/core/route/retry/retry.go , https://istio.io/latest/docs/reference/config/istio.mesh.v1alpha1/
6. **5.3.** Old: quote "exposes internal implementation details that may change at any time". That wording is not on the cited page. New: the page's actual warnings ("must be used with care ...", "deeply tied to the internal implementation ...", "carefully monitored across Istio proxy version upgrades"). Source: https://istio.io/latest/docs/reference/config/networking/envoy-filter/
7. **5.2.** Old: classic gateways "allow annotation and `externalTrafficPolicy` customization only". New: they also take the `proxy.istio.io/config` pod annotation and HPA edits (minReplicas ≥ 2); port/protocol stays unsupported. Sources: https://learn.microsoft.com/en-us/azure/aks/istio-deploy-ingress , https://learn.microsoft.com/en-us/azure/aks/istio-scale
8. **Section 7.** Old: "Only ports 80/443 are exposed". New: the documented Services expose 80 and 443, plus status port 15021. Source: https://learn.microsoft.com/en-us/azure/aks/istio-deploy-ingress
9. **Matrix "WebSockets".** Old: "supported in Istio 1.28-1.31 conformance". That implies a 1.29 report, and none exists. New: "in the 1.28.0, 1.30.5 and 1.31.0 reports (none published for 1.29)". Source: https://github.com/kubernetes-sigs/gateway-api/tree/main/conformance/reports
10. **Matrix "Access logs, metrics, tracing".** Old: class `yes`. New: `partial`, because tracing (`tracing.*`) is only Allowed, which the matrix legend classes as partial. Access logs and metrics remain Supported. Source: https://learn.microsoft.com/en-us/azure/aks/istio-telemetry
11. **4.3 row "Gateway `spec.tls.frontend`", 6.8, 11.7 and matrix "Frontend client certificate validation".** Old: support stated only as "claimed by 1.31 conformance", with a "Conflict" against 1.28. New: the 1.28, 1.29 and 1.30 source already maps `spec.tls.frontend` CA refs to `MUTUAL` (one CA, `TODO: add 'Mode'`). Only 1.31 adds `AllowInsecureFallback` and the conformance claim. Source: https://github.com/istio/istio/blob/release-1.30/pilot/pkg/config/kube/gateway/conversion.go
12. **Section 9 (detection).** Old: "`istio-gateway-class-defaults` present means Managed Gateway API and the add-on are both on". New: the app routing Gateway API implementation creates the same ConfigMap in the same namespace. Tell them apart by GatewayClass (`istio` / `approuting-istio`), istiod Deployment (`istiod-asm-1-xx` / `istiod`) and the `defaults-for-class` label. Source: https://learn.microsoft.com/en-us/azure/aks/app-routing-gateway-api
13. **Section 9 (ingress2gateway).** Old: "v1.0 has no Istio emitter (emitters: standard, agentgateway, airlock-microgateway, ...)". airlock-microgateway was added only in v1.2.0, and v1.2.0 (2026-07-07) is the latest release. New: no Istio emitter through v1.2.0 and on `main`. Source: https://github.com/kubernetes-sigs/ingress2gateway/blob/main/CHANGELOG.md
14. **Section 10.** Old: "each revision is supported about 6-9 months". New: "about 5-9 months" (asm-1-31: Oct 2026 to ~Mar 2027). Source: https://learn.microsoft.com/en-us/azure/aks/istio-support-policy
15. **11.8.** Old: listed `azure-pip-name` as a possible webhook rejection. New: Azure LB annotations are within documented use (S4 routes LB settings to `spec.infrastructure.annotations`; S6 lists `azure-pip-name` and `azure-load-balancer-ipv4`). Only non-LB annotations such as `proxy.istio.io/config` stay undocumented. Sources: https://learn.microsoft.com/en-us/azure/aks/istio-gateway-api , https://learn.microsoft.com/en-us/azure/aks/istio-deploy-ingress
16. **3.5 and 11.2.** The blog's "Enabled cluster-wide" is now weighed against the Learn comparison table, which says "Supported". Source: https://learn.microsoft.com/en-us/azure/aks/app-routing-gateway-api

**Additions (new facts, sourced):**
- 2.3 and 11.3: upstream 1.29 supports Kubernetes 1.31-1.35, while AKS lists asm-1-29 with 1.36. AKS end-of-life months trail upstream by 1-2 months for 1.28, 1.30 and 1.31 (https://istio.io/latest/docs/releases/supported-releases/).
- 4.2 and 6.11: with the alpha flag at its default `false`, 1.29 rejects TLS and TCP listeners and `allowedListeners`, 1.30 rejects TCP, and 1.31 rejects neither (https://github.com/istio/istio/blob/release-1.29/pilot/pkg/config/kube/gateway/conversion.go).
- 4.3 and the matrix legend: only compatible revision/AKS pairs exist; asm-1-29 is not on AKS 1.37 (S1).
- 3.4: why upstream creates no HPA/PDB (`requiredOverlays`, S67).
- 5.2: TrafficExtension is alpha, supersedes WasmPlugin, runs Lua and Wasm, and targets Gateways (S55); a WAF-cell caveat follows from this.
- 5.3: EnvoyFilter `targetRefs` also accepts GatewayClass and is exclusive with `workloadSelector` (S42).
- 6.10: `tlsDefaults` applies to downstream SIMPLE/MUTUAL/OPTIONAL_MUTUAL contexts (S69).
- 6.12: cert-manager ListenerSet also needs `config.gatewayAPI.enableListenerSet` and the `ListenerSets` gate (S60).
- Section 10: Learn source for "critical security patches through November 2026" (S64).

**Confirmed unchanged (highlights):**
- The asm-1-26 to asm-1-31 calendar and all policy rules (S1, S9).
- Every patch level and release date cited from the AKS release notes.
- The bundle-per-AKS-minor mapping, CLI flags, azure-cli 2.86.0 and the CRD annotations (S5).
- Every served-version and field cell in 4.1, read from the CRD YAML.
- Istio GVKs per release (S49).
- Filter conversion, ExtensionRef rejection, redirect passthrough, the 2-certificate and 1-CA limits, cipher-suite option from 1.29, and the "Not yet implemented" TLS list (S48).
- Conformance lists (S32, S34, S35).
- Blocked CRDs, the EnvoyFilter history and quote, and every MeshConfig, ProxyConfig and Telemetry class (S2, S3, S7).
- The Gateway API allow lists, HPA/PDB defaults, scheduling weights and automount (S4, S8, S16, S17).
- AuthorizationPolicy, DestinationRule and MeshConfig semantics (S40, S43, S46).
- Envoy basic_auth "only SHA format".
- cert-manager `config.gatewayAPI.enabled`.
- The S23 and S24 quotes, the v20260428 GA and NGINX support through November 2026.
- v1.7.0 retry promotion on 2026-10-29 (S30).

### Left UNVERIFIED
- A formal GA announcement for Gateway API ingress on the add-on: none in the release notes or the blog. Only the docs commit body states GA.
- Automatic patching of Gateway API gateway Deployments with AKS releases (S9 names only "istiod and ingress pods").
- Which side is authoritative for the AKS/upstream lifecycle and Kubernetes-range mismatches (2.3).
- The `controllerName` of GatewayClass `istio` on AKS (upstream default `istio.io/gateway-controller`).
- Whether AKS sets `PILOT_ENABLE_ALPHA_GATEWAY_API`.
- The AKS status of `TrafficExtension` (installed CRD group `extensions.istio.io`, but allowed or blocked is unknown).
- Which Istio version added EnvoyFilter `targetRefs`.
- Why the Istio 1.30.5 report marks frontend client-certificate validation unsupported.
- Coexistence of the add-on with app routing NGINX mode.
- Webhook acceptance of Istio `tls.options` keys and non-LB `spec.infrastructure.annotations`.
- Per-Gateway `numTrustedProxies` through pod annotations on AKS.
- The `gateway.istio.io/defaults-for-class` value on the app routing instance of `istio-gateway-class-defaults`.
- The Learn `updated_at` stamps in section 12. Only S4's (2026-09-14) was re-checked, against the latest commit; local copies carry older `ms.date` values.

### Accepted on the existing citation, not re-fetched (budget)
- S10, S25, S39, S41, S44, S45, S52, S54, S56, S57, S58, S59 and S61.
- The Envoy buffer filter 413 behavior.
- The Istio 1.30/1.31 announcement dates (May 18, Aug 31).

Each item is consistent with the local code or Learn text where one exists: rate limiting via EnvoyFilter and the buffer filter are restated on the app routing Learn page (S63), and the `tls-terminate-mode` key appears in the 1.31 testdata.
