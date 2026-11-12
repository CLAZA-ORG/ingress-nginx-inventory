# F5: Default behaviours that change silently when traffic leaves ingress-nginx

- Researched: 2026-11-04.
- Targets compared with ingress-nginx:
  - `appRoutingGateway` and `istio`: Envoy, configured by an AKS-managed Istio control plane (F2, F4).
  - `agc` and `agcIngress`: Application Gateway for Containers (F3).
- Baseline: ingress-nginx `controller-v1.15.1` defaults, built on NGINX 1.27.1 [IN-BUILD#L21].
  - `controller-v1.13.9` is the other line that the AKS add-on ships (F2 A.2). Its `NewDefault()`, `nginx.tmpl` and `lua_ingress.lua` are identical to v1.15.1. The only difference is the order of the two DHE suites in `ssl-ciphers` [IN-1139].
- Scope: only defaults that a migration inherits without anyone asking for them. Feature support (what can be expressed at all) is covered by the matrices in F1 to F4 and is not repeated here.

## How this was verified

- **ingress-nginx.** The source tree of tag `controller-v1.15.1` was read: `config.go`, `nginx.tmpl`, the Lua modules and the Go template helpers. Its docs at the same tag were read too. Line anchors point at that tag.
- **AKS add-on NGINX.** `Azure/aks-app-routing-operator` tag `v0.2.27`, `pkg/manifests/nginx.go`.
- **NGINX.** The core and proxy module docs. Source at `release-1.27.1`: `ngx_http_upstream.c`, `ngx_http_special_response.c` and `ngx_http_proxy_module.c`.
- **Istio.** Source on `release-1.29` and `release-1.31`, plus `release-1.26` and `release-1.28` for retries and route sorting.
  - Every local copy was compared with its pinned GitHub raw URL by byte size on 2026-11-04, and all matched.
  - The `release-1.31` listener builder, gateway, proxy-headers, route and mesh files were downloaded and compared with `release-1.29`. Every default cited below is the same in both branches.
- **Envoy.** Default values come from the API docs; the "latest" docs were at version `1.41.0-dev` on 2026-11-04. Status codes and HTTP/1 codec behaviour were checked in the `v1.36.0` source.
- **AGC.** The Microsoft Learn markdown in MicrosoftDocs/azure-docs (`main`, read 2026-11-04), the same set as F3.
- **AKS.** Learn pages for the app routing Gateway API and the Istio Gateway API, plus the cloud-provider-azure load balancer annotations page.
- **Online checks.** These were kept to what was missing locally:
  - 13 WebFetch page reads: Envoy API and header docs (8, including two re-reads), Istio MeshConfig reference (2), NGINX core and proxy docs (2), cloud-provider-azure (1).
  - 9 raw-file GETs: six Istio `release-1.31` files, `route_collections.go` plus one 404 name probe, and the NGINX proxy module.
  - 26 HEAD requests, used only to compare the sizes of local copies with their pinned URLs.

**Conventions**

- `[TAG#Lx-Ly]` points to the Sources section; `#L` anchors refer to the pinned file.
- **UNVERIFIED**: the sources are silent or conflict.
- **Derived**: a conclusion drawn from cited facts that no source states.
- "F1" to "F6" are the sibling fact files.
- **The Istio column describes upstream Istio defaults, verified in source.**
  - Microsoft publishes neither the MeshConfig nor the Envoy version that `approuting-istio` or the `asm-1-xx` revisions run.
  - Whether AKS overrides any upstream default is therefore UNVERIFIED unless a cell cites an AKS page. The tests in each row are how to confirm it.

---

## 0. Headline findings

1. **Nothing enforces HTTPS by default on any target.**
   - ingress-nginx answers plain HTTP with a **308** redirect for every host defined by an Ingress that has a `tls` section, even when the host is not listed in it.
   - It adds **HSTS** (`max-age=31536000; includeSubDomains`) to every response it serves over HTTPS. Derived: the per-host certificate check in the HSTS code is never called (B1, B2).
   - None of the four targets does either.
   - In Gateway API, `RequestRedirect.statusCode` defaults to **302**. A 308 needs the v1.5.1+ CRD bundle (AKS 1.36+) or ALB Controller 1.11.1+ (B1, B2).
2. **The client IP changes, and becomes forgeable.**
   - The AKS add-on's NGINX Service uses `externalTrafficPolicy: Local`. The app routing and Istio add-on Gateway Services default to `Cluster`, so the gateway sees node IPs and forwards them to backends in `X-Forwarded-For`.
   - ingress-nginx **replaces** `X-Forwarded-For` with the TCP peer and sets `X-Real-IP`. Envoy (Istio) and AGC **append** to whatever the client sent, and set no `X-Real-IP` (B13, B14).
3. **Timeouts change shape.**
   - NGINX: 5 s connect; 60 s read/send *inactivity*; no total deadline.
   - Istio: no route timeout and no stream-idle timeout at all; 10 s connect.
   - AGC: a 60 s **total** request timeout that applies even while data streams; 5 min idle; 5 s connect (B16).
4. **Retries change.**
   - NGINX retries idempotent requests on connection errors **and timeouts**, up to 3 tries. Derived: a hung GET can take about 3 × 60 s to return 504.
   - Istio retries any method twice, but only on `connect-failure`, `refused-stream` and the gRPC `unavailable`/`cancelled` conditions. It does not retry on timeouts or resets. 503 has not been retried by default since 1.26, and the code removed it in 1.27.
   - AGC's retry rules are undocumented (B17).
5. **The 1 MiB body limit (413) disappears** on the Istio targets. It cannot be set on app routing, and AGC documents nothing (B7).
6. **5xx codes shift.**
   - NGINX: a refused or reset connection is 502, a timeout is 504, a Service with no endpoints is 503.
   - Envoy: a refused or reset connection, including a connect timeout, is **503** with a plain-text body.
   - AGC: a Service with no endpoints is **500** (B29).
7. **Regex hosts change meaning.**
   - On NGINX, `use-regex` or `rewrite-target` on one Ingress turns *every* path of the host into a case-insensitive, start-anchored PCRE.
   - Envoy RE2 is case-sensitive and must match the whole path.
   - Istio ranks every regex rule below every prefix rule. A bare `PathPrefix /` rule therefore comes before them, and Istio stops generating routes at it, so the regex rules on that host never reach Envoy (B22, B23).
8. **Header handling changes.**
   - Header names containing underscores now reach backends.
   - Header names are lower-cased.
   - More than 100 headers gives 431.
   - Single headers of 8 to 60 KiB, which NGINX rejected with 400, now pass (B8 to B10).
9. **Unknown SNI changes.** NGINX completes the handshake with a fake default certificate and then returns 404. Istio closes the connection, unless an HTTPS listener on that port has no hostname (B3).
10. **New identity headers appear.**
    - Istio writes `server: istio-envoy`, overwriting the backend's value, and adds `x-envoy-upstream-service-time`.
    - AGC's own redirect responses carry `server: Microsoft-Azure-Application-LB/AGC` (B28).
11. **HTTP/1.0 is rejected with 426** on Istio gateways (B6).
12. **Port names drive the backend protocol on Istio.** Istio speaks HTTP/2 (h2c) to Service ports named `http2-*`, `grpc-*` or `grpc-web-*`, or whose `appProtocol` is `kubernetes.io/h2c`, `http2`, `grpc` or `grpc-web`. NGINX spoke HTTP/1.1 to them (B20).
13. **Path normalisation differs.**
    - NGINX matches on a decoded, slash-merged path but forwards the raw URI.
    - Istio resolves dot-segments, including in the path it forwards, but does not merge `//` or decode `%2F` (B25).

---

## 1. Who controls the defaults on each target

| Target | Data plane | What a platform team can change | Source |
|---|---|---|---|
| ingress-nginx, self-managed | NGINX 1.27.1 with OpenResty Lua | Controller ConfigMap keys, Ingress annotations, controller flags, the Service | [IN-CM][IN-ANN][IN-BUILD#L21] |
| ingress-nginx, AKS add-on | Microsoft builds of v1.13.x and v1.15.1 (Microsoft patches not inspected, F2 A.2) | Only `NginxIngressController` (NIC) fields. The operator owns the ConfigMap ("Editing the ingress-nginx `ConfigMap` … isn't supported"). It sets four keys, plus `force-ssl-redirect`, `custom-http-errors` and `log-format-upstream` when the NIC asks for them (`log-format-upstream` also when the operator runs with `--enable-internal-logging`). Service `externalTrafficPolicy: Local` | [ARO-NGINX#L347][ARO-NGINX#L565-L592][F2 C.3] |
| `appRoutingGateway` | Envoy under AKS-managed Istio (in-place upgrades; minor version not published) | The Gateway API fields of the installed CRD bundle, plus allow-listed Service, Deployment, HPA and PDB fields through ConfigMaps. No Istio CRDs, no `EnvoyFilter`, no documented MeshConfig | [F2 B.6–B.8][AKS-ARGW] |
| `istio` (add-on) | Envoy under `asm-1-29`/`asm-1-30`/`asm-1-31` | Gateway API fields. In `istio-shared-configmap-<rev>`: MeshConfig `pathNormalization`, `defaultHttpRetryPolicy`, `tlsDefaults`, and `defaultConfig.gatewayTopology`/`proxyHeaders`, all *Allowed*; `connectionSettings` is *Supported* from `asm-1-31`. `EnvoyFilter` is allowed but unsupported; `DestinationRule` is available | [F4 §5] |
| `agc` / `agcIngress` | Azure-managed data plane (implementation not published) | Gateway API plus AGC CRDs (`RoutePolicy`, `HealthCheckPolicy`, `FrontendTLSPolicy` …), or Ingress plus `IngressExtension` | [F3 §4–5] |

---

## 2. Behaviour table

The table is split into six themed blocks with identical columns. In every block:

- `$H` is the host;
- `$OLD` is the ingress-nginx load balancer IP;
- `$NEW` is the Gateway IP. For AGC, use `dig +short <frontend FQDN>`.

See §4 for the shared test setup.

### 2.1 HTTPS entry

| # | Behaviour | ingress-nginx v1.15.1 default | Envoy via Istio (`appRoutingGateway`, `istio`) | AGC (`agc`, `agcIngress`) | Client-visible impact | Test before cutover |
|---|---|---|---|---|---|---|
| B1 | Automatic HTTP→HTTPS redirect and its status code | **On, 308.**<br>- `ssl-redirect: "true"` [IN-CFG#L873] and `http-redirect-code: 308` [IN-CFG#L800].<br>- Fires when the request came in over HTTP and a certificate is configured for its `Host`.<br>- "Configured" means the host appears in the rules of a non-canary Ingress that has a non-empty `spec.tls`, or a `*.` host with a certificate covers it. The host need not be listed in `spec.tls[].hosts`. When no Secret matches it by `hosts` or by certificate SAN, or the Secret is empty, missing or invalid, the default certificate is assigned and the host still counts [IN-LUA#L65-L79][IN-CERT#L48-L71][IN-CERT#L217-L223][IN-CTRL#L1405-L1407][IN-CTRL#L1448-L1490][IN-CTRL#L1719-L1764][IN-TLSDOC#L44-L48][IN-TLSDOC#L83-L84].<br>- Runs in the Lua rewrite phase of every location. `Location: https://<host><uri>` drops the port and strips a trailing `/` unless `preserve-trailing-slash` is set [IN-LUA#L157-L174][IN-CFG#L872].<br>- `/.well-known/acme-challenge` is exempt through `no-tls-redirect-locations` [IN-CFG#L908][IN-TPL#L444-L455].<br>- `force-ssl-redirect` extends the redirect to hosts without TLS. The AKS add-on sets it when the NIC has `forceSSLRedirect` and a default certificate [ARO-NGINX#L578-L580].<br>- Doc conflict: `configmap.md` says "(301)" [IN-CM#ssl-redirect]; the code, `annotations.md` and `tls.md` say 308 [IN-ANN#L617-L630][IN-TLSDOC#L81-L93]. | **None.**<br>- Istio converts listeners with `HttpsRedirect: false` ("Not yet implemented: … https redirect") [ISTIO-CONV#L2321-L2323].<br>- A redirect needs an HTTPRoute attached with `sectionName` to the HTTP listener and `RequestRedirect{scheme: https}` [F1 §4].<br>- `statusCode` defaults to **302** [HR#L1319]. 308 needs the v1.5.1+ bundle, that is AKS 1.36+ [F2 B.5][F4 4.1].<br>- The generated Service only exposes listener ports (+15021), so a Gateway with no HTTP listener has no port 80 [F2 B.8].<br>- Raw Envoy is the same: redirects only come from route configuration. | **None.**<br>- `agc`: an explicit HTTPRoute on the port-80 listener. Microsoft's sample uses 301 [AGC-REDIR]; 307/308 are available from ALB Controller 1.11.1 [AGC-REL]; 303 is UNVERIFIED [F3 C7].<br>- `agcIngress`: a second Ingress whose `IngressExtension` sets `requestRedirect.scheme: https` [F3 §13]. | - Plain-HTTP requests are served over HTTP, if routed, or refused, instead of getting a 308.<br>- A hand-written redirect returns 302 by default (temporary), or 301, after which some clients turn a POST into a GET.<br>- NGINX also stripped a trailing `/` from the target and exempted ACME challenge paths. | `curl -si -X POST --resolve $H:80:$OLD http://$H/a/b/`: NGINX returns `308` with `location: https://$H/a/b`.<br>Repeat with `$NEW` and compare status and `location`.<br>Repeat for `/.well-known/acme-challenge/x`. |
| B2 | HSTS added by default | **On.**<br>- `hsts: "true"`, `hsts-max-age: 31536000`, `hsts-include-subdomains: "true"`, `hsts-preload: "false"` [IN-CFG#L48][IN-CFG#L801-L804].<br>- `Strict-Transport-Security: max-age=31536000; includeSubDomains` is set in every location's header filter whenever NGINX itself received the request over HTTPS (`$scheme`, not `X-Forwarded-Proto`) [IN-LUA#L178-L189][IN-HDRF][IN-NGXTPL#L1169][IN-TLSDOC#L72-L79].<br>- The condition also names `certificate_configured_for_current_request` but never calls it. That local holds a function [IN-LUA#L4-L5], and every Lua value except `nil` and `false` is true [LUA51#2.2]. The redirect code calls the same function correctly [IN-LUA#L78]. v1.13.9 has the same line [IN-1139].<br>- Derived: the certificate check has no effect. HSTS is also sent for hosts without a `tls` section and for unknown hosts answered by the catch-all server.<br>- It is set by assigning `ngx.header`, so a backend's own HSTS value is presumably replaced (UNVERIFIED). | **None.**<br>- Gateway API has no HSTS field [F1 §2.9].<br>- Add a `ResponseHeaderModifier` that sets `Strict-Transport-Security` on the HTTPS-attached route (Extended; Istio supports it [F2 B.16]). | **Not documented**: the AGC docs mention no HSTS default.<br>- `agc`: `ResponseHeaderModifier`.<br>- `agcIngress`: per-host `ResponseHeaderModifier` in `IngressExtension` [F3 §13]. | - Returning browsers keep the cached policy until max-age expires; new visitors get none.<br>- Scanners flag the missing header.<br>- Backends that send their own HSTS header now decide its value. | `curl -sI --resolve $H:443:$OLD https://$H/ \| grep -i strict-transport` against `$NEW`, on a 200 and on a 404 path. |
| B3 | Default TLS certificate for unknown or missing SNI | **A default certificate is served.**<br>- Unknown or absent SNI gets `--default-ssl-certificate` if set [IN-FLAGS#L118]. Otherwise it gets a self-signed "Kubernetes Ingress Controller Fake Certificate" (SAN `ingress.local`) generated at start-up [IN-CERT#L225-L245][IN-CTRL#L1252-L1265][IN-SSL#L379-L421][IN-TLSDOC#L28-L39].<br>- `ssl-reject-handshake: "false"` [IN-CFG#L834][IN-NGXTPL#L923-L925].<br>- The request then reaches the catch-all server (404, B26).<br>- AKS add-on: NIC `defaultSSLCertificate` [F2 C.2]. | **The handshake is refused** when every HTTPS listener on the port has a hostname.<br>- Each HTTPS listener becomes a filter chain matched on SNI = listener hostname [ISTIO-GW#L657-L700].<br>- Gateway listeners get no default filter chain [ISTIO-LIS#L1096-L1139]. When no chain matches and no default chain is set, "the connection will be closed" [ENVOY-LISTENER].<br>- Exception, derived from source: a listener with no hostname becomes the Istio host `<ns>/*` [ISTIO-CONV#L2606-L2627]. Its SNI list becomes `*` [ISTIO-MODELGW#L562-L577], and a `*` entry drops the server-name match from the filter chain [ISTIO-LIS#L1263-L1277]. That listener then accepts every SNI, and no SNI, with its own certificate. | **Not documented.** | Clients that send no SNI or an unknown name (IP-based probes, scanners, old clients) now get a TLS failure instead of a certificate warning followed by a 404. | `openssl s_client -connect $OLD:443 -servername nohost.invalid </dev/null`, then the same with `-noservername`.<br>Repeat on `$NEW` and compare the handshake result and the certificate subject. |
| B4 | TLS protocol and cipher defaults | - `ssl-protocols: "TLSv1.2 TLSv1.3"`.<br>- `ssl-ciphers` (TLS 1.2 suites): ECDHE-ECDSA/RSA-AES128-GCM-SHA256, ECDHE-ECDSA/RSA-AES256-GCM-SHA384, ECDHE-ECDSA/RSA-CHACHA20-POLY1305, DHE-RSA-AES256-GCM-SHA384, DHE-RSA-AES128-GCM-SHA256, with `ssl_prefer_server_ciphers on`.<br>- `ssl-ecdh-curve: auto`.<br>- Session tickets off; shared session cache 10m with a 10m timeout; early data off.<br>Sources: [IN-CFG#L66-L82][IN-CFG#L829-L838][IN-NGXTPL#L456-L491]. | - Istio sets no TLS parameters unless `meshConfig.tlsDefaults` or server TLS options are set [ISTIO-LIS#L189-L229]. ALPN is `h2,http/1.1` [ISTIO-LIS#L148-L150][ISTIO-UTIL#L122].<br>- Envoy server defaults are TLS 1.2 to 1.3. Cipher order: ECDHE-ECDSA-AES128-GCM-SHA256 *or* ECDHE-ECDSA-CHACHA20-POLY1305 (equal preference), the same pair for RSA, then ECDHE-ECDSA- and ECDHE-RSA-AES256-GCM-SHA384. Curves X25519 and P-256 [ENVOY-TLS]. These are the latest docs for non-FIPS builds. BoringSSL FIPS builds default to P-256 only and to the four AES-GCM suites [ENVOY-TLS]. AKS publishes neither its Envoy build nor whether it is FIPS.<br>- No DHE suites.<br>- Add-on: `tlsDefaults` is Allowed [F4 5.4]. Istio 1.29+ also has the listener option `gateway.istio.io/tls-cipher-suites` [F2 B.16]. | - Policy `2023-06` by default, and always for Ingress.<br>- TLS 1.2 and 1.3.<br>- Suites: TLS_AES_256_GCM_SHA384, TLS_AES_128_GCM_SHA256, ECDHE-ECDSA/RSA AES-128/256-GCM.<br>- Curves P-384 and P-256 only. Anything else "won't be negotiated" [AGC-TLS].<br>- TLS versions are not configurable [AGC-FAQ].<br>- Doc conflict: the TLS policy page also says a "custom TLS policy" can set the minimum version, ciphers and curves. The API defines only the `predefined` type (`2023-06`, `2023-06-S`) [AGC-TLS][AGC-API]; the API was followed. | - Clients that only offer DHE suites fail on Envoy and on AGC.<br>- ChaCha20-only clients fail on AGC.<br>- X25519 is not in AGC's curve list. | Run `testssl.sh` (or `nmap --script ssl-enum-ciphers`) with SNI `$H` against both IPs and diff the protocols, suites and curves. |
| B5 | HTTP/2 to clients | - `use-http2: "true"` gives `http2 on` in every server, negotiated by ALPN on TLS ("support in secure connections") [IN-CFG#L849][IN-NGXTPL#L641-L643][IN-CM#use-http2].<br>- `http2-max-concurrent-streams: 128` [IN-CFG#L799][IN-NGXTPL#L289]. | - ALPN `h2,http/1.1` on HTTPS listeners [ISTIO-LIS#L148-L150].<br>- `codec_type: AUTO`, so the codec is chosen per connection [ISTIO-LB#L318-L322][ENVOY-HCM].<br>- Maximum concurrent streams is the Envoy default, 1024 in the latest docs [ENVOY-PROTO]. | HTTP/2 is "always enabled and can't be changed"; HTTP/1.1 is still negotiable [AGC-COMP]. | - Little for browsers.<br>- Clients that open more than 128 streams per connection are no longer capped at 128 on Envoy. | `curl -s -o /dev/null -w '%{http_version}\n' --http2 --resolve $H:443:<ip> https://$H/` on both.<br>NGINX's handling of plaintext h2c was not verified here; also test `curl --http2-prior-knowledge http://$H/` if clients use it. |
| B6 | HTTP/1.0 clients (added row) | Accepted. No ingress-nginx ConfigMap key or annotation restricts the HTTP version [IN-CM][IN-ANN]. | **Rejected with 426 Upgrade Required.**<br>- `accept_http_10` is set only when istiod runs with `PILOT_HTTP10=true` (default false) or the proxy carries metadata `HTTP10=1` [ISTIO-GW#L707-L710][ISTIO-PILOT#L30-L35][ISTIO-LIS#L260-L262].<br>- Otherwise Envoy answers 426 [ENVOY-H1#L1180-L1192]. In Envoy, HTTP/1.0 support "is off by default" [ENVOY-PROTO].<br>- Neither switch is documented on AKS. The add-on allows `defaultConfig.proxyMetadata` [AKS-MESHCFG]; whether `HTTP10` metadata set there reaches the gateways is UNVERIFIED. | **Not documented.** | Legacy HTTP/1.0 clients and probes break. | `curl -0 -si --resolve $H:80:$OLD http://$H/`, then the same against `$NEW`. |

### 2.2 Request limits, header handling and buffering

| # | Behaviour | ingress-nginx v1.15.1 default | Envoy via Istio (`appRoutingGateway`, `istio`) | AGC (`agc`, `agcIngress`) | Client-visible impact | Test before cutover |
|---|---|---|---|---|---|---|
| B7 | Request body size limit and the status returned | **1 MiB, then 413.**<br>- `proxy-body-size: 1m` becomes `client_max_body_size 1m` in every location [IN-CFG#L37][IN-CFG#L857][IN-NGXTPL#L1270-L1276].<br>- Above it, NGINX returns 413 "Request Entity Too Large" as an HTML page [NGX-CORE#client_max_body_size][NGX-SPEC-C#L196-L201][IN-ANN#L697-L706].<br>- Per Ingress: `nginx.ingress.kubernetes.io/proxy-body-size`. | **No limit.**<br>- There is no buffer filter in the default gateway filter chain [ISTIO-LB#L394-L458].<br>- App routing: "You can't configure request header and body size limits" [AKS-ARGW].<br>- Add-on: only an `EnvoyFilter` with Envoy's buffer filter (`max_request_bytes`, 413). That filter "holds the full request body in memory" and "doesn't spill to disk" [AKS-ARGW]. Allowed, not supported [F4 §8]. | **Not documented.**<br>- No body-size setting appears in the AGC API or docs.<br>- The WAF request-size limits are documented for Application Gateway WAF and are not stated to apply to AGC [WAF-SIZE][F3 §13]. | - Uploads over 1 MiB that the edge used to reject now reach backends.<br>- Clients that relied on a 413 from the edge now see whatever the backend does. | `head -c 2097152 /dev/urandom > /tmp/2m`<br>`curl -s -o /dev/null -w '%{http_code}\n' --resolve $H:443:<ip> --data-binary @/tmp/2m https://$H/<path>`<br>NGINX returns 413. |
| B8 | Maximum request header size and count | - `client-header-buffer-size: 1k` and `large-client-header-buffers: "4 8k"` [IN-CFG#L782][IN-CFG#L811][IN-NGXTPL#L270-L272].<br>- A request line over 8 KiB gives 414. One header field over 8 KiB gives 400, with a "Request Header Or Cookie Too Large" page [NGX-CORE#large_client_header_buffers][NGX-SPEC-C#L244-L250].<br>- Derived: the whole header must fit in four 8 KiB buffers.<br>- No header-count limit is documented.<br>- `http2_max_field_size` and `http2_max_header_size` are only written when both keys are set; both are empty by default [IN-NGXTPL#L280-L283].<br>- Both directives have been obsolete since NGINX 1.19.7; "the `large_client_header_buffers` directive should be used instead" [NGX-V2]. | - `max_request_headers_kb` is 60 KiB and `max_headers_count` is 100. These are Envoy defaults; the Istio HCM builders inspected set neither [ISTIO-LB][ISTIO-GW].<br>- Over the limit: 431 on HTTP/1. More than 100 headers on HTTP/2 resets the stream [ENVOY-HCM][ENVOY-PROTO][ENVOY-H1#L574-L576][ENVOY-H1#L606-L615].<br>- App routing: not configurable [AKS-ARGW]. | **Not documented.** Access logs only report `requestHeaderBytes` [AGC-DIAG]. | - Single headers of 8 to 60 KiB (large cookies, JWTs) now pass instead of failing with 400.<br>- Requests with more than 100 header fields now fail with 431, or a reset on HTTP/2. | `curl -s -o /dev/null -w '%{http_code}\n' -H "Cookie: a=$(head -c 12000 /dev/zero \| tr '\0' a)" https://$H/`: NGINX 400, Envoy 200.<br>Then send 101 `-H "X-Tn: 1"` headers: Envoy 431. |
| B9 | Headers with underscores | **Silently dropped.**<br>- `enable-underscores-in-headers: "false"` and `ignore-invalid-headers: "true"` give `underscores_in_headers off; ignore_invalid_headers on;` [IN-CFG#L786][IN-CFG#L805][IN-NGXTPL#L302-L303].<br>- Such fields are "marked as invalid" and ignored [NGX-CORE#underscores_in_headers]. | **Forwarded.**<br>- `headers_with_underscores_action` defaults to `ALLOW` [ENVOY-PROTO].<br>- Istio only changes it through the opt-in 1.31 `connectionSettings` EDGE profile, which sets `REJECT_REQUEST` [ISTIO-CS#L33-L81].<br>- Envoy's own example for untrusted downstreams uses `REJECT_REQUEST` [ENVOY-HCM]. | **Not documented.** | - Backends start receiving fields such as `X_Api_Key` that NGINX never forwarded.<br>- Frameworks that treat `-` and `_` as the same character can confuse them with headers the proxy sets. | `curl -s -H 'X_Probe_Underscore: 1' https://$H/echo`: the header is absent behind NGINX and present behind Envoy. |
| B10 | Header-name case (added row) | **Preserved.**<br>- The proxy module copies each client header name byte for byte [NGX-PROXY-C#L1505-L1535].<br>- Headers that the template adds keep the template's spelling (`X-Real-IP` …) [IN-NGXTPL#L1303-L1320]. | **Lower-cased.**<br>- The HTTP/1 codec lower-cases names on receipt [ENVOY-H1#L568]. "By default, all header keys are lower cased" [ENVOY-PROTO].<br>- Istio preserves case only with ProxyConfig `proxyHeaders.preserveHttp1HeaderCase`, default false [ISTIO-CB#L787-L790]. `proxyHeaders` is Allowed on the add-on [F4 5.5]; app routing has no documented lever. | **Not documented.** AGC's own HTTP/1.1 responses in Microsoft's samples use lower-case names (`location`, `server`) [AGC-REDIR]. | Code that compares header names case-sensitively breaks. HTTP field names are case-insensitive [RFC9110#5.1], so only non-compliant code is affected. | Send `X-MiXeD-Case: 1` over HTTP/1.1 to a backend that logs raw header bytes.<br>Inspect the response spelling with `curl --http1.1 -sv`. |
| B11 | Request and response buffering | **Requests buffered, responses streamed.**<br>- `proxy-request-buffering: "on"`: "the entire request body is read from the client before sending the request" upstream. `client-body-buffer-size` is 8k.<br>- `proxy-buffering: "off"`: the response is passed to the client "immediately as it is received".<br>Sources: [IN-CFG#L869][IN-CFG#L882][IN-CFG#L784][IN-NGXTPL#L1337-L1346][NGX-PROXY#proxy_request_buffering][NGX-PROXY#proxy_buffering]. | **Both streamed.**<br>- The default gateway filter chain has no buffer filter [ISTIO-LB#L394-L458].<br>- Derived: Envoy therefore forwards the body as it arrives. The AKS page only says that the buffer filter, when added, holds the full body in memory [AKS-ARGW].<br>- Not changeable on app routing; `EnvoyFilter` on the add-on. | **Not documented.** | - Backends receive headers immediately and read slow uploads themselves, so a worker is held for the whole upload and backend body-read timeouts can fire.<br>- Response streaming is the same as NGINX's default. | Make a 900 KB body with `head -c 921600 /dev/urandom > /tmp/900k`, then:<br>`curl --limit-rate 20k --data-binary @/tmp/900k https://$H/<upload>`<br>Compare when the backend logs the request start against when the body completes. |
| B12 | Response header size from the backend (added row) | **4 KiB, then 502.**<br>- The response header must fit in `proxy-buffer-size: 4k` [IN-CFG#L862][IN-NGXTPL#L1338].<br>- Otherwise NGINX logs "upstream sent too big header" and treats it as an invalid header [NGX-UPS-C#L2478-L2484], which maps to 502 [NGX-UPS-C#L4403-L4404]. | Envoy limits (version-dependent) [ENVOY-PROTO]:<br>- `max_response_headers_kb` is 60 KiB, or 80 KiB for HTTP/1 in the latest docs.<br>- At most 100 response headers (the `max_headers_count` default).<br>- Derived from v1.36.0 source: on an HTTP/1 upstream, either overflow is a codec protocol error. The connection is closed, the stream is reset with `ProtocolError`, and the router answers **502** [ENVOY-H1#L574-L582][ENVOY-H1#L607-L616][ENVOY-CC][ENVOY-ROUTER-C#L1535-L1537]. | **Not documented.** | Responses with large header sets (big `Set-Cookie` or CSP) that NGINX failed with 502 now succeed. Above Envoy's limits they still fail with 502. | A backend endpoint that returns about 6 KiB of response headers: NGINX 502, Envoy 200. |

### 2.3 Client identity and forwarded headers

| # | Behaviour | ingress-nginx v1.15.1 default | Envoy via Istio (`appRoutingGateway`, `istio`) | AGC (`agc`, `agcIngress`) | Client-visible impact | Test before cutover |
|---|---|---|---|---|---|---|
| B13 | Client source IP preservation | **Depends on how ingress-nginx was installed.**<br>- AKS add-on: Service `externalTrafficPolicy: Local` [ARO-NGINX#L347]. Verified at operator v0.2.27; newer builds are unpublished.<br>- Upstream manifest documented for Azure (`deploy/static/provider/cloud`): `Local` [IN-STATIC#L347][IN-DEPLOYDOC#L354-L358].<br>- Upstream Helm chart: `externalTrafficPolicy: ""`, which is the Kubernetes default `Cluster`. The chart says to set `Local` "to preserve source IP" [IN-CHART#L530-L532][K8S-CORE][K8S-SRCIP].<br>- With `Local`, `$remote_addr`, which is what B14 forwards, is the client's address. | **Node IP by default.**<br>- AKS generates the Gateway Service with the "default `externalTrafficPolicy` setting of 'Cluster'" and adds port-80 health-probe annotations for it [AKS-ARGW][AKS-ISTGW].<br>- `Local` is allow-listed but needs the `port_80_health-probe_*` annotations unset [F2 B.8][F4 6.2].<br>- Source-IP preservation is tied to `Local` [IN-CHART#L530-L531][K8S-SRCIP]. | **Only in X-Forwarded-For.**<br>- Pods see AGC as the TCP peer.<br>- The client IP is in `x-forwarded-for` and in the access-log field `clientIp` [AGC-COMP][AGC-DIAG].<br>- SNAT in front of AGC hides it [F3 §7.2]. | Moving from the AKS add-on (`Local`) to the app routing or Istio default (`Cluster`) makes every request look as if it came from a node IP. Logs, IP allow-lists, per-IP rate limits, geo-IP and Istio `ipBlocks` all change [F4 6.2]. | `kubectl get svc -A -o custom-columns=NS:.metadata.namespace,NAME:.metadata.name,ETP:.spec.externalTrafficPolicy` for the NGINX and Gateway Services.<br>From a known public IP, `curl -s https://$H/echo`, then compare XFF, `X-Real-IP` and `x-envoy-external-address` with your own IP. |
| B14 | X-Forwarded-For, X-Real-IP and trusted proxies | **Replaced, not appended.**<br>- `use-forwarded-headers: "false"`, `compute-full-forwarded-for: "false"`, `enable-real-ip: "false"`, so `proxy-real-ip-cidr: 0.0.0.0/0` is unused [IN-CFG#L788-L793][IN-CFG#L821][IN-NGXTPL#L77-L92].<br>- Upstream gets `X-Real-IP: $remote_addr` and `X-Forwarded-For: $remote_addr`. The client's XFF moves to `X-Original-Forwarded-For` [IN-NGXTPL#L1303-L1320].<br>- Incoming `X-Forwarded-Proto/Host/Port` are ignored: "NGINX ignores incoming `X-Forwarded-*` headers" [IN-LUA#L122-L140][IN-CM#use-forwarded-headers]. | **Appended.**<br>- The gateway HCM has `use_remote_address: true`, and `xff_num_trusted_hops` = `gatewayTopology.numTrustedProxies`, default 0 [ISTIO-GW#L657-L700][ISTIO-GW#L711-L723][ISTIO-MESHCFG].<br>- Envoy appends the TCP peer to the incoming XFF and sets `x-envoy-external-address` [ENVOY-HDR].<br>- Raw Envoy differs: `use_remote_address` is false, and XFF is left alone ("transparent mode") [ENVOY-HCM][ENVOY-HDR].<br>- Envoy neither sets nor mentions `X-Real-IP` [ENVOY-HDR], so a client-sent value presumably passes through (UNVERIFIED).<br>- `numTrustedProxies` is Allowed on the add-on [F4 6.2]; app routing has no documented lever. | **Appended.**<br>- `x-forwarded-for` carries the client IP, and behind proxies "the header value appends the address it receives" [AGC-COMP].<br>- `X-Real-IP` is not in the documented list.<br>- No trusted-proxy setting is documented.<br>- WAF custom rules can't use XFF [AGC-WAF]. | - Apps that read `X-Real-IP` lose it, or read a forged value.<br>- Apps that take the left-most XFF entry become spoofable. | `curl -s -H 'X-Forwarded-For: 203.0.113.7' -H 'X-Real-IP: 203.0.113.8' https://$H/echo` on both; diff what the echo backend received. |
| B15 | Other forwarded headers and request ID (added row) | - Always sets `X-Forwarded-Host` (the Host), `X-Forwarded-Port` (80/443), `X-Forwarded-Proto`, `X-Forwarded-Scheme` and `X-Scheme`, and clears `Proxy` (httpoxy) [IN-NGXTPL#L1310-L1326].<br>- `X-Request-ID` keeps the client's value or generates one (`generate-request-id: "true"`) [IN-NGXTPL#L392-L397][IN-NGXTPL#L1303][IN-CFG#L795]. | - `x-forwarded-proto` is set from the downstream connection; an incoming value is untrusted with 0 hops [ENVOY-HDR].<br>- No `x-forwarded-host` or `x-forwarded-port` unless `proxyHeaders.xForwardedHost/xForwardedPort` [ISTIO-PH#L49-L58][ISTIO-LB#L337].<br>- `x-request-id` is replaced with a new UUID on external requests: `use_remote_address` is true and `preserve_external_request_id` is unset, so false [ENVOY-HDR][ENVOY-HCM][ISTIO-GW#L722-L731].<br>- Since Envoy 1.33 no address counts as internal unless configured, and Istio configures internal addresses only with MeshNetworks [ISTIO-GW#L749-L755]; AKS's MeshNetworks setting is unknown (UNVERIFIED).<br>- Adds `x-envoy-attempt-count` upstream; Envoy's own default is off [ISTIO-PH#L53][ISTIO-GW#L506][ISTIO-GW#L530][ENVOY-RC].<br>- `x-forwarded-client-cert` is sanitized (`SANITIZE_SET`) [ISTIO-GW#L714].<br>- What happens to `Proxy` is not documented (UNVERIFIED). | - Inserts only `x-forwarded-for`, `x-forwarded-proto` and `x-request-id`, a GUID it "generates for each client request" [AGC-COMP].<br>- The access-log `trackingId` "correlates to the x-request-id header returned to the client" [AGC-DIAG].<br>- Whether a client-supplied ID survives is not documented. | - Apps that build absolute URLs or redirects from `X-Forwarded-Host/Port` produce wrong links.<br>- Request IDs set upstream (CDN, caller) are replaced: verified on Istio, likely on AGC. | `curl -s -H 'X-Request-ID: probe-123' https://$H/echo`; compare `X-Forwarded-Host/Port/Proto` and `X-Request-ID` on both. |

### 2.4 Timeouts, retries and connections

| # | Behaviour | ingress-nginx v1.15.1 default | Envoy via Istio (`appRoutingGateway`, `istio`) | AGC (`agc`, `agcIngress`) | Client-visible impact | Test before cutover |
|---|---|---|---|---|---|---|
| B16 | Connect, read and send timeouts versus route and idle timeouts | - `proxy-connect-timeout: 5`, `proxy-send-timeout: 60` and `proxy-read-timeout: 60`, all in seconds [IN-CFG#L858-L860][IN-NGXTPL#L1333-L1335].<br>- Read and send are inactivity timers: each is set "only between two successive read operations" (or write operations), not for the whole response or request [NGX-PROXY].<br>- Client side: `client-header-timeout: 60`, `client-body-timeout: 60`, `keep-alive: 75` [IN-CFG#L783][IN-CFG#L785][IN-CFG#L809][IN-NGXTPL#L263-L274].<br>- Derived: there is no total request deadline.<br>- On expiry: 504 (B29), possibly after retries (B17). | - **Route timeout disabled (0)** unless HTTPRoute `timeouts.request` is set [ISTIO-ROUTE#L71][ISTIO-ROUTE#L1363-L1366].<br>- **Stream idle timeout disabled:** Istio sets 0; Envoy's default is 5 min [ISTIO-LB#L371][ENVOY-HCM].<br>- `request_timeout` and `request_headers_timeout` are disabled (Envoy defaults) [ENVOY-HCM].<br>- Connection idle timeout: 1 h [ENVOY-PROTO].<br>- Upstream connect timeout: 10 s (`meshConfig.connectTimeout`) [ISTIO-MESH#L94][ISTIO-MESHCFG].<br>- `timeouts.request` becomes the route timeout, which "includes all retries" [ENVOY-RC].<br>- With no `retry` stanza, which is always the case on AKS bundles, `timeouts.backendRequest` *also* becomes the route timeout and overrides `request` [ISTIO-CONV#L210-L226].<br>- Gateway API has no inactivity timeout [F1 §2.9].<br>- Raw Envoy differs: a 15 s route timeout and a 5 min stream idle timeout [ENVOY-RC][ENVOY-HCM].<br>- Istio 1.31's opt-in EDGE profile sets a 5 min request timeout, 5 min stream idle and 60 s for headers [ISTIO-CS#L33-L81]. | - **Request timeout: 60 s total**, enforced "irrespective if data is actively streaming".<br>- HTTP idle: 5 min. Stream idle: 5 min. Upstream connect: 5 s.<br>- Precedence: HTTPRoute `timeouts`, then `RoutePolicy.routeTimeout`, then the defaults.<br>- `agcIngress`: `IngressExtension` `timeouts.requestTimeout`.<br>Sources: [AGC-COMP][F3 §8]. | - A backend that sends nothing for more than 60 s: NGINX returns 504; Istio waits indefinitely, until the client or the Azure LB gives up; AGC stops at 60 s.<br>- Long downloads or SSE that keep sending data: fine on NGINX and Istio, cut at 60 s on AGC. | Use two probe endpoints, `/sleep?s=75` (first byte after 75 s) and `/drip?every=10&for=150`.<br>Record status and elapsed time on both. |
| B17 | Retries | - `proxy-next-upstream: "error timeout"`, `proxy-next-upstream-tries: 3`, `proxy-next-upstream-timeout: 0` (no limit), `retry-non-idempotent: false` [IN-CFG#L866-L868][IN-CFG#L217-L219][IN-TPL#L977-L1007][IN-NGXTPL#L1352-L1355].<br>- `error` and `timeout` cover connecting, sending the request and reading the response header.<br>- POST, LOCK and PATCH are not retried once sent.<br>- Nothing is retried once a byte has reached the client [NGX-PROXY#proxy_next_upstream][NGX-UPS-C#L4416-L4426].<br>- A failure on a reused keep-alive connection gets an extra try [NGX-UPS-C#L4366-L4369].<br>- No retries on status codes.<br>- The Lua balancer picks an endpoint for each try and calls `set_more_tries(1)` [IN-BAL#L337-L360]. lua-resty-core caps the total tries of a request at `proxy_next_upstream_tries` [LRC-BAL].<br>- Whether the extra try after a failed reused keep-alive connection can exceed that cap under `balancer_by_lua` is UNVERIFIED. | - Every HTTPRoute rule without `retry` gets the mesh default. On AKS bundles that is every rule [F2 B.5][F4 4.1].<br>- Upstream default: `num_retries: 2`; `retry_on: connect-failure,refused-stream,unavailable,cancelled,retriable-status-codes` with **no status codes listed**; retry on a different host (`previous_hosts`); 5 host-selection attempts [ISTIO-RETRY#L35-L50][ISTIO-RETRY#L96-L103][ISTIO-ROUTE#L646-L650][ISTIO-ROUTE#L696][ISTIO-MESHCFG].<br>- Derived from `retry.go`: the policy has no HTTP-method condition.<br>- 503 was already excluded by default in 1.26 (`EXCLUDE_UNSAFE_503_FROM_DEFAULT_RETRY=true`) and was removed from the code in 1.27 [ISTIO-RETRY-126#L45-L55][ISTIO-PILOT126#L258-L259][ISTIO-RETRY-128#L44-L51].<br>- Add-on: `defaultHttpRetryPolicy` is Allowed [F4 5.4]. App routing has no documented lever.<br>- Raw Envoy differs: routes have no retry policy unless one is configured [ENVOY-RC]. | "Automatic retries" is listed as a feature, but the conditions and count are undocumented and not configurable. The "Backend Connection Timeouts" metric includes AGC-initiated retries [AGC-OV][AGC-METRICS][F3 §8]. | - Derived: a hung idempotent request could take up to 3 × 60 s before NGINX returns 504.<br>- On Istio there is no retry on timeouts or resets, so a pod that dies mid-request surfaces as a 503.<br>- Istio retries connection failures for every method, which is safe because the request was never sent. | Count backend hits per client request in the echo logs for:<br>(1) a GET to an endpoint that never answers;<br>(2) a POST to a pod that resets the connection;<br>(3) a request while one of two pods refuses connections. |
| B18 | Upstream keepalive (and client idle) | - Upstream: `upstream-keepalive-connections: 320` idle connections per worker, `upstream-keepalive-timeout: 60` s, `upstream-keepalive-requests: 10000`, `upstream-keepalive-time: 1h` [IN-CFG#L888-L891][IN-NGXTPL#L533-L539].<br>- Client: `keep-alive: 75` s and `keep-alive-requests: 1000` [IN-CFG#L809-L810][IN-NGXTPL#L263-L264]. | - Upstream pooling is always on. Idle timeout 1 h, no request cap, no maximum duration (Envoy `HttpProtocolOptions` defaults) [ENVOY-PROTO].<br>- Istio sets an explicit idle timeout (5 min) only on passthrough clusters [ISTIO-CB#L59-L86].<br>- Its traffic-policy code sets a cluster idle timeout only from a `DestinationRule` `connectionPool.http.idleTimeout` (or `tcp.idleTimeout`) [ISTIO-CTP#L132-L201]. All other clusters keep Envoy's 1 h.<br>- Client connections: 1 h idle (Envoy default). Istio overrides it only from proxy metadata [ISTIO-LB#L365-L369][ENVOY-PROTO].<br>- In front of the gateway, the Azure LB TCP idle timeout defaults to 4 min, with TCP reset enabled [CPA-LB]. | - Client "HTTP Idle Timeout" is 5 min [AGC-COMP].<br>- Upstream pooling is not documented. | - Idle client connections are no longer closed by the proxy after 75 s. On the Istio targets the Azure LB resets them after 4 idle minutes instead.<br>- NGINX quietly re-tried requests that failed on a stale upstream connection. Istio's default `retry_on` has no `reset`, so backends with short keep-alive timeouts can produce occasional 503s. Whether those failures count as `connect-failure` is UNVERIFIED. | - Run a backend with a 1 s keep-alive timeout at about one request every 2 s per pod for 10 min, and count 502/503 responses.<br>- Run a client that idles 5 min and then reuses its connection. |
| B19 | WebSocket and HTTP upgrade | **Works by default.**<br>- `Upgrade` and `Connection` are forwarded on every location through `map $http_upgrade $connection_upgrade` [IN-NGXTPL#L380-L388][IN-NGXTPL#L1295-L1301].<br>- "No special configuration required". Idle connections close after `proxy-read-timeout`/`proxy-send-timeout` (60 s) [IN-MISC#L38-L42].<br>- Derived from the template: any `Upgrade` token is forwarded. | **Works by default, and the gateway never times out an idle socket.**<br>- Every gateway HCM enables the `websocket` upgrade type, and only that one [ISTIO-LB#L361-L363].<br>- The route timeout and stream idle timeout are both 0 [ISTIO-ROUTE#L1363-L1366][ISTIO-LB#L371], so the Azure LB 4-min idle reset becomes the limit [CPA-LB].<br>- Other `Upgrade` tokens are not enabled; how Envoy treats them is not covered by the sources read (UNVERIFIED).<br>- Raw Envoy needs `upgrade_configs` [ENVOY-HCM]. | - `agc`: works without configuration. Rewrites stop applying after the upgrade, and the default HTTP probe can mark WebSocket backends unhealthy, so use a `HealthCheckPolicy` [AGC-WS].<br>- Idle timeouts are 5 min [AGC-COMP]. Whether the 60 s request timeout applies after the upgrade is UNVERIFIED.<br>- `agcIngress`: "WebSockets are only supported when using Gateway API" [AGC-WS]. | - Sockets that NGINX closed after 60 s idle now last about 4 min on Istio (until the Azure LB resets them), or 5 min (possibly 60 s) on AGC.<br>- WebSockets break completely on `agcIngress`. | Connect with a WebSocket client (for example `websocat`), stay idle for 70 s, 250 s and 310 s, then send. Record the close code and time on both. |
| B20 | HTTP/2 and protocol to backends | - HTTP/1.1 to every backend (`proxy-http-version: "1.1"`), except `backend-protocol: GRPC`/`GRPCS`, which uses `grpc_pass` over HTTP/2.<br>- Service port names and `appProtocol` play no part.<br>Sources: [IN-CFG#L883][IN-TPL#L716-L794][IN-NGXTPL#L1347]. | - The protocol comes from the Service port: `appProtocol` if set, otherwise the port name.<br>- HTTP/2 is used for `kubernetes.io/h2c`, or for a value whose prefix before `-` is `http2`, `grpc` or `grpc-web`. Anything else is HTTP/1.1.<br>- Gateways never copy the client's protocol ("use_downstream_protocol should be disabled for gateway").<br>Sources: [ISTIO-KCONV#L48-L95][ISTIO-CB#L804-L841]. | "always via HTTP/1.1, except for gRPC, which uses HTTP/2" [AGC-COMP]. | On Istio, Services whose ports are named `http2-*`/`grpc-*`, or carry `appProtocol: kubernetes.io/h2c`, but actually speak HTTP/1.1 start failing. Nothing changes on AGC. | List Service port names and `appProtocol` values from the inventory, then hit one route per such port through `$NEW`. |

### 2.5 Routing and matching

| # | Behaviour | ingress-nginx v1.15.1 default | Envoy via Istio (`appRoutingGateway`, `istio`) | AGC (`agc`, `agcIngress`) | Client-visible impact | Test before cutover |
|---|---|---|---|---|---|---|
| B21 | Trailing slash and prefix semantics | - `Prefix /foo` becomes `location /foo/` plus `location = /foo`, which matches element by element [IN-LOC#L34-L99].<br>- `Prefix /foo/` becomes `location /foo/` plus `= /foo/`. Derived: a request for `/foo` therefore gets NGINX's automatic 301 to `/foo/`, which applies to a prefix location ending in `/` that uses `proxy_pass` [IN-LOC#L34-L99][NGX-CORE#location].<br>- `Exact` becomes `location = /foo`.<br>- Non-regex `ImplementationSpecific` becomes a plain `location /foo`, a character prefix that also matches `/foobar` [IN-TPL#L523-L539]. | - A `PathPrefix` value has its trailing `/` trimmed and becomes Envoy `path_separated_prefix`: `/foo` matches `/foo`, `/foo/` and `/foo/x`, but not `/foobar`.<br>- `Exact` becomes an exact path.<br>- No redirect.<br>Sources: [ISTIO-CONV#L1596-L1626][ISTIO-ROUTE#L1086-L1142][ENVOY-RC][HR#L522-L539].<br>- Gateway API has no `ImplementationSpecific`; ingress2gateway maps it to `PathPrefix` [F6]. | - `agc`: Gateway API `Exact` and `PathPrefix`; Core conformance passed at v1.2.1 [F3 §3].<br>- `agcIngress`: only `Prefix` appears in the docs; `Exact` and `ImplementationSpecific` behaviour is undocumented [F3 §13]. | - `/foo` is no longer 301-redirected to `/foo/`, so relative links in pages can resolve differently.<br>- `/foobar` is no longer served by an `ImplementationSpecific` `/foo` path. | For each Ingress path P, request P, P/, P+"x" and P/x on both. Compare status, `location` and the pod that answered. |
| B22 | Regex dialect, anchoring and case sensitivity | - If any Ingress on a host sets `use-regex: "true"`, or a `rewrite-target` that differs from its path, **every** location of that host becomes `location ~* "^<path>"`. That includes Exact and Prefix paths from other Ingresses.<br>- The result is PCRE, **case-insensitive**, and anchored at the start only [IN-TPL#L497-L539][IN-NGXTPL#L987-L989][F1 §3.2].<br>- Rewrites use `rewrite "(?i)<path>" <target> break` [IN-TPL#L780-L790]. | - `RegularExpression` becomes Envoy `safe_regex` (RE2). "The entire path (without the query string) must match", case-sensitively [ISTIO-CONV#L1618-L1621][ISTIO-ROUTE#L1131-L1137][ENVOY-RC].<br>- Every path match is generated with `case_sensitive: true` [ISTIO-ROUTE#L1142].<br>- Exact and PathPrefix are literal and case-sensitive [HR#L522-L549]. | - `agc`: RE2 syntax for path, header and query regexes [AGC-ROUTING]. Anchoring and case handling are undocumented.<br>- `agcIngress`: no regex mechanism is documented [F3 §13]. | - `/API/v1` stops matching `/api…`.<br>- A pattern like `/api/v[0-9]+` matched `/api/v1/users` on NGINX, but only matches `/api/v1` on Envoy unless `.*` is appended.<br>- Exact paths that silently became case-insensitive prefixes on regex hosts become exact again. | For each regex host in the inventory, send upper-case variants, longer paths and extra trailing segments to both. Diff status and the pod that answered. |
| B23 | Precedence of overlapping rules | - Locations are sorted by path length, longest first [IN-CTRL#L997-L1003].<br>- NGINX picks an exact (`=`) match, otherwise the longest prefix. On regex hosts the first matching regex, in that length order, wins [NGX-CORE#location][F1 §3.2].<br>- When several Ingresses have the same host, path and pathType, the oldest wins (ties go to the descending `namespace/name`). The others are dropped, and this is only logged at verbosity `--v=3` [IN-STORE#L1102-L1116][IN-CTRL#L812-L836]. | - HTTPRoutes for the same Gateway and hostname are merged, ordered by creation time, then namespace, then name.<br>- They are then stable-sorted: Exact > PathPrefix > RegularExpression, then longer value, then method match, then more header matches, then more query matches [ISTIO-RC#L820-L883][ISTIO-CONV#L85-L95][ISTIO-CONV#L462-L530].<br>- Derived: **a `PathPrefix /` rule without header or query matches sorts before every regex rule on that host and shadows it.**<br>- Istio also stops generating routes at the first such catch-all route [ISTIO-ROUTE#L414-L436], so the regex rules are not even sent to Envoy. Catch-all routes are moved to the end of the virtual host afterwards [ISTIO-GW#L549-L552][ISTIO-ROUTE#L1646-L1676], which does not bring the dropped rules back. | - Exact and PathPrefix follow the Gateway API order; Core conformance passed at v1.2.1 [F1 §3.1][F3 §3].<br>- Regex precedence is undocumented. | - Overlapping paths can land on a different backend.<br>- On Istio, regex rules on a host that also has a `/` rule never match. | Generate probes from every (host, path) pair in the inventory, send them to both, and compare the pod name the echo backend returns. |
| B24 | Wildcard hosts | - `*.example.com` becomes `server_name ~^(?<subdomain>[\w-]+)\.example\.com$`: exactly one label [IN-TPL#L1686-L1695].<br>- This matches the Ingress docs ("matches only a single label") [IN-PATH#L6]. | - `*.example.com` matches `a.example.com` and `a.b.example.com`, but not `example.com` [HR#L89-L91][F1 §3.1].<br>- Envoy virtual hosts use suffix wildcards [ENVOY-RC]. | **Not documented.** The release notes for 1.4.12 only mention a "Wildcard hostname fix" [AGC-REL]. | Deeper names (`a.b.example.com`) that hit NGINX's default backend (404) now reach the wildcard route. They usually fail the wildcard certificate anyway. | `curl -sk --resolve a.b.example.com:443:<ip> https://a.b.example.com/` on both. |
| B25 | Duplicate-slash and percent-encoding normalisation | - Matching uses NGINX's normalized URI: `%XX` is decoded (including `%2F`), `.` and `..` are resolved, and adjacent slashes are merged. `merge_slashes` is on by default and the template doesn't change it [NGX-CORE#location][NGX-CORE#merge_slashes].<br>- The backend receives the **original** URI, because `proxy_pass` has no URI part [IN-TPL#L773-L777][NGX-PROXY#proxy_pass].<br>- With `rewrite-target`, the rewritten, normalized URI is sent [IN-TPL#L780-L790][NGX-PROXY#proxy_pass]. | - `pathNormalization` defaults to BASE: `normalize_path: true` (RFC 3986, so `/a/../b` becomes `/b`), `merge_slashes: false`, `path_with_escaped_slashes_action: KEEP_UNCHANGED` [ISTIO-LB#L339-L353][ISTIO-MESHCFG].<br>- Normalization also rewrites the path sent upstream, and malformed paths get 400 [ENVOY-HCM].<br>- Raw Envoy differs: no normalization by default [ENVOY-HCM].<br>- Add-on: `pathNormalization` is Allowed [F4 5.4].<br>- Istio 1.31's opt-in EDGE profile adds slash merging and `UNESCAPE_AND_REDIRECT` [ISTIO-CS#L33-L81]. | **Not documented.** | - `//api/x` matched the `/api` routes on NGINX but does not on Istio.<br>- `/api%2Fx` matched `/api/` on NGINX but does not on Istio.<br>- On Istio, backends receive paths with dot-segments resolved, where NGINX forwarded the raw path. | `curl --path-as-is -s https://$H//api/x`, then `…/api%2Fx` and `…/x/../api/x`, on both. Compare status and the path the echo backend saw. |
| B26 | 404 and default backend for unknown hosts | - A catch-all server `_` (`default_server`) takes unknown hosts, and every host gets a root location for unmatched paths. Both go to the default backend [IN-CTRL#L1266-L1318].<br>- Without `--default-backend-service` [IN-FLAGS#L62], that backend is an internal server on `127.0.0.1:8181` that returns `404` with NGINX's HTML page [IN-CTRL#L598-L631][IN-NGINXGO#L448-L454][IN-FLAGS#L198][IN-NGXTPL#L668-L680][IN-DEFBE#L1-L9].<br>- AKS add-on: NIC `defaultBackendService` [F2 C.2]. | - No catch-all. When no route matches, Envoy returns 404 with an **empty body**; "no route match" only appears in Envoy's debug log [ENVOY-ROUTER-C#L468-L479]. Gateway API requires the 404 [F1 §3.1].<br>- A "default backend" has to be an explicit `PathPrefix /` route on a listener with no hostname [F2 B.16][F4 §8]. | - Unknown-host behaviour is not documented. Gateway API requires 404, but this is UNVERIFIED on AGC.<br>- Microsoft's migration utility marks `default-backend` as unsupported [F3 §12]. | An HTML 404, or a branded default backend, becomes an empty 404. Synthetic monitors that match body text will change. | `curl -sk --resolve nohost.invalid:443:<ip> https://nohost.invalid/`, then `curl -s http://<ip>/`. Compare status, `Content-Type` and body. |

### 2.6 Responses and errors

| # | Behaviour | ingress-nginx v1.15.1 default | Envoy via Istio (`appRoutingGateway`, `istio`) | AGC (`agc`, `agcIngress`) | Client-visible impact | Test before cutover |
|---|---|---|---|---|---|---|
| B27 | Compression | **Off.**<br>- `use-gzip: "false"` and `enable-brotli: "false"` [IN-CFG#L839][IN-CFG#L841].<br>- When enabled: gzip level 1, minimum length 256, `gzip_proxied any`, `gzip_vary on`, and the default `gzip-types` list [IN-CFG#L50][IN-CFG#L806-L808][IN-NGXTPL#L313-L331].<br>- Bodies the backend already compressed presumably pass through untouched (UNVERIFIED: the NGINX gzip module was not read). | **Off.**<br>- No compressor filter in the default gateway chain [ISTIO-LB#L394-L458].<br>- No Gateway API field.<br>- App routing: no `EnvoyFilter` [AKS-ARGW]. Add-on: `EnvoyFilter` only, allowed but unsupported [F4 5.3]. | No compression feature is documented [AGC-OV]. | None, unless `use-gzip` or `enable-brotli` was turned on. In that case responses grow, which costs bandwidth, latency and egress. | `curl -s -o /dev/null -D - -H 'Accept-Encoding: gzip, br' https://$H/<large text asset>`; compare `Content-Encoding` and size. |
| B28 | Server header and version disclosure | **No `Server` header.**<br>- `server-tokens: "false"` gives `server_tokens off` and `more_clear_headers Server` [IN-CFG#L828][IN-NGXTPL#L338-L341].<br>- The backend's `Server` header is not passed either: `allow-backend-server-header: "false"`, and NGINX hides the upstream `Server` by default [IN-CFG#L767][IN-NGXTPL#L505-L508][NGX-PROXY#proxy_hide_header].<br>- NGINX's own error pages still end with `<hr><center>nginx</center>`, without a version [NGX-SPEC-C#L35-L36][NGX-SPEC-C#L683-L693].<br>- Removal over HTTP/2 was not verified (see test). | **`server: istio-envoy`** on every response.<br>- It overwrites the backend's value (`OVERWRITE`) [ISTIO-PH#L50-L51][ENVOY-HCM]. Raw Envoy writes `envoy`.<br>- Proxied responses also carry `x-envoy-upstream-service-time`, because the router's debug headers are not suppressed by default [ISTIO-PH#L54][ENVOY-ROUTER-C#L1822-L1823].<br>- ProxyConfig `proxyHeaders.server` and `envoyDebugHeaders` can change this. They are Allowed on the add-on [F4 5.5]; app routing has no documented lever. | - AGC-generated redirects carry `server: Microsoft-Azure-Application-LB/AGC` in Microsoft's sample output [AGC-REDIR].<br>- What happens to a backend's `Server` header is not documented. | - A product disclosure appears where there was none, and scanners flag it.<br>- Apps that set their own `Server` header lose it on Istio. | `curl -sI https://$H/ \| grep -iE '^(server\|x-envoy)'` on both, over HTTP/1.1 and HTTP/2, for a 200, a 404 and a 502. |
| B29 | 502, 503 and 504 on upstream failures | - A refused or reset connection, or a bad upstream header, gives **502**.<br>- A connect, send or read timeout gives **504** [NGX-UPS-C#L4371-L4404].<br>- A Service with no endpoints gives **503**: no Lua balancer exists for it, so the rewrite phase exits with 503 [IN-BAL#L112-L124][IN-BAL#L329-L335].<br>- Exception: if the Ingress has a `default-backend` annotation whose Service has endpoints, that Service answers instead [IN-CTRL#L958-L975][IN-ANN#L365].<br>- Bodies are NGINX HTML pages (B30). | - A reset or connection failure before response headers (refused, connect timeout, termination) gives **503** with `upstream connect error or disconnect/reset before headers. reset reason: …`.<br>- An upstream protocol error gives **502** [ENVOY-ROUTER-C#L1507-L1560].<br>- No healthy endpoint gives **503** `no healthy upstream` [ENVOY-ROUTER-C#L930-L937].<br>- A route or per-try timeout gives **504** `upstream request timeout` [ENVOY-ROUTER-C#L1407-L1421]. This only happens once HTTPRoute timeouts are set (B16).<br>- An invalid backend, or a total weight of zero, gives **500** [ISTIO-ROUTE#L583-L587][ISTIO-CONV#L230-L235]. | - No endpoints for any backend, or an invalid or not-permitted backend, gives **500** [AGC-TS].<br>- Other mappings are not documented. | - Crashed or refusing pods move from 502 to 503 on Istio.<br>- Empty Services stay 503 on Istio and become 500 on AGC.<br>- Alerts and client or CDN retry rules keyed on specific 5xx codes behave differently. | Scale a backend to 0. Make a Ready pod refuse connections. Make a pod sleep past the timeout. Compare status and body on both. |
| B30 | Custom error pages and error bodies | - `custom-http-errors` is empty, so nothing is intercepted: `proxy_intercept_errors` is only turned on when it is set, and backend error responses pass through unchanged [IN-CFG#L874][IN-NGXTPL#L493-L503][IN-NGXTPL#L1398-L1405].<br>- Errors NGINX generates itself (400, 413, 414, 404, 502, 503, 504) are `text/html` pages [NGX-SPEC-C#L196-L250][NGX-SPEC-C#L708-L711].<br>- With `custom-http-errors` plus a default backend, errors are replaced by that backend's response. The backend receives `X-Code`, `X-Format`, `X-Namespace` … [IN-ANN#L327-L337][IN-ANN#L361-L366][IN-NGXTPL#L834-L860][IN-NGXTPL#L1378-L1388].<br>- AKS add-on: NIC `customHTTPErrors` [ARO-NGINX#L582-L584]. | - Nothing is intercepted.<br>- Envoy's own replies are short plain-text bodies (B29) or empty (404) [ENVOY-ROUTER-C].<br>- Gateway API has no error-page field.<br>- App routing: not supported [F2 B.16]. Add-on: `EnvoyFilter` only [F4 §8]. | - The API specification has no error-page or interception setting [AGC-API].<br>- AGC's own error bodies are not documented. | - Branded and maintenance error pages disappear.<br>- Clients that parse error bodies or check `Content-Type` see a different format. | Trigger a 404 (unknown path), a 413, and a 502/503/504 on both. Compare `Content-Type` and body. |

---

## 3. Inputs the inventory tool should read for each row

A default only matters if it was not already overridden. The keys below are what the tool needs to read to tell "default" from "customised".

| Row | ingress-nginx ConfigMap keys | Ingress annotations (`nginx.ingress.kubernetes.io/…`) | Other inputs |
|---|---|---|---|
| B1 | `ssl-redirect`, `force-ssl-redirect`, `http-redirect-code`, `no-tls-redirect-locations`, `use-forwarded-headers` | `ssl-redirect`, `force-ssl-redirect`, `preserve-trailing-slash` | Whether each Ingress has a non-empty `spec.tls`, which covers every host in its rules whether or not it is listed in `tls[].hosts`; canary Ingresses (ignored); `*.` hosts with TLS; AKS NIC `forceSSLRedirect` |
| B2 | `hsts`, `hsts-max-age`, `hsts-include-subdomains`, `hsts-preload` | none | Whether NGINX itself terminates TLS (the HSTS code checks `$scheme`); backend responses that already send HSTS |
| B3 | `ssl-reject-handshake` | none | Flag `--default-ssl-certificate`; AKS NIC `defaultSSLCertificate` |
| B4 | `ssl-protocols`, `ssl-ciphers`, `ssl-ecdh-curve`, `ssl-session-tickets`, `ssl-early-data` | `ssl-ciphers`, `ssl-prefer-server-ciphers` | Target: add-on `meshConfig.tlsDefaults`; AGC `FrontendTLSPolicy` |
| B5, B6 | `use-http2`, `http2-max-concurrent-streams` | none | none |
| B7 | `proxy-body-size` | `proxy-body-size`, `client-body-buffer-size` | none |
| B8 | `client-header-buffer-size`, `large-client-header-buffers`, `http2-max-field-size`, `http2-max-header-size` | none | none |
| B9 | `enable-underscores-in-headers`, `ignore-invalid-headers` | none | none |
| B11, B12 | `proxy-request-buffering`, `proxy-buffering`, `proxy-buffer-size`, `proxy-buffers-number`, `client-body-buffer-size` | `proxy-request-buffering`, `proxy-buffering`, `proxy-buffer-size`, `proxy-buffers-number`, `proxy-max-temp-file-size` | none |
| B13–B15 | `use-forwarded-headers`, `compute-full-forwarded-for`, `forwarded-for-header`, `proxy-real-ip-cidr`, `enable-real-ip`, `use-proxy-protocol`, `generate-request-id` | `x-forwarded-prefix` | Controller Service and Gateway Service `externalTrafficPolicy`; add-on `gatewayTopology.numTrustedProxies` |
| B16 | `proxy-connect-timeout`, `proxy-read-timeout`, `proxy-send-timeout`, `client-header-timeout`, `client-body-timeout`, `keep-alive` | `proxy-connect-timeout`, `proxy-read-timeout`, `proxy-send-timeout` | Target: HTTPRoute `timeouts`; AGC `RoutePolicy`, `IngressExtension` |
| B17 | `proxy-next-upstream`, `proxy-next-upstream-tries`, `proxy-next-upstream-timeout`, `retry-non-idempotent` | `proxy-next-upstream`, `proxy-next-upstream-tries`, `proxy-next-upstream-timeout` | Target: add-on `defaultHttpRetryPolicy` |
| B18 | `upstream-keepalive-connections`, `upstream-keepalive-timeout`, `upstream-keepalive-requests`, `upstream-keepalive-time`, `keep-alive-requests` | none | Target: `DestinationRule` `connectionPool` (add-on) |
| B19 | as B16 | `proxy-read-timeout`, `proxy-send-timeout`, `connection-proxy-header` | Ingresses carrying WebSocket traffic, which can't be detected from config alone |
| B20 | none | `backend-protocol`, `proxy-http-version` | Service `ports[].name` and `ports[].appProtocol` |
| B21–B23 | none | `use-regex`, `rewrite-target` | Ingress `pathType`, all paths per host, Ingress `creationTimestamp` |
| B24 | none | none | Ingress hosts starting with `*.` |
| B26, B29, B30 | `custom-http-errors` | `custom-http-errors`, `default-backend` | Flag `--default-backend-service`; AKS NIC `defaultBackendService`, `customHTTPErrors` |
| B27 | `use-gzip`, `gzip-level`, `gzip-min-length`, `gzip-types`, `enable-brotli`, `brotli-level`, `brotli-types` | none | none |
| B28 | `server-tokens`, `allow-backend-server-header`, `hide-headers` | none | none |

All keys and annotations above exist in the v1.15.1 docs [IN-CM][IN-ANN].

On the `istio` target, the tool can read the AKS default MeshConfig (`istio-asm-1-xx`) and the user overrides (`istio-shared-configmap-asm-1-xx`) in `aks-istio-system` [F4 §9]. For `approuting-istio`, no readable MeshConfig is documented (UNVERIFIED).

---

## 4. Running the tests

- **Run every test against both data planes before DNS moves.** Use the same Host and SNI with `curl --resolve`. This is the parallel-run model in Microsoft's migration guide [F2 B.15].
  - `OLD` is the ingress-nginx Service IP.
  - `NEW` is the Gateway's `status.addresses`.
  - For AGC, resolve the frontend FQDN to an IP first, as Microsoft's own how-tos do with `dig +short` [AGC-REDIR].
- **Deploy an echo backend that returns the request line and headers.** Microsoft's AGC how-tos use one [AGC-HDR]. Route one path of each host to it in both configurations.
- **Inspect the Istio targets' effective Envoy configuration when a result surprises you.**
  - Dump it with `istioctl proxy-config listener|route|cluster <gateway pod> -n <ns> -o json`; the gateway container is `istio-proxy` in upstream's template.
  - Then check the fields cited in the Istio column, for example `use_remote_address`, `normalize_path`, `stream_idle_timeout` and `retry_policy`.
  - This needs permissions that the read-only inventory tool does not have; it is a manual step.

---

## 5. Conflicts, gaps and UNVERIFIED items

1. **AKS overrides of Istio defaults.**
   - Microsoft does not publish the MeshConfig or ProxyConfig for `approuting-istio`, nor the defaults in the `asm-1-xx` ConfigMaps beyond allow lists.
   - Every Istio cell is upstream behaviour, verified in source. That AKS leaves it unchanged is UNVERIFIED (F2 §conflicts 12, F4 §11).
2. **Envoy version.** The Envoy build inside the AKS-managed Istio is not published.
   - Defaults were taken from the latest Envoy docs (1.41.0-dev) and the v1.36.0 source.
   - Some defaults changed over time, for example HTTP/2 `max_concurrent_streams` (1024 in the latest docs) and `max_response_headers_kb` (80 KiB for HTTP/1 in the latest docs).
3. **ingress-nginx docs versus code on the redirect code.** `configmap.md` says `ssl-redirect` redirects with 301. The code (`http-redirect-code` 308), `annotations.md` and `tls.md` say 308. The code was followed (F1 conflict 9).
4. **HSTS on ingress-nginx.**
   - `lua_ingress.header()` assigns `ngx.header["Strict-Transport-Security"]`. That this overwrites a backend's own HSTS header is UNVERIFIED: the lua-nginx-module docs could not be read (B2).
   - Its certificate check is never called, so HSTS goes on every HTTPS response. This is Derived from the code and Lua semantics, not observed (B2).
5. **ingress-nginx try count.**
   - "Up to 3 tries" comes from `proxy-next-upstream-tries`. lua-resty-core caps the tries made through `set_more_tries` at that value [LRC-BAL].
   - Whether NGINX's extra try after a failed reused keep-alive connection [NGX-UPS-C#L4366-L4369] can add a fourth attempt under `balancer_by_lua` is UNVERIFIED (B17).
   - The "3 × 60 s" worst case is Derived.
6. **`Prefix /foo/` redirects `/foo` with 301 on NGINX.** This is Derived from `location.go` and the NGINX `location` docs, not observed (B21).
7. **Istio listener without a hostname.** Resolved on 2026-11-04 from source (release-1.29 `listener.go`, release-1.31 `conversion.go` and `model/gateway.go`): it accepts every SNI, and no SNI, with its own certificate. Derived, not observed (B3).
8. **Headers Envoy does not document.** Whether a client-sent `X-Real-IP` passes through Envoy (B14), what happens to the `Proxy` header (B15), and how `Upgrade` tokens other than `websocket` are handled (B19) are all UNVERIFIED.
9. **Internal addresses.** Since Envoy 1.33 no address is internal by default, and Istio sets internal addresses only from MeshNetworks. AKS's MeshNetworks setting is unknown. If some peers counted as internal, XFF trust and `x-request-id` handling would differ (B15).
10. **Upstream connection handling on Istio (B18).**
    - Whether Envoy classifies a failure on a stale pooled upstream connection as `connect-failure`, which Istio retries, or `reset`, which it does not, is undocumented.
    - The upstream idle timeout for ordinary clusters is Envoy's 1 h. Istio's traffic-policy code sets one only from a `DestinationRule` [ISTIO-CTP#L132-L201]; resolved on 2026-11-04.
11. **AGC gaps.** The following are not documented:
    - retry rules (B17);
    - body and header limits (B7, B8);
    - underscore headers (B9);
    - header case on proxied traffic (B10);
    - normalisation (B25);
    - unknown host and unknown SNI handling (B3, B26);
    - compression (B27);
    - HSTS (B2);
    - HTTP/1.0 (B6);
    - the `Server` header on proxied responses (B28);
    - the status code AGC returns on a request timeout (B29);
    - whether the 60 s request timeout applies to upgraded WebSocket connections (B19);
    - whether a client `X-Request-ID` is kept (B15).
12. **AKS add-on NGINX Service policy.** `externalTrafficPolicy: Local` is verified in operator v0.2.27 only. AKS runs 0.2.28+, whose source is unpublished (F2 conflict 3).
13. **Microsoft-patched NGINX builds.** `v1.13.10-*`, `v1.13.11-*` and `v1.15.1-*` were not inspected. Their defaults are assumed equal to the upstream tags (F2 A.2).
14. **Per-gateway ProxyConfig on AKS.** Whether AKS webhooks accept `proxy.istio.io/config` through `spec.infrastructure.annotations`, to set `numTrustedProxies`, `proxyHeaders` or `HTTP10` per gateway, is UNVERIFIED (F4 §11 items 8–9).
15. **NGINX details not verified here.** Removal of the `Server` header over HTTP/2 (B28) and plaintext h2c handling (B5).
16. **AGC redirect codes.** 303 on `agc`, and 307/308 on `agcIngress`, are UNVERIFIED (F3 C7).
17. **AGC TLS policy page versus the API.** The TLS policy page says a "custom TLS policy" can set the minimum version, ciphers and curves. The same page and the API specification offer only the `predefined` type, and the FAQ says TLS versions are not configurable. The API and FAQ were followed (B4).
18. **Envoy response-header overflow status (B12).** 502 is Derived from the v1.36.0 codec, codec client and router source, not observed. The docs do not state the status.
19. **NGINX gzip on pre-compressed bodies (B27).** Not checked in the gzip module source (UNVERIFIED).

---

## Sources

All accessed 2026-11-04. GitHub `blob/<tag>` links are pinned. `#Lx` anchors refer to these files.

### ingress-nginx, tag `controller-v1.15.1`

Base URL: `https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/`

- [IN-CFG] internal/ingress/controller/config/config.go — https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/controller/config/config.go
- [IN-NGXTPL] rootfs/etc/nginx/template/nginx.tmpl — https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/rootfs/etc/nginx/template/nginx.tmpl
- [IN-TPL] internal/ingress/controller/template/template.go — https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/controller/template/template.go
- [IN-LUA] rootfs/etc/nginx/lua/lua_ingress.lua — https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/rootfs/etc/nginx/lua/lua_ingress.lua
- [IN-HDRF] rootfs/etc/nginx/lua/nginx/ngx_conf_srv_hdr_filter.lua — https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/rootfs/etc/nginx/lua/nginx/ngx_conf_srv_hdr_filter.lua
- [IN-CERT] rootfs/etc/nginx/lua/certificate.lua — https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/rootfs/etc/nginx/lua/certificate.lua (with `configuration.lua` L16 and L84–L87 for the "no certificate" marker)
- [IN-BAL] rootfs/etc/nginx/lua/balancer.lua — https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/rootfs/etc/nginx/lua/balancer.lua
- [IN-CTRL] internal/ingress/controller/controller.go — https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/controller/controller.go
- [IN-NGINXGO] internal/ingress/controller/nginx.go — https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/controller/nginx.go
- [IN-LOC] internal/ingress/controller/location.go — https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/controller/location.go
- [IN-STORE] internal/ingress/controller/store/store.go — https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/controller/store/store.go
- [IN-SSL] internal/net/ssl/ssl.go — https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/net/ssl/ssl.go
- [IN-FLAGS] pkg/flags/flags.go — https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/pkg/flags/flags.go
- [IN-BUILD] images/nginx/rootfs/build.sh (`NGINX_VERSION=1.27.1`) — https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/images/nginx/rootfs/build.sh
- [IN-CHART] charts/ingress-nginx/values.yaml — https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/charts/ingress-nginx/values.yaml
- [IN-STATIC] deploy/static/provider/cloud/deploy.yaml — https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/deploy/static/provider/cloud/deploy.yaml
- [IN-DEPLOYDOC] docs/deploy/index.md (the Azure install uses the `cloud` manifest) — https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/docs/deploy/index.md
- [IN-CM] docs/user-guide/nginx-configuration/configmap.md (section anchors such as `#ssl-redirect`, `#use-forwarded-headers`, `#use-http2`) — https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/docs/user-guide/nginx-configuration/configmap.md
- [IN-ANN] docs/user-guide/nginx-configuration/annotations.md — https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/docs/user-guide/nginx-configuration/annotations.md
- [IN-TLSDOC] docs/user-guide/tls.md — https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/docs/user-guide/tls.md
- [IN-MISC] docs/user-guide/miscellaneous.md — https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/docs/user-guide/miscellaneous.md
- [IN-DEFBE] docs/user-guide/default-backend.md — https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/docs/user-guide/default-backend.md
- [IN-PATH] docs/user-guide/ingress-path-matching.md — https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/docs/user-guide/ingress-path-matching.md
- [IN-1139] `controller-v1.13.9`, compared with v1.15.1. `NewDefault()` is identical, and so are `nginx.tmpl` and `lua_ingress.lua`; only the DHE order in `sslCiphers` differs.
  - https://github.com/kubernetes/ingress-nginx/blob/controller-v1.13.9/internal/ingress/controller/config/config.go
  - https://github.com/kubernetes/ingress-nginx/blob/controller-v1.13.9/rootfs/etc/nginx/template/nginx.tmpl
  - https://github.com/kubernetes/ingress-nginx/blob/controller-v1.13.9/rootfs/etc/nginx/lua/lua_ingress.lua

### AKS application routing add-on (NGINX)

- [ARO-NGINX] Azure/aks-app-routing-operator v0.2.27, `pkg/manifests/nginx.go`. L347 sets `ExternalTrafficPolicy: Local`; L565–L584 build the ConfigMap. https://github.com/Azure/aks-app-routing-operator/blob/v0.2.27/pkg/manifests/nginx.go

### NGINX

- [NGX-CORE] https://nginx.org/en/docs/http/ngx_http_core_module.html. Anchors used: `#location`, `#large_client_header_buffers`, `#client_max_body_size`, `#merge_slashes`, `#underscores_in_headers`, `#ignore_invalid_headers`, `#keepalive_timeout`.
- [NGX-PROXY] https://nginx.org/en/docs/http/ngx_http_proxy_module.html. Anchors used: `#proxy_pass`, `#proxy_next_upstream`, `#proxy_next_upstream_tries`, `#proxy_read_timeout`, `#proxy_send_timeout`, `#proxy_request_buffering`, `#proxy_buffering`, `#proxy_hide_header`.
- [NGX-UPS-C] https://github.com/nginx/nginx/blob/release-1.27.1/src/http/ngx_http_upstream.c. `ngx_http_upstream_next` is at L4333–L4430; "too big header" at L2478–L2484; the tries caps at L806–L816 and L1250–L1259.
- [NGX-SPEC-C] https://github.com/nginx/nginx/blob/release-1.27.1/src/http/ngx_http_special_response.c
- [NGX-PROXY-C] https://github.com/nginx/nginx/blob/release-1.27.1/src/http/modules/ngx_http_proxy_module.c (`ngx_http_proxy_create_request`, header copy at L1505–L1535)
- [NGX-V2] https://nginx.org/en/docs/http/ngx_http_v2_module.html. `http2_max_field_size` and `http2_max_header_size` are "obsolete since version 1.19.7"; `http2_max_concurrent_streams` defaults to 128.

### Envoy

API docs, read 2026-11-04; the pages showed version `1.41.0-dev`.

- [ENVOY-HCM] HttpConnectionManager. https://www.envoyproxy.io/docs/envoy/latest/api-v3/extensions/filters/network/http_connection_manager/v3/http_connection_manager.proto
  - `server_name` defaults to `envoy`, with OVERWRITE; `max_request_headers_kb` is 60 KiB, giving 431; `stream_idle_timeout` is 5 min.
  - `request_timeout` and `request_headers_timeout` are disabled; `xff_num_trusted_hops` is 0.
  - `generate_request_id` is true and `preserve_external_request_id` is false.
  - `normalize_path` is false, affects upstream `:path`, and gives 400 on malformed paths; `merge_slashes` is false; `path_with_escaped_slashes_action` is KEEP_UNCHANGED.
  - `codec_type` is AUTO; `upgrade_configs`; the untrusted-downstream example sets REJECT_REQUEST.
- [ENVOY-PROTO] `config.core.v3` protocol options. https://www.envoyproxy.io/docs/envoy/latest/api-v3/config/core/v3/protocol.proto
  - `idle_timeout` is 1 h; `max_headers_count` is 100, giving 431 on HTTP/1 and a reset on HTTP/2; `max_response_headers_kb`.
  - `headers_with_underscores_action` is ALLOW; `max_requests_per_connection` is unlimited.
  - `header_key_format` lower-cases names; `accept_http_10` is off; HTTP/2 `max_concurrent_streams` is 1024.
- [ENVOY-HDR] HTTP header manipulation (XFF append, `x-forwarded-proto` trust, `x-request-id`, `x-envoy-external-address`, `server`). https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_conn_man/headers
- [ENVOY-TLS] TlsParameters (TLS 1.2–1.3 for servers, default server cipher list, curves X25519 and P-256). https://www.envoyproxy.io/docs/envoy/latest/api-v3/extensions/transport_sockets/tls/v3/common.proto
- [ENVOY-LISTENER] `default_filter_chain` ("If no default filter chain is supplied, the connection will be closed"). https://www.envoyproxy.io/docs/envoy/latest/api-v3/config/listener/v3/listener.proto
- [ENVOY-RC] Route components. https://www.envoyproxy.io/docs/envoy/latest/api-v3/config/route/v3/route_components.proto
  - `RouteAction.timeout` defaults to 15 s and "includes all retries"; `idle_timeout`.
  - `safe_regex` must match the entire path; `path_separated_prefix`; `case_sensitive` defaults to true.
  - Domain wildcards; `include_request_attempt_count`.
- [ENVOY-ROUTER-C] https://github.com/envoyproxy/envoy/blob/v1.36.0/source/common/router/router.cc. L468–L479 no route (404); L930–L937 no healthy upstream (503); L1407–L1421 timeout (504); L1507–L1560 reset (503 or 502); L1822–L1823 `x-envoy-upstream-service-time`.
- [ENVOY-H1] https://github.com/envoyproxy/envoy/blob/v1.36.0/source/common/http/http1/codec_impl.cc. L568 lower-case; L574–L576 header count (431); L606–L615 header size (431); L1180–L1192 HTTP/1.0 (426); L1413–L1436 underscores. The count and size checks are in the `ConnectionImpl` shared by the server and client codecs (L574–L582, L607–L616).
- [ENVOY-CC] https://github.com/envoyproxy/envoy/blob/v1.36.0/source/common/http/codec_client.cc. `onData` sets `protocol_error_` when dispatch fails and closes the connection; `onEvent` then resets the active streams with `ProtocolError`. Read 2026-11-04.

### Istio source

Local copies were matched by size against these pinned URLs.

- [ISTIO-LB] https://github.com/istio/istio/blob/release-1.29/pilot/pkg/networking/core/listener_builder.go. Same settings on release-1.31 at L409–L445, plus `applyConnectionSettingsToHCM`: https://github.com/istio/istio/blob/release-1.31/pilot/pkg/networking/core/listener_builder.go
- [ISTIO-GW] https://github.com/istio/istio/blob/release-1.29/pilot/pkg/networking/core/gateway.go (release-1.31 is equivalent; HTTP/1.0 at L726–L727)
- [ISTIO-LIS] https://github.com/istio/istio/blob/release-1.29/pilot/pkg/networking/core/listener.go
- [ISTIO-PH] https://github.com/istio/istio/blob/release-1.29/pilot/pkg/networking/util/proxy_headers.go (identical on release-1.31)
- [ISTIO-UTIL] https://github.com/istio/istio/blob/release-1.29/pilot/pkg/networking/util/util.go
- [ISTIO-HR] https://github.com/istio/istio/blob/release-1.29/pilot/pkg/networking/core/httproute.go
- [ISTIO-ROUTE] https://github.com/istio/istio/blob/release-1.29/pilot/pkg/networking/core/route/route.go
- [ISTIO-RETRY] https://github.com/istio/istio/blob/release-1.29/pilot/pkg/networking/core/route/retry/retry.go (same size on release-1.31)
- [ISTIO-RETRY-128] https://github.com/istio/istio/blob/release-1.28/pilot/pkg/networking/core/route/retry/retry.go
- [ISTIO-RETRY-126] https://github.com/istio/istio/blob/release-1.26/pilot/pkg/networking/core/route/retry/retry.go
- [ISTIO-PILOT126] https://github.com/istio/istio/blob/release-1.26/pilot/pkg/features/pilot.go
- [ISTIO-PILOT] https://github.com/istio/istio/blob/release-1.29/pilot/pkg/features/pilot.go
- [ISTIO-CB] https://github.com/istio/istio/blob/release-1.29/pilot/pkg/networking/core/cluster_builder.go
- [ISTIO-KCONV] https://github.com/istio/istio/blob/release-1.29/pkg/config/kube/conversion.go
- [ISTIO-MESH] https://github.com/istio/istio/blob/release-1.29/pkg/config/mesh/mesh.go (identical on release-1.31)
- [ISTIO-CONV] https://github.com/istio/istio/blob/release-1.31/pilot/pkg/config/kube/gateway/conversion.go (`getURIRank` is the same on release-1.28, 1.29 and 1.30)
- [ISTIO-RC] https://github.com/istio/istio/blob/release-1.31/pilot/pkg/config/kube/gateway/route_collections.go
- [ISTIO-CS] https://github.com/istio/istio/blob/release-1.31/pilot/pkg/networking/core/connection_settings.go (absent on release-1.29 and release-1.30)
- [ISTIO-MODELGW] https://github.com/istio/istio/blob/release-1.31/pilot/pkg/model/gateway.go. `GetSNIHostsForServer` at L562–L577 strips the `ns/` prefix. Read from a local clone of release-1.31 (commit `fd1d9adc`, 2026-11-03).
- [ISTIO-CTP] https://github.com/istio/istio/blob/release-1.31/pilot/pkg/networking/core/cluster_traffic_policy.go. `applyConnectionPool` at L132–L212 sets an idle timeout only from `connectionPool.http.idleTimeout` or `tcp.idleTimeout`. Same clone.

### Istio docs

- [ISTIO-MESHCFG] MeshConfig reference, v1.31 docs. https://istio.io/latest/docs/reference/config/istio.mesh.v1alpha1/
  - `connectTimeout` defaults to 10 s.
  - `defaultHttpRetryPolicy`: 2 attempts on "connect-failure,refused-stream,unavailable,cancelled,retriable-status-codes".
  - `pathNormalization`: DEFAULT is BASE.
  - `numTrustedProxies` defaults to 0; TLS minimum defaults to 1.2; the server header defaults to `istio-envoy`.

### Gateway API v1.7.0

- [HR] https://github.com/kubernetes-sigs/gateway-api/blob/v1.7.0/apis/v1/httproute_types.go. L500–L560 path match types; L1300–L1321 `statusCode`, default 302 at L1319. See also F1 §3–4.

### AKS and Azure

- [AKS-ARGW] Application routing add-on with the Gateway API (ms.date 2026-08-31). https://learn.microsoft.com/en-us/azure/aks/app-routing-gateway-api
  - "Limitations": no header or body size limits, no `EnvoyFilter`; the Envoy buffer filter note.
  - The note on the default `externalTrafficPolicy` "Cluster".
- [AKS-ISTGW] Gateway API ingress for the Istio add-on (the same `externalTrafficPolicy` note). https://learn.microsoft.com/en-us/azure/aks/istio-gateway-api
- [CPA-LB] cloud-provider-azure load balancer annotations: `azure-load-balancer-tcp-idle-timeout` "Default and minimum value is 4"; TCP reset is enabled unless disabled. https://cloud-provider-azure.sigs.k8s.io/topics/loadbalancer/
- [K8S-SRCIP] Kubernetes, "Preserving the client source IP". Referenced by the ingress-nginx chart comment; not fetched this session. https://kubernetes.io/docs/tasks/access-application-cluster/create-external-load-balancer/#preserving-the-client-source-ip
- [K8S-CORE] Kubernetes core/v1 API, `ServiceSpec.externalTrafficPolicy`: "The default value, "Cluster", …"; `Local` delivers traffic "without masquerading the client source IP". Local copy read 2026-11-04. https://github.com/kubernetes/api/blob/master/core/v1/types.go
- [AKS-MESHCFG] Istio add-on MeshConfig allow list. `pathNormalization`, `defaultHttpRetryPolicy`, `tlsDefaults`, `gatewayTopology`, `proxyHeaders` and `proxyMetadata` are Allowed; `connectionSettings` is Supported from asm-1-31. https://learn.microsoft.com/en-us/azure/aks/istio-meshconfig

### Application Gateway for Containers

Microsoft Learn; markdown read from MicrosoftDocs/azure-docs `main` on 2026-11-04.

- [AGC-COMP] Components (ms.date 2026-11-02): "HTTP/2 Requests", "Modifications to the request", "Request timeouts". https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/application-gateway-for-containers-components
- [AGC-OV] Overview (2026-11-03): "Supported traffic management features". https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/overview
- [AGC-METRICS] Metrics. https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/application-gateway-for-containers-metrics
- [AGC-REDIR] URL redirect with Gateway API (2024-11-05; sample output with `server: Microsoft-Azure-Application-LB/AGC`). https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-url-redirect-gateway-api
- [AGC-HDR] Header rewrite with Gateway API (sample backend output listing the headers received). https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-header-rewrite-gateway-api
- [AGC-REL] ALB Controller release notes. https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/alb-controller-release-notes
- [AGC-TLS] TLS policy (2026-09-22). https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/tls-policy
- [AGC-FAQ] FAQ (2026-07-07): "Can I configure TLS protocol versions? No." https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/faq
- [AGC-WS] WebSockets (2025-01-13). https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/websockets
- [AGC-TS] Troubleshooting (2026-10-01): "Application Gateway for Containers returns 500 status code". https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/troubleshooting-guide
- [AGC-DIAG] Diagnostics (2025-07-21): access log fields `clientIp`, `requestHeaderBytes`, `trackingId`. https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/diagnostics
- [AGC-ROUTING] Path, header and query routing with Gateway API (2024-11-05): RE2 note. https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/how-to-path-header-query-string-routing-gateway-api
- [AGC-API] API specification for Kubernetes (2026-11-03). https://learn.microsoft.com/en-us/azure/application-gateway/for-containers/api-specification-kubernetes
- [AGC-WAF] WAF on AGC, "Limitations" (2026-08-21; no XFF variable). https://learn.microsoft.com/en-us/azure/web-application-firewall/ag/waf-application-gateway-for-containers-overview
- [WAF-SIZE] WAF request and file upload size limits (2026-02-25; written for Application Gateway WAF). https://learn.microsoft.com/en-us/azure/web-application-firewall/ag/application-gateway-waf-request-size-limits

### Other

- [RFC9110#5.1] HTTP Semantics, field names are case-insensitive. https://www.rfc-editor.org/rfc/rfc9110#section-5.1
- [LUA51#2.2] Lua 5.1 Reference Manual §2.2: "Both nil and false make a condition false; any other value makes it true." The controller image builds OpenResty's `luajit2` `v2.1-20250117` [IN-BUILD#L60], a Lua 5.1 implementation. https://www.lua.org/manual/5.1/manual.html#2.2
- [LRC-BAL] lua-resty-core `ngx.balancer`, `set_more_tries`: "the total number of tries in a single downstream request cannot exceed the hard limit configured by directives like proxy_next_upstream_tries". https://github.com/openresty/lua-resty-core/blob/master/lib/ngx/balancer.md
- Sibling fact files in this folder: `F1-gateway-api.md`, `F2-aks-app-routing.md`, `F3-agc.md`, `F4-istio-addon.md`, `F6-ingress2gateway.md` (`ImplementationSpecific` → `PathPrefix`, from ingress2gateway v1.2.0 `converter.go`).

---

## Verification log (2026-11-04)

**Scope and method**

- Two lenses were checked.
  - NGINX side: every ingress-nginx default (value, unit, condition, controlling key and line anchor) against the v1.15.1 source and docs, and the nginx.org directive docs.
  - Envoy, Istio, AGC and AKS side: every default and behaviour claim against Envoy, Istio and Microsoft Learn sources.
- Local copies were read first:
  - ingress-nginx v1.15.1 tree, and v1.13.9 `lua_ingress.lua`;
  - NGINX release-1.27.1 C files;
  - Envoy v1.36.0 `router.cc` and `codec_impl.cc`;
  - Istio release-1.26 to release-1.31 files, plus a sparse git clone of release-1.31 read with `git show`;
  - Gateway API v1.7.0 types and standard CRD bundles v1.2.1 to v1.7.0;
  - the AKS, AGC and WAF Learn markdown;
  - aks-app-routing-operator v0.2.27. Its `main` branch is also at v0.2.27 (2026-08-04) and still sets `Local`.
- 15 online fetches were made, the maximum allowed:
  - Envoy HCM, protocol options, headers, TLS, route components and listener docs (6). All showed `1.41.0-dev`.
  - nginx.org core and proxy modules (2).
  - Istio MeshConfig (1). The page was truncated, so only `connectTimeout` and `defaultHttpRetryPolicy` were read; the other MeshConfig claims were checked in source.
  - cloud-provider-azure load balancer annotations (1).
  - Lua 5.1 manual (2; the first attempt was refused).
  - lua-nginx-module README (1; no content returned).
  - Envoy v1.36.0 `codec_client.cc` (1).
  - lua-resty-core `balancer.md` (1).
- **Claims checked: 315** atomic claims, counting values, units, conditions, keys, quotes and line anchors.
  - Not re-checked: references into the sibling files F1 to F4 and F6, [RFC9110#5.1] and [K8S-SRCIP].
  - Outcome: 289 confirmed as written, 16 corrected, and 10 previously UNVERIFIED claims still UNVERIFIED (289 + 16 + 10 = 315).
  - One confirmed claim (B23 Istio) was strengthened and is listed in the table as row 16.
  - Among the corrections, two resolve UNVERIFIED items, one narrows one, and one marks an uncited claim UNVERIFIED. Seven precision notes were also added to confirmed claims.

**Corrections** (row 16 is a confirmation that was strengthened, not a correction)

| # | Where | Old | New | Source |
|---|---|---|---|---|
| 1 | B1, §0.1, §3 B1 | A host is "configured" (redirected) when it is listed in `spec.tls[].hosts` | Any host in the rules of a non-canary Ingress with a non-empty `spec.tls`, listed or not; the default certificate fills in. A `*.` host with a certificate also covers sub-hosts | [IN-CTRL#L1405-L1407][IN-CTRL#L1448-L1490][IN-CTRL#L1719-L1764][IN-CERT#L48-L71][IN-TLSDOC#L44-L48][IN-TLSDOC#L83-L84] |
| 2 | B2, §0.1, §3 B2, §5.4 | HSTS only "when the request is HTTPS and the host has a configured certificate" | HSTS on every response NGINX serves over HTTPS. `lua_ingress.lua` L179 names the certificate function without calling it, and a function is always true in Lua (Derived; the same line is in v1.13.9) | [IN-LUA#L4-L5][IN-LUA#L179][IN-LUA#L78][LUA51#2.2] |
| 3 | B12 | Envoy: response headers over `max_response_headers_kb` give 503; more than 100 give 502 | Both are codec protocol errors, so the stream is reset with `ProtocolError` and the router answers 502 (Derived) | [ENVOY-H1#L574-L582][ENVOY-H1#L607-L616][ENVOY-CC][ENVOY-ROUTER-C#L1535-L1537] |
| 4 | B3, §0.9, §5.7 | Istio refuses an unknown SNI; a no-hostname listener was UNVERIFIED | The handshake is refused only when every HTTPS listener on the port has a hostname. A no-hostname listener accepts any SNI, or none (Derived) | [ISTIO-CONV#L2606-L2627][ISTIO-MODELGW#L562-L577][ISTIO-LIS#L1263-L1277] |
| 5 | B15 | `x-envoy-attempt-count` cited at [ISTIO-HR#L506][ISTIO-HR#L530] (unrelated lines) | [ISTIO-GW#L506][ISTIO-GW#L530]; Envoy's own default is off | [ISTIO-GW][ENVOY-RC] |
| 6 | B11 | "Envoy only waits for a full body when the buffer filter is configured [AKS-ARGW]" | Marked Derived from the filter chain; the AKS page only describes the buffer filter | [ISTIO-LB#L394-L458][AKS-ARGW] |
| 7 | B20, §0.12 | `appProtocol` gives HTTP/2 only for `kubernetes.io/h2c` | `appProtocol` replaces the port name; prefixes `http2`, `grpc` and `grpc-web`, and `kubernetes.io/h2c`, give HTTP/2 | [ISTIO-KCONV#L48-L95]; `IsHTTP2()` in release-1.29 `pkg/config/protocol/instance.go` |
| 8 | B18, §5.10 | Istio cluster idle-timeout default UNVERIFIED | Set only from a `DestinationRule`; otherwise Envoy's 1 h | [ISTIO-CTP#L132-L201] |
| 9 | B17, §5.5 | Try accounting under `balancer_by_lua` UNVERIFIED | `set_more_tries(1)` per pick, capped at `proxy_next_upstream_tries`; only the keep-alive extra try stays UNVERIFIED | [IN-BAL#L354][LRC-BAL] |
| 10 | B27 | "a fixed type list"; "pre-compressed bodies pass through untouched" (uncited) | "the default `gzip-types` list" (a ConfigMap key); the pass-through is marked UNVERIFIED | [IN-CFG#L50][IN-CFG#L808] |
| 11 | B26 | 404 with an empty body ("no route match") | "no route match" is only the debug-log text; the body is empty | [ENVOY-ROUTER-C#L473-L477] |
| 12 | §1 | [ARO-NGINX#L565-L584]; `log-format-upstream` only on NIC request | [ARO-NGINX#L565-L592]; also set by the operator flag `--enable-internal-logging` | [ARO-NGINX] L586–L592 |
| 13 | B14 | [IN-NGXTPL#L76-L91] | [IN-NGXTPL#L77-L92] | [IN-NGXTPL] |
| 14 | B22 | Any `rewrite-target` turns on regex mode | Only a `rewrite-target` that differs from the path; anchor widened to L497 | [IN-TPL#L497-L519] |
| 15 | B23 NGINX | Duplicates "dropped with a log line" | Logged only at `--v=3` | [IN-CTRL#L831][IN-STORE#L1110] |
| 16 | B23 Istio, §0.7 | `PathPrefix /` is "evaluated before" regex rules | Kept and strengthened: route generation stops at the first catch-all, so regex rules are never emitted. A later move of catch-alls to the end does not restore them | [ISTIO-ROUTE#L414-L436][ISTIO-GW#L549-L552][ISTIO-ROUTE#L1646-L1676] |
| 17 | B29, §3 | An endpoint-less Service always gives 503 | Unless a `default-backend` annotation points at a Service with endpoints | [IN-CTRL#L958-L975][IN-ANN#L365] |

**Precision added to confirmed cells**

- B4: Envoy FIPS builds default to P-256 and the AES-GCM suites only [ENVOY-TLS].
- B4: the AGC TLS policy page conflicts with its own API ("custom" policy); see §5.17.
- B6: `proxyMetadata` is Allowed on the add-on [AKS-MESHCFG].
- B8: `http2_max_field_size` and `http2_max_header_size` have been obsolete since NGINX 1.19.7 [NGX-V2].
- B13: Kubernetes API default `Cluster` [K8S-CORE].
- B24: Gateway API wildcard suffix semantics [HR#L89-L91].
- The MeshConfig allow list, including `connectionSettings` Supported from asm-1-31, was confirmed in the AKS page [AKS-MESHCFG].

**Left UNVERIFIED (sources silent or not readable)**

- **AKS overrides.** Whether AKS changes any upstream Istio default for `approuting-istio` or `asm-1-xx`, and whether it publishes a readable MeshConfig for `approuting-istio` (§5.1, §3).
- **Envoy build.** The Envoy version and build (including FIPS) inside AKS-managed Istio (§5.2).
- **ingress-nginx and NGINX.**
  - Whether `ngx.header` replaces a backend's own HSTS header (B2).
  - Plaintext h2c handling (B5).
  - The keep-alive extra try under `balancer_by_lua` (B17).
  - gzip on pre-compressed bodies (B27).
  - `Server` header removal over HTTP/2 (B28).
  - The Microsoft-patched builds (§5.13).
  - The NGINX Service policy in operator builds after v0.2.27 (§5.12).
- **Envoy and Istio on AKS.**
  - `HTTP10` through `proxyMetadata` or `PILOT_HTTP10` on AKS (B6).
  - Whether a client-sent `X-Real-IP` passes through Envoy (B14).
  - What happens to the `Proxy` header, and AKS's MeshNetworks (B15).
  - Whether a stale pooled connection fails as `connect-failure` or `reset` (B18).
  - Non-websocket `Upgrade` tokens (B19).
  - Per-gateway ProxyConfig through infrastructure annotations (§5.14).
- **AGC.**
  - Every gap in §5.11.
  - The 60 s timeout on upgraded WebSockets (B19).
  - 303 on `agc`, and 307/308 on `agcIngress` (§5.16).
- **Derived, not observed.**
  - NGINX's 301 for `/foo` under `Prefix /foo/` (B21).
  - The HSTS scope (B2) and the Istio 502 on oversized response headers (B12).
  - Istio's no-hostname SNI behaviour (B3) and its regex-route truncation (B23).
