import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  profileCompleteness, builtinSuggestions, mergeSuggestions, suggestionKey, suggestionToSession,
  templateMatches, recentTemplateIds, defaultMemberSelection, memberMatchesPicker, memberInitials,
  normalizeOptions, parseListText, parseAmount, linesTotal, moveItem, resolutionOutcome,
  generationValues, defaultDependsOnMember, profileFieldWarnings, cleanProfilePatch, numberInputValue,
} from './studioHelpers.js';

const members = [
  { id: 'p', firstName: 'Lina', lastName: 'Martin', mainRole: 'president', columnId: 'c1' },
  { id: 't', firstName: 'Yanis', lastName: 'Ben', mainRole: 'tresorier', columnId: 'c1' },
  { id: 'm', firstName: 'Zoé', lastName: '', mainRole: 'membre_sport', columnId: 'c2' },
];
const roles = {
  president: { id: 'president', label: 'Président(e)', pole: 'bureau' },
  tresorier: { id: 'tresorier', label: 'Trésorier(ère)', pole: 'bureau' },
  membre_sport: { id: 'membre_sport', label: 'Membre Sport', pole: 'sport' },
};

test('complétude du profil : champs clés + signature du président', () => {
  const empty = profileCompleteness({ name: 'BDE' }, members);
  assert.equal(empty.total, 8);
  assert.equal(empty.done, 1);
  assert.equal(empty.percent, 13);
  const full = profileCompleteness({
    name: 'BDE', address: '1 rue', city: 'Paris', rna: 'W751234567', email: 'a@b.fr', school: 'IUT', logo: 'data:x',
    signatures: { p: 'data:sig' },
  }, members);
  assert.equal(full.percent, 100);
  assert.equal(full.missing.length, 0);
  const noPresident = profileCompleteness({ signatures: { p: 'x' } }, members.slice(1));
  assert.ok(noPresident.items.find(i => i.key === 'signatures').hint);
  assert.equal(profileCompleteness({ name: '   ' }, []).done, 0);
});

test('suggestions intégrées : profil, signature, président absent', () => {
  const c = profileCompleteness({ name: 'BDE' }, members);
  const s = builtinSuggestions(c);
  assert.equal(s[0].id, 'builtin:profile');
  assert.equal(s[0].priority, 'high');
  assert.equal(s[0].action.field, 'address');
  assert.ok(s.some(x => x.id === 'builtin:president-signature' && x.action.field === 'signatures'));
  const s2 = builtinSuggestions(profileCompleteness({}, []));
  assert.ok(s2.some(x => x.id === 'builtin:no-president' && x.action.type === 'navigate'));
  assert.deepEqual(builtinSuggestions(null), []);
});

test('fusion des suggestions : tri par priorité stable + masquage', () => {
  const a = { id: 'a', templateId: 't1', priority: 'low' };
  const b = { id: 'b', templateId: 't1', priority: 'high' };
  const c = { id: 'builtin:x', builtin: true, priority: 'high' };
  const out = mergeSuggestions([c], [a, b]);
  assert.deepEqual(out.map(x => x.id), ['builtin:x', 'b', 'a']);
  assert.deepEqual(mergeSuggestions([c], [a, b], [suggestionKey(b), 'builtin:x']).map(x => x.id), ['a']);
});

test('suggestion → générateur : membres existants seulement, valeurs copiées', () => {
  const tpl = { id: 't1', scope: 'member' };
  const sug = { title: 'X', memberIds: ['p', 'ghost'], values: { a: 1 } };
  const session = suggestionToSession(sug, tpl, members);
  assert.deepEqual(session.memberIds, ['p']);
  assert.deepEqual(session.values, { a: 1 });
  assert.notEqual(session.values, sug.values);
  assert.equal(session.origin.type, 'suggestion');
  assert.deepEqual(suggestionToSession(sug, { id: 'o', scope: 'organization' }, members).memberIds, []);
  assert.equal(suggestionToSession(sug, null, members), null);
});

test('recherche de modèles (accents, mots multiples, catégorie)', () => {
  const t = { title: 'Attestation d\'adhésion', description: 'Prouve l\'adhésion', tags: ['membre', 'cotisation'], category: 'membres' };
  assert.ok(templateMatches(t, 'adhesion', ''));
  assert.ok(templateMatches(t, 'ATTESTATION cotis', 'membres'));
  assert.ok(!templateMatches(t, 'adhesion', 'rgpd'));
  assert.ok(!templateMatches(t, 'procès', ''));
  assert.ok(templateMatches(t, 'Membres', '', 'Membres'));
});

test('modèles récents sans doublon', () => {
  const log = [{ templateId: 'a' }, { templateId: 'b' }, { templateId: 'a' }, { templateId: 'c' }];
  assert.deepEqual(recentTemplateIds(log, 2), ['a', 'b']);
  assert.deepEqual(recentTemplateIds([], 2), []);
});

test('pré-sélection des membres', () => {
  const ctx = { members };
  assert.deepEqual(defaultMemberSelection({ scope: 'organization' }, ctx), []);
  assert.deepEqual(defaultMemberSelection({ scope: 'member', memberFilter: m => m.mainRole === 'tresorier' }, ctx), ['t']);
  assert.deepEqual(defaultMemberSelection({ scope: 'member', memberFilter: () => { throw new Error('x'); } }, ctx), []);
  assert.deepEqual(defaultMemberSelection({ scope: 'member' }, ctx), ['p']); // Lina avant Yanis et Zoé
});

test('filtres du sélecteur de membres', () => {
  assert.ok(memberMatchesPicker(members[0], { query: 'lina pres' }, roles));
  assert.ok(memberMatchesPicker(members[2], { poleId: 'sport' }, roles));
  assert.ok(!memberMatchesPicker(members[0], { poleId: 'sport' }, roles));
  assert.ok(memberMatchesPicker(members[1], { roleId: 'tresorier', columnId: 'c1' }, roles));
  assert.ok(!memberMatchesPicker(members[1], { columnId: 'c2' }, roles));
  assert.ok(memberMatchesPicker({ id: 'x', firstName: 'A' }, { roleId: '__none__' }, roles));
  assert.equal(memberInitials(members[0]), 'LM');
  assert.equal(memberInitials(members[2]), 'ZO');
  assert.equal(memberInitials({}), '?');
});

test('champs : options, listes, montants, déplacement, votes', () => {
  assert.deepEqual(normalizeOptions(['a', { value: 'b', label: 'Bé' }]), [{ value: 'a', label: 'a' }, { value: 'b', label: 'Bé' }]);
  assert.deepEqual(parseListText(' un \n\n deux\r\n'), ['un', 'deux']);
  assert.equal(parseAmount('12,5'), 12.5);
  assert.equal(parseAmount('1 200'), 1200);
  assert.ok(Number.isNaN(parseAmount('abc')));
  assert.equal(linesTotal([{ amount: '10,5' }, { amount: 4 }, { amount: '' }]), 14.5);
  assert.deepEqual(moveItem([1, 2, 3], 0, 2), [2, 3, 1]);
  assert.deepEqual(moveItem([1, 2, 3], 0, 5), [1, 2, 3]);
  assert.equal(resolutionOutcome({ for: 10, against: 2 }), 'adopted');
  assert.equal(resolutionOutcome({ for: 2, against: 2 }), 'rejected');
  assert.equal(resolutionOutcome({}), 'pending');
  assert.equal(numberInputValue(''), '');
  assert.equal(numberInputValue('4.5'), 4.5);
});

test('valeurs de génération : scope membre → seuls les champs touchés', () => {
  const tplM = { scope: 'member' };
  assert.deepEqual(generationValues(tplM, { a: 1, b: 2 }, new Set(['b'])), { b: 2 });
  assert.deepEqual(generationValues({ scope: 'organization' }, { a: 1 }, new Set()), { a: 1 });
  assert.ok(defaultDependsOnMember({ default: (ctx, member) => member }));
  assert.ok(!defaultDependsOnMember({ default: (ctx) => ctx }));
  assert.ok(!defaultDependsOnMember({ default: 'x' }));
});

test('profil : validation douce et nettoyage', () => {
  const w = profileFieldWarnings({ rna: 'X123', siren: '12', postalCode: '7500', email: 'nope', accentColor: 'blue' });
  assert.ok(w.rna && w.siren && w.postalCode && w.email && w.accentColor);
  assert.deepEqual(profileFieldWarnings({ rna: 'w 751234567', siren: '123 456 789', postalCode: '75001', email: 'a@b.fr', website: 'bde.fr' }), {});
  const clean = cleanProfilePatch({ rna: ' w751234567 ', siren: '123 456 789', name: ' BDE ', agNoticeDays: '', agQuorumPercent: '150', signatures: { a: 1 } });
  assert.equal(clean.rna, 'W751234567');
  assert.equal(clean.siren, '123456789');
  assert.equal(clean.name, 'BDE');
  assert.equal(clean.agNoticeDays, 15);
  assert.equal(clean.agQuorumPercent, 100);
  assert.ok(!('signatures' in clean));
  assert.equal(cleanProfilePatch({ logo: '', stamp: 'data:image/png;base64,AA' }).logo, null);
  assert.equal(cleanProfilePatch({ stamp: 'data:image/png;base64,AA' }).stamp, 'data:image/png;base64,AA');
});
