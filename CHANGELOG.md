# Changelog

## 0.1.0 (2026-11-12)

First release.

- Read-only inventory of ingress-nginx usage: controllers (community, AKS application routing add-on, forks and vendor builds) with dated support status and CVE verdicts, attribution of every Ingress following ingress-nginx's own class rules, routes, hosts and TLS.
- Catalog of 489 keys (150 annotations, 233 ConfigMap keys, 87 controller flags, 19 ecosystem keys), each mapped to the Gateway API and to four AKS targets: the application routing Gateway API implementation, Application Gateway for Containers (Gateway API and Ingress API) and the Istio add-on. Catalog date: 2026-11-09.
- 30 default behaviours that change after migration, shown as configured in the cluster, each with a test.
- Network section: load balancer addresses, internal and pinned IPs, externalTrafficPolicy.
- Next steps with the ingress2gateway command per class.
- Reports in English and French; `--anonymize` for sharing; `--from-dir` for offline analysis of exported files.
