import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  numberToFrench, amountInWords, formatDateLong, formatDateShort, academicYear, formatMoney,
  formatTime, daysBetween, joinFr, officialName, organizationLegalLine, DEFAULT_ORGANIZATION,
  buildContext, isPlaceholderMember,
} from './context.js';
import { createBlockFactory, validateDocument, applyOverrides, documentFingerprint, safeFileName } from './model.js';

test('nombres en lettres (orthographe traditionnelle)', () => {
  const cases = {
    0: 'zéro', 1: 'un', 16: 'seize', 17: 'dix-sept', 21: 'vingt et un', 22: 'vingt-deux',
    70: 'soixante-dix', 71: 'soixante et onze', 77: 'soixante-dix-sept', 80: 'quatre-vingts',
    81: 'quatre-vingt-un', 90: 'quatre-vingt-dix', 99: 'quatre-vingt-dix-neuf', 100: 'cent',
    101: 'cent un', 200: 'deux cents', 250: 'deux cent cinquante', 1000: 'mille',
    1980: 'mille neuf cent quatre-vingts', 2026: 'deux mille vingt-six', 200000: 'deux cent mille',
    1000000: 'un million', 2500000: 'deux millions cinq cent mille',
  };
  Object.entries(cases).forEach(([n, words]) => assert.equal(numberToFrench(Number(n)), words, `n=${n}`));
});

test('montants en lettres', () => {
  assert.equal(amountInWords(12.5), 'douze euros et cinquante centimes');
  assert.equal(amountInWords(1), 'un euro');
  assert.equal(amountInWords(0.01), 'zéro euro et un centime');
  assert.equal(amountInWords(-3), '');
});

test('dates et heures en français', () => {
  assert.equal(formatDateLong('2026-10-01'), '1er octobre 2026');
  assert.equal(formatDateLong('2027-03-12', { weekday: true }), 'vendredi 12 mars 2027');
  assert.equal(formatDateShort('2027-03-02'), '02/03/2027');
  assert.equal(formatDateLong('pas une date'), '');
  assert.equal(formatTime('18:30'), '18 h 30');
  assert.equal(formatTime('09:00'), '9 h');
  assert.equal(daysBetween('2026-10-01', '2026-10-16'), 15);
});

test('année universitaire (bascule au 1er septembre)', () => {
  assert.equal(academicYear('2026-08-31'), '2025-2026');
  assert.equal(academicYear('2026-09-01'), '2026-2027');
  assert.equal(academicYear('2027-02-10'), '2026-2027');
});

test('montants, listes, noms officiels, ligne légale', () => {
  assert.equal(formatMoney(1234.5), '1 234,50 €');
  assert.equal(joinFr(['A', 'B', 'C']), 'A, B et C');
  assert.equal(officialName({ firstName: 'Jade', lastName: 'Martin' }), 'MARTIN Jade');
  const line = organizationLegalLine({ ...DEFAULT_ORGANIZATION, name: 'BDE IUT', shortName: 'BDE', address: '140 rue de la Nouvelle France', postalCode: '93100', city: 'Montreuil', rna: 'W931234567' });
  assert.equal(line, 'BDE IUT (BDE), association loi 1901, dont le siège est situé 140 rue de la Nouvelle France, 93100 Montreuil, enregistrée sous le numéro RNA W931234567');
});

test('modèle de document : validation, retouches, empreinte, nom de fichier', async () => {
  const b = createBlockFactory();
  const doc = { meta: { templateId: 't', title: 'T', fileName: 'f' }, blocks: [b.title('Titre'), b.p('Texte')] };
  assert.deepEqual(validateDocument(doc), []);
  assert.ok(validateDocument({ ...doc, blocks: [b.p('Né le undefined')] }).length > 0, 'valeur manquante détectée');
  const edited = applyOverrides(doc, { b2: 'Texte retouché' });
  assert.equal(edited.blocks[1].text, 'Texte retouché');
  const f1 = await documentFingerprint(doc);
  const f2 = await documentFingerprint(edited);
  assert.match(f1, /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  assert.notEqual(f1, f2, 'toute retouche change l’empreinte');
  assert.equal(await documentFingerprint(doc), f1, 'empreinte déterministe');
  assert.equal(safeFileName('Attestation d\'adhésion — Zoé/Ö'), 'Attestation_d_adhesion_Zoe_O');
});

test('les fiches « poste vacant » ne sont jamais traitées comme des personnes', () => {
  assert.ok(isPlaceholderMember({ firstName: '[Poste vacant]' }));
  assert.ok(isPlaceholderMember({ firstName: 'Poste', lastName: 'vacant' }));
  assert.ok(!isPlaceholderMember({ firstName: 'Valentin', lastName: 'Vacanti' }));
  const ctx = buildContext({ members: [{ id: 'a', firstName: 'Jade' }, { id: 'v', firstName: '[Poste vacant]', mainRole: 'vice_president' }] });
  assert.deepEqual(ctx.members.map(m => m.id), ['a']);
  assert.deepEqual(ctx.placeholderMembers.map(m => m.id), ['v']);
});
