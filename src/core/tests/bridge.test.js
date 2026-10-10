// Pont moteur → Kanban : calcul du diff et application réelle au store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installMemoryStorage } from './helpers.js';

installMemoryStorage();
const { useStore } = await import('../../store.js');
const { buildApplyDiff, applyDiffToStore, resolveColumnId } = await import('../bridge.js');
const st = () => useStore.getState();

const columns = [
  { id: 'direction', title: '🏛️ Bureau & Direction' },
  { id: 'com', title: '📣 Pôle Communication' },
  { id: 'transverse', title: '🧩 Membres transversaux' },
];

test('colonne cible : pôle par défaut, pôle personnalisé lié, repli transversal', () => {
  assert.equal(resolveColumnId(st().roles.president, columns), 'direction');
  assert.equal(resolveColumnId(st().roles.membre_communication, columns), 'com');
  const p = st().addPole({ label: 'Créatif' });
  const r = st().addRole({ label: 'Graphiste', pole: p.id, level: 'membre' });
  assert.equal(resolveColumnId(st().roles[r.id], columns), 'transverse', 'sans lien → transversal');
  st().updatePole(p.id, { columnId: 'com' });
  assert.equal(resolveColumnId(st().roles[r.id], columns), 'com', 'colonne configurée dans le pôle');
});

test('application d’un scénario : mise à jour, création, déplacement — en UNE étape annulable', () => {
  useStore.setState({
    columns,
    members: [
      { id: 'm1', firstName: 'Jade', lastName: 'Martin', email: 'jade@ex.fr', mainRole: 'membre_communication', badges: [], columnId: 'com' },
      { id: 'm2', firstName: 'Sam', lastName: 'Durand', email: 'sam@ex.fr', mainRole: 'membre_communication', badges: [], columnId: 'com' },
    ],
    _history: { past: [], future: [] },
  });
  const candidates = [
    { id: 'c1', firstName: 'Jade', lastName: 'Martin', email: 'jade@ex.fr' },
    { id: 'c2', firstName: 'Nina', lastName: 'Petit', email: 'nina@ex.fr' },
    { id: 'c3', firstName: 'Sam', lastName: 'Durand', email: 'sam@ex.fr' },
  ];
  const scenario = { assignments: [
    { candidateId: 'c1', slotId: 'president#1', roleId: 'president' },
    { candidateId: 'c2', slotId: 'membre_communication#1', roleId: 'membre_communication' },
    { candidateId: 'c3', slotId: null, roleId: null, score: null },
  ] };
  const diff = buildApplyDiff({ candidates, scenario, members: st().members, columns });
  assert.equal(diff.stats.updates, 1);
  assert.equal(diff.stats.creations, 1);
  assert.equal(diff.stats.unassigned, 1);

  const res = applyDiffToStore(useStore, diff);
  assert.deepEqual(res, { applied: 2, created: 1, skipped: 0, createdColumns: [] });
  const byName = Object.fromEntries(st().members.map(m => [m.firstName, m]));
  assert.equal(byName.Jade.mainRole, 'president');
  assert.equal(byName.Jade.columnId, 'direction');
  assert.equal(byName.Nina.mainRole, 'membre_communication');
  assert.equal(byName.Sam.columnId, 'transverse');
  assert.equal(st()._history.past.length, 1, 'une seule entrée d’historique');

  st().undo();
  assert.equal(st().members.length, 2);
  assert.equal(st().members.find(m => m.id === 'm1').mainRole, 'membre_communication');
});

test('homonymes : jamais de rapprochement sur le prénom seul s’il est ambigu', () => {
  useStore.setState({ members: [
    { id: 'a', firstName: 'Clarisse', lastName: 'A', email: '', mainRole: '', badges: [], columnId: 'com' },
    { id: 'b', firstName: 'Clarisse', lastName: 'B', email: '', mainRole: '', badges: [], columnId: 'com' },
  ] });
  const diff = buildApplyDiff({
    candidates: [{ id: 'c', firstName: 'Clarisse', lastName: 'Z', email: '' }],
    scenario: { assignments: [{ candidateId: 'c', slotId: 'president#1', roleId: 'president' }] },
    members: st().members, columns,
  });
  assert.equal(diff.stats.updates, 0, 'aucune des deux Clarisse ne doit être modifiée');
  assert.equal(diff.stats.creations, 1);
});

test('colonne manquante créée automatiquement', () => {
  useStore.setState({ columns: [{ id: 'transverse', title: 'Transversal' }], members: [] });
  const diff = buildApplyDiff({
    candidates: [{ id: 'c', firstName: 'Iris', lastName: 'Lune', email: 'iris@ex.fr' }],
    scenario: { assignments: [{ candidateId: 'c', slotId: 'president#1', roleId: 'president' }] },
    members: [], columns: st().columns,
  });
  const res = applyDiffToStore(useStore, diff, { createMissingColumns: true });
  assert.equal(res.created, 1);
  assert.equal(st().members[0].mainRole, 'president');
});
