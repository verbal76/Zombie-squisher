# Update architecture

Identifiers: game build number (`BUILD_INFO.buildNumber`, shown in About), source SHA, native runtime id (`app.json` `version` = Expo
`runtimeVersion`, policy `appVersion`, currently `1.1.0`), update channel (`preview`), artifact SHA-256 (build manifest).

## Android: Expo Updates (OTA) + full APK
- Delivery: EAS Update over HTTPS to the installed `com.verbal76.zombiesquisher`, channel `preview`, project `9b498cb4-...`.
  Only installs whose native runtime equals the update's `runtimeVersion` receive it. `1.1.0` is a new native runtime (SDK 54), so the
  old `1.0.0` APK never receives `1.1.0` updates.
- Safety provided by `expo-updates` (library behaviour, not independently re-tested here): manifest served by EAS for the project over HTTPS, staged download,
  activation on next launch, the embedded bundle as the fallback if an update fails to launch, rollback by publishing the previous update to the channel. The app checks at start-up, applies only from the main
  menu (never mid-run), and a failed or offline check is swallowed (`App.tsx`), so gameplay never waits on the network.
- OTA can carry: JS, game rules, UI, shipped assets in the JS bundle. A new APK is required for: native modules/plugins, permissions, Expo SDK / RN /
  Hermes changes, `app.json` native config, icon/splash, versionCode/runtime changes. Bump `version` whenever a native build is needed.
- Publishing: `eas-update.yml` only; manual, release branch, `confirm = PUBLISH-OTA`, tests first. No other workflow can run `eas update` (test-enforced).
- Gaps vs the studio standard (documented, not worked around): no custom code-signing certificate for updates (EAS project auth only); no in-app
  display of the *active update id* beyond the About build identity; rollback is operational (republish) rather than in-app. Major OTA changes are RED.

## Windows / Linux: SteamPipe
Steam delivers and patches the game files; there is **no custom binary updater** and the desktop shell never contacts an update server.
`expo-updates` code is inert on the web build. Save compatibility across Steam updates relies on the versioned key `zs:progress:v2` plus the progress
mirror and backup copy (see `docs/STEAM_HARDWARE_CHECKLIST.md`). SteamPipe depot/branch setup needs Steamworks access: **pending**.

## Separation
GitHub Release creation never publishes an OTA; an OTA never builds a native binary; neither uploads to Steam or Google Play.
