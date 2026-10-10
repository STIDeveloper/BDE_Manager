// ============================================================
// STUDIO DOCUMENTS — CALCULS D'IMAGES (purs, testés sous Node)
// ============================================================
// Utilisés par imageCompress.js (logo, tampon, signatures importées) et
// SignaturePad.jsx (export recadré). Aucune API navigateur ici.

/** Taille max d'une image enregistrée (data URL), sous la limite du store (400 Ko). */
export const MAX_DATAURL_LENGTH = 380 * 1024;

/** Dimensions ramenées dans un carré `max` × `max` (jamais agrandies). */
export function fitWithin(width, height, max) {
  const w = Math.max(1, Math.round(Number(width) || 1));
  const h = Math.max(1, Math.round(Number(height) || 1));
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** Poids approximatif (octets) des données d'une data URL base64. */
export function dataUrlBytes(dataUrl) {
  const s = String(dataUrl || '');
  const comma = s.indexOf(',');
  const b64 = comma === -1 ? s : s.slice(comma + 1);
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - pad);
}

/** « 182 Ko », « 1,2 Mo ». */
export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

/**
 * Plan des tentatives de compression : on essaie d'abord la taille max
 * (qualité élevée), puis on baisse la qualité (JPEG) et enfin la taille.
 * @returns {{ max:number, quality:number }[]}
 */
export function compressionPlan(maxSide = 600, transparent = false) {
  const sizes = [maxSide, Math.round(maxSide * 0.8), Math.round(maxSide * 0.64), Math.round(maxSide * 0.5), Math.round(maxSide * 0.36)];
  if (transparent) return sizes.map(max => ({ max, quality: 1 }));
  const plan = [];
  sizes.forEach((max, i) => {
    plan.push({ max, quality: 0.85 });
    if (i < 2) plan.push({ max, quality: 0.7 });
  });
  return plan;
}

/** true si au moins un pixel n'est pas totalement opaque (RGBA). */
export function hasTransparency(data) {
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true;
  return false;
}

/**
 * Rend transparents les pixels quasi blancs (signature scannée sur papier).
 * Transition douce entre `low` et `high` pour éviter les bords crénelés.
 * Modifie `data` (RGBA) en place et le renvoie.
 */
export function whiteToAlpha(data, low = 200, high = 245) {
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum >= high) data[i + 3] = 0;
    else if (lum > low) data[i + 3] = Math.round(data[i + 3] * (1 - (lum - low) / (high - low)));
  }
  return data;
}

/**
 * Boîte englobante de traits ([{ points:[{x,y}], width }]) + marge.
 * @returns {{ x, y, width, height }|null} null si aucun point.
 */
export function strokesBounds(strokes, pad = 0) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  (strokes || []).forEach(s => {
    const half = (s?.width || 0) / 2;
    (s?.points || []).forEach(p => {
      minX = Math.min(minX, p.x - half); minY = Math.min(minY, p.y - half);
      maxX = Math.max(maxX, p.x + half); maxY = Math.max(maxY, p.y + half);
    });
  });
  if (!Number.isFinite(minX)) return null;
  const x = Math.floor(minX - pad);
  const y = Math.floor(minY - pad);
  return { x, y, width: Math.ceil(maxX + pad) - x, height: Math.ceil(maxY + pad) - y };
}

/**
 * Segments d'un trait lissé : courbes quadratiques passant par les milieux
 * successifs (le point mesuré sert de point de contrôle).
 * @returns {{ type:'dot', x, y } | { type:'path', start:{x,y}, curves:{cx,cy,x,y}[] }}
 */
export function smoothPath(points) {
  const pts = points || [];
  if (pts.length === 0) return { type: 'path', start: { x: 0, y: 0 }, curves: [] };
  if (pts.length === 1) return { type: 'dot', x: pts[0].x, y: pts[0].y };
  if (pts.length === 2) {
    return { type: 'path', start: pts[0], curves: [{ cx: pts[0].x, cy: pts[0].y, x: pts[1].x, y: pts[1].y }] };
  }
  const curves = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const mid = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 };
    curves.push({ cx: pts[i].x, cy: pts[i].y, x: mid.x, y: mid.y });
  }
  const last = pts.at(-1);
  curves.push({ cx: last.x, cy: last.y, x: last.x, y: last.y });
  return { type: 'path', start: pts[0], curves };
}
