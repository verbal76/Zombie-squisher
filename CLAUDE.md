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
- `android-candidate.yml` is **manual only** (`workflow_dispatch`; optional emulator smoke input). Never on push.
- `ci.yml` runs on **pull requests only**, skips docs-only changes, cancels superseded runs.
- `build-apk.yml` (reusable) keeps every release gate: identity, signer fingerprint, target SDK, forbidden
  permissions, 16 KB alignment. Never weaken them to save minutes.
- Pipeline branch (`Github-build-pipeline-zombie-crusher`): `eas-update.yml` (OTA) and `android-build.yml` (APK/release)
  are path-filtered and must stay so. Merging into that branch publishes an OTA/release: owner authorisation required.
- Batch changes and push once; do not push iteratively to "see what CI says". Reuse an existing artifact for a SHA.

Never bypass signing, runtime/OTA compatibility, rollback protection or release gates to save minutes.
