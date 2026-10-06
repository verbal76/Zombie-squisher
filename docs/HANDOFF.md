# Handoff — Zombie Squisher resurrection (Oct 2026)

Living document. The final owner handoff (APK name, hash, CI run) is appended when a candidate passes CI.

## Identity and baseline
- **Game:** Zombie Squisher (app label). `main`'s README says "Zombie Crusher", a rename that never reached the app.
- **Authoritative line:** `Github-build-pipeline-zombie-crusher` @ `7004f7d46b26` (159 commits, 2026-05-09..13).
- **Rollback checkpoint:** branch `checkpoint/pre-resurrection-7004f7d` (== `7004f7d`). `archive/scratch-rewrite-97a5729` holds an abandoned from-scratch rewrite made before the real line was found; it is not used.
- **Original APK (forensic baseline):** GitHub release `apk-build-76`, `zombie-squisher.apk`, SHA-256 `3911ac6dc3b90167286b7c6720f2437d526ff50db5e123814cb70d5249fa7b68`, 80.6 MB.
  - `com.verbal76.zombiesquisher`, versionName 1.0.0, **versionCode 1**, minSdk 24, **targetSdk 34**, compileSdk 35, Expo SDK 52 / RN 0.76 / Hermes bc v96, old architecture.
  - Built from `7004f7d`: the full SHA is embedded in its bundle; every UI string, constant and the spawn code match the source; no app-specific string exists that the source lacks.
  - v2-signed only, one self-signed EAS key, SHA-256 `178015BD…BF0DA4EC` (CI refuses any APK signed otherwise).
  - 14 native libs x 4 ABIs; **13/14 were 4 KB-aligned (fails 16 KB)**. Default Expo launcher icon (icon source PNG in repo was truncated), splash with no logo, overlay + storage permissions it never used, **0 audio files, 0 fonts**.
  - OTA: expo-updates, runtime `1.0.0`, channel `preview`, project `9b498cb4-…`. 121 OTA publishes and 76 APK builds happened on the line.

## Archaeology (all branches, tags, releases, PRs, history)
- 4 other branches: `claude/*` ones are older snapshots of the same driving work (only unique content: a 2D renderer and faux-3D cubes in `fix-build-artifacts-visibility`), `github-game-builds-AAswD` is the original scaffold. Nothing in them is worth recovering.
- 32 releases `apk-build-17..76`, all lightweight tags on `1707a6a` although built from the pipeline branch; APK binaries exist only as release assets.
- Deleted-file history: the 17 base64 character modules (3.4 MB) and 3 helper scripts were superseded by real GLBs. No audio, fonts or sprites ever existed in any commit.
- No TODO/FIXME, no secrets (203 commits scanned), no dangling work. Dead code found: `Thumbstick.tsx`, `ZombieCharacter.tsx` (replaced), ~100 never-referenced GLB requires that still bloated the APK, a corrupt `grass.png`.

## Decision: subsystem reconstruction (option B)
Kept: design, engine, data, assets, EAS/OTA pipeline, package id, signing key. Rebuilt or replaced: Expo SDK 52 → **54** (16 KB, API 36), zombie rendering, input layer, HUD/menu/garage/game-over UI, audio (new), icon/splash, build and test infrastructure, save/economy logic.

## Architecture (current)
`engine.ts` (rules, pure) → `GameScreen` (loop, pause, lifecycle, audio) → `GameScene` (R3F 3D: chase camera, car GLB, `ZombieHorde` + `BloodSplats` instanced) + `GameHud` + `ControlPad`. `controls.ts`, `audioDirector.ts`, `progressLogic.ts` are pure and unit tested. Zombie meshes are baked at build time (`tools/bake-characters.ts` → `src/assets/baked/zombieModels.json`; a test fails if stale). Expo SDK 54, RN 0.81, React 19, R3F 9, three r166, old architecture (SDK 55 forces new arch: next migration).

## Defects found and dispositions
| # | Defect | Fix | Guard |
|---|---|---|---|
| 1 | 5 baseline TS errors; `deriveStats` spread let `undefined` upgrade fields produce NaN stats | explicit defaults | typecheck + test |
| 2 | EMP kills never counted (no kill/streak/blood) | `registerKill` | test |
| 3 | Damage/slowdown applied per frame (frame-rate dependent) | scaled by elapsed frames | test 60 vs 20 fps |
| 4 | **Economy:** unlocks measured against the *spendable* bank; spending kills could lock you out of the Flamethrower etc. | `lifetimeKills`, exact migration of existing saves | 4 tests |
| 5 | ~3000 draw calls and 500 React components at the zombie cap | instanced horde (18 draw calls) | tests |
| 6 | 18 x 1024² PNG decodes + GLB parses in JS, lazily, while driving | build-time bake (40 KB JSON) | stale-bake test |
| 7 | Unbounded blood decals | cap 300 | test |
| 8 | Debug text always on HUD; no pause; backgrounding left the game running; OTA could reload mid-run | `__DEV__` only, pause + auto-pause, OTA applies from menu only | smoke test |
| 9 | HUD/controls ignored safe areas (edge-to-edge is mandatory at API 36) | insets everywhere | layout tests + UI preview |
| 10 | Overlapping touch hit areas resolved by array order; one lifted finger cancelled a hold two fingers kept | nearest-edge hit test, ref-counted holds | 11 input tests |
| 11 | `GameScreen` 800 lines mixing scene/HUD/input; duplicated GLB loader code | split; shared `glbCommon` | — |
| 12 | Menu needed scrolling in landscape; overflowed 640 px phones (found by layout assertions) | scaling two-column layout | `ui-shots` assertions in CI |
| 13 | No icon, no splash logo, unneeded permissions | new icon (adaptive + monochrome), HAG splash, blocked permissions (incl. mic/foreground-service injected by expo-audio) | tests + `verify-apk.sh` |
| 14 | Boss HP bar promised in README, never rendered; no damage feedback | boss bar, damage flash | preview |
| 15 | Silent game (design doc: "good audio makes cheap visuals feel expensive") | 15 synthesised sounds + music, tested director | 12 audio tests |
| 16 | **CI:** `android-actions/setup-android@v3` now fails on current runners (old pipeline's APK lane is broken today); Gradle `OutOfMemoryError: Metaspace` in KSP then deadlocked the daemon for 74 min | preinstalled SDK; Gradle memory plugin; 40 min step timeout | CI asserts |

## Startup sequence
Android 12+ system splash = background `#0d0805` with a transparent icon → in-app Hot Attic Games logo (350 ms in, 1.1 s hold, 300 ms out; asset cropped/resized from `Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png`, never redrawn) → menu. Native splash is released on the logo's first layout (same colour: seamless). Save + settings load in parallel.

## Release engineering
- `tools/apk-name.js` names artifacts `<Game>-v<version>.apk`; `tools/verify-apk.sh` checks identity, targetSdk ≥ 35, forbidden permissions, v2/v3 signature, **signer == build #76 key**, `zipalign -P 16`, ELF LOAD alignment ≥ 16 KB (arm64-v8a, x86_64); `tools/emulator-smoke.sh` installs and drives the APK on an API 34 emulator (splash frames, DRIVE, steering, About diagnostics: models loaded/frames/errors, logcat crash scan, background/foreground + auto-pause).
- Version identity: `version` 1.1.0 (= OTA runtime) / `versionCode` 2 (build #76 shipped 1). Never change `version` without shipping an APK.
- **OTA:** nothing in this work publishes an OTA. `eas-update.yml` fires only on the pipeline branch. Merging this PR there publishes a `src/**` OTA to runtime 1.1.0 (reaches only 1.1.0 installs, i.e. never the old 1.0.0 APK) and triggers the APK lane for config changes. That is the owner's decision.
- CI uses `secrets.ZOMBIE` on `ccr-**`/`candidate/**` pushes so candidates are signed with the real key and update an installed 1.0.0 in place (progress kept). No release, no OTA from those runs.

## Data for the owner (design judgement, not changed)
- Spawn rate is "100x" by earlier request: the 500-zombie cap is reached ~7 s in for every vehicle (`tools/simulate.ts`). Simple bots die in 35–130 s in the hatchback (idle 36 s, circling 134 s, tank driving straight survives 240 s+).
- Starter hatchback survives 25 walker bumper hits (brute 9, boss 4); the design doc says "roughly 10".
- Game name: README on `main` says "Zombie Crusher"; APKs follow the app name "Zombie Squisher".

## Known remaining issues
See `agentic docs/KNOWN_ISSUES.md`. Not verifiable without a device: real-device frame rate at max density, audio mix/loudness on phone speakers, touch feel. Music and SFX are synthesised and functional but would benefit from a human audio pass. App icon is original procedural artwork; real art would be better.
