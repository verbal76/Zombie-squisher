# Steam Deck / Steam Machine checklist (project-specific)

Source of requirements: Hot Attic Games master standard v2.0, section 12 (which cites Valve's *Steam Hardware Recommendations* and *Steam Deck
Compatibility* pages; those pages were **not fetched or re-read** in this pass). Valve Verified status is Valve's to award and is **not claimed**.
"Automated" = executed in this repository's tests/smoke (packaged Linux build under Xvfb with software GL and an *injected* gamepad).
Nothing below has been run on a physical Steam Deck, Steam Machine, or Windows PC.

| # | Requirement | Status | Evidence / note |
|---|---|---|---|
| 12.1 | Controller-only: launch, menus, settings, gameplay, pause, resume, save/load, exit | PASS (automated) / hardware PENDING | `tools/desktop-smoke.mjs`: focus starts on DRIVE, D-pad/stick navigation, SFX toggle by A, play, Start pause/resume, B back; saves automatic; **EXIT GAME** on the main menu (`desktop-restart-test`: clean quit, exit code 0). Pad rules unit-tested (dead zone/hysteresis, no input carried across pause/menu, no ability fire from the confirming A) |
| 12.1 | Steam Input default configuration | PENDING | Game reads the standard Gamepad API, which Steam Input exposes with the stock "Gamepad" template; no custom config shipped; needs Steamworks/Deck to verify. Remapping is not interfered with |
| 12.2 | Automatic on-screen keyboard | NOT APPLICABLE | The game has no text entry (`grep TextInput` = 0). Re-check if any is added |
| 12.3 | Mixed mouse + joystick camera | NOT APPLICABLE (camera is automatic) / prompt stability PASS (automated) | `PromptSelector` hysteresis: no glyph flicker with two devices; manual override (View/Back or F2), stored per device |
| 12.4 | Camera sensitivity calibration (0.022 deg/px, 2.5x) | NOT APPLICABLE | No mouse/stick-driven camera; established chase-camera feel untouched |
| 12.5 | 1280x800, 16:10, 16:9, other, ultrawide | PASS (automated) | Every focusable control inside the display and no page overflow at 1280x800, 1280x720, 1920x1080, 1024x640, 2560x1080; screenshots in the smoke output. Handheld legibility on the real 7" panel: PENDING |
| 12.6 | Graphics API (Vulkan) | UNVERIFIED | Chromium/ANGLE default backend; not tested with Vulkan; no claim |
| 12.7 | Portable codecs | PASS by design / playback UNVERIFIED | Audio is WAV, no video. No sound device in CI, so real output is unverified |
| 12.8 | Graphics settings per device, no hardware locking | PARTIAL | None are locked and none sync (no graphics settings exist). Automatic / Quality / Cool-Battery modes are **not implemented** (P3, owner scope: touches rendering) |
| 12.9 | Offline single-player | PASS (automated, partial) | Whole game is local; the update check is skipped/swallowed on desktop; smoke ran with no network. First launch on a fresh Steam account offline, reconnection and Cloud sync: PENDING |
| 12.10 | No external launcher | PASS | Direct launch (`ZombieSquisher.sh` / `.exe`); `SetGameLauncherMode` not needed |
| 12.11 | Performance | PARTIAL | **Measured:** shared simulation at the 500-zombie cap = 0.37 ms avg / 2.2 ms p99 per step (`tools/bench-sim.ts`, this machine). **Not representative:** rendering in Xvfb with *software* GL ran ~5 fps. Deck FPS, frame pacing, GPU/CPU use, memory over time, load times, thermals, battery: PENDING (hardware) |
| 12.12 | Stability | PARTIAL | Automated: cold + repeated launch, single instance, kill -9 recovery, focus-loss pause, simulated controller disconnect/reconnect, clean exit. PENDING: real suspend/resume (handler wired to Electron `powerMonitor`), extended play, real controller hot-plug |
| 11 | Saves / Steam Cloud | PARTIAL | Versioned key `zs:progress:v2`; backup copy + corrupt-value preservation (`progressStore`); desktop plain-file mirror `saves/progress.json` (atomic replace, `.bak`) restored when live storage is lost/corrupt (tested). Steam Cloud itself: PENDING (needs Steamworks; point Auto-Cloud at `saves/progress.json`; do not sync settings) |
| 13 | Glyphs | PASS (integration) / license evidence PARTIAL | Xbox/Deck ABXY + keyboard prompts from the studio pack (`assets/glyphs`, see `docs/THIRD_PARTY_ASSETS.md`). No Menu/Start glyph in the pack: text badge |

## Physical test list for the owner (Steam Deck, when available)
1. Extract the Linux TAR.GZ, add as a non-Steam game, launch from Gaming Mode: starts fullscreen 1280x800, focus on DRIVE, no keyboard/mouse needed.
2. Play 3 runs: steering/turbo/reverse/ability/guns on the Deck controls, prompts show ABXY; pause with Menu; EXIT GAME from the main menu.
3. Record FPS feel during the dense horde (about 7 s in) and a 15-minute session; note heat/battery.
4. Sleep the Deck mid-run and wake it: the game should be paused, not running blind.
5. Check sound through speakers and headphones.
