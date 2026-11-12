# F8: Controller detection from read-only `kubectl` output

Research date: 2026-11-04. Researcher: Claude (for CLAZA IT), for `ingress-nginx-inventory`. Fact-checked on 2026-11-04 against the local primary-source copies plus 15 online checks; corrections are listed in the verification log at the end.

Scope: how the CLI can tell, from read-only `kubectl get ... -o json` output, (a) which ingress controllers a cluster runs, (b) which `Ingress` objects community ingress-nginx serves, including the AKS application routing add-on's managed NGINX, (c) the controller version and its CVE exposure, and (d) which controller flags change the migration picture.

Status labels used below:

- **VERIFIED**: read in a primary source (source code at a release tag, official docs, official release notes, an official advisory, or a registry API).
- **UNVERIFIED**: primary sources are silent or ambiguous. The tool must not assert it.
- **CONFLICT**: primary sources disagree. The note names the source that wins and explains why.

Citation conventions:

- `[Sn]` refers to the numbered Sources section at the end.
- ingress-nginx code citations point at the final tag `controller-v1.15.1`. The repository is archived, so that code is frozen.
- Citations for the AKS app routing operator, the F5 NGINX Ingress Controller, Contour, Traefik, Kong, Cilium, Envoy Gateway, NGINX Gateway Fabric and ingress2gateway point at `main`/`master` as fetched on 2026-11-04. Those branches keep moving.

---

## 0. Decision rules for the tool (summary)

1. **Find controllers from workloads, not from labels.**
   - Any Deployment or DaemonSet container whose first argument is `/nginx-ingress-controller` runs the community ingress-nginx binary. This holds for the upstream Helm chart, the upstream static manifests and the AKS app routing add-on [S15][S18][S61].
   - The upstream image is `ENTRYPOINT ["/usr/bin/dumb-init", "--"]` with `CMD ["/nginx-ingress-controller"]` [S89]. A container that uses an ingress-nginx image with no `args` therefore still runs the controller, with every flag at its default. Match on the image as well as on the args.
   - Do not rely on `app.kubernetes.io/name=ingress-nginx` alone. Every upstream CVE advisory recommends that selector [S29-S40], but AKS app routing pods do not carry it (§2.3).
2. **Read the controller's flags from its container args.** An absent flag takes its default (§1.2, §6).
   - Expand `$(POD_NAMESPACE)` and other `$(VAR)` references from the container env, as Kubernetes does [S48].
   - The binary parses flags with spf13/pflag, so accept both `--flag=value` and `--flag value` [S8].
3. **Find the IngressClass objects each controller owns by `spec.controller`, never by name.**
   - The name `nginx` is also the default of the F5 NGINX Ingress Controller [S66][S69].
   - Even `spec.controller: k8s.io/ingress-nginx` can be served by Traefik's ingress-nginx compatibility provider [S75].
4. **For each Ingress, replay ingress-nginx's own decision function** (`GetIngressClass`, §1.2). The order is:
   1. `spec.ingressClassName` decides alone.
   2. Otherwise, the `kubernetes.io/ingress.class` annotation must equal `--ingress-class`.
   3. Otherwise, the Ingress is served only with `--watch-ingress-without-class=true`.
   4. Finally, apply the namespace scope (`--watch-namespace` / `--watch-namespace-selector`), the deep inspector (`--deep-inspect`, default `true`) and `--disable-catch-all` (§1.2.3).
5. **Report ambiguity explicitly.** Several controllers can claim the same object:
   - two ingress-nginx instances that both watch classless Ingresses;
   - Contour, which accepts classless Ingresses by default;
   - objects that carry both the annotation and the field with different values, which controllers resolve in different orders (§1.2.4).
6. **Report the version from several signals:** image tag, image digest, `status.containerStatuses[].imageID`, and labels.
   - Treat versions above the last upstream release (v1.15.1, v1.14.5, v1.13.9) as vendor or fork builds.
   - On AKS, Microsoft build tags such as `v1.13.10-13` have no upstream equivalent (§2.4, §3).

---

## 1. Community ingress-nginx (kubernetes/ingress-nginx)

### 1.1 Identity constants (VERIFIED, v1.15.1)

| Item | Value | Source |
|---|---|---|
| IngressClass `metadata.name` created by the Helm chart and the static manifests | `nginx` | values.yaml L127-L129 [S13]; deploy.yaml L626-L637 [S18] |
| IngressClass `spec.controller` | `k8s.io/ingress-nginx` | `DefaultControllerName`, ingressclass.go L26 [S6]; deploy.yaml [S18] |
| `--controller-class` default | `k8s.io/ingress-nginx` | flags.go L72 [S8] |
| `--ingress-class` default (annotation value, also the name used by `--ingress-class-by-name`) | `nginx` | flags.go L67; `DefaultAnnotationValue`, ingressclass.go L29 [S6][S8] |
| Deprecated class annotation | `kubernetes.io/ingress.class` | `IngressKey`, ingressclass.go L23 [S6] |
| Default-class marker (on the IngressClass) | `ingressclass.kubernetes.io/is-default-class: "true"`. Set only when Helm `controller.ingressClassResource.default=true`, which defaults to `false`. | controller-ingressclass.yaml L15; values.yaml L135 [S13] |
| Binary / container `args[0]` | `/nginx-ingress-controller` | deploy.yaml L426; `_params.tpl` L2 [S15][S18] |
| Annotation prefix default | `nginx.ingress.kubernetes.io` | parser/main.go L33 [S23]; flags.go L159 [S8] |
| Kubernetes Event source for accepted Ingresses | component `nginx-ingress-controller`, reason `Sync`, message `Scheduled for sync` | store.go L281-L282, L456 [S7] |
| Static manifest names | namespace `ingress-nginx`, Deployment `ingress-nginx-controller`, ValidatingWebhookConfiguration `ingress-nginx-admission` | deploy.yaml [S18]; [S27] |

### 1.2 How the controller decides which Ingresses it serves (VERIFIED from code, v1.15.1)

#### 1.2.1 Which IngressClass objects the controller owns

The ingressClass event handler is in store.go L526-L597 [S7].

- **On add,** an IngressClass enters the controller's private lister in two cases:
  - its `spec.controller` equals `--controller-class`;
  - `--ingress-class-by-name=true` and its `metadata.name` equals `--ingress-class`.

  Any other class is ignored, and the controller logs `ignoring ingressclass as the spec.controller is not the same of this ingress`.
- **On update and delete,** only the `spec.controller` comparison is made. By-name classes are not re-evaluated on update. This is an implementation detail; it matters only for edge cases.
- **When the controller cannot list IngressClasses** (the call returns Forbidden), it logs a warning and sets `IgnoreIngressClass=true`, which disables the IngressClass feature (cmd/nginx/main.go L107-L115 [S9]). In that mode `spec.ingressClassName` is ignored, and only the annotation and classless rules below apply.

#### 1.2.2 The per-Ingress decision

The function is `GetIngressClass`, store.go L1066-L1090 [S7]. The first matching rule wins.

1. **`spec.ingressClassName` is set** (and the IngressClass feature is not disabled): the Ingress is served only if that IngressClass is in the owned set from §1.2.1. When the field is set, the annotation is never consulted.
2. **No field, but the `kubernetes.io/ingress.class` annotation is present:** the Ingress is served only if the annotation value equals `--ingress-class` exactly.
   - Otherwise the controller logs `ingress class annotation is not equal to the expected by Ingress Controller`.
   - An empty-string annotation is therefore rejected under the default `--ingress-class=nginx`.
3. **Neither field nor annotation:** the Ingress is served only if `--watch-ingress-without-class=true`. Internally the controller uses class `"_"`.
4. **Otherwise** the Ingress is ignored with `ingress does not contain a valid IngressClass`.

The Helm values comment states the same order: "first ingressClassName is considered, if not present, controller looks for ingress.class annotation" (values.yaml L157-L159 [S13]).

The project FAQ agrees as well: "The `.spec.ingressClassName` behavior has precedence over the deprecated `kubernetes.io/ingress.class` annotation" [S11].

The same FAQ lists what a controller started with `--watch-ingress-without-class=true` serves:

- Ingresses with no class;
- Ingresses whose annotation matches `--ingress-class`;
- Ingresses whose IngressClass has the controller's `spec.controller`.

It also warns that two ingress-nginx instances both running with `--watch-ingress-without-class=true` "is likely to be a conflict" [S11].

#### 1.2.3 Scoping and safety filters around the class check

Order in code: the namespace filter runs before `GetIngressClass`; deep inspection and the catch-all filter run after it (store.go L433-L454 [S7]). An Ingress must pass all of them, so the order does not change the outcome.

- **Namespace scope:**
  - `--watch-namespace` names one namespace. The default `""` means all namespaces.
  - `--watch-namespace-selector` takes a namespace label selector.
  - The two flags are mutually exclusive. Ingresses outside the scope are ignored (flags.go L107-L114, L312-L322 [S8]; store.go L366-L381 [S7]).
  - In Helm, `controller.scope.enabled=true` sets `--watch-namespace`, defaulting to the release namespace, and `controller.scope.namespaceSelector` sets the selector ([S15]; values.yaml L184-L191 [S13]).
  - `multiple-ingress.md` notes that when `scope.enabled` is set, "the ingress class resource field is not used" [S12]. In the code this works **through RBAC**, not through a scope check:
    - With Helm `rbac.scope=true`, neither the ClusterRole nor the ClusterRoleBinding is rendered (`clusterrole.yaml` guard `not rbac.scope`; `clusterrolebinding.yaml` guard `rbac.create && not rbac.scope` [S90]). The chart refuses `rbac.scope=true` with `controller.scope.enabled=false`, but it does not force `rbac.scope=true` when `controller.scope.enabled=true` (`clusterrole.yaml` L3-L5 [S90]).
    - IngressClasses are cluster-scoped, so the namespaced Role cannot grant `list` on them [S91]. The chart's Role lists `ingressclasses` anyway (`controller-role.yaml` L56-L63 [S90]); that rule has no effect.
    - Listing therefore returns Forbidden, and the controller sets `IgnoreIngressClass=true` [S9].
    - With the default `rbac.scope: false` [S13], the ClusterRoleBinding exists and the field is honoured.
    - Read-only signal: check whether any ClusterRoleBinding binds the controller's ServiceAccount to a ClusterRole that allows `list` on `ingressclasses`.
- **Deep inspection:** with `--deep-inspect` (default `true`, flags.go L229 [S8]), an Ingress whose host, path, TLS host or TLS secret name matches a blocked pattern (`alias` or `root` directives, `/etc/(passwd|shadow|group|nginx|ingress-controller)`, `/var/run/secrets`, `_by_lua`) is ignored and logged as `received invalid ingress` (store.go L445-L450 [S7]; inspector `ingress.go` L28-L62 and `rules.go` L25-L29 [S94]).
- **Catch-all filter:** `--disable-catch-all=true` ignores **every Ingress that sets `spec.defaultBackend`**, even one that also has rules: `hasCatchAllIngressRule` returns `spec.DefaultBackend != nil` (store.go L897-L899). The check runs on add, update and delete (store.go L410, L451-L454, L484, L496 [S7]).

#### 1.2.4 Kubernetes API behaviour that the tool must model (VERIFIED)

**The default IngressClass is applied by the API server, not by ingress-nginx.**

- ingress-nginx never reads `ingressclass.kubernetes.io/is-default-class`. A search of the v1.15.1 tree finds the string only in docs and Helm templates [S11][S13].
- The `DefaultIngressClass` admission plugin is mutating and runs on Create only. It sets `spec.ingressClassName` only when the new Ingress has neither `spec.ingressClassName` nor the `kubernetes.io/ingress.class` annotation [S43][S44].
- It is in kube-apiserver's default-enabled plugin list [S43]. Whether AKS keeps it enabled is not documented (UNVERIFIED for AKS).
- Consequence: an Ingress created without a class, before a default class existed or while none was marked, stays classless permanently. Marking a class default later changes nothing for that object. ingress-nginx serves it only with `--watch-ingress-without-class=true`. The project FAQ says the same and recommends re-creating such objects or setting the field [S11].

**Several default classes: CONFLICT.**

- *Source code:* since Kubernetes v1.25.0 the plugin picks the newest default class (by `creationTimestamp`, then by name). Up to v1.24 it rejected the Ingress ("only 1 allowed"). Checked in plugin source at v1.24.0, v1.25.0, v1.35.0 and master [S44].
- *Docs:* the Ingress concept page and the admission-controllers page still say creation is rejected [S42][S43]. The ingress-nginx Helm values comment says the same [S13].
- *Resolution:* the source wins for clusters on Kubernetes 1.25 or later.

**Annotation and field together.**

- On Create, Kubernetes 1.18-1.26 rejected an Ingress that set both ("can not be set when the class field is also set").
- Since 1.27 both are allowed only if they are equal ("must match `ingressClassName` when both are specified") [S45].
- Updates are not validated, so objects with both set to different values can exist.

**How controllers resolve both-set objects.**

| Controller | Which wins |
|---|---|
| ingress-nginx | the field [S7] |
| F5 NGINX Ingress Controller | the annotation; it logs that the field is ignored [S67] |
| Contour | `projectcontour.io/ingress.class`, then `kubernetes.io/ingress.class`, then the field [S79] |
| HAProxy Ingress (jcmoraisjr) | the annotation, with a warning [S78] |
| ingress2gateway | a non-empty field, then the annotation [S85] |

The current API documentation says only that controllers "should still honor that annotation if present" [S46].

#### 1.2.5 Docs that contradict the v1.15.1 code (CONFLICT; the code wins)

- `cli-arguments.md` says `--ingress-class` "If this parameter is not set, or set to the default value of "nginx", it will handle ingresses with either an empty or "nginx" class name" [S10]. The code serves classless Ingresses only with `--watch-ingress-without-class=true` and rejects an empty annotation [S7].
- `multiple-ingress.md` says that with the default `--controller-class` the controller "will monitor Ingresses with no class annotation" and cites `internal/ingress/annotations/class/main.go` [S12]. That file does not exist at v1.15.1; the logic moved to store.go [S7].
- The `IngressKey` code comment says the controller processes the annotation when it is "unset, or set to either the configured value or the empty string" [S6]. The code rejects the empty string [S7].
- The flag help text in code is the most accurate: `--ingress-class` reads "[IN DEPRECATION] ... The parameter --controller-class has precedence over this." [S8]

### 1.3 Image repositories (VERIFIED from Changelog.md at v1.15.1 [S19] and release pages)

| Controller versions | Image reference |
|---|---|
| 0.9.0-beta.1 to 0.9.0-beta.15 | `gcr.io/google_containers/nginx-ingress-controller:<ver>` |
| 0.9.0-beta.16 to 0.33.0 | `quay.io/kubernetes-ingress-controller/nginx-ingress-controller:<ver>` (tags have no leading `v`) |
| 0.34.0, 0.34.1 | `us.gcr.io/k8s-artifacts-prod/ingress-nginx/controller:v<ver>`, also `eu.gcr.io/...` and `asia.gcr.io/...` |
| 0.35.0 to 1.2.1 | `k8s.gcr.io/ingress-nginx/controller:v<ver>`. `k8s.gcr.io/ingress-nginx/controller-chroot` starts at v1.2.0-beta.0 / v1.2.0. |
| 1.3.0 to 1.15.1 | `registry.k8s.io/ingress-nginx/controller:v<ver>` and `registry.k8s.io/ingress-nginx/controller-chroot:v<ver>` |

The Helm chart builds the image as `<registry>/ingress-nginx/controller[-chroot]:<tag>@<digest>`, or as `<repository>:<tag>@<digest>` when `controller.image.repository` is set. The default registry is `registry.k8s.io` (values.yaml L6-L8, L25-L35; controller-deployment.yaml L88 [S13][S16]). A private mirror such as ACR keeps the path suffix only by convention, so match the `ingress-nginx/controller` suffix and the `/nginx-ingress-controller` argument rather than the registry host.

Digests of the final upstream images (VERIFIED from the release pages [S2][S3][S4]):

| Image | Digest |
|---|---|
| `registry.k8s.io/ingress-nginx/controller:v1.15.1` | `sha256:594ceea76b01c592858f803f9ff4d2cb40542cae2060410b2c95f75907d659e1` |
| `registry.k8s.io/ingress-nginx/controller-chroot:v1.15.1` | `sha256:af31d00c9d82c612896b380a9003bd36843b7647b98e4588251c66325317bc72` |
| `registry.k8s.io/ingress-nginx/controller:v1.14.5` | `sha256:af3312d040dbe8d503001a1094b248e8be372f70f317a4bc35f81fb312bff3a8` |
| `registry.k8s.io/ingress-nginx/controller-chroot:v1.14.5` | `sha256:4a91b68f45ace708d16193a1aa0e4860ee88c7f76b8be4144dd07d82aa9d2a13` |
| `registry.k8s.io/ingress-nginx/controller:v1.13.9` | `sha256:d803625b20d471400fdae9dce0fdd076c0361f8f7e1ecee0dcd2f84fa0d196f8` |
| `registry.k8s.io/ingress-nginx/controller-chroot:v1.13.9` | `sha256:61c2fcab0f77087f9999256139a2760fca021e038b83ff917ed34ed699af4b3b` |

For reference, the digests of the IngressNightmare fix releases [S19]:

- v1.12.1: `controller@sha256:d2fbc4ec70d8aa2050dd91a91506e998765e86c96f32cffb56c503c9c34eed5b`, `controller-chroot@sha256:90155c86548e0bb95b3abf1971cd687d8f5d43f340cfca0ad3484e2b8351096e`
- v1.11.5: `controller@sha256:a1cbad75b0a7098bf9325132794dddf9eef917e8a7fe246749a4cea7ff6f01eb`, `controller-chroot@sha256:ec9df3eb6b06563a079ee46045da94cbf750f7dbb16fdbcb9e3265b551ed72ad`
- The same values appear on the release pages for controller-v1.12.1 and controller-v1.11.5 [S1].

The upstream v1.15.1 base image builds NGINX `1.27.1` (`images/nginx/rootfs/build.sh` L21 [S21]).

### 1.4 Labels on upstream installs (VERIFIED)

**Helm chart `ingress-nginx`**, chart 4.15.1 / appVersion 1.15.1 [S17]:

- Deployment/DaemonSet metadata and the pod template get `ingress-nginx.labels` (`_helpers.tpl` L131-L150 [S14]) plus `app.kubernetes.io/component: controller` [S16]:
  - `helm.sh/chart: ingress-nginx-<chartVersion>`
  - `app.kubernetes.io/name: ingress-nginx` (follows `nameOverride`)
  - `app.kubernetes.io/instance: <release>`
  - `app.kubernetes.io/version: "<chart appVersion>"`
  - `app.kubernetes.io/part-of: ingress-nginx`
  - `app.kubernetes.io/managed-by: Helm`
- The selector uses `app.kubernetes.io/name`, `app.kubernetes.io/instance` and `app.kubernetes.io/component=controller` [S16].
- The default workload kind is `Deployment`; a `DaemonSet` is possible (values.yaml `controller.kind` [S13]).

**Static manifests** (`deploy/static/provider/*`) [S18]:

- labels `app.kubernetes.io/{component=controller, instance=ingress-nginx, name=ingress-nginx, part-of=ingress-nginx, version=1.15.1}`;
- no `helm.sh/chart` and no `managed-by` label.

### 1.5 Reading the version (VERIFIED signals and their limits)

1. **Image tag** in the pod spec, for example `v1.15.1`, often with `@sha256:...` [S13][S18].
   - Limit: the tag can be overridden or mirrored.
   - The digest is the stronger identifier: compare it with the official digests in §1.3.
2. **`status.containerStatuses[].image` and `.imageID`** on running pods. The API documents that these "may not match the image used in the PodSpec, as it may have been resolved by the runtime" [S47]. `imageID` usually carries the resolved digest. That is the best read-only proof of what actually runs.
3. **Label `app.kubernetes.io/version`**.
   - Under Helm it is the chart's `appVersion` (`_helpers.tpl` L134-L136 [S14]), not the running image. If `controller.image.tag` was overridden, the two disagree.
   - `helm.sh/chart=ingress-nginx-4.x.y` gives the chart version [S14].
   - AKS app routing objects carry no version label (§2.3).
4. **Startup log banner.** The binary prints `NGINX Ingress controller / Release: vX.Y.Z / Build: <commit> / Repository: ... / nginx version: ...` (version/version.go L36-L43; cmd/nginx/main.go L56 [S20][S9]).
   - Reading it requires `kubectl logs`, which is still read-only.
   - The banner is lost once logs rotate.
5. **Do not read Helm release Secrets** (`sh.helm.release.v1.*`) in a read-only inventory tool. Labels give the chart version without touching Secrets. This is a design recommendation, not a sourced fact.

### 1.6 Read-only evidence that a controller actually serves an Ingress (VERIFIED)

- **`status.loadBalancer.ingress`.**
  - With `--update-status` (default `true`), the controller writes the address of its `--publish-service` Service, or of `--publish-status-address`, into each Ingress it satisfies [S8][S10].
  - `--publish-service` and `--publish-status-address` are mutually exclusive (flags.go L302-L304 [S8]).
  - The Helm chart sets `--publish-service` by default (`controller.publishService.enabled: true` [S13][S15]). The static manifest sets `--publish-service=$(POD_NAMESPACE)/ingress-nginx-controller` [S18].
  - Use: match each Ingress's status IP or hostname against each controller Service's `status.loadBalancer.ingress`.
- **`Sync` Events** from component `nginx-ingress-controller` on the Ingress [S7].
  - Events are short-lived: the API server's default TTL is 1h (general Kubernetes behaviour, not re-verified here).
  - `--disable-sync-events` suppresses them [S10].

---

## 2. AKS application routing add-on: managed NGINX (VERIFIED unless marked)

### 2.1 Support status

- Microsoft "will provide official support for critical security patches for application routing add-on NGINX Ingress resources through **November 2026**" [S50]. The managed NGINX "will stop receiving Azure support from Azure after November 2026" [S51].
- Microsoft's recommended successor is the application routing Gateway API implementation, which is Istio-based. Its GatewayClass is `approuting-istio`. It reconciles only Gateway API resources: no Istio CRDs and no sidecar injection [S51][S52].
  - It became GA in AKS release notes 2026-04-28 [S55].
  - It cannot be enabled together with the Istio service mesh add-on, whose GatewayClass is `istio` [S51].
  - Its documented limitations: no request header or body size limits, no Lua, no local or global rate limiting, and no `EnvoyFilter` [S51].
- Starting with AKS 1.36, new AKS Automatic clusters use the Gateway API through app routing by default. Existing clusters are not changed [S51][S55].

### 2.2 IngressClass names and controller strings

| Object | IngressClass name | `spec.controller` | Source |
|---|---|---|---|
| Default `NginxIngressController` (named `default`) | `webapprouting.kubernetes.azure.com` | `webapprouting.kubernetes.azure.com/nginx`. On an existing cluster the operator reuses whatever controller string the existing default class carries. | default.go L23-L28, L131-L149 [S57]; fixture full.yaml L12-L21 [S61]; [S49] |
| Additional `NginxIngressController` custom resources (cluster-scoped CRD `nginxingresscontrollers.approuting.kubernetes.azure.com`, short name `nic`) | `spec.ingressClassName`, default `nginx.approuting.kubernetes.azure.com`, immutable | `approuting.kubernetes.azure.com/<url-escaped NIC name>`, truncated to 250 characters | nginx_ingress_controller.go L526-L541 [S58]; nginxingresscontroller_types.go L30-L48, L249 [S62]; [S53] |

Microsoft's migration guide inventories the controllers with `kubectl get nginxingresscontrollers -o custom-columns=NAME:.metadata.name,CLASS:.spec.ingressClassName` and then lists every Ingress whose class matches [S52].

### 2.3 Workloads and labels

Source: operator code plus the golden fixture [S56][S59][S60][S61].

- **Namespace:** `app-routing-system`, the operator's default `--namespace` (config.go L20 [S59]; also [S49]). One page of the NGINX configuration doc says `app-routing-namespace`, which looks like a typo [S53].
- **Workload:** Deployment `nginx` for the default controller. Additional controllers are named `<controllerNamePrefix>-<collisionCount>`, and the prefix defaults to `nginx` [S58][S62].
- **Service:** `nginx` in `app-routing-system` [S49][S52].
- **Deployment metadata labels:**
  - `app.kubernetes.io/component: ingress-controller`
  - `app.kubernetes.io/managed-by: aks-app-routing-operator`
  - `app.kubernetes.io/name: nginx`
  - `kubernetes.azure.com/managedby: aks`
- **Pod template labels:** `app: <resourceName>`, `app.kubernetes.io/component: ingress-controller`, `app.kubernetes.io/managed-by: aks-app-routing-operator`, `kubernetes.azure.com/managedby: aks` [S61].
  - There is no `app.kubernetes.io/name` label on the pods and none equal to `ingress-nginx`.
  - So `kubectl get pods -A -l app.kubernetes.io/name=ingress-nginx`, the check in every upstream advisory [S27][S29-S40], **does not find AKS app routing NGINX**.
- **Container args** (nginx.go L446-L472 [S56]; fixture L366-L375 [S61]):
  - `/nginx-ingress-controller`
  - `--ingress-class=<class name>`
  - `--controller-class=<controller string>`
  - `--election-id=<resourceName>`
  - `--publish-service=$(POD_NAMESPACE)/<resourceName>`
  - `--configmap=$(POD_NAMESPACE)/<resourceName>`
  - `--enable-annotation-validation=true`
  - `--shutdown-grace-period=15`
  - `--enable-metrics=true`
  - optionally `--default-ssl-certificate`, `--default-backend-service` and `--enable-ssl-passthrough=true`
- **Validating webhook:** the operator manifests contain no `--validating-webhook` argument and no ValidatingWebhookConfiguration [S56][S61]. The admission controller targeted by CVE-2025-1974 is therefore not started, according to this source.
- **ConfigMap defaults that differ from upstream** (nginx.go L566-L574 [S56]):

  | Key | AKS app routing | Upstream default (configmap.md L32-L34 [S22]) |
  |---|---|---|
  | `allow-snippet-annotations` | `"true"` | `"false"` |
  | `annotation-value-word-blocklist` | `load_module,lua_package,_by_lua,location,root,proxy_pass,serviceaccount,{,},'` | (none) |
  | `allow-cross-namespace-resources` | `"true"` | `"false"` |
  | `annotations-risk-level` | `Critical` | `High` |

  Microsoft's docs confirm that snippets are allowed except for blocked values, and that cross-namespace resources are enabled [S49]. They also state that editing the ingress-nginx ConfigMap in `app-routing-system` is not supported [S49].
  Migration impact: snippet annotations that would be dropped upstream can be live on AKS. Gateway API has no equivalent for them.

### 2.4 Images and Microsoft version numbering

| Repository | Used when | Tags observed in MCR on 2026-11-04 |
|---|---|---|
| `mcr.microsoft.com/oss/kubernetes/ingress/nginx-ingress-controller` | the operator default; nginx.go L38, L405 [S56] | up to `v1.13.7` and `v1.14.3`, plus `-linux-amd64` / `-linux-arm64` and `-N` variants [S65] |
| `mcr.microsoft.com/oss/v2/ingress-nginx/controller` | with operator flag `--enable-dalec-nginx`, added in operator 0.2.21 on 2026-04-16 ([S63]; nginx.go L39, L403 [S56]) | `v1.13.9[-N]`, `v1.13.10[-N]`, `v1.13.11[-N]`, `v1.14.0[-N]`, `v1.14.1[-N]`, `v1.14.3[-N]`, `v1.14.4[-N]`, `v1.14.5[-N]` (no `v1.14.2`), `v1.15.0[-N]`, `v1.15.1[-N]`. Highest revisions listed: `v1.13.10-17`, `v1.13.11-3`, `v1.14.5-27`, `v1.15.1-29` [S64] |

- `v1.13.10` and `v1.13.11` **do not exist upstream**: the last upstream 1.13 release is v1.13.9 [S1]. They are Microsoft (Dalec) builds.
- The `-N` suffix is a Microsoft build revision.
- The pod's `runAsUser` is `1000` for Dalec images and `101` otherwise [S56].

AKS release-note timeline for app routing NGINX [S55]:

| AKS release | Change |
|---|---|
| 2025-04-06 | ingress-nginx v1.11.5 for the IngressNightmare CVEs |
| 2025-10-12 | operator 0.2.10, ingress-nginx v1.13.1 |
| 2026-02-08 | operator v0.2.17 for CVE-2026-1580, CVE-2026-24512, CVE-2026-24513, CVE-2026-24514; v1.13.7 per [S63] |
| 2026-04-28 | NGINX image version `1.13.9` |
| 2026-09-04 | operator 0.2.28 with `v1.13.10-10` |
| 2026-10-25 | images `v1.13.10-13` and `v1.15.1-23` on all supported AKS versions |

**Gap (UNVERIFIED):**

- The operator's GitHub `main` lists only Dalec `v1.13.10-7` and CHANGELOG entries up to 0.2.27, while AKS already ships 0.2.28 and `v1.15.1-23` [S55][S56][S63]. The deployed operator is ahead of `main`.
- Which image repository a given cluster uses depends on its AKS release and region. Read the actual pod image; do not infer it.
- Whether a Microsoft build with an upstream-looking tag (for example the legacy repository's `v1.13.7`) contains backported fixes is not documented. Do not map Microsoft builds to upstream CVE status by semver alone. Point the user to the AKS release notes instead.

---

## 3. Final upstream releases and the archive (VERIFIED)

| Date (UTC) | Release |
|---|---|
| 2025-03-25 00:44 / 00:51 | controller-v1.11.5 / controller-v1.12.1, the IngressNightmare fixes. The Kubernetes blog announced them on 2025-03-24 US time. [S27][S1] |
| 2025-08-12 | controller-v1.12.5 and controller-v1.13.1, which fix CVE-2025-15566 [S1][S38] |
| 2026-02-02 | controller-v1.13.7 and controller-v1.14.3 [S1] |
| 2026-03-09 | controller-v1.13.8, controller-v1.14.4 and controller-v1.15.0; Helm charts 4.13.8, 4.14.4 and 4.15.0 [S1] |
| **2026-03-19** | **controller-v1.13.9, controller-v1.14.5 and controller-v1.15.1; Helm charts 4.13.9, 4.14.5 and 4.15.1.** These are the final releases; v1.15.1 is marked "Latest". [S1][S2][S3][S4] |
| **2026-03-24** | The repository was archived ("This repository was archived by the owner on Mar 24, 2026. It is now read-only.") [S5] |

- SIG Network and the Security Response Committee "have retired Ingress NGINX on March 24, 2026. Since that date, there have been no further releases, no bugfixes, and no updates to resolve any security vulnerabilities discovered. Existing deployments of Ingress NGINX will continue to function, and installation artifacts like Helm charts and container images will remain available." [S26]
- The original announcement said: "Best-effort maintenance will continue until March 2026" and "The GitHub repositories will be made read-only and left available for reference" [S25]. Its kubernetes.io byline is 2025-11-11; the page says it mirrors a kubernetes.dev post whose URL carries 2025/11/12, and that is the link the AKS docs use [S25][S50].
- Older lines: the last 1.12 release is controller-v1.12.8 (2025-11-04) [S1]. The 1.11 line ends at v1.11.8 (`changelog/controller-1.11.8.md` [S19]; its date was not checked).
- **Fork:** Chainguard maintains `github.com/chainguard-forks/ingress-nginx` under its EmeritOSS program (post dated 2025-12-22) [S86].
  - Scope: "we are not continuing the development of ingress-nginx", and CVEs are addressed "on a best-efforts basis" [S86].
  - The source is public on GitHub. The container images (`ingress-nginx-controller`, `ingress-nginx-controller-fips`) are commercial, with access on request [S86].
  - Its releases page shows tags up to `controller-v1.15.12`, dated 27 Oct per the page; the year is not shown [S86].
  - A controller version above v1.15.1 therefore points to a fork or vendor build.
  - **VERIFIED on the fork's `main` (fetched 2026-11-04):** it keeps `DefaultControllerName = "k8s.io/ingress-nginx"` and `DefaultAnnotationValue = "nginx"` [S93]. Its IngressClass objects cannot be told apart from upstream by `spec.controller`; use the image and the version.

---

## 4. Security fixes (VERIFIED from the Kubernetes official CVE feed and the GitHub issues)

The official CVE feed JSON, updated 2026-11-03, lists no ingress-nginx CVE published after **CVE-2026-4342 (2026-03-19)** [S28]. This does not mean the code is safe: after the archive, upstream no longer publishes fixes [S26].

### 4.1 IngressNightmare

Wiz Research named the set and published it on 2025-03-24 [S87]. **UNVERIFIED in this pass:** [S87] was not re-fetched. The CVE feed dates the five advisories 2025-03-23 (UTC) [S28], and the Kubernetes blog post is dated 2025-03-24 [S27]. All five were fixed in **v1.11.5 and v1.12.1** [S27].

| CVE | Title (short) | CVSS 3.1 | Affected | Fixed | Source |
|---|---|---|---|---|---|
| CVE-2025-1974 | admission controller RCE escalation | 9.8, `AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H` | < v1.11.0; v1.11.0-1.11.4; v1.12.0 | v1.11.5, v1.12.1 | [S33] |
| CVE-2025-1097 | config injection via `auth-tls-match-cn` | 8.8 | same | same | [S31] |
| CVE-2025-1098 | config injection via mirror annotations | 8.8 | same | same | [S32] |
| CVE-2025-24514 | config injection via `auth-url` | 8.8 | same | same | [S30] |
| CVE-2025-24513 | auth secret file path traversal | 4.8, `AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:L` | same | same | [S29] |

Scanner note: the CVE-2025-24514 advisory says the issue "does not affect you if you have the `enable-annotation-validation` CLI argument enabled", and that this option is on by default from v1.12.0 [S30][S28]. A v1.12.0 controller without `--enable-annotation-validation=false` is therefore not exposed to CVE-2025-24514. It stays in the affected range of the other four; for CVE-2025-1974 and CVE-2025-24513 the advisories' mitigation is to disable the admission controller [S28].

Official mitigation when an upgrade is not possible [S27]:

- Disable the Validating Admission Controller.
  - Helm: `controller.admissionWebhooks.enabled=false`.
  - Manual installs: delete ValidatingWebhookConfiguration `ingress-nginx-admission` and remove `--validating-webhook` from the controller args.
- Re-enable it after the upgrade.

Read-only exposure signals:

- the `--validating-webhook=...` argument;
- a ValidatingWebhookConfiguration that points to the controller's admission Service.

### 4.2 Later CVEs

| CVE (published) | Title | CVSS vector (score) | Fixed in | Source |
|---|---|---|---|---|
| CVE-2025-15566 (2026-02-06) | `auth-proxy-set-headers` config injection | `AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H` (no score stated; 8.8 when computed from the vector) | v1.12.5, v1.13.1 (released August 2025) | [S38] |
| CVE-2026-1580 (2026-02-02) | `auth-method` config injection | same vector (no score stated) | v1.13.7, v1.14.3 | [S34] |
| CVE-2026-24512 (2026-02-02) | `rules.http.paths.path` config injection | same vector (no score stated) | v1.13.7, v1.14.3 | [S35] |
| CVE-2026-24513 (2026-02-02) | `auth-url` protection bypass, under specific custom-error conditions | `AV:N/AC:H/PR:L/UI:N/S:U/C:L/I:N/A:N` | v1.13.7, v1.14.3 | [S36] |
| CVE-2026-24514 (2026-02-02) | admission controller DoS | `AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:N/A:H` | v1.13.7, v1.14.3 | [S37] |
| CVE-2026-3288 (2026-03-09) | `rewrite-target` config injection | 8.8 HIGH | v1.13.8, v1.14.4, v1.15.0 | [S39] |
| CVE-2026-4342 (2026-03-19) | comment-based config injection | 8.8 (the issue labels it "Medium"; CVSS 3.1 rates 8.8 as High) | v1.13.9, v1.14.5, v1.15.1 | [S40] |

Notes:

- For all four Feb-2026 CVEs (CVE-2026-1580, CVE-2026-24512, CVE-2026-24513, CVE-2026-24514), the CVE records first listed v1.14.2 as the fixed version by mistake. A maintainer comment on each issue, dated 2026-02-18, says the record was corrected to v1.14.3 [S34][S35][S36][S37].
- The maintainers planned no v1.11 point release for the Feb-2026 batch [S34].
- Several advisories give pre-upgrade mitigations, which are useful as scanner checks [S34][S35][S39]:
  - reject the `auth-method` annotation;
  - reject `pathType: ImplementationSpecific`;
  - reject the `rewrite-target` annotation.
- Older ingress-nginx CVEs in the feed, whose fixed versions were not researched here [S28]:
  - CVE-2024-7646
  - CVE-2023-5044, CVE-2023-5043
  - CVE-2022-4886
  - CVE-2021-25748, CVE-2021-25746, CVE-2021-25745, CVE-2021-25742
  - CVE-2020-8553
- **Version → status rule:** any upstream image older than v1.13.9, v1.14.5 or v1.15.1 within its line, or any line before 1.13, misses at least one official fix. Even the final builds receive no post-archive fixes [S26][S28].

---

## 5. Lookalikes that are NOT retired: do not raise the alarm

| Product | Default IngressClass name | `spec.controller` (IngressClass) or `controllerName` (GatewayClass) | Annotations | Class semantics and other markers | Source |
|---|---|---|---|---|---|
| F5 NGINX Ingress Controller (`nginx/kubernetes-ingress`) | `nginx`, the **same name as community ingress-nginx** | `nginx.org/ingress-controller`. The controller exits at startup if the IngressClass named by `-ingress-class` is missing or has another controller (`mustValidateIngressClass`, cmd/nginx-ingress/main.go). | `nginx.org/*`, `nginx.com/*` (Plus) | Matches by class name (`-ingress-class`, default `nginx`); the annotation wins over the field; an Ingress with no class does not match. Entrypoint `/nginx-ingress`. The chart and static manifests use single-dash args (`-ingress-class=...`). The flags use Go's standard `flag` package, which is documented to accept `--name` too ([S96], not re-fetched in this pass), so match both forms. Label `app.kubernetes.io/name: nginx-ingress`. Images `nginx/nginx-ingress`, `ghcr.io/nginx/kubernetes-ingress`, `public.ecr.aws/nginx/nginx-ingress`, `quay.io/nginx/nginx-ingress`; latest stable 5.7.0 per README on main. | [S66][S67][S68][S69] |
| AGIC (Application Gateway Ingress Controller) | `azure-application-gateway` | `azure/application-gateway` | `appgw.ingress.kubernetes.io/*`; legacy annotation `kubernetes.io/ingress.class: azure/application-gateway` | (none) | [S70][S71] |
| AGC (Application Gateway for Containers, ALB Controller): Gateway API, target `agc` | GatewayClass `azure-alb-external` (public frontend). Also `azure-alb-internal` (private frontend, preview) [S92]. | `alb.networking.azure.io/alb-controller` for `azure-alb-external` [S72]. For `azure-alb-internal`: **UNVERIFIED**, the docs show no GatewayClass object. | (none) | ALB Controller pods `alb-controller-*`, label `app=alb-controller`. They run in `kube-system` with the AKS add-on, and in `azure-alb-system` by default with Helm (chart `oci://mcr.microsoft.com/application-lb/charts/alb-controller`, 1.13.0 in the quickstart). | [S72][S88] |
| AGC: Ingress API, target `agcIngress` | `azure-alb-external` (the how-to pages use `ingressClassName: azure-alb-external`). `azure-alb-internal` selects a private frontend (preview). The private-ingress concept page says to set either value with the `kubernetes.io/ingress.class` annotation [S73][S92]. | **UNVERIFIED.** Microsoft docs show no IngressClass object for either class, only the Ingress side. | `alb.networking.azure.io/alb-name` + `alb-namespace` (managed), or `alb.networking.azure.io/alb-id` + `alb-frontend` (bring your own) | (none) | [S73] |
| Traefik | Helm: release fullname | `traefik.io/ingress-controller` | (none) | See the caveat on Traefik's ingress-nginx provider below this table | [S74] |
| Kong Ingress Controller | `kong` | `ingress-controllers.konghq.com/kong` | (none) | (none) | [S76] |
| HAProxy Kubernetes Ingress (HAProxy Technologies) | `haproxy` | `haproxy.org/ingress-controller/haproxy`, or `haproxy.org/ingress-controller` when `controller.ingressClass` is null | (none) | Gateway API controller name `haproxy.org/gateway-controller` | [S77] |
| HAProxy Ingress (jcmoraisjr) | (none) | `haproxy-ingress.github.io/controller` | legacy annotation value `haproxy` | The annotation wins on disagreement; classless Ingresses are served only with `--watch-ingress-without-class` (since v0.12) | [S78] |
| Contour | `contour`, matched **by name** | No canonical IngressClass controller string; Contour does not check `spec.controller` (see the Contour caveat below this table) | `projectcontour.io/ingress.class` | Without `--ingress-class-name`, Contour accepts Ingresses whose class is `contour` **or that have no class at all**. Gateway API: `projectcontour.io/gateway-controller`. | [S79] |
| Istio (Kubernetes Ingress) | `istio` | `istio.io/ingress-controller` | (none) | (none) | [S80] |
| Istio (Gateway API); AKS Istio add-on (target `istio`) | GatewayClass `istio` | `istio.io/gateway-controller`, Istio's default. Both values are configurable on istiod (`PILOT_GATEWAY_API_DEFAULT_GATEWAYCLASS_NAME`, `PILOT_GATEWAY_API_CONTROLLER_NAME`). | (none) | AKS add-on control plane in `aks-istio-system` | [S81][S54] |
| AKS app routing Gateway API (target `appRoutingGateway`) | GatewayClass `approuting-istio` | **UNVERIFIED.** Not documented by Microsoft. The operator source matches GatewayClasses by name only (`approuting-istio`, `istio`) [S97], and a web search on 2026-11-04 found nothing. Read it read-only from the cluster: `kubectl get gatewayclass approuting-istio -o jsonpath='{.spec.controllerName}'`, or istiod's env vars in `aks-istio-system`. | (none) | Gateway proxies are named `<gateway>-approuting-istio` | [S51][S52] |
| Cilium | `cilium` | `cilium.io/ingress-controller` | annotation value `cilium` is still supported | Classless Ingresses are served only with `ingressController.default=true` | [S82] |
| Envoy Gateway | GatewayClass `eg` (quickstart) | `gateway.envoyproxy.io/gatewayclass-controller` | (none) | Its migration guide converts Ingress to Gateway API (ingress2gateway or ingress2eg) rather than serving Ingress. This remark was not re-verified in this pass; the GatewayClass name and controllerName were. | [S83] |
| NGINX Gateway Fabric (F5) | GatewayClass `nginx` | `gateway.nginx.org/nginx-gateway-controller` | (none) | Not ingress-nginx, despite the class name | [S84] |

**Caveat: Traefik's ingress-nginx provider.**

- Traefik's "Kubernetes Ingress NGINX" provider is documented in the v3.5 docs and marked experimental there [S75]. Earlier versions were not checked.
- The current docs were fetched on 2026-11-04. The page does not state its version; its links suggest v3.7. Its defaults are:
  - `ingressClass: "nginx"` and `controllerClass: "k8s.io/ingress-nginx"`;
  - `watchIngressWithoutClass: false` and `ingressClassByName: false`, which mirror ingress-nginx's flags.
  - So it selects IngressClasses whose `spec.controller` matches, which can be the community class itself. The v3.5 docs listed `ingressClass` and `controllerClass` as `""` [S75].
- Enabling it:
  - v3.5 needs both `--experimental.kubernetesingressnginx=true` and `--providers.kubernetesingressnginx=true`.
  - The current page shows only `--providers.kubernetesingressnginx=true` (Helm `providers.kubernetesIngressNginx.enabled: true`) and does not mark the provider experimental [S75].
  - Detect the `--providers.kubernetesingressnginx` argument on Traefik containers.

**Caveat: Contour's IngressClass controller string.** The string `projectcontour.io/ingress-controller` appears only as a Gateway `controllerName` in an old design doc. Any controller string seen in a third-party chart is UNVERIFIED [S79].

**Caveat: ingress2gateway's class selection.**

- Its ingress-nginx provider selects Ingresses **by class name only**: it uses `spec.ingressClassName` if it is non-empty, otherwise the annotation, and compares it with `--ingress-nginx-ingress-class`, default `nginx` [S85].
- It does not resolve IngressClass `spec.controller` and does not pick up classless Ingresses served via `--watch-ingress-without-class`.
- AKS app routing users must therefore pass `--ingress-nginx-ingress-class=webapprouting.kubernetes.azure.com`, or the custom NIC class.
- The class `nginx` would also capture F5 NGINX IC Ingresses. Our inventory can add value by resolving ownership correctly.

---

## 6. Controller flags that affect migration (VERIFIED, v1.15.1 `pkg/flags/flags.go` [S8]; descriptions per [S10])

| Flag | Default | Migration relevance | Helm / static / AKS |
|---|---|---|---|
| `--annotations-prefix` | `nginx.ingress.kubernetes.io` | All `nginx.ingress.kubernetes.io/*` annotations are read under this prefix. If it changed, the tool must parse annotations with the configured prefix, or it under-reports. | Not set by the chart (use `controller.extraArgs`); not set by AKS [S15][S56] |
| `--controller-class` | `k8s.io/ingress-nginx` | IngressClass ownership | Helm always sets it from `controller.ingressClassResource.controllerValue` [S15]; AKS sets it (§2.2) |
| `--ingress-class` | `nginx` | Annotation match and by-name match | Helm sets it from `controller.ingressClass`, default `nginx`; AKS sets the class name [S13][S56] |
| `--watch-ingress-without-class` | `false` | Classless Ingresses | Helm `controller.watchIngressWithoutClass: false` [S13] |
| `--ingress-class-by-name` | `false` | Ownership by IngressClass name | Helm `controller.ingressClassByName: false` [S13] |
| `--watch-namespace` | `""` (all namespaces) | Scope; exclusive with `--watch-namespace-selector` (default `""`) | Helm `controller.scope.*` [S13][S15] |
| `--tcp-services-configmap` | `""` | ConfigMap with key = external port, value `namespace/name:port`. TCP 80/443 are reserved. Needs TCPRoute, which went GA (`v1`, standard channel) in Gateway API v1.6 [S95]; support per AKS target is in other F-files. | Helm sets it only if top-level `tcp:` is non-empty (default `{}`) [S13][S15] |
| `--udp-services-configmap` | `""` | Same format for UDP; needs UDPRoute, also GA (`v1`, standard channel) since Gateway API v1.6 [S95] | Helm top-level `udp:` (default `{}`) [S13][S15] |
| `--default-ssl-certificate` | `""` | Catch-all HTTPS certificate (`namespace/name`). If unset, a self-signed "Kubernetes Ingress Controller Fake Certificate" is served [S24]. Gateway listeners need explicit certificates. | Helm via `extraArgs`; AKS via NIC `spec.defaultSSLCertificate` [S56][S53] |
| `--enable-ssl-passthrough` | `false` | Required for the `ssl-passthrough` annotation. Maps to TLS passthrough / TLSRoute (`v1` is served in the Gateway API v1.5.1 standard bundle and absent from v1.4.1; v1.5.0 not checked [S95]). | AKS via NIC `enableSSLPassthrough` [S56] |
| `--default-backend-service` | `""` | Catch-all backend (`namespace/name`, first port). If unset, the built-in default server answers on `--default-server-port` 8181. | Helm sets it only if `defaultBackend.enabled` (default `false`) [S13][S15]; AKS via NIC [S56] |
| `--publish-service` | `""` | Which Service address goes into Ingress status; identifies the LB IP for DNS cutover. Exclusive with `--publish-status-address`. | Helm sets it by default; static manifest `$(POD_NAMESPACE)/ingress-nginx-controller`; AKS `$(POD_NAMESPACE)/nginx` [S15][S18][S61] |
| `--update-status` | `true` | Writes `status.loadBalancer` | (none) |
| `--configmap` | `""` | Global NGINX config, including snippet permission, risk level and cross-namespace settings (§2.3) | Helm `$(POD_NAMESPACE)/<fullname>-controller`; AKS `$(POD_NAMESPACE)/nginx` [S15][S61] |
| `--disable-catch-all` | `false` | Ignores every Ingress that sets `spec.defaultBackend`, even one that also has rules (§1.2.3) [S7] | (none) |
| `--deep-inspect` | `true` | Ignores Ingresses whose host, path or TLS fields match blocked patterns (§1.2.3) [S94] | (none) |
| `--validating-webhook` | `""` (no admission controller) | Exposure to CVE-2025-1974, CVE-2025-24513 (both mitigated by disabling the admission controller [S28]) and CVE-2026-24514 (admission controller DoS [S37]) | Set by Helm when `controller.admissionWebhooks.enabled` and by the static manifest (`:8443`) [S15][S18]; not set by AKS [S56] |
| `--enable-annotation-validation` | `true` | Annotation validation | AKS sets `true` explicitly [S56] |
| `--watch-namespace-selector` | `""` | See `--watch-namespace` | (none) |

Context for the migration offer: SIG Network lists five ingress-nginx behaviours that silently change on migration [S41]:

- regex matches are prefix-based and case-insensitive;
- `use-regex` applies to every path of a host across all Ingresses;
- `rewrite-target` implies `use-regex`;
- a missing trailing slash triggers a 301 redirect;
- URLs are normalized before matching.

An inventory that detects `use-regex` or `rewrite-target` on any Ingress of a host should flag the whole host.

---

## 7. Open conflicts and gaps (also returned in the structured summary)

1. **AGC IngressClass `spec.controller`:** not documented. Only the class values `azure-alb-external` and `azure-alb-internal` (private frontend, preview) and the `alb.networking.azure.io/*` annotations are documented [S73][S92]. The GatewayClass controllerName `alb.networking.azure.io/alb-controller` is documented for `azure-alb-external` only [S72]; for `azure-alb-internal` it is not shown.
2. **`approuting-istio` GatewayClass `controllerName`:** not documented by Microsoft, and not in the operator source, which matches GatewayClasses by name [S97]. Istio's default is `istio.io/gateway-controller`, and it is configurable [S81]. The tool should read `spec.controllerName` from the live GatewayClass object (cluster-scoped, read-only).
3. **Contour IngressClass `spec.controller`:** no canonical value; Contour matches by name [S79].
4. **AKS operator source lags the deployed version.** GitHub `main` shows Dalec v1.13.10-7 and operator 0.2.27; AKS ships 0.2.28 and images `v1.13.10-13` / `v1.15.1-23` [S55][S56][S63]. Which repository (`oss/kubernetes/ingress/...` or `oss/v2/ingress-nginx/...`) a cluster uses must be read from the pod.
5. **Microsoft builds and upstream CVE status:** whether MCR builds with upstream-looking tags carry backports is not documented. Do not equate an MS build with an upstream fixed or unfixed status.
6. **Several default IngressClasses: docs vs code.** The Kubernetes docs and the ingress-nginx Helm comment say Ingress creation is rejected; the plugin source since v1.25 picks the newest default [S42][S43][S44][S13].
7. **ingress-nginx docs vs code on classless Ingresses** (§1.2.5) [S10][S12][S6] vs [S7].
8. **`multiple-ingress.md` scope note:** the claim that with `scope.enabled` "the ingress class resource field is not used" is not reflected in the v1.15.1 code [S12][S7].
9. **CVSS labelling:** CVE-2026-4342 is labelled "8.8 (Medium)" in its issue [S40]. CVE-2025-15566, CVE-2026-1580, CVE-2026-24512, CVE-2026-24513 and CVE-2026-24514 publish vectors without scores [S34]-[S38].
10. **Chainguard fork:** its release notes list CVE IDs (for example CVE-2026-9256 for its controller-v1.15.6) that do not appear in the Kubernetes official CVE feed; these were not verified [S86][S28]. Resolved on 2026-11-04: the fork's `main` keeps `k8s.io/ingress-nginx` as its default controller class [S93].
11. **Traefik ingress-nginx provider defaults** changed between v3.5 (`""`) and the current docs (`nginx` / `k8s.io/ingress-nginx`). Over the same span, the docs stopped showing the `--experimental.kubernetesingressnginx` flag and the experimental label. Whether the flag is still accepted or required was not tested, and the exact version of either change is not identified [S75].
12. **DefaultIngressClass on AKS:** it is enabled by default in upstream kube-apiserver, but AKS does not publish its admission-plugin list (UNVERIFIED).
13. **Legacy AKS "HTTP application routing" add-on** (retired 2025-03-03 per AKS release notes [S55]): its IngressClass or annotation value was not verified because the docs page was removed. The local copies of `http-application-routing.md` and `app-routing-migration.md` are both "404: Not Found" pages, and no online check was left on 2026-11-04 (UNVERIFIED). Leftover Ingresses may exist on old clusters.
14. **Event TTL** (1h default) is general knowledge and was not re-verified here.

---

## Sources

ingress-nginx (final tag `controller-v1.15.1` unless noted)

- [S1] Releases list: https://github.com/kubernetes/ingress-nginx/releases (dates also confirmed per tag page; for example https://github.com/kubernetes/ingress-nginx/releases/tag/controller-v1.13.7, https://github.com/kubernetes/ingress-nginx/releases/tag/controller-v1.12.1)
- [S2] https://github.com/kubernetes/ingress-nginx/releases/tag/controller-v1.15.1
- [S3] https://github.com/kubernetes/ingress-nginx/releases/tag/controller-v1.14.5
- [S4] https://github.com/kubernetes/ingress-nginx/releases/tag/controller-v1.13.9
- [S5] Repository page (archive notice): https://github.com/kubernetes/ingress-nginx
- [S6] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/controller/ingressclass/ingressclass.go
- [S7] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/controller/store/store.go (L281-L282, L366-L381, L410, L430-L456, L484-L500, L526-L597, L897-L899, L1066-L1090)
- [S8] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/pkg/flags/flags.go (L48, L62-L236, L302-L322)
- [S9] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/cmd/nginx/main.go (L56, L107-L115)
- [S10] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/docs/user-guide/cli-arguments.md
- [S11] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/docs/user-guide/k8s-122-migration.md
- [S12] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/docs/user-guide/multiple-ingress.md
- [S13] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/charts/ingress-nginx/values.yaml and https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/charts/ingress-nginx/templates/controller-ingressclass.yaml
- [S14] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/charts/ingress-nginx/templates/_helpers.tpl
- [S15] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/charts/ingress-nginx/templates/_params.tpl
- [S16] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/charts/ingress-nginx/templates/controller-deployment.yaml
- [S17] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/charts/ingress-nginx/Chart.yaml
- [S18] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/deploy/static/provider/cloud/deploy.yaml
- [S19] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/Changelog.md and https://github.com/kubernetes/ingress-nginx/tree/controller-v1.15.1/changelog
- [S20] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/version/version.go
- [S21] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/images/nginx/rootfs/build.sh
- [S22] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/docs/user-guide/nginx-configuration/configmap.md
- [S23] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/annotations/parser/main.go
- [S24] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/net/ssl/ssl.go (L421)

Kubernetes project

- [S25] https://kubernetes.io/blog/2025/11/11/ingress-nginx-retirement/
- [S26] https://kubernetes.io/blog/2026/03/30/kubernetes-v1-36-sneak-peek/
- [S27] https://kubernetes.io/blog/2025/03/24/ingress-nginx-cve-2025-1974/
- [S28] https://kubernetes.io/docs/reference/issues-security/official-cve-feed/ (JSON: https://kubernetes.io/docs/reference/issues-security/official-cve-feed/index.json, updated 2026-11-03)
- [S29] CVE-2025-24513: https://github.com/kubernetes/kubernetes/issues/131005
- [S30] CVE-2025-24514: https://github.com/kubernetes/kubernetes/issues/131006
- [S31] CVE-2025-1097: https://github.com/kubernetes/kubernetes/issues/131007
- [S32] CVE-2025-1098: https://github.com/kubernetes/kubernetes/issues/131008
- [S33] CVE-2025-1974: https://github.com/kubernetes/kubernetes/issues/131009
- [S34] CVE-2026-1580: https://github.com/kubernetes/kubernetes/issues/136677
- [S35] CVE-2026-24512: https://github.com/kubernetes/kubernetes/issues/136678
- [S36] CVE-2026-24513: https://github.com/kubernetes/kubernetes/issues/136679
- [S37] CVE-2026-24514: https://github.com/kubernetes/kubernetes/issues/136680
- [S38] CVE-2025-15566: https://github.com/kubernetes/kubernetes/issues/136789
- [S39] CVE-2026-3288: https://github.com/kubernetes/kubernetes/issues/137560
- [S40] CVE-2026-4342: https://github.com/kubernetes/kubernetes/issues/137893
- [S41] https://kubernetes.io/blog/2026/02/27/ingress-nginx-before-you-migrate/ (context: regex-prefix and case-insensitive matching, `use-regex` scope across Ingresses, `rewrite-target` implies regex, trailing-slash 301, URL normalization)
- [S42] https://kubernetes.io/docs/concepts/services-networking/ingress/ (Deprecated annotation, Default IngressClass, "The Ingress API has been frozen")
- [S43] https://kubernetes.io/docs/reference/access-authn-authz/admission-controllers/#defaultingressclass
- [S44] https://github.com/kubernetes/kubernetes/blob/master/plugin/pkg/admission/network/defaultingressclass/admission.go (compared with https://github.com/kubernetes/kubernetes/blob/v1.24.0/plugin/pkg/admission/network/defaultingressclass/admission.go and https://github.com/kubernetes/kubernetes/blob/v1.25.0/plugin/pkg/admission/network/defaultingressclass/admission.go)
- [S45] https://github.com/kubernetes/kubernetes/blob/master/pkg/apis/networking/validation/validation.go (compared with https://github.com/kubernetes/kubernetes/blob/v1.26.0/pkg/apis/networking/validation/validation.go and https://github.com/kubernetes/kubernetes/blob/v1.27.0/pkg/apis/networking/validation/validation.go)
- [S46] https://github.com/kubernetes/kubernetes/blob/master/staging/src/k8s.io/api/networking/v1/types.go (IngressSpec.ingressClassName) and https://github.com/kubernetes/kubernetes/blob/master/staging/src/k8s.io/api/networking/v1/well_known_annotations.go
- [S47] https://github.com/kubernetes/kubernetes/blob/master/staging/src/k8s.io/api/core/v1/types.go (ContainerStatus.image / imageID)
- [S48] https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/#use-environment-variables-to-define-arguments

Microsoft / AKS

- [S49] https://learn.microsoft.com/en-us/azure/aks/app-routing (source: https://github.com/MicrosoftDocs/azure-aks-docs/blob/main/articles/aks/app-routing.md)
- [S50] https://github.com/MicrosoftDocs/azure-aks-docs/blob/main/articles/aks/includes/ingress-nginx-retirement.md
- [S51] https://learn.microsoft.com/en-us/azure/aks/app-routing-gateway-api
- [S52] https://learn.microsoft.com/en-us/azure/aks/app-routing-nginx-to-gateway-api-migration
- [S53] https://learn.microsoft.com/en-us/azure/aks/app-routing-nginx-configuration
- [S54] https://learn.microsoft.com/en-us/azure/aks/istio-gateway-api
- [S55] AKS release notes: https://github.com/Azure/AKS/blob/master/CHANGELOG.md (sections 2025-04-06, 2025-10-12, 2026-02-08, 2026-04-28, 2026-09-04, 2026-10-25)
- [S56] https://github.com/Azure/aks-app-routing-operator/blob/main/pkg/manifests/nginx.go
- [S57] https://github.com/Azure/aks-app-routing-operator/blob/main/pkg/controller/nginxingress/default.go
- [S58] https://github.com/Azure/aks-app-routing-operator/blob/main/pkg/controller/nginxingress/nginx_ingress_controller.go
- [S59] https://github.com/Azure/aks-app-routing-operator/blob/main/pkg/config/config.go
- [S60] https://github.com/Azure/aks-app-routing-operator/blob/main/pkg/manifests/common.go and https://github.com/Azure/aks-app-routing-operator/blob/main/pkg/manifests/types.go
- [S61] https://github.com/Azure/aks-app-routing-operator/blob/main/pkg/manifests/fixtures/nginx/default_version/full.yaml
- [S62] https://github.com/Azure/aks-app-routing-operator/blob/main/api/v1alpha1/nginxingresscontroller_types.go
- [S63] https://github.com/Azure/aks-app-routing-operator/blob/main/CHANGELOG.md
- [S64] https://mcr.microsoft.com/v2/oss/v2/ingress-nginx/controller/tags/list
- [S65] https://mcr.microsoft.com/v2/oss/kubernetes/ingress/nginx-ingress-controller/tags/list
- [S70] https://github.com/Azure/application-gateway-kubernetes-ingress/blob/master/helm/ingress-azure/values.yaml (and templates/ingressclass.yaml)
- [S71] https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/migrate-from-agic-to-agc
- [S72] https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/quickstart-deploy-application-gateway-for-containers-alb-controller-addon
- [S73] https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-multiple-site-hosting-ingress-api (also how-to-ssl-offloading-ingress-api)

Other controllers and tools

- [S66] https://github.com/nginx/kubernetes-ingress/blob/main/deployments/common/ingress-class.yaml
- [S67] https://github.com/nginx/kubernetes-ingress/blob/main/internal/k8s/controller.go (`IngressControllerName`, `HasCorrectIngressClass`)
- [S68] https://github.com/nginx/kubernetes-ingress/blob/main/cmd/nginx-ingress/main.go and https://github.com/nginx/kubernetes-ingress/blob/main/cmd/nginx-ingress/flags.go
- [S69] https://github.com/nginx/kubernetes-ingress/blob/main/charts/nginx-ingress/values.yaml, https://github.com/nginx/kubernetes-ingress/blob/main/README.md, https://github.com/nginx/kubernetes-ingress/blob/main/internal/configs/annotations.go, https://github.com/nginx/kubernetes-ingress/blob/main/build/Dockerfile
- [S74] https://github.com/traefik/traefik-helm-chart/blob/master/traefik/templates/ingressclass.yaml
- [S75] https://doc.traefik.io/traefik/reference/install-configuration/providers/kubernetes/kubernetes-ingress-nginx/ (current page, re-fetched 2026-11-04; version not stated, links suggest v3.7) and https://doc.traefik.io/traefik/v3.5/reference/install-configuration/providers/kubernetes/kubernetes-ingress-nginx/
- [S76] https://github.com/Kong/charts/blob/main/charts/kong/templates/ingress-class.yaml and https://github.com/Kong/charts/blob/main/charts/kong/values.yaml
- [S77] https://github.com/haproxytech/helm-charts/blob/main/kubernetes-ingress/templates/controller-ingressclass.yaml and https://github.com/haproxytech/helm-charts/blob/main/kubernetes-ingress/values.yaml
- [S78] https://haproxy-ingress.github.io/docs/configuration/keys/
- [S79] https://github.com/projectcontour/contour/blob/main/internal/ingressclass/ingressclass.go, https://github.com/projectcontour/contour/blob/main/internal/annotation/annotations.go, https://projectcontour.io/docs/main/config/ingress/, https://github.com/projectcontour/contour/blob/main/examples/gateway/01-gatewayclass.yaml
- [S80] https://istio.io/latest/docs/tasks/traffic-management/ingress/kubernetes-ingress/
- [S81] https://github.com/istio/istio/blob/master/pilot/pkg/features/pilot.go (`PILOT_GATEWAY_API_DEFAULT_GATEWAYCLASS_NAME`, `PILOT_GATEWAY_API_CONTROLLER_NAME`)
- [S82] https://github.com/cilium/cilium/blob/main/install/kubernetes/cilium/templates/cilium-ingress-class.yaml and https://docs.cilium.io/en/stable/network/servicemesh/ingress/
- [S83] https://github.com/envoyproxy/gateway/blob/main/examples/kubernetes/quickstart.yaml and https://gateway.envoyproxy.io/docs/install/migrating-to-envoy/
- [S84] https://github.com/nginx/nginx-gateway-fabric/blob/main/charts/nginx-gateway-fabric/values.yaml
- [S85] https://github.com/kubernetes-sigs/ingress2gateway/blob/main/pkg/i2gw/providers/ingressnginx/ingressnginx.go, https://github.com/kubernetes-sigs/ingress2gateway/blob/main/pkg/i2gw/providers/ingressnginx/resource_reader.go, https://github.com/kubernetes-sigs/ingress2gateway/blob/main/pkg/i2gw/providers/common/utils.go, https://github.com/kubernetes-sigs/ingress2gateway/blob/main/README.md
- [S86] https://www.chainguard.dev/unchained/keeping-ingress-nginx-alive (dated 2025-12-22) and https://github.com/chainguard-forks/ingress-nginx/releases (both re-fetched 2026-11-04)
- [S87] https://www.wiz.io/blog/ingress-nginx-kubernetes-vulnerabilities
- [S88] https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/quickstart-deploy-application-gateway-for-containers-alb-controller-helm (ms.date 2026-11-03)
- [S89] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/rootfs/Dockerfile (L87-L88) and https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/rootfs/Dockerfile-chroot
- [S90] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/charts/ingress-nginx/templates/clusterrolebinding.yaml, https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/charts/ingress-nginx/templates/clusterrole.yaml, https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/charts/ingress-nginx/templates/controller-role.yaml
- [S91] https://kubernetes.io/docs/reference/access-authn-authz/rbac/ (Role is namespaced; ClusterRole/ClusterRoleBinding are needed for cluster-scoped resources)

Added during the 2026-11-04 fact-check

- [S92] AGC private ingress: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/private-ingress (ms.date 2026-10-27; class table `azure-alb-external` / `azure-alb-internal`) and https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-private-ingress-gateway-api (ms.date 2026-11-03; `gatewayClassName: azure-alb-internal`)
- [S93] https://github.com/chainguard-forks/ingress-nginx/blob/main/internal/ingress/controller/ingressclass/ingressclass.go (fetched raw on 2026-11-04)
- [S94] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/inspector/ingress.go (L28-L62) and https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/inspector/rules.go (L25-L29)
- [S95] Gateway API: https://github.com/kubernetes-sigs/gateway-api/blob/main/CHANGELOG/1.6-CHANGELOG.md ("UDPRoute & TCPRoute Graduation"), with the standard-channel bundles https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.5.1/standard-install.yaml (TLSRoute `v1` served) and https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.6.1/standard-install.yaml (TCPRoute, UDPRoute, TLSRoute `v1` served)
- [S96] https://pkg.go.dev/flag (Go standard `flag` package; not re-fetched in this pass)
- [S97] https://github.com/Azure/aks-app-routing-operator/blob/main/pkg/controller/keyvault/spc/consts.go (`istioGatewayClassName = "istio"`, `appRoutingIstioGatewayClassName = "approuting-istio"`)

---

## Verification log (2026-11-04)

**Method.** Each claim was checked against a primary source, local copies first:

- the ingress-nginx `controller-v1.15.1` tree and release pages;
- the AKS app routing operator `main`, the MCR tag lists and the AKS CHANGELOG;
- Microsoft Learn sources;
- Kubernetes source at the cited tags, and the official CVE feed JSON (updated 2026-11-03);
- the Gateway API bundles;
- the F5, Contour, Kong, Traefik, HAProxy, Cilium, Envoy Gateway, NGF and Istio sources.

**Online checks used: 15 (the maximum), for what was missing locally.** 14 were fetches:

- Traefik provider docs, current page and v3.5;
- [S26] and [S27], twice each, because the article body sits past a long sidebar;
- [S25] and [S41];
- the Chainguard releases page, its blog post and the fork's `ingressclass.go`;
- the Istio Kubernetes Ingress page, the HAProxy Ingress keys page and the Cilium ingress page.

The 15th was one web search for the `approuting-istio` controllerName.

**Claims checked: 228**, counting one per table row or bullet that states a checkable fact:

| Section | Claims |
|---|---|
| §0 and §1, community ingress-nginx | 108 |
| §2, AKS app routing NGINX | 39 |
| §3, releases, archive and fork | 12 |
| §4, CVEs | 25 |
| §5, lookalike controllers | 21 |
| §6, flags and migration behaviours | 23 |

**Confirmed without change** (the parts the tool depends on most):

- Every IngressClass `spec.controller` string in §1.1, §2.2 and §5, except the AGC Ingress class and `approuting-istio`, which stay UNVERIFIED:
  - `k8s.io/ingress-nginx`, `webapprouting.kubernetes.azure.com/nginx`, `approuting.kubernetes.azure.com/<NIC>`;
  - `azure/application-gateway`, `alb.networking.azure.io/alb-controller`;
  - `traefik.io/ingress-controller`, `ingress-controllers.konghq.com/kong`;
  - `haproxy.org/ingress-controller[/<class>]`, `haproxy-ingress.github.io/controller`;
  - `istio.io/ingress-controller`, `istio.io/gateway-controller`, `cilium.io/ingress-controller`;
  - `gateway.envoyproxy.io/gatewayclass-controller`, `nginx.org/ingress-controller`, `gateway.nginx.org/nginx-gateway-controller`.
- All image repositories and digests, all release dates and the archive date.
- All CVE IDs, vectors, scores and fixed versions.
- The `GetIngressClass` precedence and every §6 flag default.

**Corrections** (old → new, source):

1. **`--disable-catch-all`** (§1.2.3, §6).
   - Old: "ignores Ingresses whose spec has only a default backend".
   - New: it ignores every Ingress that sets `spec.defaultBackend`, even one that also has rules. `hasCatchAllIngressRule` returns `spec.DefaultBackend != nil`, and the check runs on add, update and delete.
   - Source: https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/controller/store/store.go (L410, L451-L454, L484, L496, L897-L899).
2. **v1.14.2 → v1.14.3 typo note** (§4.2).
   - Old: the note named CVE-2026-1580, CVE-2026-24513 and CVE-2026-24514.
   - New: all four Feb-2026 CVEs, CVE-2026-24512 included. Each issue has a maintainer comment dated 2026-02-18.
   - Source: https://github.com/kubernetes/kubernetes/issues/136678 (also issues 136677, 136679 and 136680).
3. **Chainguard fork `spec.controller`** (§3, §7.10).
   - Old: "not checked (UNVERIFIED)".
   - New: VERIFIED on `main`: `DefaultControllerName = "k8s.io/ingress-nginx"`, `DefaultAnnotationValue = "nginx"`.
   - Source: https://github.com/chainguard-forks/ingress-nginx/blob/main/internal/ingress/controller/ingressclass/ingressclass.go
4. **Chainguard offer wording** (§3).
   - Old: "source is free and container images are commercial".
   - New: the source is public on GitHub; the images are commercial, with access on request; the post is dated 2025-12-22.
   - Source: https://www.chainguard.dev/unchained/keeping-ingress-nginx-alive
5. **AGC classes** (§5, §7.1).
   - Old: `azure-alb-external` only.
   - New: `azure-alb-internal` (private frontend, preview) also exists, for both Gateway API and Ingress. Its controller strings are UNVERIFIED.
   - Source: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/private-ingress
6. **TCPRoute and UDPRoute channel** (§6).
   - Old: "Needs TCPRoute in Gateway API (experimental channel)".
   - New: TCPRoute and UDPRoute are GA (`v1`, standard channel) since Gateway API v1.6. TLSRoute `v1` is in the v1.5.1 standard bundle and absent from v1.4.1.
   - Source: https://github.com/kubernetes-sigs/gateway-api/blob/main/CHANGELOG/1.6-CHANGELOG.md
7. **Traefik ingress-nginx provider enablement** (§5 caveat, §7.11).
   - Old: "enabled by `--experimental.kubernetesingressnginx` and `--providers.kubernetesingressnginx`".
   - New: v3.5 needs both flags. The current page shows only `--providers.kubernetesingressnginx=true`, no experimental label, and the defaults `watchIngressWithoutClass: false` and `ingressClassByName: false`.
   - Source: https://doc.traefik.io/traefik/reference/install-configuration/providers/kubernetes/kubernetes-ingress-nginx/
8. **Dalec MCR tags** (§2.4).
   - Old: "`v1.14.0` to `v1.14.5[-N]`, `v1.15.0`".
   - New: `v1.14.0`, `v1.14.1`, `v1.14.3`, `v1.14.4` and `v1.14.5`, each with `-N` variants, and no `v1.14.2`; also `v1.15.0[-N]`. Highest revisions listed: `v1.13.10-17`, `v1.13.11-3`, `v1.14.5-27`, `v1.15.1-29`.
   - Source: https://mcr.microsoft.com/v2/oss/v2/ingress-nginx/controller/tags/list
9. **Helm `rbac.scope`** (§1.2.3).
   - Old: "`rbac.scope=true`, which the chart requires to match `controller.scope.enabled`; no ClusterRoleBinding is rendered".
   - New: neither the ClusterRole nor the ClusterRoleBinding is rendered. The chart only rejects `rbac.scope=true` combined with `scope.enabled=false`. The namespaced Role lists `ingressclasses`, which has no effect.
   - Source: https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/charts/ingress-nginx/templates/clusterrole.yaml
10. **Omitted filter** (§0, §1.2.3, §6).
    - Old: the deep inspector was not mentioned.
    - New: added `--deep-inspect` (default `true`), which ignores Ingresses whose host, path or TLS fields match blocked patterns. Also noted that the namespace filter runs before the class check and the other filters run after it.
    - Source: https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/inspector/rules.go
11. **F5 startup check and flag style** (§5).
    - Old: "exits at startup if the class named by `-ingress-class` has another controller".
    - New: it also exits if that IngressClass is missing. Added: the chart uses single-dash args but Go's `flag` package also accepts double dashes, so match both.
    - Source: https://github.com/nginx/kubernetes-ingress/blob/main/cmd/nginx-ingress/main.go
12. **Retirement announcement** (§3).
    - Old: a paraphrase dated 2025-11-11.
    - New: verbatim quotes. The kubernetes.io byline is 2025-11-11, and the page mirrors a kubernetes.dev post whose URL carries 2025/11/12.
    - Source: https://kubernetes.io/blog/2025/11/11/ingress-nginx-retirement/
13. **Admission-controller exposure** (§6, `--validating-webhook` row).
    - Old: "Exposure to CVE-2025-1974 and CVE-2026-24514".
    - New: CVE-2025-24513 is added. Its advisory describes a path traversal "by the ingress-nginx Admission Controller feature" and gives disabling it as the mitigation.
    - Source: https://github.com/kubernetes/kubernetes/issues/131005

**Additions** (no prior claim was wrong):

- §1.3: chroot digests for v1.12.1 and v1.11.5 (https://github.com/kubernetes/ingress-nginx/releases/tag/controller-v1.12.1).
- §3: last releases of the 1.12 line (v1.12.8, 2025-11-04) and the 1.11 line (v1.11.8) (https://github.com/kubernetes/ingress-nginx/releases).
- §4.1: CVE-2025-24514 does not affect controllers with annotation validation on, which is the default from v1.12.0 (https://github.com/kubernetes/kubernetes/issues/131006).
- §5: a read-only `kubectl get gatewayclass` check for `approuting-istio`.

**Left UNVERIFIED** (claim, then reason):

1. AGC IngressClass `spec.controller` for `azure-alb-external` and `azure-alb-internal`: Microsoft docs show no IngressClass object.
2. AGC `azure-alb-internal` GatewayClass `controllerName`: the docs show no GatewayClass object for it.
3. `approuting-istio` GatewayClass `controllerName`: undocumented; the operator matches by name; the web search found nothing.
4. Contour IngressClass `spec.controller`: no canonical value, because Contour matches by name.
5. Whether Microsoft MCR builds with upstream-looking tags carry backported fixes: not documented.
6. Whether AKS keeps the `DefaultIngressClass` admission plugin enabled: AKS does not publish its plugin list.
7. The IngressClass or annotation value of the legacy AKS HTTP application routing add-on: the local copies are 404 pages and no online check was left.
8. The 1h Event TTL: general knowledge, not re-checked.
9. The Chainguard fork's CVE IDs that are absent from the Kubernetes CVE feed: not checked.
10. The Wiz publication date of 2025-03-24 for IngressNightmare: [S87] was not re-fetched. The feed dates the advisories 2025-03-23 UTC.
11. The remark that the Envoy Gateway migration guide converts Ingress rather than serving it: [S83] was not re-fetched.
12. Traefik details:
    - the version in which the provider defaults and the experimental label changed;
    - whether `--experimental.kubernetesingressnginx` is still accepted or required;
    - versions before v3.5.
13. That Go's `flag` package accepts `--name`: [S96] was not re-fetched in this pass.
14. The release date of controller-v1.11.8: not checked.
