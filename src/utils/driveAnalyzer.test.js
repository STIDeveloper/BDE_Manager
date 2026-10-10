// Tests de l'analyseur Drive avec un catalogue personnalisé (node:test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCatalog } from '../core/catalog.js';
import { analyzeDriveState } from './driveAnalyzer.js';
import {
  resolveMemberRole, isBureauMember, memberPoleId, matchFolderPole, memberRoleText,
} from './memberRoles.js';

function customCatalog() {
  const cat = createDefaultCatalog();
  cat.poles.creatif = { id: 'creatif', label: 'Créatif', short: 'Créa', color: 'pink', emoji: '🎨', order: 9, affinity: {} };
  cat.roles.responsable_design = {
    id: 'responsable_design', label: 'Responsable Design', level: 'responsable', pole: 'creatif',
    leadership: true, essential: false, capacity: 1, order: 0, aliases: [],
  };
  // Rôle renommé : l'id reste, seul le libellé change.
  cat.roles.president = { ...cat.roles.president, label: 'Présidence' };
  return cat;
}

const FOLDERS = [
  { id: 'f00', code: '00', name: 'Bureau & Stratégie', parent: null, tags: ['confidential'] },
  { id: 'f00.2', code: '00.2', name: 'Trésorerie & Budget', parent: 'f00', tags: ['confidential'] },
  { id: 'f01', code: '01', name: 'Pôle Communication', parent: null, tags: [] },
  { id: 'f05', code: '05', name: 'Pôle Créatif', parent: null, tags: [] },
  { id: 'f05.1', code: '05.1', name: 'Maquettes', parent: 'f05', tags: [] },
];

const byRule = (alerts, ruleId) => alerts.filter(a => a.ruleId === ruleId);

test('rôles personnalisés : pôle et libellé issus du catalogue', () => {
  const cat = customCatalog();
  const designer = { id: 'd', firstName: 'Dana', mainRole: 'responsable_design' };
  assert.equal(resolveMemberRole(designer, cat).id, 'responsable_design');
  assert.equal(memberPoleId(designer, cat), 'creatif');
  assert.equal(memberRoleText(designer, cat), 'Responsable Design');
  assert.equal(isBureauMember(designer, cat), false);
  assert.equal(matchFolderPole(FOLDERS[3], cat), 'creatif');
  assert.equal(matchFolderPole(FOLDERS[2], cat), 'communication');
  assert.equal(matchFolderPole({ name: 'Pôle Partenariat' }, cat), 'partenariats');
  assert.equal(matchFolderPole({ name: 'Logistique' }, cat), null);
});

test('éditeur hors pôle : un Responsable Design sur Communication est signalé, pas sur Créatif', () => {
  const cat = customCatalog();
  const members = [{ id: 'd', firstName: 'Dana', lastName: 'K', mainRole: 'responsable_design' }];
  const drivePermissions = { d: { f01: 'editor', f05: 'editor', 'f05.1': 'editor' } };
  const alerts = analyzeDriveState({ members, folders: FOLDERS, drivePermissions, rolePresets: {} }, cat);
  const out = byRule(alerts, 'editor-out-of-pole');
  assert.deepEqual(out.map(a => a.folderId), ['f01']);
  assert.match(out[0].description, /Responsable Design/);
});

test('éditeur hors pôle : ignoré si le preset du rôle le prévoit explicitement', () => {
  const cat = customCatalog();
  const members = [{ id: 'd', firstName: 'Dana', mainRole: 'responsable_design' }];
  const alerts = analyzeDriveState({
    members, folders: FOLDERS,
    drivePermissions: { d: { f01: 'editor' } },
    rolePresets: { responsable_design: { f01: 'editor' } },
  }, cat);
  assert.equal(byRule(alerts, 'editor-out-of-pole').length, 0);
});

test('bureau = niveau « bureau » du catalogue (libellé renommé affiché)', () => {
  const cat = customCatalog();
  const members = [
    { id: 'p', firstName: 'Paul', mainRole: 'president' },
    { id: 'd', firstName: 'Dana', mainRole: 'responsable_design' },
  ];
  const drivePermissions = { p: { f00: 'editor' }, d: { f00: 'editor' } };
  const alerts = analyzeDriveState({ members, folders: FOLDERS, drivePermissions, rolePresets: {} }, cat);
  const conf = byRule(alerts, 'confidential-non-bureau');
  assert.deepEqual(conf.map(a => a.memberId), ['d']);

  // Le libellé renommé apparaît dans les descriptions.
  const noPerm = analyzeDriveState({
    members: [{ id: 'p', firstName: 'Paul', mainRole: 'president' }],
    folders: FOLDERS, drivePermissions: {}, rolePresets: {},
  }, cat);
  assert.match(byRule(noPerm, 'member-no-permissions')[0].description, /Présidence/);
});

test('rôles libres hérités : catégorisés via resolveRoleId', () => {
  const cat = customCatalog();
  const legacyPres = { id: 'l1', firstName: 'Léa', mainRole: 'Président' };
  const legacyCom = { id: 'l2', firstName: 'Tom', mainRole: 'Respo Com' };
  const unknown = { id: 'l3', firstName: 'Max', mainRole: 'DJ officiel' };
  assert.equal(isBureauMember(legacyPres, cat), true);
  assert.equal(memberPoleId(legacyCom, cat), 'communication');
  assert.equal(resolveMemberRole(unknown, cat), null);

  const alerts = analyzeDriveState({
    members: [legacyPres, legacyCom, unknown],
    folders: FOLDERS,
    drivePermissions: { l1: { f00: 'editor' }, l2: { f05: 'editor' }, l3: { f01: 'reader' } },
    rolePresets: {},
  }, cat);
  assert.equal(byRule(alerts, 'confidential-non-bureau').length, 0, 'un Président hérité est du Bureau');
  assert.deepEqual(byRule(alerts, 'editor-out-of-pole').map(a => a.memberId), ['l2']);
  assert.deepEqual(byRule(alerts, 'member-unknown-role').map(a => a.memberId), ['l3']);
});

test('règles par dossier / par membre : une seule alerte, pas une par cellule', () => {
  const cat = customCatalog();
  const members = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, firstName: id.toUpperCase(), mainRole: 'membre_communication' }));
  const drivePermissions = Object.fromEntries(members.map(m => [m.id, { f00: 'editor', 'f00.2': 'reader' }]));
  const alerts = analyzeDriveState({ members, folders: FOLDERS, drivePermissions, rolePresets: {} }, cat);
  assert.equal(byRule(alerts, 'confidential-editor-too-many').length, 1);
  assert.equal(byRule(alerts, 'tresorerie-too-open').length, 1);
  const ids = alerts.map(a => a.id);
  assert.equal(new Set(ids).size, ids.length, 'identifiants uniques');
  // Tri par gravité
  const order = { danger: 0, warning: 1, info: 2 };
  for (let i = 1; i < alerts.length; i++) {
    assert.ok(order[alerts[i - 1].severity] <= order[alerts[i].severity]);
  }
});

test('gouvernance : colonnes dérivées du catalogue (pôle personnalisé, libre hérité, hors catalogue)', async () => {
  const { buildGovernanceCategories } = await import('./governance.js');
  const cat = customCatalog();
  const cats = buildGovernanceCategories([
    { id: 'p', firstName: 'Paul', mainRole: 'president' },
    { id: 'd', firstName: 'Dana', mainRole: 'responsable_design' },
    { id: 'c', firstName: 'Cléo', mainRole: 'Respo Com' },
    { id: 'm', firstName: 'Mia', mainRole: 'membre_projets' },
    { id: 'x', firstName: 'Max', mainRole: 'DJ officiel' },
  ], cat);
  const ids = Object.fromEntries(cats.map(c => [c.id, c.members.map(m => m.id)]));
  assert.deepEqual(ids, {
    'kind:bureau': ['p'],
    'lead:communication': ['c'],
    'lead:creatif': ['d'],
    'kind:others': ['m'],
    unknown: ['x'],
  });
  assert.equal(cats.find(c => c.id === 'lead:creatif').label, '🎨 Encadrement Créatif');
});

test('recommandations : générées depuis les données réelles, sans contenu inventé', async () => {
  const { buildRecommendations } = await import('./recommendations.js');
  const cat = customCatalog();
  const recos = buildRecommendations({
    members: [
      { id: 'd', firstName: 'Dana', mainRole: 'responsable_design' },
      { id: 'n', firstName: 'Nora', mainRole: '' },
      { id: 'x', firstName: 'Max', mainRole: 'DJ officiel' },
    ],
    folders: FOLDERS,
    drivePermissions: { d: { f01: 'reader' } },
    rolePresets: { responsable_design: { f05: 'editor' } },
  }, cat);
  const byId = Object.fromEntries(recos.map(r => [r.id, r]));
  assert.ok(byId['essential-vacant'].items.some(i => i.startsWith('Présidence')));
  assert.ok(!byId['pole-leaderless'].items.some(i => i.includes('Créatif')), 'Créatif a un responsable');
  assert.deepEqual(byId['members-no-role'].items, ['Nora']);
  assert.match(byId['members-unknown-role'].items[0], /Max/);
  assert.match(byId['drive-outside-preset'].items[0], /Dana \(Responsable Design\) : 01/);
  const names = JSON.stringify(recos);
  for (const fake of ['Adrien', 'Maxence', 'Capucine']) assert.ok(!names.includes(fake));
});
