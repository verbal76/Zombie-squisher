# Zombie Squisher

Top-down arcade-y driving game. Run over swarms of zombies. Squish kills upgrade your vehicle, unlock weapons (machine gun, flamethrower, rockets, plasma lance), unlock abilities (nitro, shield, EMP), and unlock new vehicles (pickup, muscle car, tank, APC).

Built with Expo + React Native. Native builds happen on EAS via GitHub Actions; over-the-air updates ship to your installed builds without going through the stores.

## Stack

- Expo SDK 52 + React Native 0.76 (New Arch)
- TypeScript
- AsyncStorage for save data
- expo-updates for OTA
- EAS Build for native binaries
- GitHub Actions for both

## Local development

```sh
npm install
npm run start          # Expo dev server
npm run android        # or
npm run ios
npm run typecheck
```

## EAS setup (one-time)

1. Create an Expo account and an `eas` project for this app:

   ```sh
   npm i -g eas-cli
   eas login
   eas init
   ```

   `eas init` will write a real project ID into `app.json` (`expo.extra.eas.projectId` and `expo.updates.url`). Replace the `PLACEHOLDER_PROJECT_ID` strings if `eas init` doesn't.

2. Create an Expo access token for CI: https://expo.dev/accounts/[acct]/settings/access-tokens

3. Add it to GitHub: **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `EXPO_TOKEN`
   - Value: (paste the token)

4. Configure update channels (one-time):

   ```sh
   eas update:configure
   eas channel:create production
   eas channel:create preview
   ```

   Channels in `eas.json` are wired so `production` builds receive `production` updates, `preview` builds receive `preview` updates, etc.

## CI workflows

- **`.github/workflows/eas-build.yml`** — manual dispatch (`Run workflow` in the Actions tab) or trigger by pushing a `v*` tag. Pick `profile` (`development`/`preview`/`production`) and `platform` (`android`/`ios`/`all`). Native binaries land on the EAS dashboard.

- **`.github/workflows/eas-update.yml`** — runs automatically on every push to `main` (excluding readme/CI/config-only changes) and publishes a JS-only OTA update to the `production` channel. You can also dispatch it manually to push to a different channel.

Typical flow:

- Native code or dependency changes → tag `vX.Y.Z` → EAS build runs → distribute new binaries via TestFlight / Play / internal distribution.
- JS/asset-only changes → merge to `main` → OTA update runs → installed apps pull the update on next launch.

## Game design

- **Vehicles**: Rust Bucket → Pickup (250 kills) → Muscle Car (800) → Battle Tank (2,500) → Reaper APC (6,000).
- **Vehicle stats** (per-vehicle, persisted): Speed / Armor / Handling, 5 upgrade tiers each at 50 / 150 / 400 / 900 / 2,000 kills.
- **Weapons** unlock from total lifetime kills: MG (50), Flame (250), Rockets (750), Plasma Lance (2,500).
- **Abilities** unlock from total lifetime kills: Nitro (100), Shield (500), EMP (1,500).
- **Zombies** scale in HP and spawn rate with the wave counter (every 25 kills). Runners, Brutes, and Spitters appear at deeper waves.

## Project layout

```
App.tsx                       # scene router + OTA bootstrap
index.ts                      # Expo entry
src/
  components/                 # MenuScreen, GameScreen, GarageScreen, GameOverScreen
  data/                       # vehicles, weapons, abilities, zombies (pure data)
  game/engine.ts              # game loop, physics, spawning, combat
  store/progress.ts           # AsyncStorage save/load + economy
  types.ts
.github/workflows/            # eas-build.yml, eas-update.yml
app.json eas.json             # Expo + EAS configuration
```
