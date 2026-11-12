# F7: Running the read-only CLI against AKS (Cloud Shell, command invoke, private access, least-privilege RBAC)

- Fact sheet: F7
- Research date: 2026-11-04
- Scope: how platform teams can run `ingress-nginx-inventory` (a read-only Node.js CLI) against AKS clusters, public or private, and the minimum Kubernetes and Azure permissions it needs.
- Status labels used below:
  - **VERIFIED**: stated by the cited primary source (Microsoft Learn, official GitHub source code, or upstream Kubernetes docs).
  - **INFERENCE**: follows from cited sources but is not stated by them. Needs a live test before we publish it as a claim.
  - **UNVERIFIED**: the sources are silent or they conflict.
- Source references such as `[S1]` point to the numbered list in the **Sources** section at the end.

---

## 0. What this means for the tool (summary)

1. **Cloud Shell is the zero-install path when the API server is reachable.** Node.js 24, kubectl, kubelogin, jq, git, curl and helm are preinstalled [S1, S2, S3]. The user is unprivileged, with no `sudo` [S9], so the CLI should run with `npx` (no global install), and it should write its output under `~/clouddrive` [S9, S11].
2. **Keep a run short.** A Cloud Shell session ends after 20 minutes without interactive activity, "without warning" for long non-interactive work [S9]. The CLI should save partial results as it goes.
3. **Private clusters have four paths:**
   - Cloud Shell deployed into a VNet [S15, S16, S19]
   - an Azure Bastion tunnel [S35, S36]
   - a jump box [S19]
   - `az aks command invoke` [S21]

   Command invoke returns at most 512 kB of output per call [S21], and Microsoft says it is "not for programmatic access" [S21]. So the tool needs an **offline-bundle mode**: it ingests JSON exported with plain `kubectl` and `jq` inside the command pod, one call per resource type.
4. **Ship a least-privilege ClusterRole.** It grants `get` and `list` only, gives no access to Secrets, and reads ConfigMaps by name only (section 4.2). For clusters that use Microsoft Entra ID authorization (Azure RBAC), ship an equivalent Azure custom role (section 4.7). Before reading anything, the CLI should run a SelfSubjectAccessReview preflight (section 4.6).
5. **Don't depend on kubectl behaviour.** Cloud Shell's kubectl is v1.37 [S1]. Kubernetes supports kubectl only within one minor version of the API server [S38]. AKS 1.34 and 1.35 are still generally available in November 2026 [S37], and they are outside that skew.

---

## 1. Azure Cloud Shell (state on 2026-11-04)

### 1.1 Image and preinstalled tools

| Item | Value | Status | Source |
|---|---|---|---|
| Base OS | Azure Linux 3.0 (`FROM mcr.microsoft.com/azurelinux/base/core:3.0`) | VERIFIED | S2, S8 |
| Node.js package | `nodejs24` and `nodejs24-npm` from the Azure Linux repo. Switched from Node 20 in PR #614 (merged 2026-04-21), because "Node 20 ... will become EOL on April 30". | VERIFIED | S2, S5 |
| **Node.js version on PATH** | Release notes: **October 2026: Node.js v24.22.1, npm v11.19.1**. September 2026: v24.18.1. May 2026: v24.14.1. So `node --version` should print **v24.22.x (major 24, minor 22)** wherever the October release has rolled out. | VERIFIED for the release. UNVERIFIED for any given region, because the Cloud Shell README warns of "a lag of up to 3-4 weeks" before changes reach all regions. A region that hasn't updated would still show v24.18.x. | S1, S4 |
| Azure Linux nodejs RPMs published | 24.20.0 (2026-09-04), 24.21.0 (2026-09-16), 24.22.0 (2026-10-20), 24.22.1 (2026-10-22). In Azure Linux 3.0, `nodejs` is now Node 24 and also provides `nodejs24`. | VERIFIED | S6, S7 |
| Node environment variables | The image sets `NODE_ENV=production`, `NODE_OPTIONS=--tls-cipher-list='ECDHE-RSA-AES128-GCM-SHA256:!RC4'` and `NPM_CONFIG_LOGLEVEL=warn` | VERIFIED (Dockerfile) | S2 |
| kubectl | Installed into `/usr/local/bin/kubectl` by an unpinned `az aks install-cli`, which defaults to the latest stable version from `stable.txt` at image build time. Release notes: **kubectl v1.37.0** (September 2026); v1.36.0 in May 2026. The upstream stable version today is v1.37.2. | VERIFIED for presence and minor (1.37). The exact patch is UNVERIFIED. | S1, S3, S25, S64 |
| kubelogin | Installed into `/usr/local/bin/kubelogin` by the same `az aks install-cli` step (latest GitHub release at build time). The version is not published. | Presence VERIFIED, version UNVERIFIED | S3, S25 |
| Azure CLI | v2.91.0 (October 2026) | VERIFIED | S1 |
| jq, git, curl | Installed as Azure Linux packages (`jq`, `git`, `curl`) in `base.Dockerfile`. Versions are not published. | Presence VERIFIED | S2 |
| helm | Azure Linux `helm` package. Helm v4.1 since May 2026. | VERIFIED | S1, S2 |
| istioctl | `istio-istioctl` package, v1.31.0 (September 2026) | VERIFIED | S1, S2 |
| GitHub CLI (`gh`) | v2.102.0 (October 2026) | VERIFIED | S1 |
| User | Regular, unprivileged Linux user. `sudo` is not possible. | VERIFIED | S4, S9, S13 |
| PATH | The image puts `~/.local/bin:~/bin:~/.dotnet/tools` in front of PATH "so they can install tools which override defaults" | VERIFIED (Dockerfile) | S3 |

Notes:
- The Learn "features" page is stale. It lists ".NET 7.0" and "Python 3.9" and gives no Node.js version, while the Dockerfile installs `dotnet-sdk-9.0` and `python3` [S8 vs S2]. Use the release notes and the Dockerfiles as the source of truth.
- Node.js lifecycle [S58]:

  | Line | Status | End of life |
  |---|---|---|
  | Node 24 | Maintenance LTS since 2026-10-20 | 2028-04-30 |
  | Node 22 | Maintenance LTS | 2027-04-30 |
  | Node 26 | Active LTS since 2026-10-28 | not covered here |

  Recommendation (not a fact): use `"engines": { "node": ">=22" }`. That covers Cloud Shell and every supported LTS line.

**`NODE_OPTIONS` TLS caveat (INFERENCE).**
- The value `ECDHE-RSA-AES128-GCM-SHA256:!RC4` is the exact example the Node docs use to make that suite "the default TLS cipher suite" [S56].
- In Node v24, `lib/internal/tls/secure-context.js` only calls `setCipherSuites` (the TLS 1.3 list) when the list contains `TLS_`-prefixed names [S57]. So with this value:
  - TLS 1.3 keeps its default suites.
  - TLS 1.2 and below are narrowed to one ECDHE-RSA suite.
- Expected effect on the CLI: none against TLS 1.3-capable endpoints such as the Kubernetes API server. A TLS 1.2-only endpoint with an ECDSA certificate would fail.
- Action: smoke-test once in Cloud Shell. Make the CLI report TLS handshake errors clearly, and make sure it doesn't depend on `NODE_OPTIONS`.

**Installing the CLI in Cloud Shell (INFERENCE).**
- The user is unprivileged [S9], and the Dockerfiles configure no npm prefix [S2, S3]. So `npm install -g` into the system prefix should fail with a permission error.
- Two installs should work:
  - `npx <package>@<version>` (the cache is in `~/.npm`, inside `$HOME`)
  - `npm install --prefix ~/.local <package>` (`~/.local/bin` is already first on PATH [S3])
- Verify once in a live session.

### 1.2 Entra-integrated clusters: `az aks get-credentials` and kubelogin

- **Kubeconfig format** [S27]:
  - AKS clusters on Kubernetes 1.24 or later automatically use the kubelogin exec-plugin format.
  - Device code is kubelogin's default mode for `convert-kubeconfig`, and it "doesn't work when a Microsoft Entra Conditional Access policy is set".
  - `-l azurecli` reuses the Azure CLI sign-in and doesn't write a kubelogin token cache.
- **Automatic conversion since Azure CLI 2.78.0** (2025-10-14) [S26]: "`az aks get-credentials`: Convert device code mode kubeconfig to Azure CLI token format to bypass conditional access login blocks."
  - In the current source, if the kubeconfig's exec args contain `--login devicecode` or `-l devicecode` and `kubelogin` is on PATH, the CLI runs `kubelogin convert-kubeconfig -l azurecli` [S25].
  - The code is absent at the `azure-cli-2.77.0` tag and present from `azure-cli-2.78.0`.
- **In Cloud Shell:** it has Azure CLI 2.91.0 and kubelogin, so `az aks get-credentials -g <rg> -n <cluster>` should produce an azurecli-mode kubeconfig with no extra step. **INFERENCE** (code path verified, not run live).
- **Azure permission to download the user kubeconfig:** `Microsoft.ContainerService/managedClusters/listClusterUserCredential/action`, which is in the built-in "Azure Kubernetes Service Cluster User Role" [S29].
  - On Entra-integrated clusters, the clusterUser kubeconfig carries no credentials ("an empty kubeconfig file that prompts a login") [S28].
  - **On clusters without Entra ID, "the clusterUser role has same effect of clusterAdmin role"** [S28].
- **Local accounts disabled:** `az aks get-credentials --admin` fails with "Getting static credential isn't allowed because this cluster is set to disable local accounts" [S34].
- **UNVERIFIED: does Cloud Shell's built-in identity issue a token for the AKS server application** (`6dae42f8-4368-4678-94ff-3960e28e3630`) without an explicit `az login`?
  - Microsoft documents a Cloud Shell-specific failure for `az aks command invoke` ("Failed to connect to MSI ... Response [400]"), fixed by running `az login` first [S22].
  - The Cloud Shell FAQ documents "Audience ... is not a supported MSI token audience", fixed by `az login --use-device-code` [S9].
  - The runbook should keep `az login` as the fallback.
- **Choosing a Node client:** `@kubernetes/client-node` supports kubeconfig `exec` credential plugins (`ExecAuth`) [S60], so a direct API client can use the kubelogin kubeconfig. The alternative is to shell out to `kubectl`, which then brings in the version-skew issue (section 0, point 5).

### 1.3 Files: persistence, upload, download

**Two storage modes:**
- **Ephemeral (no storage account):** "all files you saved are deleted" shortly after the window is closed or Cloud Shell is restarted [S12].
- **Mounted storage:**
  - The Azure Files share is mounted at `~/clouddrive` (`/home/<user>/clouddrive`) [S11].
  - `$HOME` is kept as a disk image in the share at `.cloudconsole/acc_<user>.img`, which "automatically syncs changes" [S11].
  - Sizes: the overview says "persists your files in your `$HOME` location using a 5-GB file share" [S13]. The multi-user page says the share has a 6-GiB quota and Cloud Shell creates a 5-GiB image per user [S14].
- Machine state and files outside `$HOME` are not persisted [S8].
- **CONFLICT (UNVERIFIED which is right):** the FAQ says files in `$HOME` "aren't visible in the Storage browser and are deleted when your session ends" [S9]. That contradicts [S8] and [S11]. Decision: write reports to `~/clouddrive/...`. All sources agree that location persists, and it is visible in the portal Storage browser [S9].

**Storage access and data location:**
- Users need Contributor or higher on the storage account.
- Anyone with enough rights on the subscription can reach the share, and the share "might include sensitive information including access tokens or credentials" [S11].
- Primary session regions include France Central, Germany West Central, Sweden Central and West Europe. Files are "processed in the primary region where your session runs" [S11].

**Upload:**
- Manage files > Upload, or drag and drop files (not folders) onto the terminal.
- Files land in `/home/<user>` [S10].

**Download:**
- Manage files > Download, then "Enter the fully qualified file path". Paths are case-sensitive [S10].
- Example path: `/home/<user>/clouddrive/ingress-inventory/report.html`.
- "Open file share" opens the share in the Azure portal [S10].
- No Cloud Shell download command is documented (**UNVERIFIED** that one exists). On the command line, the only option is generic Azure Storage operations against the clouddrive share, such as `az storage file download` (**INFERENCE**).

Recommendation: produce one archive or one HTML + JSON pair, so a single Download action gets everything.

### 1.4 Session limits

- **Idle timeout: 20 minutes** "without interactive activity". "Any long-running non-interactive sessions are ended without warning." The session machine is recycled after 20 inactive minutes [S9, S10, S13]. **UNVERIFIED:** whether terminal output counts as activity.
- **20 concurrent users per tenant.** Going over gives a "Tenant User Over Quota" error; the quota can be raised through Support [S9].
- Administrators can block Cloud Shell by denying `*.console.azure.com`. Cloud Shell needs HTTPS and websocket access to `*.console.azure.com` and `*.servicebus.windows.net` [S9].
- The subscription must have the `Microsoft.CloudShell` resource provider registered [S12].

### 1.5 Reaching private AKS clusters from Cloud Shell

- **Default Cloud Shell can't reach them.** It runs in a Microsoft network: "Commands that run inside the container can't access resources in a private virtual network", including using `kubectl` "to connect to a Kubernetes cluster with locked-down access" [S15].
- **VNet isolation (Cloud Shell deployed into your VNet): requirements** [S15, S16, S17]:
  - **Owner** on the subscription to deploy.
  - Registered providers: `Microsoft.CloudShell`, `Microsoft.ContainerInstance`, `Microsoft.Relay`.
  - All resources in one region and one resource group, in a supported region. Supported regions include France Central, West Europe, North Europe, Germany West Central and Sweden Central. The session runs in the VNet's region.
  - Three subnets:
    - a container subnet, with at least as many IPs as concurrent sessions, delegated to `Microsoft.ContainerInstance/containerGroups`
    - a relay subnet
    - a storage subnet
  - An **Azure Relay** namespace with a private endpoint. Relay is paid: "one hybrid connection is used for each administrator while they're using Cloud Shell".
  - An NSG, and a storage account with a file share reachable from the VNet.
  - Since the Azure Container Instances network-profile deprecation, ACI needs **Network Contributor on the delegated subnet**.
    - The templates have assigned it since 2026-06-12.
    - Older deployments had to add it **by 2026-09-30**, "or you can't use Cloud Shell within your virtual network" [S17].
    - A customer's VNet Cloud Shell set up with the older templates may therefore be broken today.
  - Each user resets their settings and picks "Mount storage account" > "Use an existing private virtual network" [S16].
  - VNet sessions start more slowly than standard ones [S15].
  - If the storage private endpoint has no DNS record, the session falls back to ephemeral storage [S18].
- **AKS-specific guidance** [S19]:
  - **Portal (preview):** cluster > **Connect** > **Cloud Shell** tab > **Configure**. This creates the resource group `RG-CloudShell-PrivateClusterConnection-{RANDOM_ID}` with a separate VNet and peering. Then **Open Cloud Shell**.
  - **ARM template:** put Cloud Shell in the cluster VNet (dedicated subnet) or in a new VNet with peering. With peering, link the cluster's private DNS zone to the Cloud Shell VNet.
  - **Limitations:** "Not supported with AKS Automatic clusters or clusters with network resource group (NRG) lockdown." "You can't have multiple Cloud Shell sessions in different VNets at the same time."
- **INFERENCE:** in VNet mode, outbound traffic (for example `npx` reaching `registry.npmjs.org`) follows the customer's VNet routing and firewall. If egress is blocked, plan an offline install (upload a tarball).
- **UNVERIFIED:** Cloud Shell's public egress IPs are not documented, so we found no documented way to allowlist Cloud Shell on a *public* cluster with API server authorized IP ranges. Bastion's public IP can be allowlisted [S35].

---

## 2. `az aks command invoke`

### 2.1 What it does: where kubectl runs, which identity

- **Commands** [S24]:
  - `az aks command invoke --resource-group <rg> --name <cluster> --command "<cmd>" [--file <f> ...] [--no-wait]`: "Run a shell command (with kubectl, helm) on your aks cluster, support attaching files as well."
  - `az aks command result -g <rg> -n <cluster> --command-id <id>` fetches an earlier result.
- **ARM API** [S23]: `POST .../managedClusters/{name}/runCommand` (api-version 2026-08-01). "AKS will create a pod to run the command. This is primarily useful for private clusters."
  - Request body: `command`; `context` ("A base64 encoded zip file containing the files required by the command"); `clusterToken` ("AuthToken issued for AKS AAD Server App").
  - Result: `exitCode`, `logs` ("The command output."), `provisioningState`, `reason`, `startedAt`, `finishedAt`.
- **Where it runs:** a `command-<ID>` pod in the **`aks-command`** namespace [S22]. The pod provides `kubectl` and `helm`, and "`jq`, `xargs`, `grep`, and `awk` are available for Bash support" [S21]. kubectl runs inside the cluster, so no network path from the client to the API server is needed [S21].
- **Identity:**
  - On managed Entra clusters, Azure CLI gets the caller's token for app `6dae42f8-4368-4678-94ff-3960e28e3630` and sends it as `clusterToken`. The source comment reads "so the command execution also using current user identity" [S25].
  - The documented Forbidden error reads `User "<ID>" cannot list resource ...` [S22]. So Kubernetes RBAC or Entra ID authorization applies to **the caller**, and the caller needs the read rights in section 4.
  - Clusters without managed Entra integration get no token. The identity used inside the pod then is **not documented (UNVERIFIED)**.
- **UNVERIFIED:** the command pod's image and its kubectl and helm versions are not documented. Node.js is not listed as available in the pod, so the CLI itself cannot be assumed to run there.

### 2.2 Required permissions

- **Azure actions** [S21, S22, S30]:
  - `Microsoft.ContainerService/managedClusters/runCommand/action`
  - `Microsoft.ContainerService/managedClusters/commandResults/read`
  - The CLI also reads the cluster first (`client.get(...)`) to detect Entra integration, so the caller needs `Microsoft.ContainerService/managedClusters/read` too [S25].
- **Built-in roles** [S29]:

  | Role | `runcommand/action` | `commandResults/read` | Notes |
  |---|---|---|---|
  | Azure Kubernetes Service Cluster Admin Role | yes | no | Also grants `listClusterAdminCredential/action` |
  | Azure Kubernetes Service Cluster User Role | no | no | |
  | AKS Contributor Role (`Microsoft.ContainerService/managedClusters/*`), Contributor, Owner | yes | yes | Through wildcards |

- **Doc conflict:** the troubleshooting article's "Solution 3" tells you to assign "Azure Kubernetes Service Cluster User Role" to fix missing runCommand rights [S22]. That role contains neither action [S29].
- **Least privilege:** a custom Azure role (this is a proposal; the action strings come from [S30]):

```json
{
  "Name": "AKS Run Command Operator (ingress-nginx-inventory)",
  "Description": "Run az aks command invoke and read its results. Does not grant kubeconfig download.",
  "Actions": [
    "Microsoft.ContainerService/managedClusters/read",
    "Microsoft.ContainerService/managedClusters/runCommand/action",
    "Microsoft.ContainerService/managedClusters/commandResults/read"
  ],
  "NotActions": [],
  "DataActions": [],
  "NotDataActions": [],
  "AssignableScopes": ["/subscriptions/<subscription-id>"]
}
```

- **Treat runCommand as a privileged grant.** It runs arbitrary shell commands in a pod. On clusters without Entra ID, the identity inside the pod is undocumented.
- **Clusters can turn the feature off:** `properties.apiServerAccessProfile.disableRunCommand = true` [S21]. The tool's runbook must handle "Run command disabled".

### 2.3 Limits

| Limit | Value | Source |
|---|---|---|
| Pod CPU request / limit | 200m / 500m | S21 |
| Pod memory request / limit | 500Mi / 1Gi | S21 |
| ARM API timeout for pod scheduling | 60 seconds | S21 |
| **Output size limit** | **512 kB**: "Output truncation if response exceeds 512kB limit" | S21 |
| Output shape | "*exitCode* and *text* only, no API-level details" | S21 |
| Container start | `KubernetesPerformanceError` if the container "did not start within 30s" | S22 |
| CLI wait | Polls for up to 300 s. `--no-wait` prints the command id for a later `az aks command result -i <id>` | S25 |
| Output formatting | With `-o/--output`, the CLI returns the result object; without it, the CLI prints a status line and then the logs | S25 |

### 2.4 Attaching files (`--file`)

- `--file` / `-f`: "Files to be used by the command, use '.' to attach the current folder" [S24].
- The file must exist in the current working directory [S21].
- How the CLI packages files [S25]:
  - Attachments are zipped, base64-encoded and sent as `context`.
  - Individual files are **flattened to their base names**.
  - `--file .` walks the current directory **recursively** and keeps relative paths. It can't be combined with other `--file` values.
- Microsoft: "Use only small, necessary files to avoid exceeding system size limits" [S21]. **No numeric limit is documented (UNVERIFIED).**

### 2.5 Is it suitable for exporting `kubectl get -o json` for offline analysis?

**Yes, as a manual, operator-run export, with constraints:**
- The 512 kB cap applies to each call, so split the export by resource type, and by namespace in large clusters.
- Microsoft states "Not for programmatic access: Use Bastion, VPN, or ExpressRoute for automated API calls" [S21]. The tool shouldn't use it as a hidden transport. It should document it as an export step a person runs.
- `kubectl get -o json` already leaves out `managedFields` (`--show-managed-fields` is off by default) [S43].
- `jq` is available in the pod [S21], so objects can be trimmed before they leave the cluster.
- **UNVERIFIED:** whether `logs` mixes stdout and stderr. Add `2>/dev/null` so kubectl warnings can't corrupt the JSON.
- **INFERENCE:** a truncated reply is invalid JSON, so a strict JSON parse detects truncation.
- **INFERENCE:** the output keys are `exitCode` and `logs`. The CLI model exposes `exit_code` and `logs`, and Azure CLI JSON output uses camelCase [S25]. Confirm the key names on a first run.

Example export recipe. It is illustrative and was not run against a live cluster:

```bash
RG=<resource-group>; CLUSTER=<cluster-name>

# One resource type per call; --output json returns the result object (exitCode, logs, ...)
for KIND in ingresses.networking.k8s.io ingressclasses.networking.k8s.io services deployments.apps daemonsets.apps \
            nginxingresscontrollers.approuting.kubernetes.azure.com \
            gatewayclasses.gateway.networking.k8s.io gateways.gateway.networking.k8s.io httproutes.gateway.networking.k8s.io; do
  az aks command invoke -g "$RG" -n "$CLUSTER" -o json \
    --command "kubectl get $KIND --all-namespaces -o json 2>/dev/null" > "invoke-$KIND.json"
  jq -e '.exitCode == 0' "invoke-$KIND.json" >/dev/null || echo "FAILED: $KIND"
  jq -r '.logs' "invoke-$KIND.json" > "$KIND.json"
  jq empty "$KIND.json" || echo "INVALID/TRUNCATED JSON: $KIND (split per namespace)"
done
# Controller ConfigMaps: GET by name (matches the resourceNames-scoped RBAC in section 4)
az aks command invoke -g "$RG" -n "$CLUSTER" -o json \
  --command "kubectl get configmap ingress-nginx-controller -n ingress-nginx -o json 2>/dev/null" > invoke-cm.json
```

Notes on the recipe:
- Cluster-scoped kinds ignore `--all-namespaces`.
- A kind whose CRD is not installed returns an error and a non-zero exit code. The tool should treat that as "not installed", not as a failure.

### 2.6 Caveats

- **Azure Policy (Gatekeeper)** can deny the `command-<ID>` pod. Fix: exempt the `aks-command` namespace from those assignments [S22].
- **Scheduling:** resource pressure, `NotReady` or `SchedulingDisabled` nodes, or taints the pod can't tolerate give "Not Found" or `KubernetesPerformanceError` [S22].
- **Cloud Shell known issue:** "Failed to connect to MSI ... Response [400]". Run `az login` first, or run the command from a local machine or VM [S22].
- **INFERENCE:** output from the cluster travels through Azure Resource Manager to the client, which may matter for compliance reviews.
- **UNVERIFIED (not documented):** behaviour on network-isolated clusters and on AKS Automatic clusters.

---

## 3. Private clusters without VNet Cloud Shell or command invoke

AKS lists these connection options [S19]:
- Cloud Shell in a connected subnet
- **Azure Bastion native client tunneling (preview)**
- a VM in a peered VNet
- a private endpoint
- a VM in the same VNet
- ExpressRoute or VPN
- command invoke

### 3.1 Jump box (VM)

- **Microsoft's worked example** [S19]:
  - An `Ubuntu2204` VM, size `Standard_B2s`, **with no public IP**, in an existing subnet of the cluster VNet. It must not be the node subnet.
  - Reach it "through Azure Bastion or from a network that can reach the VM's private IP address".
  - Install Azure CLI and run `sudo az aks install-cli`.
  - Run `az login --use-device-code`, then `az aks get-credentials`.
  - Check that `privateFqdn` resolves to a private IP with `nslookup`, then run `kubectl get nodes`.
- **Peered VNet:** link the cluster's private DNS zone to the VM's VNet. The zone follows the pattern `privatelink.<region>.azmk8s.io` and lives in the node resource group by default. Then create peering in both directions [S19, S20].
- **Private endpoint from another VNet:**
  - Create a private endpoint to the cluster (sub-resource `management`), a private DNS zone with the same name, an A record, and a VNet link.
  - "If the private cluster is stopped and restarted", the endpoint breaks and must be recreated [S19].
- **Node runtime on a jump box:**
  - Ubuntu's own `nodejs` package is **12.22.9** on 22.04 and **18.19.1** on 24.04 [S59].
  - Node 12 reached end of life on 2022-04-30 and Node 18 on 2025-04-30 [S58].
  - So the CLI must bring its own runtime: a self-contained binary, a container image, or Node 22 or later installed from another source. Don't rely on `apt install nodejs`.
- **CI pipelines:** Microsoft recommends "self-hosted agents on a connected network" [S20].

### 3.2 Azure Bastion

- **(a) Native client tunnel straight to the API server:**
  - **Bastion requirements:** Standard or Premium SKU, with native client support enabled, in the cluster VNet or a reachable VNet [S35].
  - **Roles:** Reader on the AKS cluster, Reader on the Bastion resource, and Reader on the cluster's VNet when Bastion is in a peered VNet [S35].
  - **Command:**
    - `az aks bastion tunnel -g <rg> -n <cluster> [--bastion <name|id>] [--port <p>] [--admin] [--kubeconfig-path <path>]` "will launch a subshell with the kubeconfig set to connect to the cluster via Bastion".
    - It is part of the **`aks-preview` extension (Azure CLI 2.85.0 or higher)** [S36].
    - Without `--bastion`, it "will try to identify an existing Bastion resource within the cluster's node resource group" [S36].
  - **Status:** AKS documentation labels Bastion connectivity **preview**, and it is "Not supported with AKS Automatic clusters or clusters with NRG lockdown" [S19].
- **Managed Bastion:** `az aks bastion enable | update | disable` (`aks-preview`) manages an AKS-managed Bastion. Options: Standard or Premium SKU, scale units, and an optional existing public IP [S36].
- **Doc drift (UNVERIFIED which syntax works with which extension version):**
  - The Bastion how-to (ms.date 2025-07-29) still shows `az aks bastion --name ... --admin --bastion ...` followed by a manual `sed` rewrite of `KUBECONFIG` [S35].
  - The CLI reference documents `az aks bastion tunnel` [S36].
  - `--admin` fails on clusters with local accounts disabled [S34]. Omit it to use Entra user credentials.
- **Public clusters with authorized IP ranges:** add the Bastion public IP to the allowed ranges [S35].
- **(b) Classic pattern:** Bastion to SSH into a jump box, then run the CLI there. Microsoft's jump-box example is connected this way [S19].

### 3.3 Which path fits which situation

| Situation | Best path for the inventory |
|---|---|
| Public API server, or reachable from the user's network | Cloud Shell (default) or a laptop: `az aks get-credentials` then the CLI [S1, S26] |
| Private cluster, VNet Cloud Shell already deployed | Cloud Shell in the VNet [S16, S19] |
| Private cluster, Bastion Standard or Premium with native client support | `az aks bastion tunnel`, then run the CLI in the subshell [S36] |
| Private cluster, platform team already has a jump box or self-hosted agent | Run the CLI there (bring a Node runtime) [S19, S20, S59] |
| Private cluster, no network path, runCommand allowed | `az aks command invoke` export, then the CLI in offline-bundle mode [S21] |
| AKS Automatic or NRG lockdown | Not Cloud Shell or Bastion (unsupported [S19]). Use a jump box, VPN or ExpressRoute, or test command invoke (UNVERIFIED there) |

---

## 4. Least-privilege Kubernetes RBAC (no Secrets)

### 4.1 What the CLI reads, and why

| Resource | Scope | Why | Verb |
|---|---|---|---|
| `networking.k8s.io/ingresses` | namespaced | Ingress rules, `ingressClassName`, ingress-nginx annotations | get, list |
| `networking.k8s.io/ingressclasses` | cluster | Map class to controller (`spec.controller`) | get, list |
| `services` (core) | namespaced | Controller LoadBalancer, backend Services and ports | get, list |
| `apps/deployments`, `apps/daemonsets` | namespaced | Controller image and arguments: `--ingress-class`, `--controller-class`, `--configmap`, `--tcp-services-configmap`, `--watch-namespace`, `--watch-namespace-selector`, ... [S54b] | get, list |
| Named controller `configmaps` | namespaced | Global NGINX config, TCP and UDP maps | get (by name) |
| Gateway API kinds | mixed | Inventory existing Gateway API usage and installed version | get, list |
| `approuting.kubernetes.azure.com/nginxingresscontrollers` | cluster | AKS app routing add-on NGINX instances | get, list |

**ConfigMap names to grant:**

| Install method | ConfigMaps | Source |
|---|---|---|
| Upstream static manifests | `--configmap=$(POD_NAMESPACE)/ingress-nginx-controller` | S54 |
| Upstream Helm chart (helm-chart-4.15.1, the last release) | `<fullname>-controller` via `--configmap`, `<fullname>-tcp` and `<fullname>-udp` via `--tcp-services-configmap` and `--udp-services-configmap` | S52 |
| AKS app routing add-on, default NginxIngressController (`default`, class `webapprouting.kubernetes.azure.com`) | `nginx` in namespace `app-routing-system` | S47, S48, S49 |
| AKS app routing add-on, other NginxIngressControllers | `<spec.controllerNamePrefix>-<status.collisionCount>` (`--configmap=$(POD_NAMESPACE)/<resourceName>`) | S47, S48 |

Notes on the names:
- Helm `<fullname>` is the release name when the release name contains `ingress-nginx`; otherwise it is `<release>-ingress-nginx`, unless `fullnameOverride` is set. So `ingress-nginx-controller` only when the release is named `ingress-nginx` [S53].
- The ingress-nginx repository is archived. Its last releases were controller-v1.15.1 and helm-chart-4.15.1, published 2026-03-19 [S55].
- The NginxIngressController `status.managedResourceRefs` lists the objects it manages, including the ConfigMap name [S46]. The CLI should read the controller's `--configmap` argument, or this status, and then **GET** the ConfigMap by name.

**Other API facts:**
- **NginxIngressController CRD:** group `approuting.kubernetes.azure.com`, version `v1alpha1`, plural `nginxingresscontrollers`, short name `nic`, **scope: Cluster** [S46].
- **Gateway API v1.7.0** (released 2026-10-29) [S44]:
  - Standard channel (`gateway.networking.k8s.io`): `gatewayclasses` (cluster-scoped), `gateways`, `httproutes`, `grpcroutes`, `tlsroutes`, `tcproutes`, `udproutes`, `referencegrants`, `backendtlspolicies`, `listenersets`.
  - The experimental channel adds, in `gateway.networking.x-k8s.io`: `xbackends`, `xbackendtrafficpolicies`, `xmeshes` (cluster-scoped), `xtelemetrypolicies`.
  - Earlier bundles: v1.4.0 experimental had `xlistenersets`; v1.5.0 moved ListenerSet to the standard group [S45].
  - Each CRD carries `gateway.networking.k8s.io/bundle-version` and `gateway.networking.k8s.io/channel` annotations [S44].

### 4.2 Proposed ClusterRole

Proposal written from the API facts above. Not yet applied to a live cluster.

```yaml
# ingress-nginx-inventory: read-only. No Secrets. No watch (one-shot CLI).
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: ingress-nginx-inventory-reader
  labels:
    app.kubernetes.io/name: ingress-nginx-inventory
rules:
  # Ingress API: Ingress (namespaced) and IngressClass (cluster-scoped)
  - apiGroups: ["networking.k8s.io"]
    resources: ["ingresses", "ingressclasses"]
    verbs: ["get", "list"]
  # Services: controller LoadBalancer Services and Ingress backends
  - apiGroups: [""]
    resources: ["services"]
    verbs: ["get", "list"]
  # Controller workloads: image tag and container args
  - apiGroups: ["apps"]
    resources: ["deployments", "daemonsets"]
    verbs: ["get", "list"]
  # Controller ConfigMaps: GET by name only. No list is granted.
  # Note: resourceNames apply in every namespace when bound with a ClusterRoleBinding.
  - apiGroups: [""]
    resources: ["configmaps"]
    resourceNames:
      - ingress-nginx-controller   # static manifests; Helm release named exactly "ingress-nginx"
      - ingress-nginx-tcp          # Helm TCP services map (same naming rule)
      - ingress-nginx-udp          # Helm UDP services map (same naming rule)
      - nginx                      # AKS app routing add-on, default NginxIngressController (app-routing-system)
    verbs: ["get"]
  # Gateway API, standard channel (kinds defined by v1.7.0; absent kinds are harmless)
  - apiGroups: ["gateway.networking.k8s.io"]
    resources:
      - gatewayclasses
      - gateways
      - httproutes
      - grpcroutes
      - tlsroutes
      - tcproutes
      - udproutes
      - referencegrants
      - backendtlspolicies
      - listenersets
    verbs: ["get", "list"]
  # Gateway API, experimental channel kinds seen in v1.4.0 to v1.7.0
  - apiGroups: ["gateway.networking.x-k8s.io"]
    resources:
      - xlistenersets
      - xbackendtrafficpolicies
      - xbackends
      - xmeshes
      - xtelemetrypolicies
    verbs: ["get", "list"]
  # AKS application routing add-on: NginxIngressController (cluster-scoped)
  - apiGroups: ["approuting.kubernetes.azure.com"]
    resources: ["nginxingresscontrollers"]
    verbs: ["get", "list"]
```

Design notes:
- **Why GET by name for ConfigMaps:**
  - With `resourceNames`, a **list** or **watch** is only authorized when the client sends a `metadata.name` field selector [S39].
  - So the CLI must use `GET /api/v1/namespaces/<ns>/configmaps/<name>`. With kubectl, that is `kubectl get configmap <name> -n <ns>`.
  - If a GET returns Forbidden, the CLI should report "ConfigMap not readable: add `<name>` to resourceNames". It must not fail the whole run.
- **No `watch`:** a one-shot inventory doesn't need it. Add it only if the CLI ever uses informers.
- **Future-proof alternative for Gateway API:** `resources: ["*"]` on the two Gateway API groups. This covers kinds added in later releases, and these groups hold no Secret data. The trade-off is that it is less explicit.

### 4.3 Bindings

```yaml
# A) Entra-integrated cluster with Kubernetes RBAC: bind to an Entra group by objectId
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: ingress-nginx-inventory-reader
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: ingress-nginx-inventory-reader
subjects:
  - apiGroup: rbac.authorization.k8s.io
    kind: Group
    name: "<entra-group-object-id>"   # Group subjects use the group's objectId (GUID)
```

- For a single user, use `kind: User` with the **UPN** for users in the same tenant, or the **objectId** for users from another tenant [S33].
- Groups are matched by objectId only, not by display name [S27].

```yaml
# B) Any cluster (required for a true read-only guarantee on clusters WITHOUT Entra ID,
#    where the clusterUser kubeconfig equals clusterAdmin [S28]):
#    dedicated ServiceAccount + short-lived token
apiVersion: v1
kind: Namespace
metadata:
  name: ingress-nginx-inventory
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: inventory-reader
  namespace: ingress-nginx-inventory
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: ingress-nginx-inventory-reader-sa
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: ingress-nginx-inventory-reader
subjects:
  - kind: ServiceAccount
    name: inventory-reader
    namespace: ingress-nginx-inventory
# Then: kubectl create token inventory-reader -n ingress-nginx-inventory --duration=1h   [S42]
# and build a kubeconfig that uses that bearer token.
```

### 4.4 Optional, tighter: namespaced Roles for ConfigMaps

- When the controller namespaces are known, drop the `configmaps` rule from the ClusterRole and bind namespaced Roles instead. The names then apply only in those namespaces.
- `app-routing-system` is where the add-on keeps its NGINX resources [S49]. Editing the ingress-nginx ConfigMap there "isn't supported" [S51].

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: ingress-nginx-inventory-configmaps
  namespace: ingress-nginx            # upstream controller namespace (adjust per install)
rules:
  - apiGroups: [""]
    resources: ["configmaps"]
    resourceNames: ["ingress-nginx-controller", "ingress-nginx-tcp", "ingress-nginx-udp"]
    verbs: ["get"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: ingress-nginx-inventory-configmaps
  namespace: app-routing-system       # AKS app routing add-on
rules:
  - apiGroups: [""]
    resources: ["configmaps"]
    resourceNames: ["nginx"]          # add "<controllerNamePrefix>-<n>" for extra NginxIngressControllers
    verbs: ["get"]
# Bind each Role with a RoleBinding in the same namespace to the same subject as in 4.3.
```

### 4.5 Optional extras (separate ClusterRole, opt-in)

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: ingress-nginx-inventory-reader-extras
rules:
  # Read the Gateway API bundle-version/channel annotations from the CRDs [S44]
  - apiGroups: ["apiextensions.k8s.io"]
    resources: ["customresourcedefinitions"]
    verbs: ["get", "list"]
  # Evaluate --watch-namespace-selector against namespace labels [S54b]
  - apiGroups: [""]
    resources: ["namespaces"]
    verbs: ["get", "list"]
  # Application Gateway for Containers (agc / agcIngress): ApplicationLoadBalancer, IngressExtension,
  # FrontendTLSPolicy, HealthCheckPolicy, RoutePolicy, ... in alb.networking.azure.io/v1 [S61].
  # "*" is used because the CRD plural names were not verified.
  - apiGroups: ["alb.networking.azure.io"]
    resources: ["*"]
    verbs: ["get", "list"]
  # Istio (istio target): Gateway, VirtualService, ... in networking.istio.io [S65]
  - apiGroups: ["networking.istio.io"]
    resources: ["*"]
    verbs: ["get", "list"]
```

The Istio add-on's mesh ConfigMaps (`istio-<revision>` and `istio-shared-configmap-<revision>` in `aks-istio-system`) are named per revision [S62]. If the CLI ever needs them, use a namespaced Role there.

### 4.6 Why not the built-in `view` role, and what every user already has

- **The built-in `view` ClusterRole doesn't fit** [S40]:
  - It lacks `ingressclasses`, and it doesn't cover CRDs such as Gateway API or NginxIngressController unless they are aggregated into it.
  - It is also broader than we need: cluster-wide `configmaps`, `pods`, `pods/log`, `serviceaccounts`, `endpoints`, and more.
  - It does exclude Secrets [S39].
- **What every authenticated user already has:**
  - `system:discovery` is bound to `system:authenticated`, so `/api` and `/apis` discovery works without CRD read rights. The CLI can find out which API groups exist [S39, S40].
  - `system:basic-user` is bound to `system:authenticated` and allows `create` on `selfsubjectaccessreviews`, `selfsubjectrulesreviews` and `selfsubjectreviews` [S40]. So the CLI can run a permission preflight with no extra RBAC.
- **Preflight method:** use **SelfSubjectAccessReview** (one check per verb and resource), not SelfSubjectRulesReview. A RulesReview "may be incomplete depending on the server's authorization mode" [S41], which matters on clusters that use the Entra ID authorization webhook.

### 4.7 Clusters using Microsoft Entra ID authorization (Azure RBAC)

- **How it works:** with Entra ID authorization, an AKS webhook checks the caller's Azure role assignments through Entra ID `checkaccess` [S32]. Current docs say you can use both Kubernetes RBAC and Entra ID authorization on the same cluster, and AKS authorizes "using one (or both)" of them [S32, S63].
- **The built-in "Azure Kubernetes Service RBAC Reader" is not enough** [S29]. It covers ingresses, services, configmaps, deployments and daemonsets, plus pods, serviceaccounts and more, and no Secrets. It does **not** include `ingressclasses` or any custom resources (Gateway API, NginxIngressController).
- **Custom resources:** use the data action `Microsoft.ContainerService/managedClusters/customresources/read`. "A custom role alone doesn't filter access by custom resource definition (CRD) group or kind". Filtering takes an Azure ABAC condition on `customResources:group` / `customResources:kind`, which is **preview** [S31].
- **Never use `Microsoft.ContainerService/managedClusters/*/read`.** Older guidance used it for CRDs [S66], and the concepts page still mentions it [S32]. It also matches `Microsoft.ContainerService/managedClusters/secrets/read` [S30].

Proposed custom role (the data-action strings are from [S30]):

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
    "Microsoft.ContainerService/managedClusters/customresources/read"
  ],
  "NotDataActions": [],
  "AssignableScopes": ["/subscriptions/<subscription-id>"]
}
```

Assigning it:
- **ConfigMaps:** Azure RBAC data actions can't be narrowed to resource names. The ABAC attributes cover only custom resources [S31]. Grant `Microsoft.ContainerService/managedClusters/configmaps/read` in a second role, and assign it at namespace scope (`$AKS_ID/namespaces/ingress-nginx`, `$AKS_ID/namespaces/app-routing-system`).
  - Namespace-scoped assignments are documented for the built-in RBAC Reader and Writer roles [S31].
  - **UNVERIFIED** for custom roles.
- **Kubeconfig download:** also assign "Azure Kubernetes Service Cluster User Role" (`listClusterUserCredential/action`) [S29].
- **Propagation:** new role assignments "can take up to five minutes to propagate" [S31].
- **Optional ABAC condition (preview)** to limit `customresources/read` to the three groups the CLI reads. It is adapted from the documented single-group example [S31]; test it before shipping:

```text
(
 (
  !(ActionMatches{'Microsoft.ContainerService/managedClusters/customresources/read'})
 )
 OR
 (
  @Request[Microsoft.ContainerService/managedClusters/customResources:group] StringEqualsIgnoreCase 'gateway.networking.k8s.io'
  OR
  @Request[Microsoft.ContainerService/managedClusters/customResources:group] StringEqualsIgnoreCase 'gateway.networking.x-k8s.io'
  OR
  @Request[Microsoft.ContainerService/managedClusters/customResources:group] StringEqualsIgnoreCase 'approuting.kubernetes.azure.com'
 )
)
```

### 4.8 What "no Secrets" doesn't cover

These are recommendations; the risks follow from what the API objects contain:
- Deployment and DaemonSet pod templates can contain literal `env` values. Some teams put credentials there.
- Ingress annotations can carry configuration snippets and auth URLs. ConfigMaps can carry sensitive settings.
- The CLI should redact `env[].value` by default and keep raw exports out of shared reports.
- On clusters without Entra ID, a clusterUser kubeconfig is admin-equivalent [S28]. The CLI being read-only is then a property of the tool, not of the credential. Recommend option 4.3 B.

---

## 5. Open questions and UNVERIFIED items

1. **Node.js minor per region.** The October 2026 release gives v24.22.1 [S1], but rollout can lag up to 3–4 weeks [S4]. Some regions may still have v24.18.x. Check with `node --version`.
2. **kubectl patch and kubelogin version in Cloud Shell.** Not published. Both come from the latest upstream release at image build time [S3, S25].
3. **Cloud Shell identity and the AKS server-app audience.** Unknown whether it can get a token without `az login`, for kubelogin `-l azurecli` or command invoke. Microsoft documents an MSI 400 error for command invoke in Cloud Shell [S22].
4. **`$HOME` persistence conflict.** The FAQ says `$HOME` files are deleted at session end [S9]; the persistence pages say `$HOME` is kept in an `.img` [S8, S11]. Use `~/clouddrive`.
5. **Idle timer.** Not documented whether terminal output resets the 20-minute timer [S9].
6. **Downloads.** No documented Cloud Shell download command and no documented download size limit [S10].
7. **Command-invoke pod identity without Entra ID.** On clusters without managed Entra integration no `clusterToken` is sent [S25], and the identity inside the pod is undocumented.
8. **Command-invoke pod contents.** Image, kubectl and helm versions are undocumented. Availability of `gzip` or `base64` (useful to compress past 512 kB) is undocumented. Node.js is not listed [S21].
9. **512 kB measurement and output streams.** Unknown whether the limit applies to raw or encoded output, whether `logs` merges stdout and stderr, and how large `--file` attachments may be [S21].
10. **Role conflict for command invoke.** The troubleshooting article suggests "Azure Kubernetes Service Cluster User Role" for runCommand [S22], but that role contains neither action [S29]. Cluster Admin Role has `runcommand/action` but no `commandResults/read` [S29]. Untested whether polling succeeds without `commandResults/read`.
11. **Bastion status and syntax.** AKS docs say preview [S19]; the CLI reference lists `az aks bastion *` as GA inside the `aks-preview` extension [S36]. The Bastion how-to still shows the pre-`tunnel` syntax with `--admin` [S35].
12. **Azure RBAC and Kubernetes RBAC together.** Current AKS docs say both models can be used on one cluster [S32, S63]. Older Microsoft guidance (Cloud Adoption Framework AKS identity page, seen only in search results; the page now redirects and we couldn't retrieve the sentence) said Entra principals are "exclusively validated by Azure RBAC". Treat the per-cluster behaviour as UNVERIFIED and use SelfSubjectAccessReview.
13. **Custom roles at namespace scope.** Assigning a custom Azure role at namespace scope (for `configmaps/read`) is documented only for the built-in RBAC Reader and Writer [S31].
14. **Cloud Shell egress IPs.** Not documented, so there is no documented way to allowlist Cloud Shell for public clusters with authorized IP ranges.
15. **`NODE_OPTIONS` cipher list.** The impact analysis comes from the Node source [S57] and has not been tested against an AKS API server.
16. **Namespace typo in AKS docs.** The app-routing NGINX configuration page says the default controller is in "`app-routing-namespace`" [S50]. The operator source and the app-routing page say `app-routing-system` [S49, S51]. Treat `app-routing-system` as correct.
17. **Operator version drift.** App-routing ConfigMap naming was read from the operator's `main` branch [S47, S48]. The AKS 1.37 component list shows `app-routing-operator 0.2.27` [S37]. Naming in older add-on versions was not checked.
18. **Command invoke on special clusters.** Behaviour on network-isolated clusters and AKS Automatic is not documented.
19. **ABAC is preview.** Without ABAC, `customresources/read` grants read on every custom resource in scope [S31].

---

## Sources

- [S1] Azure Cloud Shell release notes (updated 2026-10-30): https://learn.microsoft.com/en-us/azure/cloud-shell/release-notes
- [S2] Azure/CloudShell `linux/base.Dockerfile` (master): https://github.com/Azure/CloudShell/blob/master/linux/base.Dockerfile
- [S3] Azure/CloudShell `linux/tools.Dockerfile` (master; base tag `base.master.328b89f6.20260921.1`): https://github.com/Azure/CloudShell/blob/master/linux/tools.Dockerfile
- [S4] Azure/CloudShell README (rollout lag up to 3-4 weeks; runs as a regular user): https://github.com/Azure/CloudShell
- [S5] Azure/CloudShell PR #614 "Update nodejs to v24" (merged 2026-04-21): https://github.com/Azure/CloudShell/pull/614
- [S6] Azure Linux 3.0 `SPECS/nodejs/nodejs.spec` (3.0 branch): https://github.com/microsoft/azurelinux/blob/3.0/SPECS/nodejs/nodejs.spec
- [S7] Azure Linux 3.0 package repository listing (nodejs RPM publish dates): https://packages.microsoft.com/azurelinux/3.0/prod/base/x86_64/Packages/n/
- [S8] Azure Cloud Shell features (updated 2025-12-04): https://learn.microsoft.com/en-us/azure/cloud-shell/features
- [S9] Azure Cloud Shell FAQ and troubleshooting (updated 2026-02-10): https://learn.microsoft.com/en-us/azure/cloud-shell/faq-troubleshooting
- [S10] How to use Azure Cloud Shell (Manage files, exit, timeout): https://learn.microsoft.com/en-us/azure/cloud-shell/use-the-shell-window
- [S11] Persist files in Azure Cloud Shell (ms.date 2026-10-30): https://learn.microsoft.com/en-us/azure/cloud-shell/persisting-shell-storage
- [S12] Get started with Cloud Shell ephemeral sessions: https://learn.microsoft.com/en-us/azure/cloud-shell/get-started/ephemeral
- [S13] What is Azure Cloud Shell? (overview): https://learn.microsoft.com/en-us/azure/cloud-shell/overview
- [S14] Allow multiple users to use a single storage account and file share: https://learn.microsoft.com/en-us/azure/cloud-shell/security/how-to-support-multiple-users
- [S15] Use Cloud Shell in an Azure virtual network (ms.date 2026-10-28): https://learn.microsoft.com/en-us/azure/cloud-shell/vnet/overview
- [S16] Deploy Cloud Shell in a virtual network with quickstart templates (ms.date 2026-10-28): https://learn.microsoft.com/en-us/azure/cloud-shell/vnet/deployment
- [S17] Assign necessary permissions to prepare for Network Profile deprecation (ms.date 2026-09-08): https://learn.microsoft.com/en-us/azure/cloud-shell/vnet/migrate-container-permissions
- [S18] Connect Cloud Shell to a storage account using a private endpoint: https://learn.microsoft.com/en-us/azure/cloud-shell/vnet/how-to-use-private-endpoint-storage
- [S19] Establish network connectivity to a private AKS cluster (ms.date 2026-08-13, updated 2026-10-20): https://learn.microsoft.com/en-us/azure/aks/private-cluster-connect
- [S20] Create a private AKS cluster (ms.date 2026-08-05): https://learn.microsoft.com/en-us/azure/aks/private-clusters
- [S21] Access a private AKS cluster using command invoke or Run command (updated 2026-10-20): https://learn.microsoft.com/en-us/azure/aks/access-private-cluster
- [S22] Resolve az aks command invoke failures (ms.date 2026-11-03): https://learn.microsoft.com/en-us/troubleshoot/azure/azure-kubernetes/connectivity/resolve-az-aks-command-invoke-failures
- [S23] AKS REST API, Managed Clusters - Run Command (api-version 2026-08-01): https://learn.microsoft.com/en-us/rest/api/aks/managed-clusters/run-command
- [S24] Azure CLI reference, az aks command (updated 2026-11-03): https://learn.microsoft.com/en-us/cli/azure/aks/command
- [S25] Azure CLI source, `acs/custom.py` (`aks_runcommand`, `_get_command_context`, `aks_get_credentials`, `k8s_install_cli`; dev branch, also checked at tags azure-cli-2.77.0, 2.78.0, 2.91.0): https://github.com/Azure/azure-cli/blob/dev/src/azure-cli/azure/cli/command_modules/acs/custom.py
- [S26] Azure CLI release notes (2.78.0, 2025-10-14, get-credentials conversion): https://learn.microsoft.com/en-us/cli/azure/release-notes-azure-cli
- [S27] Use kubelogin to authenticate in AKS (ms.date 2026-09-09): https://learn.microsoft.com/en-us/azure/aks/kubelogin-authentication
- [S28] Limit access to the kubeconfig file in AKS: https://learn.microsoft.com/en-us/azure/aks/control-kubeconfig-access
- [S29] Azure built-in roles for Containers (Cluster Admin, Cluster User, RBAC Reader, AKS Contributor): https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles/containers
- [S30] Azure permissions for Containers (Microsoft.ContainerService actions and data actions): https://learn.microsoft.com/en-us/azure/role-based-access-control/permissions/containers
- [S31] Use Microsoft Entra ID authorization for the Kubernetes API in AKS (updated 2026-08-18): https://learn.microsoft.com/en-us/azure/aks/entra-id-authorization
- [S32] Cluster authorization concepts in AKS (updated 2026-04-23): https://learn.microsoft.com/en-us/azure/aks/concepts-cluster-authorization
- [S33] Use Kubernetes RBAC with Microsoft Entra integration in AKS: https://learn.microsoft.com/en-us/azure/aks/kubernetes-rbac-entra-id
- [S34] Manage local accounts with AKS-managed Microsoft Entra integration: https://learn.microsoft.com/en-us/azure/aks/local-accounts
- [S35] Connect to AKS private cluster using Azure Bastion (ms.date 2025-07-29, updated 2026-08-11): https://learn.microsoft.com/en-us/azure/bastion/bastion-connect-to-aks-private-cluster
- [S36] Azure CLI reference, az aks bastion (aks-preview extension): https://learn.microsoft.com/en-us/cli/azure/aks/bastion
- [S37] Supported Kubernetes versions in AKS (release calendar; 1.37 component versions): https://learn.microsoft.com/en-us/azure/aks/supported-kubernetes-versions
- [S38] Kubernetes version skew policy (kubectl): https://kubernetes.io/releases/version-skew-policy/
- [S39] Kubernetes RBAC authorization (resourceNames; default roles): https://kubernetes.io/docs/reference/access-authn-authz/rbac/
- [S40] Kubernetes bootstrap RBAC policy source (`view`, `system:basic-user`, `system:discovery` bindings): https://github.com/kubernetes/kubernetes/blob/master/plugin/pkg/auth/authorizer/rbac/bootstrappolicy/policy.go
- [S41] SelfSubjectRulesReview API reference: https://kubernetes.io/docs/reference/kubernetes-api/authorization-resources/self-subject-rules-review-v1/
- [S42] kubectl create token: https://kubernetes.io/docs/reference/kubectl/generated/kubectl_create/kubectl_create_token/
- [S43] kubectl get (`--show-managed-fields`, `--chunk-size`): https://kubernetes.io/docs/reference/kubectl/generated/kubectl_get/
- [S44] Gateway API v1.7.0 release (standard-install.yaml and experimental-install.yaml assets; released 2026-10-29): https://github.com/kubernetes-sigs/gateway-api/releases/tag/v1.7.0
- [S45] Gateway API v1.4.0 / v1.5.0 / v1.6.0 releases (experimental CRD sets): https://github.com/kubernetes-sigs/gateway-api/releases
- [S46] AKS app routing operator, NginxIngressController CRD: https://github.com/Azure/aks-app-routing-operator/blob/main/config/crd/bases/approuting.kubernetes.azure.com_nginxingresscontrollers.yaml
- [S47] AKS app routing operator, `pkg/manifests/nginx.go` (`--configmap=$(POD_NAMESPACE)/<resourceName>`, ConfigMap name): https://github.com/Azure/aks-app-routing-operator/blob/main/pkg/manifests/nginx.go
- [S48] AKS app routing operator, NginxIngressController controller (default name `nginx`; `<prefix>-<collisionCount>`): https://github.com/Azure/aks-app-routing-operator/blob/main/pkg/controller/nginxingress/nginx_ingress_controller.go and https://github.com/Azure/aks-app-routing-operator/blob/main/pkg/controller/nginxingress/default.go
- [S49] AKS app routing operator, `pkg/config/config.go` (`DefaultNs = "app-routing-system"`): https://github.com/Azure/aks-app-routing-operator/blob/main/pkg/config/config.go
- [S50] Advanced NGINX ingress controller configuration with the application routing add-on (ms.date 2026-10-26): https://learn.microsoft.com/en-us/azure/aks/app-routing-nginx-configuration
- [S51] Managed NGINX ingress with the application routing add-on (ms.date 2026-10-26): https://learn.microsoft.com/en-us/azure/aks/app-routing
- [S52] ingress-nginx Helm chart `_params.tpl` at helm-chart-4.15.1: https://github.com/kubernetes/ingress-nginx/blob/helm-chart-4.15.1/charts/ingress-nginx/templates/_params.tpl
- [S53] ingress-nginx Helm chart `_helpers.tpl` at helm-chart-4.15.1 (fullname rules): https://github.com/kubernetes/ingress-nginx/blob/helm-chart-4.15.1/charts/ingress-nginx/templates/_helpers.tpl
- [S54] ingress-nginx static manifest at controller-v1.15.1 (`--configmap=$(POD_NAMESPACE)/ingress-nginx-controller`): https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/deploy/static/provider/cloud/deploy.yaml
- [S54b] ingress-nginx CLI arguments at controller-v1.15.1 (`--watch-namespace`, `--watch-namespace-selector`, `--configmap`, `--tcp-services-configmap`): https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/docs/user-guide/cli-arguments.md
- [S55] kubernetes/ingress-nginx releases (controller-v1.15.1 and helm-chart-4.15.1 on 2026-03-19; repository archived): https://github.com/kubernetes/ingress-nginx/releases
- [S56] Node.js v24 TLS docs, "Modifying the default TLS cipher suite": https://nodejs.org/docs/latest-v24.x/api/tls.html
- [S57] Node.js v24.x `lib/internal/tls/secure-context.js` (`processCiphers`, `setCipherSuites` logic): https://github.com/nodejs/node/blob/v24.x/lib/internal/tls/secure-context.js
- [S58] Node.js release schedule (`schedule.json`): https://github.com/nodejs/Release/blob/main/schedule.json
- [S59] Ubuntu packages, nodejs 12.22.9 (jammy) and 18.19.1 (noble): https://packages.ubuntu.com/jammy/nodejs and https://packages.ubuntu.com/noble/nodejs
- [S60] @kubernetes/client-node `src/exec_auth.ts` (ExecAuth for kubeconfig exec plugins): https://github.com/kubernetes-client/javascript/blob/main/src/exec_auth.ts
- [S61] Application Gateway for Containers API specification for Kubernetes (`alb.networking.azure.io/v1`, updated 2026-11-03): https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/api-specification-kubernetes
- [S62] Configure Istio-based service mesh add-on MeshConfig (`aks-istio-system` ConfigMaps): https://learn.microsoft.com/en-us/azure/aks/istio-meshconfig
- [S63] Access and identity options for AKS (authorization "using one (or both) of two models"): https://learn.microsoft.com/en-us/azure/aks/concepts-identity
- [S64] Upstream kubectl stable marker (v1.37.2 on 2026-11-04): https://dl.k8s.io/release/stable.txt
- [S65] Istio networking API reference (`networking.istio.io/v1`): https://istio.io/latest/docs/reference/config/networking/virtual-service/
- [S66] Earlier AKS doc revision, manage-azure-rbac.md (2025-06; "the only way to cover CRDs today is to use `Microsoft.ContainerService/managedClusters/*/read`"): https://github.com/MicrosoftDocs/azure-aks-docs/blob/20f18e0c8ccc8236bbd74acdd0a826eb9ba0aa4b/articles/aks/manage-azure-rbac.md
