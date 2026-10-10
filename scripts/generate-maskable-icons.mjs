#!/usr/bin/env node
/**
 * Génère les icônes « maskable » de la PWA à partir de public/icon-512.png.
 *
 *  - fond plein #4f81f5 sur toute la surface (aucun bord sombre visible une fois masqué) ;
 *  - le logo « B » est recopié (légèrement agrandi) au centre, bien à l'intérieur
 *    de la zone de sécurité de 80 % (cercle de diamètre 0,8 × taille) ;
 *  - sorties : public/icon-maskable-512.png et public/icon-maskable-192.png.
 *
 * Pur Node (zlib), sans dépendance. Usage : node scripts/generate-maskable-icons.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import zlib from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'public', 'icon-512.png');
const BRAND = [0x4f, 0x81, 0xf5];

// ---------- Décodage PNG (8 bits, RGB/RGBA, non entrelacé) ----------
function decodePng(buf) {
  const sig = '89504e470d0a1a0a';
  if (buf.subarray(0, 8).toString('hex') !== sig) throw new Error('Pas un PNG');
  let off = 8;
  let ihdr = null;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      ihdr = {
        width: data.readUInt32BE(0), height: data.readUInt32BE(4),
        depth: data[8], colorType: data[9], interlace: data[12],
      };
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const { width, height, depth, colorType, interlace } = ihdr;
  if (depth !== 8 || interlace !== 0 || ![2, 6].includes(colorType)) {
    throw new Error(`Format PNG non géré (depth=${depth}, colorType=${colorType}, interlace=${interlace})`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v;
      switch (filter) {
        case 0: v = 0; break;
        case 1: v = a; break;
        case 2: v = b; break;
        case 3: v = (a + b) >> 1; break;
        case 4: { // Paeth
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          break;
        }
        default: throw new Error(`Filtre PNG inconnu : ${filter}`);
      }
      line[x] = (line[x] + v) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      out[i] = line[x * bpp];
      out[i + 1] = line[x * bpp + 1];
      out[i + 2] = line[x * bpp + 2];
      out[i + 3] = bpp === 4 ? line[x * bpp + 3] : 255;
    }
    prev = line;
  }
  return { width, height, data: out };
}

// ---------- Encodage PNG (RGB 8 bits, filtre 0) ----------
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng({ width, height, data }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4, d = y * (width * 3 + 1) + 1 + x * 3;
      raw[d] = data[s]; raw[d + 1] = data[s + 1]; raw[d + 2] = data[s + 2];
    }
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- Rééchantillonnage ----------
function bilinear(img, fx, fy) {
  const x0 = Math.max(0, Math.min(img.width - 1, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(img.height - 1, Math.floor(fy)));
  const x1 = Math.min(img.width - 1, x0 + 1), y1 = Math.min(img.height - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  const px = (x, y, k) => img.data[(y * img.width + x) * 4 + k];
  return [0, 1, 2].map((k) =>
    (px(x0, y0, k) * (1 - tx) + px(x1, y0, k) * tx) * (1 - ty) +
    (px(x0, y1, k) * (1 - tx) + px(x1, y1, k) * tx) * ty);
}
// Réduction par moyenne de surface (box filter)
function downscale(img, size) {
  const out = Buffer.alloc(size * size * 4);
  const r = img.width / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0]; let wsum = 0;
      for (let sy = Math.floor(y * r); sy < Math.ceil((y + 1) * r); sy++) {
        const wy = Math.min(sy + 1, (y + 1) * r) - Math.max(sy, y * r);
        for (let sx = Math.floor(x * r); sx < Math.ceil((x + 1) * r); sx++) {
          const wx = Math.min(sx + 1, (x + 1) * r) - Math.max(sx, x * r);
          const w = wx * wy, i = (sy * img.width + sx) * 4;
          acc[0] += img.data[i] * w; acc[1] += img.data[i + 1] * w; acc[2] += img.data[i + 2] * w;
          wsum += w;
        }
      }
      const o = (y * size + x) * 4;
      out[o] = Math.round(acc[0] / wsum); out[o + 1] = Math.round(acc[1] / wsum);
      out[o + 2] = Math.round(acc[2] / wsum); out[o + 3] = 255;
    }
  }
  return { width: size, height: size, data: out };
}

// ---------- Construction de l'icône maskable 512 ----------
const src = decodePng(readFileSync(SRC));
if (src.width !== 512 || src.height !== 512) throw new Error('icon-512.png doit faire 512×512');

// Zone centrale du logo d'origine, entièrement comprise dans le carré bleu (hors coins arrondis)
const CROP = { x: 128, y: 128, size: 256 };
const SCALE = 1.25; // agrandissement léger du « B »
const SIZE = 512;
const dstSize = Math.round(CROP.size * SCALE); // 320 px < 410 px (zone de sécurité)
const dstOrigin = (SIZE - dstSize) / 2;

const out = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const o = (y * SIZE + x) * 4;
    let rgb = BRAND;
    const u = x - dstOrigin, v = y - dstOrigin;
    if (u >= 0 && v >= 0 && u < dstSize && v < dstSize) {
      rgb = bilinear(src, CROP.x + (u + 0.5) / SCALE - 0.5, CROP.y + (v + 0.5) / SCALE - 0.5);
    }
    out[o] = Math.round(rgb[0]); out[o + 1] = Math.round(rgb[1]); out[o + 2] = Math.round(rgb[2]); out[o + 3] = 255;
  }
}
const maskable512 = { width: SIZE, height: SIZE, data: out };

// Contrôle : le bord de la zone recopiée doit être de la couleur de marque (sinon raccord visible)
const edge = bilinear(src, CROP.x, CROP.y);
if (edge.some((c, k) => Math.abs(c - BRAND[k]) > 6)) {
  throw new Error(`Le bord de la zone recadrée n'est pas #4f81f5 (${edge.map(Math.round)})`);
}

writeFileSync(join(ROOT, 'public', 'icon-maskable-512.png'), encodePng(maskable512));
writeFileSync(join(ROOT, 'public', 'icon-maskable-192.png'), encodePng(downscale(maskable512, 192)));
console.log('✔ public/icon-maskable-512.png et public/icon-maskable-192.png générées');
