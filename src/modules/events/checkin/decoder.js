// ============================================================
// QR DE PRÉSENCE — décodage (BarcodeDetector natif, sinon jsQR)
// ============================================================
// BarcodeDetector (Chrome Android, Safari récents) décode directement une
// vidéo ou une image. Ailleurs (Firefox, ordinateurs), la bibliothèque
// légère `jsqr` (chargée à la demande) lit les pixels d'un canvas.

let jsqrPromise = null;
const loadJsQr = () => {
  if (!jsqrPromise) jsqrPromise = import('jsqr').then(m => m.default || m);
  return jsqrPromise;
};

async function nativeDetector() {
  try {
    if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return null;
    const formats = await window.BarcodeDetector.getSupportedFormats?.();
    if (Array.isArray(formats) && !formats.includes('qr_code')) return null;
    return new window.BarcodeDetector({ formats: ['qr_code'] });
  } catch { return null; }
}

/** Dimensions d'une source (vidéo, image, bitmap, canvas). */
function sizeOf(src) {
  return {
    w: src.videoWidth || src.naturalWidth || src.width || 0,
    h: src.videoHeight || src.naturalHeight || src.height || 0,
  };
}

/**
 * Crée un décodeur.
 * @param {{ preferNative?: boolean }} [opts]
 * @returns {Promise<{ kind: 'native'|'jsqr', detect: (source) => Promise<string|null> }>}
 */
export async function createDecoder({ preferNative = true } = {}) {
  const native = preferNative ? await nativeDetector() : null;
  if (native) {
    return {
      kind: 'native',
      detect: async (source) => {
        try {
          const codes = await native.detect(source);
          return codes?.[0]?.rawValue || null;
        } catch { return null; }
      },
    };
  }
  const jsQR = await loadJsQr();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return {
    kind: 'jsqr',
    detect: async (source) => {
      const { w, h } = sizeOf(source);
      if (!w || !h) return null;
      // Réduction : décodage plus rapide, largement suffisant pour un QR à l'écran.
      const scale = Math.min(1, 800 / Math.max(w, h));
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
      return code?.data || null;
    },
  };
}

/** Décode un fichier image (photo d'un billet) → texte | null */
export async function decodeImageFile(file, decoder) {
  const d = decoder || await createDecoder();
  const bitmap = typeof createImageBitmap === 'function'
    ? await createImageBitmap(file)
    : await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image illisible.'));
      img.src = URL.createObjectURL(file);
    });
  try { return await d.detect(bitmap); } finally { bitmap.close?.(); }
}
