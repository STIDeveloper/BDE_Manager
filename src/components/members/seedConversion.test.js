// Conversion du seed BDE (libellés historiques → ids du catalogue).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCatalog } from '../../core/catalog.js';
import { BDE_MEMBERS, BDE_ROLE_PERMISSIONS, BDE_NEW_PRESETS, bdeSeedSummary } from '../../data/bdeSeed.js';
import { buildConvertedBDEConfig, convertSeedPresets } from './seedConversion.js';

const catalog = createDefaultCatalog();

test('les membres du seed reçoivent des ids du catalogue', () => {
  const { members } = buildConvertedBDEConfig(catalog);
  const byId = Object.fromEntries(members.map(m => [m.id, m]));
  assert.equal(byId.bde_kenzo.mainRole, 'president');
  assert.equal(byId.bde_kenzo.legacyMainRole, 'Président');
  assert.equal(byId.bde_albane.mainRole, 'responsable_communication_interne');
  assert.equal(byId.bde_vp.mainRole, 'vice_president');
  assert.equal(byId.bde_bilal.mainRole, 'tresorier');
  assert.equal(byId.bde_sophia.mainRole, 'responsable_partenariats');
  // Tous les libellés du seed sont résolus avec le catalogue par défaut.
  members.forEach(m => assert.ok(catalog.roles[m.mainRole], `${m.firstName} : ${m.mainRole}`));
  assert.equal(members.length, BDE_MEMBERS.length);
});

test('le seed d\'origine n\'est pas muté', () => {
  buildConvertedBDEConfig(catalog);
  assert.equal(BDE_MEMBERS[0].mainRole, 'Président');
  assert.equal(BDE_MEMBERS[0].legacyMainRole, undefined);
});

test('les permissions individuelles gardent le preset du libellé d\'origine', () => {
  const { drivePermissions } = buildConvertedBDEConfig(catalog);
  assert.deepEqual(drivePermissions.bde_ilona, BDE_ROLE_PERMISSIONS['Respo TikTok']);
  assert.deepEqual(drivePermissions.bde_clarisse_insta, BDE_ROLE_PERMISSIONS['Respo Insta']);
});

test('aucune clé de preset n\'est perdue (collisions conservées)', () => {
  const out = convertSeedPresets(BDE_ROLE_PERMISSIONS, catalog);
  assert.equal(Object.keys(out).length, Object.keys(BDE_ROLE_PERMISSIONS).length);
  const values = new Set(Object.values(out));
  Object.values(BDE_ROLE_PERMISSIONS).forEach(v => assert.ok(values.has(v)));
  assert.ok(out.president && out.vice_president && out.responsable_communication_interne);
});

test('presets officiels ajoutés : tous indexés par id', () => {
  const { rolePresets } = buildConvertedBDEConfig(catalog);
  assert.equal(Object.keys(rolePresets).length, Object.keys(BDE_NEW_PRESETS).length);
  Object.keys(rolePresets).forEach(k => assert.ok(catalog.roles[k], k));
});

test('rôle personnalisé : un libellé inconnu est conservé tel quel', () => {
  const cat = createDefaultCatalog();
  delete cat.roles.tresorier;
  const { members } = buildConvertedBDEConfig(cat);
  assert.equal(members.find(m => m.id === 'bde_bilal').mainRole, 'Trésorier');
});

test('résumé du seed calculé depuis les tableaux', () => {
  const s = bdeSeedSummary();
  assert.equal(s.members + s.vacancies, BDE_MEMBERS.length);
  assert.equal(s.columns, 5);
  assert.equal(s.vacancies, 1);
});
