// Tests des utilitaires purs (IBAN, lignes chiffrées, pôles, Drive).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkIban, ibanMod97, formatIban, normalizeIban, parseAmount, splitLineDate, normalizeLines,
  sumLines, lineWarnings, ageAt, academicYearEnd, poleDriveAccess, polesBureauFirst,
  membersWithoutCatalogRole, membersWithDrivePermissions, issuedSince,
} from './orgPart_helpers.js';
import { fullContext } from './orgPart_fixtures.js';

test('IBAN : IBAN valides (FR, DE, GB) acceptés, espaces et minuscules tolérés', () => {
  for (const iban of ['FR76 3000 6000 0112 3456 7890 189', 'de89 3704 0044 0532 0130 00', 'GB82-WEST-1234-5698-7654-32']) {
    const r = checkIban(iban);
    assert.equal(r.valid, true, `${iban} : ${r.error}`);
    assert.equal(ibanMod97(iban), 1);
  }
  assert.equal(normalizeIban(' fr76 3000 6000 0112 3456 7890 189 '), 'FR7630006000011234567890189');
  assert.equal(formatIban('FR7630006000011234567890189'), 'FR76 3000 6000 0112 3456 7890 189');
});

test('IBAN : clé, longueur et format invalides détectés avec un message explicite', () => {
  const badKey = checkIban('FR76 3000 6000 0112 3456 7890 188');
  assert.equal(badKey.valid, false);
  assert.match(badKey.error, /Clé de contrôle/);
  const badLength = checkIban('FR76 3000 6000 0112 3456 7890 18');
  assert.equal(badLength.valid, false);
  assert.match(badLength.error, /27 caractères/);
  assert.match(checkIban('1234').error, /Format/);
  assert.equal(checkIban('').valid, false);
  assert.equal(checkIban(undefined).valid, false);
});

test('Montants : virgule, espaces et symbole euro acceptés ; texte refusé', () => {
  assert.equal(parseAmount('12,50'), 12.5);
  assert.equal(parseAmount('1 200 €'), 1200);
  assert.equal(parseAmount(7.5), 7.5);
  assert.ok(Number.isNaN(parseAmount('douze')));
  assert.ok(Number.isNaN(parseAmount('')));
});

test('Lignes : date en tête de libellé extraite, total au centime, lignes invalides signalées', () => {
  assert.deepEqual(splitLineDate({ label: '12/03/2027 – Fournitures' }), { date: '12/03/2027', text: 'Fournitures' });
  assert.deepEqual(splitLineDate({ label: '2027-03-12 : Taxi' }), { date: '12/03/2027', text: 'Taxi' });
  assert.deepEqual(splitLineDate({ label: 'Repas', date: '2027-03-01' }), { date: '01/03/2027', text: 'Repas' });
  assert.deepEqual(splitLineDate({ label: 'Repas' }), { date: '', text: 'Repas' });
  const lines = [{ label: 'A', amount: '0,10' }, { label: 'B', amount: '0,20' }, { label: '', amount: '' }, { label: 'C', amount: 'abc' }];
  assert.equal(normalizeLines(lines).length, 3);
  assert.equal(sumLines(lines), 0.3);
  const w = lineWarnings(lines);
  assert.equal(w.length, 1);
  assert.match(w[0], /Ligne 3 \(« C »\)/);
});

test('Dates : âge révolu et fin d\'année universitaire', () => {
  assert.equal(ageAt('2010-05-01', '2026-10-10'), 16);
  assert.equal(ageAt('2008-10-10', '2026-10-10'), 18);
  assert.equal(ageAt('2008-10-11', '2026-10-10'), 17);
  assert.ok(Number.isNaN(ageAt('', '2026-10-10')));
  assert.equal(academicYearEnd('2026-10-10'), '2027-08-31');
  assert.equal(academicYearEnd('2027-03-01'), '2027-08-31');
});

test('Pôles, membres hors catalogue, accès Drive et registre', () => {
  const ctx = fullContext();
  assert.equal(polesBureauFirst(ctx)[0].id, 'bureau');
  assert.deepEqual(membersWithoutCatalogRole(ctx).map(m => m.id), ['m7']);
  const access = poleDriveAccess(ctx, 'communication');
  assert.deepEqual(access.map(a => [a.folder, a.levelLabel]), [
    ['01 Pôle Communication', 'Éditeur'],
    ['01.3 Réseaux Sociaux', 'Éditeur'],
    ['02 Pôle Événementiel', 'Lecteur'],
  ]);
  assert.deepEqual(access[1].roles, ['Responsable Communication', 'Membre Communication']);
  assert.deepEqual(membersWithDrivePermissions(ctx).map(m => m.id), ['m1', 'm4']);
  assert.equal(issuedSince(ctx, 'attestation-adhesion', '2026-09-01'), true);
  assert.equal(issuedSince(ctx, 'attestation-adhesion', '2026-10-01'), false);
});
