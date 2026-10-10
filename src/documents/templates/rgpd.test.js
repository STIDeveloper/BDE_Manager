// Tests des modèles « rgpd » : mention d'information, registre des
// traitements auto-documenté, autorisation de droit à l'image.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDocument, documentPlainText } from '../model.js';
import templates, { registerStats } from './rgpd.js';
import { fullContext, minimalContext, build, MEMBERS } from './orgPart_fixtures.js';

const byId = (id) => templates.find(t => t.id === id);
const blocksOf = (doc, type) => doc.blocks.filter(b => b.type === type);

test('Chaque modèle produit un document valide (contexte complet et minimal)', () => {
  for (const t of templates) {
    assert.equal(t.category, 'rgpd');
    assert.ok(t.legal?.note);
    for (const ctx of [fullContext(), minimalContext()]) {
      const member = t.scope === 'member' ? ctx.members[0] || null : null;
      const doc = build(t, ctx, {}, member);
      assert.deepEqual(validateDocument(doc), [], `${t.id}`);
    }
  }
});

test('Mention d\'information : responsable, finalités, bases légales, droits 15 à 21, CNIL', () => {
  const ctx = fullContext();
  const t = byId('mention-information-rgpd');
  const doc = build(t, ctx, { includeAck: true });
  const text = documentPlainText(doc);
  assert.match(text, /BDE IUT de Montreuil \(BDE Montreuil\), association loi 1901.*représentée par Alice Martin, agissant en qualité de Président\(e\)/);
  assert.match(text, /contact@bde-montreuil\.example\.org/);
  const purposes = blocksOf(doc, 'table')[0].rows.map(r => r.purpose);
  for (const p of ['Gestion des adhésions', 'Organisation des activités', 'Communication interne', 'Google Drive', 'Recrutement', 'image']) {
    assert.ok(purposes.some(x => x.includes(p)), p);
  }
  const bases = blocksOf(doc, 'table')[0].rows.map(r => r.basis).join(' ');
  for (const art of ['6.1.a', '6.1.b', '6.1.f']) assert.ok(bases.includes(art), art);
  for (const art of [15, 16, 17, 18, 20, 21]) assert.match(text, new RegExp(`article ${art}\\)`));
  assert.match(text, /articles 15 à 21 du RGPD/);
  assert.match(text, /CNIL/);
  assert.match(text, /aucun serveur/);
  assert.equal(blocksOf(doc, 'blankLines').length, 1);

  const custom = build(t, ctx, { includeRecruitment: false, includeImage: false, retentionMembers: 'Trois ans.' });
  const customText = documentPlainText(custom);
  assert.doesNotMatch(customText, /Recrutement des membres actifs/);
  assert.match(customText, /Trois ans\./);

  const minimal = build(t, minimalContext());
  assert.match(documentPlainText(minimal), /Contact\n_{10,}/);
});

test('Registre : statistiques dérivées des données réelles de l\'application', () => {
  const s = registerStats(fullContext());
  assert.equal(s.members, 8);
  assert.equal(s.withEmail, 7);
  assert.equal(s.withPhone, 3);
  assert.equal(s.driveMembers, 2);
  assert.equal(s.candidates, 3);
  assert.equal(s.vaultEntries, 3);
  assert.equal(s.documents, 1);
  assert.equal(s.signatures, 1);
  const cats = Object.fromEntries(s.memberCategories.map(c => [c.label, c.count]));
  assert.equal(cats['Identité (nom, prénom)'], 8);
  assert.equal(cats['Rôle et pôle'], 8);
  assert.equal(cats['Badges (accès, compétences)'], 4);
  assert.equal(cats['Notes libres'], 1);
  assert.equal(cats['Date de naissance'], 2);
  assert.equal(cats['Consentement au droit à l\'image'], 1);
  assert.equal(cats['Adresse postale'], undefined, 'catégorie absente des données → omise');
  const cand = Object.fromEntries(s.candidateCategories.map(c => [c.label, c.count]));
  assert.equal(cand.Email, 3);
  assert.equal(cand['Téléphone'], 1);
  assert.equal(cand['Motivations (réponses libres)'], 2);
  assert.equal(cand.Alternance, 2);
});

test('Registre : cinq traitements, volumes réels, mesures de sécurité exactes', () => {
  const ctx = fullContext();
  const doc = build(byId('registre-traitements'), ctx);
  assert.equal(doc.meta.confidential, true);
  const headings = blocksOf(doc, 'heading').map(h => h.text).filter(h => h.startsWith('Traitement n°'));
  assert.deepEqual(headings, [
    'Traitement n° 1 — Gestion des membres', 'Traitement n° 2 — Gouvernance des accès Drive',
    'Traitement n° 3 — Recrutement des membres actifs', 'Traitement n° 4 — Coffre-fort des identifiants',
    'Traitement n° 5 — Documents émis',
  ]);
  const text = documentPlainText(doc);
  assert.match(text, /8 membres, dont 7 avec email et 3 avec téléphone renseigné/);
  assert.match(text, /Téléphone \(3\/8\)/);
  assert.match(text, /3 candidatures actuellement chargées/);
  assert.match(text, /Email \(3\/3\)/);
  assert.match(text, /AES-GCM 256 bits/);
  assert.match(text, /PBKDF2-SHA-256 \(250 000 itérations\)/);
  assert.match(text, /3 entrées au moment de l'édition/);
  assert.match(text, /données stockées localement sur l'appareil, aucun envoi à un serveur par l'application/i);
  assert.match(text, /1 signature manuscrite numérisée/);
  // Les valeurs du coffre et les données personnelles ne figurent jamais au registre.
  assert.doesNotMatch(text, /Instagram|alice\.martin|06 12/);

  const locked = build(byId('registre-traitements'), fullContext({ vaultEntryLabels: null, candidates: [] }));
  const lockedText = documentPlainText(locked);
  assert.match(lockedText, /coffre verrouillé/);
  assert.match(lockedText, /Aucune candidature n'est actuellement chargée/);

  const empty = documentPlainText(build(byId('registre-traitements'), minimalContext()));
  assert.match(empty, /0 membre, dont 0 avec email et 0 avec téléphone renseigné/);
  assert.match(empty, /Aucune donnée actuellement enregistrée/);
});

test('Registre : suggestion annuelle tant qu\'il n\'a pas été édité', () => {
  const t = byId('registre-traitements');
  assert.equal(t.suggest(fullContext())[0].priority, 'medium');
  assert.deepEqual(t.suggest(minimalContext()), []);
  const ctx = fullContext();
  ctx.documentLog = [{ templateId: 'registre-traitements', createdAt: '2026-10-01T09:00:00.000Z' }];
  assert.deepEqual(t.suggest(ctx), []);
});

test('Droit à l\'image : supports à cocher, gratuité, retrait, mineur, article 9 du Code civil', () => {
  const ctx = fullContext();
  const t = byId('autorisation-droit-image');
  const adult = MEMBERS.find(m => m.id === 'm3');
  const doc = build(t, ctx, {}, adult);
  assert.deepEqual(validateDocument(doc), []);
  const text = documentPlainText(doc);
  assert.match(text, /Je soussigné\(e\) \*\*Clarisse Petit\*\*/);
  assert.match(text, /titre gratuit/);
  assert.match(text, /retirer mon consentement à tout moment/);
  assert.match(text, /article 9 du Code civil/);
  assert.match(text, /dans le cadre suivant : activités et événements de l'association, année universitaire 2026-2027./);
  assert.match(text, /pour une durée d'un an/);
  const checklists = blocksOf(doc, 'checklist');
  assert.equal(checklists.length, 2);
  assert.deepEqual(checklists[1].items.map(i => i.label), [
    'Réseaux sociaux de l\'association', 'Site internet de l\'association',
    'Affiches, flyers et supports imprimés', 'Supports internes (lettre d\'information, archives, rapport d\'activité)',
  ]);
  assert.ok(checklists.every(c => c.items.every(i => !i.checked)), 'aucune case pré-cochée');
  assert.equal(blocksOf(doc, 'signatures')[0].slots.length, 1);

  // Mineur détecté par la date de naissance → représentant légal.
  const minor = MEMBERS.find(m => m.id === 'm8');
  const minorField = t.fields.find(f => f.key === 'minor');
  assert.equal(minorField.default(ctx, minor), true);
  assert.equal(minorField.default(ctx, adult), false);
  const minorDoc = build(t, ctx, {}, minor);
  assert.equal(blocksOf(minorDoc, 'signatures')[0].slots.length, 2);
  assert.match(documentPlainText(minorDoc), /Nom et prénom du représentant légal/);
});

test('Droit à l\'image : suggestion pour les membres sans consentement enregistré', () => {
  const t = byId('autorisation-droit-image');
  const [s] = t.suggest(fullContext());
  assert.equal(s.memberIds.length, 7);
  assert.ok(!s.memberIds.includes('m5'));
  assert.match(s.reason, /7 membres n'ont pas/);
  assert.equal(t.memberFilter(MEMBERS[4]), false);
  assert.deepEqual(t.suggest(minimalContext()), []);
});
