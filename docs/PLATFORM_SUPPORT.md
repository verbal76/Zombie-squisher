# Platform support

One game, one source line (`Github-build-pipeline-zombie-crusher`), three targets built from the same commit.

| Target | Technology | Package | Status |
|---|---|---|---|
| Android | Expo SDK 54 / React Native 0.81 / three.js (R3F + expo-gl), `com.verbal76.zombiesquisher` | APK (AAB capability kept, no Play upload) | Built and emulator-smoked in CI (candidate `384f100`); physical test pending |
| Windows x86-64 | **Same JS game** exported for web (react-native-web + R3F DOM) inside Electron 38 | ZIP | Package built and verified; **never executed on Windows** (no Windows host here) |
| Linux x86-64 (Steam Deck / Steam Machine) | Same, native Electron Linux build | TAR.GZ, `ZombieSquisher.sh` entry point, exec bits verified | Package built; **executed under Xvfb** (menus, injected gamepad, play, pause, focus loss, saves, restart, clean quit); no physical Deck test |

Why Electron: it runs the existing game unchanged (WebGL, Gamepad API, fullscreen, audio), packages for both desktops from one
toolchain and needs no engine migration. Tauri was not chosen: its Linux webview (WebKitGTK) has weaker WebGL/Gamepad support
and would add a Rust toolchain; a native rewrite was out of scope.

## What is shared and what is platform-specific
Shared (never forked): `src/game` (engine, controls), `src/store`, `src/audio` logic, `src/render`, `src/components`, assets, tests.
Platform adapters only:
- `metro.config.js`: for the **web platform only**, `@react-three/fiber/native` resolves to the DOM renderer and `expo-file-system/legacy`
  to `src/platform/web/expoFileSystemLegacy.ts` (fetch-based). Android resolution is untouched.
- `src/platform/desktop.ts` (inert stub, native) / `desktop.web.ts` (keyboard, gamepad, menu focus, prompts, EXIT GAME, pause on focus loss).
  Mapping rules are pure and unit tested in `src/platform/inputMapping.ts`. `GameScreen`/`ControlPad`/`App` have one inert-on-Android hook each.
- `desktop/` (Electron main/preload, own `package.json`, never added to the app's dependencies): `app://` origin, window and fullscreen,
  suspend/resume, single instance, progress mirror file, packaging (`desktop/build.mjs`), Windows exe icon/version resources via `resedit`.

## Building (one interface, one SHA)
- Local: `npm run build -- --platform android|windows|linux|all [--build-number N]` (refuses a dirty tree; every target uses HEAD).
  Windows/Linux need only Node + Python/Pillow; Android needs the Android SDK, JDK 17 and `EXPO_TOKEN` (`tools/build-android.sh`, mirrors CI).
- Hosted: Actions -> **Build (Android / Windows / Linux)** (`build.yml`, manual). See `docs/RELEASES.md`.
- Controls on desktop: gamepad (Left stick/D-pad steer, RT/RB/LB turbo, LT reverse, A ability, X guns, Start pause; menus D-pad/stick, A, B),
  keyboard (A/D or arrows, W/Shift, S, Space, G, Esc), touch on-screen pad unchanged. The game has no mouse camera and no text entry.
- Saves: Android AsyncStorage; desktop localStorage in the Electron profile plus a plain-file mirror (`<userData>/saves/progress.json`).
  Windows `%APPDATA%\Zombie Squisher`, Linux `~/.config/Zombie Squisher`.

## Proven vs not proven
Proven by automated tests/smoke: the shared simulation, input mapping, the Linux package launching and playing under software GL,
persistence, clean exit, package contents, provenance. Not proven: Windows execution, any GPU/Vulkan rendering, real audio output,
real Steam Deck behaviour, Steam Input, Steamworks/Cloud. See `docs/STEAM_HARDWARE_CHECKLIST.md`.
