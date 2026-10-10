import { DEFAULT_WEIGHTS, resolveCatalog } from './config.js';
import { isSeniorRole, poleLabelIn } from '../core/catalog.js';

const RANK_LABELS = {
  1: '🥇 1er choix',
  2: '🥈 2e choix',
  3: '🥉 3e choix',
  discover: '✨ Rôle à découvrir',
  null: '⚠️ Hors des 3 choix (renfort)',
};

const CRITERIA_LABELS = {
  P: 'Préférence déclarée',
  D: 'Disponibilité vs exigence',
  E: 'Expérience / continuité',
  A: 'Cohérence ambition',
  M: 'Motivation (texte)',
  F: 'Affinité formation',
};

/**
 * Explication lisible d'une affectation.
 * @param {import('./types.js').Assignment} assignment
 * @param {import('./types.js').Candidate} candidate
 * @param {object} [opts]  { weights, stability, stabilityScore, catalog }
 */
export function explainAssignment(assignment, candidate, opts = {}) {
  const cat = resolveCatalog(opts.catalog);
  // Ligne « non placé » ({candidateId, slotId:null, roleId:null, score:null})
  if (!assignment?.roleId) {
    return {
      headline: `${candidate?.firstName ?? '?'} — non assigné`,
      rankLabel: '—',
      summary: 'Aucun poste compatible trouvé avec un score suffisant.',
      criteria: [], signals: [], penalties: [], caveats: [],
    };
  }
  // Rôle supprimé du catalogue depuis le calcul : on l'affiche quand même
  const role = cat.roles?.[assignment.roleId]
    || { id: assignment.roleId, label: `${assignment.roleId} (rôle supprimé)`, level: null, pole: null };
  const senior = isSeniorRole(cat, role);

  const sb = assignment.score;
  const rankLabel = RANK_LABELS[sb?.rank ?? 'null'] || 'Hors choix';
  const headline = `${candidate.firstName} ${candidate.lastName} → ${role.label}`;
  const rankSummary = describeRank(sb?.rank);
  const score = (sb?.total ?? 0).toFixed(1);
  const summary = `${rankSummary} Score final : ${score}/100.`;

  const criteria = [];
  if (sb) {
    const weights = opts.weights || DEFAULT_WEIGHTS;
    ['P', 'D', 'E', 'A', 'M', 'F'].forEach(key => {
      const v = sb[key] ?? 0;
      criteria.push({ key, label: CRITERIA_LABELS[key], value: v, contribution: 100 * weights[key] * v });
    });
    criteria.sort((a, b) => b.contribution - a.contribution);
  }

  const signals = (candidate.signals || []).slice(0, 5).map(s => ({ type: s.type, quote: s.quote }));
  const penalties = sb?.penaltyReasons || [];

  const caveats = [];
  if (opts.stability === 'critical') {
    caveats.push(`⚠️ Affectation instable : ce choix varie dans ${Math.round((1 - (opts.stabilityScore ?? 0)) * 100)} % des simulations.`);
  } else if (opts.stability === 'unstable') {
    caveats.push(`⚠️ Stabilité modérée (${Math.round((opts.stabilityScore ?? 0) * 100)} %).`);
  }
  if ((candidate.contradictions?.length || 0) > 0) {
    candidate.contradictions.forEach(c => caveats.push(`Contradiction : ${c}`));
  }
  if (candidate.alternance && senior) {
    caveats.push('Alternance + poste exigeant → prévoir un binôme.');
  }
  if (candidate.availability <= 0.4 && senior) {
    caveats.push('Disponibilité faible annoncée → surcharge probable.');
  }

  return { headline, rankLabel, summary, criteria, signals, penalties, caveats };
}

function describeRank(rank) {
  if (rank === 1) return 'Obtient son 1er choix.';
  if (rank === 2) return 'Obtient son 2e choix.';
  if (rank === 3) return 'Obtient son 3e choix.';
  if (rank === 'discover') return 'Rôle mentionné dans "à découvrir".';
  return 'Poste non demandé, affecté en renfort.';
}

/**
 * Explication d'un poste resté vacant.
 * @param {object} [opts]  { catalog }
 */
export function explainVacant(roleId, slotIndex, candidates, assignedCandidateIds = new Set(), opts = {}) {
  const cat = resolveCatalog(opts.catalog);
  const role = cat.roles?.[roleId];
  if (!role) return null;
  const levelLabel = cat.levels?.[role.level]?.label || role.level;

  const unassigned = candidates.filter(c => !assignedCandidateIds.has(c.id));
  const unassignedNames = unassigned.slice(0, 5).map(c => `${c.firstName} ${c.lastName}`).join(', ');
  const more = unassigned.length > 5 ? ` (+${unassigned.length - 5} autres)` : '';

  return {
    headline: `${role.label} #${slotIndex} — POSTE VACANT`,
    rankLabel: '—',
    summary: 'Aucun candidat n\'a atteint le seuil d\'éligibilité pour ce poste.',
    criteria: [], signals: [], penalties: [],
    caveats: [
      `Poste de niveau "${levelLabel}" dans le pôle "${poleLabelIn(cat, role.pole)}".`,
      unassigned.length > 0
        ? `${unassigned.length} candidat${unassigned.length > 1 ? 's' : ''} non assigné${unassigned.length > 1 ? 's' : ''} : ${unassignedNames}${more}`
        : 'Tous les candidats sont assignés.',
    ],
  };
}

/**
 * Rapport texte d'un scénario (pôles affichés par libellé).
 * Les candidats non placés (slotId null) sont listés à part, sans score.
 * @param {object} [opts]  { catalog }
 */
export function generateScenarioReport(scenario, candidates, opts = {}) {
  const cat = resolveCatalog(opts.catalog);
  const byId = new Map(candidates.map(c => [c.id, c]));
  const nameOf = (cid) => {
    const c = byId.get(cid);
    return c ? `${c.firstName} ${c.lastName}`.trim() : cid;
  };
  const fmt = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(1) : '—');
  const lines = [];
  lines.push(`📊 RAPPORT DU SCÉNARIO : ${scenario.name}`);
  lines.push(`ℹ️  ${scenario.description || ''}`);
  lines.push('');
  lines.push(`👥 Candidats : ${candidates.length}`);
  lines.push(`📈 Score global : ${fmt(scenario.globalScore)}`);
  lines.push(`🎯 Satisfaction moyenne : ${fmt(scenario.avgSatisfaction)}/100`);
  lines.push(`🔻 Satisfaction minimale : ${fmt(scenario.worstSatisfaction)}/100`);
  lines.push('');
  lines.push(`📁 TAILLES DES PÔLES :`);
  Object.entries(scenario.poleSizes || {}).forEach(([pole, size]) => {
    const target = scenario.poleTargets?.[pole] ?? '-';
    const diff = typeof target === 'number' ? size - target : 0;
    const diffStr = diff === 0 ? '✓' : diff > 0 ? `+${diff}` : `${diff}`;
    lines.push(`  • ${poleLabelIn(cat, pole).padEnd(28)} ${size} (cible ${target}, ${diffStr})`);
  });
  lines.push('');
  const placed = (scenario.assignments || []).filter(a => a.candidateId && a.slotId);
  const unplaced = (scenario.assignments || []).filter(a => a.candidateId && !a.slotId);
  lines.push(`🎯 AFFECTATIONS (${placed.length}) :`);
  placed
    .sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0))
    .forEach(a => {
      const roleLabel = cat.roles?.[a.roleId]?.label || a.roleId;
      const rank = a.score?.rank;
      const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '⚠️';
      lines.push(`  ${rankEmoji} ${nameOf(a.candidateId)} → ${roleLabel} (${fmt(a.score?.total)})`);
    });
  if (unplaced.length > 0) {
    lines.push('');
    lines.push(`🚫 NON PLACÉS (${unplaced.length}) :`);
    unplaced.forEach(a => lines.push(`  • ${nameOf(a.candidateId)}`));
  }
  lines.push('');
  if ((scenario.alerts || []).length > 0) {
    lines.push(`⚠️  ALERTES (${scenario.alerts.length}) :`);
    scenario.alerts.forEach(alert => {
      const prefix = alert.severity === 'danger' ? '🔴' : alert.severity === 'warning' ? '🟡' : '🔵';
      lines.push(`  ${prefix} ${alert.title}`);
      lines.push(`      ${alert.message}`);
    });
  }
  return lines.join('\n');
}

export function generateMemberCard(assignment, candidate, opts = {}) {
  const explanation = explainAssignment(assignment, candidate, opts);
  const lines = [];
  lines.push(`👤 ${explanation.headline}`);
  lines.push(`   ${explanation.rankLabel}`);
  lines.push('');
  lines.push(`📋 ${explanation.summary}`);
  lines.push('');
  if (explanation.criteria.length > 0) {
    lines.push('📊 Décomposition du score :');
    explanation.criteria.forEach(c => {
      const bar = '█'.repeat(Math.round(c.contribution / 3));
      lines.push(`   ${c.label.padEnd(28)} ${bar} ${c.contribution.toFixed(1)}`);
    });
    lines.push('');
  }
  if (explanation.signals.length > 0) {
    lines.push('💬 Signaux détectés :');
    explanation.signals.forEach(s => lines.push(`   • [${s.type}] "${s.quote}"`));
    lines.push('');
  }
  if (explanation.penalties.length > 0) {
    lines.push('⚠️  Pénalités :');
    explanation.penalties.forEach(p => lines.push(`   • ${p}`));
    lines.push('');
  }
  if (explanation.caveats.length > 0) {
    lines.push('🚩 Points d\'attention :');
    explanation.caveats.forEach(c => lines.push(`   • ${c}`));
  }
  return lines.join('\n');
}