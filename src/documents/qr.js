// ============================================================
// STUDIO DOCUMENTS — QR CODES (purs, sans DOM)
// ============================================================
// Matrice QR calculée par la bibliothèque `qrcode` (cœur seulement), puis :
//   - tracée en vecteurs dans le PDF (rectangles, net à toute échelle) ;
//   - encodée en PNG 1 bit (dataURL) pour le HTML, l'impression et Word.
// L'encodeur PNG est minimal (blocs « stored » sans compression) : aucune
// dépendance au canvas, fonctionne sous Node comme dans le navigateur.
// ============================================================

import QRCode from 'qrcode';

/**
 * Matrice d'un QR code.
 * @returns {{ size: number, dark: (row:number, col:number) => boolean }}
 */
export function qrMatrix(text, { level = 'M' } = {}) {
  const q = QRCode.create(String(text || ''), { errorCorrectionLevel: level });
  const m = q.modules;
  return { size: m.size, dark: (r, c) => !!m.get(r, c) };
}

/**
 * Rectangles sombres (fusionnés par ligne) d'une matrice : [{ x, y, w }]
 * en unités « module » (hauteur 1). Utilisé par le moteur PDF.
 */
export function qrRuns(matrix) {
  const runs = [];
  for (let r = 0; r < matrix.size; r++) {
    let start = -1;
    for (let c = 0; c <= matrix.size; c++) {
      const on = c < matrix.size && matrix.dark(r, c);
      if (on && start < 0) start = c;
      if (!on && start >= 0) { runs.push({ x: start, y: r, w: c - start }); start = -1; }
    }
  }
  return runs;
}

// ------------------------------------------------------------
// Encodeur PNG minimal (niveaux de gris 1 bit)
// ------------------------------------------------------------

let CRC_TABLE = null;
function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function adler32(bytes) {
  let a = 1; let b = 0;
  for (let i = 0; i < bytes.length; i++) { a = (a + bytes[i]) % 65521; b = (b + a) % 65521; }
  return ((b << 16) | a) >>> 0;
}

const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

function chunk(type, data) {
  const typeBytes = [...type].map(ch => ch.charCodeAt(0));
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);
  return [...u32(data.length), ...body, ...u32(crc32(body))];
}

/** Flux zlib sans compression (blocs « stored » de 65 535 octets max). */
function zlibStored(raw) {
  const out = [0x78, 0x01];
  for (let i = 0; i < raw.length || i === 0; i += 65535) {
    const part = raw.subarray(i, Math.min(raw.length, i + 65535));
    const final = i + 65535 >= raw.length ? 1 : 0;
    out.push(final, part.length & 255, (part.length >>> 8) & 255, ~part.length & 255, (~part.length >>> 8) & 255);
    for (let j = 0; j < part.length; j++) out.push(part[j]);
    if (raw.length === 0) break;
  }
  out.push(...u32(adler32(raw)));
  return new Uint8Array(out);
}

function toBase64(bytes) {
  if (typeof btoa === 'function') {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  return globalThis.Buffer.from(bytes).toString('base64');
}

/**
 * QR code en PNG (dataURL). `scale` pixels par module, `margin` modules de
 * zone blanche (la norme en recommande 4 ; 2 suffisent sur fond blanc).
 */
export function qrPngDataUrl(text, { scale = 4, margin = 2, level = 'M' } = {}) {
  const m = qrMatrix(text, { level });
  const px = (m.size + margin * 2) * scale;
  const rowBytes = Math.ceil(px / 8);
  const raw = new Uint8Array((rowBytes + 1) * px);
  for (let y = 0; y < px; y++) {
    const row = y * (rowBytes + 1);
    raw[row] = 0; // filtre « None »
    for (let x = 0; x < px; x++) {
      const r = Math.floor(y / scale) - margin;
      const c = Math.floor(x / scale) - margin;
      const dark = r >= 0 && c >= 0 && r < m.size && c < m.size && m.dark(r, c);
      // 1 bit : 1 = blanc, 0 = noir.
      if (!dark) raw[row + 1 + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  const ihdr = new Uint8Array([...u32(px), ...u32(px), 1, 0, 0, 0, 0]);
  const png = new Uint8Array([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    ...chunk('IHDR', ihdr),
    ...chunk('IDAT', zlibStored(raw)),
    ...chunk('IEND', new Uint8Array(0)),
  ]);
  return `data:image/png;base64,${toBase64(png)}`;
}
