# KNOWN_ISSUES.md

Current Known Issues (updated 2026-10 resurrection; see docs/HANDOFF.md for detail):
- App icon is a procedural placeholder (car + zombie); needs real art
- Garage and Game Over screens are portrait-first scroll layouts, not yet re-laid-out for landscape
- No audio at all
- Performance with 500 individually cloned 3D zombies is unmeasured on real devices (spawn rate is "100x" by owner request, so the cap is reached within seconds of starting)
- Zombie AI is simple chase / flee-on-streak
- Upgrade and economy balancing not validated
- Controller support not implemented yet
- New architecture is still disabled (Expo SDK 54 is the last SDK where that is allowed)
