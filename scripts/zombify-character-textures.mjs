#!/usr/bin/env node
// Build-time pass that recolors the peach skin tone in each Kenney character
// texture to the zombie-green tone used by character O. Output goes alongside
// the source textures as `texture-{letter}-zombie.png`. The runtime picks the
// zombie variant for every character except O (already green) — see
// src/data/characters.ts.
//
// The textures are flat-shaded, so two skin colors dominate (a base and a
// shadow variant). We do a small Euclidean-distance match on those two and
// remap to the matching zombie greens. Anything further away (clothing,
// hair, eyes, beards) is preserved verbatim.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEX_DIR = path.resolve(__dirname, '..', 'assets', 'characters', 'Textures');

// Reference colors (sampled from textures):
//   peach skin   #f6d1a5 / #f4ca98  → zombie green #1abc9c / #138c74 (from O)
//   brown skin   #8d5641 / #7f4d3a  → darker zombie green
// Anything within MATCH_RADIUS Euclidean RGB distance of one of the skin
// references is remapped to the matching zombie color. Hair / clothes /
// beards survive verbatim.
const REMAPS = [
  // Peach skin variants (most characters):
  { fromR: 246, fromG: 209, fromB: 165, toR: 26,  toG: 188, toB: 156 },
  { fromR: 244, fromG: 202, fromB: 152, toR: 19,  toG: 140, toB: 116 },
  { fromR: 236, fromG: 195, fromB: 148, toR: 22,  toG: 165, toB: 135 },
  { fromR: 222, fromG: 181, fromB: 134, toR: 17,  toG: 125, toB: 100 },
  // Brown skin variants (b, f, q):
  { fromR: 141, fromG: 86,  fromB: 65,  toR: 18,  toG: 130, toB: 105 },
  { fromR: 127, fromG: 77,  fromB: 58,  toR: 14,  toG: 100, toB: 80  },
];
const MATCH_RADIUS = 14;

// Characters already in their final color, no recolor needed:
//   o = pre-made zombie (greens)
//   l = mascot already green (#4db781)
//   d = yellow non-human, leave as-is
//   g = hooded purple/grey character, leave as-is
//   h = purple ghost mascot, leave as-is
const SKIP = new Set(['o', 'l', 'd', 'g', 'h']);

function colorDist(r, g, b, tr, tg, tb) {
  const dr = r - tr;
  const dg = g - tg;
  const db = b - tb;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

async function processOne(letter) {
  const inPath = path.join(TEX_DIR, `texture-${letter}.png`);
  const outPath = path.join(TEX_DIR, `texture-${letter}-zombie.png`);
  const img = sharp(inPath);
  const meta = await img.metadata();
  const { data, info } = await img.raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const channels = info.channels; // RGBA
  let touched = 0;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    let bestRemap = null;
    let bestDist = MATCH_RADIUS;
    for (const remap of REMAPS) {
      const d = colorDist(r, g, b, remap.fromR, remap.fromG, remap.fromB);
      if (d < bestDist) {
        bestDist = d;
        bestRemap = remap;
      }
    }
    if (bestRemap) {
      data[i] = bestRemap.toR;
      data[i + 1] = bestRemap.toG;
      data[i + 2] = bestRemap.toB;
      touched++;
    }
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels } })
    .png()
    .toFile(outPath);
  console.log(`  ${letter}: remapped ${touched} pixels → ${path.basename(outPath)}`);
}

async function main() {
  const files = await fs.readdir(TEX_DIR);
  const letters = files
    .map((f) => f.match(/^texture-([a-z])\.png$/))
    .filter(Boolean)
    .map((m) => m[1])
    .filter((l) => !SKIP.has(l))
    .sort();
  console.log(`Zombifying ${letters.length} character textures (skipping: ${[...SKIP].join(',')}):`);
  for (const letter of letters) {
    await processOne(letter);
  }
  console.log('done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
