// ============================================================
// ÉLECTIONS — accès serveur (injectable)
// ============================================================
// Mince couche au-dessus de src/backend/forms.js (RPC du vote anonyme,
// publication, statut). `setVoteApi()` remplace tout ou partie des
// fonctions (banc d'essai, démonstration) sans toucher au client réel.
// Aucune donnée de vote n'est journalisée.

import * as backend from '../../backend/forms.js';

let override = null;

/** Remplace (partiellement) le client serveur ; `null` rétablit le client réel. */
export function setVoteApi(impl) { override = impl || null; }

const fn = (name) => (override && typeof override[name] === 'function' ? override[name] : backend[name]);

export const LOCAL_MODE_MESSAGE = backend.LOCAL_MODE_MESSAGE;

export const publishForm = (def) => fn('publishForm')(def);
export const setFormStatus = (serverId, status) => fn('setFormStatus')(serverId, status);
/** → { electorate, voted } (comptages uniquement, jamais de liste nominative). */
export const voteParticipation = (serverId) => fn('voteParticipation')(serverId);
/** → { visible, reason?, closed, ballots, electorate, participation_percent, quorum_percent, quorum_reached, majority, questions[] } */
export const voteResults = (serverId) => fn('voteResults')(serverId);
/** → booléen : le bulletin associé à ce reçu est-il dans l'urne ? */
export const verifyBallot = (serverId, receipt) => fn('verifyBallot')(serverId, receipt);

/** Message d'erreur lisible (erreurs du client serveur déjà en français). */
export function voteErrorMessage(err) {
  if (!err) return 'Erreur inconnue.';
  if (typeof backend.formsErrorMessage === 'function' && !(err instanceof backend.FormsApiError)) return backend.formsErrorMessage(err);
  return String(err.message || err);
}

/** Mode local (aucun espace connecté) ? */
export const isLocalError = (err) => err?.code === 'local' || err?.code === 'missing';
