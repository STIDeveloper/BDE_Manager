// CRUD du catalogue, effets des suppressions, backup/restauration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installMemoryStorage, flush } from './helpers.js';

installMemoryStorage();
const { useStore } = await import('../../store.js');
const { useRolesStore } = await import('../../roleEngine/store.js');
const { getActiveCatalog, validateCatalog, createDefaultCatalog } = await import('../catalog.js');
const st = () => useStore.getState();

test('scénario du cahier des charges : pôle Créatif + Responsable Design (capacité 2)', () => {
  const p = st().addPole({ label: 'Créatif', emoji: '🎨', color: 'pink' });
  assert.ok(p.ok);
  const r = st().addRole({ label: 'Responsable Design', pole: p.id, level: 'responsable', capacity: 2, leadership: true });
  assert.ok(r.ok);
  const role = st().roles[r.id];
  assert.equal(role.pole, 'creatif');
  assert.equal(role.capacity, 2);
  assert.equal(getActiveCatalog().roles[r.id].label, 'Responsable Design', 'le moteur voit le rôle immédiatement');
  assert.equal(useRolesStore.getState().capacities[r.id], 2, 'le miroir des capacités du moteur suit');
  assert.deepEqual(validateCatalog(st()), []);
});

test('validation : libellés vides ou dupliqués refusés, références invalides refusées', () => {
  assert.equal(st().addRole({ label: 'Président(e)' }).ok, false);
  assert.equal(st().updateRole('president', { label: '   ' }).ok, false);
  assert.equal(st().updateRole('president', { pole: 'nexistepas' }).ok, false);
  assert.equal(st().updateRole('president', { level: 'nexistepas' }).ok, false);
  assert.equal(st().addPole({ label: 'Bureau' }).ok, false);
  assert.equal(st().updateRole('president', { capacity: 500 }).ok, true);
  assert.equal(st().roles.president.capacity, 99, 'capacité bornée');
  st().setRoleCapacity('president', -3);
  assert.equal(st().roles.president.capacity, 0);
  st().setRoleCapacity('president', 1);
});

test('renommer un rôle conserve id, preset Drive et membres', () => {
  const id = st().addMember({ firstName: 'Jade', mainRole: 'tresorier', columnId: 'direction' });
  const presetBefore = st().rolePresets.tresorier;
  assert.ok(st().updateRole('tresorier', { label: 'Trésorerie générale' }).ok);
  assert.equal(st().roles.tresorier.label, 'Trésorerie générale');
  assert.equal(st().rolePresets.tresorier, presetBefore);
  assert.equal(st().members.find(m => m.id === id).mainRole, 'tresorier');
});

test('supprimer un pôle ou un niveau utilisé est refusé avec un message clair', () => {
  const res = st().deletePole('bureau');
  assert.equal(res.ok, false);
  assert.match(res.error, /rôles? (sont rattachés|est rattaché)/);
  const lvl = st().deleteLevel('membre');
  assert.equal(lvl.ok, false);
  assert.match(lvl.error, /utilise/);
});

test('supprimer un pôle vide et un niveau inutilisé fonctionne', () => {
  assert.ok(st().deletePole('event').ok);
  assert.equal(st().poles.event, undefined);
  const l = st().addLevel({ label: 'Stagiaire', kind: 'membre', requirement: 0.2 });
  assert.ok(l.ok);
  assert.ok(st().deleteLevel(l.id).ok);
});

test('supprimer un rôle : réaffectation des membres, preset supprimé, contraintes purgées', async () => {
  const m1 = st().addMember({ firstName: 'Ana', mainRole: 'membre_sport', columnId: 'event' });
  const m2 = st().addMember({ firstName: 'Bob', mainRole: 'membre_sport', columnId: 'event' });
  useRolesStore.getState().updateForcedRole('ana', 'membre_sport');
  useRolesStore.setState({ lockedPairs: ['c1:membre_sport#1', 'c2:president#1'] });
  const res = st().deleteRole('membre_sport', { reassignTo: 'membre_projets' });
  assert.deepEqual(res, { ok: true, affectedMembers: 2 });
  assert.equal(st().roles.membre_sport, undefined);
  assert.equal(st().rolePresets.membre_sport, undefined);
  assert.equal(st().members.find(m => m.id === m1).mainRole, 'membre_projets');
  assert.equal(st().members.find(m => m.id === m2).mainRole, 'membre_projets');
  await flush(5);
  assert.equal(useRolesStore.getState().constraints.forcedRoles.ana, undefined);
  assert.deepEqual(useRolesStore.getState().lockedPairs, ['c2:president#1']);
});

test('supprimer un rôle sans réaffectation : ancien libellé conservé', () => {
  const m = st().addMember({ firstName: 'Cléo', mainRole: 'membre_esport', columnId: 'event' });
  assert.ok(st().deleteRole('membre_esport').ok);
  const member = st().members.find(x => x.id === m);
  assert.equal(member.mainRole, '');
  assert.equal(member.legacyMainRole, 'Membre E-Sport');
});

test('undo restaure un rôle supprimé et ses membres', () => {
  const m = st().addMember({ firstName: 'Dan', mainRole: 'membre_partenariats', columnId: 'part' });
  st().deleteRole('membre_partenariats');
  st().undo();
  assert.ok(st().roles.membre_partenariats);
  assert.equal(st().members.find(x => x.id === m).mainRole, 'membre_partenariats');
  st().redo();
  assert.equal(st().roles.membre_partenariats, undefined);
});

test('dupliquer copie le rôle et son preset en un seul pas d\'annulation', () => {
  const before = st()._history.past.length;
  const res = st().duplicateRole('president');
  assert.ok(res.ok);
  assert.equal(st().roles[res.id].label, 'Président(e) (copie)');
  assert.equal(st().roles[res.id].aliases.length, 0);
  assert.deepEqual(st().rolePresets[res.id], st().rolePresets.president);
  assert.equal(st()._history.past.length, before + 1);
  st().undo();
  assert.equal(st().roles[res.id], undefined);
  assert.equal(st().rolePresets[res.id], undefined);
});

test('réordonner les rôles d\'un pôle et les pôles', () => {
  const bureauIds = () => Object.values(st().roles).filter(r => r.pole === 'bureau').sort((a, b) => a.order - b.order).map(r => r.id);
  assert.equal(bureauIds()[0], 'president');
  st().moveRole('president', +1);
  assert.equal(bureauIds()[1], 'president');
  st().movePole('communication', -1);
  const poles = Object.values(st().poles).sort((a, b) => a.order - b.order).map(p => p.id);
  assert.equal(poles[0], 'communication');
});

test('export / import / reset du catalogue', () => {
  const exported = st().exportCatalog();
  assert.equal(exported.kind, 'bde-manager/catalog');
  const m = st().addMember({ firstName: 'Eve', mainRole: 'responsable_design', columnId: 'direction' });
  const res = st().resetCatalog();
  assert.ok(res.ok);
  assert.equal(res.detachedMembers >= 1, true);
  assert.equal(st().roles.responsable_design, undefined);
  assert.equal(st().members.find(x => x.id === m).legacyMainRole, 'Responsable Design');
  const back = st().replaceCatalog(JSON.parse(JSON.stringify(exported)));
  assert.ok(back.ok);
  assert.ok(st().roles.responsable_design);
  assert.equal(st().replaceCatalog({ foo: 1 }).ok, false);
});

test('backup complet : export puis import restaure tout (aller-retour)', () => {
  const snapshot = st().exportAllData();
  assert.equal(snapshot.version, 11);
  assert.ok(snapshot.data.roles && snapshot.data.poles && snapshot.data.levels);
  st().addMember({ firstName: 'Intrus', mainRole: '', columnId: 'direction' });
  st().importAllData(JSON.parse(JSON.stringify(snapshot)));
  assert.deepEqual(st().members, snapshot.data.members);
  assert.deepEqual(st().roles, snapshot.data.roles);
  assert.deepEqual(st().rolePresets, snapshot.data.rolePresets);
});

test('import d\'un ancien backup v10 (libellés) : migré vers les ids', () => {
  st().importAllData({
    version: 10,
    data: {
      members: [{ id: 'x1', firstName: 'Old', mainRole: 'Respo Partenariat', badges: [], columnId: 'part' }],
      columns: [{ id: 'part', title: 'Partenariat' }],
      rolePresets: { 'Respo Partenariat': { f03: 'editor' } },
    },
  });
  assert.equal(st().members[0].mainRole, 'responsable_partenariats');
  assert.deepEqual(st().rolePresets.responsable_partenariats, { f03: 'editor' });
  assert.equal(Object.keys(st().roles).length, Object.keys(createDefaultCatalog().roles).length);
});

test('import invalide refusé sans modifier les données', () => {
  const before = st().members;
  assert.throws(() => st().importAllData({ nope: true }), /Format invalide/);
  assert.throws(() => st().importAllData({ data: { members: 'abc' } }), /members/);
  assert.equal(st().members, before);
});

test('supprimer une colonne : déplacement des membres ou suppression complète', () => {
  st().importAllData({ version: 11, data: {
    columns: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }],
    members: [{ id: 'm1', firstName: 'A1', mainRole: '', badges: [], columnId: 'a' }],
    drivePermissions: { m1: { f00: 'reader' } },
  } });
  st().deleteColumn('a', { moveMembersTo: 'b' });
  assert.equal(st().members[0].columnId, 'b');
  st().deleteColumn('b');
  assert.equal(st().members.length, 0);
  assert.deepEqual(st().drivePermissions, {}, 'les permissions des membres supprimés sont nettoyées');
  st().undo();
  assert.equal(st().members.length, 1);
});

test('dossiers : un cycle parent/enfant est refusé', () => {
  st().importAllData({ version: 11, data: {
    folders: [
      { id: 'p', code: '01', name: 'P', parent: null, color: 'zinc', tags: [] },
      { id: 'c', code: '01.1', name: 'C', parent: 'p', color: 'zinc', tags: [] },
    ],
  } });
  assert.equal(st().updateFolder('p', { parent: 'c' }), false);
  assert.equal(st().updateFolder('p', { parent: 'p' }), false);
  assert.equal(st().updateFolder('c', { name: 'Renommé' }), true);
});

test('un rôle créé APRÈS l’import CSV est reconnu dans les choix des candidats', async () => {
  const header = '"Horodateur","Prénom et NOM","Téléphone","Email","Formation","Alternance","Année","1er choix","2e choix","3e choix","Pourquoi","Rôle à découvrir","Apporter","Rythme","Couteau suisse"';
  const row = '"2026/09/27 6:57:16 PM UTC+3","Zoé MARTIN","0600000009","zoe@test.fr","InfoCOM","Non","BUT 2","Graphiste en chef","Membre Projets","","Je dessine depuis toujours","","","🚀 Dispo et réactif tous les jours","🔥 Carrément"';
  const res = useRolesStore.getState().importCsv(`${header}
${row}`);
  assert.equal(res.candidates.length, 1);
  const before = useRolesStore.getState().candidates[0];
  assert.deepEqual(before.choices, ['membre_projets'], 'rôle inconnu ignoré à l’import');
  assert.ok(st().addRole({ label: 'Graphiste en chef', pole: 'communication', level: 'membre', capacity: 1 }).ok);
  await flush(5);
  assert.deepEqual(useRolesStore.getState().candidates[0].choices, ['graphiste_en_chef', 'membre_projets']);
  await flush(200);
  const custom = useRolesStore.getState().scenarios[0];
  assert.ok(custom.assignments.some(a => a.roleId === 'graphiste_en_chef'), 'le recalcul place des candidats sur le nouveau rôle');
});
