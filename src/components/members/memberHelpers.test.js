import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCatalog } from '../../core/catalog.js';
import {
  buildRoleOptions, validateMemberForm, toMemberPayload, memberMatchesFilters,
  columnWhatsAppText, computeMemberStats, roleText, hasLegacyRole, safeFileName,
  roleFilterLabel, ROLE_FILTER_LEGACY, ROLE_FILTER_NONE,
  MEMBER_ADMIN_FIELDS, adminFormValues, adminFilledCount,
} from './memberHelpers.js';

const cat = createDefaultCatalog();
const members = [
  { id: '1', firstName: 'Kenzo', lastName: '', mainRole: 'president', badges: ['Accès Banque'], columnId: 'a' },
  { id: '2', firstName: 'Max', mainRole: 'DJ officiel', badges: [], columnId: 'a' },
  { id: '3', firstName: 'Zoé', mainRole: '', legacyMainRole: 'Respo Truc', badges: ['DJ'], columnId: 'b' },
  { id: '4', firstName: 'Ana', mainRole: 'membre_communication', columnId: 'zzz' },
];

test('options de rôle groupées par pôle + ancien rôle conservé', () => {
  const { groups, legacy } = buildRoleOptions(cat, 'DJ officiel');
  assert.equal(legacy, 'DJ officiel');
  assert.equal(groups[0].pole.id, 'bureau');
  const total = groups.reduce((n, g) => n + g.roles.length, 0);
  assert.equal(total, Object.keys(cat.roles).length);
  assert.ok(groups.every(g => g.roles.length > 0)); // pôles vides masqués
  assert.equal(buildRoleOptions(cat, 'president').legacy, null);
  assert.equal(buildRoleOptions(cat, '').legacy, null);
});

test('validation du formulaire', () => {
  assert.deepEqual(validateMemberForm({ firstName: 'A', email: '' }), {});
  assert.ok(validateMemberForm({ firstName: '  ' }).firstName);
  assert.ok(validateMemberForm({ firstName: 'A', email: 'pas-un-email' }).email);
  assert.deepEqual(validateMemberForm({ firstName: 'A', email: ' a.b@gmail.com ' }), {});
  assert.equal(toMemberPayload({ firstName: ' A ', email: ' x@y.fr ' }).email, 'x@y.fr');
});

test('libellés de rôle et rôle hérité', () => {
  assert.equal(roleText(members[0], cat.roles), 'Président(e)');
  assert.equal(roleText(members[1], cat.roles), 'DJ officiel');
  assert.equal(roleText(members[2], cat.roles), '');
  assert.equal(hasLegacyRole(members[2], cat.roles), true);
  assert.equal(hasLegacyRole(members[0], cat.roles), false);
});

test('filtres : recherche par libellé, sans rôle, hors catalogue', () => {
  const f = (filters) => members
    .filter(m => memberMatchesFilters(m, { search: '', role: '', badge: '', columnId: '', ...filters }, cat.roles))
    .map(m => m.id);
  assert.deepEqual(f({ search: 'président' }), ['1']);
  assert.deepEqual(f({ search: 'respo truc' }), ['3']);
  assert.deepEqual(f({ role: ROLE_FILTER_NONE }), ['3']);
  assert.deepEqual(f({ role: ROLE_FILTER_LEGACY }), ['2']);
  assert.deepEqual(f({ role: 'president' }), ['1']);
  assert.deepEqual(f({ badge: 'DJ', columnId: 'b' }), ['3']);
  assert.equal(roleFilterLabel('president', cat.roles), 'Président(e)');
  assert.equal(roleFilterLabel(ROLE_FILTER_NONE, cat.roles), 'Sans rôle');
});

test('export WhatsApp sans « undefined »', () => {
  const text = columnWhatsAppText(
    { title: 'Bureau' },
    [{ firstName: 'A' }, { firstName: 'B', lastName: 'C', mainRole: 'president', badges: ['X'] }],
    cat.roles,
  );
  assert.ok(!text.includes('undefined'));
  assert.match(text, /\*B C\* — Président\(e\) \(Badges : X\)/);
  assert.match(columnWhatsAppText({ title: 'Vide' }, [], cat.roles), /Aucun membre/);
  assert.equal(safeFileName('🎉 Pôle Événementiel / 2026'), 'Pole_Evenementiel_2026');
});

test('statistiques par pôle / rôle / colonne', () => {
  const s = computeMemberStats(members, cat, [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }]);
  assert.equal(s.total, 4);
  assert.equal(s.withoutRole, 1);
  assert.equal(s.offCatalog, 1);
  assert.equal(s.legacyOnly, 1);
  assert.equal(s.totalBadges, 2);
  assert.equal(s.byColumn.find(c => c.key === '__nocol__').count, 1);
  assert.equal(s.byPole.find(p => p.key === 'bureau').count, 1);
  assert.equal(s.byPole.find(p => p.key === 'communication').count, 1);
  assert.ok(s.byRole.some(r => r.label === 'DJ officiel (hors catalogue)'));
  assert.equal(s.byPole.reduce((n, p) => n + p.count, 0), 4);
});

test('champs administratifs : valeurs, validation, payload léger', () => {
  assert.equal(MEMBER_ADMIN_FIELDS.length, 13);
  const v = adminFormValues({ feeAmount: 5, imageConsent: 'peut-être', joinedAt: '2026-09-01' });
  assert.equal(v.feeAmount, '5');
  assert.equal(v.imageConsent, '');
  assert.equal(v.joinedAt, '2026-09-01');
  assert.equal(v.phone, '');
  assert.equal(adminFilledCount(v), 2);

  const base = { firstName: 'A', ...adminFormValues({}) };
  assert.deepEqual(validateMemberForm(base), {});
  assert.ok(validateMemberForm({ ...base, birthDate: '2026-13-45' }).birthDate);
  assert.ok(validateMemberForm({ ...base, feeAmount: '-3' }).feeAmount);
  assert.ok(validateMemberForm({ ...base, mandateStart: '2026-10-01', mandateEnd: '2026-09-01' }).mandateEnd);

  // Champs vides non écrits (membre léger) ; vidés s'ils existaient.
  const p1 = toMemberPayload(base);
  assert.ok(!('phone' in p1) && !('feeAmount' in p1));
  const p2 = toMemberPayload({ ...base, feeAmount: '7,5', imageConsent: 'oui', program: ' BUT GEA ' });
  assert.equal(p2.feeAmount, 7.5);
  assert.equal(p2.imageConsent, 'oui');
  assert.equal(p2.program, 'BUT GEA');
  const p3 = toMemberPayload(base, { phone: '0601' });
  assert.equal(p3.phone, '');
});
