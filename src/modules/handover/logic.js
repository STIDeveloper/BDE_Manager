// ============================================================
// PASSATIONS — logique pure (aucun accès aux stores)
// ============================================================

import { daysBetween, toDate, isPlaceholderMember } from '../../documents/context.js';

export const STEPS = [
  { id: 'people', label: 'Sortant & successeur', short: 'Personnes' },
  { id: 'role', label: 'Rôle et mandats', short: 'Rôle' },
  { id: 'drive', label: 'Accès Drive', short: 'Drive' },
  { id: 'vault', label: 'Coffre-fort', short: 'Coffre' },
  { id: 'documents', label: 'Documents', short: 'Documents' },
  { id: 'closing', label: 'Clôture', short: 'Clôture' },
];

export const ANCIEN_BADGE = 'Ancien Membre';
export const PLAN_WINDOW_DAYS = 60;

/** Vérifications manuelles de la clôture. */
export const FINAL_CHECKS = [
  { id: 'meeting', label: 'Réunion de passation tenue (sortant + successeur)' },
  { id: 'files', label: 'Dossiers en cours et fichiers personnels transférés' },
  { id: 'material', label: 'Clés, badges et matériel restitués' },
  { id: 'contacts', label: 'Successeur présenté aux partenaires et contacts clés' },
  { id: 'social', label: 'Comptes externes (réseaux, plateformes) transférés' },
  { id: 'bank', label: 'Banque / signatures mises à jour (si poste concerné)' },
];

export const memberName = (m) => (m ? `${m.firstName || ''} ${m.lastName || ''}`.trim() || 'Sans nom' : 'Membre supprimé');

/** Raison pour laquelle un membre doit préparer une passation (ou null). */
export function leavingReason(m, today = new Date()) {
  if (!m || isPlaceholderMember(m)) return null;
  const ancien = Array.isArray(m.badges) && m.badges.includes(ANCIEN_BADGE);
  if (toDate(m.mandateEnd)) {
    const d = daysBetween(today, m.mandateEnd);
    if (d < 0) return { kind: 'ended', days: d, label: `Mandat terminé depuis ${-d} j` };
    if (d <= PLAN_WINDOW_DAYS) return { kind: 'soon', days: d, label: d === 0 ? 'Fin de mandat aujourd\'hui' : `Fin de mandat dans ${d} j` };
  }
  if (ancien) return { kind: 'ancien', days: null, label: 'Badge « Ancien Membre »' };
  return null;
}

/**
 * Passations à prévoir : membres sur le départ (fin de mandat < 60 jours,
 * dépassée, ou badge « Ancien Membre ») qui ont encore un rôle ou n'ont pas
 * reçu de dossier de passation, et sans passation enregistrée.
 */
export function handoverCandidates(members = [], handovers = {}, documentLog = [], today = new Date()) {
  const tracked = new Set(Object.values(handovers || {}).map(h => h.outgoingId));
  const kitIssued = (id) => documentLog.some(e => e?.templateId === 'kit-passation' && Array.isArray(e.memberIds) && e.memberIds.includes(id));
  return members
    .map(m => ({ member: m, reason: leavingReason(m, today) }))
    .filter(x => x.reason && !tracked.has(x.member.id) && (x.member.mainRole || !kitIssued(x.member.id)))
    .sort((a, b) => (a.reason.days ?? 999) - (b.reason.days ?? 999));
}

const LEVEL_RANK = { none: 0, reader: 1, commenter: 2, editor: 3 };
export const LEVEL_LABEL = { none: '—', reader: 'Lecteur', commenter: 'Commentateur', editor: 'Éditeur' };

/**
 * Comparaison par dossier : sortant / preset du rôle / successeur.
 * @returns {{ rows: object[], diffSuccessorVsPreset: number, outgoingCount: number }}
 */
export function compareDrive(folders = [], outgoingPerms = {}, preset = {}, successorPerms = {}) {
  const rows = folders
    .map(f => ({
      folder: f,
      outgoing: outgoingPerms?.[f.id] || 'none',
      preset: preset?.[f.id] || 'none',
      successor: successorPerms?.[f.id] || 'none',
    }))
    .filter(r => r.outgoing !== 'none' || r.preset !== 'none' || r.successor !== 'none');
  return {
    rows,
    diffSuccessorVsPreset: rows.filter(r => r.preset !== r.successor).length,
    outgoingCount: rows.filter(r => r.outgoing !== 'none').length,
    extraVsPreset: rows.filter(r => LEVEL_RANK[r.outgoing] > LEVEL_RANK[r.preset]).length,
  };
}

const safeComment = (s) => String(s ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ').replace(/\*\//g, '* /');

/**
 * Script Google Apps Script qui RETIRE les accès d'un sortant sur les
 * dossiers indiqués (complément du script de partage du module Drive).
 */
export function buildRemovalScript({ member, perms = {}, folders = [] }) {
  const email = String(member?.email || '').trim();
  const list = folders.filter(f => perms[f.id] && perms[f.id] !== 'none');
  const table = list.map(f => `  ${JSON.stringify(String(f.code))}: ${JSON.stringify(`TODO_ID_${String(f.code).replace(/[^a-zA-Z0-9]/g, '_')}`)},  // ${safeComment(f.name)}`).join('\n');
  return `/**
 * SCRIPT DE RETRAIT DES ACCÈS DRIVE — passation (BDE Manager)
 * Usage interne. Généré le ${new Date().toLocaleString('fr-FR')}
 * Membre sortant : ${safeComment(memberName(member))}
 * 1. Complète FOLDERS_ID avec les vrais identifiants Google Drive.
 * 2. Exécute previewRemoval() puis removeAccess().
 */
const EMAIL = ${JSON.stringify(email)};
const FOLDERS_ID = {
${table}
};

function previewRemoval() {
  Object.entries(FOLDERS_ID).forEach(([code, id]) => {
    Logger.log((id.startsWith('TODO_ID_') ? '⏭️  ID manquant ' : '→ retrait ') + code + ' pour ' + EMAIL);
  });
}

function removeAccess() {
  let done = 0, errors = 0;
  Object.entries(FOLDERS_ID).forEach(([code, id]) => {
    if (id.startsWith('TODO_ID_')) return;
    try {
      const folder = DriveApp.getFolderById(id);
      try { folder.removeEditor(EMAIL); } catch (e) {}
      try { folder.removeViewer(EMAIL); } catch (e) {}
      try { folder.removeCommenter && folder.removeCommenter(EMAIL); } catch (e) {}
      done++;
    } catch (err) { errors++; Logger.log('✗ ' + code + ' : ' + err.message); }
  });
  Logger.log(done + ' dossier(s) traité(s), ' + errors + ' erreur(s)');
}
`;
}

export function downloadText(content, fileName) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export const slug = (s) => String(s || 'membre').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'membre';

/** Progression : étapes faites / total. */
export const progressOf = (h) => STEPS.filter(s => h?.steps?.[s.id]?.done).length;
