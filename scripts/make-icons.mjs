// Draws the extension icons (the orb on the page background) as PNGs.
// No dependencies: pixels are computed here and encoded with node:zlib.
// Usage: node scripts/make-icons.mjs   (writes icons/icon-{16,48,128}.png)
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';

// Colours from style.css.
const BG = [0x12, 0x13, 0x17];                 // --bg
const ORB_LIGHT = [0xf6, 0xc9, 0xa4];          // --orb-light
const ORB_MID = [0xe9, 0xa5, 0x7a];
const ORB_DARK = [0xc9, 0x79, 0x4a];           // --orb-dark
const GLOW = [0xe9, 0xa5, 0x7a];

// Per size: the dark tile's inset (the store asks for 16px padding on the
// 128 icon), its corner radius, and the orb diameter, all as fractions.
const SIZES = {
  16: { inset: 0, radius: 0.22, orb: 0.62 },
  48: { inset: 0, radius: 0.22, orb: 0.56 },
  128: { inset: 16 / 128, radius: 0.22, orb: 0.5 },
};
const SS = 4; // supersampling per axis

const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// CSS: radial-gradient(circle at 38% 32%, light 0%, mid 45%, dark 100%),
// sized to the farthest corner of the orb's box.
function orbColour(u, v) {
  const t = Math.min(1, Math.hypot(u - 0.38, v - 0.32) / Math.hypot(0.62, 0.68));
  return t < 0.45 ? lerp(ORB_LIGHT, ORB_MID, t / 0.45) : lerp(ORB_MID, ORB_DARK, (t - 0.45) / 0.55);
}

// Inside test for a rounded square spanning [lo, hi] on both axes.
function inTile(x, y, lo, hi, r) {
  const cx = Math.min(Math.max(x, lo + r), hi - r);
  const cy = Math.min(Math.max(y, lo + r), hi - r);
  return Math.hypot(x - cx, y - cy) <= r;
}

// Colour and alpha of one sample point, in pixel units.
function sample(x, y, size, spec) {
  const lo = spec.inset * size;
  const hi = size - lo;
  if (!inTile(x, y, lo, hi, spec.radius * (hi - lo))) return [0, 0, 0, 0];

  const c = size / 2;
  const R = (spec.orb * (hi - lo)) / 2;
  const d = Math.hypot(x - c, y - c);
  if (d <= R) {
    const [r, g, b] = orbColour((x - (c - R)) / (2 * R), (y - (c - R)) / (2 * R));
    return [r, g, b, 1];
  }
  // Soft static glow around the orb, like its box-shadow.
  const glow = 0.28 * Math.exp(-(((d - R) / (0.55 * R)) ** 2));
  const [r, g, b] = lerp(BG, GLOW, glow);
  return [r, g, b, 1];
}

function render(size) {
  const spec = SIZES[size];
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Average premultiplied samples so edges blend into transparency cleanly.
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [sr, sg, sb, sa] = sample(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS, size, spec);
          r += sr * sa; g += sg * sa; b += sb * sa; a += sa;
        }
      }
      const i = (y * size + x) * 4;
      if (a > 0) {
        px[i] = Math.round(r / a);
        px[i + 1] = Math.round(g / a);
        px[i + 2] = Math.round(b / a);
      }
      px[i + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return px;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // Each scanline starts with filter type 0 (none).
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = new URL('../icons/', import.meta.url);
mkdirSync(outDir, { recursive: true });
for (const size of Object.keys(SIZES).map(Number)) {
  writeFileSync(new URL(`icon-${size}.png`, outDir), png(size, render(size)));
  console.log(`icons/icon-${size}.png (${size}×${size})`);
}
