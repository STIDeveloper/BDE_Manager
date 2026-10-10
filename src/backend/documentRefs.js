// ============================================================
// NUMÉROTATION DES DOCUMENTS (locale ou serveur)
// ============================================================
// En mode collaboratif, plusieurs personnes émettent des documents : les
// numéros doivent venir du serveur (RPC reserve_document_refs, atomique),
// sinon deux appareils produiraient le même « BDE-2026-0007 ».
//
// À brancher par le responsable (voir rapport) :
//   import { reserveDocumentRefsAuto } from '../backend/documentRefs.js';
//   refs = await reserveDocumentRefsAuto(docs.length);
// dans src/documents/issue.js et src/components/documents/Generator.jsx.
// Sans espace connecté, c'est exactement l'ancien comportement local.
// ============================================================

import { useStore } from '../store.js';

let remoteReserver = null;

/** Branché par le moteur de synchronisation quand un espace est connecté. */
export function setRemoteRefReserver(fn) { remoteReserver = fn; }
export const isRemoteNumbering = () => !!remoteReserver;

/** Préfixe identique à celui du store (sigle de l'association). */
export function refPrefix(organization) {
  return (organization?.shortName || 'BDE').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12) || 'BDE';
}

export const formatRef = (prefix, year, n) => `${prefix}-${year}-${String(n).padStart(4, '0')}`;

/**
 * Réserve des numéros AUPRÈS DU SERVEUR (espace connecté obligatoire).
 * Le compteur local est aligné pour ne jamais réutiliser un numéro hors ligne.
 * @returns {Promise<string[]>}
 */
export async function reserveRefsRemote(count = 1, year = new Date().getFullYear()) {
  if (!remoteReserver) throw new Error('Aucun espace collaboratif connecté.');
  const n = Math.max(1, Math.min(500, Math.floor(count)));
  const numbers = await remoteReserver(n, year);
  if (!Array.isArray(numbers) || numbers.length !== n) throw new Error('Réponse du serveur invalide pour la numérotation.');
  const prefix = refPrefix(useStore.getState().organization);
  const max = Math.max(...numbers);
  useStore.setState((s) => ({
    documentCounters: { ...s.documentCounters, [year]: Math.max(s.documentCounters?.[year] || 0, max) },
  }));
  return numbers.map(num => formatRef(prefix, year, num));
}

/**
 * Numérotation « automatique » : serveur si un espace est connecté (erreur
 * explicite si le serveur est injoignable — on n'émet pas de numéro qui
 * pourrait être en double), sinon compteur local.
 * @returns {Promise<string[]>}
 */
export async function reserveDocumentRefsAuto(count = 1, year = new Date().getFullYear()) {
  if (remoteReserver) {
    try {
      return await reserveRefsRemote(count, year);
    } catch (err) {
      throw new Error(`Numérotation impossible : ${err?.message || 'serveur injoignable'}. Réessaie une fois la connexion rétablie.`, { cause: err });
    }
  }
  return useStore.getState().reserveDocumentRefs(count, year);
}
