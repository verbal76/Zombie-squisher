# Zombie Squisher

Top-down arcade-y driving game. Run swarms of zombies over with your bumper, mounted swords slice anything that brushes the doors, weapons (machine gun, flamethrower, rockets, plasma lance) auto-fire forward, and abilities (nitro, shield, EMP) sit on cooldowns. Squishing kills upgrades stats between runs and unlocks more weapons, side mods, abilities, and vehicles.

Built with Expo SDK 52 + React Native 0.76 + TypeScript. Native Android APKs are built **on GitHub's free Ubuntu runner via `eas build --local`** — zero EAS build minutes. JS-only changes ship as OTA updates.

## Branches

| Branch | Purpose |
|---|---|
| `Github-build-pipeline-zombie-crusher` | Primary working branch. Pushes here trigger OTA + APK builds. |
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
App.tsx                       # scene router + OTA bootstrap
index.ts                      # Expo entry
src/
  components/                 # MenuScreen, GameScreen, GarageScreen, GameOverScreen
  data/                       # vehicles, weapons, abilities, sideMods, zombies (pure data)
  game/engine.ts              # game loop, physics, spawning, combat, blood trails
  store/progress.ts           # AsyncStorage save/load + economy
  types.ts
.github/workflows/
  android-build.yml           # GitHub-runner local APK + tagged release
  eas-update.yml              # OTA publisher
app.json eas.json             # Expo + EAS configuration
```
