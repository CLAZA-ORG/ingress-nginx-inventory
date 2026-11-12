# ingress-nginx inventory: unknown-context

- Context: `unknown-context`
- Generated: 2026-11-09T12:00:00.000Z
- Tool: ingress-nginx-inventory 0.1.0; Catalog: 2026-11-09
- Mode: offline (--from-dir); Anonymized: no
- Kubernetes server: v1.34.4

> Offline: this report was built from exported files; the tool contacted no cluster and nothing left this machine.

## 1. Summary

### Controllers

- `ingress-nginx/ingress-nginx-controller` (Deployment, 2×): Community ingress-nginx `1.11.3`: vulnerable: 12 unfixed CVE(s); 4 Ingress; IngressClass: `nginx`

### Support status

- 2025-11-11: Kubernetes announced the retirement of ingress-nginx: best-effort maintenance until March 2026, then no further releases or security fixes. [source](https://kubernetes.io/blog/2025/11/11/ingress-nginx-retirement/)
- 2026-03-19: Final upstream releases v1.15.1, v1.14.5 and v1.13.9; repositories archived on 2026-03-24. No ingress-nginx CVE has been published since CVE-2026-4342. [source](https://github.com/kubernetes/ingress-nginx/releases)
- 2026-11: Microsoft provides critical security patches for the AKS application routing managed NGINX through November 2026; no exact end day and no extension were published (checked 2026-11-04). [source](https://learn.microsoft.com/en-us/azure/aks/app-routing)
- 2026-04-28: The AKS application routing Gateway API implementation (GatewayClass approuting-istio) is generally available since AKS release 2026-04-28. [source](https://github.com/Azure/AKS/releases/tag/2026-04-28)
- 2026-05-27: Gateway API ingress for the AKS Istio add-on: preview labels were removed from the docs on 2026-05-27; no formal GA announcement was found. [source](https://github.com/MicrosoftDocs/azure-aks-docs/commit/3f2f22fbea677d6dc7e40ac498400373d85e70cc)
- 2026-10-25: AKS managed Gateway API CRDs are standard channel only, one bundle per Kubernetes minor: &lt;=1.33 v1.2.1, 1.34 v1.3.0, 1.35 v1.4.1, 1.36 v1.5.1, 1.37+ v1.6.1. [source](https://learn.microsoft.com/en-us/azure/aks/managed-gateway-api)
- 2024-02-27: Application Gateway for Containers is generally available; ALB Controller 1.13.0 supports Gateway API v1.6.2; the AGC add-on for AKS is in preview. [source](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/alb-controller-release-notes)
- 2026-10-29: Gateway API v1.7.0 was released on 2026-10-29 (HTTPRoute retries reach the standard channel); no AKS managed bundle includes it yet. [source](https://github.com/kubernetes-sigs/gateway-api/releases)

### Security

- `ingress-nginx/ingress-nginx-controller`: 12 unfixed CVE(s): CVE-2025-1974, CVE-2025-1097, CVE-2025-1098, CVE-2025-24514, CVE-2025-24513, CVE-2025-15566, CVE-2026-1580, CVE-2026-24512, CVE-2026-24513, CVE-2026-24514, CVE-2026-3288, CVE-2026-4342
- `ingress-nginx/ingress-nginx-controller`: admission webhook enabled (--validating-webhook), the attack surface of CVE-2025-1974, CVE-2025-24513, CVE-2026-24514
- ConfigMap `ingress-nginx/ingress-nginx-controller`: allow-snippet-annotations is "true": anyone who can edit an Ingress can inject NGINX configuration
- ConfigMap `ingress-nginx/ingress-nginx-controller`: global snippets set (server-snippet)
- 1 Ingress(es) use snippet annotations (configuration-snippet)

### Scope

4 of 5 Ingresses served by ingress-nginx, in 2 namespace(s): **3 routes** (distinct host and path pairs, plus 0 default backend(s)), 2 hosts, 1 TLS hosts, 1 TLS Secret names, 4 backend Services.

Path matching: 2 route(s) on regex hosts, 2 ImplementationSpecific path(s), 0 classless Ingress(es) served.

### Translation profile

| Bucket | Keys | Ingresses | Meaning |
|---|---:|---:|---|
| redesign | 0 | 0 | no equivalent on the targets: move the behaviour elsewhere or drop it |
| unknown | 0 | 0 | not in the catalog: check the key |
| policy | 4 | 3 | needs a target-specific resource or an experimental feature |
| direct | 7 | 4 | standard Gateway API, mechanical translation |
| none | 1 | 1 | nothing to translate (check behaviour changes) |

### Load balancer addresses that will change

- `ingress-nginx/ingress-nginx-controller`: `20.0.113.10`

### Gateway API already in the cluster

No GatewayClass found.

Next step: section 9.

## 2. Annotations

Keys found on the Ingresses that ingress-nginx serves, sorted by bucket then by use.

| Key | Ingresses | Values | Bucket | Gateway API | App routing GW | AGC | AGC Ingress | Istio add-on | Note |
|---|---:|---|---|---|---|---|---|---|---|
| `nginx.ingress.kubernetes.io/proxy-body-size` | 1 | `50m` | policy | – | ✗ | ? | ? | ~ | Raised limits just work on the Envoy targets (no cap), but the cap disappears: enforce it in the app, or on istio with a gateway EnvoyFilter. On AGC test uploads at your maximum size. |
| `nginx.ingress.kubernetes.io/proxy-read-timeout` (above 60 s (raised for slow, streaming or long-polling backends)) | 1 | `300` | policy | HTTPRoute rules[].timeouts.request / backendRequest (total time, not idle) (standard, extended) | ~ | ~ | ~ | ~ | Raised timeout: AGC cuts every request at 60 s total by default, so set HTTPRoute timeouts.request (ALB 1.11.1+), RoutePolicy or IngressExtension to the value or 0s. Istio targets have no route timeout by default. |
| `nginx.ingress.kubernetes.io/use-regex` | 1 | `true` | policy | HTTPRoute match path type RegularExpression (standard, implementation-specific) | ✓ | ✓ | ? | ✓ | Rewrite each pattern as RE2 over the whole path ((?i)^/api/.\\* style), use PathPrefix where the regex was only a prefix, and check that no PathPrefix / rule shadows it on Istio. |
| `nginx.ingress.kubernetes.io/whitelist-source-range` | 1 | `203.0.113.0/24,198.51.100.7/32` | policy | none (implementation-specific policy) (none, none) | ~ | ~ | ~ | ✓ | Keep it as a security control: AuthorizationPolicy on istio, WAF IPMatch or NSG on agc, LB source ranges on a dedicated Gateway for appRoutingGateway; set externalTrafficPolicy Local first. |
| `kubernetes.io/ingress.class` | 1 | `nginx` | direct | Gateway.spec.gatewayClassName + HTTPRoute.spec.parentRefs (standard, core) | ✓ | ✓ | ✓ | ✓ | Run ingress2gateway once per class with --ingress-nginx-ingress-class=&lt;value&gt;; it names the Gateway and its gatewayClassName after the class: rewrite both to the target class. |
| `nginx.ingress.kubernetes.io/canary` | 1 | `true` | direct | HTTPRoute rule with two backendRefs[].weight (plus header matches for canary-by-header) (standard, core) | ✓ | ✓ | ✗ | ✓ | Put primary and canary Services in one HTTPRoute rule with weights (ingress2gateway does it). agcIngress has no canary: move these hosts to agc. Delete the canary Ingress after cutover. |
| `nginx.ingress.kubernetes.io/canary-weight` | 1 | `10` | direct | HTTPRoute backendRefs[].weight (standard, core) | ✓ | ✓ | ✗ | ✓ | Set canary weight = this value and primary weight = total minus it in one HTTPRoute rule (ingress2gateway does). agcIngress has no weights: move the host to agc. |
| `nginx.ingress.kubernetes.io/configuration-snippet` (only static header directives) | 1 | 2 line(s), not printed | direct | – | ✓ | ~ | ~ | ✓ | Headers only: more_set_headers or add_header become ResponseHeaderModifier, proxy_set_header or more_set_input_headers RequestHeaderModifier, more_clear_headers a remove. Then disable snippets. |
| `nginx.ingress.kubernetes.io/enable-cors` | 1 | `true` | direct | HTTPRoute filter type CORS (Standard since v1.5.0) (standard, extended) | ~ | ~ | ✗ | ~ | Translate to an HTTPRoute CORS filter (AKS 1.36+, ALB 1.11.1+). Review ingress2gateway's output: with origin \\* set allowCredentials false or list the origins, or credentialed CORS opens to every site. |
| `nginx.ingress.kubernetes.io/rewrite-target` (a single capture reference at the end, e.g. /$2 or /api/$1 (prefix-strip pattern)) | 1 | `/$2` | direct | HTTPRoute filter URLRewrite path (ReplaceFullPath or ReplacePrefixMatch) (standard, extended) | ✓ | ✓ | ~ | ✓ | Prefix strip: if the path is &lt;prefix&gt;(/\|$)(.\\*) or &lt;prefix&gt;/(.\\*), use a PathPrefix &lt;prefix&gt; match with URLRewrite ReplacePrefixMatch &lt;static part&gt;. Other path regexes have no equivalent. |
| `nginx.ingress.kubernetes.io/ssl-redirect` (false) | 1 | `false` | direct | HTTPRoute on the HTTP listener (sectionName) with RequestRedirect scheme https (standard, extended) | ✓ | ✓ | ~ | ✓ | No redirect: attach the HTTPRoute to both the HTTP and HTTPS listeners so plain HTTP still reaches the backend (ingress2gateway copies the rule). |
| `nginx.ingress.kubernetes.io/secure-verify-ca-secret` | 1 | `blog/ca` | none | – | – | – | – | – | Delete it: it has verified nothing since at least v1.0.0. If backend certificate checks matter, configure them with a BackendTLSPolicy on the new gateway. |

Support: ✓ yes, ~ partial, ✗ no, ? unknown, – nothing to translate. Buckets: see section 1.

### Regex hosts

use-regex, or a rewrite-target that differs from the path, on one Ingress makes every path of the host a case-insensitive regex prefix, across all Ingresses of that host.

- `shop.example.com`: 3 Ingress(es); set by `nginx.ingress.kubernetes.io/use-regex` (shop/shop-api)

### IngressClass annotations

- `nginx`: `ingressclass.kubernetes.io/is-default-class=true`: Gateway API has no default Gateway in the standard channel: every HTTPRoute must name its Gateway. Unmark the NGINX class at cutover.

## 3. Controller settings

### ConfigMap ingress-nginx/ingress-nginx-controller (used by ingress-nginx/ingress-nginx-controller)

| Key | Value | Bucket | App routing GW | AGC | AGC Ingress | Istio add-on | Note |
|---|---|---|---|---|---|---|---|
| `server-snippet` | 2 line(s), not printed | redesign | ✗ | ✗ | ✗ | ~ | Applies to every host, so its loss is cluster-wide. List each directive: redirects and headers often map to HTTPRoute filters; access rules, extra locations and Lua need a redesign. |
| `proxy-body-size` | `10m` | policy | ✗ | ? | ? | ~ | The Envoy targets drop the cap: enforce it in the application, or on istio with a gateway EnvoyFilter (buffer filter). On AGC the limit is undocumented: test uploads at your maximum size. |
| `use-forwarded-headers` | `true` | policy | ? | ~ | ~ | ~ | Istio: set numTrustedProxies (mesh-wide, Allowed). App routing: no documented setting. AGC: appends to XFF, no trust setting. Redirect to HTTPS at the proxy that ends TLS. |
| `allow-snippet-annotations` | `true` | none | – | – | – | – | Snippet annotations were allowed: a config-injection risk (CVE-2021-25742). List every \\*-snippet annotation; each needs a redesign. The AKS add-on sets true by design. |
| `hsts` | `false` | none | ✓ | ✓ | ✓ | ✓ | HSTS was off: targets send none by default; nothing to translate. |

## 4. Defaults that change

ingress-nginx behaviours that change silently after migration, even without any annotation. Test each one against both entry points before moving DNS.

<details>
<summary>B1. HTTP to HTTPS redirect (set in this cluster)</summary>

- ingress-nginx default: On: 308 for every host of a non-canary Ingress with spec.tls (ssl-redirect true, http-redirect-code 308); ACME challenge paths exempt; trailing / stripped.
- In this cluster: annotation `ssl-redirect` on 1 Ingress(es)
- AKS application routing, Gateway API implementation: None by default: add an HTTPRoute on the HTTP listener with RequestRedirect scheme https; default code 302, 308 only from AKS 1.36 (managed bundle v1.5.1).
- Application Gateway for Containers, Gateway API: None by default: an explicit HTTPRoute on the port-80 listener; 301 or 302, 307 and 308 from ALB Controller 1.11.1; 303 unverified.
- Application Gateway for Containers, Ingress API: None by default: a second Ingress whose IngressExtension sets requestRedirect scheme https.
- AKS Istio service mesh add-on, Gateway API ingress: None by default: add an HTTPRoute on the HTTP listener with RequestRedirect scheme https; default code 302, 308 only from AKS 1.36 (managed bundle v1.5.1).
- Impact: Plain-HTTP requests are served over HTTP or refused instead of redirected; a hand-written redirect is 302 by default, and 301 or 302 can turn a POST into a GET.
- Test: curl -si -X POST --resolve $H:80:$OLD http://$H/a/b/ (NGINX: 308, location https://$H/a/b); repeat with $NEW, then for /.well-known/acme-challenge/x.

</details>

<details>
<summary>B2. HSTS header added by default (set in this cluster; derived from source code)</summary>

- ingress-nginx default: On: Strict-Transport-Security max-age=31536000; includeSubDomains on every response NGINX serves over HTTPS, unknown hosts included (derived from lua_ingress.lua).
- In this cluster: ConfigMap `ingress-nginx/ingress-nginx-controller`: `hsts` = `false`
- AKS application routing, Gateway API implementation: None: Gateway API has no HSTS field; add a ResponseHeaderModifier that sets Strict-Transport-Security on the HTTPS routes.
- Application Gateway for Containers, Gateway API: No default documented; add a ResponseHeaderModifier on the HTTPS routes.
- Application Gateway for Containers, Ingress API: No default documented; add a per-host ResponseHeaderModifier in IngressExtension.
- AKS Istio service mesh add-on, Gateway API ingress: None: Gateway API has no HSTS field; add a ResponseHeaderModifier that sets Strict-Transport-Security on the HTTPS routes.
- Impact: Returning browsers keep the cached policy until it expires, new visitors get none, and scanners flag the missing header.
- Test: curl -sI --resolve $H:443:$NEW https://$H/ | grep -i strict-transport, on a 200 and on a 404 path; compare with $OLD.

</details>

<details>
<summary>B3. Default certificate for unknown or missing SNI (derived from source code)</summary>

- ingress-nginx default: Unknown or missing SNI gets --default-ssl-certificate, else a self-signed fake certificate, then the catch-all 404 (ssl-reject-handshake false).
- In this cluster: not changed (default applies)
- AKS application routing, Gateway API implementation: Handshake refused when every HTTPS listener on the port has a hostname; a listener without hostname accepts any SNI with its own certificate (derived).
- Application Gateway for Containers, Gateway API: Not documented.
- Application Gateway for Containers, Ingress API: Not documented.
- AKS Istio service mesh add-on, Gateway API ingress: Handshake refused when every HTTPS listener on the port has a hostname; a listener without hostname accepts any SNI with its own certificate (derived).
- Impact: Clients with no or an unknown SNI (IP probes, scanners, old clients) get a TLS failure instead of a certificate warning and a 404.
- Test: openssl s_client -connect $NEW:443 -servername nohost.invalid &lt;/dev/null, then with -noservername; compare the result and certificate subject with $OLD.

</details>

<details>
<summary>B4. TLS protocols, ciphers and curves</summary>

- ingress-nginx default: TLS 1.2 and 1.3; ECDHE suites plus two DHE suites with server preference; curve auto; session tickets off.
- In this cluster: not changed (default applies)
- AKS application routing, Gateway API implementation: Envoy defaults: TLS 1.2 to 1.3, no DHE, curves X25519 and P-256; the Istio cipher option is undocumented on AKS and the Envoy build (FIPS or not) unpublished.
- Application Gateway for Containers, Gateway API: Predefined policy 2023-06 by default (2023-06-S optional): TLS 1.2 and 1.3, AES-GCM suites, curves P-384 and P-256 only.
- Application Gateway for Containers, Ingress API: Fixed policy 2023-06: TLS 1.2 and 1.3, AES-GCM suites, curves P-384 and P-256 only.
- AKS Istio service mesh add-on, Gateway API ingress: Envoy defaults: TLS 1.2 to 1.3, no DHE, X25519 and P-256; meshConfig.tlsDefaults is Allowed; per-listener cipher option from Istio 1.29.
- Impact: DHE-only clients fail on Envoy and AGC, ChaCha20-only clients fail on AGC, and X25519 is not in AGC's curve list.
- Test: Run testssl.sh (or nmap --script ssl-enum-ciphers) with SNI $H against $OLD and $NEW; diff the protocols, suites and curves.

</details>

<details>
<summary>B5. HTTP/2 towards clients</summary>

- ingress-nginx default: HTTP/2 negotiated by ALPN on TLS (use-http2 true), at most 128 concurrent streams per connection.
- In this cluster: not changed (default applies)
- AKS application routing, Gateway API implementation: ALPN h2 and http/1.1 on HTTPS listeners; Envoy default of 1024 concurrent streams.
- Application Gateway for Containers, Gateway API: HTTP/2 always on and not configurable; HTTP/1.1 is still negotiable.
- Application Gateway for Containers, Ingress API: HTTP/2 always on and not configurable; HTTP/1.1 is still negotiable.
- AKS Istio service mesh add-on, Gateway API ingress: ALPN h2 and http/1.1 on HTTPS listeners; Envoy default of 1024 concurrent streams.
- Impact: Little for browsers; clients that open more than 128 streams per connection are no longer capped at 128 on Envoy.
- Test: curl -s -o /dev/null -w '%{http_version}\\n' --http2 --resolve $H:443:&lt;ip&gt; https://$H/ on both IPs; add --http2-prior-knowledge http://$H/ if clients use h2c.

</details>

<details>
<summary>B6. HTTP/1.0 clients</summary>

- ingress-nginx default: Accepted; no ConfigMap key or annotation restricts the HTTP version.
- In this cluster: not changed (default applies)
- AKS application routing, Gateway API implementation: Rejected with 426 Upgrade Required (Envoy default); no documented lever on AKS.
- Application Gateway for Containers, Gateway API: Not documented.
- Application Gateway for Containers, Ingress API: Not documented.
- AKS Istio service mesh add-on, Gateway API ingress: Rejected with 426; proxyMetadata HTTP10 is Allowed, but whether it reaches the gateways is unverified.
- Impact: Legacy HTTP/1.0 clients and health probes break.
- Test: curl -0 -si --resolve $H:80:$NEW http://$H/ and the same against $OLD.

</details>

<details>
<summary>B7. Request body size limit (set in this cluster)</summary>

- ingress-nginx default: 1 MiB (proxy-body-size 1m), then 413 with an HTML page.
- In this cluster: ConfigMap `ingress-nginx/ingress-nginx-controller`: `proxy-body-size` = `10m`; annotation `proxy-body-size` on 1 Ingress(es)
- AKS application routing, Gateway API implementation: No limit, and not configurable: app routing documents no request header or body size limits.
- Application Gateway for Containers, Gateway API: Not documented.
- Application Gateway for Containers, Ingress API: Not documented.
- AKS Istio service mesh add-on, Gateway API ingress: No limit by default; only an EnvoyFilter buffer filter (max_request_bytes, 413), Allowed but not Azure-supported, holding the body in memory.
- Impact: Uploads over 1 MiB that the edge used to reject now reach the backends, which must enforce their own limit.
- Test: head -c 2097152 /dev/urandom &gt; /tmp/2m; curl -s -o /dev/null -w '%{http_code}\\n' --resolve $H:443:&lt;ip&gt; --data-binary @/tmp/2m https://$H/&lt;path&gt; (NGINX: 413).

</details>

<details>
<summary>B8. Request header size and count</summary>

- ingress-nginx default: Buffers 1k plus 4 x 8k: one header over 8 KiB gives 400, a request line over 8 KiB gives 414; no header-count limit.
- In this cluster: not changed (default applies)
- AKS application routing, Gateway API implementation: Envoy defaults: 60 KiB of headers and 100 header fields, then 431 on HTTP/1 (stream reset on HTTP/2); not configurable.
- Application Gateway for Containers, Gateway API: Not documented.
- Application Gateway for Containers, Ingress API: Not documented.
- AKS Istio service mesh add-on, Gateway API ingress: Same Envoy defaults (60 KiB, 100 fields, 431); changeable only through EnvoyFilter (Allowed, not Azure-supported).
- Impact: Single headers of 8 to 60 KiB (large cookies, JWTs) now pass; requests with more than 100 header fields now fail.
- Test: With curl --resolve against both IPs, send a 12 KB Cookie header (NGINX 400, Envoy 200), then a request with 101 X-Tn headers (Envoy 431).

</details>

<details>
<summary>B9. Headers with underscores</summary>

- ingress-nginx default: Silently dropped (enable-underscores-in-headers false, ignore-invalid-headers true).
- In this cluster: not changed (default applies)
- AKS application routing, Gateway API implementation: Forwarded: Envoy headers_with_underscores_action defaults to ALLOW.
- Application Gateway for Containers, Gateway API: Not documented.
- Application Gateway for Containers, Ingress API: Not documented.
- AKS Istio service mesh add-on, Gateway API ingress: Forwarded: Envoy headers_with_underscores_action defaults to ALLOW.
- Impact: Backends start receiving fields such as X_Api_Key that NGINX never forwarded.
- Test: curl -s -H 'X_Probe_Underscore: 1' --resolve $H:443:&lt;ip&gt; https://$H/echo: absent behind NGINX, present behind Envoy.

</details>

<details>
<summary>B10. Header-name case</summary>

- ingress-nginx default: Preserved byte for byte.
- In this cluster: not changed (default applies)
- AKS application routing, Gateway API implementation: Lower-cased by Envoy's HTTP/1 codec; no documented lever.
- Application Gateway for Containers, Gateway API: Not documented; AGC's own HTTP/1.1 responses use lower-case names.
- Application Gateway for Containers, Ingress API: Not documented; AGC's own HTTP/1.1 responses use lower-case names.
- AKS Istio service mesh add-on, Gateway API ingress: Lower-cased; ProxyConfig proxyHeaders.preserveHttp1HeaderCase is Allowed.
- Impact: Only code that compares header names case-sensitively breaks; HTTP field names are case-insensitive.
- Test: Send X-MiXeD-Case: 1 over HTTP/1.1 to a backend that logs raw header bytes; inspect the response spelling with curl --http1.1 -sv.

</details>

<details>
<summary>B11. Request and response buffering (derived from source code)</summary>

- ingress-nginx default: Request bodies are buffered before proxying (proxy-request-buffering on, 8k in memory); responses are streamed (proxy-buffering off).
- In this cluster: not changed (default applies)
- AKS application routing, Gateway API implementation: Both streamed: no buffer filter in the gateway filter chain (derived); not configurable.
- Application Gateway for Containers, Gateway API: Not documented.
- Application Gateway for Containers, Ingress API: Not documented.
- AKS Istio service mesh add-on, Gateway API ingress: Both streamed (derived); buffering needs an EnvoyFilter buffer filter (Allowed, not Azure-supported).
- Impact: Backends receive headers at once and read slow uploads themselves, so workers are held longer and body-read timeouts can fire.
- Test: head -c 921600 /dev/urandom &gt; /tmp/900k; curl --limit-rate 20k --data-binary @/tmp/900k https://$H/&lt;upload&gt;; compare when the backend logs the request start.

</details>

<details>
<summary>B12. Response header size from the backend (derived from source code)</summary>

- ingress-nginx default: Backend response headers must fit in 4 KiB (proxy-buffer-size 4k), otherwise 502.
- In this cluster: not changed (default applies)
- AKS application routing, Gateway API implementation: Envoy limits: 60 KiB (80 KiB on HTTP/1 in recent versions) and 100 headers, then 502 (derived from source).
- Application Gateway for Containers, Gateway API: Not documented.
- Application Gateway for Containers, Ingress API: Not documented.
- AKS Istio service mesh add-on, Gateway API ingress: Envoy limits: 60 KiB (80 KiB on HTTP/1 in recent versions) and 100 headers, then 502 (derived from source).
- Impact: Responses with large header sets (big Set-Cookie or CSP) that failed with 502 on NGINX now succeed, up to Envoy's limits.
- Test: Call a backend endpoint that returns about 6 KiB of response headers: NGINX 502, Envoy 200.

</details>

<details>
<summary>B13. Client source IP</summary>

- ingress-nginx default: Depends on the install: the AKS add-on and the upstream cloud manifest use externalTrafficPolicy Local (client IP kept); the Helm chart default is Cluster.
- In this cluster: not changed (default applies)
- AKS application routing, Gateway API implementation: Gateway Service generated with externalTrafficPolicy Cluster, so pods see node IPs; Local is allowed once the port-80 health-probe annotations are unset.
- Application Gateway for Containers, Gateway API: Client IP only in X-Forwarded-For and the access log; pods see AGC as the TCP peer.
- Application Gateway for Containers, Ingress API: Client IP only in X-Forwarded-For and the access log; pods see AGC as the TCP peer.
- AKS Istio service mesh add-on, Gateway API ingress: Gateway Service generated with externalTrafficPolicy Cluster, so pods see node IPs; Local is allowed once the port-80 health-probe annotations are unset.
- Impact: Moving from Local to Cluster makes requests look as if they came from node IPs: logs, IP allow lists, per-IP limits and geo-IP change.
- Test: kubectl get svc -A -o custom-columns=NS:.metadata.namespace,NAME:.metadata.name,ETP:.spec.externalTrafficPolicy for both Services; curl https://$H/echo from a known IP and compare.

</details>

<details>
<summary>B14. X-Forwarded-For, X-Real-IP and trusted proxies (set in this cluster)</summary>

- ingress-nginx default: X-Forwarded-For replaced by the client address and X-Real-IP set; incoming X-Forwarded-\* headers ignored (use-forwarded-headers false).
- In this cluster: ConfigMap `ingress-nginx/ingress-nginx-controller`: `use-forwarded-headers` = `true`
- AKS application routing, Gateway API implementation: Envoy appends the peer to X-Forwarded-For (0 trusted hops) and sets no X-Real-IP; no documented lever.
- Application Gateway for Containers, Gateway API: Appended to X-Forwarded-For; X-Real-IP not documented; no trusted-proxy setting.
- Application Gateway for Containers, Ingress API: Appended to X-Forwarded-For; X-Real-IP not documented; no trusted-proxy setting.
- AKS Istio service mesh add-on, Gateway API ingress: Appended, no X-Real-IP; meshConfig numTrustedProxies is Allowed.
- Impact: Apps that read X-Real-IP lose it or read a forged value; apps that take the left-most X-Forwarded-For entry become spoofable.
- Test: curl -s -H 'X-Forwarded-For: 203.0.113.7' -H 'X-Real-IP: 203.0.113.8' https://$H/echo on both IPs; diff what the backend received.

</details>

<details>
<summary>B15. Other forwarded headers and request ID (set in this cluster)</summary>

- ingress-nginx default: Sets X-Forwarded-Host, -Port, -Proto, -Scheme and X-Scheme; clears Proxy; keeps the client X-Request-ID or generates one.
- In this cluster: ConfigMap `ingress-nginx/ingress-nginx-controller`: `use-forwarded-headers` = `true`
- AKS application routing, Gateway API implementation: Sets x-forwarded-proto only, no X-Forwarded-Host or -Port; replaces x-request-id on external requests; adds x-envoy-attempt-count.
- Application Gateway for Containers, Gateway API: Inserts x-forwarded-for, x-forwarded-proto and a new x-request-id per request; handling of a client-supplied ID is not documented.
- Application Gateway for Containers, Ingress API: Inserts x-forwarded-for, x-forwarded-proto and a new x-request-id per request; handling of a client-supplied ID is not documented.
- AKS Istio service mesh add-on, Gateway API ingress: Same as app routing; ProxyConfig proxyHeaders options (xForwardedHost, xForwardedPort) are Allowed.
- Impact: Apps that build absolute URLs or redirects from X-Forwarded-Host or -Port produce wrong links; request IDs set upstream are replaced.
- Test: curl -s -H 'X-Request-ID: probe-123' https://$H/echo on both IPs; compare X-Forwarded-Host, -Port, -Proto and X-Request-ID.

</details>

<details>
<summary>B16. Timeouts (set in this cluster)</summary>

- ingress-nginx default: Connect 5 s; read and send 60 s, measured between two successive operations; no total request deadline; 504 on expiry.
- In this cluster: annotation `proxy-read-timeout` on 1 Ingress(es)
- AKS application routing, Gateway API implementation: No route timeout and no stream idle timeout unless HTTPRoute timeouts are set (backendRequest then overrides request); upstream connect 10 s.
- Application Gateway for Containers, Gateway API: 60 s total request timeout even while data streams; idle 5 min; connect 5 s; set HTTPRoute timeouts or RoutePolicy routeTimeout.
- Application Gateway for Containers, Ingress API: 60 s total request timeout; idle 5 min; per-Service timeouts in IngressExtension.
- AKS Istio service mesh add-on, Gateway API ingress: No route timeout and no stream idle timeout unless HTTPRoute timeouts are set (backendRequest then overrides request); upstream connect 10 s.
- Impact: A silent backend: NGINX answers 504 after 60 s, Istio waits until the client or the Azure LB gives up, AGC stops at 60 s; long downloads and SSE are cut at 60 s on AGC.
- Test: With two probe endpoints, /sleep?s=75 and /drip?every=10&for=150, record the status and elapsed time on both IPs.

</details>

<details>
<summary>B17. Retries</summary>

- ingress-nginx default: On error or timeout, up to 3 tries, idempotent methods only, never after bytes reached the client; no retry on status codes.
- In this cluster: not changed (default applies)
- AKS application routing, Gateway API implementation: Upstream Istio default on every route: 2 retries on connect failure, refused stream, unavailable or cancelled, any method; AKS overrides undocumented.
- Application Gateway for Containers, Gateway API: Automatic retries; conditions and count not documented and not configurable.
- Application Gateway for Containers, Ingress API: Automatic retries; conditions and count not documented and not configurable.
- AKS Istio service mesh add-on, Gateway API ingress: Same upstream Istio default; meshConfig defaultHttpRetryPolicy is Allowed.
- Impact: Istio does not retry timeouts or resets, so a pod that dies mid-request surfaces as a 503; a hung GET no longer takes up to 3 x 60 s as on NGINX.
- Test: Count backend hits per client request for a GET to an endpoint that never answers, a POST to a pod that resets, and a request while one of two pods refuses connections.

</details>

<details>
<summary>B18. Keep-alive and idle connections</summary>

- ingress-nginx default: Upstream keep-alive: 320 idle connections per worker, 60 s idle, 10000 requests; client keep-alive 75 s and 1000 requests.
- In this cluster: not changed (default applies)
- AKS application routing, Gateway API implementation: Envoy pools upstream connections with a 1 h idle timeout; client connections idle 1 h, but the Azure LB resets idle TCP after 4 min.
- Application Gateway for Containers, Gateway API: Client HTTP idle timeout 5 min; upstream pooling not documented.
- Application Gateway for Containers, Ingress API: Client HTTP idle timeout 5 min; upstream pooling not documented.
- AKS Istio service mesh add-on, Gateway API ingress: Same Envoy defaults; a DestinationRule connectionPool idleTimeout changes the upstream idle time.
- Impact: Idle client connections now close after 4 min (Azure LB) instead of 75 s; backends with short keep-alive timeouts can cause occasional 503s on Istio.
- Test: Run a backend with a 1 s keep-alive timeout at about one request every 2 s per pod for 10 min and count 502 and 503; then reuse a client connection idle for 5 min.

</details>

<details>
<summary>B19. WebSocket and HTTP upgrade (set in this cluster)</summary>

- ingress-nginx default: Works with no configuration; idle sockets close after 60 s (proxy-read-timeout and proxy-send-timeout).
- In this cluster: annotation `proxy-read-timeout` on 1 Ingress(es)
- AKS application routing, Gateway API implementation: Works; the gateway never times out an idle socket, so the Azure LB 4-minute idle reset becomes the limit.
- Application Gateway for Containers, Gateway API: Works without configuration; idle 5 min; add a HealthCheckPolicy for WebSocket backends; the 60 s request timeout after upgrade is unverified.
- Application Gateway for Containers, Ingress API: Not supported: WebSockets need the Gateway API on AGC.
- AKS Istio service mesh add-on, Gateway API ingress: Works; the gateway never times out an idle socket, so the Azure LB 4-minute idle reset becomes the limit.
- Impact: Sockets that NGINX closed after 60 s idle now last about 4 min on Istio or up to 5 min on AGC; WebSockets break on the AGC Ingress API.
- Test: Connect with a WebSocket client such as websocat, stay idle 70 s, 250 s and 310 s, then send; record the close code and time on both IPs.

</details>

<details>
<summary>B20. Protocol towards backends</summary>

- ingress-nginx default: HTTP/1.1 to every backend unless backend-protocol is GRPC or GRPCS; Service port names and appProtocol are ignored.
- In this cluster: not changed (default applies)
- AKS application routing, Gateway API implementation: Protocol from the Service port appProtocol or name: kubernetes.io/h2c, http2\*, grpc\* and grpc-web\* give HTTP/2; anything else HTTP/1.1.
- Application Gateway for Containers, Gateway API: HTTP/1.1, except gRPC over HTTP/2.
- Application Gateway for Containers, Ingress API: HTTP/1.1, except gRPC over HTTP/2.
- AKS Istio service mesh add-on, Gateway API ingress: Protocol from the Service port appProtocol or name: kubernetes.io/h2c, http2\*, grpc\* and grpc-web\* give HTTP/2; anything else HTTP/1.1.
- Impact: On Istio, Services whose ports are named http2-\* or grpc-\* (or use appProtocol kubernetes.io/h2c) but speak HTTP/1.1 start failing.
- Test: List Service port names and appProtocol values, then call one route per such port through $NEW.

</details>

<details>
<summary>B21. Trailing slash and prefix semantics (derived from source code)</summary>

- ingress-nginx default: Prefix /foo/ also answers /foo with a 301 to /foo/ (derived); an ImplementationSpecific /foo is a character prefix that also matches /foobar.
- In this cluster: not changed (default applies)
- AKS application routing, Gateway API implementation: PathPrefix matches whole segments: /foo matches /foo, /foo/ and /foo/x but not /foobar; no redirect.
- Application Gateway for Containers, Gateway API: Gateway API Exact and PathPrefix semantics (Core conformance passed at v1.2.1).
- Application Gateway for Containers, Ingress API: Only Prefix is documented; Exact and ImplementationSpecific behaviour is undocumented.
- AKS Istio service mesh add-on, Gateway API ingress: PathPrefix matches whole segments: /foo matches /foo, /foo/ and /foo/x but not /foobar; no redirect.
- Impact: /foo is no longer redirected to /foo/, so relative links can resolve differently; /foobar is no longer served by an ImplementationSpecific /foo path.
- Test: For each Ingress path P, request P, P/, P + "x" and P/x on both IPs; compare status, location and the pod that answered.

</details>

<details>
<summary>B22. Regex dialect, anchoring and case (set in this cluster)</summary>

- ingress-nginx default: use-regex, or a rewrite-target that differs from the path, on any Ingress of a host makes every path of that host a case-insensitive PCRE prefix match.
- In this cluster: annotation `use-regex` on 1 Ingress(es); annotation `rewrite-target` on 1 Ingress(es)
- AKS application routing, Gateway API implementation: RegularExpression is RE2, case-sensitive, and must match the whole path; Exact and PathPrefix are literal and case-sensitive.
- Application Gateway for Containers, Gateway API: RE2 for path, header and query matches; anchoring and case handling undocumented.
- Application Gateway for Containers, Ingress API: No regex mechanism documented.
- AKS Istio service mesh add-on, Gateway API ingress: RegularExpression is RE2, case-sensitive, and must match the whole path; Exact and PathPrefix are literal and case-sensitive.
- Impact: /API/v1 no longer matches /api; /api/v[0-9]+ matched /api/v1/users on NGINX but only matches /api/v1 on Envoy unless .\* is appended.
- Test: For each regex host, send upper-case variants, longer paths and extra segments to both IPs; diff the status and the pod that answered.

</details>

<details>
<summary>B23. Precedence of overlapping rules (set in this cluster; derived from source code)</summary>

- ingress-nginx default: Longest path first; on regex hosts the first matching regex in length order; for a duplicate host and path the oldest Ingress wins, logged only at --v=3.
- In this cluster: annotation `use-regex` on 1 Ingress(es); annotation `rewrite-target` on 1 Ingress(es)
- AKS application routing, Gateway API implementation: Exact before PathPrefix before RegularExpression, then longer values; a PathPrefix / rule hides every regex rule on the host (derived).
- Application Gateway for Containers, Gateway API: Exact and PathPrefix follow the Gateway API order; regex precedence undocumented.
- Application Gateway for Containers, Ingress API: Not documented.
- AKS Istio service mesh add-on, Gateway API ingress: Exact before PathPrefix before RegularExpression, then longer values; a PathPrefix / rule hides every regex rule on the host (derived).
- Impact: Overlapping paths can land on another backend; on Istio, regex rules on a host that also has a / rule never match.
- Test: Generate probes from every (host, path) pair in the inventory, send them to both IPs, and compare the pod name the echo backend returns.

</details>

<details>
<summary>B24. Wildcard hosts</summary>

- ingress-nginx default: \*.example.com matches exactly one label.
- In this cluster: not changed (default applies)
- AKS application routing, Gateway API implementation: \*.example.com matches any depth (a.b.example.com) but not example.com.
- Application Gateway for Containers, Gateway API: Not documented.
- Application Gateway for Containers, Ingress API: Not documented.
- AKS Istio service mesh add-on, Gateway API ingress: \*.example.com matches any depth (a.b.example.com) but not example.com.
- Impact: Deeper names that hit NGINX's default backend (404) now reach the wildcard route; the wildcard certificate usually fails for them anyway.
- Test: curl -sk --resolve a.b.example.com:443:&lt;ip&gt; https://a.b.example.com/ on both IPs.

</details>

<details>
<summary>B25. Path normalisation (set in this cluster)</summary>

- ingress-nginx default: Matches the decoded URI with dot-segments resolved and slashes merged, but forwards the original URI (rewrite-target sends the normalised one).
- In this cluster: annotation `rewrite-target` on 1 Ingress(es)
- AKS application routing, Gateway API implementation: Istio BASE normalisation: dot-segments resolved, // and %2F kept; the normalised path is also sent upstream.
- Application Gateway for Containers, Gateway API: Not documented.
- Application Gateway for Containers, Ingress API: Not documented.
- AKS Istio service mesh add-on, Gateway API ingress: Istio BASE normalisation (dot-segments resolved, // and %2F kept); meshConfig pathNormalization is Allowed.
- Impact: //api/x and /api%2Fx matched /api on NGINX but not on Istio; backends now receive paths with dot-segments resolved.
- Test: curl --path-as-is -s https://$H//api/x, then /api%2Fx and /x/../api/x, on both IPs; compare the status and the path the backend saw.

</details>

<details>
<summary>B26. Unknown hosts and default backend</summary>

- ingress-nginx default: Unknown hosts and unmatched paths go to the default backend: an HTML 404, or the Service named by --default-backend-service.
- In this cluster: not changed (default applies)
- AKS application routing, Gateway API implementation: 404 with an empty body; a default backend must be an explicit PathPrefix / route on a listener without hostname.
- Application Gateway for Containers, Gateway API: Not documented (Gateway API requires a 404); add a catch-all route for a default backend.
- Application Gateway for Containers, Ingress API: Not documented; Microsoft's migration utility marks default-backend as unsupported.
- AKS Istio service mesh add-on, Gateway API ingress: 404 with an empty body; a default backend must be an explicit PathPrefix / route on a listener without hostname.
- Impact: An HTML or branded 404 becomes an empty 404, and synthetic monitors that match body text change.
- Test: curl -sk --resolve nohost.invalid:443:&lt;ip&gt; https://nohost.invalid/, then curl -s http://&lt;ip&gt;/, on both IPs; compare status, Content-Type and body.

</details>

<details>
<summary>B27. Compression</summary>

- ingress-nginx default: Off (use-gzip false, enable-brotli false).
- In this cluster: not changed (default applies)
- AKS application routing, Gateway API implementation: Off; no compressor filter and no lever on app routing.
- Application Gateway for Containers, Gateway API: No compression feature documented.
- Application Gateway for Containers, Ingress API: No compression feature documented.
- AKS Istio service mesh add-on, Gateway API ingress: Off; compression only through EnvoyFilter (Allowed, not Azure-supported).
- Impact: None unless use-gzip or enable-brotli was turned on; then responses grow, which costs bandwidth, latency and egress.
- Test: curl -s -o /dev/null -D - -H 'Accept-Encoding: gzip, br' https://$H/&lt;large text asset&gt; on both IPs; compare Content-Encoding and size.

</details>

<details>
<summary>B28. Server header and version disclosure</summary>

- ingress-nginx default: No Server header (server-tokens false); the backend Server header is hidden; NGINX error pages end with "nginx" without a version.
- In this cluster: not changed (default applies)
- AKS application routing, Gateway API implementation: server: istio-envoy on every response, overwriting the backend value, plus x-envoy-upstream-service-time; no documented lever.
- Application Gateway for Containers, Gateway API: AGC redirects carry server: Microsoft-Azure-Application-LB/AGC; handling of the backend Server header is not documented.
- Application Gateway for Containers, Ingress API: AGC redirects carry server: Microsoft-Azure-Application-LB/AGC; handling of the backend Server header is not documented.
- AKS Istio service mesh add-on, Gateway API ingress: Same; ProxyConfig proxyHeaders.server and envoyDebugHeaders are Allowed.
- Impact: A product disclosure appears where there was none and scanners flag it; apps that set their own Server header lose it on Istio.
- Test: curl -sI https://$H/ | grep -iE '^(server|x-envoy)' on both IPs, over HTTP/1.1 and HTTP/2, for a 200, a 404 and a 502.

</details>

<details>
<summary>B29. 502, 503 and 504 on upstream failures</summary>

- ingress-nginx default: Refused or reset connection: 502; timeout: 504; no endpoints: 503, unless a default-backend annotation points at a Service with endpoints.
- In this cluster: not changed (default applies)
- AKS application routing, Gateway API implementation: Reset or connect failure before headers: 503; protocol error: 502; no healthy endpoint: 503; timeout: 504 (only with HTTPRoute timeouts); invalid backend: 500.
- Application Gateway for Containers, Gateway API: No endpoints or an invalid backend: 500; other mappings not documented.
- Application Gateway for Containers, Ingress API: No endpoints or an invalid backend: 500; other mappings not documented.
- AKS Istio service mesh add-on, Gateway API ingress: Reset or connect failure before headers: 503; protocol error: 502; no healthy endpoint: 503; timeout: 504 (only with HTTPRoute timeouts); invalid backend: 500.
- Impact: Crashed or refusing pods move from 502 to 503 on Istio, empty Services become 500 on AGC, and alerts or retry rules keyed on 5xx codes change.
- Test: Scale a backend to 0, make a Ready pod refuse connections, and make a pod sleep past the timeout; compare status and body on both IPs.

</details>

<details>
<summary>B30. Custom error pages and error bodies</summary>

- ingress-nginx default: Nothing is intercepted unless custom-http-errors is set; errors NGINX generates itself are text/html pages.
- In this cluster: not changed (default applies)
- AKS application routing, Gateway API implementation: Nothing intercepted; Envoy errors are short plain text or empty; no error-page feature.
- Application Gateway for Containers, Gateway API: No error-page or interception setting in the API; AGC's own error bodies are not documented.
- Application Gateway for Containers, Ingress API: No error-page or interception setting in the API; AGC's own error bodies are not documented.
- AKS Istio service mesh add-on, Gateway API ingress: Nothing intercepted; error pages only through EnvoyFilter (Allowed, not Azure-supported).
- Impact: Branded and maintenance error pages disappear; clients that parse error bodies or check Content-Type see a different format.
- Test: Trigger a 404 (unknown path), a 413 and a 502, 503 or 504 on both IPs; compare Content-Type and body.

</details>

## 5. TCP and UDP, SSL passthrough, default certificate, default backend

- TCP services ConfigMap `ingress-nginx/ingress-nginx-tcp`: 1 entr(ies): `5432 → data/postgres:5432`. Read the ConfigMap: per port, a Gateway TCP listener + TCPRoute (Istio targets, AKS 1.37+) or a Service type LoadBalancer for the backend; agc and agcIngress have no TCP. (App routing GW ~, AGC ✗, AGC Ingress ✗, Istio add-on ~)
- SSL passthrough: no
- `ingress-nginx/ingress-nginx-controller`: Default certificate: not set: unknown names get a self-signed fake certificate; Default backend: not set: the built-in 404 page; 0 Ingress(es) set spec.defaultBackend

## 6. Network and load balancers

| Service | Type | Addresses | Internal | Pinned IP | externalTrafficPolicy | Ports |
|---|---|---|---|---|---|---|
| `ingress-nginx/ingress-nginx-controller` | LoadBalancer | 20.0.113.10 | no | azure-pip-name `pip-shop-prod` | Local | 80/TCP:30080, 443/TCP:30443, 5432/TCP:30432 |

### Settings on these Services

- `ingress-nginx/ingress-nginx-controller`: `Service.spec.externalTrafficPolicy=Local=Local` (policy): Set Local in the Gateway ConfigMap with the probe annotations unset (Istio targets), or read X-Forwarded-For on AGC; re-check every IP allow-list.
- `ingress-nginx/ingress-nginx-controller`: `service.beta.kubernetes.io/azure-load-balancer-resource-group=rg-network-prod` (policy): Copy it with azure-pip-name: without it the IP is searched in the node resource group and the Service fails with "user supplied IP address was not found".
- `ingress-nginx/ingress-nginx-controller`: `service.beta.kubernetes.io/azure-pip-name=pip-shop-prod` (policy): Pre-create a new static IP for the Gateway, update Front Door, Traffic Manager and allow-lists to it, and keep the NGINX IP until DNS has drained.

> Every Gateway gets its own load balancer address: DNS records, Azure Front Door origins, Application Gateway backends, firewall and NSG allow lists, and partner allow lists that point at these addresses change at cutover.

## 7. Inventory per namespace

<details>
<summary>blog: 1 Ingress(es), 1 route(s)</summary>

| Ingress | Class | Hosts | Routes | TLS | Keys by bucket |
|---|---|---|---:|---|---|
| `legacy` | nginx (annotation) | blog.example.com | 1 | no | policy 1, direct 2, none 1 |

</details>

<details>
<summary>shop: 3 Ingress(es), 3 route(s)</summary>

| Ingress | Class | Hosts | Routes | TLS | Keys by bucket |
|---|---|---|---:|---|---|
| `shop-api` | nginx | shop.example.com | 1 | no | policy 1, direct 2 |
| `shop-api-canary` | nginx | shop.example.com | 1 | no | direct 2 |
| `shop-web` | nginx | shop.example.com | 1 | yes | policy 2, direct 1 |

</details>

## 8. Other controllers and unassigned Ingresses

### Served by other controllers (not affected by the ingress-nginx retirement)

None.

### Not served by any detected controller

- `blog/no-class`: no class: ingress-nginx serves it only with --watch-ingress-without-class=true

### Ambiguities

None.

## 9. Next steps

1. Choose a target. None is enabled in this cluster yet.
   - AKS application routing, Gateway API implementation: https://learn.microsoft.com/en-us/azure/aks/app-routing-gateway-api
   - Application Gateway for Containers, Gateway API: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/overview
   - Application Gateway for Containers, Ingress API: https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-multiple-site-hosting-ingress-api
   - AKS Istio service mesh add-on, Gateway API ingress: https://learn.microsoft.com/en-us/azure/aks/istio-gateway-api
2. Draft the manifests with ingress2gateway v1.2.0, one run per class:

   ```bash
   ingress2gateway print --providers=ingress-nginx --ingress-nginx-ingress-class=nginx --all-namespaces --no-color > i2gw.yaml 2> i2gw.notes.txt
   ```

   ingress2gateway reads only Ingresses and Services (not the ConfigMap), skips classless Ingresses (0 served here), writes one Gateway per namespace and class, and names the GatewayClass after the Ingress class: rewrite it to approuting-istio, istio or azure-alb-external. Its 308 redirects, and 303/307 codes, are rejected by the managed Gateway API CRDs of AKS 1.35 and earlier. It has no output for the AGC Ingress API.
3. Handle the redesign and policy items of section 2, and the unknown keys.
4. Plan the address, DNS and certificate changes of section 6.
5. Run the tests of section 4 against both entry points.
6. Run both in parallel, move DNS, watch, then remove ingress-nginx; keep the old entry point until rollback is no longer needed.

CLAZA IT, which maintains this tool, delivers a fixed-price migration plan built from this report: https://claza.cloud/en/aks-ingress-nginx-migration/

## 10. About

Catalog of 2026-11-09: ingress-nginx controller-v1.15.1 (final upstream releases: v1.15.1, v1.14.5, v1.13.9), Gateway API v1.7.0, ingress2gateway v1.2.0. Target documentation: [App routing GW](https://learn.microsoft.com/en-us/azure/aks/app-routing-gateway-api), [AGC](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/overview), [AGC Ingress](https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-multiple-site-hosting-ingress-api), [Istio add-on](https://learn.microsoft.com/en-us/azure/aks/istio-gateway-api).

Every catalog entry cites its sources: https://github.com/CLAZA-ORG/ingress-nginx-inventory

Informational only: verify every finding in your environment before acting. Not affiliated with Microsoft, the Kubernetes project or F5.

### Catalog caveats

- Microsoft builds of ingress-nginx and forks (such as Chainguard's, whose image repository is not public) get no CVE verdict: whether they carry upstream fixes cannot be read from the version.
- The approuting-istio and istio GatewayClass controller names are not documented by Microsoft; the report shows the live value.
- Severities of CVE-2025-15566 and the February 2026 CVEs are computed from their published CVSS 3.1 vectors; the advisories state no score.
- Traefik's ingress-nginx provider can serve IngressClasses with spec.controller k8s.io/ingress-nginx; check Traefik workloads for --providers.kubernetesingressnginx.

### Collection notes

- daemonsets.json not found: skipped
- nginxingresscontrollers.json not found: skipped
- gatewayclasses.json not found: skipped
- gateways.json not found: skipped
- httproutes.json not found: skipped
