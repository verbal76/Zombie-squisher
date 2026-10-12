# Project instructions (agents and contributors)

## GitHub Actions budget — STANDING OWNER POLICY

GitHub-hosted Actions minutes are shared across the owner's projects and deliberately scarce. Before starting any
workflow ask: **"Does this need GitHub Actions, or can I prove it locally?"** Use Actions only when GitHub-hosted
execution provides necessary evidence.

**Prove locally first:** `npm run check` (typecheck + tests), `npx actionlint` for workflow edits, Metro bundle,
`expo prebuild`, the UI gallery. Do not use CI as a substitute for debugging.

**Actions are appropriate for:** final validation of a candidate approaching release/OTA; a native APK/AAB the owner
actually needs for physical testing or release; OTA publication and its safety checks; store/release builds; a
platform-specific check that cannot be reproduced locally.

**Not appropriate for:** building on every push; native builds for OTA-only changes; other platforms (e.g. Windows)
nobody asked for; re-running to see whether something intermittent passes; rebuilding a SHA that already has a
verified artifact (reuse it); release validation for docs, comments or bookkeeping.

**How this repo is wired (keep it that way):**
- `build.yml` is the one coordinated build: **manual only**, `destination = local_only` by default. Never on push.
- `ci.yml` runs on **pull requests only**, skips docs-only changes, cancels superseded runs.
- `build-apk.yml` (reusable) keeps every release gate: identity, signer fingerprint, target SDK, forbidden
  permissions, 16 KB alignment. Never weaken them to save minutes.
- `eas-update.yml` (OTA) and `build.yml` (builds/releases) are **manual only**; see "Release authorization".
- Batch changes and push once; do not push iteratively to "see what CI says". Reuse an existing artifact for a SHA.

Never bypass signing, runtime/OTA compatibility, rollback protection or release gates to save minutes.

## One product, one history (permanent engineering policy)

We develop ONE GAME that can have several build targets, never separate per-platform versions.

- **Authoritative line:** `Github-build-pipeline-zombie-crusher` is the release line (rollback checkpoint
  `checkpoint/pre-resurrection-7004f7d`). All work reaches it by reviewed merge of a branch that originated from it.
  Branches are temporary workspaces with a stated purpose; they never become a separate product, and platform names in
  a branch name grant no permission to fork behaviour.
- **Targets:** Android is the only supported target today (Expo/React Native + three.js). Game rules live in
  platform-neutral modules (`src/game`, `src/audio` logic, `src/store`, `tests/`); platform code is isolated to
  components/adapters (touch `ControlPad`, `expoAudioBackend`, native config). Any other target (e.g. Windows) must
  reuse those modules, build from the same SHA, and only add its own input/render/packaging adapters. Do not build a
  target nobody asked for (see Actions budget).
- **Fixes:** a fix made for one target must be evaluated for every supported target.
- **Provenance:** every build records exact commit SHA, ref, version, runtime version, platform, profile, toolchain and
  timestamp (`scripts/write-build-info.mjs` -> `build-manifest.json` in each APK artifact). Release tags must point at
  the built commit (`target_commitish`). A coordinated multi-platform release uses one approved SHA for all targets; if
  one target fails, do not substitute another revision.
- **Release guards:** only the pipeline branch may publish a release or OTA; store bundles must come from a commit
  contained in it. These are asserted by `tests/provenance.test.ts` (runs in `npm run check`).
- **Abandoned work:** never delete or rewrite a branch to "clean up". Before discarding or superseding work, record it in
  `docs/BRANCH_LEDGER.md` (class + disposition). Re-check with `tools/branch-inventory.sh`; every new branch that holds
  unmerged commits must appear in the ledger before its work is considered finished.
- **Don't silently skip:** CI may not pass by skipping required tests; missing toolchain pieces must fail visibly.
- OTA compatibility: runtimeVersion follows the app version (`policy: appVersion`); changing native dependencies or
  config requires a version bump and a native build, not an OTA. Do not redesign this pipeline without a concrete defect.

## Release authorization (permanent)

Building, testing, merging and publishing are separate operations. **No push, merge, PR, tag, version or docs change may publish
anything or start an expensive build.** (Studio master standard v2.0: one source line, three platform targets, one coordinated build
number, one GitHub Release, no accidental publishing.)

- `eas-update.yml` and `build.yml` have exactly one trigger, `workflow_dispatch` (`ci.yml`: pull requests; `build-apk.yml`: `workflow_call`).
  Do not add `push`, `tags`, `release`, `schedule`, `workflow_run` triggers, and do not run `eas update` / create releases anywhere else
  (`tests/provenance.test.ts` fails if you do).
- A `build.yml` run authorizes exactly the platforms and destination chosen in its inputs (`platform`, `source_sha`, `build_number`,
  `destination`) and nothing else: no OTA, no Steam, no Google Play, no merge. `destination = github_releases` additionally needs the commit in
  the `Github-build-pipeline-zombie-crusher` lineage. Build numbers are monotonic and never reused (`tools/release-names.js`).
- Publishing an OTA needs: run on `Github-build-pipeline-zombie-crusher`, `confirm = PUBLISH-OTA`, tests green first.
- **Agents never dispatch builds, releases or OTAs without the owner's explicit instruction in the current conversation**; "continue" is not authorization.
- Releases: tag `build-NN` created by `tools/tag-release.sh` on the built SHA and re-checked afterwards; `tools/assemble-release.js` proves one SHA +
  one build number across platforms and recomputes artifact digests. Never move or delete historical `apk-build-*` tags (see `docs/BRANCH_LEDGER.md`).
- Required docs (keep concise and true): `docs/PLATFORM_SUPPORT.md`, `UPDATES.md`, `RELEASES.md`, `STEAM_HARDWARE_CHECKLIST.md`, `BRANCH_LEDGER.md`,
  `THIRD_PARTY_ASSETS.md`. Never claim physical-device, Windows or Steam Deck testing that did not happen.
