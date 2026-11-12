# Releasing

A release is published by `.github/workflows/release.yml` when a tag `vX.Y.Z` is pushed.

## Once, before the first release

- Replace the placeholder repository URL `https://github.com/CLAZA-ORG/ingress-nginx-inventory` with the real one in
  `ingress-inventory.mjs` (`REPO_URL`), `README.md`, `README.fr.md` and `SECURITY.md`, and remove the
  `TODO before publishing` comments once the URLs and the offer pages are live.
- On GitHub: Settings > Actions > General > Workflow permissions can stay read-only; the release job asks
  for the write permissions it needs.

## Each release

1. Set the version in `ingress-inventory.mjs` (`VERSION`) and `package.json`, and in the download URLs of
   `README.md` and `README.fr.md` (`releases/download/vX.Y.Z/`).
2. Add a dated section to `CHANGELOG.md`: `## X.Y.Z (YYYY-MM-DD)`.
3. `npm run build`, then `npm test`; review and refresh the golden reports (`UPDATE_GOLDEN=1 npm test`) if
   the catalog changed. Commit.
4. `git tag vX.Y.Z && git push origin vX.Y.Z` (a tag with a suffix, such as `v0.2.0-rc.1`, makes a pre-release).

## What the workflow does

- **test**: Node.js 18, 20, 22 and 24 on Linux and Node.js 24 on Windows: `catalog/` must be exactly what
  `tools/merge-research.mjs` builds from `docs/research/catalog/`, the embedded catalog must match `catalog/`,
  and `npm test` must pass.
- **release**: checks that the tag matches `VERSION` and `package.json`, that `CHANGELOG.md` has a dated
  section for it, that every repository URL points at this repository and that both READMEs download this
  tag; then writes `SHA256SUMS`, signs a build provenance attestation for `ingress-inventory.mjs`, and
  creates the GitHub release with `ingress-inventory.mjs` and `SHA256SUMS`, using the changelog section as
  release notes.

The released file is the committed `ingress-inventory.mjs`; the workflow verifies it but does not rebuild it.
