# Third-party components and assets

Status: **Verified** = license text/source seen by the engineering session; **Identified** = license stated by a package manifest or by the owner but the original source was not independently checked; **Missing** = no evidence.

## Software (from each package's own `package.json` license field: Identified)
Runtime (app): Expo family (`expo`, `expo-asset`, `-audio`, `-build-properties`, `-constants`, `-file-system`, `-font`, `-gl`, `-haptics`, `-splash-screen`, `-status-bar`, `-updates`), `react`, `react-native`, `react-native-safe-area-context`, `@react-native-async-storage/async-storage`, `@react-three/fiber`, `three`, `upng-js`, `react-native-web`, `react-dom`: **MIT**.
Dev/test: `typescript`, `playwright-core` (Apache-2.0); `tsx`, `@types/*`, `babel-preset-expo`, `@expo/metro-runtime` (MIT).
Desktop shell (`desktop/`): `electron` 38.3.0 (MIT; **bundles Chromium under many licenses, shipped as `LICENSES.chromium.html` and `LICENSE.electron.txt` in every desktop package**), `@electron/packager` (BSD-2-Clause), `resedit` (MIT), `png-to-ico` (MIT).
Required notices for redistribution of Electron/Chromium are included in the packages; third-party notices for the JS dependencies bundled into the web export are not yet compiled into a single NOTICE file (P2).

## Assets
| Asset | Where | Status | Notes |
|---|---|---|---|
| Vehicle, weapon, debris and prop 3D models (108 `.glb`) and `colormap.png` | `assets/` | **Identified, not verified** | Code comments attribute them to the **Kenney** catalogue (Kenney asset packs are published under CC0), but no license file or purchase/download record is in the repository. Owner should record the pack names and links here |
| Zombie character models | `assets-source/characters/*.glb`, baked to `src/assets/baked/zombieModels.json` | **Identified, not verified** | Source attributed to Kenney in `src/assets/characters.ts`; same caveat |
| Sound effects and music | `assets/audio/*.wav` | **Original** | Synthesised by `tools/synth_audio.py` in this repository; no third-party audio |
| App icon / adaptive icon / splash background | `assets/brand/` (except the logo) | **Original** | Procedural artwork from `tools/make_brand_assets.py`; owner may replace with final art |
| Hot Attic Games logo | `assets/brand/hag-logo.png`, `Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png` | **Studio-owned** | Authoritative studio logo, never redrawn |
| Controller / keyboard glyphs | `assets/glyphs/` | **Identified (CC0 1.0 per owner-supplied listing screenshot); original not independently fetched** | "Input Prompts" by JulioCacko, CC0 1.0 Universal, updated 2025-02-03, no generative AI stated on the listing. Details and the SHA-256 of the received archive: `assets/glyphs/README.md`. Save the live listing/license text beside it before commercial release |
| Fonts | none bundled | Not applicable | System fonts only |

Open commercial-licensing actions (owner): record the Kenney pack names/links/licenses; keep the glyph listing as evidence; decide on a compiled NOTICE file.
