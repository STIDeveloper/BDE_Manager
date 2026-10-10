// Modèles de la catégorie « rgpd » — voir le contrat dans ../context.js.
// Mention d'information (art. 13 RGPD), registre des activités de traitement
// (art. 30 RGPD) généré à partir des données réellement présentes dans
// l'application, autorisation de droit à l'image.
import { createBlockFactory, safeFileName } from '../model.js';
import {
  formatDateLong, isoDate, academicYear, fullName, officialName, signatory, signatureSlot,
  organizationLegalLine, cityOf, plural, numberToFrench,
} from '../context.js';
import { PBKDF2_ITERATIONS } from '../../core/crypto.js';
import {
  str, membersWithDrivePermissions, RGPD_RETENTION_DEFAULTS, ageAt, issuedSince,
} from './orgPart_helpers.js';

const RGPD_REF = 'règlement (UE) 2016/679 du 27 avril 2016 (RGPD)';
const LOCAL_STORAGE_MEASURE = 'Données stockées localement sur l\'appareil (stockage du navigateur), aucun envoi à un serveur par l\'application ; accès limité aux membres du bureau habilités utilisant cet appareil.';
const NO_TRANSFER = 'Aucun transfert hors de l\'Union européenne n\'est réalisé par l\'application, qui ne dispose d\'aucun serveur.';

/** Le champ est-il renseigné ? (0 et false comptent comme renseignés.) */
const filled = (v) => v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '') && !(Array.isArray(v) && v.length === 0);
const countWith = (list, pick) => list.filter(x => filled(pick(x))).length;

const RETENTION_FIELDS = [
  { key: 'retentionMembers', label: 'Conservation — données des membres', type: 'textarea', default: RGPD_RETENTION_DEFAULTS.members },
  { key: 'retentionCandidates', label: 'Conservation — candidatures', type: 'textarea', default: RGPD_RETENTION_DEFAULTS.candidates },
  { key: 'retentionDrive', label: 'Conservation — accès Drive', type: 'textarea', default: RGPD_RETENTION_DEFAULTS.drive },
  { key: 'retentionImage', label: 'Conservation — images (photos, vidéos)', type: 'textarea', default: RGPD_RETENTION_DEFAULTS.image },
  { key: 'retentionFinance', label: 'Conservation — notes de frais et pièces comptables', type: 'textarea', default: RGPD_RETENTION_DEFAULTS.finance },
];

const retention = (values, key, fallbackKey) => str(values[key]) || RGPD_RETENTION_DEFAULTS[fallbackKey];

// ------------------------------------------------------------
// Mention d'information des membres (art. 13 RGPD)
// ------------------------------------------------------------

const mentionInformation = {
  id: 'mention-information-rgpd',
  category: 'rgpd',
  title: 'Mention d\'information RGPD',
  description: 'Information des membres sur le traitement de leurs données personnelles (article 13 du RGPD).',
  icon: 'ShieldCheck',
  tags: ['RGPD', 'données personnelles', 'information', 'CNIL', 'confidentialité', 'vie privée'],
  scope: 'organization',
  legal: {
    note: 'Modèle d\'information établi d\'après l\'article 13 du RGPD. Vérifiez que les finalités, destinataires et durées correspondent à vos pratiques réelles ; la CNIL publie des ressources dédiées aux associations (cnil.fr).',
    references: ['Règlement (UE) 2016/679 (RGPD), articles 6, 13 et 15 à 21'],
  },
  fields: [
    { key: 'contactEmail', label: 'Email de contact pour les demandes RGPD', type: 'text', default: (ctx) => ctx.organization.email || '' },
    { key: 'includeRecruitment', label: 'Mentionner le recrutement via formulaire de candidature', type: 'checkbox', default: true },
    { key: 'includeImage', label: 'Mentionner la captation de l\'image (photos, vidéos)', type: 'checkbox', default: true },
    { key: 'includeAck', label: 'Ajouter un accusé de réception à signer', type: 'checkbox', default: false },
    ...RETENTION_FIELDS,
    { key: 'date', label: 'Date de mise à jour', type: 'date', default: (ctx) => isoDate(ctx.today) },
  ],
  build: (ctx, values) => {
    const b = createBlockFactory();
    const org = ctx.organization;
    const president = signatory(ctx, null, ['president']);
    const email = str(values.contactEmail) || str(org.email);
    const date = values.date || isoDate(ctx.today);

    const purposes = [
      { purpose: 'Gestion des adhésions et de la vie associative (liste des membres, rôles, cotisations)', basis: 'Exécution du contrat d\'adhésion (art. 6.1.b)', data: 'Identité, email, rôle et pôle, informations d\'adhésion' },
      { purpose: 'Organisation des activités et des événements', basis: 'Exécution du contrat d\'adhésion (art. 6.1.b)', data: 'Identité, email, téléphone s\'il est communiqué, rôle' },
      { purpose: 'Communication interne entre les membres', basis: 'Intérêt légitime de l\'association à informer ses membres (art. 6.1.f)', data: 'Identité, email, téléphone s\'il est communiqué' },
      { purpose: 'Gestion des accès aux espaces de travail partagés (Google Drive)', basis: 'Intérêt légitime de l\'association à sécuriser ses documents (art. 6.1.f)', data: 'Identité, email, niveaux d\'accès par dossier' },
      ...(values.includeRecruitment ? [{ purpose: 'Recrutement des membres actifs via le formulaire de candidature', basis: 'Mesures précontractuelles prises à la demande de la personne (art. 6.1.b)', data: 'Identité, coordonnées, formation, vœux de rôle, motivations, disponibilités' }] : []),
      ...(values.includeImage ? [{ purpose: 'Captation et diffusion de l\'image lors des activités', basis: 'Consentement, recueilli par une autorisation écrite (art. 6.1.a)', data: 'Photographies et vidéos' }] : []),
      { purpose: 'Remboursement des frais engagés pour l\'association', basis: 'Obligations comptables de l\'association (art. 6.1.c) et intérêt légitime (art. 6.1.f)', data: 'Identité, coordonnées bancaires, justificatifs' },
    ];
    const retentionRows = [
      { item: 'Données des membres', duration: retention(values, 'retentionMembers', 'members') },
      ...(values.includeRecruitment ? [{ item: 'Candidatures', duration: retention(values, 'retentionCandidates', 'candidates') }] : []),
      { item: 'Accès Drive', duration: retention(values, 'retentionDrive', 'drive') },
      ...(values.includeImage ? [{ item: 'Photographies et vidéos', duration: retention(values, 'retentionImage', 'image') }] : []),
      { item: 'Notes de frais et pièces comptables', duration: retention(values, 'retentionFinance', 'finance') },
    ];

    const blocks = [
      b.title('Information sur le traitement de vos données personnelles', `${org.name} · mention d'information des membres (article 13 du RGPD)`),
      b.p(`Dans le cadre de votre adhésion et de votre participation aux activités de l'association, ${org.name} traite des données personnelles vous concernant. Conformément au ${RGPD_REF}, nous vous informons des conditions de ce traitement.`),

      b.heading('1. Responsable du traitement'),
      b.p(`Le responsable du traitement est ${organizationLegalLine(org)}${president ? `, représentée par ${president.name}, agissant en qualité de ${president.role}` : ''}.`),
      b.kv([
        ['Contact', email || '______________________________'],
        ['Site internet', str(org.website)],
      ]),

      b.heading('2. Finalités et bases légales'),
      b.table(
        [
          { key: 'purpose', label: 'Finalité', width: 0.38 },
          { key: 'basis', label: 'Base légale (art. 6 RGPD)', width: 0.32 },
          { key: 'data', label: 'Données concernées', width: 0.3 },
        ],
        purposes,
        { dense: true },
      ),
      b.p('Les données d\'identité et l\'adresse email sont nécessaires à l\'enregistrement de votre adhésion : à défaut, celle-ci ne peut être gérée. Les autres informations (téléphone, formation, etc.) sont facultatives. Aucune décision produisant des effets juridiques à votre égard n\'est prise sur le seul fondement d\'un traitement automatisé.'),

      b.heading('3. Destinataires'),
      b.p('Vos données sont accessibles aux seuls membres du bureau habilités, dans la limite de leurs attributions (par exemple : le trésorier pour les cotisations et remboursements, le secrétariat pour la liste des membres). Elles ne sont ni vendues, ni louées, ni cédées à des tiers, notamment aux partenaires de l\'association. Pour l\'attribution des accès aux espaces de travail partagés, votre adresse email est communiquée au prestataire qui les héberge (Google Drive). Vos données peuvent enfin être communiquées aux autorités lorsque la loi l\'exige.'),
      b.p('L\'outil de gestion de l\'association (BDE Manager) conserve les données localement, sur l\'appareil des membres du bureau habilités : il ne les transmet à aucun serveur.'),

      b.heading('4. Durées de conservation'),
      b.table(
        [
          { key: 'item', label: 'Données', width: 0.32 },
          { key: 'duration', label: 'Durée de conservation', width: 0.68 },
        ],
        retentionRows,
        { dense: true },
      ),

      b.heading('5. Vos droits'),
      b.p('Conformément aux articles 15 à 21 du RGPD, vous disposez des droits suivants sur vos données :', { editable: false }),
      b.list([
        'droit d\'accès (article 15) : obtenir la confirmation que des données vous concernant sont traitées et en recevoir une copie ;',
        'droit de rectification (article 16) : faire corriger des données inexactes ou incomplètes ;',
        'droit à l\'effacement (article 17) : obtenir la suppression de vos données dans les cas prévus par le règlement ;',
        'droit à la limitation du traitement (article 18) ;',
        'droit à la portabilité (article 20) : recevoir les données que vous avez fournies dans un format structuré et couramment utilisé ;',
        'droit d\'opposition (article 21) : vous opposer, pour des raisons tenant à votre situation particulière, aux traitements fondés sur l\'intérêt légitime.',
      ]),
      b.p(`Lorsque le traitement repose sur votre consentement (droit à l'image notamment), vous pouvez le retirer à tout moment, sans que cela remette en cause les utilisations antérieures. Pour exercer vos droits, écrivez à ${email || 'l\'association'}${email ? '' : ' (adresse du siège)'} en précisant votre demande ; une réponse vous sera apportée dans un délai d'un mois.`),

      b.heading('6. Réclamation auprès de la CNIL'),
      b.p('Si vous estimez, après nous avoir contactés, que vos droits ne sont pas respectés, vous pouvez introduire une réclamation auprès de la Commission nationale de l\'informatique et des libertés (CNIL), autorité de contrôle compétente en France : www.cnil.fr.'),

      b.small(`Mention mise à jour le ${formatDateLong(date)}.`, { tone: 'muted' }),
    ];
    if (values.includeAck) {
      blocks.push(b.heading('Accusé de réception', 2));
      blocks.push(b.p('Je reconnais avoir pris connaissance de la présente information relative au traitement de mes données personnelles.', { editable: false }));
      blocks.push(b.blankLines(['Nom et prénom : ________________________________', 'Date : ________________', 'Signature :']));
    }

    return {
      meta: {
        templateId: 'mention-information-rgpd',
        title: 'Mention d\'information RGPD',
        fileName: safeFileName(`Mention_information_RGPD_${org.shortName || org.name}`),
      },
      blocks,
    };
  },
};

// ------------------------------------------------------------
// Registre des activités de traitement (art. 30 RGPD) — auto-documenté
// ------------------------------------------------------------

/** Champs administratifs optionnels d'un membre → catégorie de données. */
const MEMBER_FIELD_CATEGORIES = [
  { label: 'Téléphone', fields: ['phone'] },
  { label: 'Adresse postale', fields: ['address'] },
  { label: 'Date de naissance', fields: ['birthDate'] },
  { label: 'Nationalité', fields: ['nationality'] },
  { label: 'Formation et année d\'études', fields: ['program', 'year'] },
  { label: 'Profession', fields: ['profession'] },
  { label: 'Dates d\'adhésion et de mandat', fields: ['joinedAt', 'mandateStart', 'mandateEnd'] },
  { label: 'Cotisation (date, montant)', fields: ['feePaidAt', 'feeAmount'] },
  { label: 'Consentement au droit à l\'image', fields: ['imageConsent'] },
];

const CANDIDATE_FIELD_CATEGORIES = [
  { label: 'Identité (nom, prénom)', pick: c => c.displayName || c.firstName || c.lastName },
  { label: 'Email', pick: c => c.email },
  { label: 'Téléphone', pick: c => c.phone },
  { label: 'Formation et année d\'études', pick: c => c.formation || c.year },
  { label: 'Alternance', pick: c => (typeof c.alternance === 'boolean' ? c.alternance : null) },
  { label: 'Vœux de rôles', pick: c => c.choices || c.rawChoices },
  { label: 'Motivations (réponses libres)', pick: c => c.whyText || c.discoverText || c.contributeText },
  { label: 'Disponibilités et polyvalence', pick: c => c.availabilityLabel || c.swissKnifeLabel || (Number.isFinite(c.availability) ? c.availability : null) },
  { label: 'Date de réponse', pick: c => c.submittedAt },
  { label: 'Signaux extraits automatiquement des réponses', pick: c => c.signals },
];

/**
 * Statistiques réelles des données présentes dans l'application
 * (exportées pour les tests et l'aperçu).
 */
export function registerStats(ctx) {
  const members = ctx.members;
  const memberCategories = [
    { label: 'Identité (nom, prénom)', count: countWith(members, m => m.firstName || m.lastName) },
    { label: 'Adresse email', count: countWith(members, m => m.email) },
    { label: 'Rôle et pôle', count: countWith(members, m => m.mainRole || m.legacyMainRole) },
    { label: 'Badges (accès, compétences)', count: countWith(members, m => m.badges) },
    { label: 'Notes libres', count: countWith(members, m => m.notes) },
    ...MEMBER_FIELD_CATEGORIES.map(c => ({ label: c.label, count: members.filter(m => c.fields.some(f => filled(m[f]))).length })),
  ].filter(c => c.count > 0);
  const candidates = Array.isArray(ctx.candidates) ? ctx.candidates : [];
  const candidateCategories = CANDIDATE_FIELD_CATEGORIES
    .map(c => ({ label: c.label, count: countWith(candidates, c.pick) }))
    .filter(c => c.count > 0);
  const signatures = Object.values(ctx.organization?.signatures || {}).filter(Boolean).length;
  return {
    members: members.length,
    withEmail: countWith(members, m => m.email),
    withPhone: countWith(members, m => m.phone),
    memberCategories,
    driveMembers: membersWithDrivePermissions(ctx).length,
    folders: ctx.folders.length,
    presets: Object.keys(ctx.rolePresets || {}).length,
    candidates: candidates.length,
    candidateCategories,
    vaultEntries: Array.isArray(ctx.vaultEntryLabels) ? ctx.vaultEntryLabels.length : null,
    documents: (ctx.documentLog || []).length,
    signatures,
  };
}

const categoriesText = (cats, total, unit) => (cats.length
  ? cats.map(c => `${c.label} (${c.count}/${total})`).join(' ; ')
  : `Aucune donnée actuellement enregistrée (${unit}).`);

const registreTraitements = {
  id: 'registre-traitements',
  category: 'rgpd',
  title: 'Registre des traitements',
  description: 'Registre simplifié des activités de traitement (article 30 du RGPD), établi à partir des données réellement présentes dans l\'application.',
  icon: 'ClipboardList',
  tags: ['RGPD', 'registre', 'article 30', 'conformité', 'CNIL', 'traitements'],
  scope: 'organization',
  legal: {
    note: 'Registre simplifié, généré à partir des données réellement présentes dans BDE Manager au jour de son édition. Il ne couvre pas les traitements réalisés hors de l\'application (formulaires en ligne, réseaux sociaux, messageries, tableurs partagés) : ajoutez-les le cas échéant et mettez le registre à jour à chaque changement significatif.',
    references: ['Règlement (UE) 2016/679 (RGPD), articles 6 et 30'],
  },
  fields: [
    { key: 'contactEmail', label: 'Email de contact RGPD', type: 'text', default: (ctx) => ctx.organization.email || '' },
    ...RETENTION_FIELDS.filter(f => f.key !== 'retentionImage'),
    { key: 'date', label: 'Registre à jour au', type: 'date', default: (ctx) => isoDate(ctx.today) },
  ],
  suggest: (ctx) => {
    if (ctx.members.length === 0) return [];
    const yearStart = `${academicYear(ctx.today).slice(0, 4)}-09-01`;
    if (issuedSince(ctx, 'registre-traitements', yearStart)) return [];
    return [{
      id: 'registre-traitements-annuel',
      title: 'Mettre à jour le registre RGPD',
      reason: `L'application contient les données de ${plural(ctx.members.length, 'membre')} et aucun registre des traitements n'a été édité cette année universitaire.`,
      priority: 'medium',
    }];
  },
  build: (ctx, values) => {
    const b = createBlockFactory();
    const org = ctx.organization;
    const s = registerStats(ctx);
    const president = signatory(ctx, null, ['president']);
    const email = str(values.contactEmail) || str(org.email);
    const date = values.date || isoDate(ctx.today);
    const bureau = 'Membres du bureau habilités (accès à l\'appareil sur lequel l\'application est utilisée)';

    const activities = [
      {
        name: 'Gestion des membres',
        rows: [
          ['Finalité', 'Tenue de la liste des membres, attribution des rôles et des pôles, suivi de la vie associative.'],
          ['Base légale', 'Exécution du contrat d\'adhésion (art. 6.1.b RGPD) ; intérêt légitime pour les notes internes (art. 6.1.f).'],
          ['Personnes concernées', `Membres de l'association : ${plural(s.members, 'membre')} enregistré${s.members > 1 ? 's' : ''}.`],
          ['Catégories de données', categoriesText(s.memberCategories, s.members, 'aucun membre')],
          ['Volume réel', `${plural(s.members, 'membre')}, dont ${s.withEmail} avec email et ${s.withPhone} avec téléphone renseigné.`],
          ['Destinataires', bureau],
          ['Durée de conservation', retention(values, 'retentionMembers', 'members')],
          ['Mesures de sécurité', `${LOCAL_STORAGE_MEASURE} Les notes libres ne doivent contenir aucune donnée sensible.`],
          ['Transferts hors UE', NO_TRANSFER],
        ],
      },
      {
        name: 'Gouvernance des accès Drive',
        rows: [
          ['Finalité', 'Attribution et contrôle des droits d\'accès aux dossiers partagés de l\'association.'],
          ['Base légale', 'Intérêt légitime de l\'association à sécuriser ses documents (art. 6.1.f RGPD).'],
          ['Personnes concernées', `Membres disposant d'accès : ${plural(s.driveMembers, 'membre')} avec des permissions individuelles.`],
          ['Catégories de données', `Identité, email, niveau d'accès (lecteur, commentateur, éditeur) par dossier ; ${plural(s.folders, 'dossier')} référencé${s.folders > 1 ? 's' : ''}, ${s.presets} preset${s.presets > 1 ? 's' : ''} d'accès par rôle.`],
          ['Destinataires', `${bureau} ; l'hébergeur du Drive (Google), lors de l'application effective des partages par un administrateur.`],
          ['Durée de conservation', retention(values, 'retentionDrive', 'drive')],
          ['Mesures de sécurité', `${LOCAL_STORAGE_MEASURE} Principe du moindre privilège : accès définis par rôle et revus à chaque passation.`],
          ['Transferts hors UE', `${NO_TRANSFER} Les transferts éventuels liés à l'hébergement du Drive relèvent des conditions du prestataire.`],
        ],
      },
      {
        name: 'Recrutement des membres actifs',
        rows: [
          ['Finalité', 'Analyse des candidatures reçues par formulaire et aide à l\'affectation des candidats aux rôles.'],
          ['Base légale', 'Mesures précontractuelles prises à la demande de la personne (art. 6.1.b RGPD).'],
          ['Personnes concernées', s.candidates
            ? `Candidats : ${plural(s.candidates, 'candidature')} actuellement chargée${s.candidates > 1 ? 's' : ''} dans l'application.`
            : 'Candidats. Aucune candidature n\'est actuellement chargée : cette section décrit le traitement mis en œuvre lors de l\'import d\'un export de formulaire.'],
          ['Catégories de données', s.candidates
            ? categoriesText(s.candidateCategories, s.candidates, 'aucune candidature')
            : 'Identité, email, téléphone, formation et année, alternance, vœux de rôles, motivations, disponibilités, date de réponse.'],
          ['Traitement automatisé', 'Calcul d\'un score d\'adéquation et extraction de signaux textuels servant d\'aide à la décision ; l\'affectation finale est décidée par le bureau.'],
          ['Destinataires', bureau],
          ['Durée de conservation', retention(values, 'retentionCandidates', 'candidates')],
          ['Mesures de sécurité', `${LOCAL_STORAGE_MEASURE} Le fichier source (export CSV) est importé manuellement et doit être supprimé de l'appareil après import.`],
          ['Transferts hors UE', NO_TRANSFER],
        ],
      },
      {
        name: 'Coffre-fort des identifiants',
        rows: [
          ['Finalité', 'Conservation sécurisée des identifiants et informations sensibles de l\'association (comptes de réseaux sociaux, accès bancaires, mots de passe partagés).'],
          ['Base légale', 'Intérêt légitime de l\'association à assurer la continuité et la sécurité de ses comptes (art. 6.1.f RGPD).'],
          ['Personnes concernées', 'Membres du bureau titulaires des comptes, le cas échéant.'],
          ['Catégories de données', `Identifiants, mots de passe, informations bancaires de l'association, notes${s.vaultEntries !== null ? ` ; ${plural(s.vaultEntries, 'entrée')} au moment de l'édition` : ' (coffre verrouillé : nombre d\'entrées non communiqué)'}.`],
          ['Destinataires', 'Détenteurs du mot de passe maître du coffre uniquement.'],
          ['Durée de conservation', RGPD_RETENTION_DEFAULTS.vault],
          ['Mesures de sécurité', `Chiffrement AES-GCM 256 bits ; clé dérivée du mot de passe maître par PBKDF2-SHA-256 (${String(PBKDF2_ITERATIONS).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} itérations) ; le mot de passe maître n'est jamais stocké ; les sauvegardes ne contiennent le coffre que sous forme chiffrée. ${LOCAL_STORAGE_MEASURE}`],
          ['Transferts hors UE', NO_TRANSFER],
        ],
      },
      {
        name: 'Documents émis',
        rows: [
          ['Finalité', 'Édition des documents officiels de l\'association (attestations, procès-verbaux, conventions, notes de frais) et tenue d\'un registre de preuve.'],
          ['Base légale', 'Exécution du contrat d\'adhésion et intérêt légitime de l\'association (art. 6.1.b et 6.1.f RGPD) ; obligations comptables pour les pièces financières (art. 6.1.c).'],
          ['Personnes concernées', 'Membres et tiers mentionnés dans les documents (partenaires, participants).'],
          ['Catégories de données', `Référence, type et date des documents, membres concernés, empreinte de contrôle ; ${plural(s.documents, 'document')} au registre${s.signatures ? ` ; ${plural(s.signatures, 'signature manuscrite numérisée', 'signatures manuscrites numérisées')}` : ''}.`],
          ['Destinataires', `${bureau} ; destinataires de chaque document.`],
          ['Durée de conservation', `${retention(values, 'retentionFinance', 'finance')} Registre : ${RGPD_RETENTION_DEFAULTS.documents.charAt(0).toLowerCase()}${RGPD_RETENTION_DEFAULTS.documents.slice(1)}`],
          ['Mesures de sécurité', `${LOCAL_STORAGE_MEASURE} Empreinte SHA-256 imprimée sur chaque document pour en vérifier l'intégrité.`],
          ['Transferts hors UE', NO_TRANSFER],
        ],
      },
    ];

    const blocks = [
      b.title('Registre des activités de traitement', `${org.name} · article 30 du RGPD · à jour au ${formatDateLong(date)}`),
      b.callout(`Registre établi automatiquement à partir des données réellement présentes dans BDE Manager le ${formatDateLong(date)} : ${plural(s.members, 'membre')}, ${plural(s.candidates, 'candidature')}, ${plural(s.documents, 'document')} au registre.`, 'info'),
      b.heading('Responsable du traitement'),
      b.kv([
        ['Organisme', organizationLegalLine(org)],
        ['Représentant', president ? `${president.name}, ${president.role}` : ''],
        ['Contact', email],
        ['Outil', 'BDE Manager — application web sans serveur applicatif : les données sont conservées dans le navigateur de l\'appareil utilisé.'],
      ]),
      b.heading('Synthèse'),
      b.table(
        [
          { key: 'n', label: 'N°', width: 0.07, align: 'center' },
          { key: 'name', label: 'Traitement', width: 0.38 },
          { key: 'people', label: 'Personnes', width: 0.3 },
          { key: 'basis', label: 'Base légale', width: 0.25 },
        ],
        [
          { n: '1', name: 'Gestion des membres', people: plural(s.members, 'membre'), basis: 'Contrat (6.1.b)' },
          { n: '2', name: 'Gouvernance des accès Drive', people: plural(s.driveMembers, 'membre'), basis: 'Intérêt légitime (6.1.f)' },
          { n: '3', name: 'Recrutement des membres actifs', people: plural(s.candidates, 'candidat'), basis: 'Précontractuel (6.1.b)' },
          { n: '4', name: 'Coffre-fort des identifiants', people: 'Membres du bureau', basis: 'Intérêt légitime (6.1.f)' },
          { n: '5', name: 'Documents émis', people: plural(s.documents, 'document'), basis: 'Contrat, obligations (6.1.b, c, f)' },
        ],
        { dense: true },
      ),
    ];
    activities.forEach((a, i) => {
      blocks.push(b.heading(`Traitement n° ${i + 1} — ${a.name}`));
      blocks.push(b.kv(a.rows));
    });
    blocks.push(b.heading('Mesures de sécurité communes'));
    blocks.push(b.list([
      'Données stockées localement sur l\'appareil, aucun envoi à un serveur par l\'application.',
      'Sauvegardes exportées au format JSON : le coffre-fort n\'y figure que chiffré ; les autres données y sont en clair et le fichier doit être conservé en lieu sûr.',
      'À respecter : appareils protégés par un mot de passe de session et application utilisée uniquement par les membres du bureau habilités.',
      'À respecter : revue des accès Drive et changement des mots de passe partagés à chaque passation.',
    ]));
    blocks.push(b.placeDate(cityOf(org), formatDateLong(date)));
    blocks.push(b.signatures([signatureSlot(president, 'Le responsable du traitement')]));

    return {
      meta: {
        templateId: 'registre-traitements',
        title: `Registre des traitements — ${formatDateLong(date)}`,
        fileName: safeFileName(`Registre_traitements_RGPD_${date}`),
        confidential: true,
      },
      blocks,
    };
  },
};

// ------------------------------------------------------------
// Autorisation de captation et de diffusion de l'image
// ------------------------------------------------------------

const SUPPORTS = [
  { key: 'supportSocial', label: 'Réseaux sociaux de l\'association', default: true },
  { key: 'supportWebsite', label: 'Site internet de l\'association', default: true },
  { key: 'supportPosters', label: 'Affiches, flyers et supports imprimés', default: true },
  { key: 'supportPress', label: 'Presse et communiqués', default: false },
  { key: 'supportInternal', label: 'Supports internes (lettre d\'information, archives, rapport d\'activité)', default: true },
];

/** Membre mineur à la date donnée (date de naissance renseignée). */
const isMinor = (member, at) => {
  const age = ageAt(member?.birthDate, at);
  return Number.isFinite(age) && age < 18;
};

const autorisationImage = {
  id: 'autorisation-droit-image',
  category: 'rgpd',
  title: 'Autorisation de droit à l\'image',
  description: 'Autorisation de captation et de diffusion de l\'image d\'un membre, supports au choix, révocable.',
  icon: 'Camera',
  tags: ['droit à l\'image', 'photo', 'vidéo', 'consentement', 'RGPD', 'autorisation'],
  scope: 'member',
  memberFilter: (m) => m.imageConsent !== 'oui' && m.imageConsent !== 'non',
  legal: {
    note: 'Le droit à l\'image découle du droit au respect de la vie privée (article 9 du Code civil) ; l\'image d\'une personne identifiable est en outre une donnée personnelle au sens du RGPD. Pour un mineur, l\'autorisation doit être signée par son ou ses représentants légaux. Les cases ne sont pas pré-cochées : la personne choisit elle-même les supports autorisés.',
    references: ['Code civil, article 9', 'Règlement (UE) 2016/679 (RGPD), article 6.1.a'],
  },
  fields: [
    { key: 'scopeText', label: 'Événement ou période concernés', type: 'text', default: (ctx) => `activités et événements de l'association, année universitaire ${academicYear(ctx.today)}` },
    ...SUPPORTS.map(s => ({ key: s.key, label: `Proposer : ${s.label}`, type: 'checkbox', default: s.default })),
    { key: 'durationYears', label: 'Durée de l\'autorisation (années)', type: 'number', default: 1, min: 1, max: 10 },
    { key: 'minor', label: 'Le membre est mineur (signature du représentant légal)', type: 'checkbox', default: (ctx, member) => isMinor(member, ctx.today) },
    { key: 'contactEmail', label: 'Email pour retirer son consentement', type: 'text', default: (ctx) => ctx.organization.email || '' },
    { key: 'signDate', label: 'Date pré-remplie (laisser vide pour une date manuscrite)', type: 'date' },
  ],
  suggest: (ctx) => {
    const missing = ctx.members.filter(m => autorisationImage.memberFilter(m));
    if (!missing.length) return [];
    return [{
      id: 'droit-image-a-recueillir',
      title: 'Recueillir les autorisations de droit à l\'image',
      reason: `${plural(missing.length, 'membre')} ${missing.length > 1 ? 'n\'ont' : 'n\'a'} pas d'autorisation de droit à l'image enregistrée.`,
      priority: 'medium',
      memberIds: missing.map(m => m.id),
    }];
  },
  build: (ctx, values, member) => {
    const b = createBlockFactory();
    const org = ctx.organization;
    const name = fullName(member) || '______________________________';
    const years = Math.max(1, Math.min(10, Math.round(Number(values.durationYears) || 1)));
    const supports = SUPPORTS.filter(s => values[s.key]).map(s => ({ label: s.label }));
    const email = str(values.contactEmail) || str(org.email);

    const blocks = [
      b.title('Autorisation de captation et de diffusion de l\'image', org.name),
      b.p(`Je soussigné(e) **${name}**${values.minor ? ' (ou, pour un mineur, son représentant légal désigné ci-dessous)' : ''} déclare avoir été informé(e) que l'association ${org.name} est susceptible de réaliser des photographies et des vidéos dans le cadre suivant : ${str(values.scopeText) || 'activités et événements de l\'association'}.`),
      b.heading('Mon choix', 2),
      b.checklist([
        { label: 'J\'autorise l\'association à capter, fixer et diffuser mon image sur les supports cochés ci-dessous.' },
        { label: 'Je n\'autorise pas la captation ni la diffusion de mon image.' },
      ]),
      b.heading('Supports autorisés (à cocher)', 2),
    ];
    if (supports.length) blocks.push(b.checklist(supports));
    else blocks.push(b.blankLines(['Supports : ______________________________________________']));

    blocks.push(b.heading('Conditions', 2));
    blocks.push(b.list([
      `L'autorisation est consentie pour une durée ${years === 1 ? 'd\'un an' : `de ${numberToFrench(years)} ans`} à compter de sa signature.`,
      'Elle est consentie à titre gratuit et ne donne lieu à aucune rémunération.',
      'Les images sont utilisées exclusivement pour la communication non commerciale de l\'association ; elles ne sont ni vendues ni cédées à des tiers.',
      'L\'association s\'interdit toute utilisation portant atteinte à la dignité, à la réputation ou à la vie privée de la personne, et toute légende ou commentaire de nature à lui nuire.',
      `Je peux retirer mon consentement à tout moment, sans avoir à me justifier, en écrivant à ${email || 'l\'association'}. Le retrait vaut pour l'avenir : l'association retire alors les contenus concernés de ses propres supports dans les meilleurs délais, sans que cela remette en cause les diffusions antérieures.`,
    ]));
    blocks.push(b.small('Le droit à l\'image découle du droit au respect de la vie privée (article 9 du Code civil). L\'image d\'une personne identifiable est une donnée personnelle : son traitement repose ici sur votre consentement (article 6.1.a du RGPD). Vous disposez d\'un droit d\'accès, de rectification et d\'effacement et pouvez saisir la CNIL (www.cnil.fr).', { tone: 'muted' }));

    if (values.minor) {
      blocks.push(b.heading('Représentant légal (personne mineure)', 2));
      blocks.push(b.blankLines([
        'Nom et prénom du représentant légal : ________________________________',
        'Qualité (père, mère, tuteur) : ______________________',
        'Adresse : ______________________________________________________',
        'Téléphone ou email : ____________________________',
      ]));
    }

    blocks.push(b.placeDate(cityOf(org), formatDateLong(values.signDate) || '____ / ____ / ________'));
    const slots = [{ label: 'La personne photographiée', name: fullName(member), mention: 'Lu et approuvé, bon pour autorisation' }];
    if (values.minor) slots.push({ label: 'Le représentant légal', mention: 'Lu et approuvé, bon pour autorisation' });
    blocks.push(b.signatures(slots));

    return {
      meta: {
        templateId: 'autorisation-droit-image',
        title: `Autorisation de droit à l'image — ${fullName(member) || 'membre'}`,
        fileName: safeFileName(`Autorisation_droit_image_${officialName(member) || 'membre'}`),
        memberIds: member ? [member.id] : [],
      },
      blocks,
    };
  },
};

export default [mentionInformation, registreTraitements, autorisationImage];
