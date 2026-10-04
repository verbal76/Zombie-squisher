# Handoff / State of the Project

## Archaeology result (2026-10-04)
- Repo history is 5 commits (docs, rename Zombie-squisher → Zombie Crusher, prune workflow, company logo). One branch (`main`), no tags/releases, **no game code existed**.
- Rollback checkpoint: `main` @ `2f8dac0` (pre-work). The prune-artifacts workflow referenced a workflow ("Android APK (GitHub Runner)") that did not exist; it now does.
- Decision: this was a **new build, not a resurrection** (option D by necessity). The previous scaffold in this same session was replaced by the current one.

## Architecture decisions
- Expo SDK 57 (current stable), React Native 0.86, new architecture, Hermes. Matches docs (EAS-compatible, Android, no unnecessary deps).
- Engine separated from rendering so the renderer (currently plain `View`s) can be swapped for Skia/three.js without touching game logic.
- Dependencies: expo, react, react-native, expo-status-bar, expo-splash-screen, expo-constants, expo-keep-awake, expo-build-properties, expo-system-ui, expo-screen-orientation, react-native-safe-area-context.

## Android
- compile/target SDK 36, min 24, NDK 27 (16 KB-aligned), package `com.hotatticgames.zombiecrusher`. Verified in CI by `tools/verify-apk.sh`.

## Known remaining issues
- Rendering uses React Views re-rendered per frame: expect frame drops at max zombie density (150) on low-end devices; needs on-device profiling, likely a Skia renderer.
- Placeholder art/icon (procedural); no audio; no persistence (best score is per-session); no upgrades/vehicle unlocks/bosses yet (see `agentic docs/KNOWN_ISSUES.md`).
- No Bluetooth controller support yet.
- Release signing uses the debug key; no OTA (expo-updates) configured, intentionally.
- Not run on a device/emulator: splash look, touch feel and performance are unverified by a human.
