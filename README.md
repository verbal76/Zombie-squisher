# Zombie Squisher

Top-down arcade-y driving game. Run swarms of zombies over with your bumper, mounted swords slice anything that brushes the doors, weapons (machine gun, flamethrower, rockets, plasma lance) auto-fire forward, and abilities (nitro, shield, EMP) sit on cooldowns. Squishing kills upgrades stats between runs and unlocks more weapons, side mods, abilities, and vehicles.

Built with Expo SDK 54 + React Native 0.81 + React 19 + three.js (react-three-fiber) + TypeScript. Native Android APKs are built **on GitHub's free Ubuntu runner via `eas build --local`** — zero EAS build minutes. JS-only changes ship as OTA updates.

## Branches

| Branch | Purpose |
|---|---|
| `Github-build-pipeline-zombie-crusher` | Primary working branch. Pushes here trigger OTA + APK builds. |
| `ccr-*` / `candidate/*` | Working branches: CI + candidate APK only, never OTA or a release. |
| `checkpoint/pre-resurrection-7004f7d` | Rollback point: the pipeline branch exactly as it was before the 2026-10 resurrection. |
| `main` | Untouched / not used for active development. |

## Pipelines

### 1. OTA updates — `.github/workflows/eas-update.yml`
Auto-fires on every push to `Github-build-pipeline-zombie-crusher` (excluding readme/CI/config-only changes). Publishes the JS bundle to the EAS `preview` channel; installed apps with the matching `appVersion` pick it up on next launch. Manual dispatch lets you target the `production` channel instead.

### 2. Native APK builds — `.github/workflows/android-build.yml`
Runs `eas build --local` on the GitHub-hosted runner — **no EAS build minutes consumed**. Triggers:

- **Push to `Github-build-pipeline-zombie-crusher`** → APK with the `preview` profile, uploaded as a 90-day artifact on the run.
- **`v*` tag push** → AAB with the `production` profile + an attached GitHub Release for permanent download.
- **Manual dispatch** → pick the profile.

Only secret required: `EXPO_TOKEN` (already configured).

## Local development

```sh
npm install
npm run start          # Expo dev server
npm run android        # or
npm run ios
npm run typecheck
```

## EAS project

- **Owner**: `hot-attic-games`
- **Slug**: `zombie`
- **Project ID**: `9b498cb4-2cf6-4604-8d25-3b2d6be0add7`

Already wired into `app.json` (`expo.owner`, `expo.slug`, `expo.extra.eas.projectId`, `expo.updates.url`).

## Game design

- **10 vehicles**: Hatchback (free) → Sedan (200) → Coupe (600) → Race Car (1.5k) → Pickup (3k) → Police (6k) → Ambulance (10k) → Taxi (18k) → Heavy Truck (32k) → Battle Tank (60k). Currently rendered as colored placeholder blocks; drop Kenney top-down car/truck PNGs under `assets/cars/` and swap the `View` for an `Image` keyed off `vehicle.assetKey`.
- **Per-vehicle upgrades**: Speed / Armor / Handling, 5 tiers each at 100 / 400 / 1,200 / 3,500 / 10,000 kills.
- **Weapons** (forward-firing, auto): MG @ 100 · Flamethrower (placeholder art) @ 500 · Rockets @ 1,500 · Plasma Lance @ 5,000.
- **Side mods** (kill anything that brushes the doors): Mounted Swords @ 750 · Bone Grinders @ 4,000.
- **Abilities** (manual button): Nitro @ 200 · Shield @ 1,000 · EMP @ 3,000.
- **Zombies** trickle in slowly at first then ramp up. Spawn from top + sides; side-spawning increases with wave. Walkers / Runners / Brutes / Spitters appear as you progress.
- **Mini-bosses** start at wave 9 and re-spawn every couple hundred kills, with a visible HP bar.
- **Damage** flows both ways — every zombie contact dings the car (clamped by a brief invuln window). Bosses, brutes, and spitters hit hard.
- **Blood trails** drop from every kill and scroll down behind the car.

## Project layout

```
App.tsx                       # scene router, HAG splash gate, OTA bootstrap (OTA applies only from the menu)
index.ts                      # Expo entry
src/
  components/                 # HagSplash, MenuScreen, GameScreen, GarageScreen, GameOverScreen, AboutModal
  data/                       # vehicles, weapons, abilities, sideMods, zombies (pure data), objects (GLB registry)
  game/engine.ts              # game loop, physics, spawning, combat, blood trails (pure, unit tested)
  store/progressLogic.ts      # economy + save sanitising (pure, unit tested)
  store/progress.ts           # AsyncStorage save/load wrapper
  render/                     # GLB loading (three.js GLTFLoader on Hermes)
assets/brand/                 # app icon, adaptive icon, blank native splash, Hot Attic Games logo (derived from the master logo)
tests/                        # engine, save, and project/release-identity tests (`npm test`)
tools/                        # apk-name.js, verify-apk.sh, emulator-smoke.sh, make_brand_assets.py
.github/workflows/
  ci.yml                      # typecheck + tests + bundle + prebuild on every branch/PR (no secrets)
  build-apk.yml               # reusable: signed APK -> name -> verify (identity/signer/16 KB) -> emulator smoke test
  android-candidate.yml       # runs build-apk.yml on ccr-** / candidate/** branches (no release, no OTA)
  android-build.yml           # pipeline branch: build-apk.yml + GitHub Release; v* tags -> production AAB
  eas-update.yml              # OTA publisher (pipeline branch only)
```

## Releases, versions and naming

- APKs are named `<GameName>-v<version>.apk`, e.g. `Zombie-Squisher-v1.1.0.apk` (`tools/apk-name.js`).
- `app.json` `version` (also the OTA runtime version) and `android.versionCode` must both be bumped for every native build; `package.json` `version` must match `app.json` (enforced by `npm test`).
- **Never change `version` without shipping an APK** (see `docs/pipeline-handoff.md`). 1.1.0 is the Expo SDK 54 native runtime; installs of 1.0.0 (SDK 52) never receive 1.1.0 OTAs.
- APKs are signed by the project's EAS credentials. CI fails if the signer differs from the key that signed build #76, because that APK could not update an installed copy.
- The About screen (gear icon) shows game/version/versionCode, commit, CI run, APK file name, OTA update id/runtime/channel and 3D render diagnostics.

## Testing

```sh
npm run check          # typecheck + unit tests
npm test               # tests only (node:test + tsx; no device needed)
```
CI additionally installs the built APK on an Android emulator and drives it (splash, menu, gameplay, About diagnostics, background/foreground). See `docs/HANDOFF.md`.
