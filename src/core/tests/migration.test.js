// Migration réelle v10 → v11 via le middleware persist (localStorage simulé).
// Chaque fichier de test tourne dans son propre processus Node : l'état
// initial du stockage est installé avant l'import du store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installMemoryStorage, flush } from './helpers.js';

const V10_STATE = {
  theme: 'light',
  columns: [{ id: 'direction', title: 'Bureau' }, { id: 'com', title: 'Com' }],
  members: [
    { id: 'm1', firstName: 'Kenzo', lastName: '', mainRole: 'Président', badges: ['Accès Banque'], columnId: 'direction', notes: '' },
    { id: 'm2', firstName: 'Ana', lastName: 'B', mainRole: 'Vice-Présidente', badges: [], columnId: 'direction', notes: '' },
    { id: 'm3', firstName: 'Albane', lastName: '', mainRole: 'Respo Com Interne', badges: [], columnId: 'com', notes: '' },
    { id: 'm4', firstName: 'Zoé', lastName: '', mainRole: 'Respo E-Sport', badges: [], columnId: 'com', notes: '' },
    { id: 'm5', firstName: 'Max', lastName: '', mainRole: 'DJ officiel', badges: ['DJ'], columnId: 'com', notes: 'texte libre conservé' },
    { id: 'm6', firstName: 'Tom', lastName: '', mainRole: 'tresorier', badges: [], columnId: 'direction', notes: '' },
  ],
  drivePermissions: { m1: { f00: 'editor' }, m3: { f01: 'reader' } },
  permissionNotes: { m1: { f00: 'accès banque' } },
  rolePresets: {
    president: { f00: 'editor' },
    'Respo Insta': { 'f01.3.1': 'editor' },
    'Respo TikTok': { 'f01.3.2': 'editor' },
    'Preset maison': { f04: 'reader' },
  },
  folders: [{ id: 'f00', code: '00', name: 'Bureau', parent: null, color: 'red', tags: [] }],
  folderTags: [],
  vaultSalt: 'c2FsdA==', vaultVerifier: { iv: 'aXY=', ct: 'Y3Q=' }, vaultEntriesBlob: { iv: 'aXY=', ct: 'Y3Q=' },
  _migrationVersion: 3,
};

const storage = installMemoryStorage({
  'bde-storage': JSON.stringify({ state: V10_STATE, version: 10 }),
  'bde-roles-storage': JSON.stringify({ state: { capacities: { membre_communication: 7, president: 1 }, weights: { P: 0.4 } }, version: 3 }),
});

const { useStore } = await import('../../store.js');
const { useRolesStore } = await import('../../roleEngine/store.js');
const { getActiveCatalog } = await import('../catalog.js');
await flush(10);

test('le catalogue par défaut est créé à la migration', () => {
  const s = useStore.getState();
  assert.equal(Object.keys(s.roles).length, 17);
  assert.equal(Object.keys(s.poles).length, 9);
  assert.equal(Object.keys(s.levels).length, 4);
  assert.equal(getActiveCatalog().roles.president.label, 'Président(e)');
});

test('les capacités personnalisées de l\'ancien moteur sont reprises', () => {
  assert.equal(useStore.getState().roles.membre_communication.capacity, 7);
  assert.equal(useRolesStore.getState().capacities.membre_communication, 7);
});

test('rôles des membres : libellés → ids, ancien libellé conservé', () => {
  const byId = Object.fromEntries(useStore.getState().members.map(m => [m.id, m]));
  assert.equal(byId.m1.mainRole, 'president');
  assert.equal(byId.m1.legacyMainRole, 'Président');
  assert.equal(byId.m2.mainRole, 'vice_president', 'Vice-Présidente ne doit pas devenir présidente');
  assert.equal(byId.m3.mainRole, 'responsable_communication_interne');
  assert.equal(byId.m4.mainRole, 'responsable_esport', 'E-Sport ne doit pas devenir Sport');
  assert.equal(byId.m5.mainRole, 'DJ officiel', 'un texte non reconnu est conservé tel quel');
  assert.equal(byId.m6.mainRole, 'tresorier');
  assert.equal(byId.m6.legacyMainRole, undefined);
});

test('aucune donnée perdue : permissions, notes, coffre, thème, colonnes', () => {
  const s = useStore.getState();
  assert.deepEqual(s.drivePermissions, V10_STATE.drivePermissions);
  assert.deepEqual(s.permissionNotes, V10_STATE.permissionNotes);
  assert.equal(s.vaultSalt, V10_STATE.vaultSalt);
  assert.deepEqual(s.vaultEntriesBlob, V10_STATE.vaultEntriesBlob);
  assert.equal(s.theme, 'light');
  assert.deepEqual(s.columns, V10_STATE.columns);
  assert.equal(s.members.length, 6);
});

test('presets : conversion sans perte (collisions et clés inconnues conservées)', () => {
  const p = useStore.getState().rolePresets;
  assert.deepEqual(p.president, { f00: 'editor' });
  // « Respo Insta » → membre_communication ; « Respo TikTok » entre en collision → conservé sous son nom.
  assert.deepEqual(p.membre_communication, { 'f01.3.1': 'editor' });
  assert.deepEqual(p['Respo TikTok'], { 'f01.3.2': 'editor' });
  assert.deepEqual(p['Preset maison'], { f04: 'reader' });
});

test('l\'état migré est réécrit dans le stockage en version 11', async () => {
  useStore.getState().toggleTheme();
  useStore.getState().toggleTheme();
  await flush(5);
  const saved = JSON.parse(storage.getItem('bde-storage'));
  assert.equal(saved.version, 11);
  assert.equal(saved.state.members.find(m => m.id === 'm2').mainRole, 'vice_president');
  assert.ok(saved.state.roles.president);
  assert.equal(saved.state._migrationVersion, undefined);
  assert.equal(saved.state._history, undefined, 'l\'historique n\'est pas persisté');
});

test('le store du moteur passe en v4 sans capacités persistées', async () => {
  useRolesStore.getState().setMinScore(50);
  await flush(5);
  const saved = JSON.parse(storage.getItem('bde-roles-storage'));
  assert.equal(saved.version, 4);
  assert.equal(saved.state.capacities, undefined);
  assert.equal(saved.state.minScore, 50);
});
