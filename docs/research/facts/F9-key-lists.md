# F9 — ingress-nginx key lists: annotations, ConfigMap keys, controller flags

Research date: 2026-11-04. Baseline: `kubernetes/ingress-nginx` tag **controller-v1.15.1**, the last release of
the archived project. Every list below was read from the documentation files at that tag **and** cross-checked
against the Go source at the same tag; disagreements between the two are called out. Removals since v1.0 come from
the changelogs plus a diff of the key sets found in the source at controller-v1.0.0, v1.9.4, v1.11.8 and v1.15.1.
Source labels in brackets (for example [S6]) point to the Sources section at the end.

## 1. Baseline and method

- **Latest release.** `controller-v1.15.1`, published 2026-03-19T21:17:55Z, together with `controller-v1.14.5` and
  `controller-v1.13.9` (and Helm charts 4.15.1, 4.14.5, 4.13.9) the same day [R1][R2].
- **Repository archived.** The GitHub API returns `"archived": true` for `kubernetes/ingress-nginx`, last push
  2026-03-23 (checked 2026-11-04) [R2]. The README at the tag says best-effort maintenance continued until March 2026
  and that afterwards there are no further releases, bugfixes or security fixes, while existing images and charts
  remain available [R3].
- **Docs read at the tag.** `annotations.md`, `annotations-risk.md`, `configmap.md` and `cli-arguments.md` were
  downloaded from the tag [D1][D2][D3][D4]. The docs site still answers HTTP 200 (2026-11-04) [D7], and the four
  files are byte-identical on `main` and at `controller-v1.15.1`, so either can be cited.
- **Source cross-check at the tag.** Annotation parsers in `internal/ingress/annotations/*` (key constants, risk,
  scope, aliases, defaults) [S1]; ConfigMap decoding in `config.go`, `defaults/main.go` and
  `template/configmap.go` [S6][S7][S8]; flags in `pkg/flags/flags.go` plus klog flags registered by
  `klog.InitFlags(nil)` in `cmd/nginx/main.go` (klog v2.140.0 per `go.mod`) [S11][S12][S13][K1].
- **Removed keys since v1.0.** Changelog entries [C1]–[C10] plus set differences of keys present in the source at
  controller-v1.0.0 [V0], v1.9.4 [V9] and v1.11.8 [V11] but absent at v1.15.1.
- **Group ids** follow the definitions of the task (G1–G9 annotations, G11/G12a/G12b ConfigMap, G13 flags);
  placements that needed a judgment call are listed in section 7.

## 2. Counts at a glance

| List | Rows | Breakdown |
|---|---|---|
| Annotations | 150 | 136 parsed primary keys + 2 legacy aliases (`whitelist-source-range`, `limit-whitelist`) = 138 recognised at v1.15.1; 1 of them (`http2-push-preload`) is a no-op; 12 keys removed since v1.0. |
| Annotation risk (v1.15.1) | 136 | Critical 5, High 10, Medium 45, Low 76. Scope: 48 `ingress`, 88 `location` [D2]. |
| Annotations per group | 150 | G1 7, G2 16, G3 21, G4 17, G5 15 (4 removed), G6 26, G7 14, G8 11, G9 23 (8 removed, 1 deprecated). |
| ConfigMap keys | 233 | 196 accepted by the v1.15.1 decoder (incl. 3 deprecated, 14 undocumented, 2 internal) + 36 removed since v1.0 + 1 key that only exists as a docs misspelling. |
| ConfigMap per group | 233 | G11 67, G12a 96, G12b 70. |
| Controller flags | 87 | 72 flags defined in `pkg/flags/flags.go` + 15 klog flags; all G13. |

## 3. Findings that matter for the tool and the migration offer

1. **annotations-risk.md is the complete list; annotations.md is not.** The summary table of `annotations.md` has
   117 keys; 21 parsed keys are missing from it (`allowlist-source-range`, `auth-always-set-cookie`, `auth-method`,
   `auth-request-redirect`, `auth-response-headers`, `auth-signin`, `auth-signin-redirect-param`,
   `disable-proxy-intercept-errors`, `fastcgi-index`, `fastcgi-params-configmap`, `limit-allowlist`,
   `limit-burst-multiplier`, `limit-rate`, `limit-rate-after`, `limit-rpm`, `limit-whitelist`,
   `opentelemetry-operation-name`, `relative-redirects`, `upstream-hash-by-subset`, `upstream-hash-by-subset-size`,
   `use-port-in-redirects`), and 8 are not mentioned anywhere in the file (`allowlist-source-range`,
   `limit-allowlist`, `relative-redirects`, `use-port-in-redirects`, `disable-proxy-intercept-errors`,
   `opentelemetry-operation-name`, `fastcgi-index`, `fastcgi-params-configmap`) [D1]. `annotations-risk.md`,
   generated from the parsers since v1.12.0 ("Auto-generate annotation docs", PR #11820 [C1]), lists all 136
   primary keys with group, risk and scope [D2]. The FastCGI keys are documented in `fcgi-services.md` [D5].
2. **Two aliases.** `whitelist-source-range` is an alias of `allowlist-source-range` and `limit-whitelist` an alias of
   `limit-allowlist` [S3][S4]. The alias is read only when the primary key is empty [S2]; v1.15.0 fixed the risk
   check to consider aliases (PR #14664) [C5]. The ConfigMap key keeps the old name `whitelist-source-range` [S8].
3. **Annotation prefix is configurable.** `--annotations-prefix` (default `nginx.ingress.kubernetes.io`) [S11]; with
   a custom prefix the admission check rejects Ingresses that still carry `nginx.ingress.kubernetes.io/*` keys [S5].
   The inventory must read the controller args before matching keys. The legacy class annotation
   `kubernetes.io/ingress.class` is not prefixed and is still honoured (`--ingress-class`, marked "[IN DEPRECATION]",
   default `nginx`) [S16][S11].
4. **Hardened defaults since v1.12.0.** `annotations-risk-level` default lowered to `High` (Critical annotations are
   rejected), `allow-cross-namespace-resources` default `false`, `strict-validate-path-type` default `true`,
   `--enable-annotation-validation` default `true`, `--enable-metrics` default `false` [C1]. In v1.15.1
   `allow-snippet-annotations` defaults to `false` [S6], and the admission check rejects any annotation whose key ends
   in `-snippet` while it is false; annotations above the risk level fail with "annotation ... is too risky for
   environment" [S5][S2]. The five Critical keys are `configuration-snippet`, `server-snippet`, `stream-snippet`,
   `auth-snippet`, `modsecurity-snippet` [D2]. A cluster where snippets work has deliberately relaxed both settings,
   which is itself a finding to report.
5. **Removed annotation keys since v1.0 (12).** `enable-influxdb`, `influxdb-measurement`, `influxdb-port`,
   `influxdb-host`, `influxdb-server-name` (InfluxDB removed in v1.7.1, PR #9861) and `secure-verify-ca-secret`
   (already a no-op warning at v1.0.0 [V0]; parser removed in v1.7.1, PR #9862) [C3]; `enable-opentracing` and
   `opentracing-trust-incoming-span` (OpenTracing dropped: breaking change of v1.10.0 [C2]; the parser is present at
   controller-v1.9.4 and absent from the controller-v1.9.5 tag [V9]); `global-rate-limit`, `global-rate-limit-window`,
   `global-rate-limit-key`, `global-rate-limit-ignored-cidrs` (v1.12.0, PR #11851) [C1]. The v1.15.1 admission webhook
   still answers "annotation ... is deprecated" for the five InfluxDB keys and `secure-verify-ca-secret` [S5].
6. **Removed ConfigMap keys since v1.0 (36).** All OpenTracing, Zipkin, Jaeger and Datadog keys (OpenTracing and Zipkin
   modules dropped in v1.10.0 [C2]), `use-geoip` (legacy GeoIP removed in v1.9.3, PR #10495 [C4]; breaking change
   noted in v1.10.0 [C2]), the six `global-rate-limit-*` keys and `plugins` (v1.12.0, PRs #11851 and #11821) [C1].
   `datadog-priority-sampling` existed at v1.0.0 and is gone by v1.9.4 [V0][V9].
7. **configmap.md drifts from the code.** Its table has 192 rows [D3] while the decoder accepts 196 keys [S6][S7][S8]:
   14 accepted keys are not in `configmap.md` at all (`disable-http-access-log`, `disable-stream-access-log`,
   `enable-auth-access-log`, `forwarded-host-header`, `disable-proxy-intercept-errors`, `proxy-http-version`,
   `proxy-max-temp-file-size`, `proxy-redirect-to`, `preserve-trailing-slash`, `use-port-in-redirects`,
   `upstream-hash-by`, `upstream-hash-by-subset`, `upstream-hash-by-subset-size`, `app-root`), 2 have a section but no
   table row (`ssl-early-data`, `global-auth-always-set-cookie`), 2 are internal (`bind-address-ipv4`,
   `bind-address-ipv6`, filled from `bind-address`), and 14 documented keys no longer exist (`use-geoip` and 13
   `jaeger-*` keys), plus `jaeger-trace-baggage-header-prefix`, a misspelling of the former key
   `jaeger-tracer-baggage-header-prefix`.
8. **Keys that are accepted but do nothing.** `http2-push-preload` (annotation): still rendered as
   `http2_push_preload`, but NGINX removed HTTP/2 server push in 1.25.1 and ignores the directive with a warning
   [N1][N2][N3]; v1.15.1 builds NGINX 1.27.1 [S14]. ConfigMap `http2-max-field-size`, `http2-max-header-size`,
   `http2-max-requests` are documented as deprecated [D3] and map to NGINX directives obsolete since 1.19.7 [N1].
   ConfigMap `app-root` and `upstream-hash-by*` decode into `defaults.Backend` but no global consumer was found in the
   v1.15.1 code (the parsers never fall back to them) [S7][S1] (UNVERIFIED at runtime).
9. **Units of `limit-rate`.** The template renders `limit_rate <n>k;` and `limit_rate_after <n>k;`, so both the
   annotation and the ConfigMap key are in kilobytes (per second for `limit-rate`) [S9]; `annotations.md` says
   kilobytes [D1], while `configmap.md` and the code comments say bytes per second [D3][S7].
10. **Rate limits are per replica.** `limit-connections`, `limit-rps` and `limit-rpm` apply per controller replica,
    so the effective limit is multiplied by the number of replicas (and changes with HPA) [D1]. The burst is the limit
    times `limit-burst-multiplier` (default 5) and `limit_req` is rendered with `nodelay` [S4][S9].
11. **Inherited global defaults that a migration silently changes** (ConfigMap defaults the annotations fall back to)
    [S6]: `ssl-redirect` true with `http-redirect-code` 308; `proxy-body-size` 1m; `proxy-connect-timeout` 5 s;
    `proxy-read-timeout`/`proxy-send-timeout` 60 s; `proxy-buffering` off; `proxy-request-buffering` on; `hsts` on with
    max-age 31536000 and includeSubDomains; `ssl-protocols` TLSv1.2 TLSv1.3; `use-forwarded-headers` false;
    `keep-alive` 75 s; `upstream-keepalive-connections` 320; `proxy-next-upstream` "error timeout" with 3 tries;
    `load-balance` effectively `round_robin` (Lua default) [S15].
12. **Flags.** 72 flags in `pkg/flags/flags.go` plus 15 klog flags (Go flags merged into pflag, so `-v` and `--v` both
    work) [S11][S12][K1]. No flag was removed between v1.0.0 and v1.15.1 (22 were added) [V0][S11].
    `cli-arguments.md` omits `--profiler-address` and lists only `-v` of the klog flags [D4].
13. **AKS cross-reference (appRoutingGateway).** Microsoft Learn: managed NGINX of the application routing add-on
    "will stop receiving Azure support from Azure after November 2026"; the application routing Gateway API
    implementation (GatewayClass `approuting-istio`) cannot configure request header and body size limits, Lua
    scripts, or local and global rate limiting, and does not support `EnvoyFilter`; Learn points to the Istio service
    mesh add-on with a gateway-scoped `EnvoyFilter` instead (outside Azure support) [M1]. In key terms: the G5
    `limit-*` annotations, `proxy-body-size`, `client-body-buffer-size`, `large-client-header-buffers`,
    `client-header-buffer-size` and every snippet have no `appRoutingGateway` equivalent.

## 4. Annotations (keys without the `nginx.ingress.kubernetes.io/` prefix)

Legend. **Default**: value applied when the annotation is absent (empty = not set; where the annotation falls back to
a ConfigMap key, the description says so). **Risk**/**Scope**: from `annotations-risk.md` [D2]; for removed keys the
last known risk and the tag it was read from. **Status**: empty = current; `alias` = legacy name still parsed;
`deprecated` = parsed but without effect; `removed` = no parser at v1.15.1 (the tool should report it as removed, not
unknown). Sources for this table: [D1][D2][D5][D6][S1]–[S5][S9][S10] and, for removed keys, [C1]–[C3][V0][V9][V11].

| # | Annotation key | Group | Default | Risk | Scope | Status | Description |
|---|---|---|---|---|---|---|---|
| 1 | `canary` | G1 | `false` | Low | ingress |  | Marks this Ingress as the canary (alternative backend) of the main Ingress with the same host and path. |
| 2 | `canary-by-header` | G1 |  | Medium | ingress |  | Request header that sends traffic to the canary when its value is 'always' and never when 'never'; other values fall through to the next rule. |
| 3 | `canary-by-header-value` | G1 |  | Medium | ingress |  | Exact value of the canary-by-header header that routes to the canary; requires canary-by-header. |
| 4 | `canary-by-header-pattern` | G1 |  | Medium | ingress |  | PCRE regex matched against the canary-by-header value; ignored when canary-by-header-value is set. |
| 5 | `canary-by-cookie` | G1 |  | Medium | ingress |  | Cookie that sends traffic to the canary when its value is 'always' and never when 'never'. |
| 6 | `canary-weight` | G1 | `0` | Low | ingress |  | Share of random requests (0 to canary-weight-total) sent to the canary; precedence is header, then cookie, then weight. |
| 7 | `canary-weight-total` | G1 | `100` | Low | ingress |  | Total weight against which canary-weight is computed. |
| 8 | `rewrite-target` | G2 |  | Medium | ingress |  | URI the matched path is rewritten to before proxying (regex capture groups such as $2 allowed); forces regex location matching for all paths of the host. |
| 9 | `use-regex` | G2 | `false` | Low | location |  | Treats the Ingress paths as case-insensitive regular expressions; the regex modifier then applies to every path of the host. |
| 10 | `app-root` | G2 |  | Medium | location |  | Redirects requests for '/' to this application root path (HTTP 302). |
| 11 | `permanent-redirect` | G2 |  | Medium | location |  | Returns a permanent redirect to this URL instead of proxying (301 unless permanent-redirect-code is set). |
| 12 | `permanent-redirect-code` | G2 | `301` | Low | location |  | Status code used by permanent-redirect. |
| 13 | `temporal-redirect` | G2 |  | Medium | location |  | Returns a temporary redirect to this URL instead of proxying (302 unless temporal-redirect-code is set). |
| 14 | `temporal-redirect-code` | G2 | `302` | Low | location |  | Status code used by temporal-redirect (custom code support added in v1.12.0, PR #10651). |
| 15 | `from-to-www-redirect` | G2 | `false` | Low | location |  | Redirects between www.<host> and <host>; the direction depends on the host declared in the Ingress. |
| 16 | `ssl-redirect` | G2 | `true` | Low | location |  | Redirects HTTP to HTTPS (http-redirect-code, default 308) when the Ingress has TLS; 'false' disables it for this Ingress (global default: ConfigMap ssl-redirect). |
| 17 | `force-ssl-redirect` | G2 | `false` | Medium | location |  | Redirects HTTP to HTTPS even when the Ingress has no TLS section (TLS terminated in front of NGINX). |
| 18 | `preserve-trailing-slash` | G2 | `false` | Medium | location |  | Keeps the trailing slash of the URI when redirecting to HTTPS. |
| 19 | `server-alias` | G2 |  | High | ingress |  | Comma-separated extra server_name values for the host; ignored when an alias collides with an existing host. |
| 20 | `upstream-vhost` | G2 |  | Low | location |  | Overrides the Host header sent to the backend (default $host). |
| 21 | `x-forwarded-prefix` | G2 |  | Medium | location |  | Adds the non-standard X-Forwarded-Prefix header with this value to the backend request. |
| 22 | `relative-redirects` | G2 | `false` | Low | location |  | Makes redirects issued by NGINX relative (absolute_redirect off); global default from ConfigMap relative-redirects; not described in annotations.md. |
| 23 | `use-port-in-redirects` | G2 | `false` | Low | location |  | Includes the port in absolute redirects issued by NGINX (port_in_redirect); global default from the ConfigMap key of the same name; not described in annotations.md. |
| 24 | `auth-type` | G3 |  | Low | location |  | Enables HTTP authentication of type 'basic' or 'digest'. |
| 25 | `auth-secret` | G3 |  | Medium | location |  | Secret (name or namespace/name) holding the basic/digest credentials. |
| 26 | `auth-secret-type` | G3 | `auth-file` | Low | location |  | Format of auth-secret: 'auth-file' (htpasswd in key 'auth') or 'auth-map' (one key per user). |
| 27 | `auth-realm` | G3 |  | Medium | location |  | Realm text shown in the basic/digest authentication challenge. |
| 28 | `auth-url` | G3 |  | High | location |  | URL of an external authentication service called through an auth subrequest for each request (2xx allows, 401/403 deny). |
| 29 | `auth-method` | G3 |  | Low | location |  | HTTP method used for the auth-url subrequest. |
| 30 | `auth-signin` | G3 |  | High | location |  | URL the client is redirected to when external authentication returns 401. |
| 31 | `auth-signin-redirect-param` | G3 | `rd` | Medium | location |  | Query parameter of the auth-signin URL that carries the original URL (the template falls back to 'rd'). |
| 32 | `auth-response-headers` | G3 |  | Medium | location |  | Comma-separated headers copied from the auth response to the backend request. |
| 33 | `auth-request-redirect` | G3 |  | Medium | location |  | Value of the X-Auth-Request-Redirect header sent to the auth service. |
| 34 | `auth-proxy-set-headers` | G3 |  | Medium | location |  | ConfigMap (namespace/name) of headers sent to the auth service. |
| 35 | `auth-cache-key` | G3 |  | Medium | location |  | Enables caching of auth responses with this key (for example $remote_user$http_authorization). |
| 36 | `auth-cache-duration` | G3 | `200 202 401 5m` | Medium | location |  | Cache validity per auth response code (proxy_cache_valid syntax, comma-separated list). |
| 37 | `auth-keepalive` | G3 | `0` | Low | location |  | Max idle keepalive connections to the auth-url upstream (0 disables; no variables allowed in the URL host; docs say it does not work with the HTTP/2 listener). |
| 38 | `auth-keepalive-share-vars` | G3 | `false` | Low | location |  | Shares NGINX variables between the request and the auth subrequest (for example the same X-Request-ID). |
| 39 | `auth-keepalive-requests` | G3 | `1000` | Low | location |  | Max requests served through one keepalive connection to the auth service (when auth-keepalive > 0). |
| 40 | `auth-keepalive-timeout` | G3 | `60` | Low | location |  | Idle timeout in seconds of keepalive connections to the auth service (when auth-keepalive > 0). |
| 41 | `auth-always-set-cookie` | G3 | `false` | Low | location |  | Sets cookies returned by the auth request even when the upstream status is not 200, 201, 204, 206, 301, 302, 303, 304, 307 or 308. |
| 42 | `auth-snippet` | G3 |  | Critical | location |  | Custom NGINX directives for the external auth location (used only with auth-url); snippet. |
| 43 | `enable-global-auth` | G3 | `true` | Low | location |  | 'false' exempts this Ingress from the ConfigMap global-auth-url external authentication. |
| 44 | `satisfy` | G3 |  | Low | location |  | 'any' lets a request pass when any one access check succeeds (for example IP allow-list or auth) instead of all of them. |
| 45 | `auth-tls-secret` | G4 |  | Medium | location |  | Secret (namespace/name) whose ca.crt verifies client certificates (mTLS); applies per host, not per path. |
| 46 | `auth-tls-verify-client` | G4 | `on` | Medium | location |  | Client certificate verification mode: on, off, optional or optional_no_ca. |
| 47 | `auth-tls-verify-depth` | G4 | `1` | Low | location |  | Maximum verification depth of the client certificate chain. |
| 48 | `auth-tls-error-page` | G4 |  | High | location |  | URL or named location the user is redirected to when client certificate authentication fails. |
| 49 | `auth-tls-pass-certificate-to-upstream` | G4 | `false` | Low | location |  | Passes the client certificate (PEM, URL-encoded) to the backend in the ssl-client-cert header. |
| 50 | `auth-tls-match-cn` | G4 |  | High | location |  | Regex the client certificate subject must match (value starts with 'CN='); 403 otherwise. |
| 51 | `ssl-passthrough` | G4 | `false` | Low | ingress |  | Sends the TLS connection unterminated to the backend (L4); requires --enable-ssl-passthrough and makes all other annotations of the Ingress ineffective. |
| 52 | `ssl-ciphers` | G4 |  | Low | ingress |  | ssl_ciphers for the host server block (default: ConfigMap ssl-ciphers). |
| 53 | `ssl-prefer-server-ciphers` | G4 |  | Low | ingress |  | Sets ssl_prefer_server_ciphers on or off for the host server block (default: inherited from the http context). |
| 54 | `backend-protocol` | G4 | `HTTP` | Low | location |  | Protocol used to reach the backend: HTTP, HTTPS, AUTO_HTTP, GRPC, GRPCS or FCGI (case-insensitive). |
| 55 | `proxy-ssl-secret` | G4 |  | Medium | ingress |  | Secret (namespace/name) with tls.crt/tls.key (client certificate) and ca.crt used for TLS to the backend. |
| 56 | `proxy-ssl-verify` | G4 | `off` | Low | ingress |  | Verifies the backend server certificate ('on' or 'off'). |
| 57 | `proxy-ssl-verify-depth` | G4 | `1` | Low | ingress |  | Verification depth of the backend certificate chain. |
| 58 | `proxy-ssl-ciphers` | G4 | `DEFAULT` | Medium | ingress |  | OpenSSL cipher list for TLS connections to the backend. |
| 59 | `proxy-ssl-protocols` | G4 | `TLSv1.2` | Low | ingress |  | TLS protocol versions enabled for connections to the backend. |
| 60 | `proxy-ssl-name` | G4 |  | High | ingress |  | Server name used to verify the backend certificate and sent as SNI (proxy_ssl_name). |
| 61 | `proxy-ssl-server-name` | G4 | `off` | Low | ingress |  | Sends SNI to the backend ('on' or 'off'). |
| 62 | `limit-connections` | G5 |  | Low | location |  | Max concurrent connections from one client IP, per controller replica (limit-conn-status-code, default 503, when exceeded). |
| 63 | `limit-rps` | G5 |  | Low | location |  | Max requests per second from one client IP, per controller replica; burst = limit x limit-burst-multiplier (limit-req-status-code, default 503). |
| 64 | `limit-rpm` | G5 |  | Low | location |  | Max requests per minute from one client IP, per controller replica; burst = limit x limit-burst-multiplier. |
| 65 | `limit-burst-multiplier` | G5 | `5` | Low | location |  | Burst multiplier applied to limit-rps, limit-rpm and limit-connections. |
| 66 | `limit-rate` | G5 | `0` | Low | location |  | Response bandwidth per connection, rendered as limit_rate <n>k (kilobytes per second); 0 disables; needs proxy-buffering on; default from ConfigMap limit-rate. |
| 67 | `limit-rate-after` | G5 | `0` | Low | location |  | Kilobytes sent at full speed before limit-rate applies (limit_rate_after <n>k); needs proxy-buffering on; default from ConfigMap limit-rate-after. |
| 68 | `limit-allowlist` | G5 |  | Low | location |  | Comma-separated client CIDRs exempt from limit-rps, limit-rpm and limit-connections; not described in annotations.md (which documents limit-whitelist). |
| 69 | `limit-whitelist` | G5 |  | Low | location | alias | Legacy alias of limit-allowlist, read only when limit-allowlist is empty; the name documented in annotations.md. |
| 70 | `allowlist-source-range` | G5 |  | Medium | location |  | Comma-separated client CIDRs allowed to reach the location (others are denied, 403); overrides the ConfigMap whitelist-source-range; not described in annotations.md. |
| 71 | `whitelist-source-range` | G5 |  | Medium | location | alias | Legacy alias of allowlist-source-range, read only when allowlist-source-range is empty; the name documented in annotations.md. |
| 72 | `denylist-source-range` | G5 |  | Medium | location |  | Comma-separated client CIDRs denied (403); overrides the ConfigMap denylist-source-range. |
| 73 | `global-rate-limit` | G5 |  | Low (at v1.11.8) | location | removed | REMOVED in v1.12.0 (PR #11851, memcached-backed global rate limiting): max requests per window across replicas. |
| 74 | `global-rate-limit-window` | G5 |  | Low (at v1.11.8) | location | removed | REMOVED in v1.12.0 (PR #11851): time window of global-rate-limit. |
| 75 | `global-rate-limit-key` | G5 |  | High (at v1.11.8) | location | removed | REMOVED in v1.12.0 (PR #11851): key used to count requests (default was $remote_addr). |
| 76 | `global-rate-limit-ignored-cidrs` | G5 |  | Medium (at v1.11.8) | location | removed | REMOVED in v1.12.0 (PR #11851): client CIDRs exempt from global-rate-limit. |
| 77 | `proxy-connect-timeout` | G6 | `5` | Low | location |  | Seconds to establish the backend connection (also sets grpc_connect_timeout for gRPC backends). |
| 78 | `proxy-send-timeout` | G6 | `60` | Low | location |  | Seconds between two successive writes to the backend (also grpc_send_timeout). |
| 79 | `proxy-read-timeout` | G6 | `60` | Low | location |  | Seconds between two successive reads from the backend (also grpc_read_timeout). |
| 80 | `proxy-next-upstream` | G6 | `error timeout` | Medium | location |  | Conditions under which a request is retried on the next endpoint (proxy_next_upstream). |
| 81 | `proxy-next-upstream-timeout` | G6 | `0` | Low | location |  | Time limit in seconds for passing a request to the next endpoint (0 = no limit). |
| 82 | `proxy-next-upstream-tries` | G6 | `3` | Low | location |  | Maximum number of tries across endpoints (0 = no limit). |
| 83 | `proxy-request-buffering` | G6 | `on` | Low | location |  | Buffers the whole client request body before proxying ('on' or 'off'). |
| 84 | `proxy-buffering` | G6 | `off` | Low | location |  | Buffers backend responses ('on' or 'off'). |
| 85 | `proxy-buffers-number` | G6 | `4` | Low | location |  | Number of proxy_buffers used to read the backend response. |
| 86 | `proxy-buffer-size` | G6 | `4k` | Low | location |  | Size of the buffer for the first part of the backend response (headers). |
| 87 | `proxy-busy-buffers-size` | G6 |  | Low | location |  | Max size of buffers busy sending the response to the client; no ingress-nginx default since v1.13.2/v1.14.0, so the NGINX default applies. |
| 88 | `proxy-max-temp-file-size` | G6 | `1024m` | Low | location |  | Max size of the temporary file used to buffer a large backend response (0 disables temp files). |
| 89 | `proxy-body-size` | G6 | `1m` | Medium | location |  | Max client request body size (client_max_body_size); larger requests get 413. |
| 90 | `client-body-buffer-size` | G6 |  | Low | location |  | Buffer size for reading the client request body before spilling to a temp file (default: ConfigMap client-body-buffer-size, 8k). |
| 91 | `upstream-hash-by` | G6 |  | High | location |  | Consistent-hash key (NGINX variables and/or text, for example $request_uri) pinning requests to endpoints; takes precedence over load-balance. |
| 92 | `upstream-hash-by-subset` | G6 | `false` | Low | location |  | Hashes requests to a subset of endpoints instead of a single endpoint. |
| 93 | `upstream-hash-by-subset-size` | G6 | `3` | Low | location |  | Number of endpoints in each hash subset. |
| 94 | `load-balance` | G6 |  | Low | location |  | Per-Ingress load-balancing algorithm: round_robin or ewma (default: ConfigMap load-balance, effectively round_robin). |
| 95 | `custom-http-errors` | G6 |  | Low | location |  | Comma-separated status codes intercepted (proxy_intercept_errors) and served by the default backend; overrides the ConfigMap list. |
| 96 | `disable-proxy-intercept-errors` | G6 | `false` | Low | location |  | Keeps custom-http-errors handling but stops intercepting error responses returned by the service itself; not described in annotations.md. |
| 97 | `default-backend` | G6 |  | Low | location |  | Service (same namespace) used when the backend has no endpoints and for custom-http-errors. |
| 98 | `service-upstream` | G6 | `false` | Low | ingress |  | Proxies to the Service ClusterIP instead of the endpoint list (no sticky sessions, no proxy_next_upstream retries). |
| 99 | `proxy-http-version` | G6 | `1.1` | Low | location |  | HTTP version used towards the backend ('1.0' or '1.1'). |
| 100 | `connection-proxy-header` | G6 |  | Low | location |  | Overrides the Connection header sent to the backend (validated to 'close' or 'keep-alive'). |
| 101 | `proxy-redirect-from` | G6 | `off` | Medium | location |  | First parameter of proxy_redirect: text to replace in Location and Refresh response headers ('off' or 'default' disables). |
| 102 | `proxy-redirect-to` | G6 | `off` | Medium | location |  | Second parameter of proxy_redirect: replacement text (used with proxy-redirect-from). |
| 103 | `affinity` | G7 |  | Low | ingress |  | Enables session affinity; the only supported type is 'cookie'. |
| 104 | `affinity-mode` | G7 | `balanced` | Medium | ingress |  | 'balanced' redistributes some sessions when the deployment scales up; 'persistent' never rebalances. |
| 105 | `affinity-canary-behavior` | G7 | `sticky` | Low | ingress |  | 'sticky' keeps users served by the canary on the canary; 'legacy' ignores affinity for canaries. |
| 106 | `session-cookie-name` | G7 | `INGRESSCOOKIE` | Medium | ingress |  | Name of the affinity cookie. |
| 107 | `session-cookie-path` | G7 |  | Medium | ingress |  | Path attribute of the affinity cookie; required when use-regex is true (cookie paths do not support regex). |
| 108 | `session-cookie-domain` | G7 |  | Medium | ingress |  | Domain attribute of the affinity cookie. |
| 109 | `session-cookie-expires` | G7 |  | Medium | ingress |  | Legacy Expires attribute, in seconds from now (for older browsers). |
| 110 | `session-cookie-max-age` | G7 |  | Medium | ingress |  | Max-Age attribute of the affinity cookie, in seconds. |
| 111 | `session-cookie-samesite` | G7 |  | Low | ingress |  | SameSite attribute of the affinity cookie: None, Lax or Strict. |
| 112 | `session-cookie-conditional-samesite-none` | G7 | `false` | Low | ingress |  | Omits SameSite=None for browsers known to mishandle it. |
| 113 | `session-cookie-secure` | G7 | `false` | Low | ingress |  | Sets the Secure attribute regardless of the request scheme. |
| 114 | `session-cookie-change-on-failure` | G7 | `false` | Low | ingress |  | 'true' re-pins the cookie to another endpoint after a failed attempt; 'false' keeps the sticky endpoint. |
| 115 | `proxy-cookie-domain` | G7 | `off` | Medium | location |  | Rewrites the Domain attribute of Set-Cookie headers from the backend ('off' or 'source replacement'). |
| 116 | `proxy-cookie-path` | G7 | `off` | Medium | location |  | Rewrites the Path attribute of Set-Cookie headers from the backend. |
| 117 | `enable-cors` | G8 | `false` | Low | ingress |  | Enables CORS handling (preflight responses and CORS response headers). |
| 118 | `cors-allow-origin` | G8 | `*` | Medium | ingress |  | Comma-separated allowed origins (scheme://host[:port]; single-level wildcard subdomains allowed). |
| 119 | `cors-allow-methods` | G8 | `GET, PUT, POST, DELETE, PATCH, OPTIONS` | Medium | ingress |  | Access-Control-Allow-Methods value. |
| 120 | `cors-allow-headers` | G8 | `DNT,Keep-Alive,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization` | Medium | ingress |  | Access-Control-Allow-Headers value. |
| 121 | `cors-expose-headers` | G8 |  | Medium | ingress |  | Access-Control-Expose-Headers value. |
| 122 | `cors-allow-credentials` | G8 | `true` | Low | ingress |  | Sets Access-Control-Allow-Credentials. |
| 123 | `cors-max-age` | G8 | `1728000` | Low | ingress |  | Seconds a preflight response may be cached (Access-Control-Max-Age). |
| 124 | `custom-headers` | G8 |  | Medium | location |  | ConfigMap (namespace/name) of response headers added with more_set_headers; each header must be listed in ConfigMap global-allowed-response-headers. |
| 125 | `configuration-snippet` | G8 |  | Critical | location |  | Raw NGINX directives injected into the location block; snippet. |
| 126 | `server-snippet` | G8 |  | Critical | ingress |  | Raw NGINX directives injected into the server block (usable once per host); snippet. |
| 127 | `stream-snippet` | G8 |  | Critical | ingress |  | Raw NGINX directives injected into the stream (TCP/UDP) context; snippet. |
| 128 | `enable-modsecurity` | G9 | `false` | Low | ingress |  | Enables the ModSecurity WAF for the Ingress (Detection-Only with the recommended configuration). |
| 129 | `enable-owasp-core-rules` | G9 | `false` | Low | ingress |  | Enables the OWASP Core Rule Set with ModSecurity. |
| 130 | `modsecurity-transaction-id` | G9 |  | High | ingress |  | NGINX variable passed to ModSecurity as the transaction ID (for example $request_id). |
| 131 | `modsecurity-snippet` | G9 |  | Critical | ingress |  | Custom ModSecurity directives for the Ingress (takes precedence over enable-owasp-core-rules); snippet. |
| 132 | `mirror-target` | G9 |  | High | ingress |  | URI each request is mirrored to (responses ignored; a slow mirror slows the original request). |
| 133 | `mirror-host` | G9 |  | High | ingress |  | Host header of mirrored requests (default: host part of mirror-target). |
| 134 | `mirror-request-body` | G9 | `on` | Low | ingress |  | Sends the request body to the mirror ('on' or 'off'). |
| 135 | `enable-access-log` | G9 | `true` | Low | location |  | 'false' disables the access log for this Ingress. |
| 136 | `enable-rewrite-log` | G9 | `false` | Low | location |  | Enables NGINX rewrite logs (written to the error log at notice level). |
| 137 | `enable-opentelemetry` | G9 |  | Low | location |  | Enables or disables OpenTelemetry tracing for this Ingress (default: ConfigMap enable-opentelemetry, false). |
| 138 | `opentelemetry-trust-incoming-span` | G9 |  | Low | location |  | Uses the incoming trace context as parent span; needs enable-opentelemetry (default: ConfigMap value, true). |
| 139 | `opentelemetry-operation-name` | G9 |  | Medium | location |  | Custom OpenTelemetry span name for the location; not described in annotations.md. |
| 140 | `fastcgi-index` | G9 |  | Medium | location |  | FastCGI index file (fastcgi_index) for backend-protocol FCGI; documented in fcgi-services.md, not annotations.md. |
| 141 | `fastcgi-params-configmap` | G9 |  | Medium | location |  | ConfigMap (namespace/name) of FastCGI parameters for backend-protocol FCGI; documented in fcgi-services.md. |
| 142 | `http2-push-preload` | G9 | `false` | Low | location | deprecated | Still parsed and rendered as http2_push_preload, but NGINX removed HTTP/2 server push in 1.25.1 and ignores the directive with a warning; the v1.15.1 image builds NGINX 1.27.1, so it has no effect. |
| 143 | `enable-opentracing` | G9 |  | Low (at v1.9.4) | location | removed | REMOVED: OpenTracing dropped (breaking change of v1.10.0; already absent from the controller-v1.9.5 tag); use enable-opentelemetry. |
| 144 | `opentracing-trust-incoming-span` | G9 |  | Low (at v1.9.4) | location | removed | REMOVED with OpenTracing (v1.10.0); use opentelemetry-trust-incoming-span. |
| 145 | `enable-influxdb` | G9 |  |  |  | removed | REMOVED in v1.7.1 (PR #9861, InfluxDB feature); the admission webhook still warns that it is deprecated. |
| 146 | `influxdb-measurement` | G9 |  |  |  | removed | REMOVED in v1.7.1 (PR #9861); webhook deprecation warning only. |
| 147 | `influxdb-port` | G9 |  |  |  | removed | REMOVED in v1.7.1 (PR #9861); webhook deprecation warning only. |
| 148 | `influxdb-host` | G9 |  |  |  | removed | REMOVED in v1.7.1 (PR #9861); webhook deprecation warning only. |
| 149 | `influxdb-server-name` | G9 |  |  |  | removed | REMOVED in v1.7.1 (PR #9861); webhook deprecation warning only. |
| 150 | `secure-verify-ca-secret` | G9 |  |  |  | removed | REMOVED: already a no-op at v1.0.0 (log said use proxy-ssl-secret); parser removed in v1.7.1 (PR #9862); webhook deprecation warning only. |

## 5. ConfigMap keys (controller ConfigMap named by `--configmap`)

Legend. **Default**: value of `config.NewDefault()` at v1.15.1 [S6][S7] or the documented effective default; for
removed keys, the last known default marked "(former)". **Status**: empty = current and documented; `undocumented` =
accepted by the decoder but absent from `configmap.md`; `internal` = struct field filled by the controller;
`deprecated` = documented as deprecated; `removed` = no longer decoded; `docs-only` = appears only in the docs.
Unknown keys are ignored by the decoder (mapstructure without ErrorUnused) [S8]. Sources: [D3][S6][S7][S8][S9][S10]
[S15] and, for removed keys, [C1][C2][C4][C6][C9][V0][V9][V11].

| # | ConfigMap key | Group | Default | Status | Description |
|---|---|---|---|---|---|
| 1 | `use-forwarded-headers` | G11 | `false` |  | Trust and pass incoming X-Forwarded-* headers (use behind another L7 proxy that sets them). |
| 2 | `enable-real-ip` | G11 | `false` |  | Enables the NGINX realip module (uses forwarded-for-header and proxy-real-ip-cidr). |
| 3 | `forwarded-for-header` | G11 | `X-Forwarded-For` |  | Header used to identify the originating client IP. |
| 4 | `forwarded-for-proxy-protocol-header` | G11 | `X-Forwarded-For-Proxy-Protocol` |  | Intermediate header used when use-proxy-protocol and use-forwarded-headers are both enabled. |
| 5 | `forwarded-host-header` | G11 | `X-Forwarded-Host` | undocumented | Incoming request header whose value is passed to the backend as X-Original-Forwarded-Host (added v1.13.0, PR #12999); not in configmap.md. |
| 6 | `compute-full-forwarded-for` | G11 | `false` |  | Appends the remote address to X-Forwarded-For instead of replacing it. |
| 7 | `proxy-real-ip-cidr` | G11 | `0.0.0.0/0` |  | Trusted CIDRs of the front load balancer when use-forwarded-headers or use-proxy-protocol is on. |
| 8 | `proxy-add-original-uri-header` | G11 | `false` |  | Adds X-Original-Uri with the original request URI to the backend request. |
| 9 | `generate-request-id` | G11 | `true` |  | Generates a random X-Request-ID when the request has none. |
| 10 | `use-proxy-protocol` | G11 | `false` |  | Accepts the PROXY protocol on listeners to get the real client address. |
| 11 | `proxy-protocol-header-timeout` | G11 | `5s` |  | Max wait for the PROXY protocol header (TLS passthrough handler). |
| 12 | `ssl-protocols` | G11 | `TLSv1.2 TLSv1.3` |  | TLS protocol versions accepted from clients. |
| 13 | `ssl-ciphers` | G11 | `ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256` |  | Client-side cipher list (OpenSSL format); ssl_prefer_server_ciphers is on in the http context. |
| 14 | `ssl-ecdh-curve` | G11 | `auto` |  | Curve(s) for ECDHE ciphers. |
| 15 | `ssl-dh-param` | G11 |  |  | Secret (namespace/name) with Diffie-Hellman parameters (DHE ciphers need it). |
| 16 | `ssl-early-data` | G11 | `false` |  | Enables TLS 1.3 0-RTT early data (replay risk); has a configmap.md section but is missing from its table. |
| 17 | `ssl-session-cache` | G11 | `true` |  | Shared TLS session cache between workers. |
| 18 | `ssl-session-cache-size` | G11 | `10m` |  | Size of the shared TLS session cache. |
| 19 | `ssl-session-tickets` | G11 | `false` |  | Enables TLS session tickets. |
| 20 | `ssl-session-ticket-key` | G11 |  |  | Base64 key used to encrypt session tickets (random key when empty). |
| 21 | `ssl-session-timeout` | G11 | `10m` |  | Time a client may reuse cached TLS session parameters. |
| 22 | `ssl-buffer-size` | G11 | `4k` |  | TLS send buffer size (small value improves time to first byte). |
| 23 | `ssl-reject-handshake` | G11 | `false` |  | Rejects TLS handshakes for unknown server names instead of serving the default certificate. |
| 24 | `enable-ocsp` | G11 | `false` |  | Enables OCSP stapling. |
| 25 | `proxy-ssl-location-only` | G11 | `false` |  | Applies proxy-ssl-* annotation settings at location level only (not server level). |
| 26 | `hsts` | G11 | `true` |  | Sends Strict-Transport-Security on HTTPS servers. |
| 27 | `hsts-include-subdomains` | G11 | `true` |  | Adds includeSubDomains to the HSTS header. |
| 28 | `hsts-max-age` | G11 | `31536000` |  | HSTS max-age in seconds. |
| 29 | `hsts-preload` | G11 | `false` |  | Adds the preload directive to the HSTS header. |
| 30 | `ssl-redirect` | G11 | `true` |  | Global HTTP to HTTPS redirect for servers with a TLS certificate (code from http-redirect-code, default 308; the configmap.md section text says 301). |
| 31 | `force-ssl-redirect` | G11 | `false` |  | Global HTTP to HTTPS redirect even without TLS on the Ingress. |
| 32 | `http-redirect-code` | G11 | `308` |  | Status code for HTTP to HTTPS redirects: 301, 302, 307 or 308. |
| 33 | `no-tls-redirect-locations` | G11 | `/.well-known/acme-challenge` |  | Comma-separated locations never redirected to HTTPS. |
| 34 | `preserve-trailing-slash` | G11 | `false` | undocumented | Global default of the preserve-trailing-slash annotation (keeps trailing slash on the HTTPS redirect); not in configmap.md. |
| 35 | `relative-redirects` | G11 | `false` |  | Makes NGINX-issued redirects relative (absolute_redirect off). |
| 36 | `use-port-in-redirects` | G11 | `false` | undocumented | Global default of the use-port-in-redirects annotation (port_in_redirect); not in configmap.md. |
| 37 | `proxy-body-size` | G11 | `1m` |  | Global max client request body size (client_max_body_size, 413 above it). |
| 38 | `client-header-buffer-size` | G11 | `1k` |  | Buffer for reading the client request header. |
| 39 | `large-client-header-buffers` | G11 | `4 8k` |  | Number and size of buffers for large request headers (effective request line/header size limit). |
| 40 | `http2-max-field-size` | G11 |  | deprecated | DEPRECATED (docs: since 1.1.3); NGINX directive obsolete since 1.19.7, use large-client-header-buffers. |
| 41 | `http2-max-header-size` | G11 |  | deprecated | DEPRECATED (docs: since 1.1.3); NGINX directive obsolete since 1.19.7, use large-client-header-buffers. |
| 42 | `http2-max-requests` | G11 | `0` | deprecated | DEPRECATED (docs: since 1.1.3); NGINX directive obsolete since 1.19.7, use keep-alive-requests. |
| 43 | `http2-max-concurrent-streams` | G11 | `128` |  | Max concurrent HTTP/2 streams per connection. |
| 44 | `use-http2` | G11 | `true` |  | Enables HTTP/2 on TLS listeners. |
| 45 | `client-header-timeout` | G11 | `60` |  | Timeout in seconds for reading the client request header. |
| 46 | `client-body-timeout` | G11 | `60` |  | Timeout in seconds between reads of the client request body. |
| 47 | `proxy-connect-timeout` | G11 | `5` |  | Global backend connect timeout in seconds (also gRPC). |
| 48 | `proxy-read-timeout` | G11 | `60` |  | Global backend read timeout in seconds (also gRPC). |
| 49 | `proxy-send-timeout` | G11 | `60` |  | Global backend send timeout in seconds (also gRPC). |
| 50 | `proxy-next-upstream` | G11 | `error timeout` |  | Global conditions for retrying on the next endpoint. |
| 51 | `proxy-next-upstream-timeout` | G11 | `0` |  | Global time limit for retries in seconds (0 = none). |
| 52 | `proxy-next-upstream-tries` | G11 | `3` |  | Global max number of tries (0 = no limit). |
| 53 | `retry-non-idempotent` | G11 | `false` |  | Also retries non-idempotent requests (POST, LOCK, PATCH) on upstream errors. |
| 54 | `proxy-stream-timeout` | G11 | `600s` |  | TCP/UDP proxy idle timeout between reads or writes. |
| 55 | `proxy-stream-next-upstream` | G11 | `true` |  | TCP/UDP: try the next endpoint when the connection fails. |
| 56 | `proxy-stream-next-upstream-timeout` | G11 | `600s` |  | TCP/UDP: time limit for passing a connection to the next endpoint (0 = none). |
| 57 | `proxy-stream-next-upstream-tries` | G11 | `3` |  | TCP/UDP: max tries (0 = no limit). |
| 58 | `proxy-stream-responses` | G11 | `1` |  | UDP: number of datagrams expected from the backend per request. |
| 59 | `keep-alive` | G11 | `75` |  | Client keepalive timeout in seconds (0 disables; breaks concurrent HTTP/2 per docs). |
| 60 | `keep-alive-requests` | G11 | `1000` |  | Max requests per client keepalive connection. |
| 61 | `upstream-keepalive-connections` | G11 | `320` |  | Idle keepalive connections to backends kept per worker. |
| 62 | `upstream-keepalive-time` | G11 | `1h` |  | Max lifetime of a backend keepalive connection. |
| 63 | `upstream-keepalive-timeout` | G11 | `60` |  | Idle timeout in seconds of backend keepalive connections. |
| 64 | `upstream-keepalive-requests` | G11 | `10000` |  | Max requests per backend keepalive connection. |
| 65 | `proxy-http-version` | G11 | `1.1` | undocumented | Global default HTTP version towards backends (annotation fallback); not in configmap.md. |
| 66 | `enable-underscores-in-headers` | G11 | `false` |  | Accepts header names containing underscores. |
| 67 | `ignore-invalid-headers` | G11 | `true` |  | Ignores request headers with invalid names. |
| 68 | `allow-snippet-annotations` | G12a | `false` |  | Allows *-snippet annotations on Ingresses (the admission check rejects them when false). |
| 69 | `main-snippet` | G12a |  |  | Raw NGINX configuration added to the main context. |
| 70 | `http-snippet` | G12a |  |  | Raw NGINX configuration added to the http context. |
| 71 | `server-snippet` | G12a |  |  | Raw NGINX configuration added to every server block. |
| 72 | `location-snippet` | G12a |  |  | Raw NGINX configuration added to every location block. |
| 73 | `stream-snippet` | G12a |  |  | Raw NGINX configuration added to the stream context. |
| 74 | `global-auth-snippet` | G12a |  |  | Custom snippet for the global external auth location (global equivalent of auth-snippet). |
| 75 | `enable-modsecurity` | G12a | `false` |  | Loads and enables the ModSecurity module for all paths. |
| 76 | `enable-owasp-modsecurity-crs` | G12a | `false` |  | Enables the OWASP ModSecurity Core Rule Set globally. |
| 77 | `modsecurity-snippet` | G12a |  |  | Custom rules added to the global ModSecurity configuration. |
| 78 | `use-gzip` | G12a | `false` |  | Enables gzip compression of responses. |
| 79 | `gzip-level` | G12a | `1` |  | gzip compression level. |
| 80 | `gzip-min-length` | G12a | `256` |  | Minimum response length in bytes to gzip. |
| 81 | `gzip-types` | G12a | `application/atom+xml application/javascript application/x-javascript application/json application/rss+xml application/vnd.ms-fontobject application/x-font-ttf application/x-web-app-manifest+json application/xhtml+xml application/xml font/opentype image/svg+xml image/x-icon text/css text/javascript text/plain text/x-component` |  | MIME types gzipped in addition to text/html. |
| 82 | `gzip-disable` | G12a |  |  | User-Agent regexes for which gzip is disabled. |
| 83 | `enable-brotli` | G12a | `false` |  | Enables Brotli compression. |
| 84 | `brotli-level` | G12a | `4` |  | Brotli compression level. |
| 85 | `brotli-min-length` | G12a | `20` |  | Minimum response length in bytes for Brotli. |
| 86 | `brotli-types` | G12a | `application/xml+rss application/atom+xml application/javascript application/x-javascript application/json application/rss+xml application/vnd.ms-fontobject application/x-font-ttf application/x-web-app-manifest+json application/xhtml+xml application/xml font/opentype image/svg+xml image/x-icon text/css text/javascript text/plain text/x-component` |  | MIME types compressed with Brotli. |
| 87 | `access-log-path` | G12a | `/var/log/nginx/access.log` |  | Access log path for http and stream (symlink to stdout). |
| 88 | `http-access-log-path` | G12a |  |  | Access log path for the http context (falls back to access-log-path). |
| 89 | `stream-access-log-path` | G12a |  |  | Access log path for the stream context (falls back to access-log-path). |
| 90 | `access-log-params` | G12a |  |  | Extra access_log parameters (for example buffer=16k gzip flush=1m). |
| 91 | `disable-access-log` | G12a | `false` |  | Disables access logs for http and stream. |
| 92 | `disable-http-access-log` | G12a | `false` | undocumented | Disables the http-context access log only; not in configmap.md. |
| 93 | `disable-stream-access-log` | G12a | `false` | undocumented | Disables the stream-context access log only; not in configmap.md. |
| 94 | `enable-access-log-for-default-backend` | G12a | `false` |  | Logs requests served by the default backend. |
| 95 | `enable-auth-access-log` | G12a | `false` | undocumented | Enables access logs for external auth subrequests; not in configmap.md. |
| 96 | `skip-access-log-urls` | G12a |  |  | Comma-separated URLs excluded from the access log. |
| 97 | `log-format-upstream` | G12a | `$remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent" $request_length $request_time [$proxy_upstream_name] [$proxy_alternative_upstream_name] $upstream_addr $upstream_response_length $upstream_response_time $upstream_status $req_id` |  | HTTP access log format. |
| 98 | `log-format-stream` | G12a | `[$remote_addr] [$time_local] $protocol $status $bytes_sent $bytes_received $session_time` |  | Stream (TCP/UDP) access log format. |
| 99 | `log-format-escape-json` | G12a | `false` |  | JSON escaping of variables in log formats. |
| 100 | `log-format-escape-none` | G12a | `false` |  | Disables escaping of variables in log formats. |
| 101 | `error-log-path` | G12a | `/var/log/nginx/error.log` |  | Error log path (symlink to stderr). |
| 102 | `error-log-level` | G12a | `notice` |  | Error log level (debug when the controller runs with -v=5 or more). |
| 103 | `enable-syslog` | G12a | `false` |  | Sends access and error logs to syslog. |
| 104 | `syslog-host` | G12a |  |  | Syslog server address. |
| 105 | `syslog-port` | G12a | `514` |  | Syslog server port. |
| 106 | `debug-connections` | G12a |  |  | Client IPs/CIDRs for which debug logging is enabled (debug_connection). |
| 107 | `enable-opentelemetry` | G12a | `false` |  | Enables the OpenTelemetry module globally. |
| 108 | `opentelemetry-trust-incoming-span` | G12a | `true` |  | Uses incoming trace context as parent span. |
| 109 | `opentelemetry-operation-name` | G12a |  |  | Custom name of the server span. |
| 110 | `opentelemetry-config` | G12a | `/etc/ingress-controller/telemetry/opentelemetry.toml` |  | OpenTelemetry module config file. |
| 111 | `otlp-collector-host` | G12a |  |  | OTLP collector host. |
| 112 | `otlp-collector-port` | G12a | `4317` |  | OTLP collector port. |
| 113 | `otel-service-name` | G12a | `nginx` |  | service.name of exported traces. |
| 114 | `otel-sampler` | G12a | `AlwaysOn` |  | Sampler: AlwaysOff, AlwaysOn, TraceIdRatioBased or remote. |
| 115 | `otel-sampler-ratio` | G12a | `0.01` |  | Sampling ratio for TraceIdRatioBased. |
| 116 | `otel-sampler-parent-based` | G12a | `true` |  | Parent-based sampling. |
| 117 | `otel-max-queuesize` | G12a | `2048` |  | Max span queue size of the batch exporter. |
| 118 | `otel-schedule-delay-millis` | G12a | `5000` |  | Batch export delay in milliseconds. |
| 119 | `otel-max-export-batch-size` | G12a | `512` |  | Max spans per export batch. |
| 120 | `nginx-status-ipv4-whitelist` | G12a | `127.0.0.1` |  | IPv4 CIDRs allowed to reach /nginx_status on the default server. |
| 121 | `nginx-status-ipv6-whitelist` | G12a | `::1` |  | IPv6 CIDRs allowed to reach /nginx_status on the default server. |
| 122 | `whitelist-source-range` | G12a |  |  | Global client CIDR allow-list for every server (per-Ingress allowlist-source-range overrides it). |
| 123 | `denylist-source-range` | G12a |  |  | Global client CIDR deny-list (per-Ingress annotation overrides it). |
| 124 | `block-cidrs` | G12a |  |  | Client IPs/CIDRs blocked globally. |
| 125 | `block-user-agents` | G12a |  |  | User-Agent strings or regexes blocked globally. |
| 126 | `block-referers` | G12a |  |  | Referer strings or regexes blocked globally. |
| 127 | `custom-http-errors` | G12a |  |  | Status codes sent to the default backend for custom error pages (enables proxy_intercept_errors). |
| 128 | `disable-proxy-intercept-errors` | G12a | `false` | undocumented | Global: keep custom-http-errors without intercepting backend errors; not in configmap.md. |
| 129 | `add-headers` | G12a |  |  | ConfigMap (namespace/name) of headers added to every client response. |
| 130 | `proxy-set-headers` | G12a |  |  | ConfigMap (namespace/name) of headers added to every backend request. |
| 131 | `hide-headers` | G12a |  |  | Backend response headers not passed to clients. |
| 132 | `allow-backend-server-header` | G12a | `false` |  | Returns the backend Server header instead of the generic one. |
| 133 | `server-tokens` | G12a | `false` |  | Sends the NGINX version in the Server header and error pages. |
| 134 | `global-allowed-response-headers` | G12a |  |  | Response headers the custom-headers annotation is allowed to set. |
| 135 | `enable-opentracing` | G12a | `false (former)` | removed | REMOVED with OpenTracing (v1.10.0 breaking change); use enable-opentelemetry. |
| 136 | `opentracing-operation-name` | G12a |  | removed | REMOVED with OpenTracing (v1.10.0); use opentelemetry-operation-name. |
| 137 | `opentracing-location-operation-name` | G12a |  | removed | REMOVED with OpenTracing (v1.10.0). |
| 138 | `opentracing-trust-incoming-span` | G12a | `true (former)` | removed | REMOVED with OpenTracing (v1.10.0); use opentelemetry-trust-incoming-span. |
| 139 | `zipkin-collector-host` | G12a |  | removed | REMOVED with Zipkin (v1.10.0). |
| 140 | `zipkin-collector-port` | G12a | `9411 (former)` | removed | REMOVED with Zipkin (v1.10.0). |
| 141 | `zipkin-service-name` | G12a | `nginx (former)` | removed | REMOVED with Zipkin (v1.10.0). |
| 142 | `zipkin-sample-rate` | G12a | `1.0 (former)` | removed | REMOVED with Zipkin (v1.10.0). |
| 143 | `jaeger-collector-host` | G12a |  | removed | REMOVED with OpenTracing/Jaeger (v1.10.0); still listed in v1.15.1 configmap.md. |
| 144 | `jaeger-collector-port` | G12a | `6831 (former)` | removed | REMOVED (v1.10.0); still listed in configmap.md. |
| 145 | `jaeger-endpoint` | G12a |  | removed | REMOVED (v1.10.0); still listed in configmap.md. |
| 146 | `jaeger-service-name` | G12a | `nginx (former)` | removed | REMOVED (v1.10.0); still listed in configmap.md. |
| 147 | `jaeger-propagation-format` | G12a | `jaeger (former)` | removed | REMOVED (v1.10.0); still listed in configmap.md. |
| 148 | `jaeger-sampler-type` | G12a | `const (former)` | removed | REMOVED (v1.10.0); still listed in configmap.md. |
| 149 | `jaeger-sampler-param` | G12a | `1 (former)` | removed | REMOVED (v1.10.0); still listed in configmap.md. |
| 150 | `jaeger-sampler-host` | G12a | `http://127.0.0.1 (former)` | removed | REMOVED (v1.10.0); still listed in configmap.md. |
| 151 | `jaeger-sampler-port` | G12a | `5778 (former)` | removed | REMOVED (v1.10.0); still listed in configmap.md. |
| 152 | `jaeger-trace-context-header-name` | G12a | `uber-trace-id (former, per docs)` | removed | REMOVED (v1.10.0); still listed in configmap.md. |
| 153 | `jaeger-debug-header` | G12a | `jaeger-debug-id (former, per code comment)` | removed | REMOVED (v1.10.0); configmap.md table says uber-debug-id, its section says jaeger-debug-id. |
| 154 | `jaeger-baggage-header` | G12a | `jaeger-baggage (former)` | removed | REMOVED (v1.10.0); still listed in configmap.md. |
| 155 | `jaeger-tracer-baggage-header-prefix` | G12a | `uberctx- (former, per docs)` | removed | REMOVED (v1.10.0); the real former key (configmap.md section heading). |
| 156 | `jaeger-trace-baggage-header-prefix` | G12a |  | docs-only | Spelling used only in the configmap.md table; never a key in code (the key was jaeger-tracer-baggage-header-prefix). |
| 157 | `datadog-collector-host` | G12a |  | removed | REMOVED with Datadog OpenTracing (gone by v1.10.0; docs cleaned in v1.14.0, PR #13850). |
| 158 | `datadog-collector-port` | G12a | `8126 (former)` | removed | REMOVED (gone by v1.10.0). |
| 159 | `datadog-service-name` | G12a | `nginx (former)` | removed | REMOVED (gone by v1.10.0). |
| 160 | `datadog-environment` | G12a | `prod (former)` | removed | REMOVED (gone by v1.10.0). |
| 161 | `datadog-operation-name-override` | G12a | `nginx.handle (former)` | removed | REMOVED (gone by v1.10.0). |
| 162 | `datadog-sample-rate` | G12a |  | removed | REMOVED (gone by v1.10.0). |
| 163 | `datadog-priority-sampling` | G12a | `true (former, v1.0.0)` | removed | REMOVED (present at v1.0.0, absent at v1.9.4; v1.9.0 revised Datadog sampling, PR #10151). |
| 164 | `worker-processes` | G12b | `<number of CPUs>` |  | Number of NGINX worker processes ('auto' = CPU count). |
| 165 | `worker-cpu-affinity` | G12b |  |  | Binds workers to CPUs (cpumask or auto). |
| 166 | `worker-shutdown-timeout` | G12b | `240s` |  | Graceful shutdown timeout of old workers after a reload. |
| 167 | `max-worker-connections` | G12b | `16384` |  | worker_connections per worker (0 = max-worker-open-files). |
| 168 | `max-worker-open-files` | G12b | `0` |  | worker_rlimit_nofile (0 = system limit minus 1024). |
| 169 | `enable-multi-accept` | G12b | `true` |  | Workers accept all new connections at once. |
| 170 | `enable-serial-reloads` | G12b | `false` |  | Serialises reloads to cap the number of old workers (OOM protection). |
| 171 | `enable-aio-write` | G12b | `true` |  | Asynchronous file writes (aio_write). |
| 172 | `reuse-port` | G12b | `true` |  | SO_REUSEPORT listening socket per worker. |
| 173 | `client-body-buffer-size` | G12b | `8k` |  | Buffer for reading the client request body. |
| 174 | `proxy-buffering` | G12b | `off` |  | Global response buffering. |
| 175 | `proxy-buffers-number` | G12b | `4` |  | Global number of proxy buffers. |
| 176 | `proxy-buffer-size` | G12b | `4k` |  | Global size of the response header buffer. |
| 177 | `proxy-busy-buffers-size` | G12b |  |  | Global busy buffers size (empty = NGINX default; default value removed in v1.13.2/v1.14.0). |
| 178 | `proxy-max-temp-file-size` | G12b | `1024m` | undocumented | Global max temp file size for buffered responses (annotation fallback); not in configmap.md. |
| 179 | `proxy-request-buffering` | G12b | `on` |  | Global request body buffering ('on' or 'off'). |
| 180 | `grpc-buffer-size-kb` | G12b | `0` |  | grpc_buffer_size in KB (0 = NGINX default). |
| 181 | `map-hash-bucket-size` | G12b | `64` |  | Bucket size of map hash tables. |
| 182 | `server-name-hash-max-size` | G12b | `1024` |  | Max size of the server names hash table. |
| 183 | `server-name-hash-bucket-size` | G12b | `auto` |  | Bucket size of the server names hash (raised automatically for long host names; docs: CPU cache line size). |
| 184 | `proxy-headers-hash-max-size` | G12b | `512` |  | Max size of the proxy headers hash. |
| 185 | `proxy-headers-hash-bucket-size` | G12b | `64` |  | Bucket size of the proxy headers hash. |
| 186 | `variables-hash-bucket-size` | G12b | `256` |  | Bucket size of the variables hash. |
| 187 | `variables-hash-max-size` | G12b | `2048` |  | Max size of the variables hash. |
| 188 | `lua-shared-dicts` | G12b |  |  | Overrides or adds Lua shared dicts (built-in: configuration_data 20M, certificate_data 20M, balancer_ewma 10M, balancer_ewma_last_touched_at 10M, balancer_ewma_locks 1M, certificate_servers 5M, ocsp_response_cache 5M). |
| 189 | `disable-ipv6-dns` | G12b | `false` |  | Disables IPv6 lookups in the NGINX resolver (set automatically when the pod has no IPv6). |
| 190 | `disable-ipv6` | G12b | `false` |  | Disables IPv6 listeners. |
| 191 | `bind-address` | G12b |  |  | Addresses NGINX listens on instead of * (must exist in the pod). |
| 192 | `bind-address-ipv4` | G12b |  | internal | Internal field filled from bind-address; not documented; do not set directly. |
| 193 | `bind-address-ipv6` | G12b |  | internal | Internal field filled from bind-address; not documented; do not set directly. |
| 194 | `default-type` | G12b | `text/html` |  | Default MIME type of responses. |
| 195 | `load-balance` | G12b | `round_robin` |  | Global load-balancing algorithm: round_robin or ewma. |
| 196 | `service-upstream` | G12b | `false` |  | Global: proxy to Service ClusterIP instead of endpoints. |
| 197 | `upstream-hash-by` | G12b |  | undocumented | Accepted by the decoder (defaults.Backend field) but no global consumer found in v1.15.1 code; use the annotation. |
| 198 | `upstream-hash-by-subset` | G12b | `false` | undocumented | Accepted by the decoder; no global consumer found in v1.15.1 code; use the annotation. |
| 199 | `upstream-hash-by-subset-size` | G12b | `0` | undocumented | Accepted by the decoder; no global consumer found in v1.15.1 code; use the annotation (default 3). |
| 200 | `proxy-cookie-domain` | G12b | `off` |  | Global Set-Cookie Domain rewrite. |
| 201 | `proxy-cookie-path` | G12b | `off` |  | Global Set-Cookie Path rewrite. |
| 202 | `proxy-redirect-from` | G12b | `off` |  | Global proxy_redirect source text. |
| 203 | `proxy-redirect-to` | G12b | `off` | undocumented | Global proxy_redirect replacement text (annotation fallback); not in configmap.md. |
| 204 | `app-root` | G12b |  | undocumented | Accepted by the decoder (defaults.Backend field) but the app-root parser never reads it: no global effect found in v1.15.1 code. |
| 205 | `limit-rate` | G12b | `0` |  | Global response rate per connection, rendered as limit_rate <n>k (kilobytes per second; configmap.md wrongly says bytes). |
| 206 | `limit-rate-after` | G12b | `0` |  | Global kilobytes sent before limit-rate applies (limit_rate_after <n>k). |
| 207 | `limit-req-status-code` | G12b | `503` |  | Status returned when limit-rps or limit-rpm rejects a request. |
| 208 | `limit-conn-status-code` | G12b | `503` |  | Status returned when limit-connections rejects a connection. |
| 209 | `limit-conn-zone-variable` | G12b | `$binary_remote_addr` |  | Key of the limit_conn_zone used by limit-connections. |
| 210 | `global-auth-url` | G12b |  |  | External auth URL applied to all locations (opt out per Ingress with enable-global-auth false). |
| 211 | `global-auth-method` | G12b |  |  | HTTP method of the global auth subrequest. |
| 212 | `global-auth-signin` | G12b |  |  | Sign-in URL for global auth 401 responses. |
| 213 | `global-auth-signin-redirect-param` | G12b | `rd` |  | Query parameter carrying the original URL on global sign-in redirects. |
| 214 | `global-auth-response-headers` | G12b |  |  | Headers copied from the global auth response to the backend request. |
| 215 | `global-auth-request-redirect` | G12b |  |  | X-Auth-Request-Redirect value for global auth. |
| 216 | `global-auth-cache-key` | G12b |  |  | Cache key enabling caching of global auth responses. |
| 217 | `global-auth-cache-duration` | G12b | `200 202 401 5m` |  | Cache validity per global auth response code. |
| 218 | `global-auth-always-set-cookie` | G12b | `false` |  | Sets cookies from the global auth response even on non-2xx/3xx upstream status; section in configmap.md but missing from its table. |
| 219 | `no-auth-locations` | G12b | `/.well-known/acme-challenge` |  | Comma-separated locations exempt from global auth. |
| 220 | `allow-cross-namespace-resources` | G12b | `false` |  | Allows annotations to reference Secrets/ConfigMaps in other namespaces (default false since v1.12.0). |
| 221 | `annotations-risk-level` | G12b | `High` |  | Highest annotation risk accepted: Critical, High, Medium or Low (default lowered to High in v1.12.0, so Critical annotations are rejected). |
| 222 | `annotation-value-word-blocklist` | G12b |  |  | Comma-separated words that make an annotation value (and its Ingress) be rejected (CVE-2021-25742 mitigation). |
| 223 | `strict-validate-path-type` | G12b | `true` |  | Rejects Exact/Prefix paths with characters other than alphanumerics, -, _ and / (default true since v1.12.0). |
| 224 | `use-geoip2` | G12b | `false` |  | Enables the GeoIP2 module (needs --maxmind-license-key or mounted databases). |
| 225 | `geoip2-autoreload-in-minutes` | G12b | `0` |  | GeoIP2 database auto-reload interval in minutes (0 = off). |
| 226 | `use-geoip` | G12b | `true (former)` | removed | REMOVED: legacy GeoIP dropped (PR #10495 in v1.9.3; breaking change of v1.10.0); still listed in v1.15.1 configmap.md. |
| 227 | `plugins` | G12b |  | removed | REMOVED in v1.12.0 (PR #11821, third-party Lua plugins). |
| 228 | `global-rate-limit-memcached-host` | G12b |  | removed | REMOVED in v1.12.0 (PR #11851, global rate limiting). |
| 229 | `global-rate-limit-memcached-port` | G12b | `11211 (former)` | removed | REMOVED in v1.12.0 (PR #11851). |
| 230 | `global-rate-limit-memcached-connect-timeout` | G12b | `50 (former)` | removed | REMOVED in v1.12.0 (PR #11851). |
| 231 | `global-rate-limit-memcached-max-idle-timeout` | G12b | `10000 (former)` | removed | REMOVED in v1.12.0 (PR #11851). |
| 232 | `global-rate-limit-memcached-pool-size` | G12b | `50 (former)` | removed | REMOVED in v1.12.0 (PR #11851). |
| 233 | `global-rate-limit-status-code` | G12b | `429 (former)` | removed | REMOVED in v1.12.0 (PR #11851). |

## 6. Controller command-line flags (G13)

Rows 1–72 are defined in `pkg/flags/flags.go` at v1.15.1 [S11]; rows 73–87 are the klog v2.140.0 flags registered
by `klog.InitFlags(nil)` and merged with `AddGoFlagSet` [S12][S13][K1]. Defaults are as printed by the flag library
(klog thresholds print as numbers). The SPEC allowlist (`--controller-class`, `--ingress-class`,
`--watch-ingress-without-class`, `--ingress-class-by-name`, `--configmap`, `--tcp-services-configmap`,
`--udp-services-configmap`, `--default-ssl-certificate`, `--enable-ssl-passthrough`, `--annotations-prefix`,
`--watch-namespace`, `--default-backend-service`, `--publish-service`) is a subset of rows 1–72.

| # | Flag | Group | Default | Description |
|---|---|---|---|---|
| 1 | `--annotations-prefix` | G13 | `nginx.ingress.kubernetes.io` | Prefix of the Ingress annotations read by this controller. |
| 2 | `--apiserver-host` | G13 |  | Kubernetes API server address (protocol://address:port); in-cluster discovery when empty. |
| 3 | `--bucket-factor` | G13 | `0` | Bucket factor for native histograms (> 1 enables native histograms). |
| 4 | `--certificate-authority` | G13 |  | CA certificate file used only with --apiserver-host. |
| 5 | `--configmap` | G13 |  | Name (namespace/name) of the ConfigMap with the global controller configuration. |
| 6 | `--controller-class` | G13 | `k8s.io/ingress-nginx` | IngressClass spec.controller value this controller satisfies. |
| 7 | `--deep-inspect` | G13 | `true` | Enables the Ingress object security deep inspector. |
| 8 | `--default-backend-service` | G13 |  | Service (namespace/name) for requests matching no server (catch-all); first port used. |
| 9 | `--default-server-port` | G13 | `8181` | Port of the default (catch-all) server. |
| 10 | `--default-ssl-certificate` | G13 |  | Secret (namespace/name) with the certificate of the default HTTPS server. |
| 11 | `--disable-catch-all` | G13 | `false` | Disables support for catch-all Ingresses (spec.defaultBackend). |
| 12 | `--disable-full-test` | G13 | `false` | Admission webhook tests only the Ingress being changed instead of all merged Ingresses. |
| 13 | `--disable-leader-election` | G13 | `false` | Disables leader election. |
| 14 | `--disable-svc-external-name` | G13 | `false` | Disables Services of type ExternalName as backends. |
| 15 | `--disable-sync-events` | G13 | `false` | Does not create 'Sync' Event resources (still logged). |
| 16 | `--dynamic-configuration-retries` | G13 | `15` | Retries of failed dynamic (Lua) configuration before failing the sync. |
| 17 | `--election-id` | G13 | `ingress-controller-leader` | Election id used for leader election and status updates. |
| 18 | `--election-ttl` | G13 | `30s` | Duration a leader election is valid before re-election. |
| 19 | `--enable-annotation-validation` | G13 | `true` | Validates annotation values (default true since v1.12.0). |
| 20 | `--enable-metrics` | G13 | `false` | Enables Prometheus metrics collection (default false since v1.12.0). |
| 21 | `--enable-ssl-chain-completion` | G13 | `false` | Completes certificate chains with missing intermediates (needs the AIA extension). |
| 22 | `--enable-ssl-passthrough` | G13 | `false` | Enables SSL passthrough (required by the ssl-passthrough annotation). |
| 23 | `--enable-topology-aware-routing` | G13 | `false` | Topology aware routing (Service annotation service.kubernetes.io/topology-mode auto or trafficDistribution). |
| 24 | `--exclude-socket-metrics` | G13 | `[]` | Socket request metrics to exclude from export and computation. |
| 25 | `--health-check-path` | G13 | `/healthz` | URL path of the health check endpoint on the NGINX status server. |
| 26 | `--health-check-timeout` | G13 | `10` | Time limit in seconds for a health check probe. |
| 27 | `--healthz-host` | G13 |  | Address to bind the healthz endpoint. |
| 28 | `--healthz-port` | G13 | `10254` | Port of the healthz endpoint. |
| 29 | `--http-port` | G13 | `80` | Port for HTTP traffic. |
| 30 | `--https-port` | G13 | `443` | Port for HTTPS traffic. |
| 31 | `--ingress-class` | G13 | `nginx` | [IN DEPRECATION] Ingress class name (legacy kubernetes.io/ingress.class annotation value); --controller-class takes precedence. |
| 32 | `--ingress-class-by-name` | G13 | `false` | Also watch IngressClasses by name, together with the controller class. |
| 33 | `--internal-logger-address` | G13 | `127.0.0.1:11514` | Address of the internal syslog listener. |
| 34 | `--kubeconfig` | G13 |  | Path to a kubeconfig file. |
| 35 | `--length-buckets` | G13 | `[10,20,30,40,50,60,70,80,90,100]` | Histogram buckets for request/response length metrics. |
| 36 | `--max-buckets` | G13 | `100` | Maximum number of buckets for native histograms. |
| 37 | `--maxmind-edition-ids` | G13 | `GeoLite2-City,GeoLite2-ASN` | MaxMind edition ids of the GeoLite2 databases to download. |
| 38 | `--maxmind-license-key` | G13 |  | MaxMind license key to download GeoLite2 databases. |
| 39 | `--maxmind-mirror` | G13 |  | MaxMind mirror URL. |
| 40 | `--maxmind-retries-count` | G13 | `1` | Number of attempts to download the GeoIP databases. |
| 41 | `--maxmind-retries-timeout` | G13 | `0s` | Delay between the first and second download attempt (0s = no retry). |
| 42 | `--metrics-per-host` | G13 | `true` | Exports metrics per host. |
| 43 | `--metrics-per-undefined-host` | G13 | `false` | Exports per-host metrics even for hosts not defined in an Ingress (needs --metrics-per-host). |
| 44 | `--monitor-max-batch-size` | G13 | `10000` | Max batch size of NGINX metrics. |
| 45 | `--post-shutdown-grace-period` | G13 | `10` | Seconds to wait after NGINX stops before the controller exits. |
| 46 | `--profiler-address` | G13 | `127.0.0.1` | IP address of the Go profiler (not in cli-arguments.md). |
| 47 | `--profiler-port` | G13 | `10245` | Port of the Go profiler. |
| 48 | `--profiling` | G13 | `true` | Enables profiling via host:port/debug/pprof/. |
| 49 | `--publish-service` | G13 |  | Service (namespace/name) whose address is written to Ingress status (with --update-status); exclusive with --publish-status-address. |
| 50 | `--publish-status-address` | G13 |  | Comma-separated address(es) written to Ingress status (with --update-status). |
| 51 | `--report-node-internal-ip-address` | G13 | `false` | Writes internal node addresses to Ingress status instead of external ones. |
| 52 | `--report-status-classes` | G13 | `false` | Reports status classes (2xx, 3xx, 4xx, 5xx) instead of status codes in metrics. |
| 53 | `--shutdown-grace-period` | G13 | `0` | Seconds to wait after the shutdown signal before stopping NGINX. |
| 54 | `--size-buckets` | G13 | `[10,100,1000,10000,100000,1e+06,1e+07]` | Histogram buckets for bytes-sent metrics. |
| 55 | `--ssl-passthrough-proxy-port` | G13 | `442` | Internal port used for SSL passthrough. |
| 56 | `--status-port` | G13 | `10246` | Port of the Lua HTTP configuration endpoint. |
| 57 | `--status-update-interval` | G13 | `60` | Seconds between Ingress status update checks (minimum 5). |
| 58 | `--stream-port` | G13 | `10247` | Port of the Lua TCP/UDP configuration endpoint. |
| 59 | `--sync-period` | G13 | `0s` | Period of forced store resync (disabled by default). |
| 60 | `--sync-rate-limit` | G13 | `0.3` | Upper limit of the sync frequency. |
| 61 | `--tcp-services-configmap` | G13 |  | ConfigMap (namespace/name) of TCP services to expose (port: namespace/service:port). |
| 62 | `--time-buckets` | G13 | `[0.005,0.01,0.025,0.05,0.1,0.25,0.5,1,2.5,5,10]` | Histogram buckets for request/response time metrics. |
| 63 | `--udp-services-configmap` | G13 |  | ConfigMap (namespace/name) of UDP services to expose. |
| 64 | `--update-status` | G13 | `true` | Updates the load-balancer status of the Ingresses it serves. |
| 65 | `--update-status-on-shutdown` | G13 | `true` | Updates Ingress status when the controller shuts down. |
| 66 | `--validating-webhook` | G13 |  | Address (host:port) of the admission webhook; no webhook when empty. |
| 67 | `--validating-webhook-certificate` | G13 |  | Path of the webhook certificate (PEM). |
| 68 | `--validating-webhook-key` | G13 |  | Path of the webhook key (PEM). |
| 69 | `--version` | G13 | `false` | Prints version information and exits. |
| 70 | `--watch-ingress-without-class` | G13 | `false` | Also handles Ingresses without IngressClass or class annotation. |
| 71 | `--watch-namespace` | G13 |  | Single namespace to watch (all namespaces when empty); exclusive with --watch-namespace-selector. |
| 72 | `--watch-namespace-selector` | G13 |  | Label selector of namespaces to watch (only when --watch-namespace is empty). |
| 73 | `--add_dir_header` | G13 | `false` | klog: adds the file directory to log headers. |
| 74 | `--alsologtostderr` | G13 | `false` | klog: logs to stderr as well as files (no effect with --logtostderr=true). |
| 75 | `--alsologtostderrthreshold` | G13 | `0` | klog: severity (0 = INFO) at or above which logs go to stderr when --alsologtostderr=true. |
| 76 | `--legacy_stderr_threshold_behavior` | G13 | `true` | klog: when true, --stderrthreshold is ignored if --logtostderr=true. |
| 77 | `--log_backtrace_at` | G13 | `:0` | klog: emit a stack trace when logging hits file:N. |
| 78 | `--log_dir` | G13 |  | klog: directory for log files (no effect with --logtostderr=true). |
| 79 | `--log_file` | G13 |  | klog: log file path (no effect with --logtostderr=true). |
| 80 | `--log_file_max_size` | G13 | `1800` | klog: max log file size in MB (0 = unlimited). |
| 81 | `--logtostderr` | G13 | `true` | klog: log to stderr instead of files. |
| 82 | `--one_output` | G13 | `false` | klog: write each log only at its own severity level. |
| 83 | `--skip_headers` | G13 | `false` | klog: no header prefixes in log messages. |
| 84 | `--skip_log_headers` | G13 | `false` | klog: no headers when opening log files. |
| 85 | `--stderrthreshold` | G13 | `2` | klog: severity (2 = ERROR) at or above which logs go to stderr when writing to files. |
| 86 | `--v` | G13 | `0` | klog: log verbosity level (also -v). |
| 87 | `--vmodule` | G13 |  | klog: comma-separated pattern=N for file-filtered verbosity. |

## 7. Group placement decisions (judgment calls)

- `use-port-in-redirects` → G2 (redirect behaviour, next to relative redirects).
- `auth-snippet` → G3 (the G3 rule takes every `auth-*` key except `auth-tls-*`); it is still a snippet (Critical).
- `modsecurity-snippet` → G9 (WAF), not G8; it is still a snippet (Critical).
- `fastcgi-index`, `fastcgi-params-configmap` → G9 ("everything else"); they only matter with `backend-protocol: FCGI` (G4).
- `disable-proxy-intercept-errors` → G6 (companion of `custom-http-errors`).
- `client-body-buffer-size` annotation → G6 (buffering); the ConfigMap key of the same name → G12b (buffers).
- Removed `global-rate-limit*` annotations → G5 because the G5 definition names them explicitly; all other removed or
  deprecated annotations → G9.
- ConfigMap retries (`proxy-next-upstream*`, `retry-non-idempotent`, `proxy-stream-next-upstream*`) → G11 with the
  timeouts; ConfigMap rate-limiting keys (`limit-rate`, `limit-rate-after`, `limit-req-status-code`,
  `limit-conn-status-code`, `limit-conn-zone-variable`, removed `global-rate-limit-*`) → G12b because no ConfigMap
  group names rate limiting.
- `global-auth-snippet` → G12a (snippet); the other `global-auth-*` keys and `no-auth-locations` → G12b.
- `whitelist-source-range`, `denylist-source-range`, `block-*`, `nginx-status-ipv4/ipv6-whitelist` → G12a (allow and
  deny lists); `allow-backend-server-header`, `server-tokens`, `global-allowed-response-headers` → G12a (default headers).
- `preserve-trailing-slash`, `relative-redirects`, `use-port-in-redirects`, `http-redirect-code`,
  `no-tls-redirect-locations` (ConfigMap) → G11 (SSL redirect and protocol behaviour); `app-root`,
  `proxy-cookie-*`, `proxy-redirect-*`, `upstream-hash-by*`, `load-balance`, `service-upstream` (ConfigMap) → G12b.
- Removed tracing keys (OpenTracing, Zipkin, Jaeger, Datadog) → G12a (tracing); removed `use-geoip`, `plugins` → G12b.

## 8. Conflicts, gaps and UNVERIFIED items

1. **OpenTracing removal version.** The changelog states the removal as a breaking change of v1.10.0 [C2], but the
   annotation parser is already absent from the controller-v1.9.5 tag (present at v1.9.4) and the 1.9.5 changelog
   does not mention it [V9]. The tool should simply treat the keys as removed.
2. **Removal sampling.** "Removed since v1.0" was computed from the changelogs and from source snapshots at v1.0.0,
   v1.9.4, v1.11.8 and v1.15.1. A key added and removed between two snapshots without a changelog note would be
   missed (none is known).
3. **`http2-push-preload` no-op** is inferred from NGINX source and docs [N1][N3] and from the NGINX version in
   `build.sh` [S14]; the ingress-nginx docs do not flag it and it was not tested at runtime. Which ingress-nginx release
   first shipped NGINX >= 1.25.1 was not checked (v1.10.0 shipped NGINX 1.25.0 [C2]).
4. **`limit-rate` units.** `annotations.md` (kilobytes) and `configmap.md` (bytes per second) disagree; the template
   renders a `k` suffix, so kilobytes is what NGINX receives [S9].
5. **Keys accepted without global effect.** ConfigMap `app-root` and `upstream-hash-by*` decode but no consumer was
   found in the v1.15.1 code; based on code reading, UNVERIFIED at runtime.
6. **Effective defaults vs Go zero values.** `load-balance` (Go default empty, Lua default `round_robin` [S15]),
   `affinity-mode` `balanced` and `affinity-canary-behavior` `sticky` (documented defaults; the parser stores an empty
   string) [D1][S1], `ssl-prefer-server-ciphers` (inherited from the http context), `server-name-hash-bucket-size`
   (computed from the longest host name), `disable-ipv6-dns` (computed from the pod's IPv6 support) and
   `auth-signin-redirect-param` (template falls back to `rd`) are effective defaults, not literal struct defaults.
7. **Docs inconsistencies kept as-is:** `configmap.md` says `ssl-redirect` redirects with 301 while `http-redirect-code`
   defaults to 308 [D3][S6]; the `http2-max-requests` section points to `upstream-keepalive-requests` while its table
   note and NGINX point to `keepalive_requests` (ConfigMap `keep-alive-requests`) [D3][N1]; `jaeger-debug-header`
   default is `uber-debug-id` in the table but `jaeger-debug-id` in its section and in the old code comment [D3][V9];
   the deprecation notes say "will be removed in 1.3.0" but the keys still exist at v1.15.1 [D3][S6].
8. **klog flags** come from the klog v2.140.0 source [K1] and a grep of ingress-nginx's own packages for other Go
   flag registrations (none found); `--help` of the real binary was not run, so flags registered by transitive
   dependencies at init time cannot be fully excluded (UNVERIFIED).
9. **Scope of this file.** Keys are those of community ingress-nginx v1.15.1. The NGINX image and ConfigMap handling of
   the AKS application routing add-on may run another controller version (see F2/F8); the catalog should still accept
   all keys listed here and use `deprecated`/`removed` to explain older ones.
10. **cmd/dataplane** (experimental split control/data plane binary in the repo) was not inventoried; only the
    `nginx-ingress-controller` binary from `cmd/nginx` is covered.

## Sources

Release and repository
- [R1] Release controller-v1.15.1: https://github.com/kubernetes/ingress-nginx/releases/tag/controller-v1.15.1
- [R2] GitHub API, repository and releases (archived, push and publish dates; checked 2026-11-04): https://api.github.com/repos/kubernetes/ingress-nginx and https://api.github.com/repos/kubernetes/ingress-nginx/releases
- [R3] README at the tag (retirement notice, links https://www.kubernetes.io/blog/2025/11/11/ingress-nginx-retirement/): https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/README.md

Documentation at controller-v1.15.1
- [D1] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/docs/user-guide/nginx-configuration/annotations.md
- [D2] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/docs/user-guide/nginx-configuration/annotations-risk.md
- [D3] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/docs/user-guide/nginx-configuration/configmap.md
- [D4] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/docs/user-guide/cli-arguments.md
- [D5] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/docs/user-guide/fcgi-services.md
- [D6] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/docs/user-guide/third-party-addons/opentelemetry.md
- [D7] Docs site (HTTP 200 on 2026-11-04): https://kubernetes.github.io/ingress-nginx/user-guide/nginx-configuration/annotations/

Source code at controller-v1.15.1
- [S1] Annotation parsers: https://github.com/kubernetes/ingress-nginx/tree/controller-v1.15.1/internal/ingress/annotations
- [S2] Alias lookup and risk check: https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/annotations/parser/validators.go
- [S3] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/annotations/ipallowlist/main.go
- [S4] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/annotations/ratelimit/main.go
- [S5] Admission checks, snippet gating, custom-prefix check, deprecated-annotation warnings: https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/controller/controller.go
- [S6] ConfigMap struct and defaults: https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/controller/config/config.go
- [S7] defaults.Backend: https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/defaults/main.go
- [S8] ConfigMap decoding (special keys, mapstructure): https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/controller/template/configmap.go
- [S9] Template helpers (limit_rate, auth sign-in URL, forwarded host): https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/controller/template/template.go
- [S10] https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/rootfs/etc/nginx/template/nginx.tmpl
- [S11] Controller flags: https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/pkg/flags/flags.go
- [S12] klog.InitFlags call: https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/cmd/nginx/main.go
- [S13] klog v2.140.0 dependency: https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/go.mod
- [S14] NGINX_VERSION=1.27.1: https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/images/nginx/rootfs/build.sh
- [S15] Lua DEFAULT_LB_ALG round_robin: https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/rootfs/etc/nginx/lua/balancer.lua
- [S16] Legacy class annotation key: https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/internal/ingress/controller/ingressclass/ingressclass.go

Changelogs (at controller-v1.15.1)
- [C1] v1.12.0: https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/changelog/controller-1.12.0.md
- [C2] v1.10.0: https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/changelog/controller-1.10.0.md
- [C3] v1.7.1: https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/changelog/controller-1.7.1.md
- [C4] v1.9.3: https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/changelog/controller-1.9.3.md
- [C5] v1.15.0: https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/changelog/controller-1.15.0.md
- [C6] v1.14.0: https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/changelog/controller-1.14.0.md
- [C7] v1.13.0: https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/changelog/controller-1.13.0.md
- [C8] Legacy Changelog.md (v1.0.0 to v1.5.1): https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/Changelog.md
- [C9] v1.9.0: https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/changelog/controller-1.9.0.md
- [C10] v1.13.2: https://github.com/kubernetes/ingress-nginx/blob/controller-v1.15.1/changelog/controller-1.13.2.md

Older source snapshots used for the removal diff
- [V0] controller-v1.0.0: https://github.com/kubernetes/ingress-nginx/tree/controller-v1.0.0/internal/ingress/annotations, https://github.com/kubernetes/ingress-nginx/blob/controller-v1.0.0/internal/ingress/controller/config/config.go, https://github.com/kubernetes/ingress-nginx/blob/controller-v1.0.0/cmd/nginx/flags.go, https://github.com/kubernetes/ingress-nginx/blob/controller-v1.0.0/internal/ingress/annotations/secureupstream/main.go
- [V9] controller-v1.9.4: https://github.com/kubernetes/ingress-nginx/blob/controller-v1.9.4/internal/ingress/controller/config/config.go, https://github.com/kubernetes/ingress-nginx/tree/controller-v1.9.4/internal/ingress/annotations/opentracing; controller-v1.9.5 listing: https://api.github.com/repos/kubernetes/ingress-nginx/contents/internal/ingress/annotations?ref=controller-v1.9.5
- [V11] controller-v1.11.8: https://github.com/kubernetes/ingress-nginx/blob/controller-v1.11.8/internal/ingress/controller/config/config.go, https://github.com/kubernetes/ingress-nginx/blob/controller-v1.11.8/internal/ingress/annotations/globalratelimit/main.go

NGINX, klog, Microsoft
- [N1] NGINX HTTP/2 module (obsolete directives): https://nginx.org/en/docs/http/ngx_http_v2_module.html
- [N2] NGINX changes (1.19.7 removals, 1.25.1 "HTTP/2 server push support has been removed"): https://nginx.org/en/CHANGES
- [N3] NGINX 1.27.1 source, obsolete-directive handler: https://github.com/nginx/nginx/blob/release-1.27.1/src/http/v2/ngx_http_v2_module.c
- [N4] NGINX auth_request semantics (2xx allows, 401/403 deny): https://nginx.org/en/docs/http/ngx_http_auth_request_module.html
- [K1] klog v2.140.0 flags: https://github.com/kubernetes/klog/blob/v2.140.0/klog.go
- [M1] Microsoft Learn, application routing add-on with the Gateway API (updated 2026-10-08): https://learn.microsoft.com/en-us/azure/aks/app-routing-gateway-api
