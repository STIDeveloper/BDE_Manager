// ============================================================
// STATISTIQUES D'UN SCÉNARIO — module PUR (testable sous Node)
// ============================================================
// Rappel du format des lignes d'affectation produites par le solveur :
//  - placé      : { candidateId, slotId, roleId, score }
//  - non placé  : { candidateId, slotId: null, roleId: null, score: null }
//  - vacant     : { candidateId: null, slotId, roleId, vacant: true }
// ⚠️ Filtrer uniquement sur `a.candidateId` compte les non placés comme
// « placés » : toujours utiliser isPlaced / isUnplaced ci-dessous.

import { poleLabelIn } from '../../core/catalog.js';

export const isPlaced = (a) => !!(a && a.candidateId && a.slotId);
export const isUnplaced = (a) => !!(a && a.candidateId && !a.slotId);
export const isVacant = (a) => !!(a && !a.candidateId && a.slotId);

/**
 * Compteurs d'un scénario.
 * @returns {{placed:number, unplaced:number, vacant:number, rank1:number,
 *   rank2:number, rank3:number, discover:number, out:number}}
 */
export function countAssignments(scenario) {
  const out = { placed: 0, unplaced: 0, vacant: 0, rank1: 0, rank2: 0, rank3: 0, discover: 0, out: 0 };
  (scenario?.assignments || []).forEach(a => {
    if (isPlaced(a)) {
      out.placed++;
      const r = a.score?.rank;
      if (r === 1) out.rank1++;
      else if (r === 2) out.rank2++;
      else if (r === 3) out.rank3++;
      else if (r === 'discover') out.discover++;
      else out.out++;
    } else if (isUnplaced(a)) out.unplaced++;
    else if (isVacant(a)) out.vacant++;
  });
  return out;
}

/**
 * Libellé lisible d'une référence d'alerte : les `refs` mélangent des ids
 * de candidats, de rôles et de pôles (jamais affichés bruts).
 * @param {string} ref
 * @param {{ candidatesById?: Map<string, object>, catalog?: object }} ctx
 */
export function refLabel(ref, { candidatesById, catalog } = {}) {
  const c = candidatesById?.get(ref);
  if (c) return `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.displayName || 'Candidat';
  const role = catalog?.roles?.[ref];
  if (role) return role.label;
  if (catalog?.poles?.[ref]) return poleLabelIn(catalog, ref);
  return String(ref);
}
