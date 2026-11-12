# ingress-nginx-inventory

[English version](README.md)

Un outil en ligne de commande, en lecture seule, qui inventorie l'usage d'[ingress-nginx](https://github.com/kubernetes/ingress-nginx) dans un cluster Kubernetes et produit un rapport de préparation à la migration vers Gateway API sur Azure Kubernetes Service (AKS). Il vise AKS d'abord et fonctionne sur tout cluster.

- **Un seul fichier**, `ingress-inventory.mjs`, sans dépendance. Il faut Node.js 18 ou plus (testé sur Node.js 24, la version de Cloud Shell), et kubectl sauf en mode hors ligne.
- **Lecture seule.** Il exécute `kubectl get`, `kubectl version` et `kubectl config current-context`, rien d'autre. Il ne lit jamais de Secret.
- **Rien ne quitte votre machine.** Ni télémétrie ni connexion réseau propre : kubectl parle à votre serveur d'API, et l'outil écrit ses fichiers dans un seul dossier.
- **Rapport en anglais ou en français** (`--lang en|fr`), avec un mode `--anonymize` pour le partager.
- Licence MIT, maintenu par CLAZA IT.

## Ce que couvre le rapport

- **Contrôleurs** : les contrôleurs ingress-nginx du cluster (communautaire, add-on de routage d'applications d'AKS, forks et builds d'éditeur), leur version, leur état de support daté et leurs CVE connues, et les Ingress que chacun sert, selon les règles de sélection d'ingress-nginx lui-même.
- **Périmètre** : Ingress, espaces de noms, routes, hôtes, hôtes et noms de Secret TLS, chemins regex et `ImplementationSpecific`, Services backend.
- **Profil de traduction** : chaque annotation et chaque clé de la ConfigMap du contrôleur, classées par groupe, avec la construction Gateway API et le support sur chacune des quatre cibles ci-dessous.
- **Comportements par défaut qui changent** après la migration, à partir de la configuration de votre contrôleur, avec un test pour chacun.
- **Réseau** : les adresses de load balancer qui vont changer, et les ressources Gateway API déjà présentes.
- **Prochaines étapes**, dont la commande ingress2gateway qui prépare les manifestes Gateway API.

Les quatre cibles AKS :

| Colonne du rapport | Cible | Description |
|---|---|---|
| App routing GW | `appRoutingGateway` | Add-on de routage d'applications d'AKS, implémentation Gateway API (basée sur Istio ; GatewayClass `approuting-istio`) |
| AGC | `agc` | Application Gateway for Containers, Gateway API (GatewayClass `azure-alb-external`) |
| AGC Ingress | `agcIngress` | Application Gateway for Containers, API Ingress : vous gardez vos objets Ingress et changez de contrôleur (`ingressClassName: azure-alb-external`) |
| Istio add-on | `istio` | Add-on de maillage de services Istio d'AKS, entrée Gateway API (GatewayClass `istio`) |

## Pourquoi maintenant

État au 4 novembre 2026, avec les sources. Le rapport reprend les mêmes lignes datées depuis son catalogue ; le détail des CVE est dans la [version anglaise](README.md#why-now).

- Le projet Kubernetes a annoncé la fin d'ingress-nginx le 11 novembre 2025 : maintenance au mieux jusqu'en mars 2026, puis plus de correctifs ([blog Kubernetes](https://kubernetes.io/blog/2025/11/11/ingress-nginx-retirement/)). Dernières versions v1.15.1, v1.14.5 et v1.13.9 le 19 mars 2026, dépôt archivé le 24 mars 2026 ([versions](https://github.com/kubernetes/ingress-nginx/releases)).
- Add-on de routage d'applications d'AKS, NGINX managé : Microsoft fournit les correctifs de sécurité critiques « through November 2026 », sans jour de fin publié ([documentation AKS](https://learn.microsoft.com/en-us/azure/aks/app-routing)), puis plus aucun ([blog AKS, 2 novembre 2026](https://blog.aks.azure.com/2026/11/02/automatic-enhancements)). Aucune prolongation annoncée.
- `appRoutingGateway` : disponibilité générale avec la version AKS du 28 avril 2026 ([version](https://github.com/Azure/AKS/releases/tag/2026-04-28)). `istio` : pas d'annonce formelle de disponibilité générale ([commit de documentation](https://github.com/MicrosoftDocs/azure-aks-docs/commit/3f2f22fbea677d6dc7e40ac498400373d85e70cc)). `agc` et `agcIngress` : disponibilité générale depuis le 27 février 2024 ([Azure Updates](https://azure.microsoft.com/updates?id=general-availability-application-gateway-for-containers)).
- AKS installe ses CRD Gateway API managées depuis le seul canal standard, selon la version mineure de Kubernetes : v1.2.1 jusqu'à 1.33, v1.3.0 en 1.34, v1.4.1 en 1.35, v1.5.1 en 1.36, v1.6.1 à partir de 1.37 ([documentation AKS](https://learn.microsoft.com/en-us/azure/aks/managed-gateway-api)). Ce bundle décide des fonctions Gateway API utilisables.

## Démarrage rapide dans Azure Cloud Shell

Cloud Shell contient déjà Node.js, kubectl et Azure CLI. Lancer ces commandes dans son shell Bash ; votre compte doit pouvoir lire le cluster (voir [Droits](#droits)).

<!-- TODO before publishing : REPO_URL placeholder (https://github.com/CLAZA-ORG/ingress-nginx-inventory). Release v0.1.0 must carry the assets ingress-inventory.mjs and SHA256SUMS. -->
```bash
# 1. Pointer kubectl sur le cluster
az aks get-credentials --resource-group <groupe-de-ressources> --name <nom-du-cluster>
kubectl config current-context

# 2. Télécharger une version figée dans le partage persistant, puis vérifier son SHA-256
mkdir -p ~/clouddrive/ingress-inventory && cd ~/clouddrive/ingress-inventory
curl -fsSL -o ingress-inventory.mjs https://github.com/CLAZA-ORG/ingress-nginx-inventory/releases/download/v0.1.0/ingress-inventory.mjs
curl -fsSL -o SHA256SUMS https://github.com/CLAZA-ORG/ingress-nginx-inventory/releases/download/v0.1.0/SHA256SUMS
sha256sum -c SHA256SUMS          # doit afficher : ingress-inventory.mjs: OK

# 3. Lancer l'outil, rapport en français
node ingress-inventory.mjs --lang fr
```

L'outil affiche une courte synthèse et les chemins des fichiers produits, dans un nouveau dossier `ingress-inventory-<contexte>-<AAAAMMJJ-HHmm>`. Pour récupérer un fichier, utiliser **Gérer les fichiers > Télécharger** dans Cloud Shell avec son chemin complet. [SECURITY.md](SECURITY.md#verify-a-release) explique ce que prouve la somme de contrôle.

Remarques sur Cloud Shell :

- **kubectl 1.37 et clusters plus anciens.** Kubernetes ne prend en charge kubectl qu'à une version mineure près du serveur ; avec AKS 1.34 ou 1.35, le kubectl de Cloud Shell sort de cet écart. En cas d'erreur, passer `--kubectl <chemin>` vers un kubectl adapté.
- **Écrire sous `~/clouddrive`**, partage Azure Files persistant : toute personne ayant assez de droits sur l'abonnement peut le lire. Supprimer les résultats après usage, ou utiliser `--anonymize`.
- **Délai d'inactivité de 20 minutes** : lancer l'outil dans une session active et récupérer les fichiers rapidement.

## Ce qu'il exécute, et ce qu'il ne fait jamais

En mode direct, l'outil exécute dans l'ordre : `kubectl version -o json` ; `kubectl config current-context` (sans `--context`) ; `kubectl get` sur les IngressClass, les Ingress (`-A`, seul appel bloquant), les Deployments, DaemonSets et Services (`-A`) ; `kubectl get configmap <nom> -n <espace>` pour chaque ConfigMap désignée par les options d'un contrôleur détecté ; enfin, si ces types existent, les NginxIngressController, GatewayClass, Gateway, HTTPRoute et les annotations de la CRD `gateways.gateway.networking.k8s.io`. Chaque appel reçoit `--request-timeout=60s`, passe par une liste blanche et est lancé sans shell. Le tableau détaillé est dans la [version anglaise](README.md#what-it-runs-and-what-it-never-does).

L'outil ne fait jamais :

- d'autre verbe kubectl que `get`, `version` et `config current-context` (les tests vérifient le refus de `apply`, `delete`, `patch`, `exec` et de toute forme de `secrets`) ;
- de lecture de Secret : les noms de Secret TLS viennent du champ `spec.tls[].secretName` des Ingress ;
- de lancement d'un autre programme que kubectl, ni d'appel à Azure ;
- de connexion réseau propre, de télémétrie ou de vérification de mise à jour ;
- d'affichage des variables d'environnement ou des arguments arbitraires des conteneurs ;
- d'affichage du contenu des snippets (seulement leur nombre de lignes) ;
- d'écriture hors du dossier `--out`, ou dans un dossier non vide qu'il n'a pas créé.

## Droits

[docs/rbac/read-only-clusterrole.yaml](docs/rbac/read-only-clusterrole.yaml) propose un ClusterRole minimal : `get` et `list` sur les objets lus, ConfigMaps par nom seulement, aucun Secret. Vérifier avant de lancer :

```bash
kubectl auth can-i list ingresses.networking.k8s.io -A    # yes
kubectl auth can-i get secrets -A                         # no, si seul le rôle en lecture seule est lié
```

## Clusters privés

Si le serveur d'API n'est pas joignable depuis Cloud Shell : Cloud Shell dans un réseau virtuel, Azure Bastion, une machine de rebond, ou un export par `az aks command invoke` (un appel par type de ressource, sortie limitée à 512 ko par appel) analysé ensuite avec `--from-dir`. Les commandes exactes sont dans la [version anglaise](README.md#private-clusters).

## Options

| Option | Effet |
|---|---|
| `--context <nom>` | contexte kubectl (défaut : contexte courant) |
| `--kubeconfig <chemin>` | transmis à kubectl |
| `--kubectl <chemin>` | binaire kubectl (défaut : kubectl du PATH) |
| `--from-dir <dossier>` | analyser des fichiers JSON exportés au lieu d'appeler kubectl |
| `--out <dossier>` | dossier de sortie (défaut : `./ingress-inventory-<contexte>-<AAAAMMJJ-HHmm>`) |
| `--lang en\|fr` | langue du rapport (défaut : en, ou fr si `LC_ALL` ou `LANG` commence par fr) |
| `--anonymize` | pseudonymiser les identifiants |
| `--quiet` | n'afficher que les chemins des fichiers |
| `-h`, `--help` / `-v`, `--version` | aide / version |

Codes de sortie : 0 succès (les constats ne sont pas des erreurs), 1 erreur bloquante, 2 erreur d'usage.

## Fichiers produits et `--anonymize`

| Fichier | Contenu |
|---|---|
| `report.md` | le rapport |
| `ingress-inventory.json` | les mêmes données pour des scripts (`schemaVersion: 1`) |
| `.ingress-inventory` | marqueur : le dossier a été créé par l'outil |
| `anonymization-map.local.json` | avec `--anonymize` seulement : la table des pseudonymes vers les vrais noms. **Ne jamais la partager.** |

`--anonymize` remplace les noms de cluster, d'espaces de noms, d'Ingress, de Services, de workloads et de Secrets TLS, les hôtes, les adresses IP et CIDR, les segments de chemin et les noms de ressources Azure par des pseudonymes stables pour l'exécution. Les comptes et les groupes sont calculés avant. Vous pouvez alors partager `report.md` et `ingress-inventory.json`, par exemple pour obtenir une estimation de migration, et garder `anonymization-map.local.json` sur votre machine.

## Lire le rapport

Groupes de traduction :

- **direct** : Gateway API standard (Core ou Extended) prise en charge par `appRoutingGateway`, `agc` et `istio` ; traduction mécanique.
- **policy** : exige une ressource propre à la cible, une fonction expérimentale, ou un support qui diffère selon la cible.
- **redesign** : pas d'équivalent ; le comportement doit partir ailleurs (application, Azure Front Door ou WAF, API Management) ou être abandonné.
- **none** : rien à traduire (réglage interne de NGINX) ; vérifier tout de même les comportements par défaut.
- **unknown** : clé absente du catalogue (faute de frappe, préfixe personnalisé, annotation retirée).

Cellules de support : ✓ oui, ~ partiel (limites documentées, préversion, certaines versions d'AKS ou d'ALB Controller), ✗ non, ? inconnu (documentation muette), – rien à traduire.

## Étape suivante : préparer les manifestes avec ingress2gateway

Le rapport donne la commande pour chaque classe trouvée, par exemple :

```bash
ingress2gateway print --providers=ingress-nginx --ingress-nginx-ingress-class=webapprouting.kubernetes.azure.com \
  --all-namespaces --no-color > i2gw.yaml 2> i2gw.notes.txt
```

ingress2gateway v1.2.0 ne lit que les Ingress et les Services, ignore les Ingress sans classe, et nomme la GatewayClass d'après la classe d'Ingress : la renommer en `approuting-istio`, `istio` ou `azure-alb-external`. Ses redirections 308 sont refusées par les CRD managées d'AKS 1.35 et antérieures. Il ne produit rien pour l'API Ingress d'AGC.

## Limites

- Le catalogue est daté : vérifier chaque constat dans votre environnement avant d'agir.
- Les valeurs par défaut d'Istio sont celles de l'amont ; d'éventuelles surcharges d'AKS ne sont pas publiées.
- Les builds Microsoft et les forks n'ont pas de verdict CVE : leur version ne dit pas quels correctifs ils contiennent.
- Outil indépendant, sans lien avec Microsoft, le projet Kubernetes ou F5.

## Sécurité

Voir [SECURITY.md](SECURITY.md) pour signaler une vulnérabilité et vérifier une version.

## Licence

[MIT](LICENSE), Copyright (c) 2026 CLAZA IT.

<!-- TODO before publishing : OFFER_URL.fr placeholder (https://claza.cloud/sortie-ingress-nginx-aks/). -->
CLAZA IT, qui maintient cet outil, propose un plan de migration au forfait construit à partir de ce rapport : [claza.cloud](https://claza.cloud/sortie-ingress-nginx-aks/).
