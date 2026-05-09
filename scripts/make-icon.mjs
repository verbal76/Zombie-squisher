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

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Some sources land in the repo as base64 text rather than raw PNG bytes
// (e.g. when uploaded through the GitHub Contents API path). Detect that and
// decode. Also trim anything after the IEND chunk so trailing C2PA/AI metadata
// doesn't make pngjs throw "unrecognised content at end of stream".
function normalizePng(buf) {
  let out = buf;
  if (out.length < 8 || !out.subarray(0, 8).equals(PNG_MAGIC)) {
    const text = buf.toString('utf8').trim().replace(/\s+/g, '');
    if (/^[A-Za-z0-9+/=]+$/.test(text)) {
      const decoded = Buffer.from(text, 'base64');
      if (decoded.length >= 8 && decoded.subarray(0, 8).equals(PNG_MAGIC)) {
        out = decoded;
      }
    }
  }
  if (out.length < 8 || !out.subarray(0, 8).equals(PNG_MAGIC)) {
    throw new Error('source is neither raw PNG nor base64 PNG');
  }
  // Walk chunks, find IEND, slice off trailing bytes.
  let i = 8;
  while (i + 12 <= out.length) {
    const len = out.readUInt32BE(i);
    const type = out.subarray(i + 4, i + 8).toString('ascii');
    const next = i + 4 + 4 + len + 4;
    if (type === 'IEND') {
      return out.subarray(0, next);
    }
    i = next;
  }
  return out;
}

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
  const raw = fs.readFileSync(srcAbs);
  const cleaned = normalizePng(raw);
  const png = PNG.sync.read(cleaned);
  fs.mkdirSync(path.dirname(dstAbs), { recursive: true });
  fs.writeFileSync(dstAbs, PNG.sync.write(png, { deflateLevel: 9 }));
  console.log(`make-icon: ${src} (${raw.length}b ${raw.length === cleaned.length ? 'raw' : 'normalized'}) -> ${dst} (${png.width}x${png.height})`);
}
