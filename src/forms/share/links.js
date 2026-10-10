// ============================================================
// PARTAGE — liens courts et code d'intégration (module PUR)
// ============================================================
// Lien court lisible : https://<domaine>/f/<slug> (un CHEMIN, pas un hash :
// plus court à dicter, propre sur une affiche). Côté serveur, Vercel sert
// index.html pour /f/* ; au chargement, main.jsx convertit /f/<slug> en
// #/f/<slug> (voir le rapport d'intégration). Le lien « hash » reste
// accepté partout (#/f/<slug>).
// Intégration : <iframe> vers /f/<slug>?embed=1 + petit script qui ajuste
// la hauteur (message postMessage { type: 'bde-form:height', height }).
// ============================================================

export const SLUG_RX = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;
export const HEIGHT_MESSAGE = 'bde-form:height';

/** Origine publique de l'application (sans barre finale). */
export function appOrigin(base) {
  if (base) return String(base).replace(/\/+$/, '');
  return typeof window !== 'undefined' ? window.location.origin : '';
}

/** Lien court : https://<domaine>/f/<slug> */
export function shortLink(slug, base) {
  return `${appOrigin(base)}/f/${encodeURIComponent(String(slug || ''))}`;
}

/** Lien « hash » (fonctionne sans réécriture serveur) : https://<domaine>/#/f/<slug> */
export function hashLink(slug, base) {
  return `${appOrigin(base)}/#/f/${encodeURIComponent(String(slug || ''))}`;
}

/** Lien affiché sans protocole (affiche, oral) : « bde.exemple.fr/f/wei-2027 ». */
export const displayLink = (link) => String(link || '').replace(/^https?:\/\//, '');

/**
 * Convertit un chemin /f/<slug>[?query] en hash #/f/<slug>[?query].
 * → nouvelle URL relative, ou null si le chemin n'est pas un lien court.
 * (Même logique que le code fourni pour main.jsx, testable ici.)
 */
export function shortPathToHash(pathname, search = '', hash = '') {
  const m = /^\/f\/([A-Za-z0-9-]{1,60})\/?$/.exec(String(pathname || ''));
  if (!m || /^#\/./.test(hash)) return null;
  return `/#/f/${m[1].toLowerCase()}${search || ''}`;
}

const escAttr = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * Code d'intégration : iframe + script de redimensionnement automatique.
 * Le script n'accepte que les messages venant de l'origine de l'application
 * et de l'iframe concernée ; hauteur bornée (200 → 20 000 px).
 */
export function embedSnippet({ slug, title = 'Formulaire', base, initialHeight = 720 }) {
  const origin = appOrigin(base);
  const src = `${shortLink(slug, origin)}?embed=1`;
  return [
    `<iframe src="${escAttr(src)}" title="${escAttr(title)}" data-bde-form="${escAttr(slug)}" width="100%" height="${Number(initialHeight) || 720}" style="border:0;width:100%;max-width:760px;display:block;margin:0 auto" loading="lazy" allow="clipboard-write; payment"></iframe>`,
    '<script>',
    '(function () {',
    `  var ORIGIN = ${JSON.stringify(origin)};`,
    '  window.addEventListener("message", function (e) {',
    `    if (e.origin !== ORIGIN || !e.data || e.data.type !== ${JSON.stringify(HEIGHT_MESSAGE)}) return;`,
    '    var frames = document.querySelectorAll("iframe[data-bde-form]");',
    '    for (var i = 0; i < frames.length; i++) {',
    '      if (frames[i].contentWindow === e.source) {',
    '        var h = Math.max(200, Math.min(20000, Math.ceil(Number(e.data.height) || 0)));',
    '        frames[i].style.height = h + "px";',
    '      }',
    '    }',
    '  });',
    '})();',
    '</script>',
  ].join('\n');
}

/** Normalise une origine saisie (« exemple.fr » → « https://exemple.fr »). → null si invalide */
export function normalizeOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (u.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(u.hostname)) return null;
    return u.origin;
  } catch { return null; }
}

/**
 * Le site parent est-il autorisé à intégrer ce formulaire ?
 * @param {{ allowed?: boolean, origins?: string[] }|undefined} embed settings.embed
 * @param {string|null} parentOrigin origine du site parent (null si inconnue)
 * @param {string} selfOrigin origine de l'application
 * @returns {{ allowed: boolean, reason?: 'disabled'|'unknown_parent'|'origin_not_allowed' }}
 */
export function embedDecision(embed, parentOrigin, selfOrigin) {
  if (parentOrigin && parentOrigin === selfOrigin) return { allowed: true }; // aperçu dans l'application
  if (!embed?.allowed) return { allowed: false, reason: 'disabled' };
  const list = (Array.isArray(embed.origins) ? embed.origins : []).map(normalizeOrigin).filter(Boolean);
  if (!list.length) return { allowed: true };
  if (!parentOrigin) return { allowed: false, reason: 'unknown_parent' };
  return list.includes(parentOrigin) ? { allowed: true } : { allowed: false, reason: 'origin_not_allowed' };
}
