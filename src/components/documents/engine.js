// ============================================================
// STUDIO DOCUMENTS — CHARGEMENT DIFFÉRÉ DU MOTEUR DE RENDU
// ============================================================
// Le moteur (aperçu React, PDF, impression, Word) n'est chargé qu'au
// premier besoin ; il charge lui-même jspdf à la demande. Une erreur de
// chargement (hors ligne…) n'est pas mise en cache : on pourra réessayer.

let enginePromise = null;

export function loadEngine() {
  if (!enginePromise) {
    enginePromise = import('../../documents/render/index.js').catch((err) => {
      enginePromise = null;
      throw err;
    });
  }
  return enginePromise;
}
