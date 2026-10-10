import { resolveCatalog } from './config.js';
import { isSeniorRole, poleLabelIn, listPoles } from '../core/catalog.js';

// ============================================================
// Générateur d'alertes
// ============================================================

/**
 * @param {object} params
 * @param {import('./types.js').Candidate[]} params.candidates
 * @param {import('./types.js').Assignment[]} params.assignments
 * @param {Map<string, number>} [params.poleTargets]
 * @param {object} [params.poleSizes]
 * @param {number} [params.minScore]
 * @param {object} [params.catalog]  défaut : catalogue actif
 * @returns {import('./types.js').Alert[]}
 *
 * Les `refs` de pôle sont des IDS de pôle ; titres et messages affichent
 * les LIBELLÉS du catalogue. Les lignes « non placé »
 * ({candidateId, slotId:null, roleId:null}) et les rôles absents du
 * catalogue sont tolérés.
 */
export function detectAlerts({ candidates, assignments, poleTargets, poleSizes, minScore = 55, catalog }) {
  const cat = resolveCatalog(catalog);
  const alerts = [];
  const roleOf = (roleId) => cat.roles?.[roleId] || null;
  const poleName = (poleId) => poleLabelIn(cat, poleId);
  const candidateById = new Map(candidates.map(c => [c.id, c]));

  const byCandidate = new Map();
  assignments.forEach(a => { if (a.candidateId) byCandidate.set(a.candidateId, a); });

  // ---------- 1. Pôles sous-dotés / sur-dotés ----------
  if (poleTargets && poleSizes) {
    for (const [pole, target] of poleTargets) {
      const actual = poleSizes[pole] || 0;
      if (actual < target - 1) {
        alerts.push({
          severity: 'warning',
          code: 'pole_underpopulated',
          title: `Pôle "${poleName(pole)}" sous-doté`,
          message: `${actual} membre${actual > 1 ? 's' : ''} pour ${target} attendus. Envisager un renfort 🔥 couteau suisse.`,
          refs: [pole],
        });
      } else if (actual > target + 2) {
        alerts.push({
          severity: 'info',
          code: 'pole_overpopulated',
          title: `Pôle "${poleName(pole)}" sur-doté`,
          message: `${actual} membres pour ${target} attendus. Le pôle peut absorber des missions transverses.`,
          refs: [pole],
        });
      }
    }
  }

  // ---------- 2. Postes vacants ----------
  const vacantByRole = {};
  assignments.forEach(a => {
    if (a.vacant && a.roleId) {
      vacantByRole[a.roleId] = (vacantByRole[a.roleId] || 0) + 1;
    }
  });
  Object.entries(vacantByRole).forEach(([roleId, count]) => {
    const role = roleOf(roleId);
    if (!role) return;
    alerts.push({
      severity: isSeniorRole(cat, role) ? 'danger' : 'warning',
      code: 'vacant_role',
      title: `Poste vacant : ${role.label}`,
      message: `${count} place${count > 1 ? 's' : ''} non pourvue${count > 1 ? 's' : ''}. Aucun candidat n'a atteint le seuil de ${minScore} points.`,
      refs: [roleId],
    });
  });

  // ---------- 3. Candidats non placés sur leurs choix ----------
  const unplaced = [];
  candidates.forEach(c => {
    const a = byCandidate.get(c.id);
    if (!a || !a.roleId) {
      unplaced.push(c);
      return;
    }
    const rank = a.score?.rank;
    if (rank !== 1 && rank !== 2 && rank !== 3) {
      unplaced.push(c);
    }
  });
  if (unplaced.length > 0) {
    alerts.push({
      severity: unplaced.length >= 5 ? 'warning' : 'info',
      code: 'candidates_unplaced',
      title: `${unplaced.length} candidat${unplaced.length > 1 ? 's' : ''} hors de leurs 3 choix`,
      message: `Ces candidats ont été placés en mode "renfort". Envisager un poste sur-mesure ou un rôle transverse.`,
      refs: unplaced.map(c => c.id),
    });
  }

  // ---------- 4. Contradictions internes ----------
  const contradictory = candidates.filter(c => (c.contradictions?.length || 0) > 0);
  contradictory.forEach(c => {
    alerts.push({
      severity: 'info',
      code: 'contradiction',
      title: `Contradiction détectée : ${c.firstName} ${c.lastName}`,
      message: c.contradictions.join(' · '),
      refs: [c.id],
    });
  });

  // ---------- 5. Surcharge de poste clé ----------
  assignments.forEach(a => {
    if (!a.candidateId || !a.roleId) return;
    const c = candidateById.get(a.candidateId);
    const role = roleOf(a.roleId);
    if (!c || !role) return;

    if (
      isSeniorRole(cat, role) &&
      (c.availability <= 0.4 || c.alternance)
    ) {
      alerts.push({
        severity: 'warning',
        code: 'overload_risk',
        title: `Risque de surcharge sur ${role.label}`,
        message: `${c.firstName} ${c.lastName} (${c.availabilityLabel}${c.alternance ? ', alternance' : ''}) occupe un poste à responsabilité. Prévoir un adjoint.`,
        refs: [c.id, role.id],
      });
    }
  });

  // ---------- 6. Point de défaillance unique ----------
  // Un pôle dont TOUS les membres sont 🎯/⚠️ (dispo faible)
  const byPole = {};
  assignments.forEach(a => {
    if (!a.candidateId || !a.roleId) return;
    const c = candidateById.get(a.candidateId);
    const role = roleOf(a.roleId);
    if (!c || !role) return;
    if (!byPole[role.pole]) byPole[role.pole] = { total: 0, lowAvail: 0 };
    byPole[role.pole].total++;
    if (c.availability <= 0.4) byPole[role.pole].lowAvail++;
  });
  Object.entries(byPole).forEach(([pole, s]) => {
    if (s.total > 0 && s.lowAvail === s.total && s.total >= 2) {
      alerts.push({
        severity: 'danger',
        code: 'pole_weak',
        title: `Pôle "${poleName(pole)}" fragile`,
        message: `Tous les membres ont une disponibilité faible (🎯/⚠️). Risque de blocage en cas d'imprévu.`,
        refs: [pole],
      });
    }
  });

  // ---------- 7. Déséquilibre formation ↔ pôle ----------
  // (Signal léger : un pôle à forte affinité InfoCOM — affinité 1.0 dans le
  // catalogue, ex. Communication / Com. Interne — sans aucun profil InfoCOM)
  const poleFormation = {};
  assignments.forEach(a => {
    if (!a.candidateId || !a.roleId) return;
    const c = candidateById.get(a.candidateId);
    const role = roleOf(a.roleId);
    if (!c || !role) return;
    if (!poleFormation[role.pole]) poleFormation[role.pole] = new Set();
    poleFormation[role.pole].add(c.formation);
  });
  const infocomPoles = listPoles(cat).filter(p => (p.affinity?.InfoCOM ?? 0) >= 1).map(p => p.id);
  infocomPoles.forEach(pole => {
    const formations = poleFormation[pole];
    if (formations && !formations.has('InfoCOM') && formations.size > 0) {
      alerts.push({
        severity: 'info',
        code: 'formation_mismatch',
        title: `Aucun profil InfoCOM sur "${poleName(pole)}"`,
        message: `Ce pôle mériterait au moins un profil InfoCOM pour la cohérence pédagogique.`,
        refs: [pole],
      });
    }
  });

  // ---------- 8. Présidence : plusieurs candidats (arbitrage) ----------
  // ('president' : id historique ; si le rôle a été supprimé, l'alerte disparaît)
  const presidentCandidates = roleOf('president') ? candidates.filter(c => c.choices?.[0] === 'president') : [];
  if (presidentCandidates.length > 1) {
    alerts.push({
      severity: 'info',
      code: 'president_contest',
      title: `Présidence : ${presidentCandidates.length} candidats au 1er choix`,
      message: `Arbitrage humain requis. Candidats : ${presidentCandidates.map(c => `${c.firstName} ${c.lastName}`).join(', ')}.`,
      refs: presidentCandidates.map(c => c.id),
    });
  }

  // ---------- 9. Continuité : trop peu de BUT 3 / Master ----------
  const seniors = candidates.filter(c => c.year === 'BUT 3' || c.year === 'Master');
  if (seniors.length < candidates.length * 0.2 && candidates.length >= 10) {
    alerts.push({
      severity: 'warning',
      code: 'succession_risk',
      title: `Risque de succession`,
      message: `Seulement ${seniors.length} profil${seniors.length > 1 ? 's' : ''} BUT 3 / Master sur ${candidates.length} candidats. Prévoir des adjoints juniors dès cette année.`,
      refs: [],
    });
  }

  return alerts;
}

/**
 * Groupe les alertes par sévérité.
 */
export function groupAlerts(alerts) {
  return {
    danger: alerts.filter(a => a.severity === 'danger'),
    warning: alerts.filter(a => a.severity === 'warning'),
    info: alerts.filter(a => a.severity === 'info'),
  };
}

/**
 * Score global de qualité du scénario (0-100) — utile pour comparer.
 * 100 − (8 par alerte « danger », 3 par « warning », 1 par « info »), borné à 0.
 * Ne dépend QUE des alertes : la taille de la promo est déjà prise en compte
 * en amont (ex. sévérité de `candidates_unplaced`, seuil de `succession_risk`).
 * L'ancien 2e paramètre `totalCandidates` (jamais utilisé) a été retiré ;
 * un appel avec 2 arguments reste valide (argument ignoré).
 * @param {import('./types.js').Alert[]} alerts
 */
export function computeHealthScore(alerts) {
  let penalty = 0;
  alerts.forEach(a => {
    if (a.severity === 'danger') penalty += 8;
    else if (a.severity === 'warning') penalty += 3;
    else penalty += 1;
  });
  return Math.max(0, 100 - penalty);
}