# Handoff — Zombie Squisher resurrection (2026-10)

## What this repository really is
- **Game:** Zombie Squisher (app label "Zombie Squisher"; the repo README on `main` calls it "Zombie Crusher", the one rename that never reached the app).
- **Authoritative line:** `Github-build-pipeline-zombie-crusher` (159 commits, 2026-05-09 → 05-13). `main` only holds docs + the prune workflow + the company logo.
- **Rollback checkpoint:** branch `checkpoint/pre-resurrection-7004f7d` = `7004f7d46b26`, the last commit of the line before this work. APK build #76 (release `apk-build-76`) was built from it.
- An earlier attempt in this same effort rebuilt the game from scratch because the other branches and the 32 GitHub releases were missed. That work is preserved at `archive/scratch-rewrite-97a5729` and is **not** used.

## Archaeology
| Branch | State |
|---|---|
| `Github-build-pipeline-zombie-crusher` | 3D game (three.js + R3F + Kenney GLBs), 10 vehicles, weapons, side mods, abilities, streaks, bosses, garage/economy, OTA + EAS-signed APK pipeline. **Used.** |
| `claude/fix-bounding-box-controls-7LQLQ` | ancestor (108 commits, bicycle-model steering). Superseded by the line above. |
| `claude/fix-build-artifacts-visibility-rwXqU` | ancestor (33 commits, 2D→3D experiments). Superseded. |
| `claude/github-game-builds-AAswD` | initial scaffold + EAS wiring. Superseded. |
| releases `apk-build-*` (32) | all tagged on `1707a6a` (main) although built from the pipeline branch, so tags do not identify sources. New releases use the same scheme; the asset now carries the real SHA in the About screen. |

Baseline measured from APK #76 (downloaded, SHA-256 `3911ac6d…7fa7b68`): package `com.verbal76.zombiesquisher`, versionName 1.0.0, **versionCode 1**, minSdk 24, **targetSdk 34**, v2-signed by the EAS key (SHA-256 `178015BD…BF0DA4EC`), 4 ABIs, 13 of 14 native libs 4 KB-aligned (**fails 16 KB**), no real app icon (icon source PNG in the repo was truncated; `app.json` did not reference one), storage + overlay permissions requested needlessly, 191 MB uncompressed.

## Rebuild decision: **subsystem reconstruction** (not a rewrite)
Kept: game design, engine, data, renderer approach, assets, EAS/OTA pipeline, package identity, signing key.
Rebuilt/changed:
- Expo SDK 52 → **54** (RN 0.81, React 19, R3F 9, expo-file-system legacy API, NDK 27 → 16 KB aligned, target/compile SDK 36). Old architecture kept deliberately (`newArchEnabled:false`) to avoid changing the 3D stack's behaviour without a device in the loop; SDK 55 will force the move.
- `version` 1.0.0 → **1.1.0** and `versionCode` 1 → **2** (local version source). OTA runtime policy is `appVersion`, so 1.0.0 installs never receive 1.1.0 JavaScript.
- Splash/icon/brand pipeline (see below), lockfile committed, CI rebuilt, tests added.

## Defects found and fixed
| Defect | Fix | Guard |
|---|---|---|
| 5 TypeScript errors at baseline (incl. `deriveStats` spread letting `undefined` upgrade fields turn stats into `NaN`) | explicit defaults | `npm run typecheck`, engine test |
| EMP kills never counted (no kill, streak, blood) | `registerKill` in the EMP loop | engine test |
| Side-mod damage, bumper damage and per-hit slowdown were per frame (frame-rate dependent) | scaled by elapsed frames | engine test (60 vs 20 fps) |
| Debug text (hd/vF/L/R/z/pr) always on the player HUD | `__DEV__` only | — |
| No pause; backgrounding left the loop running | pause button, auto-pause on background, About pauses | emulator smoke test |
| OTA was applied with `reloadAsync()` at any time, even mid-run | OTA downloads in background, applies only from the menu | — |
| Main menu required scrolling in landscape to reach DRIVE | two-column landscape layout | — |
| HUD/controls ignored safe areas (edge-to-edge is mandatory at target 36) | `react-native-safe-area-context` insets everywhere in game + menu | — |
| `createWorld` allocated on every HUD tick; game loop restarted on game over; end-of-run timer not cleared | lazy ref, refs for callbacks, cleanup | — |
| Icon source PNG truncated/corrupt, build script silently skipped it | committed `assets/brand/*`, build fails on bad assets | `tests/project.test.ts` |
| Unneeded permissions (overlay, storage) | `blockedPermissions` | `tools/verify-apk.sh`, test |
| Release APKs always versionCode 1, name `zombie-squisher.apk` | versionCode 2; `Zombie-Squisher-v1.1.0.apk` | tests + CI |
| Save loader trusted persisted JSON | `sanitizeProgress` repairs corrupt / outdated saves | `tests/progress.test.ts` |

## Splash screen
Android 12+ system splash = background colour `#0d0805` with a **transparent** icon (`assets/brand/splash-blank.png`), then the in-app `HagSplash` (fade in 350 ms, hold 1.1 s, fade out 300 ms) shows the authoritative logo (`Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png`, cropped/resized by `tools/make_brand_assets.py`, never redrawn) → menu. The native splash is released on the logo's first layout, so there is one visible logo and no double splash. The save game loads in parallel, so the splash adds no avoidable delay beyond the 1.75 s brand moment.

## Release engineering
- `tools/apk-name.js` is the only place that names artifacts. `tools/verify-apk.sh` verifies identity, targetSdk ≥ 35, forbidden permissions, v2/v3 signature, **signer = the key of build #76**, `zipalign -P 16`, ELF LOAD alignment ≥ 16 KB for arm64-v8a and x86_64.
- `tools/emulator-smoke.sh` runs on an API 34 emulator in CI: install, cold start, sample the splash frames, tap DRIVE, hold steer, read About diagnostics (3D models loaded / frames / load + render errors), logcat crash scan, background/foreground and auto-pause check.
- OTA: nothing in this work publishes an OTA. `eas-update.yml` only fires on the pipeline branch; merging this work there will publish a `src/**` OTA to runtime 1.1.0 (reaches only 1.1.0 installs) and trigger the APK lane for config changes.
- CI uses `secrets.ZOMBIE` (the existing EAS token) on `ccr-**`/`candidate/**` pushes so candidates are signed with the real key and can update an installed 1.0.0 build in place (progress is kept). They create no release and no OTA.

## Known remaining issues
See `agentic docs/KNOWN_ISSUES.md`. Most important: real-device performance with up to 500 zombies is unverified (emulator only); placeholder icon; no audio; Garage / Game Over landscape layout.

## Owner decisions needed
1. Spawn rate is "100x" by earlier request and the 500-zombie cap is hit within seconds; DESIGN_TRUTHS asks for escalation. Keep, or ramp it?
2. Game name: README on `main` says "Zombie Crusher", the app says "Zombie Squisher". APKs follow the app name.
3. Real app icon art.
