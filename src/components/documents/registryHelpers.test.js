import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  docKey, sanitizeValues, buildIssues, buildLogEntries, refRange, exportBaseName,
  normalizeRef, normalizeFingerprint, verifyDocument, registryYears, filterRegistry, registryToCsv,
} from './registryHelpers.js';

const entries = [
  { id: '1', ref: 'BDE-2026-0002', createdAt: '2026-10-10T12:00:00.000Z', templateId: 'attest', title: 'Attestation — Lina Martin', memberIds: ['p'], fingerprint: '3F9A-21C4-77B0', format: 'pdf', fileName: 'Attestation_Lina' },
  { id: '2', ref: 'BDE-2025-0001', createdAt: '2025-03-01T09:00:00.000Z', templateId: 'pv', title: 'PV d\'AG; "ordinaire"', memberIds: [], fingerprint: 'AAAA-BBBB-CCCC', format: 'word', fileName: 'PV' },
];
const lookup = {
  memberName: (id) => ({ p: 'Lina Martin' }[id] || ''),
  templateOf: (id) => ({ attest: { title: 'Attestation', category: 'membres' }, pv: { title: 'PV', category: 'gouvernance' } }[id] || null),
  categoryLabel: (id) => ({ membres: 'Membres', gouvernance: 'Gouvernance' }[id] || id),
};

test('clé de document : membres sinon position', () => {
  assert.equal(docKey({ meta: { memberIds: ['a', 'b'] } }, 3), 'm:a,b');
  assert.equal(docKey({ meta: {} }, 3), 'i:3');
});

test('copie des valeurs pour le registre : sans images ni textes énormes', () => {
  const v = sanitizeValues({ a: 'ok', img: 'data:image/png;base64,AAA', big: 'x'.repeat(5000), n: NaN, list: ['a', 'data:x'], nested: { b: 1, fn: () => 1 } });
  assert.deepEqual(v, { a: 'ok', list: ['a'], nested: { b: 1 } });
  assert.deepEqual(sanitizeValues(null), {});
});

test('émission : infos imprimées + entrées du registre', () => {
  const docs = [
    { meta: { templateId: 'attest', title: 'A', fileName: 'a', memberIds: ['p'] } },
    { meta: { templateId: 'attest', title: 'B', fileName: 'b', orientation: 'landscape', composition: { p: 'president' } } },
  ];
  const issues = buildIssues(['BDE-2026-0001', 'BDE-2026-0002'], ['F1', 'F2'], '2026-10-10T00:00:00.000Z');
  assert.deepEqual(issues[1], { ref: 'BDE-2026-0002', fingerprint: 'F2', issuedAt: '2026-10-10T00:00:00.000Z' });
  const log = buildLogEntries(docs, issues, { templateId: 'attest', values: { x: 1 }, format: 'pdf', fileName: 'lot' });
  assert.equal(log.length, 2);
  assert.deepEqual(log[0].memberIds, ['p']);
  assert.deepEqual(log[1].memberIds, []);
  assert.equal(log[1].ref, 'BDE-2026-0002');
  assert.equal(log[0].format, 'pdf');
  assert.deepEqual(log[1].composition, { p: 'president' });
  assert.deepEqual(log[1].meta, { orientation: 'landscape', composition: { p: 'president' } });
  assert.ok(!('composition' in log[0]));
  assert.deepEqual(log[0].meta, {});
  assert.equal(refRange(['A']), 'A');
  assert.equal(refRange(['A', 'B', 'C']), 'A → C');
  assert.equal(refRange([]), '');
});

test('nom de fichier d\'export', () => {
  const one = [{ meta: { fileName: 'Attestation_Lina' } }];
  assert.equal(exportBaseName(one, [{ ref: 'BDE-2026-0001' }], 'Attestation'), 'Attestation_Lina_BDE-2026-0001');
  assert.equal(exportBaseName([{}, {}], null, 'Attestation', true), 'Attestation_2_documents_BROUILLON');
});

test('normalisation des références et empreintes', () => {
  assert.equal(normalizeRef(' bde 2026 7 '), 'BDE-2026-0007');
  assert.equal(normalizeRef('bde-2026-0007'), 'BDE-2026-0007');
  assert.equal(normalizeRef('BDE–2026–12'), 'BDE-2026-0012');
  assert.equal(normalizeRef(''), '');
  assert.equal(normalizeFingerprint('3f9a21c477b0'), '3F9A-21C4-77B0');
  assert.equal(normalizeFingerprint('3F9A-21C4-77B0'), '3F9A-21C4-77B0');
});

test('vérification d\'un document', () => {
  assert.equal(verifyDocument(entries, '').status, 'empty');
  assert.equal(verifyDocument(entries, 'BDE-2026-9999').status, 'not-found');
  assert.equal(verifyDocument(entries, 'bde 2026 2').status, 'found');
  assert.equal(verifyDocument(entries, 'BDE-2026-0002', '3f9a 21c4 77b0').status, 'match');
  assert.equal(verifyDocument(entries, 'BDE-2026-0002', '0000-0000-0000').status, 'mismatch');
});

test('filtres du registre', () => {
  assert.deepEqual(registryYears(entries), [2026, 2025]);
  assert.equal(filterRegistry(entries, { query: 'lina' }, lookup).length, 1);
  assert.equal(filterRegistry(entries, { query: '3f9a' }, lookup).length, 1);
  assert.equal(filterRegistry(entries, { category: 'gouvernance' }, lookup)[0].id, '2');
  assert.equal(filterRegistry(entries, { year: '2025' }, lookup)[0].id, '2');
  assert.equal(filterRegistry(entries, { templateId: 'attest' }, lookup).length, 1);
  assert.equal(filterRegistry(entries, {}, lookup).length, 2);
});

test('export CSV : BOM, « ; », guillemets échappés, CRLF', () => {
  const csv = registryToCsv(entries, lookup);
  assert.ok(csv.startsWith('\uFEFFRéférence;Date d\'émission;'));
  const lines = csv.split('\r\n');
  assert.equal(lines.length, 4); // en-tête + 2 lignes + fin
  assert.ok(lines[1].includes(';Lina Martin;'));
  assert.ok(lines[1].includes(';Membres;'));
  assert.ok(lines[2].includes('"PV d\'AG; ""ordinaire"""'));
  assert.ok(lines[2].includes(';Word;'));
});
