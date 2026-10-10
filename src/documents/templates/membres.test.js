// Tests des modèles « membres » : chaque modèle × plusieurs profils de membres
// × deux profils d'association (complet / quasi vide). Exécution :
//   node --test src/documents/templates/membres.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import membres from './membres.js';
import { genericMissions, ROLE_MISSIONS } from './membresTexts.js';
import { buildContext } from '../context.js';
import { validateDocument, documentPlainText } from '../model.js';
import { generateDocuments, defaultValues, collectSuggestions } from '../registry.js';
import { createDefaultCatalog } from '../../core/catalog.js';

const TODAY = '2026-10-10';

function makeState(organization) {
  const catalog = createDefaultCatalog();
  catalog.poles.creatif = { id: 'creatif', label: 'Créatif', short: 'Créa', color: 'pink', emoji: '🎨', order: 9, affinity: {}, custom: true };
  catalog.roles.responsable_design = {
    id: 'responsable_design', label: 'Responsable Design', level: 'responsable', pole: 'creatif',
    leadership: true, essential: false, capacity: 1, order: 0, aliases: [], custom: true,
  };
  const members = [
    {
      id: 'm_pres', firstName: 'Camille', lastName: 'Martin', email: 'camille@bde.fr', mainRole: 'president', badges: [],
      joinedAt: '2025-09-20', mandateStart: '2026-09-15', mandateEnd: '2027-06-30', birthDate: '2005-03-01',
      program: 'BUT Informatique', year: 'BUT 2', feePaidAt: '2026-09-20', feeAmount: 15, address: '1 rue des Lilas, 93100 Montreuil',
    },
    { id: 'm_vp', firstName: 'Ilona', lastName: 'Kaci', email: 'ilona@bde.fr', mainRole: 'vice_president', badges: [] },
    { id: 'm_tres', firstName: 'Lucas', lastName: 'Bernard', email: '', mainRole: 'tresorier', badges: [] },
    { id: 'm_sec_adj', firstName: 'Noé', lastName: 'Petit', mainRole: 'secretaire_adjoint', badges: [] },
    { id: 'm_sec', firstName: 'Lina', lastName: 'Roux', mainRole: 'secretaire', badges: [] },
    {
      id: 'm_com', firstName: 'Sacha', lastName: 'Durand', email: 'sacha@bde.fr', mainRole: 'responsable_communication', badges: [],
      mandateStart: '2025-10-01', mandateEnd: '2026-06-30',
    },
    { id: 'm_com2', firstName: 'Yanis', lastName: 'Morel', mainRole: 'membre_communication', badges: [], mandateEnd: '2026-10-25' },
    { id: 'm_design', firstName: 'Maël', lastName: 'Fontaine', mainRole: 'responsable_design', badges: [], joinedAt: '2026-09-28' },
    { id: 'm_legacy', firstName: 'Noam', lastName: 'Henry', mainRole: '', legacyMainRole: 'Chargé de projet Event', badges: [] },
    { id: 'm_none', firstName: 'Zoé', lastName: 'Garnier', mainRole: '', badges: [] },
    { id: 'm_old', firstName: 'Valentin', lastName: 'Esteves', mainRole: 'Membre', badges: ['Ancien Membre', 'Accès Drive'] },
    { id: 'm_proj', firstName: 'Adrien', lastName: 'Blanc', mainRole: 'membre_projets', badges: [], feePaidAt: '2026-10-01' },
  ];
  return {
    ...catalog,
    members,
    columns: [],
    folders: [
      { id: 'f00', code: '00', name: 'Bureau & Stratégie', parent: null },
      { id: 'f01', code: '01', name: 'Pôle Communication', parent: null },
      { id: 'f02', code: '02', name: 'Pôle Événementiel', parent: null },
    ],
    rolePresets: {
      president: { f00: 'editor', f01: 'editor', f02: 'editor' },
      responsable_communication: { f01: 'editor', f02: 'reader' },
      membre_projets: { f02: 'reader' },
    },
    drivePermissions: { m_design: { f01: 'commenter' } },
    organization,
    documentLog: [
      { id: 'l1', templateId: 'attestation-adhesion', memberIds: ['m_tres'], createdAt: '2026-09-25T10:00:00.000Z' },
      { id: 'l2', templateId: 'attestation-adhesion', memberIds: ['m_vp'], createdAt: '2025-11-02T10:00:00.000Z' },
      { id: 'l3', templateId: 'recu-cotisation', memberIds: ['m_pres'], createdAt: '2026-09-21T10:00:00.000Z' },
      { id: 'l4', templateId: 'lettre-mission', memberIds: ['m_vp'], createdAt: '2026-09-30T10:00:00.000Z' },
      { id: 'l5', templateId: 'kit-passation', memberIds: ['m_old'], createdAt: '2026-07-01T10:00:00.000Z' },
    ],
  };
}

const FULL_ORG = {
  name: 'BDE IUT de Montreuil', shortName: 'BDE', legalForm: 'Association loi 1901', rna: 'W931234567',
  address: '140 rue de la Nouvelle France', postalCode: '93100', city: 'Montreuil', email: 'contact@bde-montreuil.fr',
  membershipFee: '20', school: 'IUT de Montreuil',
};
const MINIMAL_ORG = { name: 'Association Test' };

const ctxFull = buildContext(makeState(FULL_ORG), { today: TODAY, vaultEntryLabels: ['Instagram BDE', 'Compte bancaire'] });
const ctxMin = buildContext(makeState(MINIMAL_ORG), { today: TODAY });
const byId = Object.fromEntries(membres.map(t => [t.id, t]));
const gen = (ctx, id, memberId, values = {}) => {
  const docs = generateDocuments(byId[id], ctx, values, [memberId]);
  assert.equal(docs.length, 1);
  return { doc: docs[0], text: documentPlainText(docs[0]) };
};

const EXPECTED_IDS = [
  'attestation-adhesion', 'attestation-engagement', 'lettre-mission', 'lettre-recommandation',
  'attestation-fin-mandat', 'kit-passation', 'charte-engagement', 'recu-cotisation', 'attestation-participation-membre',
];

test('les 9 modèles respectent le contrat', () => {
  assert.deepEqual(membres.map(t => t.id), EXPECTED_IDS);
  membres.forEach(t => {
    assert.equal(t.category, 'membres', t.id);
    assert.equal(t.scope, 'member', t.id);
    ['title', 'description', 'icon'].forEach(k => assert.ok(typeof t[k] === 'string' && t[k], `${t.id}.${k}`));
    assert.ok(t.legal?.note, `${t.id} : note légale`);
    assert.ok(Array.isArray(t.fields) && t.fields.length, `${t.id} : champs`);
    t.fields.forEach(f => assert.ok(f.key && f.label && f.type, `${t.id} : champ incomplet`));
    assert.equal(typeof t.build, 'function');
  });
});

test('chaque modèle × chaque membre × chaque profil : document valide, sans valeur manquante', () => {
  for (const ctx of [ctxFull, ctxMin]) {
    for (const t of membres) {
      for (const m of ctx.members) {
        const values = t.id === 'attestation-participation-membre' ? { evenement: 'Gala 2027', dateDebut: '2027-03-12' } : {};
        const [doc] = generateDocuments(t, ctx, values, [m.id]);
        const label = `${t.id} / ${m.id} / ${ctx.organization.name}`;
        assert.deepEqual(validateDocument(doc), [], label);
        assert.equal(doc.meta.templateId, t.id, label);
        assert.deepEqual(doc.meta.memberIds, [m.id], label);
        assert.match(doc.meta.fileName, /^[A-Za-z0-9_-]+$/, label);
        assert.ok(doc.meta.fileName.endsWith(`_${m.firstName}_${m.lastName}`.normalize('NFD').replace(/[̀-ͯ]/g, '')), label);
        const text = documentPlainText(doc);
        assert.ok(!/undefined|null|NaN|\[object/.test(text), label);
        assert.ok(text.includes(m.firstName), `${label} : nom du membre`);
        // Le modèle fonctionne aussi sans aucune valeur de formulaire (build direct).
        assert.deepEqual(validateDocument(t.build(ctx, defaultValues(t, ctx, m), m)), [], `${label} (build direct)`);
      }
    }
  }
});

test('le modèle de participation reste valide sans champ requis rempli', () => {
  const { doc, text } = gen(ctxMin, 'attestation-participation-membre', 'm_none');
  assert.deepEqual(validateDocument(doc), []);
  assert.ok(text.includes('____'));
});

test('attestation d\'adhésion : année, signataire distinct, données facultatives', () => {
  const pres = gen(ctxFull, 'attestation-adhesion', 'm_pres').text;
  assert.ok(pres.includes('2026-2027'));
  assert.ok(pres.includes('né(e) le 1er mars 2005'));
  assert.ok(pres.includes('inscrit(e) en BUT Informatique (BUT 2)'));
  assert.ok(pres.includes('Son adhésion a pris effet le 20 septembre 2025.'));
  assert.ok(pres.includes('à jour de sa cotisation'));
  assert.ok(pres.includes('Ilona Kaci'), 'la présidente ne signe pas sa propre attestation : vice-présidence');
  assert.ok(pres.includes('régie par la loi du 1er juillet 1901'));
  assert.ok(pres.includes('RNA W931234567'));
  assert.ok(pres.includes('pour servir et valoir ce que de droit'));

  const none = gen(ctxMin, 'attestation-adhesion', 'm_none').text;
  assert.ok(!none.includes('fonctions de'), 'aucune fonction inventée');
  assert.ok(!none.includes('né(e) le'), 'aucune date de naissance inventée');
  assert.ok(!none.includes('adhésion a pris effet'), 'aucune date d\'adhésion inventée');
  assert.ok(!none.includes('cotisation'), 'aucun paiement inventé');
  assert.ok(!none.includes('RNA'));
  assert.ok(none.includes('**Zoé Garnier** est membre'), 'pas de virgule orpheline');
  assert.ok(none.includes('l\'association Test'), 'pas de « l\'association Association »');

  const legacy = gen(ctxFull, 'attestation-adhesion', 'm_legacy').text;
  assert.ok(legacy.includes('Chargé de projet Event'), 'ancien libellé libre conservé');
  const old = gen(ctxFull, 'attestation-adhesion', 'm_old').text;
  assert.ok(!old.includes('fonctions de'), '« Membre » n\'est pas une fonction');
});

test('attestation d\'engagement : période, missions, compétences, L. 611-9', () => {
  const com = gen(ctxFull, 'attestation-engagement', 'm_com', { heuresParSemaine: 6 }).text;
  assert.ok(com.includes('s\'est engagé(e) bénévolement'), 'mandat terminé → passé composé');
  assert.ok(com.includes('du 1er octobre 2025 au 30 juin 2026'));
  assert.ok(com.includes('Responsable Communication'));
  assert.ok(com.includes('au sein du pôle Communication'));
  assert.ok(com.includes(ROLE_MISSIONS.responsable_communication[0]));
  assert.ok(com.includes('Stratégie de communication'));
  assert.ok(com.includes('6 heures par semaine'));
  assert.ok(com.includes('article L. 611-9 du code de l\'éducation'));

  const design = gen(ctxMin, 'attestation-engagement', 'm_design').text;
  assert.ok(design.includes('est engagé(e) bénévolement'));
  assert.ok(design.includes('au cours de l\'année universitaire 2026-2027'), 'sans dates : année universitaire');
  assert.ok(!design.includes('depuis le'), 'aucune date inventée');
  assert.ok(!design.includes('heure'), 'aucun volume horaire inventé');
  assert.ok(design.includes('Piloter les activités du pôle Créatif'), 'générateur générique (rôle personnalisé)');
  assert.ok(design.includes('supports visuels'), 'mission métier déduite du libellé');

  const sansMention = gen(ctxFull, 'attestation-engagement', 'm_pres', { mentionReconnaissance: false, benevole: false }).text;
  assert.ok(!sansMention.includes('L. 611-9'));
  assert.ok(!sansMention.includes('bénévole'));
  assert.ok(sansMention.includes('est engagé(e) au sein de l\'association du 15 septembre 2026 au 30 juin 2027'));
  const sansFin = gen(ctxFull, 'attestation-engagement', 'm_pres', { dateFin: '' }).text;
  assert.ok(sansFin.includes('depuis le 15 septembre 2026'));
});

test('générateur de missions génériques par niveau', () => {
  assert.ok(genericMissions('responsable', 'Créatif', 'Responsable Design')[0].includes('pôle Créatif'));
  assert.ok(genericMissions('adjoint', 'Pôle Logistique', 'Adjoint')[0].includes('du pôle Logistique'), 'pas de « pôle Pôle »');
  assert.ok(genericMissions('bureau', 'Bureau', 'Chargé(e) de mission', true).some(m => m.includes('Chargé(e) de mission')));
  assert.ok(genericMissions('membre', '', '').every(m => typeof m === 'string' && m.length > 10));
});

test('lettre de mission : rattachement, accès Drive, RGPD, double signature', () => {
  const { doc, text } = gen(ctxFull, 'lettre-mission', 'm_com2');
  assert.ok(text.includes('Sacha Durand, Responsable Communication'), 'rattaché au responsable du pôle');
  assert.ok(text.includes('règlement (UE) 2016/679'));
  assert.ok(text.includes('Aucun accès Drive'), 'aucun preset pour ce rôle');
  const sigs = doc.blocks.find(b => b.type === 'signatures');
  assert.equal(sigs.slots.length, 2);
  assert.equal(sigs.slots[1].mention, 'Lu et approuvé');
  assert.equal(sigs.slots[0].name, 'Camille Martin');

  const pres = gen(ctxFull, 'lettre-mission', 'm_pres');
  const table = pres.doc.blocks.find(b => b.type === 'table');
  assert.deepEqual(table.rows.map(r => r.folder), ['00 Bureau & Stratégie', '01 Pôle Communication', '02 Pôle Événementiel']);
  assert.ok(table.rows.every(r => r.level === 'Éditeur'));
  assert.ok(pres.text.includes('l\'assemblée générale des membres'), 'la présidence rend compte à l\'AG');

  const design = gen(ctxFull, 'lettre-mission', 'm_design');
  assert.ok(design.doc.blocks.find(b => b.type === 'table').rows[0].level === 'Commentateur', 'permissions effectives prioritaires');
  assert.ok(design.text.includes('Camille Martin, Président(e)'), 'pôle sans supérieur → présidence');

  const adj = gen(ctxFull, 'lettre-mission', 'm_sec_adj').text;
  assert.ok(adj.includes('Lina Roux, Secrétaire'), 'secrétaire adjoint(e) → secrétaire');

  const min = gen(ctxMin, 'lettre-mission', 'm_none').text;
  assert.ok(min.startsWith('Lettre de mission'));
  // Sigle vide par défaut : aucun « (BDE) » inventé pour une association minimale.
  assert.ok(min.includes('L\'association Test, régie par la loi du 1er juillet 1901, confie à'));
  const bare = buildContext(makeState({ name: 'Association Test', shortName: '', legalForm: '' }), { today: TODAY });
  assert.ok(gen(bare, 'lettre-mission', 'm_none').text.includes('L\'association Test confie à'), 'pas de virgule orpheline sans apposition');
  assert.ok(min.includes('membre bénévole'));
});

test('lettre de recommandation : tons, contexte, qualités, réalisation', () => {
  const sobre = gen(ctxFull, 'lettre-recommandation', 'm_com', {
    contexte: 'sa candidature au master Communication de l\'université Paris 8',
    realisation: 'Sacha a refondu l\'identité visuelle de l\'association',
  });
  const paragraphs = sobre.doc.blocks.filter(b => b.type === 'paragraph');
  assert.ok(paragraphs.length >= 7, 'objet, appel, 5 paragraphes');
  assert.ok(sobre.text.includes('j\'ai l\'honneur de vous recommander **Sacha Durand**, dans le cadre de sa candidature au master'));
  assert.ok(sobre.text.includes('a exercé au sein de notre association les fonctions de Responsable Communication'));
  assert.ok(sobre.text.includes('Ses missions consistaient notamment à définir et piloter'));
  assert.ok(sobre.text.includes('réalisation suivante : Sacha a refondu l\'identité visuelle de l\'association.'));
  assert.ok(sobre.text.includes('salutations distinguées'));
  assert.ok(sobre.text.includes('(camille@bde.fr)'));

  const warm = gen(ctxMin, 'lettre-recommandation', 'm_none', { ton: 'chaleureux', destinataire: 'Madame la Directrice,' }).text;
  assert.ok(warm.includes('c\'est avec un réel plaisir'));
  assert.ok(warm.includes('Je vous prie d\'agréer, Madame la Directrice, l\'expression de mes sentiments les meilleurs.'));
  assert.ok(warm.includes('est membre de notre association au cours de l\'année universitaire 2026-2027'));
  assert.ok(!warm.includes('fonctions de'));
});

test('attestation de fin de fonctions : successeur, éléments, quitus facultatif', () => {
  const base = gen(ctxFull, 'attestation-fin-mandat', 'm_com').text;
  assert.ok(base.includes('a exercé les fonctions de **Responsable Communication**'));
  assert.ok(base.includes('du 1er octobre 2025 au 30 juin 2026'));
  assert.ok(!base.includes('quitus'), 'quitus absent par défaut');
  assert.ok(base.includes('Accès aux réseaux sociaux'));

  const full = gen(ctxFull, 'attestation-fin-mandat', 'm_com', { successeur: 'm_com2', quitus: true, dateQuitus: '2026-06-20' });
  assert.ok(full.text.includes('au profit de **Yanis Morel**'));
  assert.ok(full.text.includes('assemblée générale du 20 juin 2026, quitus de sa gestion'));
  assert.equal(full.doc.blocks.find(b => b.type === 'signatures').slots.length, 3);

  // Élision devant une voyelle : « au profit d'Ilona », « en qualité d'… ».
  assert.ok(gen(ctxFull, 'attestation-fin-mandat', 'm_com', { successeur: 'm_vp' }).text.includes('au profit d\'**Ilona Kaci**'));
  assert.ok(gen(ctxFull, 'attestation-adhesion', 'm_pres').text.includes('en qualité de Vice-Président(e)'));

  const old = gen(ctxMin, 'attestation-fin-mandat', 'm_old').text;
  assert.ok(old.includes('a été membre de l\'association au cours de l\'année universitaire 2026-2027'));
});

test('dossier de passation : confidentiel, coffre-fort par libellés uniquement', () => {
  const unlocked = gen(ctxFull, 'kit-passation', 'm_tres', { successeur: 'm_proj' });
  assert.equal(unlocked.doc.meta.confidential, true);
  assert.ok(unlocked.text.includes('Instagram BDE'));
  assert.ok(unlocked.text.includes('Compte bancaire'));
  assert.ok(unlocked.text.includes('pouvoirs bancaires'), 'étape spécifique trésorerie');
  assert.ok(unlocked.text.includes('camille@bde.fr'), 'contacts du bureau');
  assert.ok(!unlocked.text.includes('Lucas Bernard —  '));
  assert.ok(unlocked.doc.blocks.some(b => b.type === 'checklist'));

  const locked = gen(ctxMin, 'kit-passation', 'm_pres').text;
  assert.ok(locked.includes('Déverrouille le coffre-fort'));
  assert.ok(locked.includes('greffe des associations dans les trois mois'));
  assert.ok(locked.includes('sous le contrôle de l\'assemblée générale'));

  const emptyVault = buildContext(makeState(FULL_ORG), { today: TODAY, vaultEntryLabels: [] });
  assert.ok(gen(emptyVault, 'kit-passation', 'm_com').text.includes('Aucune entrée'));
});

test('charte d\'engagement : valeurs, engagements, « Lu et approuvé »', () => {
  const { doc, text } = gen(ctxFull, 'charte-engagement', 'm_design', { engagementsSpecifiques: ['Respecter la charte graphique'] });
  ['Respect', 'Confidentialité', 'Image de l\'association', 'Usage des comptes', 'règlement (UE) 2016/679', 'Fin d\'engagement', 'bizutage']
    .forEach(k => assert.ok(text.includes(k), k));
  assert.ok(text.includes('Respecter la charte graphique.'));
  assert.ok(text.includes('dans l\'exercice de mes fonctions de Responsable Design'));
  assert.equal(doc.blocks.find(b => b.type === 'signatures').slots[0].mention, 'Lu et approuvé');
});

test('reçu de cotisation : montant, lettres, mode de règlement, mention fiscale', () => {
  const pres = gen(ctxFull, 'recu-cotisation', 'm_pres', { moyen: 'helloasso' });
  assert.ok(pres.text.includes('15,00 €'));
  assert.ok(pres.text.includes('(quinze euros)'));
  assert.ok(pres.text.includes('le 20 septembre 2026'));
  assert.ok(pres.text.includes('HelloAsso'));
  assert.ok(pres.text.includes('ne constitue pas un reçu fiscal'));
  assert.ok(pres.text.includes('Lucas Bernard'), 'signé par le trésorier');

  const proj = gen(ctxFull, 'recu-cotisation', 'm_proj').text;
  assert.ok(proj.includes('20,00 €'), 'montant statutaire par défaut');
  assert.ok(proj.includes('vingt euros'));

  const tres = gen(ctxMin, 'recu-cotisation', 'm_tres');
  assert.ok(tres.text.includes('__________ €'), 'aucun montant inventé');
  assert.ok(!/euros?\b/.test(tres.text.replace('d\'impôt', '')) || !tres.text.includes('(un'), 'pas de montant en lettres');
  assert.ok(!tres.text.includes('Lucas Bernard, Trésorier'), 'le trésorier ne signe pas son propre reçu');
  assert.ok(tres.text.includes('Camille Martin'));
});

test('certificat de participation : dates, rôle, heures', () => {
  const t = gen(ctxFull, 'attestation-participation-membre', 'm_proj', {
    evenement: 'Gala 2027', dateDebut: '2027-03-12', dateFin: '2027-03-13', roleEvenement: 'bénévole à l\'accueil', heures: 10, lieu: 'Salle des fêtes',
  }).text;
  assert.ok(t.includes('a participé à l\'action « Gala 2027 », organisée par l\'association du 12 mars 2027 au 13 mars 2027 (Salle des fêtes), en qualité de bénévole à l\'accueil.'));
  assert.ok(t.includes('du 12 mars 2027 au 13 mars 2027'));
  assert.ok(t.includes('10 heures'));
  const one = gen(ctxFull, 'attestation-participation-membre', 'm_proj', { evenement: 'Forum', dateDebut: '2027-01-15', dateFin: '2027-01-15' }).text;
  assert.ok(one.includes('le 15 janvier 2027'));
  assert.ok(!one.includes('heure'));
});

test('suggestions groupées, fondées sur les données et le registre', () => {
  const s = Object.fromEntries(membres.filter(t => t.suggest).map(t => [t.id, t.suggest(ctxFull)]));
  const ids = (id) => (s[id][0]?.memberIds || []).slice().sort();

  // Adhésion : rôle du catalogue, pas déjà émise cette année ; m_vp (émise l'an dernier) est proposé.
  assert.deepEqual(ids('attestation-adhesion'), ['m_com2', 'm_design', 'm_pres', 'm_proj', 'm_sec', 'm_sec_adj', 'm_vp'].sort());
  assert.match(s['attestation-adhesion'][0].reason, /^7 membres avec un rôle/);
  // Fin de fonctions : badge « Ancien Membre » ou fin de mandat dépassée.
  assert.deepEqual(ids('attestation-fin-mandat'), ['m_com', 'm_old']);
  // Passation : sortants + fin de mandat sous 30 jours, avec un rôle, sans dossier déjà émis.
  assert.deepEqual(ids('kit-passation'), ['m_com', 'm_com2']);
  assert.equal(s['kit-passation'][0].priority, 'high');
  assert.match(s['kit-passation'][0].reason, /dont 1 dans les 30 prochains jours/);
  // Lettres de mission : bureau + responsables, hors m_vp (déjà émise) et sortants.
  assert.deepEqual(ids('lettre-mission'), ['m_design', 'm_pres', 'm_sec', 'm_tres']);
  // Reçus : paiement enregistré sans reçu (m_pres a déjà le sien).
  assert.deepEqual(ids('recu-cotisation'), ['m_proj']);
  assert.match(s['recu-cotisation'][0].reason, /^1 membre a réglé sa cotisation/);
  // Charte : nouveaux adhérents de l'année.
  assert.deepEqual(ids('charte-engagement'), ['m_design']);
  // Une seule suggestion par modèle, chacune complète.
  Object.values(s).forEach(list => {
    assert.ok(list.length <= 1);
    list.forEach(x => ['id', 'title', 'reason', 'priority'].forEach(k => assert.ok(x[k], k)));
  });

  // Intégration au registre global.
  const all = collectSuggestions(ctxFull).filter(x => EXPECTED_IDS.includes(x.templateId));
  assert.ok(all.length >= 6);
  assert.equal(all[0].templateId, 'kit-passation', 'priorité haute en tête');

  // Aucune suggestion quand tout est à jour.
  const empty = buildContext({ ...makeState(FULL_ORG), members: [] }, { today: TODAY });
  membres.filter(t => t.suggest).forEach(t => assert.deepEqual(t.suggest(empty), []));
});
