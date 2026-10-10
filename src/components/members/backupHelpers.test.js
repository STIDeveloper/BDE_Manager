import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectBackup, buildFullBackup, backupSummaryLines, backupFileName } from './backupHelpers.js';

const valid = {
  app: 'bde-manager', version: 11, exportedAt: '2026-10-01T10:00:00.000Z',
  data: { members: [{ id: 'a' }, { id: 'b' }], columns: [{ id: 'c' }], roles: { president: {} }, vaultEntriesBlob: 'x' },
  rolesEngine: { version: 3, config: { weights: {} } },
};

test('backup valide : résumé complet', () => {
  const r = inspectBackup(valid, 11);
  assert.equal(r.ok, true);
  assert.equal(r.summary.members, 2);
  assert.equal(r.summary.columns, 1);
  assert.equal(r.summary.roles, 1);
  assert.equal(r.summary.hasVault, true);
  assert.equal(r.summary.hasEngine, true);
  assert.equal(r.summary.newerThanApp, false);
  assert.ok(r.summary.exportedAt instanceof Date);
  assert.equal(backupSummaryLines(r.summary).length, 6);
});

test('ancien backup (v1, sans app ni catalogue) accepté', () => {
  const r = inspectBackup({ version: 1, data: { members: [], columns: [] } }, 11);
  assert.equal(r.ok, true);
  assert.equal(r.summary.roles, null);
  assert.equal(r.summary.hasEngine, false);
  assert.equal(r.summary.exportedAt, null);
});

test('fichiers refusés avec un message clair', () => {
  assert.equal(inspectBackup(null).ok, false);
  assert.equal(inspectBackup([]).ok, false);
  assert.equal(inspectBackup({ app: 'autre', data: { members: [] } }).ok, false);
  assert.equal(inspectBackup({ foo: 1 }).ok, false);
  assert.equal(inspectBackup({ data: { foo: 1 } }).ok, false);
  const r = inspectBackup({ data: { members: 'x' } });
  assert.equal(r.ok, false);
  assert.match(r.error, /membres/);
});

test('version plus récente signalée', () => {
  assert.equal(inspectBackup({ ...valid, version: 99 }, 11).summary.newerThanApp, true);
});

test('buildFullBackup ajoute rolesEngine au premier niveau', () => {
  const out = buildFullBackup({ app: 'bde-manager', data: {} }, { config: {} });
  assert.deepEqual(out.rolesEngine, { config: {} });
  assert.equal('rolesEngine' in buildFullBackup({ data: {} }, null), false);
});

test('nom de fichier sans caractères interdits', () => {
  const name = backupFileName('BDE', new Date(2026, 0, 5, 9, 7));
  assert.equal(name, 'BDE_2026-01-05_09h07.json');
});
