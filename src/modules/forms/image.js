// ============================================================
// STUDIO FORMULAIRES — images du thème et des options
// ============================================================
// L'original est rangé dans les pièces jointes de l'appareil
// (saveAttachment) ; une copie compressée (data URL ≤ 300 Ko) est stockée
// dans la définition pour être affichée sur la page PUBLIQUE (le répondant
// n'a pas accès aux fichiers de l'appareil).

import { saveAttachment } from '../../core/attachments.js';

export const MAX_PUBLIC_IMAGE_BYTES = 300 * 1024;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible ou corrompue.')); };
    img.src = url;
  });
}

const dataUrlBytes = d => Math.ceil((d.length - d.indexOf(',') - 1) * 3 / 4);

/**
 * Compresse une image en data URL de `maxBytes` au plus (WebP, sinon JPEG).
 * @returns {Promise<{ dataUrl: string, width: number, height: number, bytes: number }>}
 */
export async function compressToDataUrl(file, { maxBytes = MAX_PUBLIC_IMAGE_BYTES, maxSide = 1600 } = {}) {
  if (!file) throw new Error('Aucun fichier sélectionné.');
  if (!ACCEPTED.includes(file.type)) throw new Error('Format non pris en charge : PNG, JPEG, WebP ou GIF.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Image trop volumineuse (15 Mo maximum).');
  const img = await loadImage(file);
  const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
  if (!w0 || !h0) throw new Error('Image vide.');
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d');
  const webp = (() => { try { return document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp'); } catch { return false; } })();
  const type = webp ? 'image/webp' : 'image/jpeg';
  for (let side = maxSide; side >= 200; side = Math.round(side * 0.75)) {
    const scale = Math.min(1, side / Math.max(w0, h0));
    canvas.width = Math.max(1, Math.round(w0 * scale));
    canvas.height = Math.max(1, Math.round(h0 * scale));
    g.clearRect(0, 0, canvas.width, canvas.height);
    if (type === 'image/jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height); }
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.86, 0.75, 0.62, 0.5]) {
      const dataUrl = canvas.toDataURL(type, quality);
      const bytes = dataUrlBytes(dataUrl);
      if (bytes <= maxBytes) return { dataUrl, width: canvas.width, height: canvas.height, bytes };
    }
  }
  throw new Error('Impossible de compresser l\'image sous 300 Ko : choisis une image plus simple.');
}

/**
 * Image publique : original en pièce jointe + copie compressée.
 * → AttachmentRef enrichie { id, name, type, size, createdAt, dataUrl, width, height }
 */
export async function importPublicImage(file, scope = 'forms') {
  const compressed = await compressToDataUrl(file);
  let ref = { id: null, name: file.name, type: file.type, size: file.size };
  try {
    ref = await saveAttachment(file, { scope });
  } catch {
    // Stockage local indisponible : la copie compressée suffit à l'affichage.
  }
  return { ...ref, dataUrl: compressed.dataUrl, width: compressed.width, height: compressed.height };
}

export const formatKb = bytes => `${Math.round((bytes || 0) / 1024)} Ko`;
export const imageBytes = ref => (ref?.dataUrl ? dataUrlBytes(ref.dataUrl) : 0);
