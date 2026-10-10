// ============================================================
// PONT ENTRE LE MOTEUR DE RÔLES ET LE STORE PRINCIPAL
// ============================================================

import { getRoleById, getPole } from './catalog.js';

// Correspondance historique pôle → colonne Kanban (pôles par défaut).
// Pour les pôles personnalisés, la colonne se règle dans « Gestion des
// rôles » (champ `columnId` du pôle), sinon elle est déduite du libellé.

const POLE_TO_COLUMN = {
  bureau: 'direction',
  communication: 'com',
  communication_interne: 'com',
  projets: 'projet',
  event: 'event',
  sport: 'event',
  esport: 'event',
  partenariats: 'part',
  transversal: 'transverse',
};

const POLE_TO_COLUMN_TITLE = {
  bureau: 'Direction',
  communication: 'Pôle Communication',
  communication_interne: 'Pôle Communication',
  projets: 'Pôle Projets',
  event: 'Pôle Event',
  sport: 'Pôle Event',
  esport: 'Pôle Event',
  partenariats: 'Pôle Partenariat',
  transversal: 'Membres transversaux',
};

function normalizeForMatch(str) {
  return String(str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

function findMatchingMember(candidate, members) {
  if (!candidate || !Array.isArray(members)) return null;
  const candidateEmail = normalizeForMatch(candidate.email);
  const candidateFull = normalizeForMatch(`${candidate.firstName}${candidate.lastName || ''}`);

  if (candidateEmail) {
    const byEmail = members.find(m => normalizeForMatch(m.email) === candidateEmail);
    if (byEmail) return byEmail;
  }
  if (candidateFull) {
    const byFull = members.find(m => normalizeForMatch(`${m.firstName}${m.lastName || ''}`) === candidateFull);
    if (byFull) return byFull;
    // Repli sur le prénom seul UNIQUEMENT s'il est sans ambiguïté
    // (deux « Clarisse » ne doivent jamais être confondues).
    const cf = normalizeForMatch(candidate.firstName);
    if (cf.length > 3) {
      const sameFirst = members.filter(m => normalizeForMatch(m.firstName) === cf);
      if (sameFirst.length === 1) return sameFirst[0];
    }
  }
  return null;
}

export function poleColumnTitle(poleId) {
  return POLE_TO_COLUMN_TITLE[poleId] || getPole(poleId)?.label || poleId;
}

export function resolveColumnId(role, columns) {
  if (!role) return null;
  const configured = getPole(role.pole)?.columnId;
  if (configured && columns.some(c => c.id === configured)) return configured;
  const directId = POLE_TO_COLUMN[role.pole];
  if (directId && columns.some(c => c.id === directId)) return directId;
  // Correspondance par libellé : « Pôle Projets » ↔ colonne « 📋 Pôle Projets ».
  // (L'ancienne version tronquait au premier mot APRÈS suppression des
  // espaces, ce qui ne trouvait jamais rien.)
  const candidates = [POLE_TO_COLUMN_TITLE[role.pole], getPole(role.pole)?.label].filter(Boolean);
  for (const title of candidates) {
    const norm = normalizeForMatch(title.replace(/^p[oô]le\s+/i, ''));
    if (!norm) continue;
    const byTitle = columns.find(c => normalizeForMatch(c.title).includes(norm));
    if (byTitle) return byTitle.id;
  }
  const transverse = columns.find(c => c.id === 'transverse' || /transver/i.test(c.title));
  return transverse?.id || columns[0]?.id || null;
}

export function buildApplyDiff({ candidates, scenario, members, columns }) {
  const updates = [];
  const creations = [];
  const unassigned = [];
  const missingColumns = new Set();

  if (!scenario?.assignments) {
    return { updates, creations, unassigned, missingColumns: [], stats: { updates: 0, creations: 0, unassigned: 0, unchanged: 0 } };
  }

  const assignedByCandidate = new Map();
  scenario.assignments.forEach(a => {
    if (a.candidateId && a.roleId) assignedByCandidate.set(a.candidateId, a);
  });

  candidates.forEach(candidate => {
    const existing = findMatchingMember(candidate, members);
    const assignment = assignedByCandidate.get(candidate.id);
    const role = assignment ? getRoleById(assignment.roleId) : null;
    const targetColumnId = role ? resolveColumnId(role, columns) : null;

    if (role && !targetColumnId) {
      missingColumns.add(poleColumnTitle(role.pole));
    }

    if (!assignment) {
      if (existing) {
        unassigned.push({ memberId: existing.id, candidateId: candidate.id, currentRole: existing.mainRole || null });
      }
      return;
    }

    const newRole = assignment.roleId;
    const newRoleLabel = role?.label || newRole;
    const newColumnId = targetColumnId;
    const newColumnTitle = columns.find(c => c.id === newColumnId)?.title || (role ? poleColumnTitle(role.pole) : '—');

    if (existing) {
      const oldRole = existing.mainRole || null;
      const oldColumn = existing.columnId;
      if (oldRole !== newRole || oldColumn !== newColumnId) {
        updates.push({ memberId: existing.id, candidateId: candidate.id, oldRole, newRole, newRoleLabel, newColumnId, newColumnTitle });
      }
    } else {
      creations.push({ candidate, newRole, newRoleLabel, newColumnId, newColumnTitle });
    }
  });

  const unchanged = candidates.length - updates.length - creations.length - unassigned.length;
  return {
    updates, creations, unassigned,
    missingColumns: Array.from(missingColumns),
    stats: {
      updates: updates.length,
      creations: creations.length,
      unassigned: unassigned.length,
      unchanged: Math.max(0, unchanged),
    },
  };
}

export function applyDiffToStore(store, diff, options = {}) {
  const { createMissingColumns = true } = options;
  const state = store.getState();
  const { members, columns, addMember, updateMember, addColumn } = state;

  let applied = 0, created = 0, skipped = 0;
  const createdColumns = [];
  // Toute l'application = une seule entrée d'historique (annulable d'un coup).
  state.beginBatch?.();
  try {

    const columnByTitle = new Map(columns.map(c => [c.title, c]));
    const ensureColumn = (title) => {
      if (!title) return null;
      if (columnByTitle.has(title)) return columnByTitle.get(title).id;
      if (!createMissingColumns) return null;
      addColumn(title);
      const newState = store.getState();
      const newCol = newState.columns.find(c => c.title === title);
      if (newCol) {
        columnByTitle.set(title, newCol);
        createdColumns.push(title);
        return newCol.id;
      }
      return null;
    };

    diff.updates.forEach(update => {
      try {
        let targetColumnId = update.newColumnId;
        if (!targetColumnId || !columns.some(c => c.id === targetColumnId)) {
          const fallbackTitle = update.newColumnTitle !== '—' ? update.newColumnTitle : null;
          if (fallbackTitle) targetColumnId = ensureColumn(fallbackTitle);
        }
        updateMember(update.memberId, { mainRole: update.newRole, columnId: targetColumnId || update.newColumnId });
        applied++;
      } catch (err) { console.warn('Échec update', update.memberId, err); skipped++; }
    });

    diff.creations.forEach(creation => {
      try {
        const { candidate, newRole, newColumnId, newColumnTitle } = creation;
        let targetColumnId = newColumnId;
        if (!targetColumnId || !columns.some(c => c.id === targetColumnId)) {
          const fallbackTitle = newColumnTitle !== '—' ? newColumnTitle : null;
          if (fallbackTitle) targetColumnId = ensureColumn(fallbackTitle);
        }
        addMember({
          firstName: candidate.firstName,
          lastName: candidate.lastName || '',
          email: candidate.email || '',
          mainRole: newRole,
          badges: candidate.badges || [],
          columnId: targetColumnId,
          notes: candidate.notes || '',
        });
        created++;
      } catch (err) { console.warn('Échec création', creation.candidate.id, err); skipped++; }
    });

    diff.unassigned.forEach(u => {
      try {
        const transverseCol = columns.find(c => c.id === 'transverse' || /transver/i.test(c.title));
        const member = members.find(m => m.id === u.memberId);
        if (transverseCol && member && member.columnId !== transverseCol.id) {
          updateMember(u.memberId, { columnId: transverseCol.id });
          applied++;
        }
      } catch (err) { console.warn('Échec déplacement', u.memberId, err); skipped++; }
    });
  } finally {
    state.endBatch?.();
  }

  return { applied, created, skipped, createdColumns };
}

export { POLE_TO_COLUMN, POLE_TO_COLUMN_TITLE };