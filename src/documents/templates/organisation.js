// Modèles de la catégorie « organisation » — voir le contrat dans ../context.js.
// Organigramme officiel, annuaire interne, fiche de présentation d'un pôle.
import { createBlockFactory, safeFileName } from '../model.js';
import {
  formatDateLong, academicYear, isoDate, fullName, officialName, roleLabelOf, roleOf,
  poleColorHex, levelKind, plural, joinFr,
} from '../context.js';
import {
  str, cleanList, holdersOf, rolesOfPoleRanked, polesBureauFirst, membersWithoutCatalogRole,
  poleTitle, NEUTRAL_COLOR, displayName, poleDriveAccess, issuedSince, byOfficialName,
} from './orgPart_helpers.js';

// ------------------------------------------------------------
// Organigramme officiel
// ------------------------------------------------------------

/**
 * Groupes de l'organigramme (exportés pour les tests).
 * @returns {{ title, color, people: {name, role}[] }[]}
 */
export function buildOrgChartGroups(ctx, { includeVacancies = true, includeOthers = true } = {}) {
  const groups = [];
  polesBureauFirst(ctx).forEach(pole => {
    const people = [];
    rolesOfPoleRanked(ctx, pole.id).forEach(role => {
      const holders = holdersOf(ctx, role.id);
      holders.forEach(m => people.push({ name: displayName(m), role: role.label }));
      const free = (role.capacity ?? 0) - holders.length;
      if (includeVacancies && free > 0) {
        people.push({ name: 'Poste à pourvoir', role: free > 1 ? `${role.label} (${free} places)` : role.label });
      }
    });
    if (people.length) groups.push({ title: poleTitle(pole), color: poleColorHex(pole.color), people });
  });
  if (includeOthers) {
    const others = membersWithoutCatalogRole(ctx);
    if (others.length) {
      groups.push({
        title: 'Autres membres',
        color: NEUTRAL_COLOR,
        people: others.map(m => ({ name: displayName(m), role: roleLabelOf(ctx, m) })),
      });
    }
  }
  return groups;
}

const organigramme = {
  id: 'organigramme-officiel',
  legal: { note: "Document d'information interne : il reflète l'état du catalogue des rôles et des membres à la date d'édition." },
  category: 'organisation',
  title: 'Organigramme officiel',
  description: 'Organigramme de l\'association par pôle, avec les postes à pourvoir.',
  icon: 'Network',
  tags: ['organigramme', 'pôles', 'bureau', 'équipe', 'structure'],
  scope: 'organization',
  fields: [
    { key: 'date', label: 'Organigramme à jour au', type: 'date', default: (ctx) => isoDate(ctx.today) },
    { key: 'includeVacancies', label: 'Afficher les postes à pourvoir', type: 'checkbox', default: true },
    { key: 'includeOthers', label: 'Inclure les membres sans rôle du catalogue (« Autres membres »)', type: 'checkbox', default: true },
  ],
  suggest: (ctx) => {
    if (ctx.members.length === 0) return [];
    const yearStart = `${academicYear(ctx.today).slice(0, 4)}-09-01`;
    if (issuedSince(ctx, 'organigramme-officiel', yearStart)) return [];
    return [{
      id: 'organigramme-annee',
      title: 'Publier l\'organigramme de l\'année',
      reason: `Aucun organigramme n'a été émis pour l'année universitaire ${academicYear(ctx.today)}.`,
      priority: 'low',
    }];
  },
  build: (ctx, values) => {
    const b = createBlockFactory();
    const org = ctx.organization;
    const date = values.date || isoDate(ctx.today);
    const groups = buildOrgChartGroups(ctx, values);
    const assigned = ctx.members.filter(m => roleOf(ctx, m)).length;
    const seats = ctx.roleList.reduce((acc, r) => acc + (r.capacity ?? 0), 0);
    const filledSeats = ctx.roleList.reduce((acc, r) => acc + Math.min(r.capacity ?? 0, holdersOf(ctx, r.id).length), 0);

    const blocks = [
      b.title(`Organigramme — ${org.name}`, `Année universitaire ${academicYear(date)} · à jour au ${formatDateLong(date)}`),
    ];
    if (groups.length) blocks.push(b.orgChart(groups));
    else blocks.push(b.callout('Aucun membre ni rôle à afficher : ajoutez des membres et attribuez-leur un rôle du catalogue.', 'warning'));
    const summary = [
      plural(ctx.members.length, 'membre'),
      `${plural(assigned, 'membre')} avec un rôle du catalogue`,
      seats ? `${filledSeats} poste${filledSeats > 1 ? 's' : ''} pourvu${filledSeats > 1 ? 's' : ''} sur ${seats}` : '',
    ].filter(Boolean);
    blocks.push(b.small(`${summary.join(' · ')}.`, { align: 'center', tone: 'muted' }));

    return {
      meta: {
        templateId: 'organigramme-officiel',
        title: `Organigramme ${academicYear(date)}`,
        fileName: safeFileName(`Organigramme_${org.shortName || org.name}_${academicYear(date)}`),
        orientation: 'landscape',
        memberIds: ctx.members.map(m => m.id),
      },
      blocks,
    };
  },
};

// ------------------------------------------------------------
// Annuaire interne
// ------------------------------------------------------------

const SCOPES = {
  bureau: 'Bureau uniquement',
  encadrement: 'Bureau et responsables de pôle',
  all: 'Tous les membres',
};

/** Le membre entre-t-il dans le périmètre choisi ? */
function inScope(ctx, member, scope) {
  if (scope === 'all') return true;
  const role = roleOf(ctx, member);
  if (!role) return false;
  const kind = levelKind(ctx.catalog, role.level);
  return scope === 'encadrement' ? kind === 'bureau' || kind === 'responsable' : kind === 'bureau';
}

const annuaire = {
  id: 'annuaire-bureau',
  legal: { note: 'Contient des données personnelles : à diffuser uniquement aux membres habilités (RGPD), et à mettre à jour ou détruire à la fin du mandat.' },
  category: 'organisation',
  title: 'Annuaire interne',
  description: 'Coordonnées des membres par pôle — document confidentiel à usage interne.',
  icon: 'BookUser',
  tags: ['annuaire', 'contacts', 'emails', 'téléphones', 'bureau'],
  scope: 'organization',
  fields: [
    {
      key: 'scope', label: 'Membres listés', type: 'select', default: 'bureau',
      options: Object.entries(SCOPES).map(([value, label]) => ({ value, label })),
    },
    { key: 'includePhone', label: 'Inclure les numéros de téléphone', type: 'checkbox', default: false, help: 'À n\'activer que si les membres concernés en ont été informés.' },
    { key: 'date', label: 'À jour au', type: 'date', default: (ctx) => isoDate(ctx.today) },
  ],
  build: (ctx, values) => {
    const b = createBlockFactory();
    const org = ctx.organization;
    const scope = SCOPES[values.scope] ? values.scope : 'bureau';
    const date = values.date || isoDate(ctx.today);
    const columns = [
      { key: 'name', label: 'Nom', width: values.includePhone ? 0.24 : 0.3 },
      { key: 'role', label: 'Fonction', width: values.includePhone ? 0.24 : 0.3 },
      { key: 'email', label: 'Email', width: values.includePhone ? 0.32 : 0.4 },
      ...(values.includePhone ? [{ key: 'phone', label: 'Téléphone', width: 0.2 }] : []),
    ];
    const row = (m) => ({
      name: officialName(m) || 'Membre sans nom',
      role: roleLabelOf(ctx, m),
      email: str(m.email) || '—',
      ...(values.includePhone ? { phone: str(m.phone) || '—' } : {}),
    });

    const blocks = [
      b.title(`Annuaire interne — ${org.name}`, `${SCOPES[scope]} · année universitaire ${academicYear(date)} · à jour au ${formatDateLong(date)}`),
      b.callout('**Document à usage interne — ne pas diffuser.** Il contient des données personnelles (RGPD) : ne le transmettez pas hors de l\'association, ne le conservez pas au-delà de l\'usage prévu et détruisez les versions obsolètes.', 'warning'),
    ];
    const listed = [];
    polesBureauFirst(ctx).forEach(pole => {
      const members = [];
      rolesOfPoleRanked(ctx, pole.id).forEach(role => {
        holdersOf(ctx, role.id).filter(m => inScope(ctx, m, scope)).forEach(m => members.push(m));
      });
      if (!members.length) return;
      listed.push(...members);
      blocks.push(b.heading(poleTitle(pole), 2));
      blocks.push(b.table(columns, members.map(row), { dense: true }));
    });
    if (scope === 'all') {
      const others = membersWithoutCatalogRole(ctx);
      if (others.length) {
        listed.push(...others);
        blocks.push(b.heading('Autres membres', 2));
        blocks.push(b.table(columns, others.map(row), { dense: true }));
      }
    }
    if (!listed.length) {
      blocks.push(b.p('Aucun membre ne correspond au périmètre choisi.', { editable: false }));
    } else {
      const withEmail = listed.filter(m => str(m.email)).length;
      blocks.push(b.small(`${plural(listed.length, 'personne')} listée${listed.length > 1 ? 's' : ''}, dont ${withEmail} avec une adresse email renseignée.`, { tone: 'muted' }));
    }

    return {
      meta: {
        templateId: 'annuaire-bureau',
        title: `Annuaire interne — ${SCOPES[scope]}`,
        fileName: safeFileName(`Annuaire_interne_${org.shortName || org.name}_${date}`),
        confidential: true,
        memberIds: listed.map(m => m.id),
      },
      blocks,
    };
  },
};

// ------------------------------------------------------------
// Fiche de présentation d'un pôle
// ------------------------------------------------------------

/** Missions par défaut des pôles du catalogue d'origine (repli générique sinon). */
const DEFAULT_MISSIONS = {
  bureau: 'Le Bureau assure la direction de l\'association : il met en œuvre les décisions de l\'assemblée générale, coordonne les pôles, représente l\'association auprès de l\'établissement et de ses partenaires, et veille à la bonne gestion administrative et financière.',
  communication: 'Le pôle Communication conçoit et diffuse la communication externe de l\'association : identité visuelle, réseaux sociaux, affiches et promotion des événements, dans le respect de la charte graphique.',
  communication_interne: 'Le pôle Communication interne fait circuler l\'information auprès des étudiants et des membres : annonces, relais dans l\'établissement, accueil des nouveaux arrivants.',
  projets: 'Le pôle Projets pilote les projets de l\'association, de l\'idée au bilan : cadrage, planification, coordination des équipes et suivi des résultats.',
  event: 'Le pôle Événementiel organise les événements de l\'association : conception, logistique, sécurité, coordination le jour J et bilan.',
  sport: 'Le pôle Sport anime la vie sportive étudiante : rencontres, tournois, sorties et promotion de la pratique sportive.',
  esport: 'Le pôle E-Sport développe la pratique du jeu vidéo compétitif : tournois, équipes, diffusions et événements en ligne ou sur place.',
  partenariats: 'Le pôle Partenariats recherche et entretient les relations avec les entreprises et organismes partenaires : démarchage, négociation, suivi des conventions et des contreparties.',
  transversal: 'Le pôle Transversal regroupe les membres qui apportent leur appui à plusieurs pôles selon les besoins de l\'association.',
};

export function defaultMission(ctx, pole) {
  if (!pole) return '';
  return DEFAULT_MISSIONS[pole.id] && !pole.custom
    ? DEFAULT_MISSIONS[pole.id]
    : `Le pôle ${pole.label} contribue à la réalisation de l'objet de ${ctx.organization.name} : il prend en charge les actions relevant de son domaine, en lien avec le Bureau et les autres pôles.`;
}

function seatStatus(capacity, count) {
  if (capacity === 0) return count ? 'Hors capacité' : 'Non ouvert';
  if (count > capacity) return 'Sureffectif';
  if (count === capacity) return 'Pourvu';
  const free = capacity - count;
  return `À pourvoir (${free})`;
}

const fichePole = {
  id: 'fiche-pole',
  legal: { note: "Document d'organisation interne, sans valeur juridique : il décrit le pôle tel qu'il est configuré dans l'application." },
  category: 'organisation',
  title: 'Fiche de présentation d\'un pôle',
  description: 'Mission, rôles et effectifs, responsable, accès Drive et objectifs d\'un pôle.',
  icon: 'LayoutGrid',
  tags: ['pôle', 'présentation', 'mission', 'objectifs', 'effectifs'],
  scope: 'organization',
  fields: [
    {
      key: 'poleId', label: 'Pôle', type: 'select', required: true,
      // Options dépendantes du catalogue : fonction (ctx) => [{ value, label }].
      options: (ctx) => ctx.poleList.map(p => ({ value: p.id, label: poleTitle(p) })),
      default: (ctx) => ctx.poleList[0]?.id || '',
    },
    { key: 'mission', label: 'Mission du pôle', type: 'textarea', help: 'Laisser vide pour un texte généré à partir du pôle choisi.' },
    { key: 'objectives', label: 'Objectifs de l\'année (un par ligne)', type: 'list', help: 'Laisser vide pour des lignes à compléter à la main.' },
    { key: 'date', label: 'Date', type: 'date', default: (ctx) => isoDate(ctx.today) },
  ],
  build: (ctx, values) => {
    const b = createBlockFactory();
    const org = ctx.organization;
    const pole = ctx.catalog.poles[values.poleId] || ctx.poleList[0] || null;
    const date = values.date || isoDate(ctx.today);
    if (!pole) {
      return {
        meta: { templateId: 'fiche-pole', title: 'Fiche pôle', fileName: 'Fiche_pole' },
        blocks: [b.title('Fiche de présentation d\'un pôle'), b.callout('Aucun pôle n\'est défini dans le catalogue des rôles.', 'warning')],
      };
    }
    const roles = rolesOfPoleRanked(ctx, pole.id);
    const leaders = roles
      .filter(r => r.leadership || levelKind(ctx.catalog, r.level) === 'responsable')
      .flatMap(r => holdersOf(ctx, r.id).map(m => `${fullName(m)} (${r.label})`));
    const members = roles.flatMap(r => holdersOf(ctx, r.id));
    const seats = roles.reduce((acc, r) => acc + (r.capacity ?? 0), 0);

    const blocks = [
      b.title(`Pôle ${pole.label}`, `${org.name} · année universitaire ${academicYear(date)}`),
      b.kv([
        ['Pôle', poleTitle(pole)],
        ['Responsable(s)', leaders.length ? joinFr(leaders) : 'À désigner'],
        ['Effectif', `${plural(members.length, 'membre')}${seats ? ` pour ${plural(seats, 'place')} prévue${seats > 1 ? 's' : ''}` : ''}`],
        ['À jour au', formatDateLong(date)],
      ]),
      b.heading('Mission'),
      b.p(str(values.mission) || defaultMission(ctx, pole)),
      b.heading('Rôles et effectifs'),
    ];
    if (roles.length) {
      blocks.push(b.table(
        [
          { key: 'role', label: 'Rôle', width: 0.3 },
          { key: 'capacity', label: 'Places', width: 0.1, align: 'center' },
          { key: 'holders', label: 'Titulaire(s)', width: 0.4 },
          { key: 'status', label: 'Statut', width: 0.2 },
        ],
        roles.map(r => {
          const h = holdersOf(ctx, r.id);
          return {
            role: r.label,
            capacity: String(r.capacity ?? 0),
            holders: h.length ? h.sort(byOfficialName).map(fullName).join(', ') : '—',
            status: seatStatus(r.capacity ?? 0, h.length),
          };
        }),
      ));
    } else {
      blocks.push(b.p('Aucun rôle n\'est encore rattaché à ce pôle dans le catalogue.', { editable: false }));
    }

    blocks.push(b.heading('Dossiers Drive accessibles'));
    const access = poleDriveAccess(ctx, pole.id);
    if (access.length) {
      blocks.push(b.small('Accès prévus par les presets des rôles du pôle (niveau le plus élevé parmi ces rôles).', { tone: 'muted' }));
      blocks.push(b.table(
        [
          { key: 'folder', label: 'Dossier', width: 0.45 },
          { key: 'level', label: 'Accès', width: 0.18 },
          { key: 'roles', label: 'Rôles concernés', width: 0.37 },
        ],
        access.map(a => ({ folder: a.folder, level: a.levelLabel, roles: a.roles.join(', ') })),
        { dense: true },
      ));
    } else {
      blocks.push(b.p('Aucun preset d\'accès Drive n\'est défini pour les rôles de ce pôle.', { editable: false }));
    }

    blocks.push(b.heading('Objectifs de l\'année'));
    const objectives = cleanList(values.objectives);
    if (objectives.length) blocks.push(b.list(objectives, true));
    else blocks.push(b.blankLines(['1. ______________________________________________', '2. ______________________________________________', '3. ______________________________________________']));

    return {
      meta: {
        templateId: 'fiche-pole',
        title: `Fiche pôle — ${pole.label}`,
        fileName: safeFileName(`Fiche_pole_${pole.label}_${academicYear(date)}`),
        memberIds: members.map(m => m.id),
      },
      blocks,
    };
  },
};

export default [organigramme, annuaire, fichePole];
