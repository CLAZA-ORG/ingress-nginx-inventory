# ingress-nginx-inventory

[Version française](README.fr.md)

A read-only command-line tool that inventories how a Kubernetes cluster uses [ingress-nginx](https://github.com/kubernetes/ingress-nginx) and writes a migration-readiness report for moving to the Gateway API on Azure Kubernetes Service (AKS). It is built for AKS first and works on any cluster.

- **One file**, `ingress-inventory.mjs`, with no dependencies. It needs Node.js 18 or later (tested on Node.js 24, the version in Cloud Shell), and kubectl except in offline mode.
- **Read-only.** It runs `kubectl get`, `kubectl version` and `kubectl config current-context`, and nothing else. It never reads Secrets.
- **Nothing leaves your machine.** No telemetry and no network connection of its own: kubectl talks to your API server, and the tool writes its files to one output directory.
- **English or French** report (`--lang en|fr`), with an `--anonymize` mode for sharing it.
- MIT License, maintained by CLAZA IT.

## What the report covers

- **Controllers**: the ingress-nginx controllers in the cluster (community, AKS application routing add-on, forks and vendor builds), their version, dated support status and known CVEs, and the Ingresses each one serves, following ingress-nginx's own selection rules.
- **Scope**: Ingresses, namespaces, routes, hosts, TLS hosts and TLS secret names, regex and `ImplementationSpecific` paths, backend Services.
- **Translation profile**: every annotation and controller ConfigMap key in use, sorted into buckets, with the Gateway API construct and the support on each of the four targets below.
- **Defaults that change** after migration, starting from your controller's configuration, with a test for each.
- **Network**: the load balancer addresses that will change, and the Gateway API resources already in the cluster.
- **Next steps**, including the ingress2gateway command that drafts Gateway API manifests.

The four AKS targets:

| Report column | Target | What it is |
|---|---|---|
| app routing GW | `appRoutingGateway` | AKS application routing add-on, Gateway API implementation (Istio-based; GatewayClass `approuting-istio`) |
| AGC | `agc` | Application Gateway for Containers, Gateway API (GatewayClass `azure-alb-external`) |
| AGC Ingress | `agcIngress` | Application Gateway for Containers, Ingress API: you keep your Ingress objects and change the controller (`ingressClassName: azure-alb-external`) |
| Istio | `istio` | AKS Istio-based service mesh add-on, Gateway API ingress (GatewayClass `istio`) |

## Why now

Status on 2026-11-04, with sources. The report prints the same dated lines from its catalog.

**ingress-nginx**

- The Kubernetes project announced the retirement on 2025-11-11: best-effort maintenance until March 2026, then no fixes ([Kubernetes blog](https://kubernetes.io/blog/2025/11/11/ingress-nginx-retirement/)).
- The final releases, v1.15.1, v1.14.5 and v1.13.9, came out on 2026-03-19, and the repository was archived on 2026-03-24 ([releases](https://github.com/kubernetes/ingress-nginx/releases)). A version above v1.15.1 is a fork or a vendor build; Chainguard's fork has reached v1.15.12 ([Chainguard releases](https://github.com/chainguard-forks/ingress-nginx/releases)).
- The official Kubernetes CVE feed, read on 2026-11-03, lists no ingress-nginx CVE after CVE-2026-4342 (CVSS 8.8), fixed only in v1.13.9, v1.14.5 and v1.15.1 ([CVE feed](https://kubernetes.io/docs/reference/issues-security/official-cve-feed/), [issue](https://github.com/kubernetes/kubernetes/issues/137893)).
- AKS application routing add-on, managed NGINX: Microsoft provides critical security patches "through November 2026", with no published end day ([AKS docs](https://learn.microsoft.com/en-us/azure/aks/app-routing)), and none after that ([AKS blog, 2026-11-02](https://blog.aks.azure.com/2026/11/02/automatic-enhancements)). No extension has been announced, and [Azure/AKS#5516](https://github.com/Azure/AKS/issues/5516) is still open. The AKS release of 2026-10-25 shipped builds v1.13.10-13 and v1.15.1-23 ([release](https://github.com/Azure/AKS/releases/tag/2026-10-25)); the v1.13.10 and v1.13.11 builds have no upstream tag (the registry lists up to v1.13.11-3 and v1.15.1-29: [MCR tags](https://mcr.microsoft.com/v2/oss/v2/ingress-nginx/controller/tags/list)).

**Targets**

- `appRoutingGateway`: generally available in the AKS release of 2026-04-28, and the default for new AKS Automatic clusters on 1.36 and later ([release](https://github.com/Azure/AKS/releases/tag/2026-04-28)). The managed Gateway API CRDs went GA with that release according to the AKS blog only ([AKS blog, 2026-06-10](https://blog.aks.azure.com/2026/06/10/app-routing-gateway-api-ga)).
- `istio`: no formal GA announcement. A documentation commit of 2026-05-27 removed the preview label, and its message says GA ([commit](https://github.com/MicrosoftDocs/azure-aks-docs/commit/3f2f22fbea677d6dc7e40ac498400373d85e70cc)); the add-on overview still says Gateway API is "not yet supported" ([overview](https://learn.microsoft.com/en-us/azure/aks/istio-about)). It needs revision asm-1-26 or later and the managed Gateway API ([docs](https://learn.microsoft.com/en-us/azure/aks/istio-gateway-api)). Expected end of life: asm-1-29 around December 2026, asm-1-30 around January 2027, asm-1-31 around March 2027 ([support policy](https://learn.microsoft.com/en-us/azure/aks/istio-support-policy)).
- `agc` and `agcIngress`: generally available since 2024-02-27 ([Azure Updates](https://azure.microsoft.com/updates?id=general-availability-application-gateway-for-containers)). ALB Controller 1.13.0 brings Gateway API v1.6.2 and needs Kubernetes 1.32 or later; the AKS add-on, in preview, pins ALB Controller 1.10.x on AKS 1.35 and earlier and 1.11.x on 1.36 and later ([release notes](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/alb-controller-release-notes)). The last published conformance report covers Gateway API v1.2.1 with ALB Controller 1.7.9, dated 2025-07-18 ([report](https://github.com/kubernetes-sigs/gateway-api/blob/main/conformance/reports/v1.2.1/azure-application-gateway-for-containers/standard-v1.2.1-default-report.yaml)).
- Gateway API: v1.7.0 was released on 2026-10-29 ([releases](https://github.com/kubernetes-sigs/gateway-api/releases)). AKS installs its managed Gateway API CRDs from the standard channel only, by Kubernetes minor version: v1.2.1 up to 1.33, v1.3.0 on 1.34, v1.4.1 on 1.35, v1.5.1 on 1.36, v1.6.1 on 1.37 and later ([AKS docs](https://learn.microsoft.com/en-us/azure/aks/managed-gateway-api)). AKS 1.37 became generally available on 2026-10-25 ([release](https://github.com/Azure/AKS/releases/tag/2026-10-25)). That bundle decides which Gateway API features you can use.

<details>
<summary>ingress-nginx CVEs and their first fixed versions</summary>

| Fixed in | CVE (issue) | What | CVSS 3.1 |
|---|---|---|---|
| v1.11.5, v1.12.1 | [CVE-2025-1974](https://github.com/kubernetes/kubernetes/issues/131009) | admission controller remote code execution ("IngressNightmare") | 9.8 |
| v1.11.5, v1.12.1 | [CVE-2025-1097](https://github.com/kubernetes/kubernetes/issues/131007) | `auth-tls-match-cn` annotation | 8.8 |
| v1.11.5, v1.12.1 | [CVE-2025-1098](https://github.com/kubernetes/kubernetes/issues/131008) | mirror annotations | 8.8 |
| v1.11.5, v1.12.1 | [CVE-2025-24514](https://github.com/kubernetes/kubernetes/issues/131006) | `auth-url` annotation | 8.8 |
| v1.11.5, v1.12.1 | [CVE-2025-24513](https://github.com/kubernetes/kubernetes/issues/131005) | auth secret path traversal | 4.8 |
| v1.12.5, v1.13.1 | [CVE-2025-15566](https://github.com/kubernetes/kubernetes/issues/136789) | `auth-proxy-set-headers` annotation | – |
| v1.13.7, v1.14.3 | [CVE-2026-1580](https://github.com/kubernetes/kubernetes/issues/136677) | `auth-method` annotation | – |
| v1.13.7, v1.14.3 | [CVE-2026-24512](https://github.com/kubernetes/kubernetes/issues/136678) | `rules.http.paths.path` field | – |
| v1.13.7, v1.14.3 | [CVE-2026-24513](https://github.com/kubernetes/kubernetes/issues/136679) | `auth-url` bypass | – |
| v1.13.7, v1.14.3 | [CVE-2026-24514](https://github.com/kubernetes/kubernetes/issues/136680) | admission controller denial of service | – |
| v1.13.8, v1.14.4, v1.15.0 | [CVE-2026-3288](https://github.com/kubernetes/kubernetes/issues/137560) | `rewrite-target` annotation | 8.8 |
| v1.13.9, v1.14.5, v1.15.1 | [CVE-2026-4342](https://github.com/kubernetes/kubernetes/issues/137893) | comment-based injection | 8.8 |

"–": the issue gives a CVSS vector but no score. IngressNightmare affected every version below v1.11.5, and v1.12.0; the fixes came out on 2025-03-25 ([releases](https://github.com/kubernetes/ingress-nginx/releases)). A version in a minor line older than every line listed for a CVE is not fixed (for example any 1.12 release for the 2026 CVEs). The report applies these rules to the controller version it finds. Microsoft and other vendor builds use their own numbering, so the report gives their version and leaves their CVE status to the vendor.

</details>

## Quick start in Azure Cloud Shell

Cloud Shell already has Node.js, kubectl and the Azure CLI. Run these commands in its Bash shell. Your account needs read access to the cluster: see [Permissions](#permissions).

<!-- TODO before publishing: REPO_URL placeholder (https://github.com/CLAZA-ORG/ingress-nginx-inventory). Release v0.1.0 must carry the assets ingress-inventory.mjs and SHA256SUMS. -->
```bash
# 1. Point kubectl at the cluster
az aks get-credentials --resource-group <resource-group> --name <cluster-name>
kubectl config current-context

# 2. Download a pinned release into the persistent share, then verify its SHA-256
mkdir -p ~/clouddrive/ingress-inventory && cd ~/clouddrive/ingress-inventory
curl -fsSL -o ingress-inventory.mjs https://github.com/CLAZA-ORG/ingress-nginx-inventory/releases/download/v0.1.0/ingress-inventory.mjs
curl -fsSL -o SHA256SUMS https://github.com/CLAZA-ORG/ingress-nginx-inventory/releases/download/v0.1.0/SHA256SUMS
sha256sum -c SHA256SUMS          # must print: ingress-inventory.mjs: OK

# 3. Run it (add --lang fr for a report in French)
node ingress-inventory.mjs
```

The tool prints a short summary and the paths of the files it wrote, in a new directory `ingress-inventory-<context>-<YYYYMMDD-HHmm>`. To copy a file out of Cloud Shell, use **Manage files > Download** and enter its full path, for example `/home/<user>/clouddrive/ingress-inventory/<output-directory>/report.md`; paths are case-sensitive ([Cloud Shell docs](https://learn.microsoft.com/en-us/azure/cloud-shell/use-the-shell-window)). [SECURITY.md](SECURITY.md#verify-a-release) explains what the checksum proves.

If the API server is private, see [Private clusters](#private-clusters).

### Cloud Shell notes

- **Node.js 24 is preinstalled.** The October 2026 release notes list v24.22.1 ([release notes](https://learn.microsoft.com/en-us/azure/cloud-shell/release-notes)); changes can take 3 to 4 weeks to reach every region ([Azure/CloudShell](https://github.com/Azure/CloudShell)). Nothing to install: the tool is one file.
- **kubectl 1.37 and older clusters.** Cloud Shell ships kubectl 1.37 ([release notes](https://learn.microsoft.com/en-us/azure/cloud-shell/release-notes)). Kubernetes supports kubectl within one minor version of the API server ([version skew policy](https://kubernetes.io/releases/version-skew-policy/)), and AKS 1.34 and 1.35 are still generally available ([AKS versions](https://learn.microsoft.com/en-us/azure/aks/supported-kubernetes-versions)): with those clusters, Cloud Shell's kubectl is outside the supported skew. The tool only runs the read commands listed below. If kubectl reports errors, run the tool with `--kubectl <path>` pointing to a kubectl within one minor version of your cluster.
- **Write under `~/clouddrive`.** With a storage account mounted, `~/clouddrive` is an Azure Files share that persists between sessions and shows in the portal ([persist files](https://learn.microsoft.com/en-us/azure/cloud-shell/persisting-shell-storage)). Anyone with enough rights on that subscription can reach the share ([same page](https://learn.microsoft.com/en-us/azure/cloud-shell/persisting-shell-storage)): delete the outputs when you no longer need them, or use `--anonymize`. In an ephemeral session, files are deleted shortly after you close it ([ephemeral sessions](https://learn.microsoft.com/en-us/azure/cloud-shell/get-started/ephemeral)): download them first.
- **20-minute idle timeout.** Cloud Shell ends a session after 20 minutes without interactive activity, and ends long-running non-interactive work without warning ([FAQ](https://learn.microsoft.com/en-us/azure/cloud-shell/faq-troubleshooting)). Start the tool in an active session and download the outputs promptly.
- **Sign-in errors.** If `az` or kubectl reports an MSI or token audience error, run `az login` and try again ([FAQ](https://learn.microsoft.com/en-us/azure/cloud-shell/faq-troubleshooting)).

## What it runs, and what it never does

In live mode the tool runs these commands, in this order:

| # | Command | Why | If it fails |
|---|---|---|---|
| 1 | `kubectl version -o json` | Kubernetes version | warns, continues |
| 2 | `kubectl config current-context` (only without `--context`) | context name for the report | warns, uses `unknown-context` |
| 3 | `kubectl get ingressclasses.networking.k8s.io -o json` | which controller owns each class | warns, continues |
| 4 | `kubectl get ingresses.networking.k8s.io -A -o json` | the Ingresses | **stops** (exit code 1) |
| 5 | `kubectl get deployments.apps -A -o json`<br>`kubectl get daemonsets.apps -A -o json` | find the controllers: image, controller flags | warns, continues |
| 6 | `kubectl get services -A -o json` | controller load balancers | warns, continues |
| 7 | `kubectl get configmap <name> -n <namespace> -o json` | each ConfigMap named by the `--configmap`, `--tcp-services-configmap` or `--udp-services-configmap` flag of a detected controller | warns, continues |
| 8 | `kubectl get nginxingresscontrollers.approuting.kubernetes.azure.com -o json`<br>`kubectl get gatewayclasses.gateway.networking.k8s.io -o json`<br>`kubectl get gateways.gateway.networking.k8s.io -A -o json`<br>`kubectl get httproutes.gateway.networking.k8s.io -A -o json`<br>`kubectl get crd gateways.gateway.networking.k8s.io -o jsonpath={.metadata.annotations}` | AKS add-on controllers, Gateway API already present, Gateway API bundle version and channel | ignored: these resource types are optional |

Every call also gets `--request-timeout=60s`, plus `--context` and `--kubeconfig` when you pass them. kubectl is started directly, never through a shell, and every call goes through one function that checks it against an allowlist.

The tool never:

- runs another kubectl verb: the allowlist admits `get`, `version` and `config current-context` only, and tests check that it rejects `apply`, `delete`, `patch`, `exec` and any form of `secrets`;
- reads Secrets: TLS secret names come from the Ingress field `spec.tls[].secretName`;
- starts any program other than kubectl, and never calls Azure: it does not run `az`, not even `az aks command invoke` (for private clusters, you run the export yourself);
- opens a network connection of its own, sends telemetry or checks for updates;
- outputs container environment variables or arbitrary container arguments: from controller workloads it keeps the image, an allowlist of controller flags, pod template labels, namespace, name and replica count;
- prints snippet values: for snippet keys the report gives the number of lines;
- writes outside the `--out` directory, or into a non-empty directory it did not create.

## Permissions

[`docs/rbac/read-only-clusterrole.yaml`](docs/rbac/read-only-clusterrole.yaml) is a least-privilege ClusterRole for exactly the commands above: `get` and `list` only, no Secrets, no wildcard, ConfigMaps and the Gateway API CRD by name only. Version and API discovery requests need no rule: Kubernetes allows them for every authenticated user.

```bash
kubectl apply -f docs/rbac/read-only-clusterrole.yaml    # creates the ClusterRole only
```

- **Bindings.** The file ends with two binding examples, commented out: (A) an Entra ID group, on a cluster with Microsoft Entra ID integration and Kubernetes RBAC; (B) a dedicated ServiceAccount with a short-lived token, on any cluster.
- **ConfigMap names.** The role lists the default names: `ingress-nginx-controller`, `ingress-nginx-tcp`, `ingress-nginx-udp`, and `nginx` for the AKS add-on. A Helm release not named `ingress-nginx`, or an extra NginxIngressController, uses other names: add them, otherwise the tool warns and the report lacks that controller's settings.
- **Clusters without Microsoft Entra ID.** There, the user kubeconfig from `az aks get-credentials` has the same effect as the admin one ([Microsoft docs](https://learn.microsoft.com/en-us/azure/aks/control-kubeconfig-access)). Read-only is then a property of this tool, not of your credential. Option B makes it a property of the credential too.
- **Download the kubeconfig.** `az aks get-credentials` needs the Azure role "Azure Kubernetes Service Cluster User Role" ([built-in roles](https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles/containers)).

Check what a credential can do before you run the tool:

```bash
kubectl auth can-i list ingresses.networking.k8s.io -A    # yes
kubectl auth can-i get secrets -A                         # no, when only the read-only role is bound
```

<details>
<summary>Build a read-only kubeconfig for option B</summary>

After applying the ClusterRole and option B with your usual (admin) credential:

```bash
CTX=$(kubectl config current-context)
SERVER=$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}')
kubectl config view --minify --raw -o jsonpath='{.clusters[0].cluster.certificate-authority-data}' | base64 -d > inventory-ca.crt
TOKEN=$(kubectl create token inventory-reader -n ingress-nginx-inventory --duration=1h)
kubectl config --kubeconfig=inventory.kubeconfig set-cluster "$CTX" --server="$SERVER" --certificate-authority=inventory-ca.crt --embed-certs=true
kubectl config --kubeconfig=inventory.kubeconfig set-credentials inventory-reader --token="$TOKEN"
kubectl config --kubeconfig=inventory.kubeconfig set-context "$CTX" --cluster="$CTX" --user=inventory-reader
kubectl config --kubeconfig=inventory.kubeconfig use-context "$CTX"
node ingress-inventory.mjs --kubeconfig inventory.kubeconfig
rm inventory.kubeconfig inventory-ca.crt    # the token itself stays valid for one hour
```

`kubectl create token` issues a token that expires after the given duration ([kubectl docs](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_create/kubectl_create_token/)).

</details>

<details>
<summary>Clusters that use Microsoft Entra ID authorization (Azure RBAC)</summary>

With Microsoft Entra ID authorization, Azure role assignments decide access to the Kubernetes API ([Entra ID authorization](https://learn.microsoft.com/en-us/azure/aks/entra-id-authorization)). Check the result with `kubectl auth can-i`.

- The built-in role "Azure Kubernetes Service RBAC Reader" is not enough: it does not cover IngressClasses or custom resources such as the Gateway API and NginxIngressController ([built-in roles](https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles/containers)).
- A custom role with these data actions covers the commands above, except ConfigMaps ([Azure permissions](https://learn.microsoft.com/en-us/azure/role-based-access-control/permissions/containers)):

```json
{
  "Name": "AKS ingress-nginx-inventory reader",
  "Description": "Read-only Kubernetes data actions for ingress-nginx-inventory. No Secrets.",
  "Actions": [],
  "NotActions": [],
  "DataActions": [
    "Microsoft.ContainerService/managedClusters/networking.k8s.io/ingresses/read",
    "Microsoft.ContainerService/managedClusters/networking.k8s.io/ingressclasses/read",
    "Microsoft.ContainerService/managedClusters/services/read",
    "Microsoft.ContainerService/managedClusters/apps/deployments/read",
    "Microsoft.ContainerService/managedClusters/apps/daemonsets/read",
    "Microsoft.ContainerService/managedClusters/apiextensions.k8s.io/customresourcedefinitions/read",
    "Microsoft.ContainerService/managedClusters/customresources/read"
  ],
  "NotDataActions": [],
  "AssignableScopes": ["/subscriptions/<subscription-id>"]
}
```

- `customresources/read` covers every custom resource in scope. An Azure ABAC condition, in preview, can limit it to the API groups `gateway.networking.k8s.io` and `approuting.kubernetes.azure.com` ([Entra ID authorization](https://learn.microsoft.com/en-us/azure/aks/entra-id-authorization)). Azure data actions cannot be limited to one object, so `customresourcedefinitions/read` covers every CRD.
- ConfigMaps: assign the built-in "Azure Kubernetes Service RBAC Reader" at the scope of each controller namespace (`<cluster-resource-id>/namespaces/<namespace>`), as documented for that role ([Entra ID authorization](https://learn.microsoft.com/en-us/azure/aks/entra-id-authorization)). It reads the other objects of that namespace too, but no Secrets ([built-in roles](https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles/containers)).
- Never grant `Microsoft.ContainerService/managedClusters/*/read`: it also matches `Microsoft.ContainerService/managedClusters/secrets/read` ([Azure permissions](https://learn.microsoft.com/en-us/azure/role-based-access-control/permissions/containers)).
- New role assignments can take up to five minutes to propagate ([Entra ID authorization](https://learn.microsoft.com/en-us/azure/aks/entra-id-authorization)).

</details>

## Private clusters

Cloud Shell cannot reach a private API server unless it is deployed into a virtual network ([Cloud Shell in a virtual network](https://learn.microsoft.com/en-us/azure/cloud-shell/vnet/overview)). Pick the path that fits ([connect to a private AKS cluster](https://learn.microsoft.com/en-us/azure/aks/private-cluster-connect)):

| Situation | Path |
|---|---|
| Cloud Shell already deployed in a connected virtual network | the quick start, from that Cloud Shell |
| Azure Bastion, Standard or Premium SKU, with native client support | `az aks bastion tunnel`, then the tool in its subshell |
| A jump box or a self-hosted agent on a connected network | the tool on that machine |
| No network path, Run command allowed | an export with `az aks command invoke`, then the tool with `--from-dir` |
| AKS Automatic, or network resource group lockdown | not Cloud Shell or Bastion, which do not support them: a jump box, VPN or ExpressRoute; command invoke is not documented for these clusters |

### Export with `az aks command invoke`

`az aks command invoke` runs a command in a pod inside the cluster, so no network path to the API server is needed ([command invoke](https://learn.microsoft.com/en-us/azure/aks/access-private-cluster)). Microsoft says it is "not for programmatic access", and the tool never calls it: you run the export below, then analyse the files offline.

- **Output limit.** Output above 512 kB per call is truncated ([command invoke](https://learn.microsoft.com/en-us/azure/aks/access-private-cluster)). The recipe makes one call per resource type, and you split a type by namespace if it is still too large. A truncated reply is not valid JSON, so the recipe checks every file.
- **Azure permissions.** `Microsoft.ContainerService/managedClusters/read`, `Microsoft.ContainerService/managedClusters/runCommand/action` and `Microsoft.ContainerService/managedClusters/commandResults/read` ([Azure permissions](https://learn.microsoft.com/en-us/azure/role-based-access-control/permissions/containers)). Run command executes any shell command in a pod of your cluster: treat it as a privileged permission.
- **Kubernetes identity.** On clusters with Microsoft Entra ID integration the command runs with your identity, so your Kubernetes permissions apply ([troubleshooting](https://learn.microsoft.com/en-us/troubleshoot/azure/azure-kubernetes/connectivity/resolve-az-aks-command-invoke-failures), [Azure CLI source](https://github.com/Azure/azure-cli/blob/dev/src/azure-cli/azure/cli/command_modules/acs/custom.py)). Without that integration, the identity used in the pod is not documented.
- **When it fails.** A cluster can disable Run command (`disableRunCommand`) ([command invoke](https://learn.microsoft.com/en-us/azure/aks/access-private-cluster)). Azure Policy can deny the `command-<ID>` pod: exempt the `aks-command` namespace. In Cloud Shell, "Failed to connect to MSI" is fixed by running `az login` first ([troubleshooting](https://learn.microsoft.com/en-us/troubleshoot/azure/azure-kubernetes/connectivity/resolve-az-aks-command-invoke-failures)).
- **Data path.** The output comes back through the Azure Resource Manager API ([Run Command API](https://learn.microsoft.com/en-us/rest/api/aks/managed-clusters/run-command)).

The recipe needs Bash, the Azure CLI and jq, all present in Cloud Shell. It follows Microsoft's documentation but has not yet been run against a live cluster: on your first run, check that `raw/ingresses.json` contains `exitCode` and `logs`.

```bash
RG=<resource-group>
CLUSTER=<cluster-name>
mkdir -p ~/clouddrive/ingress-export/raw && cd ~/clouddrive/ingress-export

# invoke FILE 'KUBECTL ARGUMENTS': one call; FILE is kept only when the command succeeded and the JSON is complete
invoke() {
  az aks command invoke --resource-group "$RG" --name "$CLUSTER" --output json \
    --command "kubectl $2 -o json 2>/dev/null" > "raw/$1" || { echo "FAILED: $1"; return; }
  if jq -e '.exitCode == 0' "raw/$1" > /dev/null; then
    jq -r '.logs' "raw/$1" > "$1"
    jq empty "$1" 2> /dev/null || { rm -f "$1"; echo "TRUNCATED: $1 (export it per namespace, below)"; }
  else
    echo "SKIPPED: $1 (resource type not installed, or command failed: see raw/$1)"
  fi
}

invoke ingresses.json               'get ingresses.networking.k8s.io -A'
invoke ingressclasses.json          'get ingressclasses.networking.k8s.io'
invoke deployments.json             'get deployments.apps -A'
invoke daemonsets.json              'get daemonsets.apps -A'
invoke services.json                'get services -A'
invoke version.json                 'version'
invoke nginxingresscontrollers.json 'get nginxingresscontrollers.approuting.kubernetes.azure.com'
invoke gatewayclasses.json          'get gatewayclasses.gateway.networking.k8s.io'
invoke gateways.json                'get gateways.gateway.networking.k8s.io -A'
invoke httproutes.json              'get httproutes.gateway.networking.k8s.io -A'

# Controller ConfigMaps, by name, from the controller namespace only.
# 1. List the names the controllers use ($(POD_NAMESPACE) means the namespace printed first):
jq -r '.items[] | .metadata.namespace as $ns | .spec.template.spec.containers[] | (.args // [])[]
  | select(test("^--(tcp-services-|udp-services-)?configmap=")) | "\($ns)  \(.)"' deployments.json daemonsets.json
# 2. Export each of them (here, the upstream default):
invoke cm-ingress-nginx-controller.json 'get configmap ingress-nginx-controller -n ingress-nginx'
# 3. Wrap them in one List:
jq -s '{apiVersion: "v1", kind: "List", items: .}' cm-*.json > configmaps.json && rm cm-*.json

# Analyse (the tool reads only the file names listed under "Offline mode"):
node ~/clouddrive/ingress-inventory/ingress-inventory.mjs --from-dir ~/clouddrive/ingress-export
```

If a type is reported as `TRUNCATED`, export it one namespace at a time and merge the parts. Check that no part is reported as `FAILED`, `SKIPPED` or `TRUNCATED` before you merge; a single namespace above 512 kB needs another path (jump box, Bastion).

```bash
FILE=services.json; TYPE=services    # the truncated file and its resource type
NAMESPACES=$(az aks command invoke --resource-group "$RG" --name "$CLUSTER" --output json \
  --command "kubectl get $TYPE -A -o jsonpath='{.items[*].metadata.namespace}'" | jq -r '.logs' | tr ' ' '\n' | sort -u)
for NS in $NAMESPACES; do invoke "part-$NS.json" "get $TYPE -n $NS"; done
jq -s '{apiVersion: "v1", kind: "List", items: (map(.items) | add)}' part-*.json > "$FILE" && rm part-*.json
```

### Jump box

A VM in the cluster's virtual network, or in a peered one with the cluster's private DNS zone linked, reaches the API server. Microsoft's example is an Ubuntu VM without a public IP, reached through Azure Bastion ([connect to a private AKS cluster](https://learn.microsoft.com/en-us/azure/aks/private-cluster-connect)). Install Node.js 22 or later from another source than Ubuntu's packages, which provide Node.js 12.22.9 on 22.04 ([jammy](https://packages.ubuntu.com/jammy/nodejs)) and 18.19.1 on 24.04 ([noble](https://packages.ubuntu.com/noble/nodejs)), both past end of life ([Node.js release schedule](https://github.com/nodejs/Release/blob/main/schedule.json)). Without Node.js on the VM, export the files there with kubectl (see [Offline mode](#offline-mode---from-dir)) and run the tool on another machine.

### Azure Bastion

`az aks bastion tunnel`, in the Azure CLI extension `aks-preview` (Azure CLI 2.85.0 or later), opens a subshell whose kubeconfig reaches the cluster through Azure Bastion; run the tool in that subshell ([CLI reference](https://learn.microsoft.com/en-us/cli/azure/aks/bastion)). It needs a Bastion with the Standard or Premium SKU and native client support, and the Reader role on the cluster, on the Bastion, and on the cluster's virtual network when Bastion sits in a peered one ([Bastion for AKS](https://learn.microsoft.com/en-us/azure/bastion/bastion-connect-to-aks-private-cluster)). AKS documents this connection as preview, not supported on AKS Automatic or with network resource group lockdown ([connect to a private AKS cluster](https://learn.microsoft.com/en-us/azure/aks/private-cluster-connect)). Leave out `--admin` on clusters with local accounts disabled ([local accounts](https://learn.microsoft.com/en-us/azure/aks/local-accounts)). The Bastion how-to and the CLI reference show different syntaxes: check `az aks bastion tunnel --help`.

```bash
az extension add --name aks-preview    # or: az extension update --name aks-preview
az aks bastion tunnel --resource-group <resource-group> --name <cluster-name>
# then, in the subshell:
node ingress-inventory.mjs
```

### Cloud Shell in a virtual network

Cloud Shell deployed into a virtual network reaches private clusters. For AKS, the portal can set it up from the cluster: **Connect > Cloud Shell > Configure** (preview), which is not supported on AKS Automatic or with network resource group lockdown ([connect to a private AKS cluster](https://learn.microsoft.com/en-us/azure/aks/private-cluster-connect)). A virtual network deployment needs the Owner role on the subscription and an Azure Relay namespace, which is billed ([Cloud Shell in a virtual network](https://learn.microsoft.com/en-us/azure/cloud-shell/vnet/overview), [deployment](https://learn.microsoft.com/en-us/azure/cloud-shell/vnet/deployment)).

## Offline mode (`--from-dir`)

`--from-dir <dir>` analyses exported files in the shape of `kubectl get -o json`, without calling kubectl. It reads only these file names; missing optional files are skipped with a note.

| File | Content |
|---|---|
| `ingresses.json` (required) | `kubectl get ingresses.networking.k8s.io -A -o json` |
| `ingressclasses.json` | `kubectl get ingressclasses.networking.k8s.io -o json` |
| `deployments.json` | `kubectl get deployments.apps -A -o json` |
| `daemonsets.json` | `kubectl get daemonsets.apps -A -o json` |
| `services.json` | `kubectl get services -A -o json` |
| `configmaps.json` | a List of the controller ConfigMaps only |
| `version.json` | `kubectl version -o json` |
| `nginxingresscontrollers.json` | `kubectl get nginxingresscontrollers.approuting.kubernetes.azure.com -o json` |
| `gatewayclasses.json` | `kubectl get gatewayclasses.gateway.networking.k8s.io -o json` |
| `gateways.json` | `kubectl get gateways.gateway.networking.k8s.io -A -o json` |
| `httproutes.json` | `kubectl get httproutes.gateway.networking.k8s.io -A -o json` |

With direct kubectl access, for example on a jump box without Node.js:

```bash
mkdir ingress-export && cd ingress-export
kubectl get ingresses.networking.k8s.io -A -o json > ingresses.json
kubectl get ingressclasses.networking.k8s.io -o json > ingressclasses.json
kubectl get deployments.apps -A -o json > deployments.json
kubectl get daemonsets.apps -A -o json > daemonsets.json
kubectl get services -A -o json > services.json
kubectl version -o json > version.json
# Resource types that may not exist: the file is removed when the type is absent
kubectl get nginxingresscontrollers.approuting.kubernetes.azure.com -o json > nginxingresscontrollers.json || rm nginxingresscontrollers.json
kubectl get gatewayclasses.gateway.networking.k8s.io -o json > gatewayclasses.json || rm gatewayclasses.json
kubectl get gateways.gateway.networking.k8s.io -A -o json > gateways.json || rm gateways.json
kubectl get httproutes.gateway.networking.k8s.io -A -o json > httproutes.json || rm httproutes.json
```

Export ConfigMaps by name, from the controller namespace only. Never run `kubectl get configmaps -A`: ConfigMaps can hold settings that have no place in a report.

```bash
# List the names the controllers use ($(POD_NAMESPACE) means the namespace printed first; needs jq):
jq -r '.items[] | .metadata.namespace as $ns | .spec.template.spec.containers[] | (.args // [])[]
  | select(test("^--(tcp-services-|udp-services-)?configmap=")) | "\($ns)  \(.)"' deployments.json daemonsets.json
# Export each of them, then wrap them in one List:
kubectl get configmap ingress-nginx-controller -n ingress-nginx -o json > cm-1.json
jq -s '{apiVersion: "v1", kind: "List", items: .}' cm-*.json > configmaps.json && rm cm-*.json
```

Then: `node ingress-inventory.mjs --from-dir ingress-export`. Offline mode has no file for the Gateway API CRD, so the report cannot show the installed bundle version; you can read it with `kubectl get crd gateways.gateway.networking.k8s.io -o jsonpath='{.metadata.annotations}'`.

## Options

```
node ingress-inventory.mjs [options]
```

| Option | Meaning |
|---|---|
| `--context <name>` | kubectl context (default: the current context) |
| `--kubeconfig <path>` | passed through to kubectl |
| `--kubectl <path>` | kubectl binary (default: `kubectl` on the PATH) |
| `--from-dir <dir>` | analyse exported JSON files instead of calling kubectl |
| `--out <dir>` | output directory (default: `./ingress-inventory-<context>-<YYYYMMDD-HHmm>`) |
| `--lang en\|fr` | report language (default: `en`, or `fr` when `LC_ALL` or `LANG` starts with `fr`) |
| `--anonymize` | pseudonymise identifiers; the lookup table goes to a separate local file |
| `--quiet` | print only the output paths |
| `-h`, `--help` | usage |
| `-v`, `--version` | version |

Exit codes: `0` success (findings are not errors); `1` fatal error: kubectl missing, cluster unreachable, Ingresses not readable, or `--from-dir` unreadable; `2` usage error, such as an unknown option or a missing value.

## Outputs and `--anonymize`

| File | Content |
|---|---|
| `report.md` | the report |
| `ingress-inventory.json` | the same data for scripts (`schemaVersion: 1`) |
| `.ingress-inventory` | marker file: the tool writes into an existing non-empty directory only when it finds this marker |
| `anonymization-map.local.json` | with `--anonymize` only: the table from pseudonyms back to real names. **Never share it.** |

The console summary stays under 12 lines: tool version, context, controllers and their status, counts (Ingresses, namespaces, routes), buckets and output paths.

`--anonymize` replaces identifiers with pseudonyms in `report.md` and `ingress-inventory.json`, so that you can share them, for example to get a migration estimate:

| Identifier | Pseudonym |
|---|---|
| context | `cluster-…` |
| namespaces | `ns-…` |
| Ingress, Service and workload names | `ing-…`, `svc-…`, `wl-…` |
| hosts | `h-….example` |
| TLS secret names | `sec-…` |
| IP addresses, CIDRs | `ip-…`, `cidr-…` |
| path segments | `p-…`, structure kept |

- Counts and regex flags are computed before pseudonymisation, so they do not change.
- In annotation and ConfigMap values, every token that looks like a hostname, IP address, CIDR, URL or e-mail address is replaced. Snippet values are never printed, anonymized or not.
- Pseudonyms are stable within one run (HMAC-SHA256 with a random salt) and differ from one run to the next.
- Everything else stays as written, for example IngressClass names, image names and the rest of the text in annotation values. Read the report before you share it.
- `anonymization-map.local.json` maps the pseudonyms back to the real names; its top-level key is `DO_NOT_SHARE`. Keep it on your machine and share only `report.md` and `ingress-inventory.json`, never the whole output directory.

## Reading the report

The report has these sections: summary (controllers and support status with dated sources, security flags, scope, translation profile, addresses that will change, targets already enabled, next step); annotations; controller settings (ConfigMap keys set in the cluster); defaults that change; TCP/UDP services, SSL passthrough, default certificate and default backend; network and load balancers; inventory per namespace; other controllers and unassigned Ingresses; next steps; about (catalog date, sources, disclaimer).

### Which Ingresses count

The tool replays ingress-nginx's own decision for each controller instance; the first match wins:

1. `spec.ingressClassName` is set: the controller serves the Ingress only if it owns that IngressClass, that is, the class's `spec.controller` equals the controller's `--controller-class` (or, with `--ingress-class-by-name`, the class name matches). The annotation is then ignored.
2. Otherwise the `kubernetes.io/ingress.class` annotation: served only if it equals the controller's `--ingress-class` exactly.
3. Otherwise the Ingress has no class: served only with `--watch-ingress-without-class=true`. A default IngressClass does not help, because the API server applies it only when an Ingress is created.

The controller's filters then apply: `--watch-namespace`, `--disable-catch-all` and `--deep-inspect`; a `--watch-namespace-selector` is reported as not evaluated. The report flags Ingresses claimed by several controllers and lists the Ingresses no controller serves as unassigned. IngressClasses of other controllers (F5 NGINX Ingress Controller, AGIC, Traefik and others) are listed as not affected by the ingress-nginx retirement. The F5 NGINX Ingress Controller also uses the class name `nginx` by default ([F5 manifest](https://github.com/nginx/kubernetes-ingress/blob/main/deployments/common/ingress-class.yaml)), which is why the tool matches `spec.controller`, never the class name.

**Routes** are the distinct (host, path) pairs in the rules of the Ingresses that ingress-nginx serves. A rule without a host counts as `*`, a path without a value as `/`, and each `spec.defaultBackend` adds one route.

### Buckets

Each annotation and ConfigMap key in use falls into one bucket. The annotations table is sorted by bucket in this order: redesign, unknown, policy, direct, none.

| Bucket | Meaning |
|---|---|
| `direct` | A standard-channel Gateway API construct (Core or Extended) does the same job. |
| `policy` | No standard field: a target offers its own resource (for example RoutePolicy on AGC, DestinationRule or AuthorizationPolicy on the Istio add-on), or the feature is not in the standard-channel CRDs that AKS manages. |
| `redesign` | No equivalent: the need has to be met another way. |
| `none` | Nothing to translate. |
| `unknown` | Not in the catalog: a typo, a custom prefix or a removed annotation. |

A rule on the value can change a key's bucket and note. Features missing from the standard channel of the AKS-managed CRDs are never `direct`: `retry` became standard only in Gateway API v1.7.0, and `sessionPersistence` and ExternalAuth are experimental ([Gateway API v1.7.0 APIs](https://github.com/kubernetes-sigs/gateway-api/tree/v1.7.0/apis)). The application routing Gateway API implementation accepts no Istio resources, such as DestinationRule, AuthorizationPolicy or EnvoyFilter ([AKS docs](https://learn.microsoft.com/en-us/azure/aks/app-routing-gateway-api)).

### Support cells

For each key, the report gives the support on each target:

| Cell | Meaning |
|---|---|
| ✓ yes | Supported; the note says how. |
| ~ partial | Supported with limits: some values only, a minimum version, a preview feature or a mesh-wide setting. |
| ✗ no | Not supported on this target. |
| ? unknown | The sources are silent or disagree: test it. |
| n/a | Not applicable to this target. |

What a target supports can depend on versions. On the two Istio-based targets it depends on the Gateway API bundle that AKS installs for your Kubernetes minor version: for example, CORS and 303, 307 or 308 redirects need AKS 1.36 or later ([managed Gateway API](https://learn.microsoft.com/en-us/azure/aks/managed-gateway-api)). On AGC it depends on the ALB Controller version: for example, CORS, timeouts and 307 or 308 redirects need 1.11.1 or later ([ALB Controller release notes](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/alb-controller-release-notes)).

### Defaults that change

ingress-nginx applies defaults that the targets do not share. The report lists each one with the value configured in your cluster (a ConfigMap setting replaces the default), the behaviour on each target, the impact and a test to run. Two examples: ingress-nginx redirects HTTP to HTTPS with a 308 for every host of an Ingress that has `spec.tls` ([ingress-nginx source](https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/rootfs/etc/nginx/lua/lua_ingress.lua)), while none of the targets redirects by default ([Istio source](https://github.com/istio/istio/blob/release-1.31/pilot/pkg/config/kube/gateway/conversion.go), [AGC](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-url-redirect-gateway-api)); ingress-nginx rejects request bodies over 1 MiB with a 413 ([ingress-nginx source](https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/controller/config/config.go)), while Envoy on the Istio-based targets sets no limit ([Istio source](https://github.com/istio/istio/blob/release-1.29/pilot/pkg/networking/core/listener_builder.go)). The Envoy defaults come from the upstream Istio source; whether AKS overrides some of them is not verified.

## Next step: draft manifests with ingress2gateway

[ingress2gateway](https://github.com/kubernetes-sigs/ingress2gateway/releases/tag/v1.2.0) v1.2.0, released on 2026-07-07, is the latest release, with no commits since; it targets Gateway API v1.5.0. Microsoft's migration guide recommends running it once per ingress class ([migration guide](https://learn.microsoft.com/en-us/azure/aks/app-routing-nginx-to-gateway-api-migration)). Its release page has archives for Linux, macOS and Windows, and a checksums file. The report prints the command for your classes; for the AKS add-on's default class:

```bash
ingress2gateway print --providers=ingress-nginx \
  --ingress-nginx-ingress-class=webapprouting.kubernetes.azure.com \
  --all-namespaces --no-color > i2gw.yaml 2> i2gw.notes.txt
# offline: --input-file <kubectl get ingresses.networking.k8s.io,services -A -o yaml output>
```

Before you apply its output:

- It has no AKS, AGC or Istio emitter: it names the Gateway and its `gatewayClassName` after the ingress class. Rewrite `gatewayClassName` to `approuting-istio`, `istio` or `azure-alb-external`. It writes no Ingress objects, so it does not apply to `agcIngress` ([README](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/README.md)).
- It reads only Ingresses and Services, so controller ConfigMap settings such as HSTS or the 1 MiB body limit are invisible to it: use the report's controller settings and defaults sections. It skips Ingresses without a class, any field error aborts the whole run, the output order is not deterministic, and it writes one Gateway per namespace and class ([print.go](https://github.com/kubernetes-sigs/ingress2gateway/blob/v1.2.0/cmd/print.go), [providers](https://github.com/kubernetes-sigs/ingress2gateway/tree/v1.2.0/pkg/i2gw/providers)).
- It selects Ingresses by class name only: with the class `nginx` it would also pick up Ingresses of an F5 NGINX Ingress Controller. The report shows which Ingresses really belong to ingress-nginx.
- **Redirects on AKS 1.35 and earlier.** The managed CRDs there (Gateway API v1.2.1 to v1.4.1) accept only the 301 and 302 redirect codes ([v1.4.1 CRDs](https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.4.1/standard-install.yaml), [managed Gateway API](https://learn.microsoft.com/en-us/azure/aks/managed-gateway-api)). They reject the 308 redirects that ingress2gateway writes for `ssl-redirect`, and 303, 307 or 308 values of the `*-redirect-code` annotations: change those codes, or use AKS 1.36 or later.
- On `agc`, the `Host` header cannot be set with a header filter: express `upstream-vhost` as a URLRewrite `hostname` ([AGC header rewrite](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-header-rewrite-gateway-api)).

Then handle the `policy` and `redesign` items, plan the address, DNS and certificate changes, test the defaults that change, and plan the cutover and the rollback. For the AKS add-on, Microsoft's migration runs both side by side and switches DNS: the NGINX load balancer IP cannot be moved ([migration guide](https://learn.microsoft.com/en-us/azure/aks/app-routing-nginx-to-gateway-api-migration)).

## Limitations

- **Catalog date.** The catalog (support matrix, defaults, CVE fixed versions, status lines) reflects public sources read between 2026-11-04 and 2026-11-06; the report prints its date. AKS, AGC and Istio change often: check the dated sources before you decide.
- **Verify in your environment.** The report is informational. It describes object definitions, not traffic, so it cannot tell which behaviours your clients rely on. Test every finding, ideally in a non-production cluster, before cutover.
- **Vendor builds.** For Microsoft builds, forks and versions above v1.15.1, the report gives the version but no CVE status: check with the vendor.
- **Not read.** Secrets, Azure resources (DNS zones, Front Door, Application Gateway, NSGs, firewalls) and NetworkPolicies. The report reminds you that addresses referenced there will change.
- **Not evaluated.** `--watch-namespace-selector`, which would need namespace labels, and the content of snippets, which the report only counts.
- **Not affiliated** with Microsoft, the Kubernetes project or F5. Names of products belong to their owners.

## Security

[SECURITY.md](SECURITY.md) lists what the tool reads and never reads, explains how to verify a release, and how to report a vulnerability (contact@claza.cloud).

## License

[MIT](LICENSE), Copyright (c) 2026 CLAZA IT.

<!-- TODO before publishing: OFFER_URL.en placeholder (https://claza.cloud/en/aks-ingress-nginx-migration/). -->
CLAZA IT, which maintains this tool, offers a fixed-price migration plan built from this report: [claza.cloud](https://claza.cloud/en/aks-ingress-nginx-migration/).
