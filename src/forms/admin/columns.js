// ============================================================
// ADMINISTRATION DES RÉPONSES — colonnes (tableau et exports)
// ============================================================
import { adminQuestions, displayValue, numericValue, statusesOf, SOURCE_LABEL, scoreOf, groupOfType } from './analytics.js';
import { formatMoneyFr } from '../engine/index.js';

const PAYMENT_LABEL = { none: 'Aucun', pending: 'En attente', paid: 'Payé', failed: 'Échec', refunded: 'Remboursé', manual: 'Réglé hors ligne' };

export const formatDateTimeFr = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/** Nom lisible du répondant (identité). */
export function respondentLabel(row, questions, memberName) {
  const r = row.respondent || {};
  if (r.name) return r.name;
  const nameQ = questions.find(q => q.type === 'name');
  const v = nameQ ? row.answers?.[nameQ.key] : null;
  if (v && typeof v === 'object' && (v.firstName || v.lastName)) return [v.firstName, v.lastName].filter(Boolean).join(' ');
  if (r.memberId && memberName) { const m = memberName(r.memberId); if (m) return m; }
  if (r.email) return r.email;
  const emailQ = questions.find(q => q.type === 'email');
  return (emailQ && typeof row.answers?.[emailQ.key] === 'string' && row.answers[emailQ.key]) || '';
}

/** E-mail du répondant (métadonnées ou question e-mail). */
export function respondentEmail(row, questions) {
  if (row.respondent?.email) return row.respondent.email;
  const emailQ = questions.find(q => q.type === 'email');
  const v = emailQ ? row.answers?.[emailQ.key] : '';
  return typeof v === 'string' ? v : '';
}

/**
 * Colonnes disponibles : métadonnées puis une colonne par question.
 * → [{ id, label, kind, sensitive, identity, get(row) → texte, value(row) → valeur triable/exportable, width }]
 */
export function buildColumns(def, { labelFor, memberName } = {}) {
  const questions = adminQuestions(def);
  const statuses = statusesOf(def);
  const statusLabel = id => statuses.find(s => s.id === id)?.label || id;
  const isQuiz = def.kind === 'quiz' || questions.some(q => q.item?.score);
  const meta = [
    { id: '__submittedAt', label: 'Reçue le', kind: 'meta', width: 140, get: r => formatDateTimeFr(r.submittedAt), value: r => r.submittedAt || '', date: true },
    { id: '__status', label: 'Statut', kind: 'meta', width: 120, get: r => statusLabel(r.status), value: r => statusLabel(r.status) },
    { id: '__respondent', label: 'Répondant', kind: 'meta', width: 180, identity: true, sensitive: false, get: r => respondentLabel(r, questions, memberName), value: r => respondentLabel(r, questions, memberName) },
    { id: '__tags', label: 'Étiquettes', kind: 'meta', width: 140, get: r => (r.tags || []).join(', '), value: r => (r.tags || []).join(', ') },
    { id: '__assignee', label: 'Assigné à', kind: 'meta', width: 140, get: r => (r.assignee ? (memberName?.(r.assignee) || r.assignee) : ''), value: r => (r.assignee ? (memberName?.(r.assignee) || r.assignee) : '') },
  ];
  if (isQuiz) meta.push({ id: '__score', label: 'Score', kind: 'meta', width: 80, numeric: true, get: r => { const s = scoreOf(def, r); return s === null ? '' : String(s).replace('.', ','); }, value: r => scoreOf(def, r) });
  if (questions.some(q => q.type === 'payment')) meta.push({ id: '__payment', label: 'Paiement', kind: 'meta', width: 120, get: r => [PAYMENT_LABEL[r.paymentStatus] || '', r.paymentAmount !== null && r.paymentAmount !== undefined ? formatMoneyFr(r.paymentAmount) : ''].filter(Boolean).join(' · '), value: r => r.paymentStatus || '' });
  meta.push({ id: '__waitlisted', label: 'Liste d\'attente', kind: 'meta', width: 90, get: r => (r.waitlisted ? 'Oui' : ''), value: r => (r.waitlisted ? 1 : 0) });
  meta.push({ id: '__source', label: 'Origine', kind: 'meta', width: 110, get: r => SOURCE_LABEL[r.source] || r.source || '', value: r => r.source || '' });
  meta.push({ id: '__id', label: 'Identifiant', kind: 'meta', width: 120, get: r => r.id, value: r => r.id });

  const qcols = questions.map(q => {
    const g = q.group || groupOfType(q.type);
    const numeric = ['scale', 'nps', 'number'].includes(g);
    return {
      id: q.key, label: q.label, kind: 'question', question: q, sensitive: q.sensitive, identity: q.identity,
      width: g === 'text' ? 240 : 160, numeric,
      get: r => displayValue(r, q, labelFor),
      value: r => (numeric ? numericValue(r, q) : displayValue(r, q, labelFor)),
    };
  });
  return [...meta, ...qcols];
}

/** Colonnes visibles par défaut : reçue le, statut, répondant + 5 premières questions. */
export function defaultVisible(columns) {
  const q = columns.filter(c => c.kind === 'question' && !c.sensitive && c.question?.type !== 'hidden').slice(0, 5).map(c => c.id);
  const meta = ['__submittedAt', '__status', '__respondent', ...(columns.some(c => c.id === '__score') ? ['__score'] : []), '__tags'];
  return [...meta, ...q];
}
