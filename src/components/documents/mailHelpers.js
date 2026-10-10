// ============================================================
// STUDIO DOCUMENTS — ENVOI PAR EMAIL (mailto:, helpers purs)
// ============================================================
// Aucun serveur d'envoi : on ouvre la messagerie de l'utilisateur avec un
// message prérempli. La pièce jointe (PDF téléchargé) est à ajouter à la
// main — le message le rappelle explicitement.
// ============================================================

import { formatDateLong } from '../../documents/context.js';
import { verificationUrl } from '../../documents/verification.js';

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
export const isEmail = (v) => EMAIL_RE.test(String(v || '').trim());

/**
 * Message d'envoi d'un document émis.
 * @param {object} entry   entrée du registre { ref, title, fingerprint, createdAt, memberIds }
 * @param {object[]} recipients membres destinataires
 * @param {object} org     profil de l'association
 * @returns {{ to: string[], missing: object[], subject: string, body: string }}
 */
export function buildDocumentMail(entry, recipients, org = {}) {
  const list = (recipients || []).filter(Boolean);
  const to = [...new Set(list.map(m => String(m.email || '').trim()).filter(isEmail))];
  const missing = list.filter(m => !isEmail(m.email));
  const orgName = String(org.shortName || org.name || 'Le bureau').trim();
  const greeting = list.length === 1 && list[0].firstName ? `Bonjour ${String(list[0].firstName).trim()},` : 'Bonjour,';
  const title = String(entry?.title || 'Document').trim();
  const subject = `${title} — réf. ${entry?.ref || ''}`.trim();
  const lines = [
    greeting,
    '',
    `Tu trouveras ci-joint le document « ${title} », émis le ${formatDateLong(entry?.createdAt) || 'ce jour'} par ${orgName}.`,
    '',
    `Référence : ${entry?.ref || '—'}`,
  ];
  if (entry?.fingerprint) lines.push(`Empreinte : ${entry.fingerprint}`);
  if (entry?.ref && entry?.fingerprint) lines.push(`Vérification : ${verificationUrl(entry.ref, entry.fingerprint)}`);
  lines.push('', '[Pièce jointe : le PDF du document — à joindre à ce message avant l\'envoi.]', '', 'Bonne journée,', orgName);
  return { to, missing, subject, body: lines.join('\n') };
}

/** Lien mailto: (destinataires séparés par des virgules, objet et corps encodés). */
export function mailtoHref({ to = [], subject = '', body = '' }) {
  const params = [];
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
  if (body) params.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${to.map(a => encodeURI(a)).join(',')}${params.length ? `?${params.join('&')}` : ''}`;
}

/** Texte complet à copier (destinataires + objet + corps). */
export function mailPlainText({ to = [], subject = '', body = '' }) {
  return [to.length ? `À : ${to.join(', ')}` : null, `Objet : ${subject}`, '', body].filter(v => v !== null).join('\n');
}
