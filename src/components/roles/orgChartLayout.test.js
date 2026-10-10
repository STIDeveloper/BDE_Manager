import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCatalog } from '../../core/catalog.js';
import {
  buildOrgTree, layoutOrgTree, computeSwapLocks, zoomAt, ORPHAN_POLE_ID, MAX_ZOOM,
} from './orgChartLayout.js';
import { countAssignments, refLabel } from './scenarioStats.js';

// Catalogue minimal avec un pôle et un rôle PERSONNALISÉS
function makeCatalog() {
  const cat = createDefaultCatalog();
  cat.poles.design = { id: 'design', label: 'Design', short: 'Design', color: '#123456', emoji: '🎨', order: 0.5, affinity: {}, custom: true };
  cat.roles.resp_design = { id: 'resp_design', label: 'Responsable Design', level: 'responsable', pole: 'design', leadership: true, essential: false, capacity: 2, order: 0, aliases: [], custom: true };
  return cat;
}

const scenario = {
  assignments: [
    { candidateId: 'c1', slotId: 'president#1', roleId: 'president', score: { total: 80, rank: 1 }, locked: true },
    { candidateId: 'c2', slotId: 'resp_design#1', roleId: 'resp_design', score: { total: 70, rank: 2 }, locked: false },
    { candidateId: 'c3', slotId: null, roleId: null, score: null },
    { candidateId: null, slotId: 'vice_president#1', roleId: 'vice_president', score: null, vacant: true },
    { candidateId: 'c4', slotId: 'ghost#1', roleId: 'ghost', score: { total: 60, rank: 3 } },
  ],
};

test('arbre : ordre du catalogue, pôle/rôle personnalisés, vacants complétés', () => {
  const cat = makeCatalog();
  const tree = buildOrgTree(scenario, cat);
  const poleIds = tree.poles.map(p => p.pole.id);
  assert.equal(poleIds[0], 'bureau');
  assert.equal(poleIds[1], 'design', 'pôle personnalisé placé selon son ordre');
  const design = tree.poles[1];
  assert.equal(design.pole.label, 'Design');
  assert.equal(design.pole.emoji, '🎨');
  assert.equal(design.pole.color, '#123456');
  assert.deepEqual(design.roles[0].slots.map(s => s.slotId), ['resp_design#1', 'resp_design#2']);
  assert.equal(design.roles[0].slots[1].vacant, true, 'place #2 vacante synthétisée');
  // Tous les rôles à capacité > 0 apparaissent, même sans ligne dans le scénario
  const allRoles = tree.poles.flatMap(p => p.roles.map(r => r.role.id));
  Object.values(cat.roles).filter(r => r.capacity > 0).forEach(r => assert.ok(allRoles.includes(r.id), r.id));
  // Rôle supprimé → pôle « Hors catalogue »
  assert.equal(poleIds.at(-1), ORPHAN_POLE_ID);
});

test('arbre : non placés séparés, rôle à capacité 0 masqué', () => {
  const cat = makeCatalog();
  cat.roles.membre_sport.capacity = 0;
  const tree = buildOrgTree(scenario, cat);
  assert.deepEqual(tree.unplaced.map(a => a.candidateId), ['c3']);
  const allRoles = tree.poles.flatMap(p => p.roles.map(r => r.role.id));
  assert.ok(!allRoles.includes('membre_sport'));
});

test('layout : clés stables et uniques, colonne des non placés', () => {
  const tree = buildOrgTree(scenario, makeCatalog());
  const { nodes, width, height } = layoutOrgTree(tree);
  const keys = nodes.map(n => n.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.includes('slot:resp_design#2'));
  assert.ok(keys.includes('unplaced:c3'));
  const role = nodes.find(n => n.key === 'role:resp_design');
  assert.equal(role.filled, 1);
  assert.equal(role.total, 2);
  assert.ok(width > 0 && height > 0);
  nodes.forEach(n => assert.ok(n.x + n.w <= width && n.y + n.h <= height, n.key));
});

test('layout : scénario vide → seulement les places vacantes', () => {
  const tree = buildOrgTree(null, makeCatalog());
  assert.equal(tree.unplaced.length, 0);
  const { nodes } = layoutOrgTree(tree);
  assert.ok(nodes.filter(n => n.type === 'slot').every(n => n.vacant));
});

test('compteurs : non placés et vacants distincts des placés', () => {
  const c = countAssignments(scenario);
  assert.equal(c.placed, 3);
  assert.equal(c.unplaced, 1);
  assert.equal(c.vacant, 1);
  assert.equal(c.rank1 + c.rank2 + c.rank3 + c.discover + c.out, c.placed);
});

test('refLabel : candidat, rôle, pôle, inconnu', () => {
  const cat = makeCatalog();
  const candidatesById = new Map([['c1', { firstName: 'Ada', lastName: 'L' }]]);
  assert.equal(refLabel('c1', { candidatesById, catalog: cat }), 'Ada L');
  assert.equal(refLabel('resp_design', { candidatesById, catalog: cat }), 'Responsable Design');
  assert.equal(refLabel('design', { candidatesById, catalog: cat }), 'Design');
  assert.equal(refLabel('xyz', { candidatesById, catalog: cat }), 'xyz');
});

test('échange : A ↔ B verrouillés, verrous conflictuels retirés, pas de toggle', () => {
  const locks = ['A:r#1', 'X:r#2', 'B:other#1', 'Z:z#1'];
  const res = computeSwapLocks(locks, { candidateId: 'A', fromSlotId: 'r#1' }, { slotId: 'r#2', candidateId: 'B' });
  assert.deepEqual(res.added.sort(), ['A:r#2', 'B:r#1']);
  assert.deepEqual(res.removed.sort(), ['A:r#1', 'B:other#1', 'X:r#2']);
  assert.ok(res.pairs.includes('Z:z#1'));
  // Rejouer le même échange ne retire rien (idempotent, contrairement à un toggle)
  const again = computeSwapLocks(res.pairs, { candidateId: 'A', fromSlotId: 'r#1' }, { slotId: 'r#2', candidateId: 'B' });
  assert.deepEqual(again.added, []);
  assert.deepEqual(again.removed, []);
  assert.deepEqual(again.pairs.sort(), res.pairs.sort());
});

test('échange : vers une place vacante / depuis les non placés', () => {
  const r1 = computeSwapLocks([], { candidateId: 'A', fromSlotId: 'r#1' }, { slotId: 'v#1', candidateId: null });
  assert.deepEqual(r1.pairs, ['A:v#1']);
  const r2 = computeSwapLocks(['B:r#2'], { candidateId: 'A', fromSlotId: null }, { slotId: 'r#2', candidateId: 'B' });
  assert.deepEqual(r2.pairs, ['A:r#2']);
  assert.deepEqual(r2.removed, ['B:r#2']);
});

test('zoomAt : le point fixe reste immobile, zoom borné', () => {
  const v = zoomAt({ zoom: 1, x: 10, y: 20 }, 2, 100, 100);
  assert.equal(v.zoom, 2);
  // point écran (100,100) → coordonnée monde identique avant/après
  assert.equal((100 - 10) / 1, (100 - v.x) / v.zoom);
  assert.equal((100 - 20) / 1, (100 - v.y) / v.zoom);
  assert.equal(zoomAt({ zoom: 2, x: 0, y: 0 }, 10, 0, 0).zoom, MAX_ZOOM);
});
