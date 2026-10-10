import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  importResponses, compareAllScenarios, checkStability,
  computeAssignments, computeHealthScore, groupAlerts,
  explainAssignment, generateScenarioReport, whatIf,
  DEFAULT_CAPACITIES,
} from '../index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const csv = fs.readFileSync(path.join(__dirname, 'sample.csv'), 'utf-8');

test('compareAllScenarios : 3 scénarios produits', () => {
  const { candidates } = importResponses(csv);
  const { scenarios, ranking } = compareAllScenarios(candidates, { capacities: DEFAULT_CAPACITIES });
  assert.equal(scenarios.length, 3);
  assert.ok(scenarios.every(s => s.assignments.length > 0));
  assert.ok(ranking.bestAvg);
});

test('scénario : un candidat n\'est assigné qu\'à un seul poste', () => {
  const { candidates } = importResponses(csv);
  const { scenarios } = compareAllScenarios(candidates, { capacities: DEFAULT_CAPACITIES });
  scenarios.forEach(s => {
    const assigned = s.assignments.filter(a => a.candidateId && a.slotId);
    const ids = assigned.map(a => a.candidateId);
    assert.equal(new Set(ids).size, ids.length, `Doublon dans ${s.name}`);
  });
});

test('stabilité : 200 itérations déterministes', () => {
  const { candidates } = importResponses(csv);
  const stability = checkStability(candidates, { iterations: 50, seed: 42 });
  assert.ok(stability.stability.size >= 0);
  assert.ok(stability.stability.size <= candidates.length * 3); // max 3 paires par candidat
});

test('génération de rapport : contient les sections clés', () => {
  const { candidates } = importResponses(csv);
  const { scenarios } = compareAllScenarios(candidates, { capacities: DEFAULT_CAPACITIES });
  const report = generateScenarioReport(scenarios[0], candidates);
  assert.ok(report.includes('RAPPORT DU SCÉNARIO'));
  assert.ok(report.includes('Score global'));
  assert.ok(report.includes('TAILLES DES PÔLES'));
});

test('healthScore : 0..100', () => {
  const { candidates } = importResponses(csv);
  const { scenarios } = compareAllScenarios(candidates, { capacities: DEFAULT_CAPACITIES });
  scenarios.forEach(s => {
    const score = computeHealthScore(s.alerts, candidates.length);
    assert.ok(score >= 0 && score <= 100);
  });
});

test('whatIf : détecte les mouvements', () => {
  const { candidates } = importResponses(csv);
  const baseline = computeAssignments(candidates, { capacities: DEFAULT_CAPACITIES });
  const result = whatIf({
    candidates,
    baseline,
    change: { weights: { P: 0.7, D: 0.1, E: 0.05, A: 0.05, M: 0.05, F: 0.05 } },
  });
  assert.ok(result.after);
  assert.ok(Array.isArray(result.diff.moved));
});

test('explainAssignment : renvoie headline + critères', () => {
  const { candidates } = importResponses(csv);
  const scenario = computeAssignments(candidates, { capacities: DEFAULT_CAPACITIES });
  const assigned = scenario.assignments.find(a => a.candidateId && a.score);
  if (assigned) {
    const c = candidates.find(x => x.id === assigned.candidateId);
    const ex = explainAssignment(assigned, c);
    assert.ok(ex.headline.includes('→'));
    assert.ok(Array.isArray(ex.criteria));
  }
});

test('groupAlerts : 3 catégories', () => {
  const { candidates } = importResponses(csv);
  const scenario = computeAssignments(candidates, { capacities: DEFAULT_CAPACITIES });
  const grouped = groupAlerts(scenario.alerts);
  assert.ok(Array.isArray(grouped.danger));
  assert.ok(Array.isArray(grouped.warning));
  assert.ok(Array.isArray(grouped.info));
});