# KNOWN_ISSUES.md

Current known issues (updated Oct 2026; details in docs/HANDOFF.md):
- Audio is synthesised (functional, original) and has had no human mix pass on a real phone speaker
- App icon is original procedural artwork (adaptive + monochrome); real art would be better
- Real-device performance at the 500-zombie cap is unmeasured (draw calls were cut ~3000 -> ~18, emulator only)
- Spawn rate / escalation: the 500 cap is reached ~7 s into a run (owner-requested "100x"); the design doc wants gradual escalation
- Starter car is ~2.5x tougher against walkers than the design doc's "roughly 10 impacts"
- Zombie AI is simple chase / flee-on-streak; zombies share one mesh (differentiated by size and tint)
- Vehicle damage states (smoke, dents, fire), tire marks, body launching, ragdolls from the design doc are not implemented
- Controller support not implemented (touch is primary by design)
- New architecture still disabled (Expo SDK 54 is the last SDK that allows that)
- No tutorial / onboarding
