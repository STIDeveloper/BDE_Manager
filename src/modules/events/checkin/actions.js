// ============================================================
// QR DE PRÉSENCE — écritures (store des événements)
// ============================================================
// Le statut « présent » passe par l'action existante updateParticipant
// (capacité, liste d'attente, contrat respectés). Le champ optionnel
// `ev.checkin` (jetons + heures de pointage, voir logic.js) n'a pas
// d'action dédiée dans le store : il est écrit ici avec la même sémantique
// que l'utilitaire upsert des stores de module (nouvel objet + updatedAt),
// ce qui le rend persistant, synchronisé entre onglets et envoyé au serveur
// par la synchronisation (y compris plus tard, après un pointage hors ligne).

import { useEventsStore } from '../store.js';
import { missingTokens, newCheckinToken, ticketEligible } from './logic.js';

function writeCheckin(eventId, fn) {
  const ev = useEventsStore.getState().events[eventId];
  if (!ev) return null;
  const cur = { tokens: { ...(ev.checkin?.tokens || {}) }, at: { ...(ev.checkin?.at || {}) } };
  const next = fn(cur);
  if (!next) return null;
  useEventsStore.setState(s => {
    const e = s.events[eventId];
    if (!e) return {};
    return { events: { ...s.events, [eventId]: { ...e, checkin: next, updatedAt: new Date().toISOString() } } };
  });
  return next;
}

/** Crée les jetons manquants (participants éligibles). → nombre créé */
export function ensureTokens(eventId) {
  const ev = useEventsStore.getState().events[eventId];
  const add = missingTokens(ev);
  const n = Object.keys(add).length;
  if (n) writeCheckin(eventId, c => ({ ...c, tokens: { ...c.tokens, ...add } }));
  return n;
}

/** Nouveau jeton pour un participant : l'ancien billet devient invalide. → jeton */
export function regenerateToken(eventId, participantId) {
  const token = newCheckinToken();
  writeCheckin(eventId, c => ({ ...c, tokens: { ...c.tokens, [participantId]: token } }));
  return token;
}

/**
 * Marque présent (scan ou saisie manuelle).
 * @returns {{ ok: boolean, error?: string, at?: string }}
 */
export function markPresent(eventId, participantId) {
  const store = useEventsStore.getState();
  const ev = store.events[eventId];
  const p = ev?.participants?.find(x => x.id === participantId);
  if (!p) return { ok: false, error: 'Participant introuvable.' };
  if (!ticketEligible(p)) return { ok: false, error: p.status === 'waitlist' ? 'Sur liste d’attente : pas de place attribuée.' : 'Inscription annulée.' };
  if (p.status === 'present') return { ok: false, error: 'Déjà pointé·e.', at: ev.checkin?.at?.[participantId] };
  const res = store.updateParticipant(eventId, participantId, { status: 'present' });
  if (!res.ok) return { ok: false, error: res.error };
  const at = new Date().toISOString();
  writeCheckin(eventId, c => ({ ...c, at: { ...c.at, [participantId]: at } }));
  return { ok: true, at };
}

/** Annule un pointage fait par erreur (retour au statut « inscrit »). */
export function undoPresent(eventId, participantId) {
  const store = useEventsStore.getState();
  const res = store.updateParticipant(eventId, participantId, { status: 'registered' });
  if (!res.ok) return res;
  writeCheckin(eventId, c => {
    const at = { ...c.at };
    delete at[participantId];
    return { ...c, at };
  });
  return { ok: true };
}
