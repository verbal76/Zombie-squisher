// Controller / keyboard prompt images for the desktop build (CC0 "Input Prompts" pack, see assets/glyphs/README.md).
// Web-only: Metro turns each require() into a hashed URL inside the exported game.
import { Asset } from 'expo-asset';

const SRC: Record<string, number> = {
  'xbox/A': require('../../assets/glyphs/xbox/A.png'), 'xbox/B': require('../../assets/glyphs/xbox/B.png'), 'xbox/X': require('../../assets/glyphs/xbox/X.png'),
  'xbox/L': require('../../assets/glyphs/xbox/L.png'), 'xbox/LT': require('../../assets/glyphs/xbox/LT.png'), 'xbox/RT': require('../../assets/glyphs/xbox/RT.png'),
  'xbox/Dpad': require('../../assets/glyphs/xbox/Dpad.png'),
  'key/A': require('../../assets/glyphs/key/A.png'), 'key/D': require('../../assets/glyphs/key/D.png'), 'key/W': require('../../assets/glyphs/key/W.png'),
  'key/S': require('../../assets/glyphs/key/S.png'), 'key/G': require('../../assets/glyphs/key/G.png'), 'key/Space': require('../../assets/glyphs/key/Space.png'),
  'key/Esc': require('../../assets/glyphs/key/Esc.png'), 'key/Shift': require('../../assets/glyphs/key/Shift.png'), 'key/Enter': require('../../assets/glyphs/key/Enter.png'),
  'key/Left': require('../../assets/glyphs/key/Left.png'), 'key/Right': require('../../assets/glyphs/key/Right.png'),
  'key/Up': require('../../assets/glyphs/key/Up.png'), 'key/Down': require('../../assets/glyphs/key/Down.png'),
};

export function glyphUri(id: string): string | null {
  const m = SRC[id];
  return m === undefined ? null : Asset.fromModule(m).uri ?? null;
}
