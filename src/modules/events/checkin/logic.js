// ============================================================
// QR DE PRÉSENCE — logique pure (sans React ni store)
// ============================================================
// Données ajoutées à un événement (champ OPTIONNEL, rétrocompatible) :
//   ev.checkin = {
//     tokens: { [participantId]: string },  // jeton aléatoire 128 bits (hex),
//                                           // non devinable, propre au billet
//     at:     { [participantId]: ISO },     // heure du pointage (scan ou saisie)
//   }
// Pourquoi au niveau de l'événement et pas dans chaque participant :
// l'action updateParticipant du store nettoie les participants champ par
// champ (cleanParticipant) et supprimerait un champ inconnu à chaque
// changement de statut. `ev.checkin` est au contraire conservé par toutes
// les actions existantes (elles recopient l'événement : {...ev, …}).
// Les participants ne sont jamais modifiés autrement que par les actions
// du store (statut « present » via updateParticipant).
//
// Contenu du QR : le lien du billet  <app>/#/billet?t=<jeton>
// (ouvrable sur le téléphone du participant pour réafficher son QR) ;
// le scanner accepte aussi le jeton seul.
// ============================================================

export const TOKEN_RX = /^[a-f0-9]{32}$/;

/** Jeton aléatoire non devinable (128 bits, crypto.getRandomValues). */
export function newCheckinToken() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Participants qui ont droit à un billet (inscrits, présents, absents). */
export const ticketEligible = (p) => ['registered', 'present', 'absent'].includes(p?.status);

/** Lien du billet (contenu du QR). */
export function ticketLink(token, base) {
  const root = base ?? (typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '');
  return `${root}#/billet?t=${token}`;
}

/** Extrait un jeton d'un texte scanné (lien du billet, ou jeton seul). → jeton | null */
export function extractToken(text) {
  const raw = String(text || '').trim();
  if (TOKEN_RX.test(raw.toLowerCase())) return raw.toLowerCase();
  const m = raw.match(/[?&#]t=([a-fA-F0-9]{32})(?:[&#]|$)/);
  return m ? m[1].toLowerCase() : null;
}

/** Index jeton → participantId d'un événement. */
export function tokenIndex(ev) {
  const out = new Map();
  Object.entries(ev?.checkin?.tokens || {}).forEach(([pid, tok]) => { if (TOKEN_RX.test(tok)) out.set(tok, pid); });
  return out;
}

/**
 * Jetons à créer pour les participants éligibles qui n'en ont pas.
 * @returns {{ [participantId]: token }} (vide si rien à faire)
 */
export function missingTokens(ev, gen = newCheckinToken) {
  const have = ev?.checkin?.tokens || {};
  const out = {};
  (ev?.participants || []).filter(ticketEligible).forEach((p) => { if (!TOKEN_RX.test(have[p.id] || '')) out[p.id] = gen(); });
  return out;
}

/**
 * Résultat d'un scan, sans rien modifier.
 * @returns {{ kind: 'ok'|'already'|'unknown'|'invalid'|'waitlist'|'cancelled'|'removed', participant?, at? }}
 *   ok        : à marquer présent
 *   already   : déjà pointé (at = heure du premier pointage)
 *   unknown   : jeton valide mais absent de cet événement (autre événement, billet régénéré)
 *   invalid   : le code ne ressemble pas à un billet
 */
export function evaluateScan(ev, text) {
  const token = extractToken(text);
  if (!token) return { kind: 'invalid' };
  const pid = tokenIndex(ev).get(token);
  if (!pid) return { kind: 'unknown' };
  const participant = (ev.participants || []).find(p => p.id === pid);
  if (!participant) return { kind: 'removed' };
  if (participant.status === 'present') return { kind: 'already', participant, at: ev.checkin?.at?.[pid] || null };
  if (participant.status === 'waitlist') return { kind: 'waitlist', participant };
  if (participant.status === 'cancelled') return { kind: 'cancelled', participant };
  return { kind: 'ok', participant };
}

/** Compteur présents / attendus (inscrits + présents + absents). */
export function checkinCounts(ev) {
  const ps = (ev?.participants || []).filter(ticketEligible);
  const present = ps.filter(p => p.status === 'present').length;
  return { present, expected: ps.length, remaining: ps.length - present };
}

/** Recherche par nom / e-mail (saisie manuelle de secours). */
export function searchParticipants(ev, query, limit = 8) {
  const q = String(query || '').trim().toLocaleLowerCase('fr').normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!q) return [];
  return (ev?.participants || [])
    .filter(p => p.status !== 'cancelled')
    .filter(p => `${p.name} ${p.email || ''}`.toLocaleLowerCase('fr').normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q))
    .slice(0, limit);
}

/** Corps du message mailto d'un billet (aucune donnée sensible). */
export function ticketMail(ev, p, link, when = '') {
  const subject = `Ton billet — ${ev.title}`;
  const body = [
    `Bonjour ${p.name},`,
    '',
    `Voici ton billet personnel pour « ${ev.title} »${when ? ` (${when})` : ''}${ev.location ? `, ${ev.location}` : ''}.`,
    'Ouvre ce lien le jour J et présente le QR code à l’entrée :',
    link,
    '',
    'Ce lien est personnel : ne le partage pas.',
  ].join('\n');
  return `mailto:${encodeURIComponent(p.email || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Date et heure lisibles d'un événement (« samedi 12 octobre 2026 à 20:00 »). */
export function eventWhen(ev) {
  if (!ev?.start) return '';
  const d = new Date(ev.start);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
