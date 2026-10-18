#!/usr/bin/env node
// Rebuilds app/favicon.ico from app/icon.svg (the small Aperture Dome on its
// violet tile): 16, 32 and 48 px PNGs in one ICO, which every browser reads.
// Run it after changing the mark or the icon:
//   node scripts/build-favicon.mjs
// tests/brand.test.ts checks the result holds those three sizes.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const root = join(import.meta.dirname, '..');
const svg = readFileSync(join(root, 'app', 'icon.svg'));
const SIZES = [16, 32, 48];

// Rasterise each size straight from the vector (not by shrinking a big PNG),
// so small sizes stay as crisp as the drawing allows.
const pngs = await Promise.all(
  SIZES.map((size) => sharp(svg, { density: Math.ceil((72 * size) / 32) * 4 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer())
);

// ICONDIR, then one ICONDIRENTRY per image, then the PNG data.
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(SIZES.length, 4);
const entries = [];
let offset = 6 + 16 * SIZES.length;
SIZES.forEach((size, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(size % 256, 0); // width (0 means 256)
  e.writeUInt8(size % 256, 1); // height
  e.writeUInt8(0, 2); // palette colours
  e.writeUInt8(0, 3); // reserved
  e.writeUInt16LE(1, 4); // colour planes
  e.writeUInt16LE(32, 6); // bits per pixel
  e.writeUInt32LE(pngs[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  entries.push(e);
});

writeFileSync(join(root, 'app', 'favicon.ico'), Buffer.concat([header, ...entries, ...pngs]));
console.log(`app/favicon.ico: ${SIZES.join(', ')} px (${offset} bytes)`);
