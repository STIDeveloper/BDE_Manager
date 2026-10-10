// Tests des modèles « partenariats » : convention, note de frais,
// attestations d'événement (lot), budget prévisionnel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDocument, documentPlainText } from '../model.js';
import templates, { eventParticipants, budgetSummary } from './partenariats.js';
import { fullContext, minimalContext, build, MEMBERS } from './orgPart_fixtures.js';

const byId = (id) => templates.find(t => t.id === id);
const blocksOf = (doc, type) => doc.blocks.filter(b => b.type === type);

test('Chaque modèle produit un document valide (contexte complet et minimal)', () => {
  for (const t of templates) {
    assert.equal(t.category, 'partenariats');
    for (const ctx of [fullContext(), minimalContext()]) {
      const member = t.scope === 'member' ? ctx.members[0] || null : null;
      const doc = build(t, ctx, {}, member);
      assert.deepEqual(validateDocument(doc), [], `${t.id}`);
      assert.equal(doc.meta.templateId, t.id);
    }
  }
});

test('Convention : articles numérotés, montant en lettres, signataire partenariats, deux exemplaires', () => {
  const ctx = fullContext();
  const t = byId('convention-partenariat');
  const values = {
    partnerName: 'Boulangerie Martin', partnerForm: 'SARL', partnerAddress: '3 rue du Pain\n93100 Montreuil',
    partnerSiret: '123 456 789 00012', partnerRepName: 'Paul Martin', partnerRepTitle: 'gérant',
    partnerAmount: '1500', partnerInKind: ['Viennoiseries pour l\'AG'], memberBenefits: ['Remise de 10 %'],
  };
  const doc = build(t, ctx, values);
  assert.deepEqual(validateDocument(doc), []);
  const articles = blocksOf(doc, 'heading').filter(h => h.text.startsWith('Article')).map(h => h.text);
  assert.deepEqual(articles, [
    'Article 1 – Objet', 'Article 2 – Durée', 'Article 3 – Engagements de l\'Association',
    'Article 4 – Engagements du Partenaire', 'Article 5 – Avantages accordés aux membres',
    'Article 6 – Communication et usage des marques', 'Article 7 – Données personnelles',
    'Article 8 – Responsabilité', 'Article 9 – Résiliation', 'Article 10 – Litiges',
  ]);
  const text = documentPlainText(doc);
  assert.match(text, /1 500,00 €\*\* \(mille cinq cents euros\)/);
  assert.match(text, /prend effet le 10 octobre 2026 et prend fin le 31 août 2027/);
  assert.match(text, /SARL, dont le siège est situé 3 rue du Pain, 93100 Montreuil, immatriculée sous le numéro SIRET 123 456 789 00012, représenté\(e\) par Paul Martin, en sa qualité de gérant/);
  assert.ok(text.includes('**BDE IUT de Montreuil** (BDE Montreuil), association loi 1901'));
  assert.match(text, /représentée par Farid Benali, agissant en qualité de Responsable Partenariats/);
  assert.match(text, /Fait en deux exemplaires originaux/);
  assert.match(text, /amiable/);
  const sigs = blocksOf(doc, 'signatures')[0].slots;
  assert.equal(sigs.length, 2);
  assert.equal(sigs[0].name, 'Farid Benali');
  assert.equal(sigs[1].name, 'Paul Martin');
  assert.ok(t.legal.note.includes('relire'));

  // Sans responsable partenariats → président ; sans contribution → lignes à compléter.
  const ctx2 = fullContext();
  ctx2.members = ctx2.members.filter(m => m.mainRole !== 'responsable_partenariats');
  const doc2 = build(t, ctx2, { partnerName: 'ACME' });
  assert.equal(blocksOf(doc2, 'signatures')[0].slots[0].name, 'Alice Martin');
  assert.ok(blocksOf(doc2, 'signatures')[0].slots[0].image);
  assert.equal(blocksOf(doc2, 'heading').filter(h => h.text.startsWith('Article')).length, 9);
  assert.match(documentPlainText(doc2), /représenté\(e\) par ____/);
  // Sans raison sociale : ligne à compléter, aucun « le partenaire » en gras.
  const anonymous = documentPlainText(build(t, fullContext()));
  assert.match(anonymous, /^et _{10,}, représenté\(e\) par/m);
  assert.match(anonymous, /^Pour le Partenaire$/m);
});

test('Note de frais : total, montant en lettres, IBAN, avertissements', () => {
  const ctx = fullContext();
  const t = byId('note-de-frais');
  const member = MEMBERS.find(m => m.id === 'm4');
  const values = {
    purpose: 'Soirée d\'intégration',
    lines: [{ label: '12/09/2026 – Fournitures', amount: '12,50' }, { label: 'Transport', amount: 7.5 }],
    iban: 'FR76 3000 6000 0112 3456 7890 189',
  };
  const doc = build(t, ctx, values, member);
  assert.deepEqual(validateDocument(doc), []);
  assert.equal(doc.meta.confidential, true);
  assert.deepEqual(doc.meta.memberIds, ['m4']);
  const table = blocksOf(doc, 'table')[0];
  assert.deepEqual(table.rows[0], { n: '1', date: '12/09/2026', label: 'Fournitures', amount: '12,50 €' });
  assert.equal(table.rows.at(-1).amount, '**20,00 €**');
  const text = documentPlainText(doc);
  assert.match(text, /Montant total : \*\*20,00 €\*\* \(vingt euros\)/);
  assert.match(text, /FR76 3000 6000 0112 3456 7890 189/);
  assert.match(text, /Bon pour remboursement/);
  const slots = blocksOf(doc, 'signatures')[0].slots;
  assert.equal(slots[1].name, 'Bob Durand');
  assert.deepEqual(t.warnings(ctx, values), []);

  const warn = t.warnings(ctx, { ...values, iban: 'FR76 3000 6000 0112 3456 7890 188', lines: [...values.lines, { label: 'Repas', amount: 'douze' }] });
  assert.equal(warn.length, 2);
  assert.ok(warn.some(w => /Clé de contrôle/.test(w)));
  assert.ok(warn.some(w => /Ligne 3/.test(w)));
  assert.equal(t.warnings(ctx, { lines: [] })[0].startsWith('Aucune dépense'), true);

  // Sans IBAN : lignes à compléter ; sans lignes : tableau vierge.
  const blank = build(t, ctx, {}, member);
  assert.equal(blocksOf(blank, 'table')[0].blankRows, 6);
  assert.match(documentPlainText(blank), /IBAN : ____/);
});

test('Note de frais : abandon de frais prudent, sans IBAN imprimé', () => {
  const ctx = fullContext();
  const t = byId('note-de-frais');
  const doc = build(t, ctx, { waiver: true, iban: 'FR7630006000011234567890189', lines: [{ label: 'Affiches', amount: '30' }] }, ctx.members[0]);
  assert.deepEqual(validateDocument(doc), []);
  const text = documentPlainText(doc);
  assert.match(text, /renoncer expressément au remboursement/);
  assert.match(text, /que si l'association est éligible/);
  assert.match(text, /ne présume pas cette éligibilité/);
  assert.doesNotMatch(text, /FR76/);
  assert.doesNotMatch(text, /Bon pour remboursement/);
  assert.equal(blocksOf(doc, 'callout')[0].tone, 'legal');
});

test('Attestations d\'événement : une page par participant, doublons fusionnés, nom pluriel', () => {
  const ctx = fullContext();
  const t = byId('attestation-evenement');
  const values = {
    eventName: 'Hackathon de rentrée', eventDate: '2026-10-03', eventEndDate: '2026-10-04', place: 'IUT de Montreuil',
    duration: '2 jours', participants: ['Jean Dupont', '  jean   dupont ', 'Zoé Lambert', 'alice martin', ''], memberIds: ['m1', 'm5', 'inconnu'],
  };
  assert.deepEqual(eventParticipants(ctx, values).map(p => p.name), ['Alice Martin', 'Emma Moreau', 'Jean Dupont', 'Zoé Lambert']);
  const doc = build(t, ctx, values);
  assert.deepEqual(validateDocument(doc), []);
  assert.equal(blocksOf(doc, 'title').length, 4);
  assert.equal(blocksOf(doc, 'pageBreak').length, 3);
  assert.equal(blocksOf(doc, 'signatures').length, 4);
  assert.match(doc.meta.fileName, /^Attestations_participation_Hackathon/);
  assert.match(doc.meta.title, /4 participants/);
  assert.deepEqual(doc.meta.memberIds, ['m1', 'm5']);
  const text = documentPlainText(doc);
  assert.match(text, /atteste que \*\*Zoé Lambert\*\* a participé à l'événement « Hackathon de rentrée » organisé par BDE IUT de Montreuil du 3 octobre 2026 au 4 octobre 2026 \(IUT de Montreuil\)/);

  // Aucun participant : une attestation vierge.
  const blank = build(t, ctx, { eventName: 'Atelier CV' });
  assert.equal(blocksOf(blank, 'title').length, 1);
  assert.equal(blocksOf(blank, 'pageBreak').length, 0);
});

test('Budget prévisionnel : totaux, excédent / déficit / équilibre', () => {
  const ctx = fullContext();
  const t = byId('budget-previsionnel');
  const charges = [{ label: 'Salle', amount: '450' }, { label: 'Traiteur', amount: '750,50' }];
  const produits = [{ label: 'Billetterie', amount: '1000' }, { label: 'Partenaire', amount: '150' }];
  assert.deepEqual(budgetSummary({ charges, produits }), { charges: 1200.5, produits: 1150, balance: -50.5, status: 'deficit' });

  const doc = build(t, ctx, { projectName: 'Gala', charges, produits });
  assert.deepEqual(validateDocument(doc), []);
  const text = documentPlainText(doc);
  assert.match(text, /Total des charges\n1 200,50 €/);
  assert.match(text, /Déficit prévisionnel\n50,50 €/);
  assert.match(text, /cinquante euros et cinquante centimes/);
  assert.equal(blocksOf(doc, 'callout')[0].tone, 'warning');
  assert.equal(blocksOf(doc, 'table')[0].rows[1].share, '63 %');
  assert.equal(blocksOf(doc, 'signatures')[0].slots[0].name, 'Bob Durand');
  assert.ok(t.warnings(ctx, { charges, produits }).some(w => /déficitaire/.test(w)));

  const balanced = build(t, ctx, { projectName: 'Gala', charges: [{ label: 'A', amount: '100' }], produits: [{ label: 'B', amount: '100' }] });
  assert.match(documentPlainText(balanced), /budget est équilibré/);
  const surplus = build(t, ctx, { projectName: 'Gala', produits: [{ label: 'B', amount: '100' }] });
  assert.match(documentPlainText(surplus), /excédent prévisionnel de \*\*100,00 €\*\* \(cent euros\)/);
});
