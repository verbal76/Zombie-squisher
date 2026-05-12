# Mobile App Pipeline: OTA + APK via GitHub Actions

This is the standard deployment pipeline for any Expo / React Native project
that ships to Android via GitHub Actions. It supports two release channels
out of the same git branch:

- **OTA (Over-the-Air) update** — JS/TS-only changes, lands on user devices
  within seconds via Expo Updates. No app store, no APK install.
- **APK build** — full native rebuild via EAS Build on a GitHub runner.
  Required whenever native code, bundled assets, or build config changes.

A single `paths-ignore` filter on each workflow routes every push to the
correct lane automatically.

For the runtime-rendering side of the same stack (loading and displaying
GLB models with three.js + expo-gl, including the ~10 distinct bugs every
team hits), see [`glb-render-pipeline.md`](./glb-render-pipeline.md).

---

## 1. Mental model — when does each path fire?

Two GitHub Actions workflows watch the same branch. Their `paths-ignore`
lists are mirror images:

| What changed                                    | OTA fires? | APK fires? |
|-------------------------------------------------|------------|------------|
| `src/**` (TypeScript / React components)        | YES        | no         |
| `assets/**` (binary assets bundled into the app)| YES        | YES        |
| `package.json`, `app.json`, `eas.json`          | no         | YES        |
| `metro.config.js`, `babel.config.js`            | no         | YES        |
| `.github/**`, `**/*.md`, `scripts/**`           | no         | no         |

Why this split:

- **Native code / config changes can't be OTA'd** — they live in the APK
  binary. Routing them away from OTA prevents broken updates.
- **JS-only changes don't need a 10-minute APK rebuild** — they fly through
  OTA in ~30 seconds.
- **Bundled assets** need both: APK rebuild for binary inclusion, then the
  next `src/**` commit OTAs the JS that consumes them.
- **Docs / CI configs / build scripts** should fire neither workflow. They
  don't ship to users.

The single most important rule:

> **Never bump `expo.version` in `app.json` without also publishing a new
> APK.** Use `runtimeVersion: { policy: "appVersion" }`. If `appVersion`
> changes, OTAs stop reaching old installs because the runtime no longer
> matches.

For everything beyond this section (workflow definitions, EAS setup,
MCP fallback for restricted commits, per-repo rollout, etc.) see the
full document at
`docs/pipeline-handoff.md` on the working branch.
