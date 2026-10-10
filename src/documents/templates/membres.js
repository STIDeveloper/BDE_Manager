// ============================================================
// STUDIO DOCUMENTS — MODÈLES DE LA CATÉGORIE « MEMBRES »
// ============================================================
// Attestations, lettres de mission, recommandations, passations, charte et
// reçus de cotisation. Voir le contrat des modèles dans ../context.js et le
// format des documents dans ../model.js.
//
// Principes de rédaction :
//  - français professionnel, vouvoiement, formes inclusives neutres
//    (« né(e) », « l'intéressé(e) », « le ou la trésorier(ère) ») ;
//  - AUCUN fait inventé : une donnée absente (date, rôle, montant…) est
//    soit omise, soit remplacée par une tournure neutre ou une ligne à
//    compléter à la main (« ________ ») ;
//  - références juridiques citées uniquement lorsqu'elles sont certaines.
// ============================================================

import { createBlockFactory, safeFileName } from '../model.js';
import {
  formatDateLong, academicYear, fullName, roleLabelOf, roleOf, signatory, signatureSlot,
  cityOf, driveAccessOf, bureauMembers, joinFr, plural, formatMoney, amountInWords,
  isoDate, daysBetween, toDate, levelKind,
} from '../context.js';
import { levelRank } from '../../core/catalog.js';
import {
  ROLE_MISSIONS, genericMissions, poleNoun, KIND_SKILLS, ROLE_SKILLS, KIND_QUALITIES,
  KIND_RESPONSIBILITIES, handoverItems, handoverSteps, CHARTER_VALUES, CHARTER_COMMITMENTS,
  CHARTER_ASSOCIATION_COMMITMENTS, PAYMENT_METHODS,
} from './membresTexts.js';

// ------------------------------------------------------------
// Utilitaires de texte
// ------------------------------------------------------------

const BLANK = '____________________';
const lowerFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : '');
const upperFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const str = (v) => (v === undefined || v === null ? '' : String(v).trim());
/** Termine une phrase par un point (sauf ponctuation finale déjà présente). */
const sentence = (s) => { const t = str(s); return !t || /[.!?…]$/.test(t) ? t : `${t}.`; };
/** Liste nettoyée (champ 'list'). */
const cleanList = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
/** Nombre positif ou null (champs 'number' / 'money', saisis en texte ou en nombre). */
function positiveNumber(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}
const frNumber = (n) => String(Math.round(n * 100) / 100).replace('.', ',');
/**
 * Préposition « de » avec élision devant une voyelle : « d'Ilona Kaci »,
 * « d'**Adjoint(e)** », « de Camille ». (Pas d'élision devant « h » ni « y ».)
 */
function de(text, bold = false) {
  const t = str(text);
  const shown = bold ? `**${t}**` : t;
  return /^[aeiouàâäéèêëîïôöùûüœæ]/i.test(t) ? `d'${shown}` : `de ${shown}`;
}
const nameOf = (member) => fullName(member) || BLANK;
const firstNameOf = (member) => str(member?.firstName) || fullName(member) || 'l\'intéressé(e)';

// ------------------------------------------------------------
// Association
// ------------------------------------------------------------

/** « l'association BDE IUT de Montreuil » (évite « l'association Association … »). */
function orgRef(org) {
  const name = str(org.name) || 'Bureau des Étudiants';
  const short = str(org.shortName);
  const sigle = short && !name.toLowerCase().includes(short.toLowerCase()) ? ` (${short})` : '';
  return /^association\b/i.test(name) ? `l'${lowerFirst(name)}${sigle}` : `l'association ${name}${sigle}`;
}

/** Désignation complète : nom, forme juridique, siège, RNA (si renseignés). */
function orgFull(org) {
  const form = str(org.legalForm);
  let s = orgRef(org);
  if (/1901/.test(form)) s += ', régie par la loi du 1er juillet 1901';
  else if (form) s += `, ${lowerFirst(form)}`;
  const addr = [str(org.address), [str(org.postalCode), str(org.city)].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  if (addr) s += `, dont le siège est situé ${addr}`;
  if (str(org.rna)) s += `, enregistrée sous le numéro RNA ${str(org.rna)}`;
  return s;
}

/** Sujet en début de phrase : « L'association X, régie par …, » (virgule seulement si apposition). */
function orgSubject(org) {
  const full = upperFirst(orgFull(org));
  return full === upperFirst(orgRef(org)) ? full : `${full},`;
}

const placeDate = (b, ctx, values) =>
  b.placeDate(cityOf(ctx.organization), formatDateLong(values.dateDocument) || formatDateLong(ctx.today));

// ------------------------------------------------------------
// Rôle du membre
// ------------------------------------------------------------

/**
 * Description du rôle exercé : rôle choisi dans le formulaire, sinon rôle du
 * membre (catalogue), sinon ancien libellé libre. « Membre » seul n'est pas
 * considéré comme une fonction.
 */
function roleInfo(ctx, member, roleId) {
  const role = (roleId && ctx.catalog.roles[roleId]) || roleOf(ctx, member);
  let label = role ? role.label : str(roleLabelOf(ctx, member, ''));
  if (!role && /^membres?$/i.test(label)) label = '';
  const pole = role ? ctx.catalog.poles[role.pole] || null : null;
  return {
    role,
    roleId: role?.id || '',
    label,
    pole,
    isBureauPole: pole?.id === 'bureau',
    kind: role ? levelKind(ctx.catalog, role.level) : 'membre',
    levelLabel: role ? ctx.catalog.levels[role.level]?.label || '' : '',
  };
}

/** « au sein du bureau » / « au sein du pôle Communication » / ''. */
function poleClause(info) {
  if (!info.pole) return '';
  return info.isBureauPole ? ' au sein du bureau' : ` au sein du ${poleNoun(info.pole.label)}`;
}

function missionsOf(info) {
  const dict = info.role && ROLE_MISSIONS[info.role.id];
  return dict ? [...dict] : genericMissions(info.kind, info.pole?.label || '', info.label, info.isBureauPole);
}

function skillsOf(info) {
  const specific = info.role && ROLE_SKILLS[info.role.id];
  return [...new Set([specific, ...(KIND_SKILLS[info.kind] || KIND_SKILLS.membre)].filter(Boolean))].slice(0, 5);
}

/**
 * Période d'exercice à partir des dates saisies (jamais inventée).
 * @returns {{ text: string, ongoing: boolean, short: string }}
 */
function periodOf(ctx, start, end, annee) {
  const s = formatDateLong(start);
  const e = formatDateLong(end);
  const endNotPast = e ? daysBetween(ctx.today, end) >= 0 : true;
  if (s && e) return { text: `du ${s} au ${e}`, ongoing: endNotPast, short: `Du ${s} au ${e}` };
  if (s) {
    const started = daysBetween(start, ctx.today) >= 0;
    return { text: started ? `depuis le ${s}` : `à compter du ${s}`, ongoing: true, short: `À compter du ${s}` };
  }
  if (e) return { text: `jusqu'au ${e}`, ongoing: endNotPast, short: `Jusqu'au ${e}` };
  return {
    text: `au cours de l'année universitaire ${annee}`,
    ongoing: annee === academicYear(ctx.today),
    short: `Année universitaire ${annee}`,
  };
}

const yearOf = (ctx, values) => str(values.annee) || academicYear(ctx.today);

/** « , né(e) le … » si la date de naissance est connue. */
const birthClause = (member) => (formatDateLong(member?.birthDate) ? `, né(e) le ${formatDateLong(member.birthDate)}` : '');
/** « , inscrit(e) en BUT Informatique (BUT 2) » si la formation est connue. */
function programClause(member) {
  const program = str(member?.program);
  const year = str(member?.year);
  if (!program) return '';
  return `, inscrit(e) en ${program}${year && !program.includes(year) ? ` (${year})` : ''}`;
}

/** « , né(e) le …, inscrit(e) en …, » → apposition fermée par une virgule. */
const apposition = (text) => (text ? `${text},` : '');

// ------------------------------------------------------------
// Signataires
// ------------------------------------------------------------

/** Premier titulaire des rôles donnés, autre que le membre concerné. */
function defaultSignatoryId(ctx, member, roles) {
  for (const id of roles) {
    const m = ctx.members.find(x => x.mainRole === id && x.id !== member?.id);
    if (m) return m.id;
  }
  return '';
}

function resolveSignatory(ctx, values, member, roles) {
  const id = values.signataire || defaultSignatoryId(ctx, member, roles);
  return id ? signatory(ctx, id, []) : null;
}

/** « Je soussigné(e), X, agissant en qualité de Président(e) de l'association … » */
function undersigned(sig, org) {
  return sig
    ? `Je soussigné(e), **${sig.name}**, agissant en qualité ${de(sig.role)} de ${orgFull(org)}`
    : `Je soussigné(e), ${BLANK}, agissant au nom et pour le compte de ${orgFull(org)}`;
}

const PRESIDENCY = ['president', 'vice_president', 'secretaire'];
const TREASURY = ['tresorier', 'president', 'vice_president'];

/** Supérieur hiérarchique : responsable du pôle, sinon présidence. */
function reportingOf(ctx, member, info) {
  if (info.roleId === 'president') return { memberId: '', label: 'l\'assemblée générale des membres' };
  if (info.role && info.kind !== 'bureau') {
    const own = levelRank(ctx.catalog, info.role.level);
    const superiors = ctx.roleList
      .filter(r => r.pole === info.role.pole && r.id !== info.role.id && levelRank(ctx.catalog, r.level) > own)
      .sort((a, b) => (Number(info.roleId.startsWith(`${b.id}_`)) - Number(info.roleId.startsWith(`${a.id}_`)))
        || (Number(b.leadership) - Number(a.leadership)) || (levelRank(ctx.catalog, a.level) - levelRank(ctx.catalog, b.level)));
    for (const r of superiors) {
      const holder = ctx.members.find(m => m.mainRole === r.id && m.id !== member?.id);
      if (holder) return { memberId: holder.id, label: `${fullName(holder)}, ${r.label}` };
    }
    if (superiors[0]) return { memberId: '', label: superiors[0].label };
  }
  const pres = ctx.members.find(m => m.mainRole === 'president' && m.id !== member?.id);
  if (pres) return { memberId: pres.id, label: `${fullName(pres)}, ${roleLabelOf(ctx, pres)}` };
  return { memberId: '', label: ctx.catalog.roles.president?.label || 'Président(e)' };
}

function reportingLabel(ctx, member, info, chosenId) {
  const chosen = chosenId && ctx.members.find(m => m.id === chosenId);
  if (chosen) return `${fullName(chosen)}, ${roleLabelOf(ctx, chosen)}`;
  return reportingOf(ctx, member, info).label;
}

// ------------------------------------------------------------
// Méta-données
// ------------------------------------------------------------

function metaFor(templateId, title, fileBase, member, extra = {}) {
  const name = fullName(member) || 'membre';
  return {
    templateId,
    title: `${title} — ${name}`,
    fileName: safeFileName(`${fileBase} ${name}`),
    memberIds: [member.id],
    ...extra,
  };
}

// ------------------------------------------------------------
// Champs communs
// ------------------------------------------------------------

const dateDocumentField = {
  key: 'dateDocument', label: 'Date du document', type: 'date',
  default: (ctx) => isoDate(ctx.today),
};
const yearField = {
  key: 'annee', label: 'Année universitaire', type: 'text', placeholder: '2026-2027',
  default: (ctx) => academicYear(ctx.today),
};
const signatoryField = (roles, help) => ({
  key: 'signataire', label: 'Signataire', type: 'member',
  default: (ctx, member) => defaultSignatoryId(ctx, member, roles),
  help,
});
const roleField = {
  key: 'role', label: 'Fonction exercée', type: 'role',
  default: (ctx, member) => (roleOf(ctx, member)?.id || ''),
  help: 'Par défaut : le rôle actuel du membre. Laisse vide pour un membre sans fonction particulière.',
};
const startField = {
  key: 'dateDebut', label: 'Début des fonctions', type: 'date',
  default: (_ctx, member) => member?.mandateStart || '',
};
const endField = {
  key: 'dateFin', label: 'Fin des fonctions', type: 'date',
  default: (_ctx, member) => member?.mandateEnd || '',
};
const SIGN_HELP = 'Par défaut : la présidence (jamais le membre concerné lui-même).';

// ------------------------------------------------------------
// Registre & suggestions
// ------------------------------------------------------------

/** Le document `templateId` a-t-il été émis pour ce membre (option : depuis une date) ? */
function issued(ctx, templateId, memberId, predicate = () => true) {
  return ctx.documentLog.some(e => e && e.templateId === templateId
    && Array.isArray(e.memberIds) && e.memberIds.includes(memberId) && predicate(e));
}
const sameAcademicYear = (ctx) => (e) => toDate(e.createdAt) && academicYear(e.createdAt) === academicYear(ctx.today);
const hasCatalogRole = (ctx, m) => !!roleOf(ctx, m);
/** Membre sur le départ : badge « Ancien Membre » ou fin de fonctions passée. */
const hasLeft = (ctx, m) => (Array.isArray(m.badges) && m.badges.includes('Ancien Membre'))
  || (toDate(m.mandateEnd) && daysBetween(ctx.today, m.mandateEnd) < 0);
/** Fin de fonctions dans les 30 prochains jours. */
const leavingSoon = (ctx, m) => !!toDate(m.mandateEnd) && daysBetween(ctx.today, m.mandateEnd) >= 0 && daysBetween(ctx.today, m.mandateEnd) <= 30;
const hasAnyRole = (ctx, m) => !!roleInfo(ctx, m).label;

/** Une suggestion groupée (ou aucune si la liste est vide). */
function grouped(id, members, { title, reason, priority }) {
  if (!members.length) return [];
  return [{ id, title, reason: reason(members.length), priority, memberIds: members.map(m => m.id) }];
}
const membersWord = (n) => plural(n, 'membre');

// ============================================================
// 1. ATTESTATION D'ADHÉSION
// ============================================================

const attestationAdhesion = {
  id: 'attestation-adhesion',
  category: 'membres',
  title: 'Attestation d\'adhésion',
  description: 'Certifie qu\'une personne est membre de l\'association pour l\'année universitaire.',
  icon: 'BadgeCheck',
  tags: ['adhésion', 'membre', 'attestation', 'certificat'],
  scope: 'member',
  fields: [
    yearField,
    {
      key: 'dateAdhesion', label: 'Date d\'adhésion', type: 'date',
      default: (_ctx, member) => member?.joinedAt || '',
      help: 'Facultatif : la phrase est omise si la date est inconnue.',
    },
    {
      key: 'mentionRole', label: 'Mentionner la fonction exercée', type: 'checkbox',
      default: (ctx, member) => hasAnyRole(ctx, member),
    },
    {
      key: 'mentionCotisation', label: 'Mentionner que la cotisation est réglée', type: 'checkbox',
      default: (ctx, member) => !!toDate(member?.feePaidAt) && academicYear(member.feePaidAt) === academicYear(ctx.today),
      help: 'Coché automatiquement si un paiement est enregistré pour l\'année en cours.',
    },
    signatoryField(PRESIDENCY, SIGN_HELP),
    dateDocumentField,
  ],
  legal: {
    note: 'Modèle indicatif : vérifie que la qualité de membre correspond aux conditions d\'adhésion prévues par les statuts.',
  },
  suggest(ctx) {
    const annee = academicYear(ctx.today);
    const todo = ctx.members.filter(m => hasCatalogRole(ctx, m) && !hasLeft(ctx, m)
      && !issued(ctx, 'attestation-adhesion', m.id, sameAcademicYear(ctx)));
    return grouped('attestation-adhesion:annee', todo, {
      title: `Attestations d'adhésion ${annee}`,
      reason: n => `${membersWord(n)} avec un rôle ${n > 1 ? 'n\'ont' : 'n\'a'} pas encore reçu d'attestation d'adhésion pour l'année ${annee}.`,
      priority: 'low',
    });
  },
  build(ctx, values, member) {
    const b = createBlockFactory();
    const org = ctx.organization;
    const annee = yearOf(ctx, values);
    const sig = resolveSignatory(ctx, values, member, PRESIDENCY);
    const info = roleInfo(ctx, member);
    const name = nameOf(member);
    const since = formatDateLong(values.dateAdhesion);
    const blocks = [
      b.title('Attestation d\'adhésion', `Année universitaire ${annee}`),
      b.spacer('md'),
      b.p(`${undersigned(sig, org)}, atteste que **${name}**${apposition(birthClause(member) + programClause(member))} est membre de l'association au titre de l'année universitaire ${annee}.`),
    ];
    if (since) blocks.push(b.p(`Son adhésion a pris effet le ${since}.`));
    if (values.mentionCotisation) blocks.push(b.p(`${upperFirst(name)} est à jour de sa cotisation pour cette période.`));
    if (values.mentionRole && info.label) {
      blocks.push(b.p(`Au sein de l'association, ${name} exerce les fonctions ${de(info.label, true)}${poleClause(info)}.`));
    }
    blocks.push(
      b.p('La présente attestation est délivrée à l\'intéressé(e) pour servir et valoir ce que de droit.'),
      b.spacer('md'),
      placeDate(b, ctx, values),
      b.signatures([signatureSlot(sig, 'Pour l\'association')]),
    );
    return { meta: metaFor('attestation-adhesion', 'Attestation d\'adhésion', 'Attestation adhesion', member), blocks };
  },
};

// ============================================================
// 2. ATTESTATION D'ENGAGEMENT ASSOCIATIF / BÉNÉVOLAT
// ============================================================

const attestationEngagement = {
  id: 'attestation-engagement',
  category: 'membres',
  title: 'Attestation d\'engagement associatif',
  description: 'Valorise le bénévolat d\'un membre (CV, Parcoursup, stage, jury de reconnaissance de l\'engagement).',
  icon: 'Award',
  tags: ['bénévolat', 'engagement', 'CV', 'Parcoursup', 'compétences', 'reconnaissance'],
  scope: 'member',
  fields: [
    roleField,
    startField,
    endField,
    { ...yearField, help: 'Utilisée lorsque les dates de début et de fin ne sont pas renseignées.' },
    {
      key: 'missions', label: 'Missions exercées', type: 'list',
      default: (ctx, member) => missionsOf(roleInfo(ctx, member)),
      help: 'Proposées à partir du rôle ; une mission par ligne.',
    },
    {
      key: 'heuresParSemaine', label: 'Heures par semaine (estimation)', type: 'number', min: 0, max: 60,
      help: 'Facultatif : la mention est omise si le champ est vide.',
    },
    {
      key: 'competences', label: 'Compétences développées', type: 'list',
      default: (ctx, member) => skillsOf(roleInfo(ctx, member)).slice(0, 4),
    },
    { key: 'benevole', label: 'Préciser le caractère bénévole de l\'engagement', type: 'checkbox', default: true },
    {
      key: 'mentionReconnaissance', label: 'Mentionner la reconnaissance de l\'engagement étudiant', type: 'checkbox', default: true,
      help: 'Ajoute la référence à l\'article L. 611-9 du code de l\'éducation (validation des compétences acquises dans le cadre d\'un engagement).',
    },
    signatoryField(PRESIDENCY, SIGN_HELP),
    dateDocumentField,
  ],
  legal: {
    note: 'Modèle indicatif. Les modalités de reconnaissance de l\'engagement étudiant (crédits, bonus, dispense) sont fixées par chaque établissement.',
    references: ['Article L. 611-9 du code de l\'éducation'],
  },
  suggest(ctx) {
    const todo = ctx.members.filter(m => hasAnyRole(ctx, m) && (hasLeft(ctx, m) || leavingSoon(ctx, m))
      && !issued(ctx, 'attestation-engagement', m.id));
    return grouped('attestation-engagement:depart', todo, {
      title: 'Valoriser l\'engagement des membres sortants',
      reason: n => `${membersWord(n)} ${n > 1 ? 'terminent ou ont terminé leurs' : 'termine ou a terminé ses'} fonctions sans attestation d'engagement (utile pour un CV ou un dossier de candidature).`,
      priority: 'low',
    });
  },
  build(ctx, values, member) {
    const b = createBlockFactory();
    const org = ctx.organization;
    const annee = yearOf(ctx, values);
    const sig = resolveSignatory(ctx, values, member, PRESIDENCY);
    const info = roleInfo(ctx, member, values.role);
    const name = nameOf(member);
    const period = periodOf(ctx, values.dateDebut, values.dateFin, annee);
    const missions = cleanList(values.missions).length ? cleanList(values.missions) : missionsOf(info);
    const skills = cleanList(values.competences);
    const hours = positiveNumber(values.heuresParSemaine);
    const verb = period.ongoing ? 'est engagé(e)' : 's\'est engagé(e)';
    const roleText = info.label ? `, en qualité ${de(info.label, true)}${poleClause(info)}` : '';

    // Mise en page compacte : l'attestation doit tenir sur une seule page.
    const hoursText = hours
      ? ` Cet engagement représente un investissement estimé à ${frNumber(hours)} heure${hours >= 2 ? 's' : ''} par semaine en moyenne.`
      : '';
    const blocks = [
      b.title('Attestation d\'engagement associatif'),
      b.p(`${undersigned(sig, org)}, atteste que **${name}**${apposition(programClause(member))} ${verb}${values.benevole ? ' bénévolement' : ''} au sein de l'association ${period.text}${roleText}.${hoursText}`),
    ];
    if (missions.length) {
      blocks.push(b.heading('Missions exercées', 2), b.list(missions));
    }
    if (skills.length) {
      blocks.push(b.heading('Compétences mobilisées et développées', 2), b.list(skills));
    }
    const closing = [
      values.benevole ? 'Cet engagement est exercé à titre bénévole et n\'a donné lieu à aucune rémunération.' : '',
      values.mentionReconnaissance ? 'La présente attestation peut être produite à l\'appui d\'une demande de validation des compétences, connaissances et aptitudes acquises, dans le cadre de la reconnaissance de l\'engagement étudiant (article L. 611-9 du code de l\'éducation).' : '',
      values.mentionReconnaissance
        ? 'Elle est délivrée à l\'intéressé(e) pour servir et valoir ce que de droit.'
        : 'La présente attestation est délivrée à l\'intéressé(e) pour servir et valoir ce que de droit.',
    ].filter(Boolean);
    blocks.push(
      b.p(closing.join(' ')),
      placeDate(b, ctx, values),
      b.signatures([signatureSlot(sig, 'Pour l\'association')]),
    );
    return { meta: metaFor('attestation-engagement', 'Attestation d\'engagement', 'Attestation engagement', member), blocks };
  },
};

// ============================================================
// 3. LETTRE DE MISSION / FICHE DE POSTE
// ============================================================

const lettreMission = {
  id: 'lettre-mission',
  category: 'membres',
  title: 'Lettre de mission',
  description: 'Fiche de poste signée : missions, responsabilités, rattachement, accès Drive et engagements de confidentialité.',
  icon: 'FileSignature',
  tags: ['fiche de poste', 'mission', 'rôle', 'responsabilités', 'drive', 'RGPD'],
  scope: 'member',
  memberFilter: (member, ctx) => hasAnyRole(ctx, member),
  fields: [
    roleField,
    {
      key: 'rattachement', label: 'Rattachement (supérieur)', type: 'member',
      default: (ctx, member) => reportingOf(ctx, member, roleInfo(ctx, member)).memberId,
      help: 'Par défaut : le ou la responsable du pôle, sinon la présidence.',
    },
    startField,
    endField,
    yearField,
    {
      key: 'missions', label: 'Missions', type: 'list',
      default: (ctx, member) => missionsOf(roleInfo(ctx, member)),
    },
    {
      key: 'responsabilites', label: 'Responsabilités', type: 'list',
      default: (ctx, member) => [...(KIND_RESPONSIBILITIES[roleInfo(ctx, member).kind] || KIND_RESPONSIBILITIES.membre)],
    },
    {
      key: 'objectifs', label: 'Objectifs de l\'année', type: 'list', default: [],
      placeholder: 'Atteindre 1 000 abonnés sur Instagram',
      help: 'Facultatif : une ligne par objectif.',
    },
    { key: 'afficherDrive', label: 'Inclure les accès Drive', type: 'checkbox', default: true },
    signatoryField(PRESIDENCY, SIGN_HELP),
    dateDocumentField,
  ],
  legal: {
    note: 'Modèle indicatif : les fonctions décrites doivent rester cohérentes avec les statuts et le règlement intérieur. Une lettre de mission bénévole ne crée aucun lien de subordination ni de rémunération.',
    references: ['Règlement (UE) 2016/679 (RGPD)'],
  },
  suggest(ctx) {
    const todo = ctx.members.filter(m => {
      const info = roleInfo(ctx, m);
      return info.role && (info.kind === 'bureau' || info.kind === 'responsable' || info.role.leadership)
        && !hasLeft(ctx, m) && !issued(ctx, 'lettre-mission', m.id, sameAcademicYear(ctx));
    });
    return grouped('lettre-mission:direction', todo, {
      title: 'Lettres de mission du bureau et des responsables',
      reason: n => `${membersWord(n)} du bureau ou responsable${n > 1 ? 's' : ''} de pôle ${n > 1 ? 'n\'ont' : 'n\'a'} pas de lettre de mission pour l'année ${academicYear(ctx.today)}.`,
      priority: 'medium',
    });
  },
  build(ctx, values, member) {
    const b = createBlockFactory();
    const org = ctx.organization;
    const annee = yearOf(ctx, values);
    const sig = resolveSignatory(ctx, values, member, PRESIDENCY);
    const info = roleInfo(ctx, member, values.role);
    const name = nameOf(member);
    const label = info.label || 'membre bénévole';
    const period = periodOf(ctx, values.dateDebut, values.dateFin, annee);
    const missions = cleanList(values.missions).length ? cleanList(values.missions) : missionsOf(info);
    const duties = cleanList(values.responsabilites);
    const goals = cleanList(values.objectifs);
    const access = driveAccessOf(ctx, member);
    let n = 0;
    const num = (t) => `${++n}. ${t}`;

    const blocks = [
      b.title('Lettre de mission', `${upperFirst(label)} — Année universitaire ${annee}`),
      b.p(`${orgSubject(org)} confie à **${name}**, qui l'accepte, les fonctions ${de(label, true)}${poleClause(info)}, ${period.text}. La présente lettre précise le périmètre de ces fonctions, les missions qui s'y rattachent et les engagements réciproques des parties.`),
      b.kv([
        ['Titulaire', fullName(member)],
        ['Fonction', info.label],
        ['Pôle', info.pole?.label],
        ['Niveau hiérarchique', info.levelLabel],
        ['Rattachement', reportingLabel(ctx, member, info, values.rattachement)],
        ['Durée des fonctions', period.short],
        ['Contact', str(member.email)],
      ]),
      b.heading(num('Missions')),
      b.list(missions),
    ];
    if (duties.length) blocks.push(b.heading(num('Responsabilités')), b.list(duties));
    if (goals.length) blocks.push(b.heading(num('Objectifs de l\'année')), b.list(goals));
    if (values.afficherDrive) {
      blocks.push(b.heading(num('Accès aux espaces partagés')));
      if (access.length) {
        blocks.push(b.table(
          [{ key: 'folder', label: 'Dossier', width: 0.7 }, { key: 'level', label: 'Niveau d\'accès', width: 0.3 }],
          access.map(a => ({ folder: a.folder, level: a.level })),
          { dense: true },
        ));
      } else {
        blocks.push(b.small('Aucun accès Drive n\'est attribué à ce jour.'));
      }
      blocks.push(b.callout('Les accès sont personnels et nominatifs. Ils sont attribués pour la durée des fonctions et retirés à leur terme.', 'info'));
    }
    blocks.push(
      b.heading(num('Confidentialité et protection des données')),
      b.p('Le ou la titulaire s\'engage à garder confidentielles les informations portées à sa connaissance dans l\'exercice de ses fonctions, pendant toute leur durée et après leur terme. Les données personnelles auxquelles ses fonctions donnent accès (membres, participants, partenaires) sont traitées exclusivement pour les besoins de l\'association, conformément au règlement (UE) 2016/679 (RGPD) : elles ne peuvent être ni extraites, ni conservées à titre personnel, ni communiquées à des tiers non autorisés.'),
      b.heading(num('Durée et fin des fonctions')),
      b.p(`Les fonctions sont exercées à titre bénévole, ${period.text}. Elles prennent fin au terme du mandat, en cas de démission ou dans les conditions prévues par les statuts. Le ou la titulaire organise alors la passation de ses dossiers et restitue les accès, documents et matériel qui lui ont été confiés.`),
      b.spacer('md'),
      placeDate(b, ctx, values),
      b.signatures([
        signatureSlot(sig, 'Pour l\'association'),
        { label: 'Le ou la titulaire', name: fullName(member), role: info.label, mention: 'Lu et approuvé' },
      ]),
    );
    return { meta: metaFor('lettre-mission', 'Lettre de mission', 'Lettre mission', member), blocks };
  },
};

// ============================================================
// 4. LETTRE DE RECOMMANDATION
// ============================================================

const TONES = [
  { value: 'sobre', label: 'Sobre (institutionnel)' },
  { value: 'chaleureux', label: 'Chaleureux (personnel)' },
];

const lettreRecommandation = {
  id: 'lettre-recommandation',
  category: 'membres',
  title: 'Lettre de recommandation',
  description: 'Recommande un membre pour une candidature (master, stage, emploi, programme d\'échange…).',
  icon: 'Mail',
  tags: ['recommandation', 'candidature', 'master', 'stage', 'lettre'],
  scope: 'member',
  fields: [
    { key: 'destinataire', label: 'Formule d\'appel', type: 'text', default: 'Madame, Monsieur,', placeholder: 'Madame la Directrice,' },
    {
      key: 'contexte', label: 'Contexte de la candidature', type: 'text',
      placeholder: 'sa candidature au master Management de l\'université de …',
      help: 'Complète la phrase « … dans le cadre de … ». Facultatif.',
    },
    roleField,
    startField,
    endField,
    yearField,
    {
      key: 'qualites', label: 'Qualités mises en avant', type: 'list',
      default: (ctx, member) => [...(KIND_QUALITIES[roleInfo(ctx, member).kind] || KIND_QUALITIES.membre)],
      help: 'Formule chaque qualité avec un possessif : « sa rigueur », « son sens de l\'écoute ».',
    },
    {
      key: 'realisation', label: 'Réalisation ou anecdote marquante', type: 'textarea',
      placeholder: 'Elle a organisé le gala annuel, réunissant 400 étudiants, en respectant un budget serré.',
      help: 'Facultatif mais recommandé : un exemple concret rend la lettre bien plus convaincante.',
    },
    { key: 'ton', label: 'Ton', type: 'select', options: TONES, default: 'sobre' },
    signatoryField(PRESIDENCY, SIGN_HELP),
    dateDocumentField,
  ],
  legal: {
    note: 'Lettre engageant personnellement le ou la signataire : relis chaque paragraphe et n\'y laisse que des faits que tu peux confirmer.',
  },
  build(ctx, values, member) {
    const b = createBlockFactory();
    const org = ctx.organization;
    const annee = yearOf(ctx, values);
    const sig = resolveSignatory(ctx, values, member, PRESIDENCY);
    const info = roleInfo(ctx, member, values.role);
    const name = nameOf(member);
    const first = firstNameOf(member);
    const warm = values.ton === 'chaleureux';
    const period = periodOf(ctx, values.dateDebut, values.dateFin, annee);
    const contexte = str(values.contexte).replace(/[.\s]+$/, '');
    const ctxClause = contexte ? `, dans le cadre de ${contexte}` : '';
    const qualities = cleanList(values.qualites).map(lowerFirst);
    const realisation = sentence(values.realisation);
    const greeting = str(values.destinataire) || 'Madame, Monsieur,';
    const salutation = greeting.replace(/[,\s]+$/, '') || 'Madame, Monsieur';
    const asSigner = sig ? `En tant que ${sig.role} de ${orgRef(org)}` : `Au nom de ${orgRef(org)}`;
    const contactEmail = str(sig?.member?.email) || str(org.email);
    const contact = contactEmail ? ` (${contactEmail})` : '';

    const paragraphs = [];
    paragraphs.push(warm
      ? `${asSigner}, c'est avec un réel plaisir que je vous recommande **${name}**${ctxClause}.`
      : `${sig ? `En ma qualité ${de(sig.role)} de ${orgRef(org)}` : `Au nom de ${orgRef(org)}`}, j'ai l'honneur de vous recommander **${name}**${ctxClause}.`);

    if (info.label) {
      const missions = (cleanList(values.missions).length ? cleanList(values.missions) : missionsOf(info)).slice(0, 3).map(lowerFirst);
      paragraphs.push(`${first} ${period.ongoing ? 'exerce' : 'a exercé'} au sein de notre association les fonctions ${de(info.label)}${poleClause(info)}, ${period.text}.`
        + (missions.length ? ` ${period.ongoing ? 'Ses missions consistent' : 'Ses missions consistaient'} notamment ${joinFr(missions.map(m => `à ${m}`))}.` : ''));
    } else {
      paragraphs.push(`${first} ${period.ongoing ? 'est membre de notre association' : 'a été membre de notre association'} ${period.text} et ${period.ongoing ? 'prend' : 'a pris'} part à ses activités.`);
    }

    if (qualities.length) {
      paragraphs.push(warm
        ? `Au fil de notre collaboration, j'ai particulièrement apprécié chez ${first} ${joinFr(qualities)}. Ces qualités en font un membre précieux pour notre équipe.`
        : `J'ai pu apprécier chez ${first} ${joinFr(qualities)}.`);
    }
    if (realisation) {
      paragraphs.push(warm
        ? `Je garde notamment en mémoire l'exemple suivant : ${realisation}`
        : `Je souhaite en particulier souligner la réalisation suivante : ${realisation}`);
    }
    paragraphs.push(warm
      ? `Je suis convaincu(e) que ${first} saura mettre ces qualités au service de ${contexte ? 'ce nouveau projet' : 'ses projets futurs'}, et je ${contexte ? 'soutiens cette candidature' : 'l\'appuie'} avec enthousiasme. Je reste à votre disposition pour tout renseignement complémentaire${contact}.`
      : `Pour l'ensemble de ces raisons, je recommande ${first} sans réserve. Je reste à votre disposition pour tout renseignement complémentaire${contact}.`);
    paragraphs.push(warm
      ? `Je vous prie d'agréer, ${salutation}, l'expression de mes sentiments les meilleurs.`
      : `Je vous prie d'agréer, ${salutation}, l'expression de mes salutations distinguées.`);

    const blocks = [
      b.title('Lettre de recommandation'),
      placeDate(b, ctx, values),
      b.p(`**Objet :** recommandation ${de(name)}`, { align: 'left' }),
      b.p(greeting, { align: 'left' }),
      ...paragraphs.map(t => b.p(t)),
      b.spacer('md'),
      b.signatures([signatureSlot(sig, 'Pour l\'association')]),
    ];
    return { meta: metaFor('lettre-recommandation', 'Lettre de recommandation', 'Lettre recommandation', member), blocks };
  },
};

// ============================================================
// 5. ATTESTATION DE FIN DE FONCTIONS / PASSATION
// ============================================================

const attestationFinMandat = {
  id: 'attestation-fin-mandat',
  category: 'membres',
  title: 'Attestation de fin de fonctions',
  description: 'Atteste de la fin des fonctions d\'un membre et de la passation à son ou sa successeur(e).',
  icon: 'LogOut',
  tags: ['passation', 'fin de mandat', 'quitus', 'démission', 'successeur'],
  scope: 'member',
  memberFilter: (member, ctx) => hasLeft(ctx, member) || leavingSoon(ctx, member),
  fields: [
    roleField,
    startField,
    { ...endField, help: 'Facultatif : sans date, la période est exprimée par l\'année universitaire.' },
    yearField,
    { key: 'successeur', label: 'Successeur(e)', type: 'member', default: '', help: 'Facultatif.' },
    {
      key: 'elements', label: 'Éléments transmis ou restitués', type: 'list',
      default: (ctx, member) => { const i = roleInfo(ctx, member); return handoverItems(i.roleId, i.pole?.id); },
    },
    {
      key: 'quitus', label: 'Mentionner le quitus de gestion', type: 'checkbox', default: false,
      help: 'Le quitus approuve la gestion du ou de la titulaire sortant(e). Il est voté par l\'assemblée générale (ou l\'organe désigné par les statuts) : ne coche cette case que si ce vote a eu lieu.',
    },
    { key: 'dateQuitus', label: 'Date de l\'assemblée ayant donné quitus', type: 'date', default: '' },
    { key: 'remerciements', label: 'Ajouter des remerciements', type: 'checkbox', default: true },
    signatoryField(PRESIDENCY, SIGN_HELP),
    dateDocumentField,
  ],
  legal: {
    note: 'Modèle indicatif. Le quitus relève de l\'assemblée générale ; un changement de dirigeant doit en outre être déclaré au greffe des associations dans les trois mois (loi du 1er juillet 1901).',
    references: ['Loi du 1er juillet 1901 relative au contrat d\'association'],
  },
  suggest(ctx) {
    const todo = ctx.members.filter(m => hasLeft(ctx, m) && !issued(ctx, 'attestation-fin-mandat', m.id));
    return grouped('attestation-fin-mandat:sortants', todo, {
      title: 'Attester les fins de fonctions',
      reason: n => `${membersWord(n)} ${n > 1 ? 'ont quitté leurs' : 'a quitté ses'} fonctions (badge « Ancien Membre » ou fin de mandat dépassée) sans attestation de fin de fonctions.`,
      priority: 'medium',
    });
  },
  build(ctx, values, member) {
    const b = createBlockFactory();
    const org = ctx.organization;
    const annee = yearOf(ctx, values);
    const sig = resolveSignatory(ctx, values, member, PRESIDENCY);
    const info = roleInfo(ctx, member, values.role);
    const name = nameOf(member);
    const s = formatDateLong(values.dateDebut);
    const e = formatDateLong(values.dateFin);
    const period = s && e ? `du ${s} au ${e}` : s ? `à compter du ${s}` : e ? `jusqu'au ${e}` : `au cours de l'année universitaire ${annee}`;
    const successor = values.successeur ? ctx.members.find(m => m.id === values.successeur && m.id !== member.id) : null;
    const items = cleanList(values.elements);

    const blocks = [
      b.title('Attestation de fin de fonctions', info.label ? upperFirst(info.label) : undefined),
      b.spacer('md'),
      b.p(`${undersigned(sig, org)}, atteste que **${name}** ${info.label ? `a exercé les fonctions ${de(info.label, true)}${poleClause(info)}` : 'a été membre de l\'association'} ${period}.`),
    ];
    if (successor) {
      blocks.push(b.p(`La passation de ces fonctions a été effectuée au profit ${de(fullName(successor), true)}.${items.length ? ' Les éléments suivants lui ont été transmis :' : ''}`));
    } else if (items.length) {
      blocks.push(b.p('Les éléments suivants ont été transmis au bureau ou restitués à l\'association :'));
    }
    if (items.length) blocks.push(b.list(items));
    if (values.quitus) {
      const d = formatDateLong(values.dateQuitus);
      blocks.push(b.p(d
        ? `Par décision de l'assemblée générale du ${d}, quitus de sa gestion a été donné à ${name}.`
        : `Quitus de sa gestion a été donné à ${name} par l'assemblée générale.`));
    }
    if (values.remerciements) {
      blocks.push(b.p(`Le bureau remercie ${firstNameOf(member)} pour son engagement au service de l'association et des étudiants.`));
    }
    blocks.push(
      b.p('La présente attestation est délivrée pour servir et valoir ce que de droit.'),
      b.spacer('md'),
      placeDate(b, ctx, values),
      b.signatures([
        signatureSlot(sig, 'Pour l\'association'),
        { label: 'Le ou la titulaire sortant(e)', name: fullName(member), role: info.label },
        ...(successor ? [{ label: 'Le ou la successeur(e)', name: fullName(successor), role: roleLabelOf(ctx, successor, '') }] : []),
      ]),
    );
    return { meta: metaFor('attestation-fin-mandat', 'Attestation de fin de fonctions', 'Attestation fin fonctions', member), blocks };
  },
};

// ============================================================
// 6. DOSSIER DE PASSATION
// ============================================================

const kitPassation = {
  id: 'kit-passation',
  category: 'membres',
  title: 'Dossier de passation',
  description: 'Tout ce que le ou la successeur(e) doit savoir : missions, dossiers en cours, accès, contacts, étapes.',
  icon: 'FolderKey',
  tags: ['passation', 'successeur', 'transmission', 'accès', 'checklist', 'fin de mandat'],
  scope: 'member',
  memberFilter: (member, ctx) => hasLeft(ctx, member) || leavingSoon(ctx, member),
  fields: [
    roleField,
    { key: 'successeur', label: 'Successeur(e)', type: 'member', default: '', help: 'Facultatif.' },
    { key: 'datePassation', label: 'Date de passation', type: 'date', default: '' },
    yearField,
    {
      key: 'missions', label: 'Missions du poste', type: 'list',
      default: (ctx, member) => missionsOf(roleInfo(ctx, member)),
    },
    {
      key: 'dossiers', label: 'Dossiers en cours', type: 'list', default: [],
      placeholder: 'Convention avec la mairie — en attente de signature',
      help: 'Une ligne par dossier. Laissé vide, le document propose des lignes à remplir à la main.',
    },
    {
      key: 'echeances', label: 'Échéances et calendrier', type: 'list', default: [],
      placeholder: '15 novembre — dépôt du dossier de subvention',
    },
    { key: 'notes', label: 'Conseils et notes libres', type: 'textarea', default: '' },
  ],
  legal: {
    note: 'Document interne et confidentiel. Il ne contient jamais de mot de passe : les identifiants se transmettent de la main à la main ou via le coffre-fort, puis sont modifiés.',
  },
  suggest(ctx) {
    const todo = ctx.members.filter(m => hasAnyRole(ctx, m) && (hasLeft(ctx, m) || leavingSoon(ctx, m))
      && !issued(ctx, 'kit-passation', m.id));
    const soon = todo.filter(m => leavingSoon(ctx, m)).length;
    return grouped('kit-passation:sortants', todo, {
      title: 'Préparer les passations',
      reason: n => `${membersWord(n)} ${n > 1 ? 'quittent ou ont quitté leurs' : 'quitte ou a quitté ses'} fonctions sans dossier de passation${soon ? ` (dont ${soon} dans les 30 prochains jours)` : ''}.`,
      priority: 'high',
    });
  },
  build(ctx, values, member) {
    const b = createBlockFactory();
    const org = ctx.organization;
    const annee = yearOf(ctx, values);
    const info = roleInfo(ctx, member, values.role);
    const label = info.label || 'membre';
    const successor = values.successeur ? ctx.members.find(m => m.id === values.successeur && m.id !== member.id) : null;
    const missions = cleanList(values.missions).length ? cleanList(values.missions) : missionsOf(info);
    const duties = KIND_RESPONSIBILITIES[info.kind] || KIND_RESPONSIBILITIES.membre;
    const dossiers = cleanList(values.dossiers);
    const deadlines = cleanList(values.echeances);
    const notes = str(values.notes);
    const access = driveAccessOf(ctx, member);
    const reporting = info.roleId === 'president' ? '' : reportingLabel(ctx, member, info, '');
    const outgoing = [fullName(member), str(member.email)].filter(Boolean).join(' — ');

    const blocks = [
      b.title('Dossier de passation', `${upperFirst(label)} — ${annee}`),
      b.callout(`Ce dossier accompagne la transmission des fonctions ${de(label)} ${successor ? `à ${fullName(successor)}` : 'au ou à la successeur(e)'}. Il rassemble les missions, les dossiers en cours, les accès à transmettre et les contacts utiles. Il ne contient aucun mot de passe.`, 'info'),
      b.kv([
        ['Fonction', info.label],
        ['Pôle', info.pole?.label],
        ['Titulaire sortant(e)', outgoing],
        ['Successeur(e)', successor ? [fullName(successor), str(successor.email)].filter(Boolean).join(' — ') : ''],
        ['Date de passation', formatDateLong(values.datePassation)],
        ['Année universitaire', annee],
      ]),

      b.heading('1. Le poste'),
      b.p(`La fonction ${de(label)} s'exerce${poleClause(info)}${reporting ? `, sous la responsabilité ${de(reporting)}` : ', sous le contrôle de l\'assemblée générale'}. Ses missions principales sont les suivantes :`),
      b.list(missions),
      b.heading('Responsabilités', 2),
      b.list([...duties]),

      b.heading('2. Dossiers en cours'),
      dossiers.length
        ? b.list(dossiers)
        : b.blankLines(['Dossier : ____________  Statut : ____________  Prochaine étape : ____________',
          'Dossier : ____________  Statut : ____________  Prochaine étape : ____________',
          'Dossier : ____________  Statut : ____________  Prochaine étape : ____________']),

      b.heading('3. Accès Drive'),
      access.length
        ? b.table(
          [{ key: 'folder', label: 'Dossier', width: 0.55 }, { key: 'level', label: 'Niveau d\'accès', width: 0.25 }, { key: 'done', label: 'Transféré', width: 0.2, align: 'center' }],
          access.map(a => ({ folder: a.folder, level: a.level, done: '' })),
          { dense: true, caption: 'Ouvrir ces accès au ou à la successeur(e), puis retirer ceux du ou de la titulaire sortant(e).' },
        )
        : b.small('Aucun accès Drive n\'est attribué à ce poste.'),

      b.heading('4. Comptes et accès à transmettre'),
    ];

    const labels = Array.isArray(ctx.vaultEntryLabels) ? ctx.vaultEntryLabels.map(str).filter(Boolean) : null;
    if (labels === null) {
      blocks.push(b.callout('Déverrouille le coffre-fort pour lister les accès à transmettre (les mots de passe ne sont jamais imprimés).', 'warning'));
    } else if (labels.length === 0) {
      blocks.push(b.small('Aucune entrée n\'est enregistrée dans le coffre-fort.'));
    } else {
      blocks.push(
        b.table(
          [{ key: 'label', label: 'Accès (libellé du coffre-fort)', width: 0.55 }, { key: 'date', label: 'Transmis le', width: 0.25 }, { key: 'visa', label: 'Visa', width: 0.2 }],
          [...new Set(labels)].map(l => ({ label: l, date: '', visa: '' })),
          { dense: true },
        ),
        b.callout('Les identifiants se transmettent de la main à la main ou via le coffre-fort, jamais par écrit. Les mots de passe sont modifiés après la passation.', 'warning'),
      );
    }

    const contacts = [...bureauMembers(ctx), ...(info.pole && !info.isBureauPole
      ? ctx.members.filter(m => { const r = roleOf(ctx, m); return r && r.pole === info.pole.id && r.leadership; })
      : [])]
      .filter((m, i, arr) => m.id !== member.id && arr.findIndex(x => x.id === m.id) === i);
    blocks.push(b.heading('5. Contacts utiles'));
    if (contacts.length) {
      blocks.push(b.table(
        [{ key: 'name', label: 'Nom', width: 0.35 }, { key: 'role', label: 'Fonction', width: 0.3 }, { key: 'email', label: 'Email', width: 0.35 }],
        contacts.map(m => ({ name: fullName(m), role: roleLabelOf(ctx, m), email: str(m.email) || '—' })),
        { dense: true },
      ));
    } else {
      blocks.push(b.small('Aucun membre du bureau n\'est enregistré.'));
    }
    if (str(org.email)) blocks.push(b.small(`Adresse de contact de l'association : ${str(org.email)}`));

    blocks.push(
      b.heading('6. Échéances et calendrier'),
      deadlines.length
        ? b.list(deadlines)
        : b.blankLines(['Date : ____________  Échéance : ________________________________',
          'Date : ____________  Échéance : ________________________________',
          'Date : ____________  Échéance : ________________________________']),
      b.heading('7. Étapes de la passation'),
      b.checklist(handoverSteps(info.roleId)),
      b.heading('8. Conseils et notes'),
      notes ? b.p(notes) : b.blankLines(['', '', '', '']),
      b.spacer('md'),
      b.signatures([
        { label: 'Le ou la titulaire sortant(e)', name: fullName(member), role: info.label },
        { label: 'Le ou la successeur(e)', name: successor ? fullName(successor) : '', mention: 'Passation reçue' },
      ]),
    );
    return { meta: metaFor('kit-passation', 'Dossier de passation', 'Dossier passation', member, { confidential: true }), blocks };
  },
};

// ============================================================
// 7. CHARTE D'ENGAGEMENT DU MEMBRE
// ============================================================

const charteEngagement = {
  id: 'charte-engagement',
  category: 'membres',
  title: 'Charte d\'engagement du membre',
  description: 'Valeurs et engagements (respect, confidentialité, réseaux sociaux, RGPD…) à faire signer par chaque membre.',
  icon: 'Handshake',
  tags: ['charte', 'règlement', 'engagement', 'confidentialité', 'RGPD', 'nouveau membre'],
  scope: 'member',
  fields: [
    yearField,
    {
      key: 'valeurs', label: 'Valeurs de l\'association', type: 'list',
      default: () => [...CHARTER_VALUES],
    },
    {
      key: 'engagementsSpecifiques', label: 'Engagements spécifiques', type: 'list', default: [],
      placeholder: 'Je m\'engage à respecter la charte graphique de l\'association',
      help: 'Facultatif : engagements propres au poste ou à l\'association.',
    },
    signatoryField(PRESIDENCY, SIGN_HELP),
    dateDocumentField,
  ],
  legal: {
    note: 'Modèle indicatif : la charte complète les statuts et le règlement intérieur, qui prévalent en cas de contradiction. Toute sanction doit suivre la procédure prévue par les statuts.',
    references: ['Règlement (UE) 2016/679 (RGPD)'],
  },
  suggest(ctx) {
    const annee = academicYear(ctx.today);
    const todo = ctx.members.filter(m => toDate(m.joinedAt) && academicYear(m.joinedAt) === annee
      && !hasLeft(ctx, m) && !issued(ctx, 'charte-engagement', m.id));
    return grouped('charte-engagement:nouveaux', todo, {
      title: 'Faire signer la charte aux nouveaux membres',
      reason: n => `${membersWord(n)} ${n > 1 ? 'ont adhéré' : 'a adhéré'} cette année sans avoir signé la charte d'engagement.`,
      priority: 'low',
    });
  },
  build(ctx, values, member) {
    const b = createBlockFactory();
    const org = ctx.organization;
    const annee = yearOf(ctx, values);
    const sig = resolveSignatory(ctx, values, member, PRESIDENCY);
    const info = roleInfo(ctx, member);
    const name = nameOf(member);
    const valeurs = cleanList(values.valeurs);
    const specific = cleanList(values.engagementsSpecifiques).map(sentence);

    const blocks = [
      b.title('Charte d\'engagement du membre', `Année universitaire ${annee}`),
      b.p(`${upperFirst(orgRef(org))} rassemble des étudiantes et des étudiants qui consacrent bénévolement une partie de leur temps à la vie étudiante. La présente charte rappelle les valeurs qui fondent son action et les engagements réciproques de l'association et de chacun de ses membres. Elle complète les statuts et, le cas échéant, le règlement intérieur, qui prévalent en cas de contradiction.`),
    ];
    if (valeurs.length) blocks.push(b.heading('Nos valeurs'), b.list(valeurs));
    blocks.push(
      b.heading('Mes engagements'),
      b.p(`En signant cette charte, je m'engage à respecter les principes suivants${info.label ? `, notamment dans l'exercice de mes fonctions ${de(info.label)}` : ''}.`),
    );
    CHARTER_COMMITMENTS.forEach(([title, text], i) => {
      blocks.push(b.heading(`${i + 1}. ${title}`, 2), b.p(text));
    });
    if (specific.length) {
      blocks.push(b.heading(`${CHARTER_COMMITMENTS.length + 1}. Engagements spécifiques`, 2), b.list(specific));
    }
    blocks.push(
      b.heading('Engagements de l\'association'),
      b.p('En contrepartie, l\'association s\'engage à :'),
      b.list([...CHARTER_ASSOCIATION_COMMITMENTS]),
      b.heading('Non-respect de la charte'),
      b.p('Le non-respect de la présente charte peut conduire le bureau à retirer les accès confiés et, le cas échéant, à engager les procédures prévues par les statuts, après avoir invité le membre concerné à présenter ses observations.'),
      b.spacer('sm'),
      b.p(`Je soussigné(e), **${name}**${info.label ? `, ${info.label}` : ''}, déclare avoir pris connaissance de la présente charte et m'engage à la respecter pendant toute la durée de mon engagement au sein de l'association.`),
      placeDate(b, ctx, values),
      b.signatures([
        { label: 'Signature du membre', name: fullName(member), role: info.label, mention: 'Lu et approuvé' },
        signatureSlot(sig, 'Pour l\'association'),
      ]),
    );
    return { meta: metaFor('charte-engagement', 'Charte d\'engagement', 'Charte engagement', member), blocks };
  },
};

// ============================================================
// 8. REÇU DE COTISATION
// ============================================================

/** Montant par défaut : cotisation du membre, sinon montant statutaire. */
function defaultFee(ctx, member) {
  const n = positiveNumber(member?.feeAmount) ?? positiveNumber(ctx.organization.membershipFee);
  return n === null ? '' : n;
}

const recuCotisation = {
  id: 'recu-cotisation',
  category: 'membres',
  title: 'Reçu de cotisation',
  description: 'Reçu remis au membre après le paiement de sa cotisation annuelle.',
  icon: 'Receipt',
  tags: ['cotisation', 'reçu', 'paiement', 'adhésion', 'trésorerie', 'HelloAsso'],
  scope: 'member',
  fields: [
    {
      key: 'montant', label: 'Montant (€)', type: 'money', required: true,
      default: defaultFee,
      help: 'Par défaut : cotisation enregistrée sur la fiche du membre, sinon montant défini dans le profil de l\'association.',
    },
    {
      key: 'datePaiement', label: 'Date du paiement', type: 'date', required: true,
      default: (ctx, member) => member?.feePaidAt || isoDate(ctx.today),
    },
    { key: 'moyen', label: 'Mode de règlement', type: 'select', options: PAYMENT_METHODS, default: '', required: true },
    { key: 'reference', label: 'Référence du paiement', type: 'text', placeholder: 'N° de chèque, de transaction…', help: 'Facultatif.' },
    yearField,
    signatoryField(TREASURY, 'Par défaut : le ou la trésorier(ère), sinon la présidence.'),
    dateDocumentField,
  ],
  legal: {
    note: 'Modèle indicatif. Ce reçu n\'est pas un reçu fiscal : seuls certains organismes (notamment d\'intérêt général, sous conditions) peuvent délivrer un reçu ouvrant droit à réduction d\'impôt.',
  },
  suggest(ctx) {
    const todo = ctx.members.filter(m => toDate(m.feePaidAt)
      && !issued(ctx, 'recu-cotisation', m.id, e => toDate(e.createdAt) && academicYear(e.createdAt) === academicYear(m.feePaidAt)));
    return grouped('recu-cotisation:paiements', todo, {
      title: 'Reçus de cotisation à remettre',
      reason: n => `${membersWord(n)} ${n > 1 ? 'ont réglé leur' : 'a réglé sa'} cotisation sans qu'un reçu ait été émis.`,
      priority: 'medium',
    });
  },
  build(ctx, values, member) {
    const b = createBlockFactory();
    const org = ctx.organization;
    const annee = yearOf(ctx, values);
    const sig = resolveSignatory(ctx, values, member, TREASURY);
    const name = nameOf(member);
    const amount = positiveNumber(values.montant);
    const money = amount !== null ? formatMoney(amount) : '__________ €';
    const words = amount !== null ? amountInWords(amount) : '';
    const method = PAYMENT_METHODS.find(m => m.value === values.moyen)?.label || '';
    const paidAt = formatDateLong(values.datePaiement);
    const address = str(member.address);

    const blocks = [
      b.title('Reçu de cotisation', `Année universitaire ${annee}`),
      b.spacer('sm'),
      b.p(`${orgSubject(org)} reconnaît avoir reçu ${de(name, true)}${address ? `, demeurant ${address},` : ''} la somme de **${money}**${words ? ` (${words})` : ''}${paidAt ? `, le ${paidAt}` : ''}, au titre de sa cotisation de membre pour l'année universitaire ${annee}.`),
      b.kv([
        ['Membre', fullName(member)],
        ['Montant', money],
        ['Montant en toutes lettres', upperFirst(words)],
        ['Date du paiement', paidAt],
        ['Mode de règlement', method || '____________________'],
        ['Référence', str(values.reference)],
        ['Période couverte', `Année universitaire ${annee}`],
      ]),
      b.callout('Ce reçu atteste du paiement d\'une cotisation. Il ne constitue pas un reçu fiscal ouvrant droit à réduction d\'impôt.', 'legal'),
      b.spacer('md'),
      placeDate(b, ctx, values),
      b.signatures([signatureSlot(sig, 'Pour l\'association')]),
    ];
    return { meta: metaFor('recu-cotisation', 'Reçu de cotisation', 'Recu cotisation', member), blocks };
  },
};

// ============================================================
// 9. CERTIFICAT DE PARTICIPATION (ÉVÉNEMENT / PROJET)
// ============================================================

const attestationParticipation = {
  id: 'attestation-participation-membre',
  category: 'membres',
  title: 'Certificat de participation',
  description: 'Certifie la participation d\'un membre à un événement ou à un projet de l\'association.',
  icon: 'CalendarCheck',
  tags: ['participation', 'événement', 'projet', 'bénévolat', 'heures'],
  scope: 'member',
  fields: [
    { key: 'evenement', label: 'Événement ou projet', type: 'text', required: true, placeholder: 'Gala de fin d\'année 2027' },
    { key: 'dateDebut', label: 'Date (ou date de début)', type: 'date', required: true, default: '' },
    { key: 'dateFin', label: 'Date de fin', type: 'date', default: '', help: 'Facultatif : pour un événement sur plusieurs jours ou un projet.' },
    { key: 'lieu', label: 'Lieu', type: 'text', placeholder: 'Campus de Montreuil' },
    { key: 'roleEvenement', label: 'Rôle pendant l\'événement', type: 'text', placeholder: 'bénévole à l\'accueil et à la billetterie' },
    { key: 'heures', label: 'Nombre d\'heures', type: 'number', min: 0, help: 'Facultatif.' },
    { key: 'description', label: 'Description (facultatif)', type: 'textarea', placeholder: 'Missions réalisées, public accueilli…' },
    signatoryField(PRESIDENCY, SIGN_HELP),
    dateDocumentField,
  ],
  legal: {
    note: 'Modèle indicatif : n\'indique que des informations vérifiables (dates, rôle, volume horaire).',
  },
  build(ctx, values, member) {
    const b = createBlockFactory();
    const org = ctx.organization;
    const sig = resolveSignatory(ctx, values, member, PRESIDENCY);
    const name = nameOf(member);
    const event = str(values.evenement);
    const s = formatDateLong(values.dateDebut);
    const e = formatDateLong(values.dateFin);
    const sameDay = s && e && str(values.dateDebut) === str(values.dateFin);
    const when = s && e && !sameDay ? ` du ${s} au ${e}` : s ? ` le ${s}` : e ? ` le ${e}` : '';
    const roleEvt = str(values.roleEvenement);
    const hours = positiveNumber(values.heures);
    const description = sentence(values.description);

    const blocks = [
      b.title('Certificat de participation', event || undefined),
      b.spacer('md'),
      b.p(`${undersigned(sig, org)}, certifie que **${name}** a participé à l'action « ${event || BLANK} », organisée par l'association${when}${str(values.lieu) ? ` (${str(values.lieu)})` : ''}${roleEvt ? `, en qualité ${de(roleEvt)}` : ''}.`),
      b.kv([
        ['Événement ou projet', event],
        ['Date(s)', s && e && !sameDay ? `Du ${s} au ${e}` : (s || e)],
        ['Lieu', str(values.lieu)],
        ['Rôle', upperFirst(roleEvt)],
        ['Volume horaire', hours ? `${frNumber(hours)} heure${hours >= 2 ? 's' : ''}` : ''],
      ]),
    ];
    if (description) blocks.push(b.p(description));
    if (hours) blocks.push(b.p(`Cette participation représente un volume de ${frNumber(hours)} heure${hours >= 2 ? 's' : ''}.`));
    blocks.push(
      b.p('Le présent certificat est délivré à l\'intéressé(e) pour servir et valoir ce que de droit.'),
      b.spacer('md'),
      placeDate(b, ctx, values),
      b.signatures([signatureSlot(sig, 'Pour l\'association')]),
    );
    return { meta: metaFor('attestation-participation-membre', 'Certificat de participation', 'Certificat participation', member), blocks };
  },
};

export default [
  attestationAdhesion,
  attestationEngagement,
  lettreMission,
  lettreRecommandation,
  attestationFinMandat,
  kitPassation,
  charteEngagement,
  recuCotisation,
  attestationParticipation,
];
