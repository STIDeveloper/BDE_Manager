// Résolution d'une image du formulaire (logo, couverture, fond, choix en
// images, bloc image). Formes acceptées :
//   - chaîne : URL https:// ou data:image/… ;
//   - { url } / { src } / { dataUrl } ;
//   - AttachmentRef { id, … } : fichier de l'appareil (aperçu dans l'éditeur,
//     IndexedDB « bde-attachments ») — lu à la demande.
// Les URL blob: créées sont révoquées au démontage.

import { useEffect, useState } from 'react';

const attachMods = import.meta.glob('../../core/attachments.js');
const DATA_IMG_RX = /^data:image\/(png|jpe?g|gif|webp|svg\+xml|avif);base64,[A-Za-z0-9+/=\s]+$/i;

export function directSrc(ref) {
  const s = typeof ref === 'string' ? ref : ref && typeof ref === 'object' ? (ref.url || ref.src || ref.dataUrl || null) : null;
  if (typeof s !== 'string') return null;
  const t = s.trim();
  if (DATA_IMG_RX.test(t) && !/^data:image\/svg/i.test(t)) return t;
  if (/^https:\/\//i.test(t) || /^\/(?!\/)/.test(t) || /^blob:/i.test(t)) return t;
  return null;
}

export function useMediaSrc(ref) {
  const direct = directSrc(ref);
  const id = !direct && ref && typeof ref === 'object' && typeof ref.id === 'string' ? ref.id : null;
  const [loaded, setLoaded] = useState({ id: null, url: null });
  useEffect(() => {
    if (!id) return undefined;
    let alive = true;
    let url = null;
    const loader = Object.values(attachMods)[0];
    if (!loader) return undefined;
    loader()
      .then(m => m.getAttachmentBlob(id))
      .then(blob => {
        if (!alive || !blob || !String(blob.type || '').startsWith('image/')) return;
        url = URL.createObjectURL(blob);
        setLoaded({ id, url });
      })
      .catch(() => {});
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [id]);
  if (direct) return direct;
  return loaded.id === id ? loaded.url : null;
}
