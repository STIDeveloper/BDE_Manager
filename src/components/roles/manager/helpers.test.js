// Tests des helpers purs de la gestion des rôles (node:test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  plural, reorderIds, sameOrder, computeUsage, computeRoleImpact, catalogTotals,
  poleSummaries, levelUsage, catalogFileName, parseCatalogText, computeReplaceImpact,
  normalizeAlias, findAliasConflict, addAlias, affinityEntries, memberDisplayName,
} from './helpers.js';
import { createDefaultCatalog } from '../../../core/catalog.js';

test('plural : singulier pour 0 et 1', () => {
  assert.equal(plural(0, 'rôle', 'rôles'), '0 rôle');
  assert.equal(plural(1, 'rôle', 'rôles'), '1 rôle');
  assert.equal(plural(4, 'rôle', 'rôles'), '4 rôles');
});

test('reorderIds : avant / après / cas limites', () => {
  const ids = ['a', 'b', 'c', 'd'];
  assert.deepEqual(reorderIds(ids, 'd', 'a', 'before'), ['d', 'a', 'b', 'c']);
  assert.deepEqual(reorderIds(ids, 'a', 'c', 'after'), ['b', 'c', 'a', 'd']);
  assert.deepEqual(reorderIds(ids, 'a', 'd', 'after'), ['b', 'c', 'd', 'a']);
  assert.deepEqual(reorderIds(ids, 'c', 'b', 'before'), ['a', 'c', 'b', 'd']);
  // Aucun changement → même référence (évite une entrée d'historique inutile)
  assert.equal(reorderIds(ids, 'b', 'b', 'before'), ids);
  assert.equal(reorderIds(ids, 'a', 'b', 'before'), ids);
  assert.equal(reorderIds(ids, 'x', 'b', 'before'), ids);
  assert.equal(reorderIds(ids, 'a', 'x', 'before'), ids);
  assert.ok(sameOrder(['a'], ['a']));
  assert.ok(!sameOrder(['a', 'b'], ['b', 'a']));
});

const members = [
  { id: 'm1', firstName: 'Lina', lastName: 'B', mainRole: 'president' },
  { id: 'm2', firstName: 'Tom', lastName: '', mainRole: 'membre_sport' },
  { id: 'm3', firstName: 'Zoé', lastName: 'K', mainRole: 'membre_sport' },
  { id: 'm4', firstName: 'Sam', mainRole: '' },
];
const candidates = [
  { id: 'c1', displayName: 'Ali Ben', choices: ['membre_sport', 'president', 'membre_sport'] },
  { id: 'c2', firstName: 'Eva', lastName: 'L', choices: ['president'] },
  { id: 'c3', displayName: 'Noé', choices: ['tresorier', 'secretaire', 'membre_projets', 'membre_sport'] },
];
const scenario = {
  name: 'Équilibré',
  assignments: [
    { candidateId: 'c1', slotId: 'membre_sport#1', roleId: 'membre_sport', score: 72 },
    { candidateId: null, slotId: 'membre_sport#2', roleId: 'membre_sport', score: null, vacant: true },
    { candidateId: 'c2', slotId: 'president#1', roleId: 'president', score: 90 },
    { candidateId: 'c3', slotId: null, roleId: null, score: null },
  ],
};
const constraints = {
  forcedRoles: { lina: 'president' },
  preferredRoles: { tom: 'membre_sport' },
  forbiddenRoles: { zoe: ['president', 'tresorier'] },
};
const rolePresets = { president: { f00: 'editor', f01: 'reader', f02: 'commenter', f03: 'none' } };

test('computeUsage : membres, vœux, presets, contraintes, affectations', () => {
  const u = computeUsage({ members, rolePresets, candidates, constraints, scenario });
  assert.equal(u.membersByRole.membre_sport.length, 2);
  assert.equal(u.membersByRole[''], undefined, 'membre sans rôle ignoré');
  // c1 : doublon membre_sport ignoré ; c3 : 4e vœu compté dans total mais pas dans les rangs
  assert.deepEqual(u.choiceStats.membre_sport, { ranks: [1, 0, 0], total: 2 });
  assert.deepEqual(u.choiceStats.president, { ranks: [1, 1, 0], total: 2 });
  assert.deepEqual(u.presetStats.president, { reader: 1, commenter: 1, editor: 1, total: 3 });
  assert.deepEqual(u.constraintRefs.president, { forced: ['lina'], preferred: [], forbidden: ['zoe'] });
  assert.deepEqual(u.constraintRefs.tresorier.forbidden, ['zoe']);
  assert.equal(u.assignmentsByRole.membre_sport.assigned.length, 1);
  assert.equal(u.assignmentsByRole.membre_sport.vacant, 1);
  assert.equal(u.assignmentsByRole.membre_sport.assigned[0].name, 'Ali Ben');
  assert.equal(u.assignmentsByRole.president.assigned[0].name, 'Eva L');
  assert.equal(u.candidateCount, 3);
  assert.equal(u.scenarioName, 'Équilibré');
});

test('computeUsage : entrées vides tolérées', () => {
  const u = computeUsage();
  assert.equal(u.candidateCount, 0);
  assert.equal(u.hasScenario, false);
  assert.deepEqual(u.membersByRole, {});
});

test('computeRoleImpact : toutes les dépendances sont comptées', () => {
  const u = computeUsage({ members, rolePresets, candidates, constraints, scenario });
  const president = computeRoleImpact('president', u);
  assert.equal(president.memberCount, 1);
  assert.deepEqual(president.memberNames, ['Lina']);
  assert.equal(president.presetFolders, 3);
  assert.equal(president.candidateCount, 2);
  assert.equal(president.constraintCount, 2);
  assert.equal(president.assignedCount, 1);
  assert.equal(president.isUsed, true);

  const unused = computeRoleImpact('responsable_esport', u);
  assert.equal(unused.isUsed, false);
  assert.equal(unused.memberCount, 0);
});

test('totaux, résumés par pôle et usage des niveaux', () => {
  const cat = createDefaultCatalog();
  const t = catalogTotals(cat);
  assert.equal(t.roles, Object.keys(cat.roles).length);
  assert.equal(t.capacity, Object.values(cat.roles).reduce((s, r) => s + r.capacity, 0));
  const ps = poleSummaries({ sport: [cat.roles.responsable_sport, cat.roles.membre_sport] });
  assert.deepEqual(ps.sport, { roleCount: 2, capacity: 5 });
  assert.equal(levelUsage(cat.roles).bureau, 4);
});

test('catalogFileName : date locale AAAA-MM-JJ', () => {
  assert.equal(catalogFileName(new Date(2026, 0, 5)), 'BDE_Catalogue_2026-01-05.json');
});

test('parseCatalogText : export de l\'app, JSON brut, erreurs', () => {
  const cat = createDefaultCatalog();
  const fromExport = parseCatalogText(JSON.stringify({ kind: 'bde-manager/catalog', catalog: cat }));
  assert.ok(fromExport.ok);
  assert.equal(Object.keys(fromExport.catalog.roles).length, Object.keys(cat.roles).length);
  assert.ok(parseCatalogText(JSON.stringify(cat)).ok);
  const bad = parseCatalogText('{nope');
  assert.equal(bad.ok, false);
  assert.match(bad.error, /JSON/);
  const missing = parseCatalogText(JSON.stringify({ roles: {} }));
  assert.equal(missing.ok, false);
  assert.match(missing.error, /poles/);
});

test('computeReplaceImpact : membres détachés = rôle actuel absent du nouveau catalogue', () => {
  const current = createDefaultCatalog();
  const next = createDefaultCatalog();
  delete next.roles.membre_sport;
  next.roles.mascotte = { ...current.roles.membre_esport, id: 'mascotte', label: 'Mascotte' };
  const list = [
    ...members,
    { id: 'm5', firstName: 'Old', mainRole: 'ancien_role_inconnu' }, // déjà orphelin : pas compté
  ];
  const impact = computeReplaceImpact(current, next, list);
  assert.deepEqual(impact.detachedMembers.map(m => m.id), ['m2', 'm3']);
  assert.deepEqual(impact.removedRoles, ['membre_sport']);
  assert.deepEqual(impact.addedRoles, ['mascotte']);
  assert.equal(impact.totals.roles, Object.keys(next.roles).length);
});

test('alias : normalisation, conflits, ajout validé', () => {
  assert.equal(normalizeAlias('  Prési  DENTE '), 'presi dente');
  const cat = createDefaultCatalog();
  cat.roles.tresorier.aliases = ['Trez'];
  assert.equal(findAliasConflict('trez', cat.roles, 'president')?.id, 'tresorier');
  assert.equal(findAliasConflict('Président(e)', cat.roles, 'vice_president')?.id, 'president');
  assert.equal(findAliasConflict('Président(e)', cat.roles, 'president'), null, 'le rôle lui-même est ignoré');
  assert.equal(findAliasConflict('', cat.roles), null);

  assert.deepEqual(addAlias(['Prez'], ' VP  bureau '), { ok: true, list: ['Prez', 'VP bureau'] });
  assert.equal(addAlias(['Prez'], 'prez').ok, false);
  assert.equal(addAlias([], '   ').ok, false);
  assert.equal(addAlias(Array.from({ length: 20 }, (_, i) => `a${i}`), 'b').ok, false);
});

test('affinityEntries + memberDisplayName', () => {
  assert.deepEqual(affinityEntries({ InfoCOM: 1.4, GACO: 0.3, bad: 'x' }), [
    { name: 'InfoCOM', value: 1 }, { name: 'GACO', value: 0.3 },
  ]);
  assert.equal(memberDisplayName({ firstName: 'Lina', lastName: 'B' }), 'Lina B');
  assert.equal(memberDisplayName({}), 'Membre sans nom');
});
