// Tests des modèles « gouvernance » : structure valide, contenu attendu,
// avertissements et suggestions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import templates from './gouvernance.js';
import { createDefaultCatalog } from '../../core/catalog.js';
import { buildContext } from '../context.js';
import { validateDocument, documentPlainText } from '../model.js';
import { generateDocuments, defaultValues, getTemplate } from '../registry.js';

const TODAY = '2026-10-10';

function makeState({ minimal = false, documentLog = [] } = {}) {
  const catalog = createDefaultCatalog();
  // Rôle personnalisé de niveau bureau (doit apparaître dans la liste des dirigeants).
  catalog.roles.charge_rse = {
    id: 'charge_rse', label: 'Chargé(e) de mission RSE', level: 'bureau', pole: 'bureau',
    leadership: false, essential: false, capacity: 1, order: 9, aliases: [], custom: true,
  };
  const M = (id, firstName, lastName, mainRole, extra = {}) => ({ id, firstName, lastName, mainRole, email: `${id}@exemple.fr`, badges: [], notes: '', ...extra });
  const members = [
    M('m1', 'Léa', 'Martin', 'president', { profession: 'Étudiante', nationality: 'Française', address: '12 rue des Lilas, 93100 Montreuil', joinedAt: '2025-09-15', feePaidAt: '2025-09-20', feeAmount: 10, phone: '06 00 00 00 01' }),
    M('m2', 'Adrien', 'Bernard', 'vice_president', { nationality: 'Française', joinedAt: '2025-09-16', feePaidAt: '2025-09-21', feeAmount: 10 }),
    M('m3', 'Ilona', 'Dubois', 'secretaire', { address: '3 avenue Foch, 75016 Paris', joinedAt: '2024-10-01' }),
    M('m4', 'Karim', 'Petit', 'tresorier', { nationality: 'Marocaine', address: '8 rue Pasteur, 93100 Montreuil', joinedAt: '2025-01-10', feePaidAt: '2025-09-25', feeAmount: 10 }),
    M('m5', 'Sarah', 'Lefèvre', 'charge_rse', { joinedAt: '2026-09-02' }),
    M('m6', 'Thomas', 'Moreau', 'responsable_communication'),
    M('m7', 'Clarisse', 'Garcia', 'membre_communication'),
    M('m8', 'Yanis', 'Roux', 'responsable_projets', { joinedAt: '2023-09-12' }),
    M('m9', 'Emma', 'Fournier', 'membre_projets'),
    M('m10', 'Lucas', 'Girard', 'responsable_sport'),
    M('m11', 'Manon', 'André', '', { legacyMainRole: 'Ancien rôle libre' }),
    M('m12', 'Maxence', 'Mercier', ''),
  ];
  const organization = minimal
    ? { name: 'BDE Minimal' }
    : {
      name: 'Bureau des Étudiants de l\'IUT de Montreuil', shortName: 'BDE IUT Montreuil',
      rna: 'W931234567', address: '140 rue de la Nouvelle France', postalCode: '93100', city: 'Montreuil',
      email: 'bde@exemple.fr', school: 'IUT de Montreuil', prefecture: 'Préfecture de la Seine-Saint-Denis',
      statutesDate: '2020-09-01', agNoticeDays: 15, agQuorumPercent: 25,
    };
  return { ...catalog, members, organization, documentLog };
}

const ctxFull = (opts) => buildContext(makeState(opts), { today: TODAY });
const ctxMin = () => buildContext(makeState({ minimal: true }), { today: TODAY });
const T = (id) => templates.find(t => t.id === id);

function gen(id, ctx, values = {}, memberIds = []) {
  const docs = generateDocuments(T(id), ctx, values, memberIds);
  docs.forEach(doc => assert.deepEqual(validateDocument(doc), [], `${id} : document invalide`));
  return docs;
}
const text = (doc) => documentPlainText(doc);
const blocksOf = (doc, type) => doc.blocks.filter(b => b.type === type);

// ------------------------------------------------------------
// Contrat général
// ------------------------------------------------------------

test('8 modèles, ids uniques, catégorie gouvernance, enregistrés dans le registre', () => {
  const ids = templates.map(t => t.id);
  assert.deepEqual(ids, ['convocation-ag', 'feuille-emargement', 'pouvoir-ag', 'pv-ag', 'cr-reunion-bureau', 'liste-dirigeants', 'delegation-pouvoir', 'registre-membres']);
  templates.forEach(t => {
    assert.equal(t.category, 'gouvernance');
    assert.ok(t.title && t.description && t.icon);
    assert.match(t.legal.note, /fixées par tes statuts/);
    assert.equal(getTemplate(t.id), t);
    assert.ok(['member', 'organization'].includes(t.scope));
  });
});

test('génération en un clic : tous les modèles, profil complet et minimal, sans valeur manquante', () => {
  for (const ctx of [ctxFull(), ctxMin()]) {
    templates.forEach(t => {
      const docs = gen(t.id, ctx, {}, t.scope === 'member' ? ['m7'] : []);
      assert.equal(docs.length, 1, t.id);
      assert.equal(docs[0].meta.templateId, t.id);
      const values = defaultValues(t, ctx, t.scope === 'member' ? ctx.members[6] : null);
      if (t.warnings) assert.ok(Array.isArray(t.warnings(ctx, values, ctx.members[6])));
    });
  }
});

test('contexte vide (aucun membre) : documents toujours valides', () => {
  const ctx = buildContext({ ...createDefaultCatalog(), members: [], organization: {} }, { today: TODAY });
  templates.filter(t => t.scope === 'organization').forEach(t => gen(t.id, ctx));
  assert.deepEqual(T('liste-dirigeants').suggest(ctx), []);
});

// ------------------------------------------------------------
// 1. Convocation
// ------------------------------------------------------------

test('convocation : date par défaut conforme au délai, aucun avertissement', () => {
  const ctx = ctxFull();
  const t = T('convocation-ag');
  const values = defaultValues(t, ctx);
  assert.equal(values.date, '2026-10-26'); // 10/10 + 15 j = dimanche 25 → lundi 26
  assert.deepEqual(t.warnings(ctx, values), []);
  const [doc] = gen('convocation-ag', ctx);
  const s = text(doc);
  assert.match(s, /Convocation à l'assemblée générale ordinaire/);
  assert.match(s, /lundi 26 octobre 2026 à 18 h 30/);
  assert.match(s, /IUT de Montreuil/);
  assert.match(s, /Présentation et approbation du rapport moral/);
  assert.match(s, /quitus/);
  assert.match(s, /au moins 25 % des membres/);
  assert.match(s, /pouvoir joint à la présente convocation/);
  assert.match(s, /Bon pour pouvoir/);
  assert.ok(blocksOf(doc, 'pageBreak').length === 1, 'pouvoir joint');
  assert.equal(blocksOf(doc, 'signatures')[0].slots[0].name, 'Léa Martin');
});

test('convocation : avertissement si le délai statutaire n\'est pas respecté', () => {
  const ctx = ctxFull();
  const t = T('convocation-ag');
  const values = { ...defaultValues(t, ctx), date: '2026-10-16' };
  const w = t.warnings(ctx, values);
  assert.ok(w.includes('La convocation est envoyée 6 jours avant l\'AG alors que les statuts prévoient 15 jours.'), w.join(' | '));
  // Le document reste généré normalement.
  gen('convocation-ag', ctx, { date: '2026-10-16' });
  // Délai de 8 jours dans les statuts → pas d'alerte pour 10 jours.
  const ctx8 = buildContext({ ...makeState(), organization: { ...makeState().organization, agNoticeDays: 8 } }, { today: TODAY });
  assert.deepEqual(t.warnings(ctx8, { ...defaultValues(t, ctx8), date: '2026-10-20' }), []);
});

test('convocation extraordinaire : ordre du jour adapté, sans pouvoir joint', () => {
  const [doc] = gen('convocation-ag', ctxFull(), { type: 'extraordinaire', joindrePouvoir: false, pouvoirsMax: 2 });
  const s = text(doc);
  assert.match(s, /assemblée générale extraordinaire/);
  assert.match(s, /Vote sur la modification des statuts/);
  assert.doesNotMatch(s, /rapport moral/);
  assert.match(s, /ne peut détenir plus de 2 pouvoirs/);
  assert.equal(blocksOf(doc, 'pageBreak').length, 0);
  // Ordre du jour personnalisé conservé
  const [custom] = gen('convocation-ag', ctxFull(), { type: 'extraordinaire', ordreDuJour: ['Dissolution de l\'association'] });
  assert.match(text(custom), /Dissolution de l'association/);
});

test('convocation : lieu et date absents → lignes à compléter', () => {
  const ctx = ctxMin();
  const [doc] = gen('convocation-ag', ctx, { lieu: '', date: '' });
  assert.match(text(doc), /____/);
  const w = T('convocation-ag').warnings(ctx, { ...defaultValues(T('convocation-ag'), ctx), lieu: '', date: '' });
  assert.ok(w.some(x => /lieu/.test(x)));
  assert.ok(w.some(x => /date/.test(x)));
});

// ------------------------------------------------------------
// 2. Feuille d'émargement
// ------------------------------------------------------------

test('émargement : tous les membres triés, colonnes, lignes libres, paysage', () => {
  const [doc] = gen('feuille-emargement', ctxFull(), { paysage: true, lignesLibres: 8 });
  const table = blocksOf(doc, 'table')[0];
  assert.equal(table.rows.length, 12);
  assert.equal(table.rows[0].nom, 'ANDRÉ');
  assert.equal(table.rows[0].fonction, 'Ancien rôle libre');
  assert.deepEqual(table.columns.map(c => c.label), ['N°', 'Nom', 'Prénom', 'Fonction', 'Pouvoir donné à', 'Signature']);
  assert.equal(table.blankRows, 8);
  assert.ok(table.columns.reduce((s, c) => s + c.width, 0) <= 1.0001);
  assert.equal(doc.meta.orientation, 'landscape');
  assert.equal(doc.meta.memberIds.length, 12);
  assert.equal(blocksOf(doc, 'signatures').length, 1);
});

test('émargement réunion de bureau : sélection, sans colonne pouvoir', () => {
  const [doc] = gen('feuille-emargement', ctxFull(), { contexte: 'bureau', membres: ['m4', 'm1', 'm3'] });
  const table = blocksOf(doc, 'table')[0];
  assert.deepEqual(table.rows.map(r => r.prenom), ['Ilona', 'Léa', 'Karim']);
  assert.ok(!table.columns.some(c => c.key === 'pouvoir'));
  assert.equal(doc.meta.orientation, 'portrait');
  assert.match(text(doc), /Réunion de bureau/);
});

// ------------------------------------------------------------
// 3. Pouvoir
// ------------------------------------------------------------

test('pouvoir : un document par mandant, mandataire facultatif', () => {
  const ctx = ctxFull();
  const docs = gen('pouvoir-ag', ctx, { mandataire: 'm2' }, ['m7', 'm9']);
  assert.equal(docs.length, 2);
  const s = text(docs[0]);
  assert.match(s, /Je soussigné\(e\) \*\*Clarisse Garcia\*\*/);
  assert.match(s, /pouvoir à \*\*Adrien Bernard\*\*/);
  const slots = blocksOf(docs[0], 'signatures')[0].slots;
  assert.equal(slots[0].mention, 'Bon pour pouvoir');
  assert.deepEqual(docs[0].meta.memberIds, ['m7', 'm2']);
  // Sans mandataire → ligne à compléter
  const [blank] = gen('pouvoir-ag', ctx, { mandataire: '' }, ['m7']);
  assert.match(text(blank), /pouvoir à \*\*_{5,}\*\*/);
  // Mandant = mandataire → avertissement, et mandataire ignoré
  assert.ok(T('pouvoir-ag').warnings(ctx, { mandataire: 'm7', date: '2026-10-26' }, ctx.members[6]).length === 1);
  const [self] = gen('pouvoir-ag', ctx, { mandataire: 'm7' }, ['m7']);
  assert.deepEqual(self.meta.memberIds, ['m7']);
});

// ------------------------------------------------------------
// 4. Procès-verbal d'AG
// ------------------------------------------------------------

test('PV : quorum atteint, résolutions par défaut adoptées à l\'unanimité', () => {
  const ctx = ctxFull();
  const [doc] = gen('pv-ag', ctx);
  const s = text(doc);
  assert.match(s, /Quorum atteint/);
  assert.match(s, /12 membres présents ou représentés sur 12 membres/);
  assert.match(s, /25 % des membres, soit 3 membres, est atteint/);
  assert.match(s, /Première résolution — Approbation du rapport moral/);
  assert.match(s, /Cette résolution est adoptée à l'unanimité \(12 pour, 0 contre, 0 abstention\)\./);
  assert.match(s, /majorité simple des suffrages exprimés/);
  assert.equal(blocksOf(doc, 'callout').length, 0);
  const sig = blocksOf(doc, 'signatures')[0].slots;
  assert.equal(sig[0].name, 'Léa Martin');
  assert.equal(sig[1].name, 'Ilona Dubois');
  assert.deepEqual(T('pv-ag').warnings(ctx, defaultValues(T('pv-ag'), ctx)), []);
});

test('PV : chiffres du quorum, majorité simple, égalité et rejet', () => {
  const ctx = ctxFull();
  const values = {
    presents: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8'],
    autresPresents: 4,
    representes: 3,
    totalMembres: 40,
    resolutions: [
      { title: 'Approbation du rapport moral', text: 'L\'assemblée approuve le rapport moral.', for: 12, against: 2, abstention: 1 },
      { title: 'Achat d\'une sono', text: '', for: 7, against: 7, abstention: 1 },
      { title: 'Hausse de la cotisation', text: '', for: 3, against: 10, abstention: 2 },
      { title: '', text: '', for: '', against: '', abstention: '' }, // ligne vide ignorée
    ],
    elections: ['Présidente : Léa Martin, élue avec 13 voix'],
    questionsDiverses: 'Un membre demande la date du prochain gala.',
  };
  const [doc] = gen('pv-ag', ctx, values);
  const s = text(doc);
  assert.match(s, /15 membres présents ou représentés sur 40 membres \(37,5 %\)/);
  assert.match(s, /soit 10 membres, est atteint/);
  assert.match(s, /Cette résolution est adoptée à la majorité \(12 pour, 2 contre, 1 abstention\)\./);
  assert.match(s, /rejetée, faute de majorité/);
  assert.match(s, /Cette résolution est rejetée \(3 pour, 10 contre, 2 abstentions\)\./);
  assert.match(s, /Présidente : Léa Martin/);
  assert.match(s, /prochain gala/);
  const table = blocksOf(doc, 'table')[0];
  assert.equal(table.rows.length, 3);
  assert.deepEqual(table.rows.map(r => r.resultat), ['Adoptée', 'Rejetée', 'Rejetée']);
  const kv = Object.fromEntries(blocksOf(doc, 'keyValue')[0].rows);
  assert.equal(kv['Membres présents'], '12');
  assert.equal(kv['Membres représentés'], '3');
  assert.equal(kv['Nombre total de membres'], '40');
});

test('PV : quorum non atteint → encadré d\'alerte et mention des statuts', () => {
  const ctx = ctxFull();
  const values = { presents: ['m1', 'm2', 'm3'], representes: 2, totalMembres: 40 };
  const [doc] = gen('pv-ag', ctx, values);
  const callouts = blocksOf(doc, 'callout');
  assert.equal(callouts.length, 1);
  assert.equal(callouts[0].tone, 'warning');
  assert.match(callouts[0].text, /Quorum non atteint : 5 membres présents ou représentés sur 40 membres/);
  assert.match(callouts[0].text, /10 membres sont requis/);
  assert.match(text(doc), /susceptibles d'être contestées au regard des statuts/);
  const w = T('pv-ag').warnings(ctx, { ...defaultValues(T('pv-ag'), ctx), ...values });
  assert.ok(w.some(x => /Quorum non atteint/.test(x)));
  // Les résolutions par défaut (12 voix) dépassent les 5 votants → alerte
  assert.ok(w.some(x => /votes comptés pour seulement 5/.test(x)));
});

test('PV : majorité des deux tiers et majorité absolue', () => {
  const ctx = ctxFull();
  const res = [{ title: 'Modification des statuts', text: '', for: 8, against: 4, abstention: 3 }];
  const [twoThirds] = gen('pv-ag', ctx, { type: 'extraordinaire', majorite: 'deux_tiers', resolutions: res, totalMembres: 12 });
  assert.match(text(twoThirds), /adoptée à la majorité des deux tiers \(8 pour, 4 contre, 3 abstentions\)/);
  assert.match(text(twoThirds), /Procès-verbal de l'assemblée générale extraordinaire/);
  // Absolue : 12 présents → 7 voix requises, 8 pour → adoptée ; 6 pour → rejetée
  const [abs] = gen('pv-ag', ctx, { majorite: 'absolue', resolutions: [res[0], { title: 'Autre', for: 6, against: 2, abstention: 4 }] });
  const s = text(abs);
  assert.match(s, /adoptée à la majorité absolue \(8 pour/);
  assert.match(s, /faute d'avoir recueilli la majorité absolue des membres présents ou représentés, soit 7 voix/);
  assert.match(s, /au moins 7 voix sur 12 membres présents ou représentés/);
});

test('PV : quorum statutaire à 0 % et aucun vote exprimé', () => {
  const [doc] = gen('pv-ag', ctxFull(), { quorumPercent: 0, resolutions: [{ title: 'Test', for: 0, against: 0, abstention: 5 }] });
  const s = text(doc);
  assert.match(s, /Aucun quorum prévu/);
  assert.match(s, /Aucun suffrage n'ayant été exprimé/);
});

// ------------------------------------------------------------
// 5. Compte rendu de réunion de bureau
// ------------------------------------------------------------

test('CR de bureau : participants par défaut = bureau, tableau des actions analysé', () => {
  const ctx = ctxFull();
  const [doc] = gen('cr-reunion-bureau', ctx, {
    excuses: ['m6'],
    decisions: ['Le gala aura lieu le 12 décembre.'],
    actions: ['Réserver la salle — Léa — 2026-11-15', 'Relancer les sponsors | Karim Petit', 'Mettre à jour le site'],
    prochaineDate: '2026-10-24', prochaineHeure: '12:30',
  });
  const s = text(doc);
  assert.match(s, /Léa Martin — Président\(e\)/);
  assert.match(s, /Sarah Lefèvre — Chargé\(e\) de mission RSE/);
  assert.match(s, /Excusé\(e\)s : Thomas Moreau/);
  assert.match(s, /samedi 24 octobre 2026 à 12 h 30/);
  const table = blocksOf(doc, 'table')[0];
  assert.deepEqual(table.columns.map(c => c.label), ['Action', 'Responsable', 'Échéance']);
  assert.deepEqual(table.rows[0], { action: 'Réserver la salle', owner: 'Léa Martin', due: '15/11/2026' });
  assert.deepEqual(table.rows[1], { action: 'Relancer les sponsors', owner: 'Karim Petit', due: '' });
  assert.equal(table.rows[2].owner, '');
  assert.deepEqual(doc.meta.memberIds, ['m1', 'm2', 'm3', 'm4', 'm5']);
  // Le rédacteur est la secrétaire ; la présidente co-signe.
  assert.deepEqual(blocksOf(doc, 'signatures')[0].slots.map(x => x.name), ['Ilona Dubois', 'Léa Martin']);
});

test('CR de bureau : sans actions ni décisions → lignes à remplir', () => {
  const [doc] = gen('cr-reunion-bureau', ctxFull());
  assert.equal(blocksOf(doc, 'table')[0].blankRows, 3);
  assert.ok(blocksOf(doc, 'blankLines').length >= 2);
});

// ------------------------------------------------------------
// 6. Liste des dirigeants
// ------------------------------------------------------------

test('liste des dirigeants : membres de niveau bureau, champs manquants laissés en blanc', () => {
  const ctx = ctxFull();
  const [doc] = gen('liste-dirigeants', ctx, { dateElection: '2026-05-20', autres: ['m8'] });
  const table = blocksOf(doc, 'table')[0];
  assert.deepEqual(table.rows.map(r => r.nom), ['MARTIN Léa', 'BERNARD Adrien', 'DUBOIS Ilona', 'PETIT Karim', 'LEFÈVRE Sarah', 'ROUX Yanis']);
  assert.deepEqual(table.columns.map(c => c.label), ['Fonction', 'NOM Prénom', 'Profession', 'Nationalité', 'Adresse (domicile)']);
  assert.equal(table.rows[0].adresse, '12 rue des Lilas, 93100 Montreuil');
  assert.equal(table.rows[0].profession, 'Étudiante');
  assert.equal(table.rows[1].profession, 'Étudiant(e)');
  assert.match(table.rows[1].adresse, /^_+$/);
  assert.match(table.rows[2].nationalite, /^_+$/);
  const s = text(doc);
  assert.match(s, /article 5 de la loi du 1er juillet 1901/);
  assert.match(s, /article 1er du décret du 16 août 1901/);
  assert.match(s, /mercredi|20 mai 2026/);
  assert.match(s, /trois mois/);
  assert.match(s, /Le Compte Asso/);
  assert.match(s, /W931234567/);
  // Seuls les membres du bureau sont mémorisés (comparaison future).
  assert.deepEqual(doc.meta.memberIds, ['m1', 'm2', 'm3', 'm4', 'm5']);
  assert.equal(doc.meta.composition.m1, 'president');
  const slots = blocksOf(doc, 'signatures')[0].slots;
  assert.deepEqual(slots.map(x => x.name), ['Léa Martin', 'Ilona Dubois']);
  const w = T('liste-dirigeants').warnings(ctx, { ...defaultValues(T('liste-dirigeants'), ctx), autres: ['m8'] });
  assert.ok(w.some(x => /sans adresse renseignée/.test(x)));
  assert.ok(w.some(x => /date de l'instance/.test(x)));
});

test('liste des dirigeants : suggestions selon le registre des documents', () => {
  const t = T('liste-dirigeants');
  // Aucune liste émise
  const none = t.suggest(ctxFull());
  assert.equal(none.length, 1);
  assert.equal(none[0].priority, 'high');
  assert.match(none[0].title, /3 mois/);
  // Liste émise avec la même composition → rien
  const sameLog = [
    { id: 'l1', templateId: 'liste-dirigeants', createdAt: '2026-06-01T10:00:00.000Z', memberIds: ['m5', 'm4', 'm3', 'm2', 'm1'], values: {} },
    { id: 'x', templateId: 'pv-ag', createdAt: '2026-09-01T10:00:00.000Z', memberIds: ['m1'], values: {} },
  ];
  assert.deepEqual(t.suggest(ctxFull({ documentLog: sameLog })), []);
  // Dernière liste (la plus récente) avec un ancien trésorier → suggestion
  const changedLog = [
    { id: 'old', templateId: 'liste-dirigeants', createdAt: '2025-01-01T10:00:00.000Z', memberIds: ['m1', 'm2', 'm3', 'm4', 'm5'] },
    { id: 'l2', templateId: 'liste-dirigeants', createdAt: '2026-06-01T10:00:00.000Z', memberIds: ['m1', 'm2', 'm3', 'gone', 'm5'] },
  ];
  const changed = t.suggest(ctxFull({ documentLog: changedLog }));
  assert.equal(changed.length, 1);
  assert.equal(changed[0].title, 'Composition du bureau modifiée : déclaration à faire dans les 3 mois');
  assert.equal(changed[0].priority, 'high');
  assert.match(changed[0].reason, /Karim Petit a rejoint le bureau/);
  assert.match(changed[0].reason, /1 ancien membre a quitté le bureau/);
  assert.match(changed[0].reason, /1er juin 2026/);
  assert.deepEqual(changed[0].memberIds, ['m1', 'm2', 'm3', 'm4', 'm5']);
  // Changement de fonction détecté si la composition a été mémorisée
  const swapLog = [{ id: 'l3', templateId: 'liste-dirigeants', createdAt: '2026-06-01', memberIds: ['m1', 'm2', 'm3', 'm4', 'm5'], meta: { composition: { m1: 'vice_president', m2: 'president', m3: 'secretaire', m4: 'tresorier', m5: 'charge_rse' } } }];
  const swap = t.suggest(ctxFull({ documentLog: swapLog }));
  assert.equal(swap.length, 1);
  assert.match(swap[0].reason, /Léa Martin et Adrien Bernard ont changé de fonction/);
  // Document émis → nouvelle entrée → plus de suggestion (aller-retour complet)
  const ctx = ctxFull({ documentLog: changedLog });
  const [doc] = gen('liste-dirigeants', ctx);
  const roundTrip = [{ id: 'l4', templateId: doc.meta.templateId, createdAt: '2026-10-10T09:00:00.000Z', memberIds: doc.meta.memberIds, composition: doc.meta.composition }, ...changedLog];
  assert.deepEqual(t.suggest(ctxFull({ documentLog: roundTrip })), []);
});

// ------------------------------------------------------------
// 7. Délégation de pouvoir
// ------------------------------------------------------------

test('délégation bancaire : délégant, délégataire, plafond, durée, mentions', () => {
  const ctx = ctxFull();
  const [doc] = gen('delegation-pouvoir', ctx, { banque: 'la Banque Exemple', plafond: 500 });
  const s = text(doc);
  assert.match(s, /Je soussigné\(e\) \*\*Léa Martin\*\*, agissant en qualité de président\(e\)/);
  assert.match(s, /\*\*Karim Petit\*\*, trésorier\(ère\)/);
  assert.match(s, /opérations bancaires courantes .* ouverts auprès de la Banque Exemple/);
  assert.match(s, /dans la limite de 500,00 € par opération/);
  assert.match(s, /prend effet le 10 octobre 2026 et prend fin le 31 août 2027/);
  const sigs = blocksOf(doc, 'signatures');
  assert.equal(sigs[0].slots[0].mention, 'Lu et approuvé');
  assert.equal(sigs[0].slots[1].mention, 'Bon pour acceptation');
  assert.equal(sigs.length, 2, 'spécimen de signature pour la banque');
  assert.deepEqual(T('delegation-pouvoir').warnings(ctx, defaultValues(T('delegation-pouvoir'), ctx)), []);
});

test('délégation : objet « autre », avertissements', () => {
  const ctx = ctxFull();
  const t = T('delegation-pouvoir');
  const [doc] = gen('delegation-pouvoir', ctx, { objet: 'autre', precisions: 'signer les bons de commande du gala', delegataire: 'm5', dateFin: '2026-12-31' });
  assert.match(text(doc), /à l'effet de signer les bons de commande du gala\./);
  assert.match(text(gen('delegation-pouvoir', ctx)[0]), /à l'effet d'effectuer les opérations bancaires/);
  assert.match(text(doc), /chargé\(e\) de mission RSE/);
  assert.equal(blocksOf(doc, 'signatures').length, 1);
  const w = t.warnings(ctx, { ...defaultValues(t, ctx), objet: 'autre', delegataire: 'm1', dateFin: '2026-01-01' });
  assert.ok(w.some(x => /même personne/.test(x)));
  assert.ok(w.some(x => /antérieure/.test(x)));
  assert.ok(w.some(x => /Précise/.test(x)));
});

// ------------------------------------------------------------
// 8. Registre des membres
// ------------------------------------------------------------

test('registre : confidentiel, sans coordonnées par défaut, tri par nom', () => {
  const [doc] = gen('registre-membres', ctxFull());
  assert.equal(doc.meta.confidential, true);
  assert.equal(doc.meta.orientation, 'portrait');
  const table = blocksOf(doc, 'table')[0];
  assert.equal(table.rows.length, 12);
  assert.ok(!table.columns.some(c => c.key === 'email'));
  assert.equal(table.rows[0].nom, 'ANDRÉ Manon');
  const martin = table.rows.find(r => r.nom === 'MARTIN Léa');
  assert.equal(martin.cotisation, 'Payée le 20/09/2025 (10,00 €)');
  assert.equal(martin.adhesion, '15/09/2025');
  assert.equal(martin.pole, 'Bureau');
  assert.equal(table.rows.find(r => r.nom === 'MERCIER Maxence').cotisation, 'Non renseignée');
  const s = text(doc);
  assert.doesNotMatch(s, /@exemple\.fr|06 00/);
  assert.match(s, /Document confidentiel, à usage interne/);
  assert.match(s, /3 sur 12/);
});

test('registre : coordonnées (paysage), tri par pôle et par date d\'adhésion', () => {
  const ctx = ctxFull();
  const [withContacts] = gen('registre-membres', ctx, { contacts: true });
  assert.equal(withContacts.meta.orientation, 'landscape');
  assert.match(text(withContacts), /m1@exemple\.fr/);
  const [byPole] = gen('registre-membres', ctx, { tri: 'pole' });
  const poles = blocksOf(byPole, 'table')[0].rows.map(r => r.pole);
  assert.equal(poles[0], 'Bureau');
  assert.equal(blocksOf(byPole, 'table')[0].rows[0].nom, 'MARTIN Léa');
  assert.equal(poles.at(-1), '—');
  const [byDate] = gen('registre-membres', ctx, { tri: 'adhesion' });
  const rows = blocksOf(byDate, 'table')[0].rows;
  assert.equal(rows[0].nom, 'ROUX Yanis');
  assert.equal(rows.at(-1).adhesion, '—');
});
