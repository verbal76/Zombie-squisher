// Replaces the old make-icon step. Brand assets are committed under assets/brand
// (regenerate with `python3 tools/make_brand_assets.py`). This only verifies they
// exist and are real PNGs so a broken asset fails the build instead of silently
// shipping Expo's default icon (which is what the old tolerant script allowed).
import fs from 'node:fs';

const REQUIRED = [
  'assets/brand/icon.png',
  'assets/brand/adaptive-icon-foreground.png',
  'assets/brand/adaptive-icon-monochrome.png',
  'assets/brand/splash-blank.png',
  'assets/brand/hag-logo.png',
];
const MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
let bad = 0;
for (const f of REQUIRED) {
  if (!fs.existsSync(f)) { console.error(`brand-assets: MISSING ${f}`); bad++; continue; }
  const b = fs.readFileSync(f);
  const iend = b.subarray(b.length - 12);
  const ok = b.subarray(0, 8).equals(MAGIC) && iend.subarray(4, 8).toString('latin1') === 'IEND';
  if (!ok) { console.error(`brand-assets: CORRUPT/TRUNCATED PNG ${f}`); bad++; }
}
if (bad) process.exit(1);
console.log(`brand-assets: ${REQUIRED.length} assets OK`);
