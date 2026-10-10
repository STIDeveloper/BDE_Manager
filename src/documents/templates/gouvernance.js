// ============================================================
// STUDIO DOCUMENTS — MODÈLES « GOUVERNANCE & LÉGAL »
// ============================================================
// Modèles de la catégorie « gouvernance » — voir le contrat dans ../context.js
// et la structure des documents dans ../model.js.
//
// ── Méthode OPTIONNELLE `warnings(ctx, values, member?)` ────
// En plus du contrat commun, un modèle peut exposer :
//
//   warnings: (ctx, values, member) => string[]
//
// Elle reçoit les valeurs COMPLÈTES du formulaire (défauts + saisies) et
// renvoie des avertissements en français, destinés à être affichés par
// l'interface au-dessus de l'aperçu (ex. délai de convocation insuffisant,
// quorum non atteint, signataires identiques). Ces avertissements ne
// modifient jamais le document produit et ne bloquent pas la génération.
// Tableau vide = rien à signaler. Fonction pure, sans effet de bord.
//
// ── Mise en garde ───────────────────────────────────────────
// Les règles de quorum, de majorité et de délai de convocation dépendent des
// statuts de chaque association : les modèles appliquent les paramètres du
// profil (agNoticeDays, agQuorumPercent) et les choix du formulaire, sans
// présumer d'une règle légale générale. Seules des références juridiques
// vérifiées sont citées (loi du 1er juillet 1901, art. 5 ; décret du
// 16 août 1901, art. 1er).
// ============================================================

import { createBlockFactory, safeFileName } from '../model.js';
import {
  formatDateLong, formatDateShort, formatTime, formatMoney, daysBetween, academicYear, isoDate, toDate,
  fullName, officialName, roleLabelOf, poleOf, signatory, signatureSlot, organizationLegalLine,
  cityOf, memberWithRole, bureauMembers, joinFr, plural,
} from '../context.js';
import {
  computeQuorum, resolutionOutcome, majorityRuleText, MAJORITY_OPTIONS, resolutionOrdinal, formatPercent,
  noticeWarning, compareComposition, parseActionLine, toCount, countLabel,
} from './governanceMath.js';

// ------------------------------------------------------------
// Utilitaires internes
// ------------------------------------------------------------

const STATUTES_NOTE = 'Les règles de quorum, de majorité et de convocation sont fixées par tes statuts : vérifie-les.';
const BLANK = '____________________';
const BLANK_CELL = '________________';
const BLANK_DATE = '____ / ____ / ________';

const str = (v) => (typeof v === 'string' ? v.trim() : (typeof v === 'number' && Number.isFinite(v) ? String(v) : ''));
const byId = (ctx, id) => (id ? ctx.members.find(m => m.id === id) || null : null);
const membersByIds = (ctx, ids) => [...new Set(Array.isArray(ids) ? ids : [])].map(id => byId(ctx, id)).filter(Boolean);
const sortOfficial = (list) => [...list].sort((a, b) => officialName(a).localeCompare(officialName(b), 'fr'));
const cleanList = (list) => (Array.isArray(list) ? list : []).map(str).filter(Boolean);
const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const lcFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : '');
/** « de signer », « d'effectuer » (élision devant voyelle ou h muet). */
const withDe = (s) => (/^[aeiouyhàâéèêëîïôöûù]/i.test(s) ? `d'${s}` : `de ${s}`);
const nameOr = (m, fallback = BLANK) => fullName(m) || fallback;
/** Paragraphes d'un texte libre (séparés par une ligne vide). */
const paragraphs = (text) => str(text).split(/\n\s*\n/).map(s => s.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);

/** Rang d'un membre dans l'ordre du catalogue (président, vice-président…). */
function roleRank(ctx, member) {
  const idx = ctx.roleList.findIndex(r => r.id === member?.mainRole);
  return idx === -1 ? 1e6 : idx;
}
const sortByRole = (ctx, list) => [...list].sort((a, b) => roleRank(ctx, a) - roleRank(ctx, b) || officialName(a).localeCompare(officialName(b), 'fr'));

function addDays(date, n) {
  const d = toDate(date) || new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Date d'AG par défaut : aujourd'hui + délai statutaire, reportée au lundi si week-end. */
function defaultAgDate(ctx) {
  const notice = toCount(ctx.organization.agNoticeDays);
  let d = addDays(ctx.today, notice);
  if (d.getDay() === 6) d = addDays(d, 2);
  if (d.getDay() === 0) d = addDays(d, 1);
  return isoDate(d);
}

const AG_TYPES = [
  { value: 'ordinaire', label: 'Ordinaire' },
  { value: 'extraordinaire', label: 'Extraordinaire' },
];
const agType = (v) => (v === 'extraordinaire' ? 'extraordinaire' : 'ordinaire');
const agLabel = (type) => `assemblée générale ${agType(type)}`;

/** « mardi 27 octobre 2026 à 18 h 30 » (ou ligne à compléter). */
function whenText(date, time) {
  const d = formatDateLong(date, { weekday: true });
  const t = formatTime(time);
  return `${d || BLANK_DATE}${t ? ` à ${t}` : ''}`;
}

export const AGENDA_ORDINAIRE = [
  'Accueil des membres, émargement et vérification du quorum',
  'Ouverture de la séance et désignation du/de la secrétaire de séance',
  'Présentation et approbation du rapport moral',
  'Présentation du rapport financier, approbation des comptes de l\'exercice écoulé et quitus donné au/à la trésorier(ère)',
  'Présentation et vote du budget prévisionnel',
  'Renouvellement des membres du bureau : appel à candidatures et élection',
  'Questions diverses',
];

export const AGENDA_EXTRAORDINAIRE = [
  'Accueil des membres, émargement et vérification du quorum',
  'Ouverture de la séance et désignation du/de la secrétaire de séance',
  'Présentation des modifications statutaires proposées',
  'Vote sur la modification des statuts',
  'Pouvoirs donnés au bureau pour accomplir les formalités de déclaration',
];

/**
 * Ordre du jour effectif : la liste saisie, sinon celle par défaut du type
 * d'AG. Si l'utilisateur choisit « extraordinaire » sans avoir retouché
 * l'ordre du jour ordinaire proposé par défaut, on bascule automatiquement
 * sur l'ordre du jour extraordinaire.
 */
export function resolveAgenda(list, type) {
  const clean = cleanList(list);
  const isDefaultOrdinary = clean.length === AGENDA_ORDINAIRE.length && clean.every((x, i) => x === AGENDA_ORDINAIRE[i]);
  if (agType(type) === 'extraordinaire' && (clean.length === 0 || isDefaultOrdinary)) return [...AGENDA_EXTRAORDINAIRE];
  return clean.length ? clean : [...AGENDA_ORDINAIRE];
}

/** Blocs du formulaire de pouvoir (modèle « pouvoir-ag » et annexe de la convocation). */
function pouvoirBlocks(B, ctx, { mandant = null, mandataire = null, type, date, heure, lieu }) {
  const org = ctx.organization;
  const agName = agLabel(type);
  const lieuTxt = str(lieu) ? `, au lieu suivant : ${str(lieu)}` : '';
  return [
    B.title('Pouvoir', `${capitalize(agName)} — ${org.name}`),
    B.p(`Je soussigné(e) **${nameOr(mandant)}**, membre de l'association ${org.name}, donne par la présente pouvoir à **${nameOr(mandataire)}**, membre de l'association, de me représenter à l'${agName} qui se tiendra le ${whenText(date, heure)}${lieuTxt}.`),
    B.p('À cet effet, je l\'autorise à signer la feuille d\'émargement en mon nom, à prendre part aux délibérations et à émettre tous votes sur l\'ensemble des questions inscrites à l\'ordre du jour. Le présent pouvoir vaut également pour toute assemblée réunie ultérieurement sur le même ordre du jour, faute de quorum lors de la première réunion.'),
    B.callout('La signature du mandant doit être précédée de la mention manuscrite « Bon pour pouvoir ». Le pouvoir est remis au/à la président(e) de séance au plus tard à l\'ouverture de l\'assemblée. Le mandataire doit être membre de l\'association ; le nombre de pouvoirs qu\'un même membre peut détenir est, le cas échéant, limité par les statuts.', 'info'),
    B.placeDate(cityOf(org), BLANK_DATE),
    B.signatures([
      { label: 'Le mandant', name: fullName(mandant), role: '', mention: 'Bon pour pouvoir' },
      { label: 'Le mandataire', name: fullName(mandataire), role: '', mention: 'Bon pour acceptation du pouvoir' },
    ]),
  ];
}

function memberField(key, label, roles, extra = {}) {
  return { key, label, type: 'member', default: (ctx) => memberWithRole(ctx, roles)?.id || '', ...extra };
}

// ============================================================
// 1. CONVOCATION À L'ASSEMBLÉE GÉNÉRALE
// ============================================================

const convocationAg = {
  id: 'convocation-ag',
  category: 'gouvernance',
  title: 'Convocation à l\'assemblée générale',
  description: 'Convocation des membres à une AG ordinaire ou extraordinaire, avec ordre du jour, modalités de vote et pouvoir à joindre.',
  icon: 'Megaphone',
  tags: ['AG', 'assemblée générale', 'convocation', 'ordre du jour', 'procuration'],
  scope: 'organization',
  fields: [
    { key: 'type', label: 'Type d\'assemblée', type: 'select', options: AG_TYPES, default: 'ordinaire' },
    { key: 'date', label: 'Date de l\'assemblée', type: 'date', required: true, default: (ctx) => defaultAgDate(ctx) },
    { key: 'heure', label: 'Heure', type: 'time', default: '18:30' },
    { key: 'lieu', label: 'Lieu', type: 'text', placeholder: 'Amphithéâtre A, bâtiment principal', default: (ctx) => str(ctx.organization.school) },
    { key: 'ordreDuJour', label: 'Ordre du jour', type: 'list', default: () => [...AGENDA_ORDINAIRE], help: 'Un point par ligne. Pour une AG extraordinaire, l\'ordre du jour adapté est proposé automatiquement tant que la liste par défaut n\'est pas modifiée.' },
    { key: 'dateEnvoi', label: 'Date d\'envoi de la convocation', type: 'date', default: (ctx) => isoDate(ctx.today) },
    memberField('convocant', 'Convoquée par', ['president', 'vice_president']),
    { key: 'pouvoirsMax', label: 'Nombre maximal de pouvoirs par membre', type: 'number', min: 0, default: '', help: 'Laisse vide si les statuts ne fixent pas de limite.' },
    { key: 'mentionQuorum', label: 'Rappeler le quorum statutaire', type: 'checkbox', default: true },
    { key: 'documentsConsultables', label: 'Indiquer que les documents sont consultables', type: 'checkbox', default: true },
    { key: 'joindrePouvoir', label: 'Joindre un formulaire de pouvoir', type: 'checkbox', default: true },
    { key: 'informations', label: 'Informations complémentaires', type: 'textarea', default: '' },
  ],
  legal: {
    note: `${STATUTES_NOTE} Le délai de convocation pris en compte est celui du profil de l'association (paramètre « délai de convocation »).`,
  },
  warnings(ctx, v) {
    const out = [];
    const days = daysBetween(v.dateEnvoi || ctx.today, v.date);
    const w = noticeWarning(days, ctx.organization.agNoticeDays);
    if (w) out.push(w);
    if (!str(v.date)) out.push('La date de l\'assemblée générale n\'est pas renseignée.');
    if (!str(v.lieu)) out.push('Le lieu de l\'assemblée générale n\'est pas renseigné : une ligne à compléter sera imprimée.');
    if (!signatory(ctx, v.convocant)) out.push('Aucun signataire : désigne la personne qui convoque l\'assemblée.');
    return out;
  },
  build(ctx, v) {
    const B = createBlockFactory();
    const org = ctx.organization;
    const type = agType(v.type);
    const agName = agLabel(type);
    const sig = signatory(ctx, v.convocant);
    const agenda = resolveAgenda(v.ordreDuJour, type);
    const lieu = str(v.lieu);
    const pct = Number(org.agQuorumPercent) || 0;
    const max = toCount(v.pouvoirsMax);

    const blocks = [
      B.title(`Convocation à l'${agName}`, `${org.name} — année ${academicYear(toDate(v.date) || ctx.today)}`),
      B.kv([
        ['Date', whenText(v.date, v.heure)],
        ['Lieu', lieu || BLANK],
        ['Convoquée par', sig ? `${sig.name}, ${sig.role}` : ''],
      ]),
      B.p('Madame, Monsieur,'),
      B.p(`Conformément aux statuts de l'association ${org.name}, nous avons l'honneur de vous convoquer à l'**${agName}** qui se tiendra le **${whenText(v.date, v.heure)}**, au lieu suivant : **${lieu || BLANK}**.`),
    ];
    if (type === 'extraordinaire') {
      blocks.push(B.p('Cette assemblée est réunie en session extraordinaire : elle ne pourra délibérer que sur les points expressément inscrits à l\'ordre du jour ci-dessous.'));
    }
    blocks.push(
      B.heading('Ordre du jour'),
      B.list(agenda, true),
      B.heading('Modalités de participation et de vote'),
      B.p('Prennent part aux votes les membres de l\'association disposant du droit de vote dans les conditions fixées par les statuts ; chaque membre présent signe la feuille d\'émargement à son arrivée.'),
      B.p(`Si vous ne pouvez pas être présent(e), vous pouvez vous faire représenter par un autre membre de l'association en lui remettant ${v.joindrePouvoir ? 'le pouvoir joint à la présente convocation' : 'un pouvoir, disponible sur simple demande auprès du bureau'}, daté, signé et revêtu de la mention manuscrite « Bon pour pouvoir ».${max ? ` Chaque membre ne peut détenir plus de ${plural(max, 'pouvoir')}.` : ''} Les pouvoirs doivent être remis au/à la président(e) de séance au plus tard à l'ouverture de l'assemblée.`),
    );
    if (v.mentionQuorum && pct > 0) {
      blocks.push(B.p(`Conformément aux statuts, l'assemblée ne peut valablement délibérer que si au moins ${formatPercent(pct)} des membres sont présents ou représentés. Votre présence, ou à défaut votre représentation, est donc essentielle.`));
    }
    if (v.documentsConsultables) {
      const docs = type === 'extraordinaire'
        ? 'Les documents soumis à l\'assemblée (projet de statuts modifiés et projets de résolutions)'
        : 'Les documents soumis à l\'approbation de l\'assemblée (rapport moral, rapport financier et comptes de l\'exercice)';
      blocks.push(B.p(`${docs} peuvent être consultés avant la séance, sur simple demande auprès du bureau${str(org.email) ? ` (${str(org.email)})` : ''}.`));
    }
    paragraphs(v.informations).forEach(t => blocks.push(B.p(t)));
    blocks.push(
      B.p('Comptant sur votre présence, nous vous prions d\'agréer, Madame, Monsieur, l\'expression de nos salutations associatives.'),
      B.placeDate(cityOf(org), formatDateLong(v.dateEnvoi || ctx.today) || BLANK_DATE),
      B.signatures([signatureSlot(sig, 'Pour l\'association')]),
    );
    if (v.joindrePouvoir) {
      blocks.push(B.pageBreak(), ...pouvoirBlocks(B, ctx, { type, date: v.date, heure: v.heure, lieu }));
    }
    return {
      meta: {
        templateId: 'convocation-ag',
        title: `Convocation à l'${agName}${formatDateShort(v.date) ? ` du ${formatDateShort(v.date)}` : ''}`,
        fileName: safeFileName(`Convocation AG ${type} ${str(v.date)}`),
      },
      blocks,
    };
  },
};

// ============================================================
// 2. FEUILLE D'ÉMARGEMENT
// ============================================================

const EMARGEMENT_CONTEXTS = [
  { value: 'ag', label: 'Assemblée générale' },
  { value: 'bureau', label: 'Réunion de bureau' },
  { value: 'evenement', label: 'Événement' },
];

const feuilleEmargement = {
  id: 'feuille-emargement',
  category: 'gouvernance',
  title: 'Feuille d\'émargement',
  description: 'Liste de présence à signer (AG, réunion de bureau, événement), avec lignes libres et colonne des pouvoirs.',
  icon: 'ClipboardPen',
  tags: ['présence', 'émargement', 'AG', 'signature', 'pouvoir'],
  scope: 'organization',
  fields: [
    { key: 'contexte', label: 'Contexte', type: 'select', options: EMARGEMENT_CONTEXTS, default: 'ag' },
    { key: 'intitule', label: 'Intitulé (facultatif)', type: 'text', placeholder: 'Assemblée générale ordinaire', default: '' },
    { key: 'date', label: 'Date', type: 'date', default: (ctx) => isoDate(ctx.today) },
    { key: 'heure', label: 'Heure', type: 'time', default: '' },
    { key: 'lieu', label: 'Lieu', type: 'text', default: '' },
    { key: 'membres', label: 'Membres listés', type: 'members', default: (ctx) => sortOfficial(ctx.members).map(m => m.id) },
    { key: 'lignesLibres', label: 'Lignes vierges supplémentaires', type: 'number', min: 0, max: 60, default: 5 },
    { key: 'colonnePouvoir', label: 'Colonne « Pouvoir donné à » (AG)', type: 'checkbox', default: true },
    { key: 'paysage', label: 'Orientation paysage', type: 'checkbox', default: false },
  ],
  legal: { note: `${STATUTES_NOTE} La feuille d'émargement signée et les pouvoirs sont à conserver avec le procès-verbal de l'assemblée.` },
  build(ctx, v) {
    const B = createBlockFactory();
    const org = ctx.organization;
    const contexte = EMARGEMENT_CONTEXTS.some(c => c.value === v.contexte) ? v.contexte : 'ag';
    const isAg = contexte === 'ag';
    const intitule = str(v.intitule) || EMARGEMENT_CONTEXTS.find(c => c.value === contexte).label;
    const members = sortOfficial(membersByIds(ctx, v.membres));
    const withPouvoir = isAg && v.colonnePouvoir !== false;

    const columns = [
      { key: 'n', label: 'N°', width: 0.05, align: 'center' },
      { key: 'nom', label: 'Nom', width: withPouvoir ? 0.15 : 0.18 },
      { key: 'prenom', label: 'Prénom', width: withPouvoir ? 0.14 : 0.16 },
      { key: 'fonction', label: 'Fonction', width: withPouvoir ? 0.17 : 0.2 },
      ...(withPouvoir ? [{ key: 'pouvoir', label: 'Pouvoir donné à', width: 0.19 }] : []),
      { key: 'signature', label: 'Signature', width: withPouvoir ? 0.3 : 0.41 },
    ];
    const rows = members.map((m, i) => ({
      n: String(i + 1),
      nom: str(m.lastName).toUpperCase(),
      prenom: str(m.firstName),
      fonction: roleLabelOf(ctx, m),
      ...(withPouvoir ? { pouvoir: '' } : {}),
      signature: '',
    }));
    const blankRows = Math.min(60, toCount(v.lignesLibres));

    const blocks = [
      B.title('Feuille d\'émargement', `${intitule} — ${org.name}`),
      B.kv([
        ['Date', formatDateLong(v.date, { weekday: true }) || BLANK_DATE],
        ['Heure', formatTime(v.heure)],
        ['Lieu', str(v.lieu)],
      ]),
    ];
    if (isAg) {
      blocks.push(B.p(`Les membres présents sont invités à signer la présente feuille lors de leur entrée en séance.${withPouvoir ? ' Pour un membre représenté, le mandataire inscrit son propre nom dans la colonne « Pouvoir donné à » et signe ; le pouvoir correspondant est annexé à la présente feuille.' : ''}`, { tone: 'small' }));
    }
    blocks.push(B.table(columns, rows, {
      blankRows,
      dense: true,
      caption: `${plural(members.length, 'membre inscrit', 'membres inscrits')}${blankRows ? ` et ${plural(blankRows, 'ligne libre', 'lignes libres')}` : ''}`,
    }));
    if (isAg) {
      blocks.push(
        B.blankLines([
          'Nombre de membres présents : ________',
          ...(withPouvoir ? ['Nombre de membres représentés : ________'] : []),
          'Total des membres présents ou représentés : ________',
        ]),
        B.p('Feuille d\'émargement arrêtée et certifiée exacte par :', { tone: 'small', editable: false }),
        B.signatures([
          { label: 'Le/la président(e) de séance', name: '', role: '' },
          { label: 'Le/la secrétaire de séance', name: '', role: '' },
        ]),
      );
    } else if (contexte === 'bureau') {
      blocks.push(B.blankLines(['Nombre de membres présents : ________']));
    }
    return {
      meta: {
        templateId: 'feuille-emargement',
        title: `Feuille d'émargement — ${intitule}${formatDateShort(v.date) ? ` du ${formatDateShort(v.date)}` : ''}`,
        fileName: safeFileName(`Emargement ${intitule} ${str(v.date)}`),
        orientation: v.paysage ? 'landscape' : 'portrait',
        memberIds: members.map(m => m.id),
      },
      blocks,
    };
  },
};

// ============================================================
// 3. POUVOIR / PROCURATION POUR L'AG
// ============================================================

const pouvoirAg = {
  id: 'pouvoir-ag',
  category: 'gouvernance',
  title: 'Pouvoir pour l\'assemblée générale',
  description: 'Procuration nominative permettant à un membre empêché de se faire représenter à l\'AG.',
  icon: 'Signature',
  tags: ['procuration', 'pouvoir', 'AG', 'mandataire', 'représentation'],
  scope: 'member',
  fields: [
    { key: 'mandataire', label: 'Mandataire (facultatif)', type: 'member', default: '', help: 'Laisse vide pour imprimer une ligne à compléter à la main.' },
    { key: 'type', label: 'Type d\'assemblée', type: 'select', options: AG_TYPES, default: 'ordinaire' },
    { key: 'date', label: 'Date de l\'assemblée', type: 'date', required: true, default: (ctx) => defaultAgDate(ctx) },
    { key: 'heure', label: 'Heure', type: 'time', default: '18:30' },
    { key: 'lieu', label: 'Lieu', type: 'text', default: (ctx) => str(ctx.organization.school) },
  ],
  legal: { note: `${STATUTES_NOTE} Les statuts peuvent limiter le nombre de pouvoirs détenus par un même membre ou exclure le vote par procuration.` },
  warnings(ctx, v, member) {
    const out = [];
    if (member && v.mandataire && v.mandataire === member.id) out.push('Le mandant et le mandataire sont la même personne.');
    if (!str(v.date)) out.push('La date de l\'assemblée générale n\'est pas renseignée.');
    return out;
  },
  build(ctx, v, member) {
    const B = createBlockFactory();
    const mandataire = v.mandataire && v.mandataire !== member?.id ? byId(ctx, v.mandataire) : null;
    const blocks = pouvoirBlocks(B, ctx, { mandant: member, mandataire, type: v.type, date: v.date, heure: v.heure, lieu: v.lieu });
    return {
      meta: {
        templateId: 'pouvoir-ag',
        title: `Pouvoir AG — ${fullName(member) || 'membre'}`,
        fileName: safeFileName(`Pouvoir AG ${officialName(member)} ${str(v.date)}`),
        memberIds: [member?.id, mandataire?.id].filter(Boolean),
      },
      blocks,
    };
  },
};

// ============================================================
// 4. PROCÈS-VERBAL D'ASSEMBLÉE GÉNÉRALE
// ============================================================

function defaultResolutions(ctx) {
  const n = ctx.members.length;
  const year = academicYear(ctx.today);
  return [
    { title: 'Approbation du rapport moral', text: 'Après avoir entendu la présentation du rapport moral par le/la président(e), l\'assemblée générale approuve ce rapport.', for: n, against: 0, abstention: 0 },
    { title: 'Approbation des comptes et quitus au/à la trésorier(ère)', text: 'Après avoir entendu le rapport financier présenté par le/la trésorier(ère), l\'assemblée générale approuve les comptes de l\'exercice écoulé et donne quitus au/à la trésorier(ère) pour sa gestion.', for: n, against: 0, abstention: 0 },
    { title: 'Approbation du budget prévisionnel', text: `L'assemblée générale approuve le budget prévisionnel de l'année ${year} tel qu'il lui a été présenté.`, for: n, against: 0, abstention: 0 },
  ];
}

/** Résolutions saisies, nettoyées (lignes entièrement vides ignorées). */
function cleanResolutions(list) {
  return (Array.isArray(list) ? list : [])
    .filter(r => r && (str(r.title) || str(r.text) || toCount(r.for) || toCount(r.against) || toCount(r.abstention)))
    .map(r => ({ title: str(r.title), text: str(r.text), for: toCount(r.for), against: toCount(r.against), abstention: toCount(r.abstention) }));
}

/** Calculs du PV (partagés par build et warnings). */
function pvFigures(ctx, v) {
  const presents = membersByIds(ctx, v.presents);
  const present = presents.length + toCount(v.autresPresents);
  const quorum = computeQuorum({
    present,
    represented: toCount(v.representes),
    total: toCount(v.totalMembres),
    percent: v.quorumPercent === '' || v.quorumPercent === undefined || v.quorumPercent === null ? ctx.organization.agQuorumPercent : v.quorumPercent,
  });
  const resolutions = cleanResolutions(v.resolutions).map(r => ({ ...r, outcome: resolutionOutcome(r, v.majorite, { voters: quorum.counted }) }));
  return { presents, quorum, resolutions };
}

const pvAg = {
  id: 'pv-ag',
  category: 'gouvernance',
  title: 'Procès-verbal d\'assemblée générale',
  description: 'PV d\'AG avec calcul du quorum, résultat de chaque résolution selon la majorité choisie, élections et signatures.',
  icon: 'Gavel',
  tags: ['PV', 'procès-verbal', 'AG', 'quorum', 'résolutions', 'vote', 'élection'],
  scope: 'organization',
  fields: [
    { key: 'type', label: 'Type d\'assemblée', type: 'select', options: AG_TYPES, default: 'ordinaire' },
    { key: 'date', label: 'Date de l\'assemblée', type: 'date', required: true, default: (ctx) => isoDate(ctx.today) },
    { key: 'lieu', label: 'Lieu', type: 'text', default: (ctx) => str(ctx.organization.school) },
    { key: 'heureOuverture', label: 'Heure d\'ouverture', type: 'time', default: '18:30' },
    { key: 'heureCloture', label: 'Heure de clôture', type: 'time', default: '20:30' },
    { key: 'dateConvocation', label: 'Date d\'envoi de la convocation (facultatif)', type: 'date', default: '' },
    memberField('presidentSeance', 'Président(e) de séance', ['president', 'vice_president']),
    memberField('secretaireSeance', 'Secrétaire de séance', ['secretaire', 'secretaire_adjoint']),
    { key: 'presents', label: 'Membres présents', type: 'members', default: (ctx) => sortOfficial(ctx.members).map(m => m.id) },
    { key: 'autresPresents', label: 'Autres membres présents (non listés dans l\'application)', type: 'number', min: 0, default: 0 },
    { key: 'representes', label: 'Membres représentés (pouvoirs)', type: 'number', min: 0, default: 0 },
    { key: 'totalMembres', label: 'Nombre total de membres de l\'association', type: 'number', min: 0, default: (ctx) => ctx.members.length },
    { key: 'quorumPercent', label: 'Quorum statutaire (%)', type: 'number', min: 0, max: 100, default: (ctx) => Number(ctx.organization.agQuorumPercent) || 0 },
    { key: 'majorite', label: 'Majorité', type: 'select', options: MAJORITY_OPTIONS, default: 'simple' },
    { key: 'listerPresents', label: 'Nommer les membres présents dans le PV', type: 'checkbox', default: true },
    { key: 'ordreDuJour', label: 'Ordre du jour', type: 'list', default: () => [...AGENDA_ORDINAIRE] },
    { key: 'deroulement', label: 'Déroulement de la séance (facultatif)', type: 'textarea', default: '' },
    { key: 'resolutions', label: 'Résolutions', type: 'resolutions', default: (ctx) => defaultResolutions(ctx) },
    { key: 'elections', label: 'Résultats des élections (facultatif)', type: 'list', default: [], help: 'Une ligne par poste, ex. « Présidente : Léa Martin, élue avec 18 voix ».' },
    { key: 'questionsDiverses', label: 'Questions diverses (facultatif)', type: 'textarea', default: '' },
  ],
  legal: {
    note: `${STATUTES_NOTE} Le quorum et la majorité appliqués sont ceux choisis dans le formulaire ; la règle utilisée est rappelée dans le procès-verbal.`,
  },
  warnings(ctx, v) {
    const out = [];
    const { quorum, resolutions } = pvFigures(ctx, v);
    if (!quorum.reached) {
      out.push(`Quorum non atteint : ${quorum.counted} membre(s) présent(s) ou représenté(s) pour ${quorum.required} requis (${formatPercent(quorum.percent)} de ${quorum.total}).`);
    }
    if (toCount(v.totalMembres) > 0 && quorum.counted > toCount(v.totalMembres)) {
      out.push('Le nombre de membres présents ou représentés dépasse le nombre total de membres indiqué.');
    }
    resolutions.forEach((r, i) => {
      if (r.outcome.cast > quorum.counted) out.push(`${resolutionOrdinal(i)} : ${r.outcome.cast} votes comptés pour seulement ${quorum.counted} membres présents ou représentés.`);
    });
    const p = v.presidentSeance; const s = v.secretaireSeance;
    if (p && s && p === s) out.push('Le/la président(e) et le/la secrétaire de séance sont la même personne.');
    return out;
  },
  build(ctx, v) {
    const B = createBlockFactory();
    const org = ctx.organization;
    const type = agType(v.type);
    const agName = agLabel(type);
    const { presents, quorum, resolutions } = pvFigures(ctx, v);
    const pres = signatory(ctx, v.presidentSeance);
    const sec = signatory(ctx, v.secretaireSeance, ['secretaire', 'secretaire_adjoint']);
    const dateLong = formatDateLong(v.date, { weekday: true });
    const ouverture = formatTime(v.heureOuverture);
    const cloture = formatTime(v.heureCloture);
    const lieu = str(v.lieu);
    const agenda = resolveAgenda(v.ordreDuJour, type);
    const convoc = formatDateLong(v.dateConvocation);

    const blocks = [
      B.title(`Procès-verbal de l'${agName}`, `${org.name} — ${dateLong || BLANK_DATE}`),
      B.p(`Le ${dateLong || BLANK_DATE}${ouverture ? `, à ${ouverture}` : ''}, les membres de l'association ${organizationLegalLine(org)}, se sont réunis en ${agName}${lieu ? ` au lieu suivant : ${lieu},` : ''} sur convocation${convoc ? ` adressée le ${convoc}` : ' adressée à l\'ensemble des membres'}.`),
      B.p(`La séance est présidée par **${pres?.name || BLANK}**${pres ? `, ${lcFirst(pres.role)}` : ''}, en qualité de président(e) de séance. **${sec?.name || BLANK}**${sec ? `, ${lcFirst(sec.role)},` : ''} est désigné(e) secrétaire de séance.`),
      B.p('Il a été établi une feuille d\'émargement, signée par les membres présents lors de leur entrée en séance, à laquelle sont annexés les pouvoirs des membres représentés.'),
      B.heading('Quorum'),
      B.kv([
        ['Membres présents', String(quorum.present)],
        ['Membres représentés', String(quorum.represented)],
        ['Total présents ou représentés', String(quorum.counted)],
        ['Nombre total de membres', String(quorum.total)],
        ['Quorum statutaire', quorum.noQuorum ? 'Aucun quorum prévu' : `${formatPercent(quorum.percent)} des membres, soit ${plural(quorum.required, 'membre')}`],
        ['Résultat', quorum.reached ? 'Quorum atteint' : 'Quorum non atteint'],
      ]),
    ];
    const figures = `${plural(quorum.counted, 'membre présent ou représenté', 'membres présents ou représentés')} sur ${plural(quorum.total, 'membre')} (${formatPercent(quorum.ratio)})`;
    if (quorum.noQuorum) {
      blocks.push(B.p(`Avec ${figures}, et les statuts ne fixant pas de quorum selon les paramètres retenus, l'assemblée peut valablement délibérer.`));
    } else if (quorum.reached) {
      blocks.push(B.p(`Avec ${figures}, le quorum de ${formatPercent(quorum.percent)} des membres, soit ${plural(quorum.required, 'membre')}, est atteint. L'assemblée peut donc valablement délibérer.`));
    } else {
      blocks.push(
        B.callout(`Quorum non atteint : ${figures}, alors que ${plural(quorum.required, 'membre est requis', 'membres sont requis')} (${formatPercent(quorum.percent)}).`, 'warning'),
        B.p(`Avec ${figures}, le quorum de ${formatPercent(quorum.percent)} des membres, soit ${plural(quorum.required, 'membre')}, n'est pas atteint. Les délibérations ci-après sont susceptibles d'être contestées au regard des statuts ; le cas échéant, une nouvelle assemblée doit être convoquée dans les conditions qu'ils prévoient.`),
      );
    }
    if (v.listerPresents !== false && presents.length) {
      blocks.push(B.p(`Membres présents : ${joinFr(sortOfficial(presents).map(fullName))}${toCount(v.autresPresents) ? `, ainsi que ${plural(toCount(v.autresPresents), 'autre membre', 'autres membres')} dont les noms figurent sur la feuille d'émargement` : ''}.`, { tone: 'small', align: 'left' }));
    }
    blocks.push(
      B.heading('Ordre du jour'),
      B.p('Le/la président(e) de séance rappelle l\'ordre du jour :'),
      B.list(agenda, true),
    );
    const deroulement = paragraphs(v.deroulement);
    if (deroulement.length) {
      blocks.push(B.heading('Déroulement de la séance'), ...deroulement.map(t => B.p(t)));
    }
    if (resolutions.length) {
      blocks.push(
        B.heading('Résolutions'),
        B.p(majorityRuleText(v.majorite, quorum.counted), { tone: 'small', align: 'left' }),
        B.table([
          { key: 'n', label: 'N°', width: 0.06, align: 'center' },
          { key: 'titre', label: 'Résolution', width: 0.4 },
          { key: 'pour', label: 'Pour', width: 0.1, align: 'center' },
          { key: 'contre', label: 'Contre', width: 0.1, align: 'center' },
          { key: 'abst', label: 'Abstention', width: 0.12, align: 'center' },
          { key: 'resultat', label: 'Résultat', width: 0.22, align: 'center' },
        ], resolutions.map((r, i) => ({
          n: String(i + 1),
          titre: r.title || resolutionOrdinal(i),
          pour: String(r.outcome.for),
          contre: String(r.outcome.against),
          abst: String(r.outcome.abstention),
          resultat: r.outcome.unanimous ? 'Adoptée à l\'unanimité' : r.outcome.label,
        })), { dense: true }),
      );
      resolutions.forEach((r, i) => {
        blocks.push(B.heading(`${resolutionOrdinal(i)}${r.title ? ` — ${r.title}` : ''}`, 2));
        if (r.text) blocks.push(B.p(r.text));
        blocks.push(B.p(`**${r.outcome.sentence}**`));
      });
    }
    const elections = cleanList(v.elections);
    if (elections.length) {
      blocks.push(B.heading('Élections'), B.p('À l\'issue des votes, sont élu(e)s :'), B.list(elections));
    }
    const questions = paragraphs(v.questionsDiverses);
    if (questions.length) blocks.push(B.heading('Questions diverses'), ...questions.map(t => B.p(t)));
    blocks.push(
      B.heading('Clôture'),
      B.p(`L'ordre du jour étant épuisé et plus personne ne demandant la parole, le/la président(e) de séance lève la séance${cloture ? ` à ${cloture}` : ''}.`),
      B.p('De tout ce qui précède, il a été dressé le présent procès-verbal, signé par le/la président(e) de séance et le/la secrétaire de séance.'),
      B.placeDate(cityOf(org), formatDateLong(v.date) || BLANK_DATE),
      B.signatures([
        signatureSlot(pres, 'Le/la président(e) de séance'),
        signatureSlot(sec, 'Le/la secrétaire de séance'),
      ]),
      B.small('Annexes : feuille d\'émargement et pouvoirs des membres représentés.'),
    );
    return {
      meta: {
        templateId: 'pv-ag',
        title: `PV de l'${agName}${formatDateShort(v.date) ? ` du ${formatDateShort(v.date)}` : ''}`,
        fileName: safeFileName(`PV AG ${type} ${str(v.date)}`),
        memberIds: presents.map(m => m.id),
      },
      blocks,
    };
  },
};

// ============================================================
// 5. COMPTE RENDU DE RÉUNION DE BUREAU
// ============================================================

/** Nom complet d'un membre reconnu dans un texte libre (« Léa », « Léa Martin »), sinon le texte tel quel. */
function resolveOwner(ctx, text) {
  const t = str(text).toLowerCase();
  if (!t) return '';
  const exact = ctx.members.find(m => fullName(m).toLowerCase() === t || officialName(m).toLowerCase() === t);
  if (exact) return fullName(exact);
  const byFirst = ctx.members.filter(m => str(m.firstName).toLowerCase() === t);
  return byFirst.length === 1 ? fullName(byFirst[0]) : str(text);
}

/** Échéance : 'AAAA-MM-JJ' → « 15/11/2026 », sinon texte libre conservé. */
const formatDue = (text) => (/^\d{4}-\d{2}-\d{2}$/.test(str(text)) ? formatDateShort(str(text)) : str(text));

const crReunionBureau = {
  id: 'cr-reunion-bureau',
  category: 'gouvernance',
  title: 'Compte rendu de réunion de bureau',
  description: 'Présents, excusés, ordre du jour, décisions et tableau des actions à mener.',
  icon: 'NotebookPen',
  tags: ['réunion', 'bureau', 'compte rendu', 'CR', 'décisions', 'actions'],
  scope: 'organization',
  fields: [
    { key: 'date', label: 'Date de la réunion', type: 'date', default: (ctx) => isoDate(ctx.today) },
    { key: 'heure', label: 'Heure', type: 'time', default: '' },
    { key: 'lieu', label: 'Lieu', type: 'text', default: '' },
    { key: 'participants', label: 'Participants', type: 'members', default: (ctx) => sortByRole(ctx, bureauMembers(ctx)).map(m => m.id) },
    { key: 'excuses', label: 'Excusé(e)s', type: 'members', default: [] },
    { key: 'invites', label: 'Invité(e)s (facultatif)', type: 'text', default: '' },
    memberField('redacteur', 'Rédigé par', ['secretaire', 'secretaire_adjoint', 'president']),
    { key: 'ordreDuJour', label: 'Ordre du jour', type: 'list', default: ['Point sur les adhésions', 'Préparation des prochains événements', 'Point de trésorerie', 'Questions diverses'] },
    { key: 'echanges', label: 'Synthèse des échanges (facultatif)', type: 'textarea', default: '' },
    { key: 'decisions', label: 'Décisions prises', type: 'list', default: [] },
    { key: 'actions', label: 'Actions à mener', type: 'list', default: [], help: 'Une action par ligne, au format « Action — Responsable — Échéance » (ex. « Réserver la salle — Léa Martin — 2026-11-15 »). Les séparateurs « — », « | », « ; » ou « - » entouré d\'espaces sont acceptés ; le responsable et l\'échéance sont facultatifs.' },
    { key: 'prochaineDate', label: 'Prochaine réunion (date)', type: 'date', default: '' },
    { key: 'prochaineHeure', label: 'Prochaine réunion (heure)', type: 'time', default: '' },
  ],
  legal: { note: `${STATUTES_NOTE} Si les statuts confèrent au bureau un pouvoir de décision, conserve ce compte rendu dans le registre des délibérations.` },
  build(ctx, v) {
    const B = createBlockFactory();
    const org = ctx.organization;
    const participants = sortByRole(ctx, membersByIds(ctx, v.participants));
    const excuses = sortByRole(ctx, membersByIds(ctx, v.excuses)).filter(m => !participants.includes(m));
    const redacteur = signatory(ctx, v.redacteur, ['secretaire', 'secretaire_adjoint', 'president']);
    const pres = signatory(ctx, null, ['president', 'vice_president']);
    const agenda = cleanList(v.ordreDuJour);
    const decisions = cleanList(v.decisions);
    const actions = cleanList(v.actions).map(parseActionLine).filter(a => a.action);
    const withRole = (m) => `${fullName(m)} — ${roleLabelOf(ctx, m)}`;

    const blocks = [
      B.title('Compte rendu de réunion de bureau', `${org.name} — ${formatDateLong(v.date, { weekday: true }) || BLANK_DATE}`),
      B.kv([
        ['Date', `${formatDateLong(v.date, { weekday: true }) || BLANK_DATE}${formatTime(v.heure) ? ` à ${formatTime(v.heure)}` : ''}`],
        ['Lieu', str(v.lieu)],
        ['Rédigé par', redacteur ? `${redacteur.name}, ${redacteur.role}` : ''],
      ]),
      B.heading('Participants'),
      participants.length ? B.list(participants.map(withRole)) : B.blankLines([BLANK, BLANK]),
    ];
    if (excuses.length) blocks.push(B.p(`Excusé(e)s : ${joinFr(excuses.map(fullName))}.`, { align: 'left' }));
    if (str(v.invites)) blocks.push(B.p(`Invité(e)s : ${str(v.invites)}.`, { align: 'left' }));
    blocks.push(B.heading('Ordre du jour'), agenda.length ? B.list(agenda, true) : B.blankLines([BLANK, BLANK, BLANK]));
    const echanges = paragraphs(v.echanges);
    if (echanges.length) blocks.push(B.heading('Synthèse des échanges'), ...echanges.map(t => B.p(t)));
    blocks.push(B.heading('Décisions'), decisions.length ? B.list(decisions) : B.blankLines([BLANK, BLANK, BLANK]));
    blocks.push(
      B.heading('Actions à mener'),
      B.table([
        { key: 'action', label: 'Action', width: 0.5 },
        { key: 'owner', label: 'Responsable', width: 0.3 },
        { key: 'due', label: 'Échéance', width: 0.2, align: 'center' },
      ], actions.map(a => ({ action: a.action, owner: resolveOwner(ctx, a.owner), due: formatDue(a.due) })), {
        blankRows: actions.length ? 0 : 3,
        dense: true,
      }),
      B.heading('Prochaine réunion'),
    );
    if (str(v.prochaineDate)) {
      blocks.push(B.p(`La prochaine réunion du bureau se tiendra le **${whenText(v.prochaineDate, v.prochaineHeure)}**.`));
    } else {
      blocks.push(B.blankLines([`Date : ${BLANK_DATE}`, 'Heure : ________   Lieu : ____________________']));
    }
    blocks.push(
      B.placeDate(cityOf(org), formatDateLong(v.date) || BLANK_DATE),
      B.signatures([
        signatureSlot(redacteur, 'Le/la rédacteur(rice)'),
        ...(pres && pres.member.id !== redacteur?.member.id ? [signatureSlot(pres, 'Le/la président(e)')] : []),
      ]),
    );
    return {
      meta: {
        templateId: 'cr-reunion-bureau',
        title: `CR réunion de bureau${formatDateShort(v.date) ? ` du ${formatDateShort(v.date)}` : ''}`,
        fileName: safeFileName(`CR bureau ${str(v.date)}`),
        memberIds: participants.map(m => m.id),
      },
      blocks,
    };
  },
};

// ============================================================
// 6. LISTE DES DIRIGEANTS (déclaration de modification)
// ============================================================

const ELECTION_INSTANCES = [
  { value: 'ag_ordinaire', label: 'l\'assemblée générale ordinaire' },
  { value: 'ag_extraordinaire', label: 'l\'assemblée générale extraordinaire' },
  { value: 'ca', label: 'la réunion du conseil d\'administration' },
  { value: 'bureau', label: 'la réunion du bureau' },
];

/** Bureau actuel, trié dans l'ordre du catalogue (président, vice-président…). */
const currentBureau = (ctx) => sortByRole(ctx, bureauMembers(ctx));

/** Dernière liste des dirigeants émise (registre des documents), ou null. */
export function latestDirigeantsEntry(log) {
  const time = (e) => { const t = new Date(e?.createdAt).getTime(); return Number.isFinite(t) ? t : 0; };
  return (Array.isArray(log) ? log : [])
    .filter(e => e && (e.templateId === 'liste-dirigeants' || e.meta?.templateId === 'liste-dirigeants'))
    .sort((a, b) => time(b) - time(a))[0] || null;
}

function dirigeantsOf(ctx, v) {
  const bureau = currentBureau(ctx);
  const extra = sortByRole(ctx, membersByIds(ctx, v.autres)).filter(m => !bureau.includes(m));
  return { bureau, all: [...bureau, ...extra] };
}

const listeDirigeants = {
  id: 'liste-dirigeants',
  category: 'gouvernance',
  title: 'Liste des dirigeants',
  description: 'Liste des personnes chargées de l\'administration, à joindre à la déclaration de modification (préfecture / greffe des associations).',
  icon: 'Landmark',
  tags: ['préfecture', 'greffe', 'déclaration', 'dirigeants', 'bureau', 'modification', 'Compte Asso'],
  scope: 'organization',
  fields: [
    { key: 'instance', label: 'Instance ayant désigné les dirigeants', type: 'select', options: ELECTION_INSTANCES, default: 'ag_ordinaire' },
    { key: 'dateElection', label: 'Date de cette instance', type: 'date', default: '' },
    { key: 'autres', label: 'Autres personnes à inclure (facultatif)', type: 'members', default: [], help: 'Les membres du bureau (niveau « bureau ») sont inclus automatiquement.' },
    memberField('signataire1', 'Premier signataire', ['president', 'vice_president']),
    memberField('signataire2', 'Second signataire', ['secretaire', 'tresorier', 'vice_president']),
  ],
  legal: {
    note: `${STATUTES_NOTE} Les changements survenus dans l'administration de l'association doivent être déclarés dans les trois mois ; la déclaration se fait en ligne (service-public.fr, « Le Compte Asso ») ou auprès du greffe des associations. En Alsace-Moselle, les associations relèvent d'un régime local distinct (registre du tribunal judiciaire).`,
    references: [
      'Loi du 1er juillet 1901 relative au contrat d\'association, article 5',
      'Décret du 16 août 1901, article 1er',
    ],
  },
  suggest(ctx) {
    const bureau = currentBureau(ctx);
    if (!bureau.length) return [];
    const ids = bureau.map(m => m.id);
    const last = latestDirigeantsEntry(ctx.documentLog);
    const base = { templateId: 'liste-dirigeants', priority: 'high', memberIds: ids };
    if (!last) {
      return [{
        ...base,
        id: 'liste-dirigeants-initiale',
        title: 'Liste des dirigeants à établir : déclaration à faire dans les 3 mois',
        reason: 'Aucune liste des dirigeants n\'a encore été émise. Si la composition du bureau a changé depuis la dernière déclaration, la modification doit être déclarée dans les trois mois (article 5 de la loi du 1er juillet 1901).',
      }];
    }
    const prevRoles = last.composition || last.meta?.composition || null;
    const curRoles = Object.fromEntries(bureau.map(m => [m.id, m.mainRole]));
    const diff = compareComposition(last.memberIds || last.meta?.memberIds || [], ids, prevRoles, curRoles);
    if (!diff.changed) return [];
    const names = (list) => joinFr(list.map(id => fullName(byId(ctx, id))).filter(Boolean));
    const parts = [];
    if (diff.added.length) parts.push(`${names(diff.added) || plural(diff.added.length, 'membre')} ${diff.added.length > 1 ? 'ont rejoint' : 'a rejoint'} le bureau`);
    if (diff.removed.length) {
      const known = names(diff.removed);
      parts.push(known ? `${known} ${diff.removed.length > 1 ? 'ont quitté' : 'a quitté'} le bureau` : `${plural(diff.removed.length, 'ancien membre', 'anciens membres')} ${diff.removed.length > 1 ? 'ont quitté' : 'a quitté'} le bureau`);
    }
    if (diff.roleChanged.length) parts.push(`${names(diff.roleChanged)} ${diff.roleChanged.length > 1 ? 'ont changé' : 'a changé'} de fonction`);
    const since = formatDateLong(last.createdAt);
    return [{
      ...base,
      id: 'liste-dirigeants-modification',
      title: 'Composition du bureau modifiée : déclaration à faire dans les 3 mois',
      reason: `${capitalize(parts.join(' ; '))}${since ? ` depuis la liste émise le ${since}` : ''}. Ces changements doivent être déclarés dans les trois mois (article 5 de la loi du 1er juillet 1901).`,
    }];
  },
  warnings(ctx, v) {
    const out = [];
    const { all } = dirigeantsOf(ctx, v);
    if (!all.length) out.push('Aucun membre n\'occupe un rôle de niveau « bureau » : la liste sera vide.');
    const missing = (key) => all.filter(m => !str(m[key])).length;
    const addr = missing('address'); const nat = missing('nationality');
    if (addr) out.push(`${plural(addr, 'dirigeant', 'dirigeants')} sans adresse renseignée : la case sera laissée en blanc.`);
    if (nat) out.push(`${plural(nat, 'dirigeant', 'dirigeants')} sans nationalité renseignée : la case sera laissée en blanc.`);
    if (v.signataire1 && v.signataire1 === v.signataire2) out.push('Les deux signataires sont la même personne : la liste doit être signée par deux dirigeants différents.');
    if (!str(v.dateElection)) out.push('La date de l\'instance ayant désigné les dirigeants n\'est pas renseignée.');
    return out;
  },
  build(ctx, v) {
    const B = createBlockFactory();
    const org = ctx.organization;
    const { bureau, all } = dirigeantsOf(ctx, v);
    const instance = (ELECTION_INSTANCES.find(i => i.value === v.instance) || ELECTION_INSTANCES[0]).label;
    const dateElection = formatDateLong(v.dateElection);
    const s1 = signatory(ctx, v.signataire1, ['president', 'vice_president']);
    let s2 = signatory(ctx, v.signataire2, ['secretaire', 'tresorier', 'vice_president']);
    if (s2 && s1 && s2.member.id === s1.member.id) s2 = null;
    const addr = [org.address, [org.postalCode, org.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');

    const blocks = [
      B.title('Liste des personnes chargées de l\'administration de l\'association', org.name),
      B.kv([
        ['Association', `${org.name}${org.shortName && org.shortName !== org.name ? ` (${org.shortName})` : ''}`],
        ['Forme', org.legalForm || 'Association loi 1901'],
        ['Numéro RNA', str(org.rna) || BLANK],
        ['Siège social', addr || BLANK],
        ['Déclarée auprès de', str(org.prefecture)],
      ]),
      B.p(`En application de l'article 5 de la loi du 1er juillet 1901 relative au contrat d'association et de l'article 1er du décret du 16 août 1901, l'association ${org.name} déclare ci-après les noms, professions, domiciles et nationalités des personnes chargées de son administration, tels qu'ils résultent de ${instance} du ${dateElection || BLANK_DATE}.`),
      B.table([
        { key: 'fonction', label: 'Fonction', width: 0.17 },
        { key: 'nom', label: 'NOM Prénom', width: 0.2 },
        { key: 'profession', label: 'Profession', width: 0.15 },
        { key: 'nationalite', label: 'Nationalité', width: 0.13 },
        { key: 'adresse', label: 'Adresse (domicile)', width: 0.35 },
      ], all.map(m => ({
        fonction: roleLabelOf(ctx, m),
        nom: officialName(m),
        profession: str(m.profession) || 'Étudiant(e)',
        nationalite: str(m.nationality) || BLANK_CELL,
        adresse: str(m.address) || BLANK_CELL,
      })), { blankRows: all.length ? 0 : 4 }),
      B.callout('Toute modification survenue dans l\'administration de l\'association doit être déclarée dans les trois mois (article 5 de la loi du 1er juillet 1901). La déclaration peut être effectuée en ligne sur service-public.fr (« Le Compte Asso ») ou auprès du greffe des associations dont relève le siège ; la présente liste est à joindre à la déclaration, accompagnée, le cas échéant, d\'un extrait du procès-verbal de l\'instance ayant désigné les dirigeants.', 'legal'),
      B.p('Liste certifiée sincère et exacte par les soussignés.', { editable: false }),
      B.placeDate(cityOf(org), formatDateLong(ctx.today)),
      B.signatures([
        signatureSlot(s1, 'Premier dirigeant signataire'),
        signatureSlot(s2, 'Second dirigeant signataire'),
      ]),
    ];
    return {
      meta: {
        templateId: 'liste-dirigeants',
        title: `Liste des dirigeants — ${formatDateShort(ctx.today)}`,
        fileName: safeFileName(`Liste dirigeants ${isoDate(ctx.today)}`),
        orientation: 'landscape',
        // Comparaison future (suggestion) : uniquement les membres du bureau.
        memberIds: bureau.map(m => m.id),
        // Fonctions au moment de l'émission (détection des changements de poste).
        composition: Object.fromEntries(bureau.map(m => [m.id, m.mainRole])),
      },
      blocks,
    };
  },
};

// ============================================================
// 7. DÉLÉGATION DE POUVOIR / DE SIGNATURE
// ============================================================

const DELEGATION_OBJETS = [
  { value: 'banque', label: 'Opérations bancaires courantes' },
  { value: 'conventions', label: 'Signature des conventions de partenariat' },
  { value: 'depenses', label: 'Engagement de dépenses' },
  { value: 'representation', label: 'Représentation de l\'association' },
  { value: 'autre', label: 'Autre (à préciser)' },
];

function delegationObjet(v) {
  const banque = str(v.banque);
  switch (v.objet) {
    case 'conventions': return 'signer, au nom et pour le compte de l\'association, les conventions de partenariat et de parrainage, ainsi que leurs avenants';
    case 'depenses': return 'engager, au nom et pour le compte de l\'association, les dépenses nécessaires à son fonctionnement, dans le respect du budget adopté';
    case 'representation': return 'représenter l\'association auprès des tiers, notamment de l\'établissement d\'enseignement, des administrations et des partenaires';
    case 'autre': return str(v.precisions) || BLANK;
    case 'banque':
    default:
      return `effectuer les opérations bancaires courantes sur le ou les comptes de l'association${banque ? ` ouverts auprès de ${banque}` : ''} : paiements, virements, remises de chèques et d'espèces, consultation des comptes`;
  }
}

const delegationPouvoir = {
  id: 'delegation-pouvoir',
  category: 'gouvernance',
  title: 'Délégation de pouvoir ou de signature',
  description: 'Délégation écrite (opérations bancaires, conventions, dépenses, représentation) avec plafond, durée et acceptation.',
  icon: 'KeyRound',
  tags: ['délégation', 'signature', 'banque', 'pouvoir', 'trésorier', 'mandat'],
  scope: 'organization',
  fields: [
    memberField('delegant', 'Délégant', ['president', 'vice_president']),
    memberField('delegataire', 'Délégataire', ['tresorier', 'vice_president', 'secretaire'], { required: true }),
    { key: 'objet', label: 'Objet de la délégation', type: 'select', options: DELEGATION_OBJETS, default: 'banque' },
    { key: 'banque', label: 'Établissement bancaire (facultatif)', type: 'text', default: '' },
    { key: 'precisions', label: 'Précisions sur l\'objet', type: 'textarea', default: '', help: 'Obligatoire pour « Autre » ; sinon, complète l\'objet choisi.' },
    { key: 'plafond', label: 'Plafond par opération (facultatif)', type: 'money', default: '' },
    { key: 'dateDebut', label: 'Date de début', type: 'date', default: (ctx) => isoDate(ctx.today) },
    {
      key: 'dateFin', label: 'Date de fin', type: 'date',
      default: (ctx) => { const y = Number(academicYear(ctx.today).slice(5)); return `${y}-08-31`; },
      help: 'Par défaut : fin de l\'année universitaire.',
    },
    { key: 'conditions', label: 'Conditions particulières (facultatif)', type: 'textarea', default: '' },
  ],
  legal: { note: `${STATUTES_NOTE} Un dirigeant ne peut déléguer que les pouvoirs qu'il tient des statuts, et seulement si ceux-ci l'y autorisent ; la banque peut exiger son propre formulaire.` },
  warnings(ctx, v) {
    const out = [];
    if (!v.delegataire) out.push('Le délégataire n\'est pas désigné.');
    if (v.delegant && v.delegant === v.delegataire) out.push('Le délégant et le délégataire sont la même personne.');
    const d = daysBetween(v.dateDebut, v.dateFin);
    if (Number.isFinite(d) && d < 0) out.push('La date de fin est antérieure à la date de début.');
    if (v.objet === 'autre' && !str(v.precisions)) out.push('Précise l\'objet de la délégation.');
    return out;
  },
  build(ctx, v) {
    const B = createBlockFactory();
    const org = ctx.organization;
    const delegant = signatory(ctx, v.delegant);
    const delegataireMember = byId(ctx, v.delegataire);
    const delegataire = delegataireMember && delegataireMember.id !== delegant?.member.id
      ? signatory(ctx, delegataireMember.id) : null;
    const objetLabel = (DELEGATION_OBJETS.find(o => o.value === v.objet) || DELEGATION_OBJETS[0]).label;
    const plafond = Number(v.plafond) > 0 ? formatMoney(v.plafond) : '';
    const debut = formatDateLong(v.dateDebut);
    const fin = formatDateLong(v.dateFin);
    const precisions = v.objet === 'autre' ? [] : paragraphs(v.precisions);

    const blocks = [
      B.title('Délégation de pouvoir', `${objetLabel} — ${org.name}`),
      B.p(`Je soussigné(e) **${delegant?.name || BLANK}**, agissant en qualité de ${delegant ? lcFirst(delegant.role) : BLANK} de l'association ${organizationLegalLine(org)},`),
      B.p(`donne par la présente délégation à **${delegataire?.name || BLANK}**, ${delegataire ? lcFirst(delegataire.role) : BLANK} de l'association, à l'effet ${withDe(delegationObjet(v))}${plafond ? `, dans la limite de ${plafond} par opération` : ''}.`),
      ...precisions.map(t => B.p(t)),
      B.heading('Durée'),
      B.p(`La présente délégation prend effet le ${debut || BLANK_DATE} et prend fin le ${fin || BLANK_DATE}, ou à la date à laquelle le délégant ou le délégataire cesse ses fonctions si celle-ci est antérieure.`),
      B.heading('Conditions'),
      B.list([
        'La délégation est consentie à titre personnel : elle ne peut pas être subdéléguée.',
        'Le délégataire agit dans le respect des statuts, du règlement intérieur et des décisions des instances de l\'association.',
        'Il rend compte au délégant et au bureau des actes accomplis en vertu de la présente délégation.',
        'La délégation peut être révoquée à tout moment par le délégant, par écrit.',
        ...paragraphs(v.conditions),
      ]),
      B.placeDate(cityOf(org), formatDateLong(ctx.today)),
      B.signatures([
        signatureSlot(delegant, 'Le délégant', { mention: 'Lu et approuvé' }),
        signatureSlot(delegataire, 'Le délégataire', { mention: 'Bon pour acceptation' }),
      ]),
    ];
    if (v.objet === 'banque') {
      blocks.push(
        B.small('Spécimen de signature du délégataire (à l\'attention de l\'établissement bancaire) :'),
        B.signatures([{ label: 'Spécimen de signature', name: delegataire?.name || '', role: '' }]),
      );
    }
    return {
      meta: {
        templateId: 'delegation-pouvoir',
        title: `Délégation — ${objetLabel}${delegataire ? ` — ${delegataire.name}` : ''}`,
        fileName: safeFileName(`Delegation ${objetLabel} ${officialName(delegataire?.member)}`),
        memberIds: [delegant?.member.id, delegataire?.member.id].filter(Boolean),
      },
      blocks,
    };
  },
};

// ============================================================
// 8. REGISTRE DES MEMBRES
// ============================================================

const REGISTRE_TRIS = [
  { value: 'nom', label: 'Nom' },
  { value: 'pole', label: 'Pôle' },
  { value: 'adhesion', label: 'Date d\'adhésion' },
];

function sortRegistre(ctx, members, tri) {
  const byName = (a, b) => officialName(a).localeCompare(officialName(b), 'fr');
  if (tri === 'pole') {
    const order = (m) => { const p = poleOf(ctx, m); return p ? (p.order ?? 0) : 1e6; };
    return [...members].sort((a, b) => order(a) - order(b) || roleRank(ctx, a) - roleRank(ctx, b) || byName(a, b));
  }
  if (tri === 'adhesion') {
    const t = (m) => toDate(m.joinedAt)?.getTime() ?? Infinity;
    return [...members].sort((a, b) => (t(a) - t(b)) || byName(a, b));
  }
  return [...members].sort(byName);
}

function cotisationText(m) {
  const paid = formatDateShort(m.feePaidAt);
  if (!paid) return 'Non renseignée';
  const amount = Number(m.feeAmount) > 0 ? ` (${formatMoney(m.feeAmount)})` : '';
  return `Payée le ${paid}${amount}`;
}

const registreMembres = {
  id: 'registre-membres',
  category: 'gouvernance',
  title: 'Registre des membres',
  description: 'Liste officielle des membres à date : fonction, pôle, adhésion et cotisation. Document confidentiel.',
  icon: 'BookUser',
  tags: ['registre', 'membres', 'adhérents', 'cotisation', 'liste'],
  scope: 'organization',
  fields: [
    { key: 'dateArrete', label: 'Registre arrêté au', type: 'date', default: (ctx) => isoDate(ctx.today) },
    { key: 'tri', label: 'Trier par', type: 'select', options: REGISTRE_TRIS, default: 'nom' },
    { key: 'contacts', label: 'Inclure les coordonnées (email, téléphone)', type: 'checkbox', default: false, help: 'Données personnelles : à n\'inclure que si nécessaire.' },
    memberField('certifiePar', 'Certifié par', ['secretaire', 'president']),
  ],
  legal: { note: `${STATUTES_NOTE} Ce registre contient des données personnelles : limite sa diffusion aux personnes habilitées et ne conserve que les informations nécessaires (RGPD).` },
  build(ctx, v) {
    const B = createBlockFactory();
    const org = ctx.organization;
    const members = sortRegistre(ctx, ctx.members, v.tri);
    const contacts = !!v.contacts;
    const sig = signatory(ctx, v.certifiePar, ['secretaire', 'president']);
    const paidCount = members.filter(m => formatDateShort(m.feePaidAt)).length;

    const columns = contacts
      ? [
        { key: 'n', label: 'N°', width: 0.04, align: 'center' },
        { key: 'nom', label: 'NOM Prénom', width: 0.16 },
        { key: 'fonction', label: 'Fonction', width: 0.14 },
        { key: 'pole', label: 'Pôle', width: 0.1 },
        { key: 'adhesion', label: 'Date d\'adhésion', width: 0.09, align: 'center' },
        { key: 'cotisation', label: 'Cotisation', width: 0.15 },
        { key: 'email', label: 'Email', width: 0.2 },
        { key: 'tel', label: 'Téléphone', width: 0.12 },
      ]
      : [
        { key: 'n', label: 'N°', width: 0.05, align: 'center' },
        { key: 'nom', label: 'NOM Prénom', width: 0.24 },
        { key: 'fonction', label: 'Fonction', width: 0.2 },
        { key: 'pole', label: 'Pôle', width: 0.14 },
        { key: 'adhesion', label: 'Date d\'adhésion', width: 0.13, align: 'center' },
        { key: 'cotisation', label: 'Cotisation', width: 0.24 },
      ];
    const rows = members.map((m, i) => ({
      n: String(i + 1),
      nom: officialName(m),
      fonction: roleLabelOf(ctx, m),
      pole: poleOf(ctx, m)?.label || '—',
      adhesion: formatDateShort(m.joinedAt) || '—',
      cotisation: cotisationText(m),
      ...(contacts ? { email: str(m.email) || '—', tel: str(m.phone) || '—' } : {}),
    }));

    const blocks = [
      B.title('Registre des membres', `${org.name} — arrêté au ${formatDateLong(v.dateArrete) || formatDateLong(ctx.today)}`),
      B.kv([
        ['Association', org.name],
        ['Numéro RNA', str(org.rna)],
        ['Effectif', plural(members.length, 'membre')],
        ['Cotisations enregistrées', `${paidCount} sur ${members.length}`],
      ]),
      B.table(columns, rows, { dense: true, blankRows: members.length ? 0 : 5 }),
      B.p(`Registre arrêté à ${countLabel(members.length, 'membre')} et certifié exact.`, { editable: false }),
      B.placeDate(cityOf(org), formatDateLong(v.dateArrete) || formatDateLong(ctx.today)),
      B.signatures([signatureSlot(sig, 'Certifié exact par')]),
      B.callout('Document confidentiel, à usage interne. Ce registre contient des données personnelles : il ne doit être communiqué qu\'aux personnes habilitées et doit être conservé de manière sécurisée. Les membres disposent notamment d\'un droit d\'accès et de rectification des informations les concernant (RGPD).', 'legal'),
    ];
    return {
      meta: {
        templateId: 'registre-membres',
        title: `Registre des membres au ${formatDateShort(v.dateArrete) || formatDateShort(ctx.today)}`,
        fileName: safeFileName(`Registre membres ${str(v.dateArrete) || isoDate(ctx.today)}`),
        orientation: contacts ? 'landscape' : 'portrait',
        confidential: true,
        memberIds: members.map(m => m.id),
      },
      blocks,
    };
  },
};

export default [
  convocationAg,
  feuilleEmargement,
  pouvoirAg,
  pvAg,
  crReunionBureau,
  listeDirigeants,
  delegationPouvoir,
  registreMembres,
];
