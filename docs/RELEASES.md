# Builds and releases

Everything is manual. Pushes, merges, tags and version changes run only the lightweight PR checks (`ci.yml`, docs-only changes skipped).

## One coordinated build = one number, one SHA, one release
Actions -> **Build (Android / Windows / Linux)** -> Run workflow on the branch whose tip is the approved commit:

| Input | Meaning |
|---|---|
| `platform` | `all`, `android`, `windows` or `linux` |
| `source_sha` | the exact 40-char commit; the run fails unless the dispatched ref is at it |
| `build_number` | next number; must be above every number any tag has used (`build-NN` and historical `apk-build-NN`, highest so far **76**) and unused |
| `destination` | `local_only` (default: files stay as 14-day run artifacts) or `github_releases` |
| `android_smoke`, `windows_smoke`, `android_aab` | optional extras (emulator smoke; billed-2x Windows run; App Bundle artifact) |

Pipeline: `plan` (validate SHA, build number, lineage; `npm run check` once) -> `android` (EAS local build + identity/signer/16 KB gates), `desktop`
(Linux tar.gz + Xvfb smoke + restart test; Windows zip) -> optional `windows-smoke` -> `assemble` (proves one SHA and one build number across
platforms, recomputes digests, standard names, `build-manifest.json`, `checksums.sha256`) -> `publish` (only for `github_releases`).

Release layout (title `Zombie Squisher Build NN`, immutable tag `build-NN` created on the built commit by `tools/tag-release.sh` and re-checked):
`Zombie Squisher Build NN APK.apk`, `... EXE.zip`, `... Linux.tar.gz`, `build-manifest.json`, `checksums.sha256`. Releases are GitHub *prereleases*
(not "latest"). A partial build (`platform` != all) is labelled partial in the release text and in `build-manifest.json` (`complete:false`).
Releasing requires the commit to be in the `Github-build-pipeline-zombie-crusher` lineage (merge first; merging publishes nothing).

Not authorized by a build run: OTA, Steam, Google Play, merges. Local equivalents: `npm run build -- --platform ...` (see `docs/PLATFORM_SUPPORT.md`).

## History and naming notes
- Releases up to `apk-build-76` used `apk-build-N` tags that point at `main` commits, not the built source; the real source of `apk-build-N` is the
  `android-build.yml` run number N (e.g. 76 -> `7004f7d`). Left untouched (see `docs/BRANCH_LEDGER.md`).
- Earlier instruction: APKs named `<GameName>-v<version>.apk`. The studio standard (newer) names release assets `Zombie Squisher Build NN APK.apk`;
  the CI build job still names its working copy `Zombie-Squisher-v<version>.apk` and `assemble` renames it. Intermediate artifact names are not player-facing.
- Cost: nothing builds on push. A full `all` build is roughly 9 (Android) + 5 (desktop) hosted minutes; `windows_smoke` adds ~5 at 2x.
