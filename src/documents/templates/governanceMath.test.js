// Tests des calculs de gouvernance (quorum, majorités, délais, composition).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toCount, formatPercent, computeQuorum, resolutionOutcome, majorityRuleText, normalizeMajority,
  resolutionOrdinal, noticeWarning, compareComposition, parseActionLine,
} from './governanceMath.js';

test('toCount : entiers positifs, valeurs invalides → 0', () => {
  assert.equal(toCount('12'), 12);
  assert.equal(toCount(3.9), 3);
  assert.equal(toCount(-2), 0);
  assert.equal(toCount(''), 0);
  assert.equal(toCount(undefined), 0);
  assert.equal(toCount('abc'), 0);
});

test('formatPercent : virgule décimale et espace normale', () => {
  assert.equal(formatPercent(25), '25 %');
  assert.equal(formatPercent(100 / 3), '33,33 %');
  assert.equal(formatPercent('x'), '');
});

test('quorum : arrondi à l\'entier supérieur, atteint / non atteint', () => {
  const q = computeQuorum({ present: 8, represented: 2, total: 40, percent: 25 });
  assert.equal(q.required, 10);
  assert.equal(q.counted, 10);
  assert.equal(q.reached, true);
  const q2 = computeQuorum({ present: 7, represented: 2, total: 40, percent: 25 });
  assert.equal(q2.reached, false);
  // 25 % de 41 = 10,25 → 11 membres requis
  assert.equal(computeQuorum({ present: 10, total: 41, percent: 25 }).required, 11);
  assert.equal(computeQuorum({ present: 10, total: 41, percent: 25 }).reached, false);
  // 30 % de 10 = 3 exactement (pas d'arrondi flottant à 4)
  assert.equal(computeQuorum({ present: 3, total: 10, percent: 30 }).required, 3);
  // Moitié des membres
  assert.equal(computeQuorum({ present: 6, total: 12, percent: 50 }).reached, true);
});

test('quorum : cas limites (aucun quorum, total inconnu, personne)', () => {
  const none = computeQuorum({ present: 2, total: 40, percent: 0 });
  assert.equal(none.noQuorum, true);
  assert.equal(none.required, 0);
  assert.equal(none.reached, true);
  const unknownTotal = computeQuorum({ present: 5, represented: 1, total: 0, percent: 25 });
  assert.equal(unknownTotal.total, 6);
  assert.equal(unknownTotal.reached, true);
  const empty = computeQuorum({ present: 0, total: 20, percent: 25 });
  assert.equal(empty.reached, false);
  assert.equal(computeQuorum({}).reached, false);
  assert.equal(Number.isFinite(computeQuorum({}).ratio), true);
});

test('majorité simple : pour > contre, abstentions non comptées', () => {
  const r = resolutionOutcome({ for: 12, against: 2, abstention: 1 }, 'simple');
  assert.equal(r.adopted, true);
  assert.equal(r.expressed, 14);
  assert.equal(r.sentence, 'Cette résolution est adoptée à la majorité (12 pour, 2 contre, 1 abstention).');
  // Les abstentions ne changent rien : 3 pour, 2 contre, 10 abstentions → adoptée
  assert.equal(resolutionOutcome({ for: 3, against: 2, abstention: 10 }, 'simple').adopted, true);
  const rej = resolutionOutcome({ for: 2, against: 9, abstention: 0 }, 'simple');
  assert.equal(rej.adopted, false);
  assert.equal(rej.sentence, 'Cette résolution est rejetée (2 pour, 9 contre, 0 abstention).');
});

test('majorité simple : égalité → rejetée, faute de majorité', () => {
  const r = resolutionOutcome({ for: 5, against: 5, abstention: 2 }, 'simple');
  assert.equal(r.adopted, false);
  assert.equal(r.tie, true);
  assert.match(r.sentence, /rejetée, faute de majorité/);
  assert.match(r.sentence, /2 abstentions/);
});

test('aucun suffrage exprimé → non adoptée', () => {
  const r = resolutionOutcome({ for: 0, against: 0, abstention: 4 }, 'simple');
  assert.equal(r.adopted, false);
  assert.equal(r.noVotes, true);
  assert.equal(r.sentence, 'Aucun suffrage n\'ayant été exprimé (0 pour, 0 contre, 4 abstentions), cette résolution n\'est pas adoptée.');
  const zero = resolutionOutcome({}, 'deux_tiers');
  assert.equal(zero.adopted, false);
  assert.match(zero.sentence, /Aucun suffrage/);
  assert.equal(resolutionOutcome({}, 'absolue').adopted, false);
});

test('unanimité et unanimité des suffrages exprimés', () => {
  const u = resolutionOutcome({ for: 15, against: 0, abstention: 0 }, 'simple');
  assert.equal(u.unanimous, true);
  assert.equal(u.sentence, 'Cette résolution est adoptée à l\'unanimité (15 pour, 0 contre, 0 abstention).');
  const ue = resolutionOutcome({ for: 15, against: 0, abstention: 2 }, 'simple');
  assert.equal(ue.unanimous, false);
  assert.equal(ue.unanimousExpressed, true);
  assert.match(ue.sentence, /adoptée à l'unanimité des suffrages exprimés/);
  // Unanimité aussi pour les deux tiers
  assert.match(resolutionOutcome({ for: 4 }, 'deux_tiers').sentence, /à l'unanimité \(/);
});

test('majorité des deux tiers des suffrages exprimés', () => {
  // 6 / 9 = 2/3 exactement → adoptée
  const exact = resolutionOutcome({ for: 6, against: 3, abstention: 5 }, 'deux_tiers');
  assert.equal(exact.adopted, true);
  assert.equal(exact.required, 6);
  assert.match(exact.sentence, /adoptée à la majorité des deux tiers/);
  // 6 / 10 < 2/3 → rejetée, 7 requis
  const below = resolutionOutcome({ for: 6, against: 4, abstention: 0 }, 'deux_tiers');
  assert.equal(below.adopted, false);
  assert.equal(below.required, 7);
  assert.match(below.sentence, /faute d'avoir recueilli les deux tiers des suffrages exprimés, soit 7 voix/);
  // 2 / 3 → adoptée ; 1 / 2 → rejetée
  assert.equal(resolutionOutcome({ for: 2, against: 1 }, 'deux_tiers').adopted, true);
  assert.equal(resolutionOutcome({ for: 1, against: 1 }, 'deux_tiers').adopted, false);
});

test('majorité absolue des présents et représentés', () => {
  // 20 votants → 11 voix requises ; les abstentions pèsent contre
  const r = resolutionOutcome({ for: 10, against: 3, abstention: 7 }, 'absolue', { voters: 20 });
  assert.equal(r.required, 11);
  assert.equal(r.adopted, false);
  assert.match(r.sentence, /majorité absolue des membres présents ou représentés, soit 11 voix/);
  const ok = resolutionOutcome({ for: 11, against: 9, abstention: 0 }, 'absolue', { voters: 20 });
  assert.equal(ok.adopted, true);
  assert.match(ok.sentence, /adoptée à la majorité absolue/);
  // 21 votants → 11 requis
  assert.equal(resolutionOutcome({ for: 11 }, 'absolue', { voters: 21 }).required, 11);
  // Sans nombre de votants : base = votes exprimés + abstentions
  assert.equal(resolutionOutcome({ for: 3, against: 1, abstention: 2 }, 'absolue').base, 6);
  assert.equal(resolutionOutcome({ for: 3, against: 1, abstention: 2 }, 'absolue').adopted, false);
});

test('valeurs texte et majorité inconnue', () => {
  const r = resolutionOutcome({ for: '7', against: '2', abstention: '' }, 'inconnue');
  assert.equal(r.adopted, true);
  assert.equal(normalizeMajority('inconnue'), 'simple');
  assert.doesNotMatch(r.sentence, /undefined|NaN|null/);
});

test('texte de la règle de majorité', () => {
  assert.match(majorityRuleText('simple'), /abstentions ne sont pas comptées/);
  assert.match(majorityRuleText('absolue', 20), /au moins 11 voix sur 20/);
  assert.match(majorityRuleText('deux_tiers'), /deux tiers des suffrages exprimés/);
});

test('ordinaux des résolutions', () => {
  assert.equal(resolutionOrdinal(0), 'Première résolution');
  assert.equal(resolutionOrdinal(1), 'Deuxième résolution');
  assert.equal(resolutionOrdinal(20), 'Résolution n° 21');
});

test('délai de convocation', () => {
  assert.equal(noticeWarning(6, 15), 'La convocation est envoyée 6 jours avant l\'AG alors que les statuts prévoient 15 jours.');
  assert.equal(noticeWarning(1, 15), 'La convocation est envoyée 1 jour avant l\'AG alors que les statuts prévoient 15 jours.');
  assert.match(noticeWarning(0, 15), /le jour même/);
  assert.match(noticeWarning(-3, 15), /antérieure/);
  assert.equal(noticeWarning(15, 15), null);
  assert.equal(noticeWarning(20, 15), null);
  assert.equal(noticeWarning(NaN, 15), null);
});

test('comparaison de la composition du bureau', () => {
  assert.equal(compareComposition(['a', 'b'], ['b', 'a']).changed, false);
  const d = compareComposition(['a', 'b', 'c'], ['a', 'b', 'd']);
  assert.deepEqual(d.added, ['d']);
  assert.deepEqual(d.removed, ['c']);
  assert.equal(d.changed, true);
  const roles = compareComposition(['a', 'b'], ['a', 'b'], { a: 'president', b: 'tresorier' }, { a: 'tresorier', b: 'president' });
  assert.deepEqual(roles.roleChanged.sort(), ['a', 'b']);
  assert.equal(roles.changed, true);
  assert.equal(compareComposition([], []).changed, false);
});

test('analyse des lignes d\'action', () => {
  assert.deepEqual(parseActionLine('Réserver la salle — Léa — 2026-11-15'), { action: 'Réserver la salle', owner: 'Léa', due: '2026-11-15' });
  assert.deepEqual(parseActionLine('Relancer le sponsor | Adrien'), { action: 'Relancer le sponsor', owner: 'Adrien', due: '' });
  assert.deepEqual(parseActionLine('Commander les t-shirts - Ilona - fin novembre'), { action: 'Commander les t-shirts', owner: 'Ilona', due: 'fin novembre' });
  assert.deepEqual(parseActionLine('Mettre à jour le site'), { action: 'Mettre à jour le site', owner: '', due: '' });
  assert.deepEqual(parseActionLine(''), { action: '', owner: '', due: '' });
});
