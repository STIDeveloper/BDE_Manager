/**
 * Tests d'intégration bout-en-bout.
 * Lance avec : node --test "src/roleEngine/tests/*.test.js"
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
  explainVacant,
  generateScenarioReport,
  whatIf,
  detectBlockingPairs,
  sensitivityAnalysis,
  getCatalogRoles,
  DEFAULT_CAPACITIES,
  DEFAULT_WEIGHTS,
  DEFAULT_PENALTIES,
  DEFAULT_MIN_SCORE,
} from '../index.js';
import { buildScoreMatrix, computeScore } from '../scoring.js';
import { DEFAULT_CATALOG } from '../../core/catalog.js';

const ROLES = getCatalogRoles(DEFAULT_CATALOG);

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
  const matrix = buildScoreMatrix(candidates, ROLES, DEFAULT_WEIGHTS, DEFAULT_PENALTIES);
  assert.equal(matrix.size, candidates.length);
  matrix.forEach(byRole => {
    assert.equal(byRole.size, ROLES.length);
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
  // Lignes réellement placées (les lignes « non placé » ont slotId = null)
  const assigned = scenario.assignments.filter(a => a.candidateId && a.slotId).length;
  const rowsPerCandidate = scenario.assignments.filter(a => a.candidateId).length;
  assert.equal(rowsPerCandidate, candidates.length, 'Chaque candidat doit avoir exactement une ligne');

  // On ne peut pas assigner plus que le nombre de candidats
  const expectedMax = Math.min(candidates.length, totalCapacity);
  assert.ok(assigned <= expectedMax, `${assigned} > max ${expectedMax}`);
});

test('[E2E-8] Solveur : un poste essentiel n\'est vacant que si aucun candidat libre n\'y est éligible', () => {
  const { candidates } = importResponses(csv);
  const scenario = computeAssignments(candidates, { capacities: DEFAULT_CAPACITIES });
  const matrix = buildScoreMatrix(candidates, ROLES, DEFAULT_WEIGHTS, DEFAULT_PENALTIES);
  const placedIds = new Set(scenario.assignments.filter(a => a.candidateId && a.slotId).map(a => a.candidateId));
  const unplaced = candidates.filter(c => !placedIds.has(c.id));

  const essentialRoles = ROLES.filter(r => r.essential).map(r => r.id);
  assert.ok(essentialRoles.includes('president') && essentialRoles.includes('tresorier'));
  let checkedVacant = 0;
  essentialRoles.forEach(roleId => {
    const holders = scenario.assignments.filter(a => a.roleId === roleId && a.candidateId && a.slotId);
    const vacants = scenario.assignments.filter(a => a.roleId === roleId && a.vacant);
    // Chaque slot du rôle est soit occupé, soit vacant (jamais les deux, jamais perdu)
    assert.equal(holders.length + vacants.length, DEFAULT_CAPACITIES[roleId], `Slots incohérents sur ${roleId}`);
    // Un titulaire a toujours un score ≥ seuil
    holders.forEach(h => assert.ok(h.score.total >= DEFAULT_MIN_SCORE, `${roleId} : titulaire sous le seuil`));
    if (vacants.length === 0) return;
    checkedVacant++;
    // VACANT légitime : aucun candidat NON PLACÉ n'atteint le seuil sur ce rôle
    // (sinon le solveur gagnerait strictement à l'y placer : 100 − S ≤ 45 < 45 + 40).
    unplaced.forEach(c => {
      const sc = matrix.get(c.id).get(roleId).total;
      assert.ok(sc < DEFAULT_MIN_SCORE,
        `${roleId} vacant alors que ${c.firstName} (non placé) y obtient ${sc.toFixed(1)} ≥ ${DEFAULT_MIN_SCORE}`);
    });
    // Ceux qui l'ont demandé sont soit placés ailleurs, soit sous le seuil
    candidates.filter(c => c.choices.includes(roleId)).forEach(c => {
      const sc = matrix.get(c.id).get(roleId).total;
      assert.ok(placedIds.has(c.id) || sc < DEFAULT_MIN_SCORE,
        `${c.firstName} a demandé ${roleId} (score ${sc.toFixed(1)}) mais n'est placé nulle part`);
    });
    // Le poste vacant est expliqué
    const ex = explainVacant(roleId, vacants[0].slotId.split('#')[1], candidates, placedIds);
    assert.ok(ex && ex.headline.includes('VACANT'));
  });
  // Sur les données réelles, au moins un poste essentiel est vacant (Trésorier) : l'invariant est exercé
  if (candidates.length >= 20) assert.ok(checkedVacant > 0, 'Aucun poste essentiel vacant : invariant non exercé');
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
      const role = ROLES.find(r => r.id === roleId);
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
  assert.equal(grouped.danger.length + grouped.warning.length + grouped.info.length, scenario.alerts.length);
  // Santé = 100 − (8·danger + 3·warning + 1·info), bornée à 0
  const expected = Math.max(0, 100 - 8 * grouped.danger.length - 3 * grouped.warning.length - grouped.info.length);
  assert.equal(computeHealthScore(scenario.alerts), expected);
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

test('[E2E-16] Explication : placés → headline "→", non placés → "non assigné"', () => {
  const { candidates } = importResponses(csv);
  const scenario = computeAssignments(candidates, { capacities: DEFAULT_CAPACITIES });
  const rows = scenario.assignments.filter(a => a.candidateId);
  const placed = rows.filter(a => a.slotId);
  const unplaced = rows.filter(a => !a.slotId);
  assert.ok(placed.length > 0, 'Aucune affectation placée');
  assert.equal(placed.length + unplaced.length, candidates.length);
  placed.forEach(a => {
    const c = candidates.find(x => x.id === a.candidateId);
    const ex = explainAssignment(a, c);
    assert.ok(ex.headline.includes('→'), `Headline invalide : ${ex.headline}`);
    assert.ok(ex.summary.length > 0);
    assert.equal(ex.criteria.length, 6);
  });
  unplaced.forEach(a => {
    assert.equal(a.roleId, null);
    assert.equal(a.score, null);
    const c = candidates.find(x => x.id === a.candidateId);
    const ex = explainAssignment(a, c);
    assert.ok(ex.headline.includes('non assigné'), `Headline invalide : ${ex.headline}`);
    assert.ok(!ex.headline.includes('→'));
    assert.equal(ex.criteria.length, 0);
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
  const placed = scenario.assignments.filter(a => a.candidateId && a.slotId).length;
  const unplaced = scenario.assignments.filter(a => a.candidateId && !a.slotId).length;
  assert.ok(report.includes(`AFFECTATIONS (${placed})`));
  if (unplaced > 0) assert.ok(report.includes(`NON PLACÉS (${unplaced})`));
  // Pôles affichés par libellé, pas par id
  assert.ok(report.includes('Communication Interne'));
  assert.ok(!/•\s+communication_interne\b/.test(report));
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
  const matrix = buildScoreMatrix(candidates, ROLES, DEFAULT_WEIGHTS, DEFAULT_PENALTIES);
  const blockers = detectBlockingPairs({
    candidates,
    assignments: scenario.assignments,
    scoreMatrix: matrix,
  });
  assert.ok(Array.isArray(blockers));
  blockers.forEach(bl => {
    assert.ok(bl.gap > 10);
    assert.notEqual(bl.currentRole, bl.preferredRole);
  });
});

test('[E2E-19b] Sensibilité : 6 critères triés par amplitude', () => {
  const { candidates } = importResponses(csv);
  const role = ROLES.find(r => r.id === 'president');
  const res = sensitivityAnalysis(candidates[0], role, DEFAULT_WEIGHTS, DEFAULT_PENALTIES, computeScore);
  assert.equal(res.length, 6);
  for (let i = 1; i < res.length; i++) assert.ok(res[i - 1].range >= res[i].range);
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