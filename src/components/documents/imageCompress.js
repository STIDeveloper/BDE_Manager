// ============================================================
// STUDIO DOCUMENTS — COMPRESSION D'IMAGES (navigateur)
// ============================================================
// Logo, tampon et signatures importées : redimensionnés (600 px max) et
// compressés côté client jusqu'à passer sous la limite du store. PNG si
// l'image a de la transparence, sinon JPEG (bien plus léger).

import { MAX_DATAURL_LENGTH, compressionPlan, fitWithin, hasTransparency, whiteToAlpha } from './imageMath.js';

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible ou corrompue.')); };
    img.src = url;
  });
}

function drawToCanvas(img, width, height, { removeWhite = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, width, height);
  if (removeWhite) {
    const data = g.getImageData(0, 0, width, height);
    whiteToAlpha(data.data);
    g.putImageData(data, 0, 0);
  }
  return canvas;
}

/**
 * Compresse un fichier image en data URL (≤ MAX_DATAURL_LENGTH).
 * @param {File} file
 * @param {{ maxSide?: number, removeWhite?: boolean }} [options]
 *   removeWhite : rend le fond blanc transparent (signature scannée).
 * @returns {Promise<{ dataUrl: string, width: number, height: number, transparent: boolean }>}
 */
export async function compressImageFile(file, { maxSide = 600, removeWhite = false } = {}) {
  if (!file) throw new Error('Aucun fichier sélectionné.');
  if (!ACCEPTED.includes(file.type)) throw new Error('Format non pris en charge : choisis une image PNG, JPEG ou WebP.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Fichier trop volumineux (15 Mo maximum).');
  const img = await loadImage(file);
  const natural = { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
  if (!natural.width || !natural.height) throw new Error('Image vide.');

  // Transparence détectée sur une version réduite (rapide).
  const probeSize = fitWithin(natural.width, natural.height, 200);
  const probe = drawToCanvas(img, probeSize.width, probeSize.height, { removeWhite });
  const transparent = removeWhite
    || (file.type !== 'image/jpeg' && hasTransparency(probe.getContext('2d').getImageData(0, 0, probeSize.width, probeSize.height).data));

  for (const step of compressionPlan(maxSide, transparent)) {
    const size = fitWithin(natural.width, natural.height, step.max);
    const canvas = drawToCanvas(img, size.width, size.height, { removeWhite });
    let dataUrl;
    if (transparent) {
      dataUrl = canvas.toDataURL('image/png');
    } else {
      // Fond blanc : un JPEG n'a pas de transparence (évite un fond noir).
      const flat = document.createElement('canvas');
      flat.width = size.width; flat.height = size.height;
      const g = flat.getContext('2d');
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, size.width, size.height);
      g.drawImage(canvas, 0, 0);
      dataUrl = flat.toDataURL('image/jpeg', step.quality);
    }
    if (dataUrl.length <= MAX_DATAURL_LENGTH) return { dataUrl, ...size, transparent };
  }
  throw new Error('Impossible de compresser cette image sous 400 Ko : essaie une image plus simple.');
}

/** Télécharge un texte (CSV…) sous forme de fichier. */
export function downloadText(text, fileName, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
