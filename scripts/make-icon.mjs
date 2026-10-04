// Re-encodes PNG sources via sharp into a clean 8-bit RGBA PNG. sharp is
// more lenient than pngjs (tolerates trailing C2PA / EXIF / color-profile
// junk that AI image generators tack on after the IEND chunk).
//
// Sources live at src/assets/<name>.png (committed). Outputs live at
// assets/<name>.png (git-ignored, regenerated each build).
//
// Tolerant by design: if the source is unreadable (e.g. corrupted in
// transit through the GitHub Contents API), the script logs a warning
// and exits 0 so CI keeps moving. The Expo build then falls back to its
// default icon, which is fine for a placeholder build — push a real
// source PNG from a local clone (no proxy in the way) when ready.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function loadPng(srcAbs) {
  const raw = fs.readFileSync(srcAbs);
  if (raw.length >= 8 && raw.subarray(0, 8).equals(PNG_MAGIC)) return raw;
  const text = raw.toString('utf8').trim().replace(/\s+/g, '');
  if (/^[A-Za-z0-9+/=]+$/.test(text)) {
    const decoded = Buffer.from(text, 'base64');
    if (decoded.length >= 8 && decoded.subarray(0, 8).equals(PNG_MAGIC)) return decoded;
  }
  return null;
}

const sources = [
  { src: 'src/assets/icon.png', dst: 'assets/icon.png', size: 1024 },
];

for (const { src, dst, size } of sources) {
  const srcAbs = path.join(repoRoot, src);
  const dstAbs = path.join(repoRoot, dst);
  if (!fs.existsSync(srcAbs)) {
    console.warn(`make-icon: missing source ${src} — skipping`);
    continue;
  }
  const buf = loadPng(srcAbs);
  if (!buf) {
    console.warn(`make-icon: ${src} is not a readable PNG — skipping (Expo will use its default)`);
    continue;
  }
  try {
    fs.mkdirSync(path.dirname(dstAbs), { recursive: true });
    await sharp(buf).resize(size, size).png().toFile(dstAbs);
    console.log(`make-icon: ${src} (${buf.length}b) -> ${dst} (${size}x${size})`);
  } catch (err) {
    console.warn(`make-icon: sharp failed on ${src}: ${err.message} — skipping`);
  }
}
