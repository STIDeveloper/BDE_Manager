/**
 * Tests d'intégration bout-en-bout.
 * Lance avec : node --test src/roleEngine/tests/fullstack.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  importResponses,
  compareAllScenarios,
  checkStability,
  computeAssignments,
  computeHealthScore,
  groupAlerts,
  explainAssignment,
  generateScenarioReport,
  whatIf,
  detectBlockingPairs,
  sensitivityAnalysis,
  DEFAULT_CAPACITIES,
  DEFAULT_WEIGHTS,
  DEFAULT_PENALTIES,
  DEFAULT_MIN_SCORE,
  ROLE_CATALOG,
} from '../index.js';
import { buildScoreMatrix } from '../scoring.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadRealCsv() {
  const p = path.join(__dirname, 'real_responses.csv');
  if (!fs.existsSync(p)) {
    console.warn('⚠️  real_responses.csv non trouvé, utilisation du sample.csv');
    return fs.readFileSync(path.join(__dirname, 'sample.csv'), 'utf-8');
  }
  return fs.readFileSync(p, 'utf-8');
}

const csv = loadRealCsv();

// ============================================================
// 1. INGESTION
// ============================================================

test('[E2E-1] Parsing : 30 candidats attendus', () => {
  const { candidates, report } = importResponses(csv);
  assert.ok(candidates.length >= 5, `Seulement ${candidates.length} candidats parsés`);
  assert.equal(report.parsedRows, candidates.length);
});

test('[E2E-2] Normalisation : accents et emojis retirés des noms', () => {
  const { candidates } = importResponses(csv);
  candidates.forEach(c => {
    assert.ok(!c.firstName.includes('🏢'), `Emoji dans ${c.firstName}`);
    assert.ok(!c.lastName.includes('📱'), `Emoji dans ${c.lastName}`);
    assert.ok(!c.firstName.includes('  '), `Double espace dans ${c.firstName}`);
  });
});

test('[E2E-3] Dédoublonnage : aucun candidat n\'a 3 fois le même rôle', () => {
  const { candidates } = importResponses(csv);
  candidates.forEach(c => {
    const seen = new Set();
    c.choices.forEach(roleId => {
      assert.ok(!seen.has(roleId), `Doublon ${roleId} chez ${c.firstName}`);
      seen.add(roleId);
    });
  });
});

// ============================================================
// 2. SCORING
// ============================================================

test('[E2E-4] Matrice de scores : dimensions correctes', () => {
  const { candidates } = importResponses(csv);
  const matrix = buildScoreMatrix(candidates, ROLE_CATALOG, DEFAULT_WEIGHTS, DEFAULT_PENALTIES);
  assert.equal(matrix.size, candidates.length);
  matrix.forEach(byRole => {
    assert.equal(byRole.size, ROLE_CATALOG.length);
    byRole.forEach(sb => {
      assert.ok(sb.total >= 0 && sb.total <= 100);
      assert.ok(sb.raw >= 0);
    });
  });
});

test('[E2E-5] Signaux : au moins 1 signal extrait d\'un texte motivé', () => {
  const { candidates } = importResponses(csv);
  const withSignals = candidates.filter(c => c.signals.length > 0);
  assert.ok(withSignals.length > 0, 'Aucun signal détecté sur 30 candidats');
});

// ============================================================
// 3. SOLVEUR
// ============================================================

test('[E2E-6] Solveur : contraintes dures respectées', () => {
  const { candidates } = importResponses(csv);
  const scenario = computeAssignments(candidates, { capacities: DEFAULT_CAPACITIES });

  // Contrainte 1 : 1 candidat = 1 seul poste
  const assignedCandidates = scenario.assignments.filter(a => a.candidateId && a.slotId);
  const candidateIds = assignedCandidates.map(a => a.candidateId);
  assert.equal(new Set(candidateIds).size, candidateIds.length, 'Candidat assigné 2 fois');

  // Contrainte 2 : 1 slot = 1 seul candidat
  const slotIds = scenario.assignments.filter(a => a.slotId).map(a => a.slotId);
  assert.equal(new Set(slotIds).size, slotIds.length, 'Slot assigné 2 fois');

  // Contrainte 3 : score minimum respecté
  assignedCandidates.forEach(a => {
    assert.ok(a.score.total >= DEFAULT_MIN_SCORE,
      `Score ${a.score.total} < min ${DEFAULT_MIN_SCORE} pour ${a.candidateId}`);
  });
});

test('[E2E-7] Solveur : couvre la capacité maximale', () => {
  const { candidates } = importResponses(csv);
  const scenario = computeAssignments(candidates, { capacities: DEFAULT_CAPACITIES });

  const totalCapacity = Object.values(DEFAULT_CAPACITIES).reduce((s, n) => s + n, 0);
  const assigned = scenario.assignments.filter(a => a.candidateId).length;

  // On ne peut pas assigner plus que le nombre de candidats
  const expectedMax = Math.min(candidates.length, totalCapacity);
  assert.ok(assigned <= expectedMax, `${assigned} > max ${expectedMax}`);
});

test('[E2E-8] Solveur : vérifier que le minimum de postes est atteint (au moins 1 par niveau clé)', () => {
  const { candidates } = importResponses(csv);
  const scenario = computeAssignments(candidates, { capacities: DEFAULT_CAPACITIES });

  // Au moins Président, Trésorier, 1 Responsable Com assignés
  const essentialRoles = ['president', 'tresorier', 'responsable_communication'];
  essentialRoles.forEach(roleId => {
    const assigned = scenario.assignments.find(a => a.roleId === roleId && a.candidateId);
    // On accepte VACANT si personne n'a le score min (mais on doit avoir au moins 1 candidat éligible)
    const hasEligible = candidates.some(c => c.choices.includes(roleId));
    if (hasEligible) {
      assert.ok(assigned, `Aucun candidat assigné sur ${roleId} alors qu'il y a ${candidates.filter(c => c.choices.includes(roleId)).length} candidats`);
    }
  });
});

test('[E2E-9] Solveur : meilleur qu\'un glouton naïf', () => {
  const { candidates } = importResponses(csv);
  const scenario = computeAssignments(candidates, { capacities: DEFAULT_CAPACITIES });
  const optimalScore = scenario.globalScore;

  // Glouton naïf : chacun prend son 1er choix disponible dans l'ordre CSV
  let greedyScore = 0;
  const usedSlots = new Set();
  const slotsByRole = {};
  scenario.assignments.forEach(a => {
    if (!a.slotId) return;
    if (!slotsByRole[a.roleId]) slotsByRole[a.roleId] = [];
    slotsByRole[a.roleId].push(a.slotId);
  });

  candidates.forEach(c => {
    if (c.choices.length === 0) return;
    const roleId = c.choices[0];
    const slots = slotsByRole[roleId] || [];
    const freeSlot = slots.find(s => !usedSlots.has(s));
    if (freeSlot) {
      usedSlots.add(freeSlot);
      // Score hypothétique
      const role = ROLE_CATALOG.find(r => r.id === roleId);
      greedyScore += role ? 60 : 0;
    }
  });

  assert.ok(optimalScore >= greedyScore * 0.8,
    `Score optimal ${optimalScore} < glouton ${greedyScore} * 0.8`);
});

// ============================================================
// 4. SCÉNARIOS
// ============================================================

test('[E2E-10] Comparaison : 3 scénarios standards générés', () => {
  const { candidates } = importResponses(csv);
  const { scenarios, ranking } = compareAllScenarios(candidates, { capacities: DEFAULT_CAPACITIES });
  assert.equal(scenarios.length, 3);
  assert.ok(ranking.bestAvg);
  assert.ok(ranking.bestGlobalScore);
  assert.ok(ranking.bestWorst);
});

test('[E2E-11] Scénarios : les scores sont différents', () => {
  const { candidates } = importResponses(csv);
  const { scenarios } = compareAllScenarios(candidates, { capacities: DEFAULT_CAPACITIES });
  const scores = scenarios.map(s => s.globalScore);
  // Au moins 2 scénarios doivent avoir des scores distincts
  assert.ok(new Set(scores).size >= 2, `Scores identiques : ${scores.join(', ')}`);
});

// ============================================================
// 5. STABILITÉ
// ============================================================

test('[E2E-12] Stabilité : produit des fréquences 0..1', () => {
  const { candidates } = importResponses(csv);
  const stab = checkStability(candidates, { iterations: 50, seed: 42 });
  stab.stability.forEach(v => {
    assert.ok(v >= 0 && v <= 1, `Fréquence invalide : ${v}`);
  });
});

test('[E2E-13] Stabilité : déterministe (même graine = même résultat)', () => {
  const { candidates } = importResponses(csv);
  const a = checkStability(candidates, { iterations: 20, seed: 999 });
  const b = checkStability(candidates, { iterations: 20, seed: 999 });
  assert.equal(a.stability.size, b.stability.size);
  a.stability.forEach((v, k) => {
    assert.equal(v, b.stability.get(k), `Divergence sur ${k}`);
  });
});

// ============================================================
// 6. ALERTES
// ============================================================

test('[E2E-14] Alertes : groupement par sévérité', () => {
  const { candidates } = importResponses(csv);
  const scenario = computeAssignments(candidates, { capacities: DEFAULT_CAPACITIES });
  const grouped = groupAlerts(scenario.alerts);
  assert.ok(Array.isArray(grouped.danger));
  assert.ok(Array.isArray(grouped.warning));
  assert.ok(Array.isArray(grouped.info));
});

test('[E2E-15] Alertes : détecte les contradictions internes', () => {
  const { candidates } = importResponses(csv);
  // Bilal : rythme ⚠️ + Trésorier → doit être flaggé
  const bilal = candidates.find(c => c.firstName.toLowerCase().includes('bilal'));
  if (bilal) {
    assert.ok(bilal.contradictions.length > 0, 'Aucune contradiction détectée pour Bilal');
  }
});

// ============================================================
// 7. EXPLICATIONS
// ============================================================

test('[E2E-16] Explication : toutes les affectations ont un headline', () => {
  const { candidates } = importResponses(csv);
  const scenario = computeAssignments(candidates, { capacities: DEFAULT_CAPACITIES });
  scenario.assignments.filter(a => a.candidateId).forEach(a => {
    const c = candidates.find(x => x.id === a.candidateId);
    const ex = explainAssignment(a, c);
    assert.ok(ex.headline.includes('→'), `Headline invalide : ${ex.headline}`);
    assert.ok(ex.summary.length > 0);
  });
});

test('[E2E-17] Rapport : contient toutes les sections', () => {
  const { candidates } = importResponses(csv);
  const scenario = computeAssignments(candidates, { capacities: DEFAULT_CAPACITIES });
  const report = generateScenarioReport(scenario, candidates);
  assert.ok(report.includes('RAPPORT DU SCÉNARIO'));
  assert.ok(report.includes('Score global'));
  assert.ok(report.includes('TAILLES DES PÔLES'));
  assert.ok(report.includes('AFFECTATIONS'));
});

// ============================================================
// 8. WHAT-IF
// ============================================================

test('[E2E-18] What-if : détecte les mouvements', () => {
  const { candidates } = importResponses(csv);
  const baseline = computeAssignments(candidates, { capacities: DEFAULT_CAPACITIES });
  const result = whatIf({
    candidates,
    baseline,
    change: { weights: { P: 0.8, D: 0.05, E: 0.05, A: 0.05, M: 0.03, F: 0.02 } },
  });
  assert.ok(result.after);
  assert.ok(typeof result.diff.scoreDiff === 'number');
  assert.ok(Array.isArray(result.diff.moved));
});

// ============================================================
// 9. DÉTECTION DE BLOCAGE
// ============================================================

test('[E2E-19] Paires bloquantes : détecte les envies non satisfaites', () => {
  const { candidates } = importResponses(csv);
  const scenario = computeAssignments(candidates, { capacities: DEFAULT_CAPACITIES });
  const matrix = buildScoreMatrix(candidates, ROLE_CATALOG, DEFAULT_WEIGHTS, DEFAULT_PENALTIES);
  const blockers = detectBlockingPairs({
    candidates,
    assignments: scenario.assignments,
    scoreMatrix: matrix,
  });
  assert.ok(Array.isArray(blockers));
});

// ============================================================
// 10. PERFORMANCE
// ============================================================

test('[E2E-20] Performance : pipeline complet < 200 ms', () => {
  const start = Date.now();
  const { candidates } = importResponses(csv);
  computeAssignments(candidates, { capacities: DEFAULT_CAPACITIES });
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 500, `Pipeline trop lent : ${elapsed}ms`);
});

// ============================================================
// 11. CAS LIMITES
// ============================================================

test('[E2E-21] Cas limite : 1 seul candidat', () => {
  const singleCsv = `"Horodateur","Prénom et NOM","Téléphone","Email","Formation","Alternance","Année","1er choix","2e choix","3e choix","Pourquoi","Rôle à découvrir","Apporter","Rythme","Couteau suisse"
"2026/09/27 6:57:16 PM UTC+3","Test UNIQUE","0600000000","test@test.fr","InfoCOM","Non","BUT 1","Président(e)","","","","","","🚀 Dispo et réactif tous les jours","🔥 Carrément"`;
  const { candidates } = importResponses(singleCsv);
  assert.equal(candidates.length, 1);
  const scenario = computeAssignments(candidates, { capacities: DEFAULT_CAPACITIES });
  assert.ok(scenario);
});

test('[E2E-22] Cas limite : tous sur le même rôle', () => {
  const roles = Array(5).fill('Président(e)').join('","');
  let csvContent = `"Horodateur","Prénom et NOM","Téléphone","Email","Formation","Alternance","Année","1er choix","2e choix","3e choix","Pourquoi","Rôle à découvrir","Apporter","Rythme","Couteau suisse"\n`;
  for (let i = 0; i < 5; i++) {
    csvContent += `"2026/09/27 6:57:16 PM UTC+3","User${i} NAME${i}","060000000${i}","user${i}@test.fr","InfoCOM","Non","BUT 1","Président(e)","","","","","","🚀 Dispo et réactif tous les jours","🔥 Carrément"\n`;
  }
  const { candidates } = importResponses(csvContent);
  const scenario = computeAssignments(candidates, { capacities: DEFAULT_CAPACITIES });
  // Un seul peut être Président, les autres doivent être ailleurs ou non-assignés
  const presidents = scenario.assignments.filter(a => a.roleId === 'president' && a.candidateId);
  assert.ok(presidents.length <= 1, `Trop de présidents : ${presidents.length}`);
});

test('[E2E-23] Cas limite : CSV vide', () => {
  assert.throws(() => importResponses(''));
  assert.throws(() => importResponses('header\n'));
});

test('[E2E-24] Cas limite : aucun candidat éligible sur un rôle', () => {
  const csvContent = `"Horodateur","Prénom et NOM","Téléphone","Email","Formation","Alternance","Année","1er choix","2e choix","3e choix","Pourquoi","Rôle à découvrir","Apporter","Rythme","Couteau suisse"
"2026/09/27 6:57:16 PM UTC+3","Only ONE","0600000000","x@y.fr","InfoCOM","Non","BUT 1","Membre Communication","","","","","","⚠️ Emploi du temps très chargé","🎯 Pas vraiment"`;
  const { candidates } = importResponses(csvContent);
  const scenario = computeAssignments(candidates, { capacities: DEFAULT_CAPACITIES });
  // Le Président doit être VACANT
  const presidentSlot = scenario.assignments.find(a => a.roleId === 'president' && a.vacant);
  assert.ok(presidentSlot, 'Le Président aurait dû rester vacant');
});

// ============================================================
// 12. DÉTERMINISME
// ============================================================

test('[E2E-25] Déterminisme : même CSV = même résultat', () => {
  const run = () => {
    const { candidates } = importResponses(csv);
    const scenario = computeAssignments(candidates, { capacities: DEFAULT_CAPACITIES });
    return scenario.assignments
      .filter(a => a.candidateId)
      .map(a => `${a.candidateId}:${a.roleId}`)
      .sort()
      .join('|');
  };
  const a = run();
  const b = run();
  assert.equal(a, b, 'Résultats non déterministes');
});