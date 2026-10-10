// Studio documents côté store : profil de l'association, signatures,
// numérotation du registre (jamais réutilisée), sauvegarde/restauration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installMemoryStorage } from './helpers.js';

installMemoryStorage();
const { useStore } = await import('../../store.js');
const st = () => useStore.getState();
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('profil : valeurs par défaut, mise à jour, validation', () => {
  assert.equal(st().organization.legalForm, 'Association loi 1901');
  assert.equal(st().organization.agNoticeDays, 15);
  assert.equal(st().updateOrganization({ name: '  ' }).ok, false);
  assert.equal(st().updateOrganization({ logo: 'data:text/html;base64,PHNjcmlwdD4=' }).ok, false, 'type d’image refusé');
  assert.equal(st().updateOrganization({ logo: `data:image/png;base64,${'A'.repeat(500 * 1024)}` }).ok, false, 'image trop lourde refusée');
  assert.ok(st().updateOrganization({ name: 'BDE IUT de Montreuil', shortName: 'BDE-IUT', city: 'Montreuil', logo: PNG }).ok);
  assert.equal(st().organization.city, 'Montreuil');
  assert.equal(st().organization.logo, PNG);
  st().undo();
  assert.notEqual(st().organization.city, 'Montreuil', 'la modification du profil est annulable');
  st().redo();
});

test('signatures : ajout, suppression, validation', () => {
  assert.ok(st().setSignature('m1', PNG).ok);
  assert.equal(st().organization.signatures.m1, PNG);
  assert.equal(st().setSignature('m1', 'pas une image').ok, false);
  assert.ok(st().setSignature('m1', null).ok);
  assert.equal(st().organization.signatures.m1, undefined);
});

test('numérotation : séquentielle par année, préfixe issu du sigle', () => {
  const refs = st().reserveDocumentRefs(3, 2026);
  assert.deepEqual(refs, ['BDEIUT-2026-0001', 'BDEIUT-2026-0002', 'BDEIUT-2026-0003']);
  assert.deepEqual(st().reserveDocumentRefs(1, 2027), ['BDEIUT-2027-0001'], 'compteur indépendant par année');
});

test('registre : un numéro n’est jamais réutilisé, même après suppression', () => {
  const [ref] = st().reserveDocumentRefs(1, 2026);
  const [entry] = st().logDocuments([{ ref, templateId: 'attestation-adhesion', title: 'Attestation', memberIds: ['m1'], fingerprint: 'AAAA-BBBB-CCCC' }]);
  assert.ok(entry.id && entry.createdAt);
  assert.equal(st().documentLog[0].ref, 'BDEIUT-2026-0004');
  st().removeDocumentLogEntry(entry.id);
  assert.equal(st().documentLog.length, 0);
  assert.deepEqual(st().reserveDocumentRefs(1, 2026), ['BDEIUT-2026-0005']);
});

test('sauvegarde : profil et registre exportés puis restaurés ; compteurs jamais en recul', () => {
  st().logDocuments([{ ref: 'BDEIUT-2026-0005', templateId: 'pv-ag', title: 'PV', memberIds: [] }]);
  const backup = JSON.parse(JSON.stringify(st().exportAllData()));
  assert.equal(backup.data.organization.name, 'BDE IUT de Montreuil');
  assert.equal(backup.data.documentLog.length, 1);
  assert.equal(backup.data.documentCounters[2026], 5);

  st().reserveDocumentRefs(10, 2026); // le compteur local avance à 15
  st().importAllData(backup);         // backup plus ancien : compteur à 5
  assert.equal(st().organization.name, 'BDE IUT de Montreuil');
  assert.equal(st().documentLog[0].ref, 'BDEIUT-2026-0005');
  assert.deepEqual(st().reserveDocumentRefs(1, 2026), ['BDEIUT-2026-0016'], 'pas de doublon de numéro après import');
});

test('ancien backup sans profil : valeurs par défaut', () => {
  st().importAllData({ version: 10, data: { members: [], columns: [] } });
  assert.equal(st().organization.legalForm, 'Association loi 1901');
  assert.ok(Array.isArray(st().documentLog));
});
