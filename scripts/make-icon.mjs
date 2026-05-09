// Round-trips PNG sources through pngjs to strip every chunk except IHDR/IDAT/
// IEND. expo prebuild's @expo/image-utils (Sharp / libvips) chokes on PNGs
// carrying non-standard chunks (sRGB profiles, animated-PNG metadata, weird
// editor color-space hints). pngjs always decodes to 8-bit RGBA, so the output
// is the lowest-common-denominator format Sharp accepts cleanly.
//
// Sources live at src/assets/<name>.png (committed). Outputs live at
// assets/<name>.png (git-ignored, regenerated each build).
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const sources = [
  { src: 'src/assets/icon.png', dst: 'assets/icon.png' },
];

for (const { src, dst } of sources) {
  const srcAbs = path.join(repoRoot, src);
  const dstAbs = path.join(repoRoot, dst);
  if (!fs.existsSync(srcAbs)) {
    console.error(`make-icon: missing source ${src}`);
    process.exit(1);
  }
  const png = PNG.sync.read(fs.readFileSync(srcAbs));
  fs.mkdirSync(path.dirname(dstAbs), { recursive: true });
  fs.writeFileSync(dstAbs, PNG.sync.write(png, { deflateLevel: 9 }));
  console.log(`make-icon: ${src} -> ${dst} (${png.width}x${png.height})`);
}
