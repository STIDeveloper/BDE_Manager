import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importResponses } from '../index.js';
import { buildSlots } from '../roles.js';
import { buildScoreMatrix } from '../scoring.js';
import { solveAssignment, localSearch, hungarian } from '../solver.js';
import { DEFAULT_CAPACITIES, DEFAULT_WEIGHTS, DEFAULT_PENALTIES, DEFAULT_MIN_SCORE, getCatalogRoles } from '../config.js';
import { DEFAULT_CATALOG } from '../../core/catalog.js';

const ROLES = getCatalogRoles(DEFAULT_CATALOG);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('parseCSV : gère les retours ligne dans une cellule', async () => {
  const csv = `"a","b"\n"line1\nline2","x"`;
  const { parseCSV } = await import('../parser.js');
  const rows = parseCSV(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], 'line1\nline2');
});

test('hungarian : matrice 3x3', async () => {
  const cost = [
    [10, 5, 13],
    [3, 2, 9],
    [12, 7, 4],
  ];
  const result = hungarian(cost);
  // Minimum global : 5 + 3 + 4 = 12
  const total = result.reduce((s, j, i) => s + cost[i][j], 0);
  assert.equal(total, 12);
});

test('importResponses : parse le sample', async () => {
  const csv = fs.readFileSync(path.join(__dirname, 'sample.csv'), 'utf-8');
  const { candidates, report } = importResponses(csv);
  assert.equal(candidates.length, 5);
  assert.equal(report.parsedRows, 5);
  assert.equal(candidates[0].firstName, 'Kenzo');
  assert.equal(candidates[0].choices[0], 'president');
});

test('dédoublonnage : Président ×3 → 1 seul', async () => {
  const csv = fs.readFileSync(path.join(__dirname, 'sample.csv'), 'utf-8');
  const { candidates } = importResponses(csv);
  const kenzo = candidates.find(c => c.firstName === 'Kenzo');
  assert.equal(kenzo.choices.length, 1);
  assert.equal(kenzo.choices[0], 'president');
});

test('solver : un candidat = un poste, capacités respectées', async () => {
  const csv = fs.readFileSync(path.join(__dirname, 'sample.csv'), 'utf-8');
  const { candidates } = importResponses(csv);
  const slots = buildSlots(DEFAULT_CAPACITIES);
  const matrixFull = buildScoreMatrix(candidates, ROLES, DEFAULT_WEIGHTS, DEFAULT_PENALTIES);
  const { assignments } = solveAssignment(candidates, slots, matrixFull, { minScore: DEFAULT_MIN_SCORE });

  // Vérifie unicité : chaque candidat apparaît une seule fois assigné
  const assignedCandidates = assignments.filter(a => a.candidateId && a.slotId).map(a => a.candidateId);
  assert.equal(new Set(assignedCandidates).size, assignedCandidates.length);

  // Vérifie que chaque slot est utilisé au plus une fois
  const usedSlots = assignments.filter(a => a.slotId).map(a => a.slotId);
  assert.equal(new Set(usedSlots).size, usedSlots.length);

  // Capacités respectées : nb de slots par rôle = capacité
  const total = Object.values(DEFAULT_CAPACITIES).reduce((s, n) => s + n, 0);
  assert.equal(slots.length, total);
});

test('déterminisme : même entrée = même sortie', () => {
  const csv = fs.readFileSync(path.join(__dirname, 'sample.csv'), 'utf-8');
  const run = () => {
    const { candidates } = importResponses(csv);
    const slots = buildSlots(DEFAULT_CAPACITIES);
    const matrix = buildScoreMatrix(candidates, ROLES, DEFAULT_WEIGHTS, DEFAULT_PENALTIES);
    return solveAssignment(candidates, slots, matrix, { minScore: DEFAULT_MIN_SCORE }).assignments
      .map(a => `${a.candidateId}:${a.slotId}:${a.score?.total ?? ''}`)
      .join('|');
  };
  assert.equal(run(), run());
});

test('localSearch : score final ≥ score initial', () => {
  const csv = fs.readFileSync(path.join(__dirname, 'sample.csv'), 'utf-8');
  const { candidates } = importResponses(csv);
  const slots = buildSlots(DEFAULT_CAPACITIES);
  const matrix = buildScoreMatrix(candidates, ROLES, DEFAULT_WEIGHTS, DEFAULT_PENALTIES);
  const initial = solveAssignment(candidates, slots, matrix, { minScore: DEFAULT_MIN_SCORE });
  const improved = localSearch(initial.assignments, matrix, { minScore: DEFAULT_MIN_SCORE });
  assert.ok(improved.globalScore >= initial.globalScore - 0.01,
    `Score dégradé : ${initial.globalScore} → ${improved.globalScore}`);
});

test('verrous : un verrou pendant (slot inexistant) ne bloque pas le candidat', () => {
  const csv = fs.readFileSync(path.join(__dirname, 'sample.csv'), 'utf-8');
  const { candidates } = importResponses(csv);
  const slots = buildSlots(DEFAULT_CAPACITIES);
  const matrix = buildScoreMatrix(candidates, ROLES, DEFAULT_WEIGHTS, DEFAULT_PENALTIES);
  const kenzo = candidates.find(c => c.firstName === 'Kenzo');
  const free = solveAssignment(candidates, slots, matrix, { minScore: DEFAULT_MIN_SCORE });
  const dangling = solveAssignment(candidates, slots, matrix, {
    minScore: DEFAULT_MIN_SCORE,
    lockedPairs: new Set([`${kenzo.id}:role_supprime#1`, `inconnu:president#1`, 'mal-forme']),
  });
  const roleOf = (res) => res.assignments.find(a => a.candidateId === kenzo.id)?.roleId;
  assert.equal(roleOf(dangling), roleOf(free));
  assert.equal(roleOf(free), 'president');
});
