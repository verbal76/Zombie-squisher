#!/usr/bin/env node
// Build pass: take each character's GLB plus its zombified texture and emit a
// self-contained GLB with the texture embedded in the binary chunk. The
// runtime then just parses the GLB and ignores external texture URIs.
//
// For O / L (already-green pre-zombies) we re-embed their original (non-
// zombified) texture so the runtime asset shape is uniform.
//
// GLB layout we produce:
//   12-byte header  (magic, version, total length)
//    8 bytes        (json length, type=JSON)
//    JSON chunk     (4-byte aligned, padded with spaces)
//    8 bytes        (bin length, type=BIN)
//    BIN chunk      (4-byte aligned, padded with zeros)
//
// The PNG is appended to the BIN chunk as one new bufferView.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', 'assets', 'characters');
const TEX = path.join(ROOT, 'Textures');
const OUT = path.join(ROOT, 'embedded');

// Map of character letter → texture filename to embed.
// O / L are pre-zombie greens, use their originals; everyone else gets the
// recolored *-zombie variant produced by zombify-character-textures.mjs.
const PRE_ZOMBIE = new Set(['o', 'l']);
// Non-human variants got the zombie head grafted on (see
// scripts/zombify-character-textures.mjs for the head copy logic) and the
// recolor step skips them; we still pick up the *-zombie.png variant.
const NON_HUMAN = new Set(['d', 'g', 'h']);

function pad4(n) {
  const r = n % 4;
  return r === 0 ? 0 : 4 - r;
}

async function loadGlb(p) {
  const buf = await fs.readFile(p);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB');
  const total = view.getUint32(8, true);
  let off = 12;
  const jsonLen = view.getUint32(off, true);
  off += 8; // skip type field
  const jsonStr = Buffer.from(buf.buffer, buf.byteOffset + off, jsonLen).toString('utf8');
  const gltf = JSON.parse(jsonStr);
  off += jsonLen;
  const binLen = view.getUint32(off, true);
  off += 8;
  const bin = Buffer.from(buf.buffer, buf.byteOffset + off, binLen);
  return { gltf, bin };
}

async function embed(letter) {
  const inGlb = path.join(ROOT, `character${letter}.glb`);
  let texFile;
  if (PRE_ZOMBIE.has(letter)) {
    // Already a zombie texture — embed it as-is.
    texFile = path.join(TEX, `texture-${letter}.png`);
  } else {
    // Recolored skin or grafted zombie head.
    texFile = path.join(TEX, `texture-${letter}-zombie.png`);
  }

  const { gltf, bin } = await loadGlb(inGlb);
  const png = await fs.readFile(texFile);

  // Append PNG to BIN chunk as a new bufferView.
  const binPad = pad4(bin.length);
  const newBufferOffset = bin.length + binPad;
  const newBin = Buffer.concat([bin, Buffer.alloc(binPad), png]);
  const newBinPad = pad4(newBin.length);
  const newBinPadded = Buffer.concat([newBin, Buffer.alloc(newBinPad)]);

  // Patch the glTF JSON.
  const newBVIndex = (gltf.bufferViews ?? []).length;
  gltf.bufferViews = gltf.bufferViews ?? [];
  gltf.bufferViews.push({
    buffer: 0,
    byteOffset: newBufferOffset,
    byteLength: png.length,
  });
  gltf.images = gltf.images ?? [];
  if (gltf.images.length === 0) gltf.images.push({});
  delete gltf.images[0].uri;
  gltf.images[0].bufferView = newBVIndex;
  gltf.images[0].mimeType = 'image/png';

  // Update buffer length.
  gltf.buffers[0].byteLength = newBin.length;

  // Re-serialize JSON, pad to 4-byte boundary with spaces.
  let jsonStr = JSON.stringify(gltf);
  const jsonPad = pad4(jsonStr.length);
  jsonStr += ' '.repeat(jsonPad);
  const jsonBuf = Buffer.from(jsonStr, 'utf8');

  // Build final GLB.
  const totalLen = 12 + 8 + jsonBuf.length + 8 + newBinPadded.length;
  const out = Buffer.alloc(totalLen);
  let p = 0;
  out.writeUInt32LE(0x46546c67, p); p += 4;
  out.writeUInt32LE(2, p); p += 4;
  out.writeUInt32LE(totalLen, p); p += 4;
  out.writeUInt32LE(jsonBuf.length, p); p += 4;
  out.writeUInt32LE(0x4e4f534a, p); p += 4; // 'JSON'
  jsonBuf.copy(out, p); p += jsonBuf.length;
  out.writeUInt32LE(newBinPadded.length, p); p += 4;
  out.writeUInt32LE(0x004e4942, p); p += 4; // 'BIN\0'
  newBinPadded.copy(out, p);

  const outPath = path.join(OUT, `character${letter}.glb`);
  await fs.writeFile(outPath, out);
  console.log(`  ${letter}: ${out.length} bytes (was ${(await fs.stat(inGlb)).size}) → ${path.relative(ROOT, outPath)}`);
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const files = await fs.readdir(ROOT);
  const letters = files
    .map((f) => f.match(/^character([a-z])\.glb$/))
    .filter(Boolean)
    .map((m) => m[1])
    .sort();
  console.log(`Embedding ${letters.length} character GLBs (zombie textures baked in):`);
  for (const letter of letters) {
    await embed(letter);
  }
  console.log('done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
