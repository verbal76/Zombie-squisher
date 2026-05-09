// Re-encodes PNG sources via sharp into a clean 8-bit RGBA PNG that
// expo prebuild's @expo/image-utils accepts cleanly. sharp is more lenient
// than pngjs (tolerates trailing C2PA / EXIF / color-profile junk that
// AI image generators and editors tack on after the IEND chunk).
//
// Sources live at src/assets/<name>.png (committed). Outputs live at
// assets/<name>.png (git-ignored, regenerated each build).
//
// One quirk: sources uploaded through the GitHub Contents API path land
// in git as base64 text instead of raw PNG bytes. Detect that and decode
// before handing to sharp.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function loadPng(srcAbs) {
  const raw = fs.readFileSync(srcAbs);
  if (raw.length >= 8 && raw.subarray(0, 8).equals(PNG_MAGIC)) {
    return raw;
  }
  const text = raw.toString('utf8').trim().replace(/\s+/g, '');
  if (/^[A-Za-z0-9+/=]+$/.test(text)) {
    const decoded = Buffer.from(text, 'base64');
    if (decoded.length >= 8 && decoded.subarray(0, 8).equals(PNG_MAGIC)) {
      return decoded;
    }
  }
  throw new Error(`source ${srcAbs} is neither raw PNG nor base64-encoded PNG`);
}

const sources = [
  { src: 'src/assets/icon.png', dst: 'assets/icon.png', size: 1024 },
];

for (const { src, dst, size } of sources) {
  const srcAbs = path.join(repoRoot, src);
  const dstAbs = path.join(repoRoot, dst);
  if (!fs.existsSync(srcAbs)) {
    console.error(`make-icon: missing source ${src}`);
    process.exit(1);
  }
  const buf = loadPng(srcAbs);
  fs.mkdirSync(path.dirname(dstAbs), { recursive: true });
  await sharp(buf).resize(size, size).png().toFile(dstAbs);
  console.log(`make-icon: ${src} (${buf.length}b) -> ${dst} (${size}x${size})`);
}
