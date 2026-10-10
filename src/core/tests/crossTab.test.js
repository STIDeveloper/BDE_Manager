// Synchronisation entre onglets : un changement venu d'un autre onglet est
// appliqué SANS être réécrit (sinon l'onglet pourrait écraser une écriture
// plus récente de l'autre onglet).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installMemoryStorage, flush } from './helpers.js';

const storage = installMemoryStorage();
// Fenêtre minimale (Node) capable de recevoir l'événement `storage`.
globalThis.window = new EventTarget();
const emitStorage = (key, newValue) => {
  const ev = new Event('storage');
  Object.assign(ev, { key, newValue, storageArea: storage });
  window.dispatchEvent(ev);
};

const { useStore } = await import('../../store.js');
const { getActiveCatalog } = await import('../catalog.js');
await flush(5);

test('un rôle créé dans un autre onglet apparaît ici, sans réécriture', async () => {
  useStore.getState().addMember({ firstName: 'Local', mainRole: '', columnId: 'direction' });
  useStore.getState().undo(); // crée un historique local
  await flush(5);

  // L'« autre onglet » écrit une version contenant un nouveau rôle.
  const other = JSON.parse(storage.getItem('bde-storage'));
  other.state.roles.tresorier_adjoint = { ...other.state.roles.tresorier, id: 'tresorier_adjoint', label: 'Trésorier adjoint' };
  const otherRaw = JSON.stringify(other);
  storage.setItem('bde-storage', otherRaw);

  let writes = 0;
  const original = storage.setItem;
  storage.setItem = (k, v) => { writes++; original(k, v); };
  emitStorage('bde-storage', otherRaw);
  await flush(5);
  storage.setItem = original;

  assert.equal(useStore.getState().roles.tresorier_adjoint?.label, 'Trésorier adjoint');
  assert.ok(getActiveCatalog().roles.tresorier_adjoint, 'le moteur voit aussi le nouveau rôle');
  assert.equal(writes, 0, 'aucune réécriture pendant l’application du changement externe');
  assert.equal(storage.getItem('bde-storage'), otherRaw, 'la version de l’autre onglet est intacte');
  assert.equal(useStore.getState()._history.past.length, 0, 'historique local vidé');
});

test('après synchronisation, les écritures locales reprennent normalement', async () => {
  const res = useStore.getState().addPole({ label: 'Après synchro' });
  assert.ok(res.ok);
  await flush(5);
  const saved = JSON.parse(storage.getItem('bde-storage'));
  assert.ok(saved.state.poles[res.id]);
  assert.ok(saved.state.roles.tresorier_adjoint, 'le rôle reçu est conservé dans l’écriture suivante');
});

test('un événement pour une autre clé est ignoré', async () => {
  const before = useStore.getState().roles;
  emitStorage('autre-cle', '{}');
  await flush(5);
  assert.equal(useStore.getState().roles, before);
});
