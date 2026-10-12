# Controller / keyboard prompt glyphs

Subset of the studio-supplied **"Input Prompts"** pack by **JulioCacko** (archive `Source.zip`, received from the owner
2026-10-12, SHA-256 `f6c75921b9d6ab2cb2b5249f547c7b7ba19e22da9f4f3b45693cf0912f25ded0`). Used by the desktop build's on-screen prompts (`src/platform/glyphs.web.ts`).

| Folder | From the archive | Used for |
|---|---|---|
| `xbox/` | `XGamepad/Default` (A, B, X use the *_Color variants), 128x128 | Xbox / Steam Deck ABXY prompts |
| `key/` | `Keyboard_Mouse/White`, 128x128 | keyboard prompts |

**License:** Creative Commons Zero v1.0 Universal (CC0 1.0): free for commercial and non-commercial use, no attribution
required. Evidence: the owner supplied a screenshot of the pack's store page (itch.io / FAB listing) showing
"Asset license: Creative Commons Zero v1.0 Universal", "Code license: MIT", "No generative AI was used", last updated
2025-02-03. The archive itself contains no license file, and the listing was NOT independently fetched or verified by
the engineering session, so before a commercial release the owner (or reviewer) should save the live listing / license
text next to this file. Credit to the author is appreciated but not required.

**Gaps:** the Xbox set has no Menu/Start glyph (only "Share" variants), so "Pause" is shown as a text badge.
PlayStation (`P4Gamepad`, `P5Gamepad`) and Switch (`SGamepad`) sets are in the archive but not imported: Steam Deck and
Xbox use ABXY, and Steam Input presents every pad as Xbox-style to the game.
