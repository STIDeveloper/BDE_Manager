// Modèles de la catégorie « partenariats » — voir le contrat dans ../context.js.
// Convention de partenariat, note de frais, attestations de participation,
// budget prévisionnel.
import { createBlockFactory, safeFileName } from '../model.js';
import {
  formatDateLong, formatMoney, amountInWords, isoDate, fullName, officialName, roleLabelOf,
  signatory, signatureSlot, organizationLegalLine, cityOf, memberWithRole, plural, academicYear,
} from '../context.js';
import {
  str, orBlank, cleanList, checkIban, formatIban, parseAmount, normalizeLines, sumLines,
  lineWarnings, academicYearEnd,
} from './orgPart_helpers.js';

const BLANK = '____________________';

/** Date longue ou ligne à compléter. */
const dateOrBlank = (v) => formatDateLong(v) || '____ / ____ / ________';

// ------------------------------------------------------------
// Convention de partenariat
// ------------------------------------------------------------

const DEFAULT_ASSOC_COMMITMENTS = [
  'mentionner le Partenaire et publier son logo sur ses réseaux sociaux lors de la communication relative au partenariat',
  'faire figurer le logo du Partenaire sur les affiches et supports de communication des événements concernés',
  'relayer auprès de ses membres les offres et informations communiquées par le Partenaire, dans la limite d\'une diffusion raisonnable',
];

const conventionPartenariat = {
  id: 'convention-partenariat',
  category: 'partenariats',
  title: 'Convention de partenariat',
  description: 'Convention entre l\'association et une entreprise ou un organisme partenaire, articles numérotés.',
  icon: 'Handshake',
  tags: ['partenariat', 'sponsor', 'mécénat', 'contrat', 'convention', 'entreprise'],
  scope: 'organization',
  legal: {
    note: 'Modèle indicatif, à adapter à chaque partenariat. Pour un montant significatif, une durée longue ou des contreparties importantes, faites relire la convention par un juriste (service juridique de l\'établissement, avocat, point d\'accès au droit).',
  },
  fields: [
    { key: 'partnerName', label: 'Raison sociale du partenaire', type: 'text', required: true, placeholder: 'Ex. Boulangerie Martin SARL' },
    { key: 'partnerForm', label: 'Forme juridique', type: 'text', placeholder: 'SAS, SARL, association…' },
    { key: 'partnerAddress', label: 'Adresse du siège du partenaire', type: 'textarea' },
    { key: 'partnerSiret', label: 'Numéro SIRET (facultatif)', type: 'text' },
    { key: 'partnerRepName', label: 'Représentant du partenaire', type: 'text', placeholder: 'Prénom Nom' },
    { key: 'partnerRepTitle', label: 'Qualité du représentant', type: 'text', placeholder: 'Gérant(e), directeur(rice) commercial(e)…' },
    { key: 'object', label: 'Objet du partenariat', type: 'textarea', help: 'Laisser vide pour une formulation générique.' },
    { key: 'startDate', label: 'Date de début', type: 'date', default: (ctx) => isoDate(ctx.today) },
    { key: 'endDate', label: 'Date de fin', type: 'date', default: (ctx) => academicYearEnd(ctx.today) },
    { key: 'assocCommitments', label: 'Engagements de l\'association (un par ligne)', type: 'list', default: () => [...DEFAULT_ASSOC_COMMITMENTS] },
    { key: 'partnerAmount', label: 'Contribution financière du partenaire', type: 'money' },
    { key: 'paymentTerms', label: 'Modalités de versement', type: 'text', default: 'par virement bancaire dans un délai de trente jours à compter de la signature de la présente convention' },
    { key: 'partnerInKind', label: 'Apports en nature du partenaire (un par ligne)', type: 'list', placeholder: 'Ex. dotation de 20 bons d\'achat pour le gala' },
    { key: 'partnerOther', label: 'Autres engagements du partenaire (un par ligne)', type: 'list' },
    { key: 'memberBenefits', label: 'Avantages accordés aux membres de l\'association (un par ligne)', type: 'list', placeholder: 'Ex. remise de 10 % sur présentation de la carte d\'adhérent' },
    { key: 'logoUse', label: 'Autorisation réciproque d\'utiliser noms et logos', type: 'checkbox', default: true },
    { key: 'noticeDays', label: 'Délai de mise en demeure avant résiliation (jours)', type: 'number', default: 15, min: 1, max: 90 },
    {
      key: 'signatoryId', label: 'Signataire pour l\'association', type: 'member',
      default: (ctx) => memberWithRole(ctx, ['responsable_partenariats', 'president'])?.id || '',
    },
    { key: 'signDate', label: 'Date de signature', type: 'date', default: (ctx) => isoDate(ctx.today) },
  ],
  build: (ctx, values) => {
    const b = createBlockFactory();
    const org = ctx.organization;
    const sig = signatory(ctx, values.signatoryId, ['responsable_partenariats', 'president', 'vice_president']);
    const partner = str(values.partnerName) || 'le partenaire';
    const amount = parseAmount(values.partnerAmount);
    const hasAmount = Number.isFinite(amount) && amount > 0;
    const inKind = cleanList(values.partnerInKind);
    const other = cleanList(values.partnerOther);
    const assoc = cleanList(values.assocCommitments);
    const benefits = cleanList(values.memberBenefits);
    const notice = Math.max(1, Math.round(Number(values.noticeDays) || 15));

    let n = 0;
    const article = (title) => b.heading(`Article ${++n} – ${title}`, 2);

    const partnerLine = [
      str(values.partnerName) ? `**${partner}**` : BLANK,
      str(values.partnerForm),
      str(values.partnerAddress) ? `dont le siège est situé ${str(values.partnerAddress).replace(/\s*\n\s*/g, ', ')}` : '',
      str(values.partnerSiret) ? `immatriculée sous le numéro SIRET ${str(values.partnerSiret)}` : '',
      `représenté(e) par ${orBlank(values.partnerRepName)}${str(values.partnerRepTitle) ? `, en sa qualité de ${str(values.partnerRepTitle)}` : ''}`,
    ].filter(Boolean).join(', ');

    const blocks = [
      b.title('Convention de partenariat', `entre ${org.name} et ${partner}`),
      b.heading('Entre les soussignés'),
      b.p(`${organizationLegalLine(org).replace(org.name, `**${org.name}**`)}, représentée par ${sig ? `${sig.name}, agissant en qualité de ${sig.role}` : BLANK}, ci-après dénommée « l'Association »,`),
      b.p('d\'une part,', { align: 'right', editable: false }),
      b.p(`et ${partnerLine}, ci-après dénommé(e) « le Partenaire »,`),
      b.p('d\'autre part,', { align: 'right', editable: false }),
      b.p('ci-après ensemble dénommés « les Parties ». Il a été convenu ce qui suit.', { editable: false }),

      article('Objet'),
      b.p(str(values.object) || `La présente convention a pour objet de définir les conditions dans lesquelles le Partenaire soutient les activités de l'Association, ainsi que les engagements réciproques des Parties.`),

      article('Durée'),
      b.p(values.startDate && values.endDate
        ? `La présente convention prend effet le ${formatDateLong(values.startDate)} et prend fin le ${formatDateLong(values.endDate)}. Elle ne se renouvelle pas tacitement : toute reconduction fera l'objet d'un avenant ou d'une nouvelle convention écrite.`
        : 'La présente convention prend effet à la date de sa signature par les deux Parties, pour la durée de l\'année universitaire en cours. Elle ne se renouvelle pas tacitement : toute reconduction fera l\'objet d\'un avenant ou d\'une nouvelle convention écrite.'),

      article('Engagements de l\'Association'),
    ];
    if (assoc.length) {
      blocks.push(b.p('En contrepartie du soutien du Partenaire, l\'Association s\'engage à :', { editable: false }));
      blocks.push(b.list(assoc));
    } else {
      blocks.push(b.p('L\'Association s\'engage à :', { editable: false }));
      blocks.push(b.blankLines(['– ______________________________________________', '– ______________________________________________']));
    }

    blocks.push(article('Engagements du Partenaire'));
    if (hasAmount) {
      blocks.push(b.p(`Le Partenaire s'engage à verser à l'Association une contribution financière d'un montant de **${formatMoney(amount)}** (${amountInWords(amount)}), ${str(values.paymentTerms) || 'selon des modalités convenues entre les Parties'}.`));
    }
    if (inKind.length) {
      blocks.push(b.p(hasAmount ? 'Le Partenaire s\'engage en outre à fournir les apports en nature suivants :' : 'Le Partenaire s\'engage à fournir les apports en nature suivants :', { editable: false }));
      blocks.push(b.list(inKind));
    }
    if (other.length) {
      blocks.push(b.p(hasAmount || inKind.length ? 'Il s\'engage également à :' : 'Le Partenaire s\'engage à :', { editable: false }));
      blocks.push(b.list(other));
    }
    if (!hasAmount && !inKind.length && !other.length) {
      blocks.push(b.p('Le Partenaire s\'engage à :', { editable: false }));
      blocks.push(b.blankLines(['– ______________________________________________', '– ______________________________________________']));
    }

    if (benefits.length) {
      blocks.push(article('Avantages accordés aux membres'));
      blocks.push(b.p('Le Partenaire accorde aux membres de l\'Association, sur justification de leur adhésion, les avantages suivants :', { editable: false }));
      blocks.push(b.list(benefits));
    }

    blocks.push(article('Communication et usage des marques'));
    blocks.push(b.p(values.logoUse
      ? 'Chaque Partie autorise l\'autre, pour la seule durée de la présente convention et pour les seuls besoins du partenariat, à reproduire sa dénomination, ses marques et logos, dans le respect de leur intégrité et des chartes graphiques communiquées. Cette autorisation, consentie à titre gratuit, n\'emporte aucune cession de droits ; toute autre utilisation requiert l\'accord préalable écrit de la Partie concernée. Les Parties cessent toute nouvelle utilisation à l\'échéance de la convention.'
      : 'Aucune des Parties ne peut utiliser la dénomination, les marques ou logos de l\'autre sans son accord préalable et écrit, donné au cas par cas.'));

    blocks.push(article('Données personnelles'));
    blocks.push(b.p('La présente convention n\'emporte aucune communication au Partenaire des données personnelles des membres de l\'Association. Toute communication de telles données supposerait l\'information préalable et, le cas échéant, le consentement des personnes concernées, conformément au règlement (UE) 2016/679 (RGPD).'));

    blocks.push(article('Responsabilité'));
    blocks.push(b.p('Chaque Partie demeure seule responsable des actions qu\'elle mène dans le cadre de la présente convention et de leurs conséquences. La présente convention ne crée entre les Parties aucune société, aucune entité commune ni aucun lien de subordination. Aucune Partie ne peut engager l\'autre à l\'égard des tiers.'));

    blocks.push(article('Résiliation'));
    blocks.push(b.p(`En cas de manquement de l'une des Parties à ses obligations, l'autre Partie pourra résilier la présente convention par lettre recommandée avec accusé de réception, ${notice} jours après une mise en demeure restée sans effet. Les Parties peuvent également y mettre fin à tout moment d'un commun accord constaté par écrit. Les sommes versées au titre d'engagements déjà exécutés par l'Association lui restent acquises.`));

    blocks.push(article('Litiges'));
    blocks.push(b.p('La présente convention est soumise au droit français. En cas de différend relatif à son interprétation ou à son exécution, les Parties s\'efforceront de le résoudre à l\'amiable. À défaut d\'accord amiable dans un délai de trente jours, le litige sera porté devant les juridictions compétentes.'));

    blocks.push(b.spacer('sm'));
    blocks.push(b.placeDate(cityOf(org), dateOrBlank(values.signDate)));
    blocks.push(b.small('Fait en deux exemplaires originaux, dont un pour chaque Partie.', { editable: false }));
    blocks.push(b.signatures([
      signatureSlot(sig, `Pour l'Association — ${org.shortName || org.name}`, { mention: 'Lu et approuvé' }),
      { label: str(values.partnerName) ? `Pour le Partenaire — ${partner}` : 'Pour le Partenaire', name: str(values.partnerRepName), role: str(values.partnerRepTitle), mention: 'Lu et approuvé' },
    ]));

    return {
      meta: {
        templateId: 'convention-partenariat',
        title: `Convention de partenariat — ${partner}`,
        fileName: safeFileName(`Convention_partenariat_${str(values.partnerName) || 'partenaire'}`),
        memberIds: sig ? [sig.member.id] : [],
      },
      blocks,
    };
  },
};

// ------------------------------------------------------------
// Note de frais
// ------------------------------------------------------------

const RECEIPTS_CHECKLIST = [
  'Justificatifs originaux joints (factures, tickets de caisse), un par ligne de dépense',
  'Dépense engagée pour le compte de l\'association et préalablement autorisée',
  'RIB joint (premier remboursement ou changement de compte)',
];

const noteDeFrais = {
  id: 'note-de-frais',
  category: 'partenariats',
  title: 'Note de frais',
  description: 'Demande de remboursement des dépenses engagées pour l\'association, ou abandon de frais.',
  icon: 'Receipt',
  tags: ['frais', 'remboursement', 'dépenses', 'trésorerie', 'abandon de frais', 'IBAN'],
  scope: 'member',
  legal: {
    note: 'L\'abandon de frais ne peut ouvrir droit à une réduction d\'impôt que si l\'association est éligible au régime des dons (organisme d\'intérêt général) : cette éligibilité doit être vérifiée au préalable, elle n\'est pas présumée par ce document.',
  },
  fields: [
    { key: 'purpose', label: 'Objet des dépenses', type: 'text', placeholder: 'Ex. achats pour la soirée d\'intégration' },
    {
      key: 'lines', label: 'Dépenses', type: 'lines',
      help: 'Une ligne par justificatif. Indiquez la date en tête du libellé, ex. « 12/03/2027 – Fournitures ». Montants en euros TTC.',
    },
    { key: 'receiptsCount', label: 'Nombre de justificatifs joints', type: 'number', min: 0 },
    { key: 'waiver', label: 'Je renonce au remboursement de ces frais (abandon de frais)', type: 'checkbox', default: false },
    { key: 'iban', label: 'IBAN du demandeur', type: 'text', placeholder: 'FR76 …', help: 'Nécessaire au remboursement par virement. Le document est marqué confidentiel.' },
    { key: 'bic', label: 'BIC (facultatif)', type: 'text' },
    { key: 'accountHolder', label: 'Titulaire du compte', type: 'text', default: (_ctx, member) => fullName(member) },
    { key: 'date', label: 'Date de la demande', type: 'date', default: (ctx) => isoDate(ctx.today) },
    { key: 'treasurerId', label: 'Trésorier(ère)', type: 'member', default: (ctx) => memberWithRole(ctx, ['tresorier'])?.id || '' },
  ],
  /** Avertissements non bloquants affichés dans le formulaire. */
  warnings: (_ctx, values) => {
    const out = [];
    const lines = normalizeLines(values?.lines);
    if (!lines.length) out.push('Aucune dépense saisie : le tableau sera imprimé vide, à compléter à la main.');
    out.push(...lineWarnings(values?.lines, 'ligne'));
    if (str(values?.iban)) {
      const check = checkIban(values.iban);
      if (!check.valid) out.push(check.error);
      if (values?.waiver) out.push('Abandon de frais coché : l\'IBAN est inutile et ne sera pas imprimé.');
    }
    return out;
  },
  build: (ctx, values, member) => {
    const b = createBlockFactory();
    const org = ctx.organization;
    const name = fullName(member) || BLANK;
    const lines = normalizeLines(values.lines);
    const total = sumLines(values.lines);
    const treasurer = signatory(ctx, values.treasurerId, ['tresorier']);
    const date = values.date || isoDate(ctx.today);

    const blocks = [
      b.title(values.waiver ? 'Note de frais — abandon de frais' : 'Note de frais', `Demande de remboursement · ${org.name}`),
      b.kv([
        ['Demandeur', name],
        ['Fonction', roleLabelOf(ctx, member)],
        ['Email', str(member?.email)],
        ['Objet', str(values.purpose)],
        ['Date de la demande', formatDateLong(date)],
      ]),
      b.heading('Détail des dépenses'),
    ];
    const columns = [
      { key: 'n', label: 'N°', width: 0.07, align: 'center' },
      { key: 'date', label: 'Date', width: 0.16 },
      { key: 'label', label: 'Libellé', width: 0.55 },
      { key: 'amount', label: 'Montant TTC', width: 0.22, align: 'right' },
    ];
    if (lines.length) {
      const rows = lines.map((l, i) => ({ n: String(i + 1), date: l.date || '—', label: l.label || '—', amount: formatMoney(l.value) }));
      rows.push({ n: '', date: '', label: '**Total**', amount: `**${formatMoney(total)}**` });
      blocks.push(b.table(columns, rows));
      blocks.push(b.p(`Montant total : **${formatMoney(total)}** (${amountInWords(total)}).`, { editable: false }));
    } else {
      blocks.push(b.table(columns, [], { blankRows: 6 }));
      blocks.push(b.blankLines(['Montant total (en euros) : ______________', 'Soit en lettres : ________________________________________________']));
    }

    blocks.push(b.heading('Justificatifs'));
    const receipts = Number(values.receiptsCount);
    if (Number.isFinite(receipts) && str(values.receiptsCount) !== '' && receipts >= 0) {
      blocks.push(b.small(`Nombre de justificatifs joints : ${Math.round(receipts)}.`));
    }
    blocks.push(b.checklist(RECEIPTS_CHECKLIST.filter(item => !(values.waiver && item.startsWith('RIB')))));

    if (values.waiver) {
      blocks.push(b.heading('Abandon de frais'));
      blocks.push(b.p(`Je soussigné(e) ${name} déclare renoncer expressément au remboursement des frais détaillés ci-dessus, engagés bénévolement pour le compte de ${org.name}, et en faire don à l'association.`));
      blocks.push(b.callout('L\'abandon de frais ne peut ouvrir droit à une réduction d\'impôt que si l\'association est éligible au régime des dons (organisme d\'intérêt général) et délivre un reçu conforme. Ce document ne présume pas cette éligibilité : vérifiez-la avant toute délivrance de reçu fiscal.', 'legal'));
    } else {
      blocks.push(b.heading('Coordonnées bancaires pour le remboursement'));
      if (str(values.iban)) {
        blocks.push(b.kv([
          ['Titulaire du compte', str(values.accountHolder) || fullName(member)],
          ['IBAN', formatIban(values.iban)],
          ['BIC', str(values.bic).toUpperCase()],
        ]));
      } else {
        blocks.push(b.blankLines([
          `Titulaire du compte : ${str(values.accountHolder) || '______________________________'}`,
          'IBAN : ____ ____ ____ ____ ____ ____ ___',
          'BIC : ___________',
        ]));
        blocks.push(b.small('Les coordonnées bancaires sont nécessaires au remboursement par virement ; à défaut, joindre un RIB.', { tone: 'muted' }));
      }
    }

    blocks.push(b.placeDate(cityOf(org), formatDateLong(date)));
    blocks.push(b.signatures([
      { label: 'Le demandeur', name: fullName(member), role: roleLabelOf(ctx, member), mention: 'Certifié sincère et véritable' },
      signatureSlot(treasurer, 'Validation du trésorier', { mention: values.waiver ? 'Abandon de frais constaté' : 'Bon pour remboursement' }),
    ]));
    if (!values.waiver) {
      blocks.push(b.blankLines(['Date du remboursement : ________________', 'Mode de remboursement (virement, chèque n°) : ________________']));
    }

    return {
      meta: {
        templateId: 'note-de-frais',
        title: `Note de frais — ${fullName(member) || 'demandeur'}`,
        fileName: safeFileName(`Note_de_frais_${officialName(member) || 'demandeur'}_${date}`),
        confidential: true,
        memberIds: member ? [member.id] : [],
      },
      blocks,
    };
  },
};

// ------------------------------------------------------------
// Attestations de participation à un événement (lot)
// ------------------------------------------------------------

/** Participants : membres sélectionnés puis liste libre, sans doublon. */
export function eventParticipants(ctx, values) {
  const seen = new Set();
  const out = [];
  const add = (name, memberId = null) => {
    const clean = str(name).replace(/\s+/g, ' ');
    const key = clean.toLocaleLowerCase('fr');
    if (!clean || seen.has(key)) return;
    seen.add(key);
    out.push({ name: clean, memberId });
  };
  (Array.isArray(values.memberIds) ? values.memberIds : [])
    .map(id => ctx.members.find(m => m.id === id))
    .filter(Boolean)
    .forEach(m => add(fullName(m), m.id));
  cleanList(values.participants).forEach(n => add(n));
  return out;
}

const attestationEvenement = {
  id: 'attestation-evenement',
  legal: { note: 'Attestation de participation à valeur informative : elle ne vaut ni diplôme ni certification de compétences.' },
  category: 'partenariats',
  title: 'Attestations de participation',
  description: 'Une attestation par participant à un atelier, hackathon ou événement, générées en lot.',
  icon: 'Award',
  tags: ['attestation', 'participation', 'événement', 'atelier', 'hackathon', 'lot'],
  scope: 'organization',
  fields: [
    { key: 'eventName', label: 'Nom de l\'événement', type: 'text', required: true, placeholder: 'Ex. Hackathon de rentrée' },
    { key: 'eventDate', label: 'Date de l\'événement', type: 'date', default: (ctx) => isoDate(ctx.today) },
    { key: 'eventEndDate', label: 'Date de fin (si plusieurs jours)', type: 'date' },
    { key: 'place', label: 'Lieu', type: 'text' },
    { key: 'duration', label: 'Durée', type: 'text', placeholder: 'Ex. 3 heures, 2 jours' },
    { key: 'organizer', label: 'Organisateur', type: 'text', default: (ctx) => ctx.organization.name },
    { key: 'description', label: 'Description (facultatif)', type: 'textarea' },
    { key: 'participants', label: 'Participants (un nom par ligne)', type: 'list' },
    { key: 'memberIds', label: 'Membres participants', type: 'members' },
    { key: 'signatoryId', label: 'Signataire', type: 'member', default: (ctx) => memberWithRole(ctx, ['president', 'vice_president'])?.id || '' },
    { key: 'signDate', label: 'Date de délivrance', type: 'date', default: (ctx) => isoDate(ctx.today) },
  ],
  build: (ctx, values) => {
    const b = createBlockFactory();
    const org = ctx.organization;
    const sig = signatory(ctx, values.signatoryId);
    const event = str(values.eventName) || 'événement';
    const organizer = str(values.organizer) || org.name;
    const multiDay = values.eventEndDate && values.eventEndDate !== values.eventDate && formatDateLong(values.eventEndDate);
    const when = multiDay
      ? `du ${formatDateLong(values.eventDate)} au ${formatDateLong(values.eventEndDate)}`
      : (formatDateLong(values.eventDate) ? `le ${formatDateLong(values.eventDate)}` : '');
    const people = eventParticipants(ctx, values);
    // Aucun participant : une attestation vierge à compléter à la main.
    const pages = people.length ? people : [{ name: '', memberId: null }];

    const blocks = [];
    pages.forEach((p, i) => {
      if (i > 0) blocks.push(b.pageBreak());
      const who = p.name ? `**${p.name}**` : '______________________________';
      blocks.push(b.title('Attestation de participation', org.name));
      blocks.push(b.p(`Je soussigné(e), ${sig ? `${sig.name}, ${sig.role}` : '______________________________'} de ${organizationLegalLine(org)}, atteste que ${who} a participé à l'événement « ${event} » organisé par ${organizer}${when ? ` ${when}` : ''}${str(values.place) ? ` (${str(values.place)})` : ''}.`));
      if (str(values.description)) blocks.push(b.p(str(values.description)));
      blocks.push(b.kv([
        ['Événement', event],
        ['Date', multiDay ? `Du ${formatDateLong(values.eventDate)} au ${formatDateLong(values.eventEndDate)}` : formatDateLong(values.eventDate)],
        ['Lieu', str(values.place)],
        ['Durée', str(values.duration)],
        ['Organisateur', organizer],
      ]));
      blocks.push(b.p('La présente attestation est délivrée à l\'intéressé(e) pour servir et valoir ce que de droit.', { editable: false }));
      blocks.push(b.placeDate(cityOf(org), dateOrBlank(values.signDate)));
      blocks.push(b.signatures([signatureSlot(sig, `Pour ${org.shortName || org.name}`)]));
    });

    return {
      meta: {
        templateId: 'attestation-evenement',
        title: `Attestations de participation — ${event} (${plural(people.length, 'participant')})`,
        fileName: safeFileName(`Attestations_participation_${event}`),
        memberIds: people.map(p => p.memberId).filter(Boolean),
      },
      blocks,
    };
  },
};

// ------------------------------------------------------------
// Budget prévisionnel
// ------------------------------------------------------------

/** Synthèse chiffrée d'un budget (exportée pour les tests). */
export function budgetSummary(values) {
  const charges = sumLines(values?.charges);
  const produits = sumLines(values?.produits);
  const balance = Math.round((produits - charges) * 100) / 100;
  return { charges, produits, balance, status: balance > 0 ? 'excedent' : balance < 0 ? 'deficit' : 'equilibre' };
}

function budgetTable(b, lines, total, caption) {
  const columns = [
    { key: 'label', label: 'Poste', width: 0.6 },
    { key: 'amount', label: 'Montant', width: 0.24, align: 'right' },
    { key: 'share', label: 'Part', width: 0.16, align: 'right' },
  ];
  if (!lines.length) return b.table(columns, [], { blankRows: 5, caption });
  const rows = lines.map(l => ({
    label: l.label || '—',
    amount: formatMoney(l.value),
    share: total > 0 ? `${Math.round((l.value / total) * 100)} %` : '—',
  }));
  rows.push({ label: '**Total**', amount: `**${formatMoney(total)}**`, share: total > 0 ? '100 %' : '—' });
  return b.table(columns, rows, { caption });
}

const budgetPrevisionnel = {
  id: 'budget-previsionnel',
  legal: { note: "Budget prévisionnel indicatif : les montants engagent l'association seulement après validation par les instances prévues par les statuts." },
  category: 'partenariats',
  title: 'Budget prévisionnel',
  description: 'Charges, produits et résultat prévisionnel d\'un événement ou d\'un projet.',
  icon: 'Calculator',
  tags: ['budget', 'prévisionnel', 'trésorerie', 'événement', 'projet', 'subvention'],
  scope: 'organization',
  fields: [
    { key: 'projectName', label: 'Événement ou projet', type: 'text', required: true },
    { key: 'startDate', label: 'Date (ou début)', type: 'date' },
    { key: 'endDate', label: 'Fin (si période)', type: 'date' },
    { key: 'charges', label: 'Charges (dépenses prévues)', type: 'lines', help: 'Ex. Location de salle — 450' },
    { key: 'produits', label: 'Produits (recettes prévues)', type: 'lines', help: 'Ex. Billetterie (120 × 10 €) — 1200' },
    { key: 'notes', label: 'Hypothèses et commentaires', type: 'textarea' },
    { key: 'treasurerId', label: 'Trésorier(ère)', type: 'member', default: (ctx) => memberWithRole(ctx, ['tresorier'])?.id || '' },
    { key: 'date', label: 'Date d\'établissement', type: 'date', default: (ctx) => isoDate(ctx.today) },
  ],
  warnings: (_ctx, values) => {
    const out = [...lineWarnings(values?.charges, 'charge'), ...lineWarnings(values?.produits, 'produit')];
    const s = budgetSummary(values);
    if (s.status === 'deficit') out.push(`Budget déficitaire de ${formatMoney(-s.balance)}.`);
    return out;
  },
  build: (ctx, values) => {
    const b = createBlockFactory();
    const org = ctx.organization;
    const project = str(values.projectName) || 'Projet';
    const charges = normalizeLines(values.charges);
    const produits = normalizeLines(values.produits);
    const s = budgetSummary(values);
    const treasurer = signatory(ctx, values.treasurerId, ['tresorier']);
    const date = values.date || isoDate(ctx.today);
    const period = values.endDate && values.endDate !== values.startDate && formatDateLong(values.endDate)
      ? `Du ${formatDateLong(values.startDate)} au ${formatDateLong(values.endDate)}`
      : formatDateLong(values.startDate);

    const resultLabel = { excedent: 'Excédent prévisionnel', deficit: 'Déficit prévisionnel', equilibre: 'Résultat prévisionnel' }[s.status];
    const blocks = [
      b.title('Budget prévisionnel', `${project} · ${org.name}`),
      b.kv([
        ['Événement / projet', project],
        ['Date ou période', period],
        ['Établi le', formatDateLong(date)],
      ]),
      b.heading('Charges'),
      budgetTable(b, charges, s.charges),
      b.heading('Produits'),
      budgetTable(b, produits, s.produits),
      b.heading('Synthèse'),
      b.kv([
        ['Total des charges', formatMoney(s.charges)],
        ['Total des produits', formatMoney(s.produits)],
        [resultLabel, s.status === 'equilibre' ? `${formatMoney(0)} (équilibre)` : formatMoney(Math.abs(s.balance))],
      ]),
    ];
    if (!charges.length && !produits.length) {
      blocks.push(b.callout('Aucune ligne saisie : le budget est à compléter à la main.', 'info'));
    } else if (s.status === 'equilibre') {
      blocks.push(b.callout('Le budget est équilibré : les produits couvrent exactement les charges.', 'info'));
    } else if (s.status === 'deficit') {
      blocks.push(b.callout(`Le budget présente un déficit prévisionnel de **${formatMoney(-s.balance)}** (${amountInWords(-s.balance)}). Avant validation, prévoir des produits complémentaires (partenariat, subvention, billetterie) ou réduire les charges, ou faire approuver la prise en charge du déficit sur les fonds propres de l'association.`, 'warning'));
    } else {
      blocks.push(b.callout(`Le budget dégage un excédent prévisionnel de **${formatMoney(s.balance)}** (${amountInWords(s.balance)}).`, 'info'));
    }
    if (str(values.notes)) {
      blocks.push(b.heading('Hypothèses et commentaires'));
      blocks.push(b.p(str(values.notes)));
    }
    blocks.push(b.placeDate(cityOf(org), formatDateLong(date)));
    blocks.push(b.signatures([signatureSlot(treasurer, 'Le trésorier', { mention: 'Budget établi et certifié' })]));
    blocks.push(b.blankLines(['Budget approuvé par le bureau le : ________________']));

    return {
      meta: {
        templateId: 'budget-previsionnel',
        title: `Budget prévisionnel — ${project}`,
        fileName: safeFileName(`Budget_previsionnel_${project}`),
        memberIds: treasurer ? [treasurer.member.id] : [],
      },
      blocks,
    };
  },
};

// ------------------------------------------------------------
// Rapport financier (assemblée générale)
// ------------------------------------------------------------
// Les chiffres sont passés par `values` : le module Trésorerie les agrège
// (src/modules/finance/Report.jsx → issueDocuments) ; depuis le Studio, le
// formulaire se remplit à la main (lignes vides → tableaux à compléter).

/** Synthèse chiffrée d'un rapport financier (exportée pour réutilisation). */
export function financialSummary(values) {
  const recettes = sumLines(values?.recettes);
  const depenses = sumLines(values?.depenses);
  const openingRaw = parseAmount(values?.soldeOuverture);
  const opening = Number.isFinite(openingRaw) ? Math.round(openingRaw * 100) / 100 : null;
  const result = Math.round((recettes - depenses) * 100) / 100;
  const closing = opening === null ? null : Math.round((opening + result) * 100) / 100;
  return { recettes, depenses, result, opening, closing };
}

const rapportFinancier = {
  id: 'rapport-financier',
  category: 'partenariats',
  title: 'Rapport financier',
  description: 'Compte de résultat de l\'exercice (recettes et dépenses par catégorie, soldes) à présenter en assemblée générale.',
  icon: 'PiggyBank',
  tags: ['rapport', 'financier', 'trésorerie', 'AG', 'assemblée générale', 'comptes', 'bilan', 'exercice'],
  scope: 'organization',
  legal: {
    note: 'Présentation simplifiée en recettes / dépenses (comptabilité de trésorerie), suffisante pour la plupart des associations étudiantes. Les associations recevant plus de 153 000 € de subventions publiques ou de dons ont des obligations comptables renforcées (comptes annuels, commissaire aux comptes).',
  },
  fields: [
    { key: 'exercice', label: 'Exercice', type: 'text', placeholder: '2026-2027', default: (ctx) => academicYear(ctx.today) },
    { key: 'startDate', label: 'Début de l\'exercice', type: 'date' },
    { key: 'endDate', label: 'Fin de l\'exercice', type: 'date' },
    { key: 'compte', label: 'Compte bancaire', type: 'text', placeholder: 'Compte courant' },
    { key: 'soldeOuverture', label: 'Solde en début d\'exercice (€)', type: 'money' },
    { key: 'recettes', label: 'Recettes par catégorie', type: 'lines', help: 'Ex. Cotisations — 1200' },
    { key: 'depenses', label: 'Dépenses par catégorie', type: 'lines', help: 'Ex. Alimentation — 640' },
    { key: 'faits', label: 'Faits marquants', type: 'list', help: 'Un fait par ligne (événement bénéficiaire, subvention obtenue…).' },
    { key: 'enAttente', label: 'Opérations non encore validées', type: 'text', help: 'Facultatif. Ex. « 3 dépenses (120 €) en attente de justificatif ».' },
    { key: 'commentaire', label: 'Commentaire du trésorier', type: 'textarea' },
    { key: 'treasurerId', label: 'Trésorier(ère)', type: 'member', default: (ctx) => memberWithRole(ctx, ['tresorier'])?.id || '' },
    { key: 'date', label: 'Date d\'établissement', type: 'date', default: (ctx) => isoDate(ctx.today) },
  ],
  warnings: (_ctx, values) => {
    const out = [...lineWarnings(values?.recettes, 'recette'), ...lineWarnings(values?.depenses, 'dépense')];
    const s = financialSummary(values);
    if (s.result < 0) out.push(`Exercice déficitaire de ${formatMoney(-s.result)}.`);
    if (s.closing !== null && s.closing < 0) out.push('Le solde de clôture calculé est négatif : vérifie le solde d\'ouverture et les montants.');
    return out;
  },
  build: (ctx, values) => {
    const b = createBlockFactory();
    const org = ctx.organization;
    const exercice = str(values.exercice) || academicYear(ctx.today);
    const s = financialSummary(values);
    const recettes = normalizeLines(values.recettes);
    const depenses = normalizeLines(values.depenses);
    const treasurer = signatory(ctx, values.treasurerId, ['tresorier']);
    const president = signatory(ctx, null, ['president']);
    const date = values.date || isoDate(ctx.today);
    const period = formatDateLong(values.startDate) && formatDateLong(values.endDate)
      ? `Du ${formatDateLong(values.startDate)} au ${formatDateLong(values.endDate)}` : '';
    const blank = '__________ €';

    const blocks = [
      b.title('Rapport financier', `Exercice ${exercice} · ${org.name}`),
      b.kv([
        ['Association', org.name],
        ['Exercice', exercice],
        ['Période', period],
        ['Compte', str(values.compte)],
        ['Établi le', formatDateLong(date)],
      ]),
      b.p(`Le présent rapport présente les recettes et les dépenses de l'association au cours de l'exercice ${exercice}, établies à partir des opérations enregistrées et validées par la trésorerie. Il est soumis à l'approbation de l'assemblée générale.`),
      b.heading('Synthèse'),
      b.kv([
        ['Solde en début d\'exercice', s.opening === null ? blank : formatMoney(s.opening)],
        ['Total des recettes', formatMoney(s.recettes)],
        ['Total des dépenses', formatMoney(s.depenses)],
        [s.result >= 0 ? 'Excédent de l\'exercice' : 'Déficit de l\'exercice', formatMoney(Math.abs(s.result))],
        ['Solde en fin d\'exercice', s.closing === null ? blank : formatMoney(s.closing)],
      ]),
      b.heading('Recettes'),
      budgetTable(b, recettes, s.recettes),
      b.heading('Dépenses'),
      budgetTable(b, depenses, s.depenses),
    ];
    if (!recettes.length && !depenses.length) {
      blocks.push(b.callout('Aucune ligne saisie : les tableaux sont à compléter à la main, ou génère ce rapport depuis le module Trésorerie.', 'info'));
    } else if (s.result < 0) {
      blocks.push(b.callout(`L'exercice se solde par un déficit de **${formatMoney(-s.result)}** (${amountInWords(-s.result)}), couvert par les réserves de l'association.`, 'warning'));
    } else {
      blocks.push(b.callout(`L'exercice dégage un excédent de **${formatMoney(s.result)}** (${amountInWords(s.result)}), dont l'affectation est proposée à l'assemblée générale.`, 'info'));
    }
    const faits = cleanList(values.faits);
    if (faits.length) { blocks.push(b.heading('Faits marquants')); blocks.push(b.list(faits)); }
    if (str(values.enAttente)) blocks.push(b.small(`Opérations non intégrées (en attente de validation) : ${str(values.enAttente)}`));
    if (str(values.commentaire)) { blocks.push(b.heading('Commentaire du trésorier')); blocks.push(b.p(str(values.commentaire))); }
    blocks.push(b.placeDate(cityOf(org), formatDateLong(date)));
    blocks.push(b.signatures([
      signatureSlot(treasurer, 'Le trésorier', { mention: 'Rapport établi et certifié sincère' }),
      signatureSlot(president, 'Le président'),
    ]));
    blocks.push(b.blankLines(['Comptes approuvés par l\'assemblée générale du : ________________', 'Affectation du résultat décidée : ________________']));

    return {
      meta: {
        templateId: 'rapport-financier',
        title: `Rapport financier — exercice ${exercice}`,
        fileName: safeFileName(`Rapport_financier_${exercice}`),
        memberIds: treasurer ? [treasurer.member.id] : [],
      },
      blocks,
    };
  },
};

export default [conventionPartenariat, noteDeFrais, attestationEvenement, budgetPrevisionnel, rapportFinancier];
