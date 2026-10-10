import { ROLE_CATALOG } from './config.js';

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

export function explainAssignment(assignment, candidate, opts = {}) {
  const role = ROLE_CATALOG.find(r => r.id === assignment.roleId);
  if (!role) {
    return {
      headline: `${candidate.firstName} — non assigné`,
      rankLabel: '—',
      summary: 'Aucun poste compatible trouvé avec un score suffisant.',
      criteria: [], signals: [], penalties: [], caveats: [],
    };
  }

  const sb = assignment.score;
  const rankLabel = RANK_LABELS[sb?.rank ?? 'null'] || 'Hors choix';
  const headline = `${candidate.firstName} ${candidate.lastName} → ${role.label}`;
  const rankSummary = describeRank(sb?.rank);
  const score = (sb?.total ?? 0).toFixed(1);
  const summary = `${rankSummary} Score final : ${score}/100.`;

  const criteria = [];
  if (sb) {
    const weights = opts.weights || { P: 0.40, D: 0.20, E: 0.15, A: 0.10, M: 0.10, F: 0.05 };
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
  if (candidate.alternance && (role.level === 'bureau' || role.level === 'responsable')) {
    caveats.push('Alternance + poste exigeant → prévoir un binôme.');
  }
  if (candidate.availability <= 0.4 && (role.level === 'bureau' || role.level === 'responsable')) {
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

export function explainVacant(roleId, slotIndex, candidates, assignedCandidateIds = new Set()) {
  const role = ROLE_CATALOG.find(r => r.id === roleId);
  if (!role) return null;

  const unassigned = candidates.filter(c => !assignedCandidateIds.has(c.id));
  const unassignedNames = unassigned.slice(0, 5).map(c => `${c.firstName} ${c.lastName}`).join(', ');
  const more = unassigned.length > 5 ? ` (+${unassigned.length - 5} autres)` : '';

  return {
    headline: `${role.label} #${slotIndex} — POSTE VACANT`,
    rankLabel: '—',
    summary: 'Aucun candidat n\'a atteint le seuil d\'éligibilité pour ce poste.',
    criteria: [], signals: [], penalties: [],
    caveats: [
      `Poste de niveau "${role.level}" dans le pôle "${role.pole}".`,
      unassigned.length > 0
        ? `${unassigned.length} candidat${unassigned.length > 1 ? 's' : ''} non assigné${unassigned.length > 1 ? 's' : ''} : ${unassignedNames}${more}`
        : 'Tous les candidats sont assignés.',
    ],
  };
}

export function generateScenarioReport(scenario, candidates) {
  const lines = [];
  lines.push(`📊 RAPPORT DU SCÉNARIO : ${scenario.name}`);
  lines.push(`ℹ️  ${scenario.description}`);
  lines.push('');
  lines.push(`👥 Candidats : ${candidates.length}`);
  lines.push(`📈 Score global : ${scenario.globalScore.toFixed(1)}`);
  lines.push(`🎯 Satisfaction moyenne : ${scenario.avgSatisfaction.toFixed(1)}/100`);
  lines.push(`🔻 Satisfaction minimale : ${scenario.worstSatisfaction.toFixed(1)}/100`);
  lines.push('');
  lines.push(`📁 TAILLES DES PÔLES :`);
  Object.entries(scenario.poleSizes).forEach(([pole, size]) => {
    const target = scenario.poleTargets[pole] || '-';
    const diff = typeof target === 'number' ? size - target : 0;
    const diffStr = diff === 0 ? '✓' : diff > 0 ? `+${diff}` : `${diff}`;
    lines.push(`  • ${pole.padEnd(28)} ${size} (cible ${target}, ${diffStr})`);
  });
  lines.push('');
  lines.push(`🎯 AFFECTATIONS (${scenario.assignments.filter(a => a.candidateId).length}) :`);
  scenario.assignments
    .filter(a => a.candidateId)
    .sort((a, b) => b.score.total - a.score.total)
    .forEach(a => {
      const c = candidates.find(x => x.id === a.candidateId);
      const role = ROLE_CATALOG.find(r => r.id === a.roleId);
      const rankEmoji = a.score?.rank === 1 ? '🥇' : a.score?.rank === 2 ? '🥈' : a.score?.rank === 3 ? '🥉' : '⚠️';
      lines.push(`  ${rankEmoji} ${c.firstName} ${c.lastName} → ${role?.label} (${a.score.total.toFixed(1)})`);
    });
  lines.push('');
  if (scenario.alerts.length > 0) {
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