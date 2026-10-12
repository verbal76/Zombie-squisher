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

### Release authorization (nothing publishes automatically)
A push, merge, pull request, tag, version bump or docs change never publishes or builds anything expensive. Building, merging and
publishing are separate, explicit operations (Actions tab -> Run workflow). Full detail: `docs/RELEASES.md`.

| Operation | Workflow | How |
|---|---|---|
| Fast checks | `ci.yml` | automatic on pull requests (skips docs-only) |
| Android APK / Windows ZIP / Linux TAR.GZ (one SHA, one build number) | `build.yml` | manual: `platform`, `source_sha`, `build_number`, `destination = local_only` (default) |
| Publish one GitHub Release `Zombie Squisher Build NN` | `build.yml` | same, `destination = github_releases`, source must be in the release-branch lineage |
| Publish an OTA | `eas-update.yml` | manual on the pipeline branch, choose channel, `confirm = PUBLISH-OTA` |

An OTA reaches only installs whose native runtime equals `app.json` `version` (policy `appVersion`); a change that needs
native code or config needs a version bump and an APK/AAB, not an OTA. Release tags are created on the built commit and
re-checked; the build manifest, the app and the run must report the same SHA or the release fails. Secret used: `EXPO_TOKEN`
(stored as `ZOMBIE`).

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
App.tsx                       # scene router, HAG splash gate, settings, OTA bootstrap (OTA applies only from the menu)
index.ts                      # Expo entry (loads the dev-only UI gallery when EXPO_PUBLIC_UI_GALLERY=1)
src/
  game/engine.ts              # rules: driving, spawning, combat, streaks, bosses (pure, unit + soak tested)
  game/controls.ts            # touch layout, hit testing, multi-touch tracker (pure, tested)
  components/                 # GameScreen (loop/pause/audio coordinator), GameScene (3D), GameHud, ControlPad,
                              # ZombieHorde + BloodSplats (instanced), Menu, Garage, GameOver, HagSplash, About
  audio/                      # AudioDirector (pure, tested), expo-audio backend, sound catalogue
  render/                     # GLB helpers, zombie model builder (from the baked JSON), vehicle loader, grass
  store/                      # progressLogic (economy + save sanitising, pure), settingsLogic, AsyncStorage wrappers
  data/                       # vehicles, weapons, abilities, side mods, zombies; objects.ts = only bundled GLBs
  ui/                         # scrapyard theme, Button, Plate, HazardStripe
  dev/UiGallery.tsx           # browser UI preview harness (never in the app bundle)
  assets/baked/               # zombieModels.json - build-time bake of the 18 Kenney characters
assets/brand/                 # app icon (adaptive + monochrome), blank native splash, Hot Attic Games logo
assets/audio/                 # synthesised sound effects + music loop (tools/synth_audio.py)
assets-source/characters/     # Kenney character GLBs + palettes (inputs to tools/bake-characters.ts, not bundled)
plugins/                      # config plugins: GLB no-compress, Gradle memory
tests/                        # engine, soak, economy/save, input, audio, render/assets, release identity
tools/                        # apk-name.js, verify-apk.sh, emulator-smoke.sh, ui-shots.mjs, simulate.ts, bakes, synth
.github/workflows/
  ci.yml                      # typecheck + tests + bundle + prebuild + UI preview, every branch/PR (no secrets)
  build-apk.yml               # reusable: signed APK -> name -> verify (identity/signer/16 KB) -> emulator smoke test
  build.yml                   # THE manual coordinated build (Android + Windows + Linux, one SHA/build number, optional release)
  build-apk.yml               # reusable Android build + identity/signer/16 KB gates + optional emulator smoke
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
npm run check                       # typecheck + all unit/soak/asset tests (no device)
node --import tsx tools/simulate.ts # headless balance probe: bots play the real engine
EXPO_PUBLIC_UI_GALLERY=1 npx expo export --platform web --output-dir /tmp/g && node tools/ui-shots.mjs /tmp/g shots
```

CI additionally installs the built APK on an Android emulator and drives it (splash, menu, gameplay, About diagnostics, background/foreground). See `docs/HANDOFF.md`.
