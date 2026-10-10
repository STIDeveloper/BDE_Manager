// ============================================================
// ADHÉSIONS — calculs purs (campagne, relances, rapprochement HelloAsso)
// ============================================================
import { formatMoney } from '../../documents/context.js';
import { normalizeText } from '../finance/csv.js';

/** Lignes de campagne : un membre réel × sa cotisation de l'année (virtuelle « à payer » si absente). */
export function campaignRows(members, memberships, year, defaultAmount) {
  const byMember = new Map();
  Object.values(memberships || {}).forEach(m => { if (m.year === year) byMember.set(m.memberId, m); });
  return members.map(member => {
    const ms = byMember.get(member.id);
    return {
      member,
      membership: ms || null,
      status: ms?.status || 'due',
      amount: ms ? ms.amount : defaultAmount,
      lastReminder: ms?.reminders?.length ? ms.reminders[ms.reminders.length - 1].at : '',
      reminderCount: ms?.reminders?.length || 0,
    };
  });
}

/** Progression : payés / attendus (exonérés exclus), montant encaissé. */
export function progress(rows) {
  const expected = rows.filter(r => r.status !== 'exempt');
  const paid = rows.filter(r => r.status === 'paid');
  return {
    paid: paid.length,
    expected: expected.length,
    exempt: rows.filter(r => r.status === 'exempt').length,
    due: rows.filter(r => r.status === 'due').length,
    collected: Math.round(paid.reduce((a, r) => a + (Number(r.amount) || 0), 0) * 100) / 100,
    ratio: expected.length ? paid.length / expected.length : 0,
  };
}

/** Remplace {prenom}, {nom}, {montant}, {annee}. */
export function fillTemplate(text, { prenom = '', nom = '', montant = '', annee = '' } = {}) {
  return String(text || '')
    .replace(/\{prenom\}/g, prenom)
    .replace(/\{nom\}/g, nom)
    .replace(/\{montant\}/g, montant)
    .replace(/\{annee\}/g, annee);
}

/** Lien mailto (destinataires en Cci). */
export function buildMailto({ to = [], bcc = [], subject = '', body = '' }) {
  const params = [];
  if (bcc.length) params.push(`bcc=${encodeURIComponent(bcc.join(','))}`);
  params.push(`subject=${encodeURIComponent(subject)}`);
  params.push(`body=${encodeURIComponent(body.replace(/\r?\n/g, '\r\n'))}`);
  return `mailto:${to.map(encodeURIComponent).join(',')}?${params.join('&')}`;
}

/** Message d'un membre (variables personnalisées). */
export function personalMessage(template, member, amount, year) {
  const vars = { prenom: member.firstName || '', nom: member.lastName || '', montant: formatMoney(amount), annee: year };
  return { subject: fillTemplate(template.subject, vars), body: fillTemplate(template.body, vars) };
}

/**
 * Message groupé (Cci) : {prenom}/{nom} ne peuvent pas être personnalisés →
 * remplacés par une formule neutre ; le montant est celui de la cotisation normale.
 */
export function groupMessage(template, amount, year) {
  const vars = { prenom: 'à toutes et à tous', nom: '', montant: formatMoney(amount), annee: year };
  return {
    subject: fillTemplate(template.subject, vars),
    body: fillTemplate(template.body, vars),
  };
}

const nameKey = (first, last) => normalizeText(`${first} ${last}`).replace(/\s+/g, ' ');

/**
 * Rapproche une ligne HelloAsso d'un membre : email (insensible à la casse),
 * puis prénom + nom (accents/casse ignorés, ordre indifférent).
 * @returns {{ member, by: 'email'|'nom' }|null}
 */
export function matchMember(row, members) {
  const email = normalizeText(row.email).replace(/\s/g, '');
  if (email) {
    const m = members.find(x => normalizeText(x.email).replace(/\s/g, '') === email);
    if (m) return { member: m, by: 'email' };
  }
  if (row.firstName || row.lastName) {
    const k1 = nameKey(row.firstName, row.lastName);
    const k2 = nameKey(row.lastName, row.firstName);
    const m = members.find(x => {
      const k = nameKey(x.firstName, x.lastName);
      return k && (k === k1 || k === k2);
    });
    if (m) return { member: m, by: 'nom' };
  }
  return null;
}

/** Ouvre le client mail (lien mailto) sans quitter l'application. */
export function openMailto(url) {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
}
