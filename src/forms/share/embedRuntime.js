// ============================================================
// PARTAGE — côté page intégrée : détection et hauteur (sans composant)
// ============================================================
// Les en-têtes HTTP étant statiques (Vercel), /f/* autorise l'intégration
// par tout site HTTPS (frame-ancestors 'self' https:) ; le contrôle fin des
// sites autorisés (settings.embed.origins) est fait ICI, côté client :
// origine du parent lue dans location.ancestorOrigins (Chrome, Safari) ou
// document.referrer (Firefox). La hauteur du contenu est envoyée au parent
// (postMessage) pour que le script du code d'intégration ajuste l'iframe.

import { useMemo } from 'react';
import { HEIGHT_MESSAGE, embedDecision } from './links.js';

/** La page est-elle affichée dans un cadre ? */
export function isEmbedded() {
  try { return window.self !== window.top; } catch { return true; }
}

/** Origine du site parent (null si inconnue ou pas intégré). */
export function parentOrigin() {
  if (!isEmbedded()) return null;
  try {
    const anc = window.location.ancestorOrigins;
    if (anc && anc.length) return anc[0] === 'null' ? null : anc[0];
  } catch { /* non pris en charge */ }
  try { return document.referrer ? new URL(document.referrer).origin : null; } catch { return null; }
}

/** Décision pour la page courante : { embedded, parent, allowed, reason? } */
export function checkEmbed(embedSettings) {
  const embedded = isEmbedded();
  if (!embedded) return { embedded: false, parent: null, allowed: true };
  const parent = parentOrigin();
  return { embedded, parent, ...embedDecision(embedSettings, parent, window.location.origin) };
}

export function useEmbedCheck(embedSettings) {
  return useMemo(() => checkEmbed(embedSettings), [embedSettings]);
}

/** Hauteur réelle du contenu (sans le min-height: 100vh de la coque). */
function contentHeight() {
  const main = document.querySelector('.fr-root > main');
  if (main) return Math.ceil(main.getBoundingClientRect().height);
  return Math.ceil(document.body.scrollHeight);
}

/**
 * Envoie la hauteur du contenu au parent tant que la page est intégrée.
 * ResizeObserver + MutationObserver, et un relevé périodique de secours.
 * @returns {() => void} arrêt
 */
export function startHeightReporter({ slug = '', target = null } = {}) {
  if (!isEmbedded()) return () => {};
  const to = target || parentOrigin() || '*';
  let last = 0;
  const send = () => {
    const h = contentHeight();
    if (!h || Math.abs(h - last) < 2) return;
    last = h;
    try { window.parent.postMessage({ type: HEIGHT_MESSAGE, slug, height: h }, to); } catch { /* parent inaccessible */ }
  };
  send();
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(send) : null;
  ro?.observe(document.body);
  const mo = typeof MutationObserver === 'function' ? new MutationObserver(send) : null;
  mo?.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
  window.addEventListener('resize', send);
  window.addEventListener('load', send);
  const timer = setInterval(send, 1000);
  return () => { ro?.disconnect(); mo?.disconnect(); window.removeEventListener('resize', send); window.removeEventListener('load', send); clearInterval(timer); };
}
