# Inventaire ingress-nginx : unknown-context

- Contexte : `unknown-context`
- Généré le : 2026-11-09T12:00:00.000Z
- Outil : ingress-nginx-inventory 0.1.0 ; Catalogue : 2026-11-09
- Mode : hors ligne (--from-dir) ; Pseudonymisé : non
- Serveur Kubernetes : v1.34.4

> Hors ligne : ce rapport vient de fichiers exportés ; l'outil n'a contacté aucun cluster et rien n'a quitté cette machine.

## 1. Synthèse

### Contrôleurs

- `ingress-nginx/ingress-nginx-controller` (Deployment, 2×) : Community ingress-nginx `1.11.3` : vulnérable : 12 CVE non corrigée(s) ; 4 Ingress ; IngressClass : `nginx`

### État du support

- 2025-11-11 : Kubernetes a annoncé la fin d'ingress-nginx : maintenance au mieux jusqu'en mars 2026, puis plus aucune version ni correctif de sécurité. [source](https://kubernetes.io/blog/2025/11/11/ingress-nginx-retirement/)
- 2026-03-19 : Dernières versions amont v1.15.1, v1.14.5 et v1.13.9 ; dépôts archivés le 24 mars 2026. Aucune CVE ingress-nginx publiée depuis CVE-2026-4342. [source](https://github.com/kubernetes/ingress-nginx/releases)
- 2026-11 : Microsoft fournit les correctifs de sécurité critiques du NGINX managé du routage d'applications AKS jusqu'en novembre 2026 ; ni jour exact ni prolongation publiés (vérifié le 4 novembre 2026). [source](https://learn.microsoft.com/en-us/azure/aks/app-routing)
- 2026-04-28 : L'implémentation Gateway API du routage d'applications AKS (GatewayClass approuting-istio) est en disponibilité générale depuis la version AKS du 28 avril 2026. [source](https://github.com/Azure/AKS/releases/tag/2026-04-28)
- 2026-05-27 : Entrée Gateway API de l'add-on Istio d'AKS : mentions de préversion retirées de la documentation le 27 mai 2026 ; aucune annonce formelle de disponibilité générale trouvée. [source](https://github.com/MicrosoftDocs/azure-aks-docs/commit/3f2f22fbea677d6dc7e40ac498400373d85e70cc)
- 2026-10-25 : Les CRD Gateway API managées par AKS sont du canal standard seulement, un bundle par version mineure : &lt;=1.33 v1.2.1, 1.34 v1.3.0, 1.35 v1.4.1, 1.36 v1.5.1, 1.37+ v1.6.1. [source](https://learn.microsoft.com/en-us/azure/aks/managed-gateway-api)
- 2024-02-27 : Application Gateway for Containers est en disponibilité générale ; ALB Controller 1.13.0 prend en charge Gateway API v1.6.2 ; l'add-on AGC pour AKS est en préversion. [source](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/alb-controller-release-notes)
- 2026-10-29 : Gateway API v1.7.0 est sortie le 29 octobre 2026 (les retries d'HTTPRoute passent au canal standard) ; aucun bundle managé par AKS ne l'inclut encore. [source](https://github.com/kubernetes-sigs/gateway-api/releases)

### Sécurité

- `ingress-nginx/ingress-nginx-controller` : 12 CVE non corrigée(s) : CVE-2025-1974, CVE-2025-1097, CVE-2025-1098, CVE-2025-24514, CVE-2025-24513, CVE-2025-15566, CVE-2026-1580, CVE-2026-24512, CVE-2026-24513, CVE-2026-24514, CVE-2026-3288, CVE-2026-4342
- `ingress-nginx/ingress-nginx-controller` : webhook d'admission actif (--validating-webhook), surface d'attaque de CVE-2025-1974, CVE-2025-24513, CVE-2026-24514
- ConfigMap `ingress-nginx/ingress-nginx-controller` : allow-snippet-annotations vaut "true" : quiconque peut modifier un Ingress peut injecter de la configuration NGINX
- ConfigMap `ingress-nginx/ingress-nginx-controller` : snippets globaux définis (server-snippet)
- 1 Ingress utilisent des annotations snippet (configuration-snippet)

### Périmètre

4 Ingress sur 5 servis par ingress-nginx, dans 2 espace(s) de noms : **3 routes** (couples hôte et chemin distincts, plus 0 backend(s) par défaut), 2 hôtes, 1 hôtes TLS, 1 noms de Secret TLS, 4 Services backend.

Correspondance des chemins : 2 route(s) sur des hôtes à regex, 2 chemin(s) ImplementationSpecific, 0 Ingress sans classe servi(s).

### Profil de traduction

| Groupe | Clés | Ingress | Signification |
|---|---:|---:|---|
| redesign | 0 | 0 | pas d'équivalent sur les cibles : déplacer le comportement ou l'abandonner |
| unknown | 0 | 0 | absente du catalogue : vérifier la clé |
| policy | 4 | 3 | exige une ressource propre à la cible ou une fonction expérimentale |
| direct | 7 | 4 | Gateway API standard, traduction mécanique |
| none | 1 | 1 | rien à traduire (vérifier les changements de comportement) |

### Adresses de load balancer qui vont changer

- `ingress-nginx/ingress-nginx-controller` : `20.0.113.10`

### Gateway API déjà présente dans le cluster

Aucune GatewayClass trouvée.

Étape suivante : section 9.

## 2. Annotations

Clés trouvées sur les Ingress servis par ingress-nginx, triées par groupe puis par usage.

| Clé | Ingress | Valeurs | Groupe | Gateway API | App routing GW | AGC | AGC Ingress | Istio add-on | Note |
|---|---:|---|---|---|---|---|---|---|---|
| `nginx.ingress.kubernetes.io/proxy-body-size` | 1 | `50m` | policy | – | ✗ | ? | ? | ~ | Les limites relevées passent sur les cibles Envoy (aucun plafond), mais le plafond disparaît : appliquez-le dans l'application, ou sur istio avec un EnvoyFilter de Gateway. Sur AGC, testez des envois à votre taille maximale. |
| `nginx.ingress.kubernetes.io/proxy-read-timeout` (above 60 s (raised for slow, streaming or long-polling backends)) | 1 | `300` | policy | HTTPRoute rules[].timeouts.request / backendRequest (total time, not idle) (standard, extended) | ~ | ~ | ~ | ~ | Délai relevé : AGC coupe toute requête à 60 s au total par défaut ; réglez timeouts.request de l'HTTPRoute (ALB 1.11.1+), RoutePolicy ou IngressExtension à cette valeur ou à 0s. Les cibles Istio n'ont pas de timeout de route par défaut. |
| `nginx.ingress.kubernetes.io/use-regex` | 1 | `true` | policy | HTTPRoute match path type RegularExpression (standard, implementation-specific) | ✓ | ✓ | ? | ✓ | Réécrivez chaque motif en RE2 sur le chemin entier (style (?i)^/api/.\\*), utilisez PathPrefix quand la regex n'était qu'un préfixe, et vérifiez qu'aucune règle PathPrefix / ne la masque sur Istio. |
| `nginx.ingress.kubernetes.io/whitelist-source-range` | 1 | `203.0.113.0/24,198.51.100.7/32` | policy | none (implementation-specific policy) (none, none) | ~ | ~ | ~ | ✓ | Conservez ce contrôle de sécurité : AuthorizationPolicy sur istio, IPMatch WAF ou NSG sur agc, plages source du LB sur une Gateway dédiée pour appRoutingGateway ; passez d'abord externalTrafficPolicy en Local. |
| `kubernetes.io/ingress.class` | 1 | `nginx` | direct | Gateway.spec.gatewayClassName + HTTPRoute.spec.parentRefs (standard, core) | ✓ | ✓ | ✓ | ✓ | Lancez ingress2gateway une fois par classe avec --ingress-nginx-ingress-class=&lt;valeur&gt; ; il nomme le Gateway et son gatewayClassName d'après la classe : remplacez les deux par la classe cible. |
| `nginx.ingress.kubernetes.io/canary` | 1 | `true` | direct | HTTPRoute rule with two backendRefs[].weight (plus header matches for canary-by-header) (standard, core) | ✓ | ✓ | ✗ | ✓ | Placez les Services principal et canary dans une même règle d'HTTPRoute avec des poids (ingress2gateway le fait). agcIngress n'a pas de canary : passez ces hosts sur agc. Supprimez l'Ingress canary après bascule. |
| `nginx.ingress.kubernetes.io/canary-weight` | 1 | `10` | direct | HTTPRoute backendRefs[].weight (standard, core) | ✓ | ✓ | ✗ | ✓ | Mettez poids canary = cette valeur et poids principal = total moins elle dans une même règle d'HTTPRoute (ingress2gateway le fait). agcIngress n'a pas de poids : passez le host sur agc. |
| `nginx.ingress.kubernetes.io/configuration-snippet` (only static header directives) | 1 | 2 ligne(s), non affichées | direct | – | ✓ | ~ | ~ | ✓ | Headers seulement : more_set_headers ou add_header deviennent ResponseHeaderModifier, proxy_set_header ou more_set_input_headers RequestHeaderModifier, more_clear_headers un remove. Puis désactivez les snippets. |
| `nginx.ingress.kubernetes.io/enable-cors` | 1 | `true` | direct | HTTPRoute filter type CORS (Standard since v1.5.0) (standard, extended) | ~ | ~ | ✗ | ~ | Traduisez en filtre CORS d'HTTPRoute (AKS 1.36+, ALB 1.11.1+). Relisez la sortie d'ingress2gateway : avec l'origine \\*, mettez allowCredentials à false ou listez les origines, sinon le CORS avec identifiants s'ouvre à tous les sites. |
| `nginx.ingress.kubernetes.io/rewrite-target` (a single capture reference at the end, e.g. /$2 or /api/$1 (prefix-strip pattern)) | 1 | `/$2` | direct | HTTPRoute filter URLRewrite path (ReplaceFullPath or ReplacePrefixMatch) (standard, extended) | ✓ | ✓ | ~ | ✓ | Suppression de préfixe : si le chemin est &lt;prefix&gt;(/\|$)(.\\*) ou &lt;prefix&gt;/(.\\*), utilisez un match PathPrefix &lt;prefix&gt; avec URLRewrite ReplacePrefixMatch &lt;partie fixe&gt;. Les autres regex n'ont pas d'équivalent. |
| `nginx.ingress.kubernetes.io/ssl-redirect` (false) | 1 | `false` | direct | HTTPRoute on the HTTP listener (sectionName) with RequestRedirect scheme https (standard, extended) | ✓ | ✓ | ~ | ✓ | Pas de redirection : attachez l'HTTPRoute aux listeners HTTP et HTTPS pour que le HTTP simple atteigne encore le backend (ingress2gateway copie la règle). |
| `nginx.ingress.kubernetes.io/secure-verify-ca-secret` | 1 | `blog/ca` | none | – | – | – | – | – | Supprimez-la : elle ne vérifie plus rien depuis au moins v1.0.0. Si la vérification du certificat du backend compte, configurez-la avec une BackendTLSPolicy sur la nouvelle gateway. |

Support : ✓ oui, ~ partiel, ✗ non, ? inconnu, – rien à traduire. Groupes : voir la section 1.

### Hôtes à regex

use-regex, ou un rewrite-target différent du chemin, sur un seul Ingress fait de chaque chemin de l'hôte une regex de préfixe insensible à la casse, pour tous les Ingress de cet hôte.

- `shop.example.com` : 3 Ingress ; posé par `nginx.ingress.kubernetes.io/use-regex` (shop/shop-api)

### Annotations d'IngressClass

- `nginx` : `ingressclass.kubernetes.io/is-default-class=true` : Gateway API n'a pas de Gateway par défaut dans le canal standard : chaque HTTPRoute doit nommer son Gateway. Retirez le marquage de la classe NGINX à la bascule.

## 3. Réglages du contrôleur

### ConfigMap ingress-nginx/ingress-nginx-controller (utilisée par ingress-nginx/ingress-nginx-controller)

| Clé | Valeur | Groupe | App routing GW | AGC | AGC Ingress | Istio add-on | Note |
|---|---|---|---|---|---|---|---|
| `server-snippet` | 2 ligne(s), non affichées | redesign | ✗ | ✗ | ✗ | ~ | S'applique à tous les hosts : sa perte touche tout le cluster. Listez chaque directive : redirections et headers passent souvent en filtres HTTPRoute ; règles d'accès, locations ajoutées et Lua demandent une refonte. |
| `proxy-body-size` | `10m` | policy | ✗ | ? | ? | ~ | Les cibles Envoy suppriment le plafond : appliquez-le dans l'application, ou sur istio avec un EnvoyFilter de Gateway (buffer filter). Sur AGC la limite n'est pas documentée : testez des envois à votre taille maximale. |
| `use-forwarded-headers` | `true` | policy | ? | ~ | ~ | ~ | Istio : réglez numTrustedProxies (global, Allowed). App routing : aucun réglage documenté. AGC : complète XFF, sans réglage de confiance. Redirigez vers HTTPS sur le proxy qui termine TLS. |
| `allow-snippet-annotations` | `true` | none | – | – | – | – | Les annotations snippet étaient autorisées : risque d'injection de configuration (CVE-2021-25742). Listez chaque annotation \\*-snippet, chacune demande une refonte. L'add-on AKS met true par conception. |
| `hsts` | `false` | none | ✓ | ✓ | ✓ | ✓ | HSTS était désactivé : les cibles n'en envoient pas par défaut ; rien à traduire. |

## 4. Comportements par défaut qui changent

Comportements d'ingress-nginx qui changent sans prévenir après la migration, même sans annotation. Tester chacun sur les deux points d'entrée avant de basculer le DNS.

<details>
<summary>B1. Redirection HTTP vers HTTPS (modifié dans ce cluster)</summary>

- Défaut ingress-nginx : Active : 308 pour chaque hôte d'un Ingress non canary avec spec.tls (ssl-redirect true, http-redirect-code 308) ; chemins ACME exemptés ; / final retiré.
- Dans ce cluster : annotation `ssl-redirect` sur 1 Ingress
- Routage d'applications AKS, implémentation Gateway API : Aucune par défaut : ajouter une HTTPRoute sur le listener HTTP avec RequestRedirect scheme https ; code 302 par défaut, 308 seulement à partir d'AKS 1.36 (bundle v1.5.1).
- Application Gateway for Containers, Gateway API : Aucune par défaut : une HTTPRoute explicite sur le listener du port 80 ; 301 ou 302, 307 et 308 à partir d'ALB Controller 1.11.1 ; 303 non vérifié.
- Application Gateway for Containers, API Ingress : Aucune par défaut : un second Ingress dont l'IngressExtension définit requestRedirect scheme https.
- Add-on de maillage de services Istio d'AKS, entrée Gateway API : Aucune par défaut : ajouter une HTTPRoute sur le listener HTTP avec RequestRedirect scheme https ; code 302 par défaut, 308 seulement à partir d'AKS 1.36 (bundle v1.5.1).
- Impact : Les requêtes HTTP sont servies en clair ou refusées au lieu d'être redirigées ; une redirection écrite à la main vaut 302 par défaut, et 301 ou 302 peut changer un POST en GET.
- Test : curl -si -X POST --resolve $H:80:$OLD http://$H/a/b/ (NGINX : 308, location https://$H/a/b) ; refaire avec $NEW, puis pour /.well-known/acme-challenge/x.

</details>

<details>
<summary>B2. En-tête HSTS ajouté par défaut (modifié dans ce cluster ; déduit du code source)</summary>

- Défaut ingress-nginx : Actif : Strict-Transport-Security max-age=31536000 ; includeSubDomains sur chaque réponse servie en HTTPS par NGINX, hôtes inconnus compris (déduit de lua_ingress.lua).
- Dans ce cluster : ConfigMap `ingress-nginx/ingress-nginx-controller` : `hsts` = `false`
- Routage d'applications AKS, implémentation Gateway API : Aucun : Gateway API n'a pas de champ HSTS ; ajouter un ResponseHeaderModifier qui pose Strict-Transport-Security sur les routes HTTPS.
- Application Gateway for Containers, Gateway API : Aucun défaut documenté ; ajouter un ResponseHeaderModifier sur les routes HTTPS.
- Application Gateway for Containers, API Ingress : Aucun défaut documenté ; ajouter un ResponseHeaderModifier par hôte dans l'IngressExtension.
- Add-on de maillage de services Istio d'AKS, entrée Gateway API : Aucun : Gateway API n'a pas de champ HSTS ; ajouter un ResponseHeaderModifier qui pose Strict-Transport-Security sur les routes HTTPS.
- Impact : Les navigateurs déjà venus gardent la politique en cache jusqu'à expiration, les nouveaux visiteurs n'en reçoivent pas, et les scanners signalent l'en-tête manquant.
- Test : curl -sI --resolve $H:443:$NEW https://$H/ | grep -i strict-transport, sur une page 200 et sur un chemin 404 ; comparer avec $OLD.

</details>

<details>
<summary>B3. Certificat par défaut pour un SNI inconnu ou absent (déduit du code source)</summary>

- Défaut ingress-nginx : Un SNI inconnu ou absent reçoit --default-ssl-certificate, sinon un faux certificat autosigné, puis le 404 du serveur par défaut (ssl-reject-handshake false).
- Dans ce cluster : inchangé (le défaut s'applique)
- Routage d'applications AKS, implémentation Gateway API : Poignée de main refusée quand chaque listener HTTPS du port a un hostname ; un listener sans hostname accepte tout SNI avec son propre certificat (déduit).
- Application Gateway for Containers, Gateway API : Non documenté.
- Application Gateway for Containers, API Ingress : Non documenté.
- Add-on de maillage de services Istio d'AKS, entrée Gateway API : Poignée de main refusée quand chaque listener HTTPS du port a un hostname ; un listener sans hostname accepte tout SNI avec son propre certificat (déduit).
- Impact : Les clients sans SNI ou avec un SNI inconnu (sondes par IP, scanners, vieux clients) reçoivent un échec TLS au lieu d'un avertissement de certificat suivi d'un 404.
- Test : openssl s_client -connect $NEW:443 -servername nohost.invalid &lt;/dev/null, puis avec -noservername ; comparer le résultat et le sujet du certificat avec $OLD.

</details>

<details>
<summary>B4. Protocoles, suites et courbes TLS</summary>

- Défaut ingress-nginx : TLS 1.2 et 1.3 ; suites ECDHE plus deux suites DHE, préférence serveur ; courbe auto ; tickets de session désactivés.
- Dans ce cluster : inchangé (le défaut s'applique)
- Routage d'applications AKS, implémentation Gateway API : Défauts d'Envoy : TLS 1.2 à 1.3, pas de DHE, courbes X25519 et P-256 ; l'option de suites d'Istio n'est pas documentée sur AKS et le build d'Envoy (FIPS ou non) n'est pas publié.
- Application Gateway for Containers, Gateway API : Politique prédéfinie 2023-06 par défaut (2023-06-S en option) : TLS 1.2 et 1.3, suites AES-GCM, courbes P-384 et P-256 seulement.
- Application Gateway for Containers, API Ingress : Politique fixe 2023-06 : TLS 1.2 et 1.3, suites AES-GCM, courbes P-384 et P-256 seulement.
- Add-on de maillage de services Istio d'AKS, entrée Gateway API : Défauts d'Envoy : TLS 1.2 à 1.3, pas de DHE, X25519 et P-256 ; meshConfig.tlsDefaults est autorisé ; option de suites par listener à partir d'Istio 1.29.
- Impact : Les clients limités à DHE échouent sur Envoy et AGC, ceux limités à ChaCha20 échouent sur AGC, et X25519 n'est pas dans la liste de courbes d'AGC.
- Test : Lancer testssl.sh (ou nmap --script ssl-enum-ciphers) avec le SNI $H contre $OLD et $NEW ; comparer protocoles, suites et courbes.

</details>

<details>
<summary>B5. HTTP/2 côté clients</summary>

- Défaut ingress-nginx : HTTP/2 négocié par ALPN en TLS (use-http2 true), 128 flux simultanés au plus par connexion.
- Dans ce cluster : inchangé (le défaut s'applique)
- Routage d'applications AKS, implémentation Gateway API : ALPN h2 et http/1.1 sur les listeners HTTPS ; 1024 flux simultanés par défaut dans Envoy.
- Application Gateway for Containers, Gateway API : HTTP/2 toujours actif et non configurable ; HTTP/1.1 reste négociable.
- Application Gateway for Containers, API Ingress : HTTP/2 toujours actif et non configurable ; HTTP/1.1 reste négociable.
- Add-on de maillage de services Istio d'AKS, entrée Gateway API : ALPN h2 et http/1.1 sur les listeners HTTPS ; 1024 flux simultanés par défaut dans Envoy.
- Impact : Peu d'effet pour les navigateurs ; les clients qui ouvrent plus de 128 flux par connexion ne sont plus limités à 128 sur Envoy.
- Test : curl -s -o /dev/null -w '%{http_version}\\n' --http2 --resolve $H:443:&lt;ip&gt; https://$H/ sur les deux IP ; ajouter --http2-prior-knowledge http://$H/ si des clients utilisent h2c.

</details>

<details>
<summary>B6. Clients HTTP/1.0</summary>

- Défaut ingress-nginx : Acceptés ; aucune clé de ConfigMap ni annotation ne restreint la version HTTP.
- Dans ce cluster : inchangé (le défaut s'applique)
- Routage d'applications AKS, implémentation Gateway API : Rejetés avec 426 Upgrade Required (défaut d'Envoy) ; aucun levier documenté sur AKS.
- Application Gateway for Containers, Gateway API : Non documenté.
- Application Gateway for Containers, API Ingress : Non documenté.
- Add-on de maillage de services Istio d'AKS, entrée Gateway API : Rejetés avec 426 ; proxyMetadata HTTP10 est autorisé, mais son effet sur les passerelles n'est pas vérifié.
- Impact : Les vieux clients et sondes HTTP/1.0 ne fonctionnent plus.
- Test : curl -0 -si --resolve $H:80:$NEW http://$H/ puis la même chose contre $OLD.

</details>

<details>
<summary>B7. Taille maximale du corps de requête (modifié dans ce cluster)</summary>

- Défaut ingress-nginx : 1 Mio (proxy-body-size 1m), puis 413 avec une page HTML.
- Dans ce cluster : ConfigMap `ingress-nginx/ingress-nginx-controller` : `proxy-body-size` = `10m` ; annotation `proxy-body-size` sur 1 Ingress
- Routage d'applications AKS, implémentation Gateway API : Aucune limite, et non configurable : le routage d'applications ne propose aucune limite de taille d'en-tête ni de corps.
- Application Gateway for Containers, Gateway API : Non documenté.
- Application Gateway for Containers, API Ingress : Non documenté.
- Add-on de maillage de services Istio d'AKS, entrée Gateway API : Aucune limite par défaut ; seulement un filtre buffer par EnvoyFilter (max_request_bytes, 413), autorisé mais non pris en charge par Azure, qui garde le corps en mémoire.
- Impact : Les envois de plus de 1 Mio que l'entrée rejetait atteignent désormais les backends, qui doivent appliquer leur propre limite.
- Test : head -c 2097152 /dev/urandom &gt; /tmp/2m ; curl -s -o /dev/null -w '%{http_code}\\n' --resolve $H:443:&lt;ip&gt; --data-binary @/tmp/2m https://$H/&lt;chemin&gt; (NGINX : 413).

</details>

<details>
<summary>B8. Taille et nombre des en-têtes de requête</summary>

- Défaut ingress-nginx : Tampons 1k plus 4 x 8k : un en-tête de plus de 8 Kio donne 400, une ligne de requête de plus de 8 Kio donne 414 ; pas de limite de nombre.
- Dans ce cluster : inchangé (le défaut s'applique)
- Routage d'applications AKS, implémentation Gateway API : Défauts d'Envoy : 60 Kio d'en-têtes et 100 champs, puis 431 en HTTP/1 (flux réinitialisé en HTTP/2) ; non configurable.
- Application Gateway for Containers, Gateway API : Non documenté.
- Application Gateway for Containers, API Ingress : Non documenté.
- Add-on de maillage de services Istio d'AKS, entrée Gateway API : Mêmes défauts d'Envoy (60 Kio, 100 champs, 431) ; modifiables seulement par EnvoyFilter (autorisé, non pris en charge par Azure).
- Impact : Les en-têtes de 8 à 60 Kio (gros cookies, JWT) passent désormais ; les requêtes de plus de 100 champs d'en-tête échouent.
- Test : Avec curl --resolve contre les deux IP, envoyer un en-tête Cookie de 12 Ko (NGINX 400, Envoy 200), puis une requête avec 101 en-têtes X-Tn (Envoy 431).

</details>

<details>
<summary>B9. En-têtes contenant des underscores</summary>

- Défaut ingress-nginx : Supprimés sans avertissement (enable-underscores-in-headers false, ignore-invalid-headers true).
- Dans ce cluster : inchangé (le défaut s'applique)
- Routage d'applications AKS, implémentation Gateway API : Transmis : headers_with_underscores_action vaut ALLOW par défaut dans Envoy.
- Application Gateway for Containers, Gateway API : Non documenté.
- Application Gateway for Containers, API Ingress : Non documenté.
- Add-on de maillage de services Istio d'AKS, entrée Gateway API : Transmis : headers_with_underscores_action vaut ALLOW par défaut dans Envoy.
- Impact : Les backends reçoivent des champs comme X_Api_Key que NGINX ne transmettait jamais.
- Test : curl -s -H 'X_Probe_Underscore : 1' --resolve $H:443:&lt;ip&gt; https://$H/echo : absent derrière NGINX, présent derrière Envoy.

</details>

<details>
<summary>B10. Casse des noms d'en-tête</summary>

- Défaut ingress-nginx : Conservée à l'octet près.
- Dans ce cluster : inchangé (le défaut s'applique)
- Routage d'applications AKS, implémentation Gateway API : Mis en minuscules par le codec HTTP/1 d'Envoy ; aucun levier documenté.
- Application Gateway for Containers, Gateway API : Non documenté ; les réponses HTTP/1.1 d'AGC lui-même utilisent des noms en minuscules.
- Application Gateway for Containers, API Ingress : Non documenté ; les réponses HTTP/1.1 d'AGC lui-même utilisent des noms en minuscules.
- Add-on de maillage de services Istio d'AKS, entrée Gateway API : Mis en minuscules ; ProxyConfig proxyHeaders.preserveHttp1HeaderCase est autorisé.
- Impact : Seul le code qui compare les noms d'en-tête en respectant la casse casse ; les noms de champs HTTP ne sont pas sensibles à la casse.
- Test : Envoyer X-MiXeD-Case : 1 en HTTP/1.1 à un backend qui journalise les octets bruts ; vérifier l'écriture des réponses avec curl --http1.1 -sv.

</details>

<details>
<summary>B11. Mise en tampon des requêtes et réponses (déduit du code source)</summary>

- Défaut ingress-nginx : Le corps des requêtes est mis en tampon avant l'envoi (proxy-request-buffering on, 8k en mémoire) ; les réponses sont transmises au fil de l'eau (proxy-buffering off).
- Dans ce cluster : inchangé (le défaut s'applique)
- Routage d'applications AKS, implémentation Gateway API : Les deux au fil de l'eau : pas de filtre buffer dans la chaîne de la passerelle (déduit) ; non configurable.
- Application Gateway for Containers, Gateway API : Non documenté.
- Application Gateway for Containers, API Ingress : Non documenté.
- Add-on de maillage de services Istio d'AKS, entrée Gateway API : Les deux au fil de l'eau (déduit) ; la mise en tampon exige un filtre buffer par EnvoyFilter (autorisé, non pris en charge par Azure).
- Impact : Les backends reçoivent les en-têtes tout de suite et lisent eux-mêmes les envois lents : les workers restent occupés plus longtemps et des délais de lecture du corps peuvent expirer.
- Test : head -c 921600 /dev/urandom &gt; /tmp/900k ; curl --limit-rate 20k --data-binary @/tmp/900k https://$H/&lt;upload&gt; ; comparer quand le backend journalise le début de la requête.

</details>

<details>
<summary>B12. Taille des en-têtes de réponse du backend (déduit du code source)</summary>

- Défaut ingress-nginx : Les en-têtes de réponse du backend doivent tenir dans 4 Kio (proxy-buffer-size 4k), sinon 502.
- Dans ce cluster : inchangé (le défaut s'applique)
- Routage d'applications AKS, implémentation Gateway API : Limites d'Envoy : 60 Kio (80 Kio en HTTP/1 dans les versions récentes) et 100 en-têtes, puis 502 (déduit du code).
- Application Gateway for Containers, Gateway API : Non documenté.
- Application Gateway for Containers, API Ingress : Non documenté.
- Add-on de maillage de services Istio d'AKS, entrée Gateway API : Limites d'Envoy : 60 Kio (80 Kio en HTTP/1 dans les versions récentes) et 100 en-têtes, puis 502 (déduit du code).
- Impact : Les réponses aux gros en-têtes (Set-Cookie ou CSP volumineux) qui échouaient en 502 sur NGINX passent désormais, jusqu'aux limites d'Envoy.
- Test : Appeler un point de terminaison qui renvoie environ 6 Kio d'en-têtes de réponse : NGINX 502, Envoy 200.

</details>

<details>
<summary>B13. Adresse IP source du client</summary>

- Défaut ingress-nginx : Dépend de l'installation : l'add-on AKS et le manifeste cloud amont utilisent externalTrafficPolicy Local (IP client conservée) ; le chart Helm vaut Cluster par défaut.
- Dans ce cluster : inchangé (le défaut s'applique)
- Routage d'applications AKS, implémentation Gateway API : Service de la Gateway généré avec externalTrafficPolicy Cluster : les pods voient les IP des nœuds ; Local est permis une fois les annotations de sonde du port 80 retirées.
- Application Gateway for Containers, Gateway API : IP client seulement dans X-Forwarded-For et le journal d'accès ; les pods voient AGC comme pair TCP.
- Application Gateway for Containers, API Ingress : IP client seulement dans X-Forwarded-For et le journal d'accès ; les pods voient AGC comme pair TCP.
- Add-on de maillage de services Istio d'AKS, entrée Gateway API : Service de la Gateway généré avec externalTrafficPolicy Cluster : les pods voient les IP des nœuds ; Local est permis une fois les annotations de sonde du port 80 retirées.
- Impact : Passer de Local à Cluster fait apparaître les requêtes comme venant des IP des nœuds : journaux, listes d'autorisation IP, limites par IP et géolocalisation changent.
- Test : kubectl get svc -A -o custom-columns=NS:.metadata.namespace,NAME:.metadata.name,ETP:.spec.externalTrafficPolicy pour les deux Services ; curl https://$H/echo depuis une IP connue et comparer.

</details>

<details>
<summary>B14. X-Forwarded-For, X-Real-IP et proxys de confiance (modifié dans ce cluster)</summary>

- Défaut ingress-nginx : X-Forwarded-For remplacé par l'adresse du client et X-Real-IP posé ; les en-têtes X-Forwarded-\* entrants sont ignorés (use-forwarded-headers false).
- Dans ce cluster : ConfigMap `ingress-nginx/ingress-nginx-controller` : `use-forwarded-headers` = `true`
- Routage d'applications AKS, implémentation Gateway API : Envoy ajoute le pair à X-Forwarded-For (0 saut de confiance) et ne pose pas X-Real-IP ; aucun levier documenté.
- Application Gateway for Containers, Gateway API : Ajout à X-Forwarded-For ; X-Real-IP non documenté ; pas de réglage de proxys de confiance.
- Application Gateway for Containers, API Ingress : Ajout à X-Forwarded-For ; X-Real-IP non documenté ; pas de réglage de proxys de confiance.
- Add-on de maillage de services Istio d'AKS, entrée Gateway API : Ajout en fin de liste, pas de X-Real-IP ; meshConfig numTrustedProxies est autorisé.
- Impact : Les applications qui lisent X-Real-IP le perdent ou lisent une valeur falsifiée ; celles qui prennent la première entrée de X-Forwarded-For deviennent usurpables.
- Test : curl -s -H 'X-Forwarded-For : 203.0.113.7' -H 'X-Real-IP : 203.0.113.8' https://$H/echo sur les deux IP ; comparer ce que le backend a reçu.

</details>

<details>
<summary>B15. Autres en-têtes transmis et identifiant de requête (modifié dans ce cluster)</summary>

- Défaut ingress-nginx : Pose X-Forwarded-Host, -Port, -Proto, -Scheme et X-Scheme ; efface Proxy ; garde le X-Request-ID du client ou en génère un.
- Dans ce cluster : ConfigMap `ingress-nginx/ingress-nginx-controller` : `use-forwarded-headers` = `true`
- Routage d'applications AKS, implémentation Gateway API : Pose seulement x-forwarded-proto, ni X-Forwarded-Host ni -Port ; remplace x-request-id sur les requêtes externes ; ajoute x-envoy-attempt-count.
- Application Gateway for Containers, Gateway API : Insère x-forwarded-for, x-forwarded-proto et un nouveau x-request-id par requête ; le traitement d'un identifiant fourni par le client n'est pas documenté.
- Application Gateway for Containers, API Ingress : Insère x-forwarded-for, x-forwarded-proto et un nouveau x-request-id par requête ; le traitement d'un identifiant fourni par le client n'est pas documenté.
- Add-on de maillage de services Istio d'AKS, entrée Gateway API : Comme le routage d'applications ; les options ProxyConfig proxyHeaders (xForwardedHost, xForwardedPort) sont autorisées.
- Impact : Les applications qui construisent URL absolues ou redirections à partir de X-Forwarded-Host ou -Port produisent de mauvais liens ; les identifiants de requête posés en amont sont remplacés.
- Test : curl -s -H 'X-Request-ID : probe-123' https://$H/echo sur les deux IP ; comparer X-Forwarded-Host, -Port, -Proto et X-Request-ID.

</details>

<details>
<summary>B16. Délais d'expiration (modifié dans ce cluster)</summary>

- Défaut ingress-nginx : Connexion 5 s ; lecture et envoi 60 s, mesurés entre deux opérations successives ; pas de délai total par requête ; 504 à l'expiration.
- Dans ce cluster : annotation `proxy-read-timeout` sur 1 Ingress
- Routage d'applications AKS, implémentation Gateway API : Ni délai de route ni délai d'inactivité de flux sans timeouts dans l'HTTPRoute (backendRequest remplace alors request) ; connexion amont 10 s.
- Application Gateway for Containers, Gateway API : Délai total de 60 s par requête, même pendant un transfert ; inactivité 5 min ; connexion 5 s ; régler les timeouts de l'HTTPRoute ou routeTimeout de RoutePolicy.
- Application Gateway for Containers, API Ingress : Délai total de 60 s par requête ; inactivité 5 min ; délais par Service dans l'IngressExtension.
- Add-on de maillage de services Istio d'AKS, entrée Gateway API : Ni délai de route ni délai d'inactivité de flux sans timeouts dans l'HTTPRoute (backendRequest remplace alors request) ; connexion amont 10 s.
- Impact : Backend muet : NGINX répond 504 après 60 s, Istio attend que le client ou le LB Azure abandonne, AGC coupe à 60 s ; longs téléchargements et SSE coupés à 60 s sur AGC.
- Test : Avec deux points de test, /sleep?s=75 et /drip?every=10&for=150, relever le statut et la durée sur les deux IP.

</details>

<details>
<summary>B17. Nouvelles tentatives</summary>

- Défaut ingress-nginx : Sur erreur ou expiration, jusqu'à 3 essais, méthodes idempotentes seulement, jamais après l'envoi d'octets au client ; pas de nouvel essai sur code de statut.
- Dans ce cluster : inchangé (le défaut s'applique)
- Routage d'applications AKS, implémentation Gateway API : Défaut d'Istio amont sur chaque route : 2 nouvelles tentatives sur échec de connexion, flux refusé, indisponible ou annulé, toute méthode ; surcharges AKS non documentées.
- Application Gateway for Containers, Gateway API : Nouvelles tentatives automatiques ; conditions et nombre non documentés et non configurables.
- Application Gateway for Containers, API Ingress : Nouvelles tentatives automatiques ; conditions et nombre non documentés et non configurables.
- Add-on de maillage de services Istio d'AKS, entrée Gateway API : Même défaut d'Istio amont ; meshConfig defaultHttpRetryPolicy est autorisé.
- Impact : Istio ne retente ni les expirations ni les réinitialisations : un pod qui meurt en cours de requête se voit en 503 ; un GET bloqué ne prend plus jusqu'à 3 x 60 s comme sur NGINX.
- Test : Compter les appels backend par requête client : un GET vers un point qui ne répond jamais, un POST vers un pod qui réinitialise, une requête quand un pod sur deux refuse les connexions.

</details>

<details>
<summary>B18. Keep-alive et connexions inactives</summary>

- Défaut ingress-nginx : Keep-alive amont : 320 connexions inactives par worker, 60 s d'inactivité, 10000 requêtes ; keep-alive client 75 s et 1000 requêtes.
- Dans ce cluster : inchangé (le défaut s'applique)
- Routage d'applications AKS, implémentation Gateway API : Envoy garde les connexions amont avec 1 h d'inactivité ; connexions client 1 h, mais le LB Azure réinitialise le TCP inactif après 4 min.
- Application Gateway for Containers, Gateway API : Inactivité HTTP client 5 min ; réutilisation des connexions amont non documentée.
- Application Gateway for Containers, API Ingress : Inactivité HTTP client 5 min ; réutilisation des connexions amont non documentée.
- Add-on de maillage de services Istio d'AKS, entrée Gateway API : Mêmes défauts d'Envoy ; un idleTimeout dans connectionPool d'une DestinationRule change l'inactivité amont.
- Impact : Les connexions client inactives se ferment après 4 min (LB Azure) au lieu de 75 s ; des backends au keep-alive court peuvent provoquer des 503 ponctuels sur Istio.
- Test : Faire tourner un backend au keep-alive de 1 s, environ une requête toutes les 2 s par pod pendant 10 min, et compter les 502 et 503 ; puis réutiliser une connexion client inactive 5 min.

</details>

<details>
<summary>B19. WebSocket et upgrade HTTP (modifié dans ce cluster)</summary>

- Défaut ingress-nginx : Fonctionne sans configuration ; les sockets inactifs se ferment après 60 s (proxy-read-timeout et proxy-send-timeout).
- Dans ce cluster : annotation `proxy-read-timeout` sur 1 Ingress
- Routage d'applications AKS, implémentation Gateway API : Fonctionne ; la passerelle ne coupe jamais un socket inactif, donc la réinitialisation à 4 min du LB Azure devient la limite.
- Application Gateway for Containers, Gateway API : Fonctionne sans configuration ; inactivité 5 min ; ajouter une HealthCheckPolicy pour les backends WebSocket ; l'effet du délai de 60 s après l'upgrade n'est pas vérifié.
- Application Gateway for Containers, API Ingress : Non pris en charge : les WebSockets exigent Gateway API sur AGC.
- Add-on de maillage de services Istio d'AKS, entrée Gateway API : Fonctionne ; la passerelle ne coupe jamais un socket inactif, donc la réinitialisation à 4 min du LB Azure devient la limite.
- Impact : Les sockets que NGINX fermait après 60 s d'inactivité durent environ 4 min sur Istio ou jusqu'à 5 min sur AGC ; les WebSockets cassent avec l'API Ingress d'AGC.
- Test : Se connecter avec un client WebSocket comme websocat, rester inactif 70 s, 250 s et 310 s, puis envoyer ; relever le code de fermeture et la durée sur les deux IP.

</details>

<details>
<summary>B20. Protocole vers les backends</summary>

- Défaut ingress-nginx : HTTP/1.1 vers tous les backends sauf si backend-protocol vaut GRPC ou GRPCS ; noms de port et appProtocol des Services ignorés.
- Dans ce cluster : inchangé (le défaut s'applique)
- Routage d'applications AKS, implémentation Gateway API : Protocole tiré de l'appProtocol ou du nom du port du Service : kubernetes.io/h2c, http2\*, grpc\* et grpc-web\* donnent HTTP/2 ; le reste HTTP/1.1.
- Application Gateway for Containers, Gateway API : HTTP/1.1, sauf gRPC en HTTP/2.
- Application Gateway for Containers, API Ingress : HTTP/1.1, sauf gRPC en HTTP/2.
- Add-on de maillage de services Istio d'AKS, entrée Gateway API : Protocole tiré de l'appProtocol ou du nom du port du Service : kubernetes.io/h2c, http2\*, grpc\* et grpc-web\* donnent HTTP/2 ; le reste HTTP/1.1.
- Impact : Sur Istio, les Services dont les ports s'appellent http2-\* ou grpc-\* (ou portent appProtocol kubernetes.io/h2c) mais parlent HTTP/1.1 se mettent à échouer.
- Test : Lister les noms de port et valeurs appProtocol des Services, puis appeler une route par port concerné via $NEW.

</details>

<details>
<summary>B21. Slash final et sémantique des préfixes (déduit du code source)</summary>

- Défaut ingress-nginx : Prefix /foo/ répond aussi à /foo par un 301 vers /foo/ (déduit) ; un ImplementationSpecific /foo est un préfixe de caractères qui couvre aussi /foobar.
- Dans ce cluster : inchangé (le défaut s'applique)
- Routage d'applications AKS, implémentation Gateway API : PathPrefix compare des segments entiers : /foo couvre /foo, /foo/ et /foo/x mais pas /foobar ; aucune redirection.
- Application Gateway for Containers, Gateway API : Sémantique Exact et PathPrefix de Gateway API (conformité Core validée en v1.2.1).
- Application Gateway for Containers, API Ingress : Seul Prefix est documenté ; le comportement d'Exact et d'ImplementationSpecific ne l'est pas.
- Add-on de maillage de services Istio d'AKS, entrée Gateway API : PathPrefix compare des segments entiers : /foo couvre /foo, /foo/ et /foo/x mais pas /foobar ; aucune redirection.
- Impact : /foo n'est plus redirigé vers /foo/, donc les liens relatifs peuvent se résoudre autrement ; /foobar n'est plus servi par un chemin ImplementationSpecific /foo.
- Test : Pour chaque chemin P des Ingress, demander P, P/, P + "x" et P/x sur les deux IP ; comparer statut, location et pod qui a répondu.

</details>

<details>
<summary>B22. Dialecte, ancrage et casse des regex (modifié dans ce cluster)</summary>

- Défaut ingress-nginx : use-regex, ou un rewrite-target différent du chemin, sur un seul Ingress d'un hôte fait de chaque chemin de cet hôte une regex PCRE insensible à la casse, ancrée au début seulement.
- Dans ce cluster : annotation `use-regex` sur 1 Ingress ; annotation `rewrite-target` sur 1 Ingress
- Routage d'applications AKS, implémentation Gateway API : RegularExpression est en RE2, sensible à la casse, et doit couvrir tout le chemin ; Exact et PathPrefix sont littéraux et sensibles à la casse.
- Application Gateway for Containers, Gateway API : RE2 pour chemin, en-têtes et paramètres ; ancrage et casse non documentés.
- Application Gateway for Containers, API Ingress : Aucun mécanisme de regex documenté.
- Add-on de maillage de services Istio d'AKS, entrée Gateway API : RegularExpression est en RE2, sensible à la casse, et doit couvrir tout le chemin ; Exact et PathPrefix sont littéraux et sensibles à la casse.
- Impact : /API/v1 ne correspond plus à /api ; /api/v[0-9]+ couvrait /api/v1/users sur NGINX mais seulement /api/v1 sur Envoy, sauf à ajouter .\*.
- Test : Pour chaque hôte à regex, envoyer des variantes en majuscules, des chemins plus longs et des segments en plus aux deux IP ; comparer statut et pod qui a répondu.

</details>

<details>
<summary>B23. Priorité entre règles qui se chevauchent (modifié dans ce cluster ; déduit du code source)</summary>

- Défaut ingress-nginx : Chemin le plus long d'abord ; sur un hôte à regex, la première regex qui correspond par ordre de longueur ; pour un hôte et chemin en double, l'Ingress le plus ancien gagne, trace seulement en --v=3.
- Dans ce cluster : annotation `use-regex` sur 1 Ingress ; annotation `rewrite-target` sur 1 Ingress
- Routage d'applications AKS, implémentation Gateway API : Exact avant PathPrefix avant RegularExpression, puis valeurs plus longues ; une règle PathPrefix / masque toutes les regex de l'hôte (déduit).
- Application Gateway for Containers, Gateway API : Exact et PathPrefix suivent l'ordre de Gateway API ; priorité des regex non documentée.
- Application Gateway for Containers, API Ingress : Non documenté.
- Add-on de maillage de services Istio d'AKS, entrée Gateway API : Exact avant PathPrefix avant RegularExpression, puis valeurs plus longues ; une règle PathPrefix / masque toutes les regex de l'hôte (déduit).
- Impact : Des chemins qui se chevauchent peuvent arriver sur un autre backend ; sur Istio, les regex d'un hôte qui a aussi une règle / ne correspondent jamais.
- Test : Générer une sonde par couple (hôte, chemin) de l'inventaire, l'envoyer aux deux IP et comparer le nom du pod renvoyé par le backend echo.

</details>

<details>
<summary>B24. Hôtes génériques</summary>

- Défaut ingress-nginx : \*.example.com couvre exactement un label.
- Dans ce cluster : inchangé (le défaut s'applique)
- Routage d'applications AKS, implémentation Gateway API : \*.example.com couvre toute profondeur (a.b.example.com) mais pas example.com.
- Application Gateway for Containers, Gateway API : Non documenté.
- Application Gateway for Containers, API Ingress : Non documenté.
- Add-on de maillage de services Istio d'AKS, entrée Gateway API : \*.example.com couvre toute profondeur (a.b.example.com) mais pas example.com.
- Impact : Les noms plus profonds qui tombaient sur le backend par défaut de NGINX (404) atteignent la route générique ; le certificat générique échoue en général pour eux.
- Test : curl -sk --resolve a.b.example.com:443:&lt;ip&gt; https://a.b.example.com/ sur les deux IP.

</details>

<details>
<summary>B25. Normalisation des chemins (modifié dans ce cluster)</summary>

- Défaut ingress-nginx : Compare l'URI décodée, segments . et .. résolus et slashs fusionnés, mais transmet l'URI d'origine (rewrite-target envoie la version normalisée).
- Dans ce cluster : annotation `rewrite-target` sur 1 Ingress
- Routage d'applications AKS, implémentation Gateway API : Normalisation BASE d'Istio : segments . et .. résolus, // et %2F conservés ; le chemin normalisé est aussi envoyé au backend.
- Application Gateway for Containers, Gateway API : Non documenté.
- Application Gateway for Containers, API Ingress : Non documenté.
- Add-on de maillage de services Istio d'AKS, entrée Gateway API : Normalisation BASE d'Istio (segments . et .. résolus, // et %2F conservés) ; meshConfig pathNormalization est autorisé.
- Impact : //api/x et /api%2Fx correspondaient à /api sur NGINX mais pas sur Istio ; les backends reçoivent désormais des chemins aux segments . et .. résolus.
- Test : curl --path-as-is -s https://$H//api/x, puis /api%2Fx et /x/../api/x, sur les deux IP ; comparer le statut et le chemin vu par le backend.

</details>

<details>
<summary>B26. Hôtes inconnus et backend par défaut</summary>

- Défaut ingress-nginx : Hôtes inconnus et chemins sans règle vont au backend par défaut : un 404 HTML, ou le Service désigné par --default-backend-service.
- Dans ce cluster : inchangé (le défaut s'applique)
- Routage d'applications AKS, implémentation Gateway API : 404 au corps vide ; un backend par défaut doit être une route PathPrefix / explicite sur un listener sans hostname.
- Application Gateway for Containers, Gateway API : Non documenté (Gateway API impose un 404) ; ajouter une route attrape-tout pour un backend par défaut.
- Application Gateway for Containers, API Ingress : Non documenté ; l'utilitaire de migration de Microsoft marque default-backend comme non pris en charge.
- Add-on de maillage de services Istio d'AKS, entrée Gateway API : 404 au corps vide ; un backend par défaut doit être une route PathPrefix / explicite sur un listener sans hostname.
- Impact : Un 404 HTML ou personnalisé devient un 404 vide, et les sondes synthétiques qui vérifient le texte du corps changent.
- Test : curl -sk --resolve nohost.invalid:443:&lt;ip&gt; https://nohost.invalid/, puis curl -s http://&lt;ip&gt;/, sur les deux IP ; comparer statut, Content-Type et corps.

</details>

<details>
<summary>B27. Compression</summary>

- Défaut ingress-nginx : Désactivée (use-gzip false, enable-brotli false).
- Dans ce cluster : inchangé (le défaut s'applique)
- Routage d'applications AKS, implémentation Gateway API : Désactivée ; pas de filtre de compression ni de levier sur le routage d'applications.
- Application Gateway for Containers, Gateway API : Aucune fonction de compression documentée.
- Application Gateway for Containers, API Ingress : Aucune fonction de compression documentée.
- Add-on de maillage de services Istio d'AKS, entrée Gateway API : Désactivée ; compression seulement par EnvoyFilter (autorisé, non pris en charge par Azure).
- Impact : Aucun sauf si use-gzip ou enable-brotli était activé ; les réponses grossissent alors, ce qui coûte bande passante, latence et trafic sortant.
- Test : curl -s -o /dev/null -D - -H 'Accept-Encoding : gzip, br' https://$H/&lt;gros fichier texte&gt; sur les deux IP ; comparer Content-Encoding et taille.

</details>

<details>
<summary>B28. En-tête Server et divulgation de version</summary>

- Défaut ingress-nginx : Pas d'en-tête Server (server-tokens false) ; l'en-tête Server du backend est masqué ; les pages d'erreur NGINX finissent par « nginx », sans version.
- Dans ce cluster : inchangé (le défaut s'applique)
- Routage d'applications AKS, implémentation Gateway API : server : istio-envoy sur chaque réponse, en écrasant celui du backend, plus x-envoy-upstream-service-time ; aucun levier documenté.
- Application Gateway for Containers, Gateway API : Les redirections d'AGC portent server : Microsoft-Azure-Application-LB/AGC ; le traitement de l'en-tête Server du backend n'est pas documenté.
- Application Gateway for Containers, API Ingress : Les redirections d'AGC portent server : Microsoft-Azure-Application-LB/AGC ; le traitement de l'en-tête Server du backend n'est pas documenté.
- Add-on de maillage de services Istio d'AKS, entrée Gateway API : Idem ; ProxyConfig proxyHeaders.server et envoyDebugHeaders sont autorisés.
- Impact : Une mention de produit apparaît là où il n'y en avait pas et les scanners la signalent ; les applications qui posent leur propre en-tête Server le perdent sur Istio.
- Test : curl -sI https://$H/ | grep -iE '^(server|x-envoy)' sur les deux IP, en HTTP/1.1 et HTTP/2, pour un 200, un 404 et un 502.

</details>

<details>
<summary>B29. 502, 503 et 504 sur panne amont</summary>

- Défaut ingress-nginx : Connexion refusée ou réinitialisée : 502 ; expiration : 504 ; aucun endpoint : 503, sauf si une annotation default-backend vise un Service qui en a.
- Dans ce cluster : inchangé (le défaut s'applique)
- Routage d'applications AKS, implémentation Gateway API : Réinitialisation ou échec de connexion avant les en-têtes : 503 ; erreur de protocole : 502 ; aucun endpoint sain : 503 ; expiration : 504 (seulement avec timeouts) ; backend invalide : 500.
- Application Gateway for Containers, Gateway API : Aucun endpoint ou backend invalide : 500 ; autres cas non documentés.
- Application Gateway for Containers, API Ingress : Aucun endpoint ou backend invalide : 500 ; autres cas non documentés.
- Add-on de maillage de services Istio d'AKS, entrée Gateway API : Réinitialisation ou échec de connexion avant les en-têtes : 503 ; erreur de protocole : 502 ; aucun endpoint sain : 503 ; expiration : 504 (seulement avec timeouts) ; backend invalide : 500.
- Impact : Les pods en panne ou qui refusent passent de 502 à 503 sur Istio, les Services vides deviennent 500 sur AGC, et les alertes ou règles de retry fondées sur les codes 5xx changent.
- Test : Réduire un backend à 0, faire refuser les connexions à un pod Ready, faire dormir un pod au-delà du délai ; comparer statut et corps sur les deux IP.

</details>

<details>
<summary>B30. Pages d'erreur personnalisées et corps d'erreur</summary>

- Défaut ingress-nginx : Rien n'est intercepté sauf si custom-http-errors est défini ; les erreurs produites par NGINX lui-même sont des pages text/html.
- Dans ce cluster : inchangé (le défaut s'applique)
- Routage d'applications AKS, implémentation Gateway API : Rien n'est intercepté ; les erreurs d'Envoy sont en texte brut court ou vides ; pas de pages d'erreur.
- Application Gateway for Containers, Gateway API : Aucun réglage de page d'erreur ni d'interception dans l'API ; les corps d'erreur d'AGC ne sont pas documentés.
- Application Gateway for Containers, API Ingress : Aucun réglage de page d'erreur ni d'interception dans l'API ; les corps d'erreur d'AGC ne sont pas documentés.
- Add-on de maillage de services Istio d'AKS, entrée Gateway API : Rien n'est intercepté ; pages d'erreur seulement par EnvoyFilter (autorisé, non pris en charge par Azure).
- Impact : Les pages d'erreur personnalisées et de maintenance disparaissent ; les clients qui analysent le corps ou le Content-Type des erreurs voient un autre format.
- Test : Provoquer un 404 (chemin inconnu), un 413 et un 502, 503 ou 504 sur les deux IP ; comparer Content-Type et corps.

</details>

## 5. TCP et UDP, SSL passthrough, certificat par défaut, backend par défaut

- ConfigMap des services TCP `ingress-nginx/ingress-nginx-tcp` : 1 entrée(s) : `5432 → data/postgres:5432`. Lisez le ConfigMap : pour chaque port, un listener TCP de Gateway + TCPRoute (cibles Istio, AKS 1.37+) ou un Service de type LoadBalancer pour le backend ; agc et agcIngress n'ont pas de TCP. (App routing GW ~, AGC ✗, AGC Ingress ✗, Istio add-on ~)
- SSL passthrough : non
- `ingress-nginx/ingress-nginx-controller` : Certificat par défaut : non défini : les noms inconnus reçoivent un faux certificat autosigné ; Backend par défaut : non défini : la page 404 intégrée ; 0 Ingress définissent spec.defaultBackend

## 6. Réseau et load balancers

| Service | Type | Adresses | Interne | IP fixée | externalTrafficPolicy | Ports |
|---|---|---|---|---|---|---|
| `ingress-nginx/ingress-nginx-controller` | LoadBalancer | 20.0.113.10 | non | azure-pip-name `pip-shop-prod` | Local | 80/TCP:30080, 443/TCP:30443, 5432/TCP:30432 |

### Réglages de ces Services

- `ingress-nginx/ingress-nginx-controller` : `Service.spec.externalTrafficPolicy=Local=Local` (policy) : Réglez Local dans la ConfigMap du Gateway en retirant les annotations de sonde (cibles Istio), ou lisez X-Forwarded-For sur AGC ; revérifiez chaque liste d'autorisation d'IP.
- `ingress-nginx/ingress-nginx-controller` : `service.beta.kubernetes.io/azure-load-balancer-resource-group=rg-network-prod` (policy) : Copiez-la avec azure-pip-name : sans elle, l'IP est cherchée dans le groupe de ressources des nœuds et le Service échoue ("user supplied IP address was not found").
- `ingress-nginx/ingress-nginx-controller` : `service.beta.kubernetes.io/azure-pip-name=pip-shop-prod` (policy) : Créez une nouvelle IP statique pour le Gateway, mettez-y à jour Front Door, Traffic Manager et listes d'autorisation, et gardez l'IP NGINX jusqu'à l'expiration des caches DNS.

> Chaque Gateway reçoit sa propre adresse de load balancer : les enregistrements DNS, les origines Azure Front Door, les backends Application Gateway, les listes d'autorisation des pare-feu, des NSG et des partenaires qui visent ces adresses changent à la bascule.

## 7. Inventaire par espace de noms

<details>
<summary>blog : 1 Ingress, 1 route(s)</summary>

| Ingress | Classe | Hôtes | Routes | TLS | Clés par groupe |
|---|---|---|---:|---|---|
| `legacy` | nginx (annotation) | blog.example.com | 1 | non | policy 1, direct 2, none 1 |

</details>

<details>
<summary>shop : 3 Ingress, 3 route(s)</summary>

| Ingress | Classe | Hôtes | Routes | TLS | Clés par groupe |
|---|---|---|---:|---|---|
| `shop-api` | nginx | shop.example.com | 1 | non | policy 1, direct 2 |
| `shop-api-canary` | nginx | shop.example.com | 1 | non | direct 2 |
| `shop-web` | nginx | shop.example.com | 1 | oui | policy 2, direct 1 |

</details>

## 8. Autres contrôleurs et Ingress non attribués

### Servis par d'autres contrôleurs (non concernés par la fin d'ingress-nginx)

Aucun.

### Servis par aucun contrôleur détecté

- `blog/no-class` : sans classe : ingress-nginx ne le sert qu'avec --watch-ingress-without-class=true

### Ambiguïtés

Aucun.

## 9. Prochaines étapes

1. Choisir une cible. Aucune n'est encore activée dans ce cluster.
   - Routage d'applications AKS, implémentation Gateway API : https://learn.microsoft.com/en-us/azure/aks/app-routing-gateway-api
   - Application Gateway for Containers, Gateway API : https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/overview
   - Application Gateway for Containers, API Ingress : https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-multiple-site-hosting-ingress-api
   - Add-on de maillage de services Istio d'AKS, entrée Gateway API : https://learn.microsoft.com/en-us/azure/aks/istio-gateway-api
2. Préparer les manifestes avec ingress2gateway v1.2.0, une exécution par classe :

   ```bash
   ingress2gateway print --providers=ingress-nginx --ingress-nginx-ingress-class=nginx --all-namespaces --no-color > i2gw.yaml 2> i2gw.notes.txt
   ```

   ingress2gateway ne lit que les Ingress et les Services (pas la ConfigMap), ignore les Ingress sans classe (0 servis ici), produit une Gateway par espace de noms et par classe, et nomme la GatewayClass d'après la classe d'Ingress : la renommer en approuting-istio, istio ou azure-alb-external. Ses redirections 308, et les codes 303 et 307, sont refusés par les CRD Gateway API managées d'AKS 1.35 et antérieures. Il ne produit rien pour l'API Ingress d'AGC.
3. Traiter les éléments redesign et policy de la section 2, ainsi que les clés inconnues.
4. Préparer les changements d'adresse, de DNS et de certificats de la section 6.
5. Dérouler les tests de la section 4 sur les deux points d'entrée.
6. Faire tourner les deux en parallèle, basculer le DNS, observer, puis retirer ingress-nginx ; garder l'ancien point d'entrée tant qu'un retour arrière est possible.

CLAZA IT, qui maintient cet outil, réalise un plan de migration au forfait à partir de ce rapport : https://claza.cloud/sortie-ingress-nginx-aks/

## 10. À propos

Catalogue du 2026-11-09 : ingress-nginx controller-v1.15.1 (final upstream releases : v1.15.1, v1.14.5, v1.13.9), Gateway API v1.7.0, ingress2gateway v1.2.0. Documentation des cibles : [App routing GW](https://learn.microsoft.com/en-us/azure/aks/app-routing-gateway-api), [AGC](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/overview), [AGC Ingress](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-multiple-site-hosting-ingress-api), [Istio add-on](https://learn.microsoft.com/en-us/azure/aks/istio-gateway-api).

Chaque entrée du catalogue cite ses sources : https://github.com/CLAZA-ORG/ingress-nginx-inventory

À titre informatif : vérifier chaque constat dans votre environnement avant d'agir. Sans lien avec Microsoft, le projet Kubernetes ou F5.

### Réserves du catalogue

- Les builds Microsoft d'ingress-nginx et les forks (comme celui de Chainguard, dont le dépôt d'images n'est pas public) n'ont pas de verdict CVE : la version ne dit pas s'ils intègrent les correctifs amont.
- Les noms de contrôleur des GatewayClass approuting-istio et istio ne sont pas documentés par Microsoft ; le rapport affiche la valeur lue dans le cluster.
- Les sévérités de CVE-2025-15566 et des CVE de février 2026 sont calculées à partir de leurs vecteurs CVSS 3.1 publiés ; les avis ne donnent pas de score.
- Le fournisseur ingress-nginx de Traefik peut servir des IngressClass dont spec.controller vaut k8s.io/ingress-nginx ; vérifier l'argument --providers.kubernetesingressnginx des workloads Traefik.

### Notes de collecte

- daemonsets.json absent : ignoré
- nginxingresscontrollers.json absent : ignoré
- gatewayclasses.json absent : ignoré
- gateways.json absent : ignoré
- httproutes.json absent : ignoré
