# F3: Application Gateway for Containers (`agc`, `agcIngress`)

Research date: **2026-11-04**. Scope: the two AKS migration targets built on Application Gateway for Containers (AGC):

- `agc`: AGC driven by the Kubernetes Gateway API (GatewayClass `azure-alb-external`).
- `agcIngress`: AGC driven by the Ingress API (`ingressClassName: azure-alb-external`, `alb.networking.azure.io/*` annotations and the `IngressExtension` CRD). This is the "keep your Ingress objects" path.

## Method and conventions

- The full Microsoft Learn AGC doc set (66 Markdown/YAML files under `articles/application-gateway/for-containers/` in the public MicrosoftDocs/azure-docs repo, `main` branch; 68 entries counting the `examples/` and `media/` folders) was read on 2026-11-04. The live Learn pages for the overview, release notes, AGIC migration, FAQ and limits were spot-checked. They match the repo content, and most key pages were updated on 2026-11-03.
- Cross-checked against these primary sources:
  - Azure Updates, through the release-communications API that backs azure.microsoft.com/updates.
  - The Azure Retail Prices API.
  - The MCR tag list for the ALB Controller chart and image.
  - kubernetes-sigs/gateway-api: v1.6.2 source, AGC conformance reports and the v1.6 implementations page.
  - Azure/AKS GitHub issues labelled `app-gateway-for-containers`. Microsoft statements there come from Jack Stromberg, marked "Member", unless stated otherwise.
  - Microsoft's own migration tool, Azure/Application-Gateway-for-Containers-Migration-Utility.
- **UNVERIFIED** means the sources are silent or conflict. **INFERENCE** means the conclusion is derived from documented facts but Microsoft does not state it. Every other claim is attributed to a source.
- Doc dates matter. Several how-to pages date from 2024 and are older than features added later. For example, the Gateway API redirect page (2024-11-05) lists only 301/302, but 307/308 support arrived in ALB Controller 1.11.1.

---

## 1. Status at a glance (as of 2026-11-04)

| Item | Fact | Source |
|---|---|---|
| Service | Generally available. The Azure Updates GA entry was created 2024-02-27; public preview started 2023-07-24. | https://azure.microsoft.com/updates?id=general-availability-application-gateway-for-containers |
| Latest ALB Controller (Helm) | **1.13.0**: Gateway API **v1.6.2**, Gateway API Inference Extension v1.6.2, minimum Kubernetes **v1.32**. New in 1.13.0: JWT validation, MCP gateway, Gateway API ListenerSet and LLM-D support. Release-notes page updated 2026-11-03. | https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/alb-controller-release-notes |
| Registry check | 1.13.0 is the highest chart and image tag on MCR (re-checked 2026-11-04). The highest tags of the previous minors are 1.12.4, 1.11.7 and 1.10.40. | https://mcr.microsoft.com/v2/application-lb/charts/alb-controller/tags/list , https://mcr.microsoft.com/v2/application-lb/images/alb-controller/tags/list |
| Upstream Gateway API | Latest is v1.7.0 (2026-10-29); v1.6.3 shipped 2026-10-06 and v1.6.2 on 2026-09-03. AGC trails upstream by one minor version. | https://github.com/kubernetes-sigs/gateway-api/releases |
| AKS add-on | **Public preview** since Feb 2026, with AKS Automatic support added in May 2026. The add-on pins older controllers: AKS v1.26 to v1.35 get ALB Controller **v1.10.x**, and AKS v1.36+ gets **v1.11.x**. | https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/alb-controller-release-notes , https://azure.microsoft.com/updates?id=555603 , https://azure.microsoft.com/updates?id=558403 |
| WAF | GA in Nov 2025 (update 525419): DRS rule sets, bot manager and "rate limiting custom rules". | https://azure.microsoft.com/updates?id=525419 |
| Other GA milestones | gRPC and frontend mTLS (Sep 2024), WebSocket (Jan 2025, update 475194), CNI Overlay (Aug 2025, update 500991), slow start (Nov 2025, update 525893), Istio service-mesh integration (May 2026, update 564714). | https://azure.microsoft.com/updates?id=475194 , https://azure.microsoft.com/updates?id=564714 |
| Features in preview | Private ingress, JWT validation (AuthPolicy) and MCP gateway (MCPRoute), all announced 2026-11-03. Inference gateway (Jun 2026). The AKS add-on. | https://azure.microsoft.com/updates?id=576393 , https://azure.microsoft.com/updates?id=576382 , https://azure.microsoft.com/updates?id=576388 , https://azure.microsoft.com/updates?id=566516 |
| AKS positioning | AKS docs list AGC as a migration target for application routing add-on NGINX users and OSS NGINX users, noting that it "supports both Ingress API and Gateway API". Microsoft supports critical patches for add-on NGINX through November 2026. | https://learn.microsoft.com/en-us/azure/aks/app-routing |
| Conformance | The last AGC conformance report is for Gateway API **v1.2.1**, run on ALB Controller 1.7.9 on 2025-07-18. The `conformance/reports` folders for v1.3.0, v1.4.0, v1.4.1, v1.5.0, v1.5.1, v1.5, v1.6.0, v1.6 and v1.7 contain no AGC entry (checked 2026-11-04). Gateway API generates its implementation lists from submitted reports, so AGC does **not** appear on the v1.6 implementations page, although the AGC overview links to that page. | https://github.com/kubernetes-sigs/gateway-api/blob/main/conformance/reports/v1.2.1/azure-application-gateway-for-containers/standard-v1.2.1-default-report.yaml , https://github.com/kubernetes-sigs/gateway-api/tree/main/conformance/reports , https://gateway-api.sigs.k8s.io/docs/conformance/ , https://gateway-api.sigs.k8s.io/docs/implementations/versions/v1.6/ |

### Minimum ALB Controller version per feature (from the release notes)

| Feature | Minimum controller version |
|---|---|
| URL redirect for Gateway and Ingress (GA release) | 1.0.0 |
| Header rewrite (Gateway and Ingress), URL rewrite (Ingress), maximum two certificates per host | 0.6.1 |
| ECDSA and RSA certificates, server-sent events | 1.0.2 |
| gRPC, frontend mTLS, Gateway API v1.1 | 1.2.3 |
| Regex match for path and header (HTTP and gRPC) | 1.4.12 |
| WAF (preview at the time), Gateway API v1.2.1 | 1.7.9 |
| Slow start | 1.8.9 |
| AKS Istio add-on integration | 1.9.11 |
| Load-aware routing | 1.10.21 |
| Gateway API v1.5.1, **CORS**, **HTTPRoute timeouts** (replacing RoutePolicy timeouts), **307/308 redirects**, Arm64 nodes | 1.11.1 |
| **Request mirroring** | 1.12.1 |
| Gateway API v1.6.2, **ListenerSet**, **JWT validation**, MCP gateway; **private ingress requires ≥ 1.13** | 1.13.0 |

Source: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/alb-controller-release-notes (private ingress requirement from https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/private-ingress).

**INFERENCE:** because the add-on pins v1.10.x on AKS 1.26 to 1.35 and v1.11.x on AKS 1.36+, add-on clusters lack request mirroring, ListenerSet, JWT validation and private ingress. Add-on clusters on AKS 1.35 or older also lack CORS, HTTPRoute timeouts and 307/308 redirects. The tool should report the controller version it detects instead of assuming 1.13.

---

## 2. How AGC plugs into Kubernetes

### 2.1 Azure resources and prerequisites

- **Resources.** An AGC resource (`Microsoft.ServiceNetworking/trafficControllers`) has these child resources:
  - **frontends**: the entry points, each with a generated FQDN.
  - **associations**: links to a delegated subnet. Only **1 association per AGC** is allowed, and each needs at least a /24 subnet (256 addresses).
  - **security policies**: the only type is `waf`. (The components page's "Core components" list still names only associations and frontends as child resources. Its own security-policy section, the overview and the WAF pages describe `SecurityPolicy` as a child resource.)
  - Child resources cannot be shared between AGC resources.
  - Source: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/application-gateway-for-containers-components
- **Identity.** The ALB Controller needs a user-assigned managed identity with the built-in role *AppGw for Containers Configuration Manager*. This role has data-action permissions that Owner and Contributor lack. (Source: components page.)
- **Cluster networking.**
  - Azure CNI or Azure CNI Overlay is required, with workload identity enabled (add-on and Helm quickstarts). **Kubenet is not supported.** (https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/faq)
  - In every CNI mode, AGC must be deployed in the same VNet as the AKS cluster: "Separate virtual networks for Application Gateway for Containers and AKS aren't currently supported" (container-networking FAQ).
  - With CNI Overlay:
    - The ALB Controller must be ≥ 1.7.9.
    - The AGC subnet must be exactly /24, with one deployment per subnet.
    - Regional and global VNet peering between the AGC VNet and the node VNet are listed as unsupported.
    - NVAs or Azure Firewall cannot sit between AGC and the pods. (With flat Azure CNI, the components page documents user-defined routes for an NVA hop.)
  - Sources: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/container-networking , https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/application-gateway-for-containers-components
- **ALB Controller egress.** The controller needs outbound access to management.azure.com, login.microsoftonline.com, `*.oic.prod-aks.azure.com`, `*.alb.azure.com` and mcr.microsoft.com on TCP 443, plus DNS. This matters for egress-locked clusters. (Source: components page.)

### 2.2 Deployment modes

| Mode | Who owns the Azure resources | Gateway wiring | Ingress wiring |
|---|---|---|---|
| **Bring your own (BYO)** | You create the AGC resource, association and frontends via portal, `az network alb`, PowerShell or Terraform. A frontend is **not** deleted when its Gateway is deleted. | Annotation `alb.networking.azure.io/alb-id: <AGC ARM id>` plus `spec.addresses: [{type: alb.networking.azure.io/alb-frontend, value: <frontend name>}]` | Annotations `alb.networking.azure.io/alb-id` and `alb.networking.azure.io/alb-frontend` |
| **Managed by ALB Controller** | An `ApplicationLoadBalancer` CR (`spec.associations: [<subnet id>]`) makes the controller create the AGC resource and association. Each Gateway that references it gets a **new frontend** named `fe-<8 random chars>`, whose lifecycle follows the Gateway. | Annotations `alb.networking.azure.io/alb-name` and `alb.networking.azure.io/alb-namespace`, which point to the ApplicationLoadBalancer CR | Same two annotations |

Sources:
- https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/overview
- https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-waf-gateway-api
- https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-multiple-site-hosting-ingress-api

**INFERENCE (DNS stability):** in managed mode, deleting and recreating a Gateway creates a new frontend, which means a new generated FQDN, so DNS CNAMEs must change. BYO keeps the frontend and its FQDN independent of Kubernetes objects. Moving a host from `agcIngress` to `agc` therefore normally means a DNS cutover. The FAQ also says a frontend must not be shared by an Ingress and a Gateway (see conflict C3).

### 2.3 Controller installation

- **Helm** (`oci://mcr.microsoft.com/application-lb/charts/alb-controller --version 1.13.0`):
  - The controller runs in namespace `azure-alb-system` by default. `albController.namespace` overrides it, so detection must not rely on the namespace. The quickstart finds the controller pods with `kubectl get pod -A -l app=alb-controller`.
  - The chart installs the **Gateway API CRDs by default** (`albController.installGatewayApiCRDs: true`).
  - It runs "at least two replicas in active/passive configuration", and a user-defined replica count is not supported (FAQ). The components page also describes an `alb-controller-bootstrap` pod that manages CRDs.
  - Running multiple ALB Controllers in one cluster "isn't recommended or supported".
  - Sources: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/quickstart-deploy-application-gateway-for-containers-alb-controller-helm , https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/alb-controller-helm-chart , FAQ.
- **AKS add-on** (preview, `az aks update --enable-gateway-api --enable-application-load-balancer`):
  - Pods run in `kube-system`.
  - The managed identity is `applicationloadbalancer-<cluster>`.
  - With an AKS-managed VNet, subnet `aks-appgateway` is created automatically.
  - The add-on is required on AKS Automatic, where Helm is not supported.
  - It relies on the AKS Managed Gateway API CRDs.
  - Sources: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/quickstart-deploy-application-gateway-for-containers-alb-controller-addon , FAQ.
- **AKS Managed Gateway API bundles** (standard channel only): v1.2.1 for Kubernetes 1.26 to 1.33, v1.3.0 for 1.34, v1.4.1 for 1.35, v1.5.1 for 1.36 and v1.6.1 for 1.37+. Experimental-channel CRDs are disallowed. (https://learn.microsoft.com/en-us/azure/aks/managed-gateway-api)

### 2.4 Class names and detection hints for the inventory tool

- **GatewayClass `azure-alb-external`**: public frontend, `spec.controllerName: alb.networking.azure.io/alb-controller`. (Add-on and Helm quickstarts.)
- **GatewayClass `azure-alb-internal`**: private frontend, preview, needs ALB Controller ≥ 1.13. (https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-private-ingress-gateway-api)
- **Ingress**: every AGC Ingress how-to uses `spec.ingressClassName: azure-alb-external`. The private-ingress page instead says: "For the Ingress API, specify the class using the `kubernetes.io/ingress.class` annotation with either `azure-alb-external` or `azure-alb-internal`." **UNVERIFIED:** whether the controller creates an `IngressClass` object, and whether `ingressClassName: azure-alb-internal` works. (https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/private-ingress)
- **Other signals**:
  - CRDs in group `alb.networking.azure.io`.
  - `ApplicationLoadBalancer` objects.
  - Pods named `alb-controller*` (label `app=alb-controller`) in `azure-alb-system` (Helm default, configurable) or `kube-system` (add-on, not configurable).
  - The AGIC class `azure-application-gateway` belongs to a different product.

---

## 3. Gateway API support (`agc`)

**Implemented resources** (overview page, updated 2026-11-03):

- GatewayClass.
- Gateway: listener protocols **HTTP and HTTPS only**, and **"the only ports allowed on the listener are 80 and 443"**.
- HTTPRoute.
- GRPCRoute.
- ReferenceGrant. The overview says "Currently supports version v1alpha1 of this API", but Gateway API has no v1alpha1 ReferenceGrant (see conflict C5).
- ListenerSet (`gateway.networking.k8s.io/v1`, since 1.13.0).
- Gateway API Inference Extension `InferencePool` (preview).

Sources: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/overview , https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/multi-team-shared-gateway

**Not supported or not documented:**

- **TLSRoute, TCPRoute and UDPRoute.** On 2026-11-03 Microsoft wrote that "Gateway API v1.6.2 support has been released as part of ALB Controller v1.13. This does not include TCPRoute support", and recommended Azure Load Balancer for L4. (https://github.com/Azure/AKS/issues/5898) All three are Standard-channel `v1` kinds in Gateway API v1.6, so their CRDs exist on clusters with the v1.6.1 bundle (AKS Managed Gateway API on Kubernetes 1.37+) even though AGC does not serve them. (https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.6.1/standard-install.yaml)
- **The upstream BackendTLSPolicy** (`gateway.networking.k8s.io/v1`, part of Gateway API v1.6.2). AGC documents only its own `alb.networking.azure.io/v1` kind with the same name, so upstream support is **UNVERIFIED**.
- **Experimental HTTPRoute fields** `retry`, `sessionPersistence` and the `ExternalAuth` filter. These are experimental in v1.6.2 (https://github.com/kubernetes-sigs/gateway-api/blob/v1.6.2/apis/v1/httproute_types.go) and are not mentioned anywhere in the AGC docs. Gateway API v1.7.0 (2026-10-29) promoted `retry` to Standard, but AGC implements v1.6.2. (https://github.com/kubernetes-sigs/gateway-api/releases/tag/v1.7.0)

**v1.2.1 conformance (ALB Controller 1.7.9, 2025-07-18):**

- Results: GATEWAY-HTTP Core 33/33 and GATEWAY-GRPC Core 12/12 passed.
- Extended features passed: `HTTPRouteDestinationPortMatching`, `HTTPRouteHostRewrite`, `HTTPRouteMethodMatching`, `HTTPRoutePathRedirect`, `HTTPRoutePathRewrite`, `HTTPRoutePortRedirect`, `HTTPRouteQueryParamMatching`, `HTTPRouteResponseHeaderModification` and `HTTPRouteSchemeRedirect`.
- Unsupported **at that version**:
  - `GatewayHTTPListenerIsolation`, `GatewayInfrastructurePropagation`, `GatewayPort8080`, `GatewayStaticAddresses`.
  - `HTTPRouteBackendProtocolH2C`, `HTTPRouteBackendProtocolWebSocket`, `HTTPRouteBackendRequestHeaderModification`, `HTTPRouteParentRefPort`.
  - `HTTPRouteBackendTimeout`, `HTTPRouteRequestTimeout`, `HTTPRouteRequestMirror`, `HTTPRouteRequestMultipleMirrors`.
- Timeouts (1.11.1) and mirroring (1.12.1) were added later according to the release notes. The current status of the other items is **UNVERIFIED** because no newer report exists.
- Source: https://github.com/kubernetes-sigs/gateway-api/blob/main/conformance/reports/v1.2.1/azure-application-gateway-for-containers/standard-v1.2.1-default-report.yaml

---

## 4. AGC custom resources (`alb.networking.azure.io`)

Source for every row unless noted: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/api-specification-kubernetes (updated 2026-11-03). Four policies have `default` and `override` blocks: `RoutePolicy`, `HealthCheckPolicy`, `FrontendTLSPolicy` and `BackendTLSPolicy`. On all four, `override` is "currently not supported and result in a validation error", so only `default` works. `BackendLoadBalancingPolicy` (`targetRefs[]` plus `loadBalancing`) and `WebApplicationFirewallPolicy` (`targetRef` plus `webApplicationFirewall`) have neither block.

| Kind (version) | Targets | What it configures | API |
|---|---|---|---|
| `ApplicationLoadBalancer` (v1) | n/a | Managed mode. `spec.associations` holds subnet IDs, and the controller creates the AGC resource and association. | both |
| `RoutePolicy` (v1) | HTTPRoute (reason codes also mention GRPCRoute) | `default.timeouts.routeTimeout` and `default.sessionAffinity`. HTTPRoute `timeouts` take precedence over `routeTimeout`. | Gateway |
| `HealthCheckPolicy` (v1) | Service | `interval`, `timeout`, `port`, `healthyThreshold`, `unhealthyThreshold`, `useTLS`, `http.{host,path,match.{body,statusCodes[start,end]}}`, `grpc.{authority,service}`. Probe precedence: HealthCheckPolicy, then the pod readinessProbe, then the default probe (5 s interval, 30 s timeout, path `/`, host `localhost`). See https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/custom-health-probe | both |
| `FrontendTLSPolicy` (v1) | Gateway (+ `sectionNames` = listener) | Client mTLS through `verify.caCertificateRef` and `verify.subjectAltNames`. Also `policyType: {type: predefined, name: 2023-06 \| 2023-06-S}`. | Gateway |
| `BackendTLSPolicy` (v1, **AGC's own**) | Service | `sni`, `ports[]`, `verify.caCertificateRef`, `verify.subjectAltName`, and `clientCertificateRef` for backend mTLS. | Gateway (the AGIC migration page says Ingress too; see C18) |
| `WebApplicationFirewallPolicy` (v1) | Gateway, Gateway listener (`sectionNames`), HTTPRoute | `webApplicationFirewall.id`, the ARM ID of an Application Gateway WAF policy. This also needs an Azure `SecurityPolicy` child resource; see https://learn.microsoft.com/en-us/azure/web-application-firewall/ag/waf-application-gateway-for-containers-overview | Gateway |
| `BackendLoadBalancingPolicy` (v1) | Service (+ ports) | `loadBalancing.strategy`: round-robin (default), least-request, ring-hash or load-aware. Also `slowStart` (window, aggression, startWeightPercent) and `loadAware`. See https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/load-balancing-strategies | Gateway (Ingress through `IngressExtension.backendSettings[].loadBalancingPolicySpec`) |
| `IngressExtension` (v1) | Ingress, referenced by annotation | Covered in §5.2 | Ingress |
| `AuthPolicy` (**v1alpha1, preview**) | ApplicationLoadBalancer, Gateway, HTTPRoute, GRPCRoute, MCPRoute | JWT validation: `issuer`, `audiences`, `jwks.remote.uri`, plus optional OAuth Protected Resource Metadata. Must be in the same namespace as its target; no ReferenceGrant and no `sectionNames`. Returns 401 or 403. See https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/jwt-validation | Gateway |
| `MCPRoute` (**v1alpha1, preview**) | Gateway | Model Context Protocol routing and aggregation. See https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/mcp-gateway | Gateway |

---

## 5. Ingress API support (`agcIngress`)

### 5.1 Annotations documented for the Ingress API

Microsoft publishes **no consolidated annotation reference**; the API specification covers CRDs only. The list below is compiled from every Ingress how-to in the doc set. No other `alb.networking.azure.io/*` Ingress annotation appears anywhere in the docs.

| Annotation | Mode | Meaning | Source |
|---|---|---|---|
| `alb.networking.azure.io/alb-name` | Managed | Name of the `ApplicationLoadBalancer` CR | https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-multiple-site-hosting-ingress-api |
| `alb.networking.azure.io/alb-namespace` | Managed | Namespace of that CR, which can differ from the Ingress namespace | same |
| `alb.networking.azure.io/alb-id` | BYO | ARM resource ID of the AGC resource | same |
| `alb.networking.azure.io/alb-frontend` | BYO (also shown in managed mode) | Name of the AGC frontend to bind. In the redirect how-to, three Ingresses share `alb-frontend: ingress-fe` | https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-url-redirect-ingress-api |
| `alb.networking.azure.io/alb-ingress-extension` | Any | Name of the `IngressExtension` to apply. All examples keep it in the Ingress namespace | https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-header-rewrite-ingress-api |
| `kubernetes.io/ingress.class` (not AGC-prefixed) | Any | `azure-alb-external` (public) or `azure-alb-internal` (private, preview), according to the private-ingress page | https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/private-ingress |

The same `alb-name`, `alb-namespace` and `alb-id` annotations are used on **Gateway** objects. For a Gateway, `alb.networking.azure.io/alb-frontend` is a `spec.addresses[].type`, not an annotation.

### 5.2 `IngressExtension` capabilities

Source: the API specification.

- **`spec.rules[]`, keyed by `host`:**
  - `additionalHostnames`.
  - `rewrites[]` of type `RequestHeaderModifier`, `ResponseHeaderModifier` or `URLRewrite`. `URLRewrite` supports `hostname` and `path` of type `ReplaceFullPath` or `ReplacePrefixMatch`.
  - `requestRedirect` with `scheme`, `hostname`, `path`, `port` and `statusCode`.
- **`spec.backendSettings[]`, keyed by Service name:**
  - `ports[]` (port or name, with protocol `HTTP` or `HTTPS`) and `trustedRootCertificate`.
  - `sessionAffinity`, `timeouts.requestTimeout` and `loadBalancingPolicySpec`.
- **Granularity.** Settings apply per host and per Service, and the extension attaches to a whole Ingress. Microsoft's own examples split a path that needs different behaviour into its own Ingress object (`/shop` in the URL-rewrite how-to). **INFERENCE:** per-path settings require splitting Ingresses. (https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-url-rewrite-ingress-api)

### 5.3 Gateway-API-only features, not available to `agcIngress`

| Feature | Source |
|---|---|
| gRPC: "no support is offered for gRPC in Ingress API" | https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/grpc |
| WebSockets: "only supported when using Gateway API" | https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/websockets |
| CORS | https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/cross-origin-resource-sharing |
| WAF and frontend TLS policy: "Not supported" for Ingress | https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/migrate-from-agic-to-agc |
| TLS policy: Ingress always uses default policy `2023-06` | https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/tls-policy |
| ListenerSet delegation | https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-multi-team-listeners-gateway-api |
| Istio service-mesh extension | https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/service-mesh-integration |
| JWT validation: "JWT validation is only supported with Gateway API. Ingress API is not supported." AuthPolicy targets also exclude Ingress | https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/jwt-validation |
| Traffic splitting, mirroring, and header, query or method matching: the Ingress API and `IngressExtension` have no fields for them | API specification |

- In March 2026 Microsoft said "No update to provide on WAF + Ingress support". The issue was later closed by the stale bot. (https://github.com/Azure/AKS/issues/5411)
- Microsoft's migration utility only produces Gateway API output. Its README says it "Reads ingresses from your cluster and generates Gateway API resources" (https://github.com/Azure/Application-Gateway-for-Containers-Migration-Utility). A Microsoft blog adds: "There's no flag to produce Ingress resources for AGC instead." This blog is a secondary source and was not re-fetched on 2026-11-04. (https://techcommunity.microsoft.com/t5/apps-on-azure-blog/after-ingress-nginx-migrating-to-application-gateway-for/ba-p/4503110)

---

## 6. Frontends, DNS and Azure Front Door

- **FQDN-only frontends.**
  - Each frontend gets an Azure-generated FQDN in the format `*.fzXX.alb.azure.com`, where XX is 0 to 99. Frontends listen only on 80 and 443.
  - You use the FQDN directly or point a **CNAME** at it.
  - The FQDN appears in Gateway `status.addresses[].value` and in Ingress `status.loadBalancer.ingress[].hostname`.
  - The Gateway examples disagree on `status.addresses[].type`: 9 how-tos show `Hostname` and 8 show `IPAddress`, always with the FQDN as the value. The type the controller actually writes is **UNVERIFIED** (C19), so the tool should read the value and ignore the type.
  - Sources: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/application-gateway-for-containers-components , https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-url-rewrite-gateway-api
- **Anycast.** "Frontends resolve to any anycast IP address," so the IP's ASN location can be outside the region. (FAQ.)
- **No static or bring-your-own IP.**
  - `GatewayStaticAddresses` was unsupported in the v1.2.1 conformance report.
  - On 2026-08-26 Microsoft said BYO static public IP for frontends "will not ship this calendar year", adding that this is not a permanent no. The request remains open. (https://github.com/Azure/AKS/issues/5630)
- **Zone apex.**
  - Azure DNS alias records can target public IPs, Traffic Manager, CDN, Front Door and same-zone record sets, but **not AGC frontends**. (Page dated 2026-10-05: https://learn.microsoft.com/en-us/azure/dns/dns-alias)
  - The feature request is open. Microsoft acknowledged it on 2025-11-10 but committed to nothing, and exempted it from the stale bot on 2026-10-12. (https://github.com/Azure/AKS/issues/5406)
  - The AGIC migration page still suggests "an alias record" for apex domains; see conflict C4.
  - **INFERENCE:** apex hosts need Azure Front Door in front of AGC or a DNS provider with CNAME flattening.
- **Frontend count and visibility.**
  - Up to **5 frontends per AGC**, billed per frontend-hour.
  - One frontend can carry many hostnames. (https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/understanding-pricing)
  - Public and private frontends can coexist on one AGC. (Components page.)
- **external-dns.** Docs mention syncing Ingress hostnames to Azure DNS with External DNS and workload identity. (https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-cert-manager-lets-encrypt-ingress-api)
- **Azure Front Door (documented pattern).**
  - Front Door's origin-security guide has an AGC tab. It shows an `HTTPRoute` that matches header `X-Azure-FDID` with type `Exact` against your Front Door ID. (https://learn.microsoft.com/en-us/azure/frontdoor/origin-security)
  - The same guide recommends IP filtering with the `AzureFrontDoor.Backend` service tag for public-IP origins.
  - **INFERENCE:** that NSG lock-down only works on AGC associations created on or after 2026-04-23, because only those enforce inbound NSG rules on 80/443 (see §7.2).
- **Front Door Private Link to AGC.** AGC is **not** in the list of supported Front Door Private Link origin types. That list has App Service, Blob Storage, storage static website, internal load balancers, API Management, Application Gateway and Container Apps (page `ms.date` 2025-09-24, re-fetched 2026-11-04). Front Door → private frontend over Private Link is **UNVERIFIED**. The private-ingress page names Front Door as an example of an upstream that inserts client-IP headers, and links to the Front Door Private Link page under "Related content". It never states that an AGC private frontend is a supported origin. (https://learn.microsoft.com/en-us/azure/frontdoor/private-link , https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/private-ingress)

---

## 7. Security

### 7.1 WAF (GA Nov 2025)

- **Two pieces are both required:**
  - An Azure `SecurityPolicy` child resource that references an Application Gateway WAF policy.
  - A Kubernetes `WebApplicationFirewallPolicy` targeting a Gateway, a Gateway listener (`sectionNames`) or an HTTPRoute.
  - Microsoft warns that with only the Azure side in place, the portal shows the policy as associated but **no traffic is inspected**. (https://learn.microsoft.com/en-us/azure/web-application-firewall/ag/waf-application-gateway-for-containers-overview)
- **Rules.**
  - Managed rules: **Default Rule Set 2.1 only**, not CRS. Bot Manager 1.0 and 1.1 are supported; 0.1 is not.
  - Custom rules are supported. The GA announcement explicitly includes "rate limiting custom rules".
  - Sources: same page, and https://azure.microsoft.com/updates?id=525419
- **Not supported on AGC WAF:**
  - JavaScript challenge and CAPTCHA actions on Bot Manager rules.
  - Custom block response (feature request open: https://github.com/Azure/AKS/issues/5719).
  - The **XFF variable in custom rules**.
  - The HTTP DDoS ruleset.
  - Security Copilot.
  - A WAF policy in a different region or subscription.
  - DRS 2.2 (requested: https://github.com/Azure/AKS/issues/5990).
- **Generic WAF v2 behaviour.**
  - Custom rules `IPMatch` on `RemoteAddr` (IPv4) with action Allow, Block or Log, plus geomatch. (https://learn.microsoft.com/en-us/azure/web-application-firewall/ag/custom-waf-rules-overview)
  - Rate-limit rules use a sliding window and group by `ClientAddr`, `GeoLocation`, `None`, or XFF-based variants. (https://learn.microsoft.com/en-us/azure/web-application-firewall/ag/rate-limiting-overview)
  - **INFERENCE:** XFF-based grouping is unavailable on AGC, given the no-XFF limitation.
- **Billing.** WAF moves every meter to the higher WAF rates (§10).

### 7.2 IP restrictions and client IP

- **NSG on the association subnet.**
  - Microsoft's recommended answer to "IP access restrictions" is to "use network security groups to restrict inbound traffic". (https://github.com/Azure/AKS/issues/5837, 2026-06-24)
  - Associations **created on or after 2026-04-23** fully enforce inbound and outbound NSG rules. The AzureLoadBalancer service tag and outbound traffic to the pod ranges must stay allowed.
  - Associations created earlier **always allow 80/443** regardless of NSG rules. Recreating an association makes it subject to the new model.
  - Source: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/application-gateway-for-containers-components
- **WAF custom rules** (Gateway API only): see §7.1.
- **Private frontends**: preview, see §8.
- **No per-route source-IP match.** Neither Gateway API nor `IngressExtension` has one; this follows from the API specification and Gateway API v1.6.2.
- **Client IP.** AGC adds `x-forwarded-for` (client IP, appended through proxies), `x-forwarded-proto` and `x-request-id` to every request. The access log records `clientIp`. Behind a firewall or NVA doing SNAT, the original client IP is lost. (Components page; https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/private-ingress)

### 7.3 TLS, mTLS and certificates

- **Frontend TLS.**
  - Certificates are Kubernetes Secrets referenced from Gateway `certificateRefs` or Ingress `spec.tls`.
  - RSA and/or ECDSA are supported, with at most two certificates per host.
  - Sources: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/ecdsa-rsa-certificates , release notes 0.6.1.
- **Key Vault.**
  - "Direct certificate upload and reference to a certificate in Azure Key Vault isn't available"; certificates "can't [be mounted] from external volumes".
  - The Secrets Store CSI driver is not supported for AGC certificates; certificates must first be synced to Kubernetes Secrets.
  - Source: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/migrate-from-agic-to-agc. See conflict C2.
- **TLS policy.**
  - Two predefined policies exist, `2023-06` (the default) and `2023-06-S`, and they currently enforce the same cipher set.
  - That set is TLS 1.2 and 1.3; `TLS_AES_256_GCM_SHA384`, `TLS_AES_128_GCM_SHA256` and ECDHE-ECDSA or ECDHE-RSA AES-GCM 128/256; curves P-384 and P-256.
  - Policies are selected per Gateway listener with `FrontendTLSPolicy`. Ingress always uses `2023-06`.
  - The FAQ answers "Can I configure TLS protocol versions?" with "No".
  - Sources: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/tls-policy , FAQ.
- **Frontend mTLS** (GA Sep 2024): `FrontendTLSPolicy.default.verify.caCertificateRef`. (https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-frontend-mtls-gateway-api)
- **Client certificate forwarding.** The validated client certificate cannot be forwarded to the backend: "The ability to inject server variables (in this case mTLS cert) is not currently available" (2026-05-14). Header rewrites support static values only. (https://github.com/Azure/AKS/issues/5549)
- **Backend TLS and mTLS.** AGC `BackendTLSPolicy` handles SNI, CA, SAN and client certificate. (https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-backend-mtls-gateway-api)
- **Backend TLS for Ingress.** `IngressExtension` sets `protocol: HTTPS` and `trustedRootCertificate`. (https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-end-to-end-tls-ingress-api)
- **Istio mesh.** The service-mesh extension (GA May 2026) automates mTLS to sidecar-injected pods. It is Gateway API only and does not support ambient mode. (https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/service-mesh-integration)
- **FIPS 140-2 mode** is available on request through a support case. (FAQ.)

### 7.4 Authentication

- **JWT validation only**, through `AuthPolicy` (preview, 2026-11-03, ALB Controller 1.13).
- External authorization services, OIDC sign-in, SAML and WS-Federation are explicitly out of scope.
- No basic auth is documented anywhere.
- Source: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/jwt-validation

---

## 8. Traffic management details

- **Timeouts.** Source: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/application-gateway-for-containers-components
  - Defaults:
    - Request timeout: 60 s, enforced even while data streams. Set it to `0s` for long downloads or SSE.
    - HTTP idle timeout: 5 min.
    - Stream idle timeout: 5 min.
    - Upstream connect timeout: 5 s.
  - Precedence: HTTPRoute `timeouts.request` and `timeouts.backendRequest`, then `RoutePolicy` `routeTimeout`, then the defaults.
  - For Ingress, use `IngressExtension.backendSettings[].timeouts.requestTimeout` (API specification).
- **Retries.** "Automatic retries" are listed as a feature, and the "Backend Connection Timeouts" metric counts AGC-initiated retries. The retry policy (conditions, count) is **undocumented and not configurable**. (https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/overview , https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/application-gateway-for-containers-metrics)
- **Connection draining** is not configurable. On scale-in, connections drain for 5 minutes; on pod removal or an unhealthy probe, connections persist until the client disconnects. (Migration page; https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/scaling-zone-resiliency)
- **Session affinity** is cookie-based only.
  - `managed-cookie` uses cookie `AGCAffinity` for 86,400 s. `application-cookie` needs an explicit `cookieName` and `cookieDuration`.
  - Configure it with `RoutePolicy` (Gateway) or `IngressExtension.backendSettings[].sessionAffinity` (Ingress).
  - The load-balancing compatibility table marks session affinity "Yes" only for Ring Hash, and "No" for Round Robin, Least Request and Load Aware. How that squares with affinity on the default round-robin strategy is undocumented (**UNVERIFIED**).
  - Sources: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/session-affinity , https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/load-balancing-strategies
- **Rewrites.**
  - Request and response header set/add/remove use static values; the `Host` header cannot be modified, so use URLRewrite `hostname` instead.
  - URL rewrite supports hostname and path (prefix or full). There are no regex capture groups.
  - Sources: header-rewrite how-tos (Gateway and Ingress), URL-rewrite how-tos, and the migration-utility issue text (https://github.com/Azure/Application-Gateway-for-Containers-Migration-Utility/blob/main/resources/nginx_issues.go).
- **Redirects.**
  - Gateway API `RequestRedirect` supports scheme, hostname, path (full or prefix) and port.
  - Status codes 301 and 302 are documented, and 307/308 since 1.11.1. Upstream v1.6.2 allows 301, 302, 303, 307 and 308; **303 on AGC is UNVERIFIED**.
  - **There is no automatic HTTP→HTTPS redirect**: you need an explicit HTTPRoute on the :80 listener. By contrast, ingress-nginx redirects with 308 by default when TLS is enabled. (https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-url-redirect-gateway-api , https://kubernetes.github.io/ingress-nginx/user-guide/nginx-configuration/annotations/#server-side-https-enforcement-through-redirect)
- **Traffic splitting** uses `backendRefs[].weight`. (https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-traffic-splitting-gateway-api)
- **Request mirroring** uses the `RequestMirror` filter with `percent` or `fraction`, and mirrors 100% by default. (https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-request-mirroring-gateway-api)
- **CORS** uses the HTTPRoute `CORS` filter (GEP-1767), and the gateway answers preflight `OPTIONS` itself. (https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/cross-origin-resource-sharing)
- **gRPC** uses GRPCRoute and supports unary, client streaming, server streaming and bidirectional streaming. Health probes default to a TCP handshake. (https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/grpc)
- **WebSockets** need no configuration. After the upgrade, no rewrites apply. The default HTTP probe can mark a WebSocket backend unhealthy, so use a HealthCheckPolicy. (https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/websockets)
- **Server-sent events** work over HTTP/1.1 and HTTP/2. Set `timeouts.request: 0s` or a `RoutePolicy` `routeTimeout: 0s`. The 5-minute idle timeout still applies, so send keep-alive comments. (https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/server-sent-events)
- **Protocols.**
  - Client to AGC: HTTP/2 is always enabled, and HTTP/1.1 is still negotiable.
  - AGC to backend: **always HTTP/1.1, except gRPC**, which uses HTTP/2.
  - Source: components page.
- **Backends.**
  - Only in-cluster Services backed by EndpointSlices are supported: "AGFC's data plane programs backends from EndpointSlices, ExternalName Services don't produce those" (Vyshnavi-MSFT, Microsoft "Contributor", 2026-05-26). **ExternalName and out-of-cluster backends are not supported.** Jack Stromberg wrote that proxying to external services "is not on our immediate roadmap; no ETA to provide" (2026-06-30). (https://github.com/Azure/AKS/issues/5776)
  - AGC returns **500** when no backend has endpoints, or when a backendRef is invalid or not permitted. (https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/troubleshooting-guide)
- **Load balancing** strategies are round robin, weighted round robin, least request, ring hash and load-aware (ORCA), plus slow start. (Load-balancing strategies page.)

---

## 9. Limits

Source: the "Azure Application Gateway for Containers limits" section of https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits (page updated 2026-09-29), unless noted.

| Resource | Limit |
|---|---|
| AGC resources | 1000 per subscription |
| Associations | 1 per AGC (subnet ≥ /24, about 256 addresses) |
| Frontends | 5 per AGC |
| Listeners per Gateway | 64 (enforced by Gateway API) |
| AGC references | 5 per ALB Controller |
| Certificate references | 100 per AGC |
| Listeners | 200 per AGC |
| Routes | 200 per AGC |
| Rules | 200 per AGC |
| Services | 100 per AGC |
| Endpoints | 5,000 per AGC |
| Resource and namespace names | 128 characters |
| Private endpoints per private frontend | 200 (components page) |
| Certificates per host | 2, one RSA and one ECDSA (release notes 0.6.1; ECDSA/RSA page) |
| Listener ports | 80 and 443 only (overview) |

**INFERENCE:** the 200 routes, 200 rules and 100 services per AGC can bind before CPU does on large ingress-nginx estates. Every Ingress path becomes a rule, so the inventory tool should count rules and services per future AGC.

---

## 10. Pricing

- **Model.** There are four hourly meters: AGC resource, frontend, association and capacity unit (CU). A CU is 2,500 persistent connections or 2.22 Mbps, whichever is more heavily used. Enabling WAF bills **every** meter at higher WAF rates. There are no upfront or termination costs. (https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/understanding-pricing)
- **Retail list prices.** These come from the Azure Retail Prices API, queried 2026-11-04, and exclude VAT. Standard meters have been in effect since 2024-04 or 2024-05; the WAF meters since 2025-12-01. (<https://prices.azure.com/api/retail/prices?currencyCode=EUR&$filter=serviceName%20eq%20%27Application%20Gateway%27%20and%20armRegionName%20eq%20%27francecentral%27%20and%20startswith(productName,%27Application%20Gateway%20for%20Containers%27)>)

| Meter (per hour) | France Central EUR | France Central EUR, WAF | West Europe EUR | West Europe EUR, WAF | East US 2 USD | East US 2 USD, WAF |
|---|---|---|---|---|---|---|
| AGC resource | 0.0189 | 0.0341 | 0.0197 | 0.0359 | 0.017 | 0.031 |
| Frontend | 0.0117 | 0.0206 | 0.0117 | 0.0206 | 0.010 | 0.018 |
| Association | 0.1347 | 0.2424 | 0.1400 | 0.2523 | 0.120 | 0.216 |
| Capacity unit | 0.0090 | 0.0162 | 0.0093 | 0.0171 | 0.008 | 0.014 |

- **Monthly fixed cost** for 1 AGC, 1 frontend and 1 association over 730 h (computed):
  - France Central: about **€120.67**, or **€216.88 with WAF**.
  - Each additional frontend: €8.54 (€15.04 with WAF).
  - Each CU running all month: €6.57 (€11.83 with WAF).
  - East US 2 matches Microsoft's own examples: $107.31 fixed before CUs.
- **WAF pricing** links to the same page. (https://learn.microsoft.com/en-us/azure/web-application-firewall/ag/waf-application-gateway-for-containers-overview)

---

## 11. Regional availability

The overview (updated 2026-11-03) lists 29 regions: Australia Central 2, Australia East, Australia Southeast, Brazil South, Canada Central, Canada East, Central India, Central US, East Asia, East US, East US 2, **France Central**, Germany West Central, Italy North, Japan West, Korea Central, North Central US, **North Europe**, Norway East, South Central US, Southeast Asia, Sweden Central, Switzerland North, UAE North, UK South, West US, West US 2, West US 3, **West Europe**. (https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/overview)

Regions such as France South, Germany North, Poland Central, Spain Central, UK West and Japan East are not listed. No sovereign-cloud regions are listed, although the Helm chart has a `cloudEnvironment` value for `AzureChinaCloud` and `AzureUSGovernment`. Sovereign-cloud availability is **UNVERIFIED**.

---

## 12. Known limitations and gotchas for ingress-nginx migrations

1. **HTTP/HTTPS only, on ports 80 and 443 only.** There is no TCP, UDP or TLS passthrough, so ingress-nginx `tcp-services` and `udp-services` have no AGC equivalent. Microsoft points to Azure Load Balancer for L4. (Overview; https://github.com/Azure/AKS/issues/5898)
2. **No static, bring-your-own or reserved IP.** Partners that allow-list by IP cannot be served directly. Apex domains cannot use Azure DNS alias records. (§6)
3. **Ingress is a second-class surface.** gRPC, WebSockets, CORS, WAF, frontend mTLS, TLS policy, weights, mirroring, header/query/method matching and JWT are Gateway API only (§5.3). Microsoft's migration tooling emits Gateway API only.
4. **No snippets, Lua, custom error pages or default-backend annotation.** Microsoft's migration utility marks `configuration-snippet`, `server-snippet` and `default-backend` as not supported. It also marks `canary-by-cookie` and non-cookie affinity (`ip_hash`) as not supported. (https://github.com/Azure/Application-Gateway-for-Containers-Migration-Utility/blob/main/resources/nginx_issues.go)
5. **No external auth (`auth-url`) and no basic auth.** JWT validation is preview only. (§7.4)
6. **Rate limiting and IP allow-lists move out of the Ingress.** Rate limiting goes to an Azure WAF policy, which needs WAF meters and works with Gateway API only. IP allow-lists go to the subnet NSG, which only works on associations created on or after 2026-04-23, or to WAF. This replaces per-Ingress `limit-*` and `whitelist-source-range`. (§7)
7. **Certificates must be Kubernetes Secrets.** There is no Key Vault reference and no CSI-mounted certificates. (§7.3)
8. **Header rewrites are static only.** There are no variables, for example no `ssl-client-cert` passthrough. (https://github.com/Azure/AKS/issues/5549)
9. **No ExternalName backends.** (https://github.com/Azure/AKS/issues/5776)
10. **No distributed tracing or OTLP.** On 2025-05-19 Microsoft said "No ETA to provide. This is not planned short-term." Correlation relies on `x-request-id` and `trackingId`. (https://github.com/Azure/AKS/issues/5026)
11. **Backends receive HTTP/1.1.** h2c backends were unsupported in the v1.2.1 conformance report.
12. **TLS options are fixed.** Only two predefined policies exist, TLS 1.2 is the minimum, and no custom ciphers can be set. (§7.3)
13. **No implicit HTTP→HTTPS redirect.** ingress-nginx's default 308 behaviour must be re-created explicitly. (§8)
14. **AKS add-on caveats.** The add-on is preview and pins controller 1.10.x or 1.11.x, which lacks features from 1.12 and 1.13. Helm and the add-on differ in namespace and identity. (§1, §2.3)
15. **Networking prerequisites.** Kubenet is not supported, and AGC must be in the same VNet as the cluster in every CNI mode. CNI Overlay adds restrictions: /24 subnet only, ALB Controller ≥ 1.7.9, no NVA hop. (§2.1)
16. **One ALB Controller per cluster** in practice: installing multiple controllers "isn't recommended or supported", and each controller can reference at most 5 AGC resources. (FAQ, limits)
17. **CRD ownership.** The Helm chart installs Gateway API CRDs by default, while AKS Managed Gateway API, used by the AGC add-on, app routing Gateway API and Istio add-on Gateway API, manages its own standard-channel bundle. How these interact is **UNVERIFIED** (§14 C13). Detect existing CRD owners before installing.
18. **WAF only inspects traffic once both resources exist.** Without the Kubernetes `WebApplicationFirewallPolicy`, the Azure side shows the WAF as associated but no traffic is inspected. (§7.1)
19. **Microsoft has a free competing converter.** The Azure/Application-Gateway-for-Containers-Migration-Utility (v1.0.0, 2026-01-28) is a read-only CLI that converts AGIC or ingress-nginx Ingresses into AGC Gateway API resources, with 30 supported NGINX annotations and a per-annotation report. Some of its messages are stale: it says `least_conn` has no AGC equivalent, while the AGC docs list least-request. (https://github.com/Azure/Application-Gateway-for-Containers-Migration-Utility)

---

## 13. Feature matrix

Legend: **yes** = documented and supported; **partial** = supported with notable restrictions or through a non-equivalent mechanism; **no** = not supported, or no mechanism exists in the API surface; **unknown** = sources silent or conflicting (UNVERIFIED). Minimum controller versions are Helm releases, and the add-on may lag (§1).

| Feature | agc (Gateway API) | agcIngress (Ingress API) |
|---|---|---|
| Path match Exact | **yes**: HTTPRoute `path.type: Exact`; Core conformance passed (v1.2.1 report). [src](https://github.com/kubernetes-sigs/gateway-api/blob/main/conformance/reports/v1.2.1/azure-application-gateway-for-containers/standard-v1.2.1-default-report.yaml) | **unknown**: `pathType: Exact` never shown; every AGC Ingress how-to uses `Prefix`. The overview's "prefix/exact match" is generic. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-multiple-site-hosting-ingress-api) |
| Path match PathPrefix | **yes**: HTTPRoute `path.type: PathPrefix`. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-path-header-query-string-routing-gateway-api) | **yes**: `pathType: Prefix` in all Ingress how-tos. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-multiple-site-hosting-ingress-api) |
| Path match RegularExpression | **yes**: `RegularExpression` (RE2) for path, headers and queryParams; since 1.4.12, also in GRPCRoute. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-path-header-query-string-routing-gateway-api) | **unknown**: no regex mechanism documented; `ImplementationSpecific` semantics undocumented; no regex field in `IngressExtension`. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/api-specification-kubernetes) |
| Header match | **yes**: `matches.headers`, Exact or RegularExpression. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-path-header-query-string-routing-gateway-api) | **no**: neither the Ingress API nor `IngressExtension` has a match field. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/api-specification-kubernetes) |
| Query param match | **yes**: `matches.queryParams`, Exact or RegularExpression; Extended `HTTPRouteQueryParamMatching` passed. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-path-header-query-string-routing-gateway-api) | **no**: no field in Ingress or `IngressExtension`. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/api-specification-kubernetes) |
| Method match | **yes**: `matches.method`; Extended `HTTPRouteMethodMatching` passed. [src](https://github.com/kubernetes-sigs/gateway-api/blob/main/conformance/reports/v1.2.1/azure-application-gateway-for-containers/standard-v1.2.1-default-report.yaml) | **no**: no field in Ingress or `IngressExtension`. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/api-specification-kubernetes) |
| RequestHeaderModifier | **yes**: set, add or remove with static values only (no variables, see #5549); `Host` cannot be changed, so use URLRewrite hostname. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-header-rewrite-gateway-api) | **yes**: `IngressExtension` `rules[].rewrites[].type: RequestHeaderModifier`, per host; same `Host` restriction. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-header-rewrite-ingress-api) |
| ResponseHeaderModifier | **yes**: HTTPRoute filter; Extended `HTTPRouteResponseHeaderModification` passed. [src](https://github.com/kubernetes-sigs/gateway-api/blob/main/conformance/reports/v1.2.1/azure-application-gateway-for-containers/standard-v1.2.1-default-report.yaml) | **yes**: `IngressExtension` `rewrites[].type: ResponseHeaderModifier`, per host; in the API spec, with no how-to example. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/api-specification-kubernetes) |
| RequestRedirect (scheme, hostname, path, port, allowed status codes) | **yes**: scheme, hostname, path (ReplaceFullPath or ReplacePrefixMatch) and port are all conformance-tested. 301/302 documented; 307/308 since 1.11.1; 303 UNVERIFIED. In Gateway API v1.6.2, 303, 307 and 308 are Extended features, and AGC has no conformance report covering them. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/alb-controller-release-notes) [src](https://github.com/kubernetes-sigs/gateway-api/releases/tag/v1.6.2) | **partial**: `IngressExtension` `rules[].requestRedirect` {scheme, hostname, path, port, statusCode} applies to a whole host rule. 301/302 documented; 307/308 for Ingress UNVERIFIED. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-url-redirect-ingress-api) |
| HTTP to HTTPS redirect pattern | **yes**: explicit only. A Gateway with :80 and :443 listeners, plus an HTTPRoute with `sectionName` set to the :80 listener and a RequestRedirect `scheme: https` (301 in docs). Nothing is automatic. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-url-redirect-gateway-api) | **partial**: two Ingress objects: an HTTPS one with `tls`, and an HTTP one whose `IngressExtension` sets `requestRedirect.scheme: https`. Nothing is automatic. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/migrate-from-agic-to-agc) |
| URLRewrite hostname | **yes**: `URLRewrite.hostname`; Extended `HTTPRouteHostRewrite` passed. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-url-rewrite-gateway-api) | **yes**: `IngressExtension` `rewrites[].urlRewrite.hostname`. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/api-specification-kubernetes) |
| URLRewrite path (ReplaceFullPath, ReplacePrefixMatch) | **yes**: both types; `HTTPRoutePathRewrite` passed and its test covers both. No regex capture groups. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-url-rewrite-gateway-api) | **yes**: `IngressExtension` `urlRewrite.path`. ReplacePrefixMatch is documented; ReplaceFullPath appears in the API enum without an example. Per host rule. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-url-rewrite-ingress-api) |
| RequestMirror (including percentage) | **yes**: `RequestMirror` with `percent` or `fraction` (default 100%) since 1.12.1. Multiple mirrors per rule UNVERIFIED. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-request-mirroring-gateway-api) | **no**: no mirror field in `IngressExtension`. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/api-specification-kubernetes) |
| Weighted backendRefs (traffic splitting) | **yes**: `backendRefs[].weight` (weighted round robin). [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-traffic-splitting-gateway-api) | **no**: no weights in the Ingress API or `IngressExtension`. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/api-specification-kubernetes) |
| Timeouts (request, backendRequest) | **yes**: HTTPRoute `timeouts.request` and `timeouts.backendRequest` since 1.11.1, taking precedence over RoutePolicy `routeTimeout`. Default 60 s; `0s` disables. Idle (5 min) and connect (5 s) are fixed. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/application-gateway-for-containers-components) | **partial**: `IngressExtension.backendSettings[].timeouts.requestTimeout`, per Service; no separate backend timeout. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/api-specification-kubernetes) |
| Retries | **partial**: built-in "automatic retries" with undocumented semantics and no configuration; HTTPRoute `retry` (experimental) is not documented. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/overview) | **partial**: same platform behaviour, not configurable. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/overview) |
| Session persistence or affinity | **yes**: AGC `RoutePolicy.default.sessionAffinity`, either `managed-cookie` (`AGCAffinity`, 86,400 s) or `application-cookie`. Not through Gateway API `sessionPersistence`. Cookie only. How it combines with the default round-robin strategy is UNVERIFIED (§8). [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/session-affinity) | **yes**: `IngressExtension.backendSettings[].sessionAffinity`, same options and same caveat. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/session-affinity) |
| CORS | **yes**: HTTPRoute `CORS` filter (GEP-1767) since 1.11.1; the gateway answers preflights. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/cross-origin-resource-sharing) | **no**: "CORS is only supported when using the Gateway API". [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/cross-origin-resource-sharing) |
| External authentication | **no**: no ext-authz or `auth-url` equivalent. Only JWT validation through `AuthPolicy` (v1alpha1, preview, 1.13); external authorization is "outside the scope". [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/jwt-validation) | **no**: "JWT validation is only supported with Gateway API. Ingress API is not supported." `AuthPolicy` targets also exclude Ingress. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/jwt-validation) |
| Basic authentication | **no**: no mechanism in the API specification or the feature list. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/api-specification-kubernetes) | **no**: no mechanism in the API specification or the feature list. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/api-specification-kubernetes) |
| BackendTLSPolicy or backend HTTPS | **yes**: AGC's own `alb.networking.azure.io/v1` BackendTLSPolicy on a Service: SNI, CA, SAN, and `clientCertificateRef` for backend mTLS. The upstream `gateway.networking.k8s.io` BackendTLSPolicy is UNVERIFIED. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-backend-mtls-gateway-api) | **partial**: `backendSettings[].ports[].protocol: HTTPS` plus `trustedRootCertificate`; `IngressExtension` has no client-certificate field. The AGIC migration page says AGC's `BackendTLSPolicy` works "in both Gateway and Ingress API" for CA trust, but backend mTLS for Ingress through its `clientCertificateRef` is UNVERIFIED (C18). [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-end-to-end-tls-ingress-api) [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/migrate-from-agic-to-agc) |
| gRPC (GRPCRoute) | **yes**: GRPCRoute with unary and all streaming modes (GA Sep 2024). [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/grpc) | **no**: "no support is offered for gRPC in Ingress API". [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/grpc) |
| WebSockets and HTTP upgrade | **yes**: automatic, no configuration. Rewrites don't apply after the upgrade; use a HealthCheckPolicy for the probe. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/websockets) | **no**: "WebSockets are only supported when using Gateway API". [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/websockets) |
| TLS termination with Kubernetes secrets | **yes**: HTTPS listener `tls.mode: Terminate` with Secret `certificateRefs`; RSA and/or ECDSA, at most 2 per host. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-ssl-offloading-gateway-api) | **yes**: `spec.tls[].secretName`. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-ssl-offloading-ingress-api) |
| TLS certificates from Azure Key Vault | **no**: no direct Key Vault reference and no Secrets Store CSI mount; sync to a Secret first. The AKS comparison page says "Yes" (conflict C2). [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/migrate-from-agic-to-agc) | **no**: same restriction. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/migrate-from-agic-to-agc) |
| cert-manager integration | **yes**: HTTP-01 `gatewayHTTPRoute` solver (`config.enableGatewayAPI=true`; docs use cert-manager v1.19.3). [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-cert-manager-lets-encrypt-gateway-api) | **yes**: HTTP-01 Ingress solver with `ingressClassName: azure-alb-external` and the ALB annotations in `ingressTemplate`. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-cert-manager-lets-encrypt-ingress-api) |
| Frontend client certificate validation (mTLS) | **yes**: `FrontendTLSPolicy.default.verify.caCertificateRef` (+ `subjectAltNames`) per listener (GA Sep 2024). The validated certificate can't be forwarded to the backend. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-frontend-mtls-gateway-api) | **no**: no documented mechanism; FrontendTLSPolicy targets Gateway listeners only. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/api-specification-kubernetes) |
| TLS passthrough (TLSRoute) | **no**: listeners are HTTP/HTTPS only; TLSRoute is not in the supported list. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/overview) | **no**: HTTP/HTTPS only. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/overview) |
| TCPRoute and UDPRoute | **no**: "This does not include TCPRoute support" (Microsoft, 2026-11-03); use Azure Load Balancer for L4. [src](https://github.com/Azure/AKS/issues/5898) | **no**: ports 80/443 HTTP(S) only; no `tcp-services`/`udp-services` equivalent. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/migrate-from-agic-to-agc) |
| TLS protocol and cipher options | **partial**: `FrontendTLSPolicy` predefined `2023-06` or `2023-06-S` per listener; both are TLS 1.2/1.3 with the same 6 ciphers. No custom settings. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/tls-policy) | **no**: fixed default `2023-06`. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/tls-policy) |
| Rate limiting (mechanism) | **partial**: only through Azure WAF rate-limit custom rules (WAF meters, sliding window, grouped by client IP, geo or none); no XFF variable on AGC. [src](https://azure.microsoft.com/updates?id=525419) [src](https://learn.microsoft.com/en-us/azure/web-application-firewall/ag/rate-limiting-overview) | **no**: WAF can't be attached to Ingress. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/migrate-from-agic-to-agc) |
| IP allow and deny lists (mechanism) and client IP preservation | **partial**: association-subnet NSG (enforced only for associations created on or after 2026-04-23; Microsoft-recommended), WAF `IPMatch` custom rules, or a private frontend (preview). No per-route source match. Client IP arrives in `X-Forwarded-For`. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/application-gateway-for-containers-components) | **partial**: subnet NSG, which applies to the whole AGC, or a private frontend (preview); no WAF. Client IP arrives in `X-Forwarded-For`. [src](https://github.com/Azure/AKS/issues/5837) |
| WAF (mechanism) | **yes**: `WebApplicationFirewallPolicy` on a Gateway, listener or HTTPRoute, plus an Azure `SecurityPolicy`. DRS 2.1, Bot Manager 1.0/1.1, custom and rate-limit rules; no custom block response (GA Nov 2025). [src](https://learn.microsoft.com/en-us/azure/web-application-firewall/ag/waf-application-gateway-for-containers-overview) | **no**: "Not supported" for the Ingress API. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/migrate-from-agic-to-agc) |
| Custom error pages and default backend | **partial**: no custom error pages; a default backend is a catch-all `PathPrefix /` rule (Microsoft utility's advice). AGC returns 500 when no endpoints exist. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/troubleshooting-guide) [src](https://github.com/Azure/Application-Gateway-for-Containers-Migration-Utility/blob/main/resources/nginx_issues.go) | **unknown**: no error-page field; `spec.defaultBackend` handling undocumented. Microsoft's utility marks the `default-backend` annotation as unsupported. [src](https://github.com/Azure/Application-Gateway-for-Containers-Migration-Utility/blob/main/resources/nginx_issues.go) |
| Request body size limit | **unknown**: no proxy body-size limit or setting is documented for AGC; WAF request-size settings are documented only for Application Gateway. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/application-gateway-for-containers-components) | **unknown**: same. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/application-gateway-for-containers-components) |
| Static public IP or reuse of an existing IP | **no**: generated FQDN on anycast IPs; `GatewayStaticAddresses` unsupported; BYO IP "will not ship this calendar year" (2026-08-26). [src](https://github.com/Azure/AKS/issues/5630) | **no**: same. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/faq) |
| Internal (private) load balancer | **partial**: preview `gatewayClassName: azure-alb-internal`, reachable only through Private Link private endpoints, not through an internal load-balancer IP. Requires an association created on or after 2026-04-23, ALB Controller ≥ 1.13 and REST API 2026-03-01. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/private-ingress) | **partial**: same preview, with class `azure-alb-internal` set through the `kubernetes.io/ingress.class` annotation according to the doc. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/private-ingress) |
| Load balancers per Gateway | **yes**: each Gateway gets 1 frontend (FQDN) on a shared AGC data plane; at most 5 frontends per AGC and 5 AGC per controller. ListenerSets share their parent Gateway's frontend. [src](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits) | **yes**: Ingresses get frontends on a shared AGC. The FAQ says a frontend is unique to one Ingress, but the how-tos share one frontend across Ingresses through `alb-frontend` (conflict C3). [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/faq) |
| Cross-namespace routes (ReferenceGrant, allowedRoutes) | **yes**: `allowedRoutes` Same, All or Selector; ReferenceGrant for cross-namespace backends and Secrets (Core conformance); ListenerSet with `allowedListeners` since 1.13. AuthPolicy is same-namespace only. [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/multi-team-shared-gateway) | **partial**: Ingress backends are namespace-local. Only the ApplicationLoadBalancer can live in another namespace (`alb-namespace`). [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-multiple-site-hosting-ingress-api) |
| Access logs, metrics, tracing | **partial**: Azure Monitor access log (`TrafficControllerAccessLog`: clientIp, timings, TLS, `trackingId` = `x-request-id`), firewall log and metrics; ALB Controller Prometheus metrics on :8001. No OTLP or tracing ("not planned short-term"). [src](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/diagnostics) | **partial**: the same platform logs and metrics; no tracing. [src](https://github.com/Azure/AKS/issues/5026) |

---

## 14. Conflicts and gaps (UNVERIFIED items)

- **C1 Request timeouts.**
  - The AGIC migration page says "Request timeouts are nonconfigurable".
  - The same page's table, the components page, the SSE page and release notes 1.11.1 document `RoutePolicy`, `IngressExtension` and HTTPRoute timeouts.
  - Treat timeouts as configurable; the migration text is stale.
- **C2 Key Vault.**
  - The AKS ingress comparison page (2026-06-05) says AGC has "Azure Key Vault stored SSL certificates: Yes" and "Integration with Azure Key Vault".
  - The AGC migration page (updated 2026-11-03) says Key Vault references are not available and the CSI driver is not supported.
  - The product doc (no) should win. (https://learn.microsoft.com/en-us/azure/aks/concepts-network-ingress)
- **C3 Frontend sharing.**
  - The FAQ says "A frontend should be unique to a single Ingress or Gateway resource".
  - The Ingress URL-redirect how-to (managed mode) and the URL-rewrite how-to (BYO) bind several Ingresses to one `alb-frontend`.
  - Behaviour when Ingresses share a frontend is unclear.
- **C4 Apex DNS.** The migration page suggests "an alias record" for apex domains, but Azure DNS alias targets exclude AGC and GitHub #5406 asking for this is still open.
- **C5 ReferenceGrant version.** The overview says "Currently supports version v1alpha1". The Gateway API v1.6 CRD bundles serve ReferenceGrant only as `v1` and `v1beta1` (storage version `v1beta1`; checked in the v1.6.1 standard and v1.6.0 experimental bundles), with no `v1alpha1` or `v1alpha2`. This is likely a stale doc line, and the version AGC actually honours is unknown.
- **C6 Conformance.**
  - AGC claims to implement Gateway API v1.6, but its latest conformance report is for v1.2.1 (ALB 1.7.9). The v1.3.0 to v1.7 report folders contain no AGC entry, so AGC is absent from the v1.6 implementations page.
  - The status of `GatewayHTTPListenerIsolation`, `HTTPRouteParentRefPort`, `HTTPRouteBackendRequestHeaderModification` and h2c at 1.13 is unknown.
- **C7 Redirect codes.** The Gateway and Ingress redirect how-tos (2024 and 2025) list only 301 and 302. Release notes 1.11.1 add 307 and 308 without saying which API. 303 is never mentioned.
- **C8 Ingress class.** The Ingress how-tos use `ingressClassName: azure-alb-external`. The private-ingress page says to use the `kubernetes.io/ingress.class` annotation. Whether an `IngressClass` object is created is undocumented.
- **C9 BackendTLSPolicy.** Whether ALB Controller 1.13 honours the upstream `gateway.networking.k8s.io/v1` BackendTLSPolicy (standard in v1.6.2) is undocumented. The kind name collides with AGC's `alb.networking.azure.io/v1` BackendTLSPolicy.
- **C10 CNI Overlay minimum version.** Release notes 1.5.2 say "Support for Azure CNI Overlay", but the container-networking page requires 1.7.9 or later. Use 1.7.9, the later and GA-era requirement.
- **C11 Undocumented behaviours.** Retry semantics, request and header size limits, Ingress `pathType: Exact` and `ImplementationSpecific`, Ingress `spec.defaultBackend`, and multiple request mirrors per rule are all undocumented.
- **C12 Front Door Private Link to an AGC private frontend.** It is not listed as a supported Private Link origin (Front Door page `ms.date` 2025-09-24), although the AGC private-ingress page links to that page under "Related content". Private ingress itself has been in preview only since 2026-11-03.
- **C13 CRD ownership.** The Helm chart installs Gateway API CRDs by default, which conflicts with the AKS Managed Gateway API bundle (v1.5.1 on AKS 1.36, v1.6.1 on 1.37+). Coexistence rules are not documented.
- **C14 Add-on feature gaps.** The add-on feature gaps in §1 are an INFERENCE from the add-on version pinning table, not a Microsoft statement.
- **C15 Stale migration-utility message.** Microsoft's migration utility says `least_conn` and similar algorithms are "not available", while the AGC docs list least-request and ring-hash.
- **C16 Custom TLS policy wording.** The TLS policy page mentions that "a custom TLS policy allows you to configure the minimum protocol version, ciphers…", but only predefined policies exist. The FAQ and the migration page say TLS versions and custom policies are not configurable.
- **C17 Not researched.** SLA figures and sovereign-cloud availability were not researched.
- **C18 BackendTLSPolicy and Ingress.**
  - The AGIC migration page says: "In both Gateway and Ingress API, you can apply the `BackendTLSPolicy` custom resource" to establish backend CA trust.
  - The custom health probe page ties `BackendTLSPolicy` to the Gateway API and `IngressExtension` HTTPS settings to the Ingress API. The only Ingress end-to-end TLS how-to uses `IngressExtension`.
  - Whether `BackendTLSPolicy`, including `clientCertificateRef` for backend mTLS, applies to Services behind an Ingress is unknown. (https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/migrate-from-agic-to-agc , https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/custom-health-probe)
- **C19 Gateway status address type.** The Gateway how-tos show `status.addresses[].type` as `Hostname` (9 pages) or `IPAddress` (8 pages), always with the generated FQDN as the value. Which one the controller writes is undocumented.

---

## 15. Sources

**Microsoft Learn, AGC.** Read from https://github.com/MicrosoftDocs/azure-docs/tree/main/articles/application-gateway/for-containers on 2026-11-04; live pages spot-checked.

- Overview (2026-11-03): https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/overview
- Components (2026-11-02): https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/application-gateway-for-containers-components
- ALB Controller release notes (2026-11-03): https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/alb-controller-release-notes
- API specification for Kubernetes (2026-11-03): https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/api-specification-kubernetes
- FAQ (2026-07-07): https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/faq
- Migrate from AGIC (2026-10-27): https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/migrate-from-agic-to-agc
- Private ingress (2026-10-27) and how-to (2026-11-03): https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/private-ingress , https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-private-ingress-gateway-api
- WAF on AGC (2025-11-10): https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/web-application-firewall ; WAF how-to: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-waf-gateway-api
- TLS policy (2026-09-22): https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/tls-policy
- Session affinity: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/session-affinity
- Load-balancing strategies: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/load-balancing-strategies
- Custom health probe: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/custom-health-probe
- CORS concept and how-to (2026-06-24): https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/cross-origin-resource-sharing , https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-cors-gateway-api
- JWT validation (2026-10-26): https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/jwt-validation
- MCP gateway: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/mcp-gateway
- Multi-team shared gateway (ListenerSet): https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/multi-team-shared-gateway , https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-multi-team-listeners-gateway-api
- gRPC: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/grpc
- WebSockets: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/websockets
- Server-sent events: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/server-sent-events
- Gateway API how-tos:
  - Routing: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-path-header-query-string-routing-gateway-api
  - Header rewrite: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-header-rewrite-gateway-api
  - URL rewrite: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-url-rewrite-gateway-api
  - URL redirect: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-url-redirect-gateway-api
  - Traffic splitting: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-traffic-splitting-gateway-api
  - Request mirroring: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-request-mirroring-gateway-api
  - SSL offloading: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-ssl-offloading-gateway-api
  - End-to-end TLS: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-end-to-end-tls-gateway-api
  - Backend mTLS: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-backend-mtls-gateway-api
  - Frontend mTLS: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-frontend-mtls-gateway-api
  - cert-manager: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-cert-manager-lets-encrypt-gateway-api
- Ingress API how-tos:
  - Multi-site hosting: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-multiple-site-hosting-ingress-api
  - Header rewrite: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-header-rewrite-ingress-api
  - URL rewrite: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-url-rewrite-ingress-api
  - URL redirect: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-url-redirect-ingress-api
  - SSL offloading: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-ssl-offloading-ingress-api
  - End-to-end TLS: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-end-to-end-tls-ingress-api
  - cert-manager: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-cert-manager-lets-encrypt-ingress-api
- ECDSA/RSA certificates: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/ecdsa-rsa-certificates
- Container networking (2026-09-23): https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/container-networking
- Scaling and zone resiliency: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/scaling-zone-resiliency
- Diagnostics, metrics and Prometheus: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/diagnostics , https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/application-gateway-for-containers-metrics , https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/prometheus-grafana
- Troubleshooting: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/troubleshooting-guide
- Service-mesh integration: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/service-mesh-integration
- Pricing explainer: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/understanding-pricing
- Quickstarts:
  - Add-on: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/quickstart-deploy-application-gateway-for-containers-alb-controller-addon
  - Helm: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/quickstart-deploy-application-gateway-for-containers-alb-controller-helm
  - Helm chart reference: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/alb-controller-helm-chart
  - BYO deployment: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/quickstart-create-application-gateway-for-containers-byo-deployment
  - Managed deployment: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/quickstart-create-application-gateway-for-containers-managed-by-alb-controller
- Limits (page updated 2026-09-29): https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits

**Microsoft Learn, other services**

- WAF on AGC overview (2026-08-21): https://learn.microsoft.com/en-us/azure/web-application-firewall/ag/waf-application-gateway-for-containers-overview
- WAF custom rules: https://learn.microsoft.com/en-us/azure/web-application-firewall/ag/custom-waf-rules-overview
- WAF rate limiting: https://learn.microsoft.com/en-us/azure/web-application-firewall/ag/rate-limiting-overview
- Front Door origin security, AGC tab: https://learn.microsoft.com/en-us/azure/frontdoor/origin-security
- Front Door Private Link origins (`ms.date` 2025-09-24): https://learn.microsoft.com/en-us/azure/frontdoor/private-link
- Azure DNS alias records (2026-10-05): https://learn.microsoft.com/en-us/azure/dns/dns-alias
- AKS Managed Gateway API (2026-09-10): https://learn.microsoft.com/en-us/azure/aks/managed-gateway-api
- AKS ingress concepts (2026-06-05): https://learn.microsoft.com/en-us/azure/aks/concepts-network-ingress
- AKS application routing, with the ingress-nginx retirement notice (include dated 2026-10-14): https://learn.microsoft.com/en-us/azure/aks/app-routing , https://learn.microsoft.com/en-us/azure/aks/app-routing-nginx-to-gateway-api-migration

**Azure Updates** (via https://www.microsoft.com/releasecommunications/api/v2/azure/<id>)

- GA: https://azure.microsoft.com/updates?id=general-availability-application-gateway-for-containers
- gRPC and frontend mTLS GA: https://azure.microsoft.com/updates?id=grpc-and-frontend-mutual-authentication-available-on-application-gateway-for-containers
- WebSocket GA: https://azure.microsoft.com/updates?id=475194
- CNI Overlay GA: https://azure.microsoft.com/updates?id=500991
- WAF GA: https://azure.microsoft.com/updates?id=525419
- Slow start GA: https://azure.microsoft.com/updates?id=525893
- AKS add-on preview: https://azure.microsoft.com/updates?id=555603
- Add-on + AKS Automatic preview: https://azure.microsoft.com/updates?id=558403
- Istio integration GA: https://azure.microsoft.com/updates?id=564714
- Inference gateway preview: https://azure.microsoft.com/updates?id=566516
- Private ingress preview: https://azure.microsoft.com/updates?id=576393
- JWT validation preview: https://azure.microsoft.com/updates?id=576382
- MCP gateway preview: https://azure.microsoft.com/updates?id=576388

**Pricing and registry**

- Azure Retail Prices API (queried 2026-11-04): <https://prices.azure.com/api/retail/prices?currencyCode=EUR&$filter=serviceName%20eq%20%27Application%20Gateway%27%20and%20armRegionName%20eq%20%27francecentral%27%20and%20startswith(productName,%27Application%20Gateway%20for%20Containers%27)>
- Pricing page: https://azure.microsoft.com/pricing/details/application-gateway/
- MCR tags: https://mcr.microsoft.com/v2/application-lb/charts/alb-controller/tags/list , https://mcr.microsoft.com/v2/application-lb/images/alb-controller/tags/list

**Gateway API (kubernetes-sigs)**

- Releases: https://github.com/kubernetes-sigs/gateway-api/releases
- v1.6.2 HTTPRoute types (redirect codes 301/302/303/307/308; `retry`, `sessionPersistence` and `ExternalAuth` experimental; CORS standard): https://github.com/kubernetes-sigs/gateway-api/blob/v1.6.2/apis/v1/httproute_types.go
- AGC conformance report v1.2.1: https://github.com/kubernetes-sigs/gateway-api/blob/main/conformance/reports/v1.2.1/azure-application-gateway-for-containers/standard-v1.2.1-default-report.yaml
- Conformance report folders (no AGC entry from v1.3.0 to v1.7): https://github.com/kubernetes-sigs/gateway-api/tree/main/conformance/reports ; how implementation lists are generated: https://gateway-api.sigs.k8s.io/docs/conformance/
- v1.6 implementations page: https://gateway-api.sigs.k8s.io/docs/implementations/versions/v1.6/
- v1.6.1 standard CRD bundle (ReferenceGrant served as `v1` and `v1beta1`; TCPRoute, TLSRoute and UDPRoute are `v1` Standard kinds): https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.6.1/standard-install.yaml
- v1.6.2 release (303/307/308 redirects are Extended): https://github.com/kubernetes-sigs/gateway-api/releases/tag/v1.6.2 ; v1.7.0 release (`retry` promoted to Standard): https://github.com/kubernetes-sigs/gateway-api/releases/tag/v1.7.0

**Azure/AKS GitHub issues** (Microsoft statements)

- #5630 static IP: https://github.com/Azure/AKS/issues/5630
- #5739 private frontend: https://github.com/Azure/AKS/issues/5739
- #5549 client certificate header: https://github.com/Azure/AKS/issues/5549
- #5837 IP restrictions via NSG: https://github.com/Azure/AKS/issues/5837
- #5406 DNS alias: https://github.com/Azure/AKS/issues/5406
- #5898 TCPRoute: https://github.com/Azure/AKS/issues/5898
- #5026 OTLP: https://github.com/Azure/AKS/issues/5026
- #5776 ExternalName: https://github.com/Azure/AKS/issues/5776
- #5411 WAF + Ingress: https://github.com/Azure/AKS/issues/5411
- #5719 custom block response: https://github.com/Azure/AKS/issues/5719
- #5990 DRS 2.2: https://github.com/Azure/AKS/issues/5990

**Microsoft tooling and blog**

- AGC Migration Utility (v1.0.0, 2026-01-28; README states Gateway API output and a read-only operation): https://github.com/Azure/Application-Gateway-for-Containers-Migration-Utility ; NGINX issue codes: https://github.com/Azure/Application-Gateway-for-Containers-Migration-Utility/blob/main/resources/nginx_issues.go
- Microsoft Tech Community, "After Ingress NGINX: migrating to Application Gateway for Containers" (2026-03-17; secondary source): https://techcommunity.microsoft.com/t5/apps-on-azure-blog/after-ingress-nginx-migrating-to-application-gateway-for/ba-p/4503110

**ingress-nginx (comparison only)**

- Annotations, default 308 HTTPS redirect: https://kubernetes.github.io/ingress-nginx/user-guide/nginx-configuration/annotations/#server-side-https-enforcement-through-redirect

---

## Verification log (2026-11-04)

**Method.** Each claim was checked against local copies of the primary sources taken on 2026-11-04:

- the MicrosoftDocs `for-containers` articles and includes, the WAF docs and the AKS docs;
- the Azure Updates and Azure Retail Prices JSON;
- the Gateway API v1.6.2 source, the v1.6.1 standard and v1.6.0 experimental CRD bundles, the release notes and the conformance folder listings;
- the migration utility repository and the ingress-nginx annotations page.

All 15 allowed online fetches were used:

- the 2 MCR tag lists (chart and image);
- the Azure/AKS issue list for the `app-gateway-for-containers` label;
- the comments on #5630, #5898, #5837, #5549, #5776, #5026, #5411 and #5406;
- the Gateway API `conformance/reports/v1.3.0` folder;
- the Azure DNS alias, Front Door Private Link and Front Door origin-security pages (raw MicrosoftDocs).

**Claims checked: 349.**

- 82 feature-matrix cells.
- 10 status rows and 12 minimum-version rows.
- 11 CRD rows and statements, 7 annotation rows and 4 `IngressExtension` statements.
- 11 Gateway-only rows and statements.
- 15 limit rows and 28 price cells and computed totals.
- 3 regional statements, 19 gotchas and 17 conflicts.
- 130 other statements in the method notes and §§2, 3, 6 to 8 and 10.

18 claims were corrected in place (table below). The rest were confirmed, apart from the UNVERIFIED items listed at the end. In the feature matrix, 6 cells were edited and 76 stand as written. No yes, partial, no or unknown verdict changed.

**Confirmed as written (the claims the tool and the offer depend on):**

- The GatewayClass names `azure-alb-external` and `azure-alb-internal`, and the controller string `alb.networking.azure.io/alb-controller`.
- The five `alb.networking.azure.io/*` annotations. No other annotation appears in any AGC, AKS or WAF doc.
- Every CRD field listed in §4 and §5.2.
- The WAF requirements and limitations.
- The frontend FQDN format, anycast IPs, the 80/443-only ports and the NSG model dated 2026-04-23.
- The private-ingress requirements.
- The add-on version pinning and the ALB Controller 1.13.0 release data.
- All prices and limits, and the 29 regions.

**Corrections**

| # | Where | Old | New | Source |
|---|---|---|---|---|
| 1 | Method | AGC doc set of "68 files" | 66 Markdown/YAML files; 68 entries counting the `examples/` and `media/` folders | https://github.com/MicrosoftDocs/azure-docs/tree/main/articles/application-gateway/for-containers |
| 2 | §1 Conformance | The v1.6 implementations page "lists only implementations that passed Core conformance" | The v1.3.0 to v1.7 report folders contain no AGC entry, and implementation lists are generated from submitted reports. The "passed Core" wording was not confirmed. | https://github.com/kubernetes-sigs/gateway-api/tree/main/conformance/reports , https://gateway-api.sigs.k8s.io/docs/conformance/ |
| 3 | §2.1, gotcha 15 | Same VNet as the nodes listed as a CNI Overlay restriction only | Same VNet required in every CNI mode: "Separate virtual networks ... aren't currently supported" | https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/container-networking |
| 4 | §2.3, §2.4 | Helm controller "runs in namespace `azure-alb-system`" | Default namespace only, overridable with `albController.namespace`. Pods carry the label `app=alb-controller`. | https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/quickstart-deploy-application-gateway-for-containers-alb-controller-helm , https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/alb-controller-helm-chart |
| 5 | §2.3 | "two replicas in active/passive mode" | "at least two replicas in active/passive configuration" | https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/faq |
| 6 | §2.3, gotcha 16 | Quote "not recommended or supported" | Exact wording "isn't recommended or supported" | https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/faq |
| 7 | §4 intro | "Every policy's `override` field" is unsupported | This applies to the four policies with `default`/`override` blocks. `BackendLoadBalancingPolicy` and `WebApplicationFirewallPolicy` have neither block. | https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/api-specification-kubernetes |
| 8 | §4 `BackendTLSPolicy` row | API: Gateway | Gateway; the AGIC migration page says Ingress too (C18) | https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/migrate-from-agic-to-agc |
| 9 | §13 backend TLS, agcIngress | "no client-certificate field, so no backend mTLS" | `IngressExtension` has no client-certificate field. Backend mTLS for Ingress through `BackendTLSPolicy` is UNVERIFIED (C18). | https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/migrate-from-agic-to-agc , https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-end-to-end-tls-ingress-api |
| 10 | §13 external auth, agcIngress; §5.3 | "Whether ApplicationLoadBalancer-scope policies cover Ingress traffic is UNVERIFIED" | Resolved: "JWT validation is only supported with Gateway API. Ingress API is not supported." | https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/jwt-validation |
| 11 | §6 | Gateway status address "type `Hostname` in most how-tos" | 9 how-tos show `Hostname` and 8 show `IPAddress`. The real type is UNVERIFIED (C19). | AGC Gateway API how-tos (§15) |
| 12 | §6, C12 | Front Door Private Link page "updated 2026-05-26"; the private-ingress page "names Front Door only as an example" | The Front Door page's `ms.date` is 2025-09-24. The private-ingress page also links to it under "Related content". | https://learn.microsoft.com/en-us/azure/frontdoor/private-link , https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/private-ingress |
| 13 | §8 Backends | The EndpointSlices statement was attributed, by default, to Jack Stromberg | The statement is by Vyshnavi-MSFT (Microsoft "Contributor", 2026-05-26). The roadmap quote now includes "no ETA to provide" (Jack Stromberg, 2026-06-30). | https://github.com/Azure/AKS/issues/5776 |
| 14 | §13 rate limiting, agc | "approximate sliding window" | "sliding window"; the Application Gateway WAF v2 doc does not say "approximate" | https://learn.microsoft.com/en-us/azure/web-application-firewall/ag/rate-limiting-overview |
| 15 | C5 | v1.6.2 ships ReferenceGrant as "v1alpha2, v1beta1 and v1" | The v1.6 bundles serve `v1` and `v1beta1` only, with no `v1alpha2` | https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.6.1/standard-install.yaml |
| 16 | §7.1 | "JavaScript challenge and CAPTCHA actions" unsupported | Scoped to Bot Manager rules, as the doc states | https://learn.microsoft.com/en-us/azure/web-application-firewall/ag/waf-application-gateway-for-containers-overview |
| 17 | §5.3 | The Gateway-API-only output of the migration utility rested on a secondary blog | Primary source added (the utility README). The blog quote is marked as not re-fetched. | https://github.com/Azure/Application-Gateway-for-Containers-Migration-Utility |
| 18 | §2.1 | Child resources listed without caveat | Noted that the components page's core list omits security policies, while its own section, the overview and the WAF pages include them | https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/application-gateway-for-containers-components |

**Additions** (new facts, not corrections):

- TLSRoute, TCPRoute and UDPRoute are Standard `v1` kinds in Gateway API v1.6 (§3).
- Gateway API v1.7.0 promoted `retry` to Standard (§3).
- 303, 307 and 308 redirects are Extended features in v1.6.2 (§13).
- The session-affinity caveat now appears in the matrix (§13).
- New conflicts C18 and C19.
- Dates for the DNS alias page and for the #5406 acknowledgement.
- The MCR image-tag URL.

**Left UNVERIFIED** (with the reason):

1. Support for the upstream `gateway.networking.k8s.io/v1` BackendTLSPolicy in ALB Controller 1.13 (C9). The AGC docs are silent, and the kind name collides with AGC's own.
2. `BackendTLSPolicy`, and backend mTLS, for Services behind an Ingress (C18). The docs conflict.
3. 303 redirects on AGC, and 307/308 on the Ingress API (C7). The release notes do not name the API, and the how-tos list only 301/302.
4. The status at 1.13 of `GatewayHTTPListenerIsolation`, `GatewayInfrastructurePropagation`, `HTTPRouteBackendRequestHeaderModification`, `HTTPRouteParentRefPort`, h2c and the WebSocket backend protocol (C6). No conformance report exists after v1.2.1.
5. The ReferenceGrant version AGC honours (C5). The overview names `v1alpha1`, which does not exist.
6. Whether the controller creates an `IngressClass`, and whether `ingressClassName: azure-alb-internal` works (C8). The docs show only the annotation.
7. Ingress `pathType: Exact` and `ImplementationSpecific`, regex on Ingress, and Ingress `spec.defaultBackend` (C11). Not documented.
8. Multiple mirrors per rule, retry semantics, and request and header size limits (C11). Not documented.
9. Session affinity with the round-robin or least-request strategies (§8). The compatibility table and the session-affinity page disagree.
10. Several Ingresses sharing one frontend (C3). The FAQ and the how-tos disagree.
11. The Gateway `status.addresses[].type` the controller writes (C19).
12. Coexistence of Helm-installed and AKS-managed Gateway API CRDs (C13). Not documented.
13. Front Door Private Link to an AGC private frontend (C12). AGC is not a listed origin type.
14. The add-on feature gaps (C14). This is an inference from the pinning table.
15. SLA figures and sovereign-cloud availability (C17). Not researched.
16. Not re-fetched on 2026-11-04 because the online budget was spent:
    - the Tech Community blog quote (secondary source);
    - the migration utility v1.0.0 date (2026-01-28);
    - the date of the subscription-limits page (2026-09-29); its AGC content was confirmed through the limits include;
    - the live v1.6 implementations page; AGC's absence is inferred from the report folders.
