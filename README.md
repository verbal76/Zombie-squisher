# Zombie Crusher
Drive vehicles over zombies and kill them to upgrade weapons and unlock new vehicles.

A Hot Attic Games mobile arcade game. Expo SDK 57 / React Native 0.86, Android, landscape, touch-first.

## Develop
```
npm ci
npm test            # engine + release-identity tests (Node, no device needed)
npx expo start      # run in Expo Go / dev client
```

## Build an APK
CI (`.github/workflows/android-apk.yml`, "Android APK (GitHub Runner)") runs tests, `expo prebuild`, `gradlew assembleRelease`,
then renames and verifies the APK. Artifacts are named `<GameName>-v<versionName>.apk` (`tools/apk-name.js`), e.g. `Zombie-Crusher-v0.1.0.apk`.
`tools/verify-apk.sh` checks package/version identity, targetSdk >= 35 and 16 KB page-size alignment (zip + ELF).

To ship a new test build: bump `version` and `android.versionCode` in `app.json` (versionCode must increase every build).
The `android/` folder is generated (continuous native generation) and not committed.
Release APKs are currently signed with the standard Android debug key (test installs only). A Play upload key is required before store release.

## Layout
- `src/game/engine.js` – pure game logic (no React); unit tested in `tests/`
- `App.js`, `src/components/` – screens (HAG splash → menu → game), HUD, touch controls
- `tools/` – asset generation (`make_assets.py`), APK naming/verification
- `Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png` – authoritative company logo (never redrawn; `assets/hag-logo.png` is a crop/resize)
- `agentic docs/` – project rules; `docs/HANDOFF.md` – current state and decisions

## Startup sequence
Android 12+ system splash is background-colour only (`#0d0805`, transparent icon) → in-app Hot Attic Games logo (fade in/hold/out, ~1.75 s) → menu.
