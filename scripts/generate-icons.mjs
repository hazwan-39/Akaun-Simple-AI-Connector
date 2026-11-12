// Generates placeholder PNG icons (teal tile with a white bar-chart glyph).
// Replace with designed artwork before any Marketplace submission.
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const OUT = new URL("../apps/excel-addin/public/assets/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const r = size * 0.18; // corner radius
  const bars = [
    { x0: 0.22, x1: 0.36, top: 0.55 },
    { x0: 0.43, x1: 0.57, top: 0.35 },
    { x0: 0.64, x1: 0.78, top: 0.2 },
  ];
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const i = y * (size * 4 + 1) + 1 + x * 4;
      const cx = Math.min(x, size - 1 - x);
      const cy = Math.min(y, size - 1 - y);
      const outside = cx < r && cy < r && (r - cx) ** 2 + (r - cy) ** 2 > r * r;
      const fx = x / size;
      const fy = y / size;
      const bar = bars.some((b) => fx >= b.x0 && fx < b.x1 && fy >= b.top && fy < 0.8);
      const [R, G, B, A] = outside ? [0, 0, 0, 0] : bar ? [255, 255, 255, 255] : [15, 92, 77, 255];
      raw[i] = R;
      raw[i + 1] = G;
      raw[i + 2] = B;
      raw[i + 3] = A;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [16, 32, 64, 80, 128]) {
  writeFileSync(new URL(`icon-${size}.png`, OUT), png(size));
}
console.log("Icons written to apps/excel-addin/public/assets/");
