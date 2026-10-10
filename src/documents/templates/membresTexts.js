// ============================================================
// STUDIO DOCUMENTS — TEXTES DE RÉFÉRENCE DES MODÈLES « MEMBRES »
// ============================================================
// Module PUR (aucune dépendance) : dictionnaires de missions, compétences,
// qualités et responsabilités, utilisés par ./membres.js.
//
// Rédaction : phrases à l'infinitif (missions, responsabilités) ou groupes
// nominaux (compétences, qualités), sans pronom genré, afin de pouvoir être
// insérées telles quelles dans une liste ou dans une phrase.
// ============================================================

/** Missions des rôles du catalogue par défaut (ids immuables). */
export const ROLE_MISSIONS = {
  president: [
    'Représenter l\'association auprès de l\'établissement, des partenaires et des institutions',
    'Définir les orientations de l\'association et coordonner l\'action du bureau',
    'Animer les réunions de bureau et conduire les assemblées générales',
    'Veiller au respect des statuts, du règlement intérieur et des obligations légales de l\'association',
    'Superviser les projets et accompagner les responsables de pôle',
    'Garantir, avec le ou la trésorier(ère), une gestion financière saine et transparente',
  ],
  vice_president: [
    'Seconder le ou la Président(e) et le ou la représenter en cas d\'empêchement',
    'Assurer la coordination entre les pôles et le suivi des projets transversaux',
    'Contribuer à la définition des orientations de l\'association',
    'Accompagner l\'intégration des nouveaux membres et veiller à la cohésion de l\'équipe',
    'Préparer la continuité de l\'association et l\'organisation des passations',
  ],
  secretaire: [
    'Organiser les réunions et les assemblées générales (convocations, ordres du jour)',
    'Rédiger les comptes rendus et procès-verbaux et en assurer l\'archivage',
    'Tenir à jour la liste des membres et les registres de l\'association',
    'Accomplir les formalités administratives, notamment les déclarations de modification auprès du greffe des associations',
    'Gérer la correspondance et la documentation administrative',
    'Veiller à la conformité du traitement des données personnelles des membres',
  ],
  secretaire_adjoint: [
    'Assister le ou la secrétaire dans l\'ensemble de ses missions',
    'Participer à la rédaction des comptes rendus et à l\'archivage des documents',
    'Contribuer à la tenue de la liste des membres et à l\'organisation des réunions',
    'Assurer la continuité du secrétariat en cas d\'absence du ou de la secrétaire',
  ],
  tresorier: [
    'Tenir la comptabilité de l\'association et conserver les pièces justificatives',
    'Élaborer le budget prévisionnel et en suivre l\'exécution',
    'Encaisser les cotisations et les recettes, et régler les dépenses engagées',
    'Gérer les relations avec la banque et suivre la trésorerie',
    'Présenter le rapport financier et les comptes annuels à l\'assemblée générale',
    'Préparer le volet financier des demandes de subvention',
  ],
  responsable_communication: [
    'Définir et piloter la stratégie de communication de l\'association',
    'Coordonner l\'équipe communication et planifier les publications',
    'Gérer les réseaux sociaux et veiller à la cohérence de l\'identité visuelle',
    'Promouvoir les événements et les actions de l\'association',
    'Suivre les indicateurs d\'audience et ajuster les actions de communication',
  ],
  membre_communication: [
    'Concevoir et publier des contenus (visuels, vidéos, textes) pour les réseaux sociaux',
    'Contribuer à la promotion des événements de l\'association',
    'Couvrir les événements (photo, vidéo, stories)',
    'Respecter la charte graphique et le planning éditorial du pôle',
  ],
  responsable_communication_interne: [
    'Organiser l\'information des étudiants et des membres sur la vie de l\'association',
    'Assurer le lien avec l\'établissement, les délégués et les autres associations étudiantes',
    'Gérer les supports de communication interne (affichage, messageries, lettres d\'information)',
    'Recueillir les attentes des étudiants et les relayer auprès du bureau',
    'Coordonner l\'équipe du pôle',
  ],
  membre_communication_interne: [
    'Diffuser les informations de l\'association auprès des étudiants',
    'Mettre à jour les supports d\'affichage et les canaux de messagerie',
    'Relayer les questions et suggestions des étudiants',
  ],
  responsable_projets: [
    'Piloter les projets de l\'association, de la conception au bilan',
    'Établir les rétroplannings et les budgets prévisionnels des projets',
    'Coordonner l\'équipe projets et répartir les tâches',
    'Assurer la coordination avec les autres pôles et les partenaires',
    'Réaliser le bilan de chaque projet et capitaliser les retours d\'expérience',
  ],
  membre_projets: [
    'Participer à la conception et à l\'organisation des projets de l\'association',
    'Prendre en charge des tâches logistiques et opérationnelles',
    'Contribuer au bilan des projets réalisés',
  ],
  responsable_sport: [
    'Organiser les activités et les rencontres sportives de l\'association',
    'Assurer le lien avec l\'association sportive, l\'établissement et les clubs partenaires',
    'Coordonner l\'équipe du pôle et gérer le matériel sportif',
    'Veiller à la sécurité des participants lors des activités',
    'Promouvoir la pratique sportive auprès des étudiants',
  ],
  membre_sport: [
    'Participer à l\'organisation des activités et des événements sportifs',
    'Accueillir et encadrer les participants',
    'Contribuer à la gestion du matériel',
  ],
  responsable_esport: [
    'Organiser des tournois et des événements e-sport, en présentiel ou en ligne',
    'Animer la communauté des joueurs et des joueuses',
    'Coordonner l\'équipe du pôle et la logistique technique',
    'Veiller au respect des règles de conduite et du fair-play',
    'Développer des partenariats en lien avec l\'e-sport',
  ],
  membre_esport: [
    'Participer à l\'organisation des tournois et des événements e-sport',
    'Contribuer à l\'animation de la communauté',
    'Assurer un appui technique lors des événements',
  ],
  responsable_partenariats: [
    'Définir la stratégie de partenariats et identifier des partenaires potentiels',
    'Prospecter, négocier et formaliser les partenariats (conventions, contreparties)',
    'Assurer le suivi de la relation avec les partenaires et le respect des engagements réciproques',
    'Rechercher des financements (sponsoring, mécénat, subventions) en lien avec le ou la trésorier(ère)',
    'Coordonner l\'équipe du pôle',
  ],
  membre_partenariats: [
    'Participer à la prospection de nouveaux partenaires',
    'Préparer les supports de présentation de l\'association',
    'Contribuer au suivi des partenariats en cours',
  ],
};

/**
 * Mission « métier » complémentaire déduite du libellé d'un rôle
 * personnalisé (ex. « Responsable Design » → supports visuels).
 */
const KEYWORD_MISSIONS = [
  [/design|graphi|visuel|cr[ée]a/i, 'Concevoir les supports visuels de l\'association dans le respect de son identité graphique'],
  [/vid[ée]o|montage|audiovisuel/i, 'Réaliser et monter les contenus vidéo de l\'association'],
  [/photo/i, 'Couvrir les événements en photographie et gérer la photothèque de l\'association'],
  [/web|num[ée]rique|digital|informatique|data/i, 'Administrer les outils numériques et le site web de l\'association'],
  [/logisti|mat[ée]riel|inventaire/i, 'Gérer la logistique, le matériel et l\'inventaire de l\'association'],
  [/[ée]v[ée]n|event|soir[ée]e|gala/i, 'Organiser des événements, de la réservation des lieux au bilan'],
  [/sport/i, 'Organiser des activités sportives en veillant à la sécurité des participants'],
  [/partena|sponsor|m[ée]c[ée]nat/i, 'Prospecter et suivre les partenaires de l\'association'],
  [/com(munication)?\b|r[ée]seaux|social/i, 'Produire et diffuser les contenus de communication de l\'association'],
  [/tr[ée]so|financ|budget/i, 'Contribuer au suivi budgétaire et à la gestion des dépenses'],
  [/secr[ée]t|administ/i, 'Contribuer au suivi administratif et à l\'archivage des documents'],
  [/int[ée]gration|parrain|accueil/i, 'Accueillir les nouveaux étudiants et faciliter leur intégration'],
  [/[ée]colo|durable|rse|environnement/i, 'Promouvoir des pratiques éco-responsables lors des actions de l\'association'],
];

/** « pôle Créatif » (évite « pôle Pôle Créatif »). */
export function poleNoun(poleLabel) {
  const label = String(poleLabel || '').trim();
  if (!label) return '';
  return /^p[ôo]le\b/i.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : `pôle ${label}`;
}

/**
 * Missions génériques d'un rôle personnalisé, à partir de son niveau
 * (kind) et du libellé de son pôle.
 * @param {'bureau'|'responsable'|'adjoint'|'membre'} kind
 * @param {string} poleLabel   libellé du pôle ('' si aucun)
 * @param {string} roleLabel   libellé du rôle ('' si aucun)
 * @param {boolean} isBureauPole  pôle « bureau » (direction)
 */
export function genericMissions(kind, poleLabel, roleLabel = '', isBureauPole = false) {
  const pole = isBureauPole ? '' : poleNoun(poleLabel);
  const ofPole = pole ? ` du ${pole}` : ' de l\'association';
  let base;
  switch (kind) {
    case 'bureau':
      base = [
        'Participer à la direction de l\'association au sein du bureau',
        'Contribuer aux décisions collégiales et à la définition des orientations',
        roleLabel ? `Exercer les attributions propres à la fonction de ${roleLabel}` : '',
        'Représenter l\'association lorsque le bureau le lui confie',
        'Rendre compte de son action au bureau et à l\'assemblée générale',
      ];
      break;
    case 'responsable':
      base = [
        `Piloter les activités${ofPole} et en définir les priorités`,
        `Coordonner et accompagner les membres${pole ? ` du ${pole}` : ' de l\'équipe'}`,
        'Planifier les actions et en suivre la réalisation',
        pole ? `Assurer le lien entre le ${pole} et le bureau` : 'Assurer le lien avec le bureau',
        'Rendre compte de l\'activité et en établir le bilan',
      ];
      break;
    case 'adjoint':
      base = [
        pole ? `Seconder le ou la responsable du ${pole} dans ses missions` : 'Seconder le ou la responsable dans ses missions',
        'Assurer la continuité des activités en cas d\'absence du ou de la responsable',
        'Prendre en charge les dossiers délégués et en rendre compte',
        'Participer à la coordination de l\'équipe',
      ];
      break;
    default:
      base = [
        `Participer aux activités et aux projets${ofPole}`,
        pole ? `Prendre en charge les tâches confiées par le ou la responsable du ${pole}` : 'Prendre en charge les tâches qui lui sont confiées',
        'Contribuer à la dynamique collective de l\'association',
      ];
  }
  const hint = `${roleLabel} ${poleLabel}`;
  const extra = KEYWORD_MISSIONS.find(([rx]) => rx.test(hint));
  const list = base.filter(Boolean);
  if (extra) list.splice(Math.min(1, list.length), 0, extra[1]);
  return list;
}

/** Compétences développées, par niveau (kind). */
export const KIND_SKILLS = {
  bureau: [
    'Leadership et prise de décision',
    'Pilotage de projets et animation d\'équipe',
    'Gestion administrative et budgétaire d\'une structure associative',
    'Communication institutionnelle et représentation',
    'Négociation et sens des responsabilités',
  ],
  responsable: [
    'Management et animation d\'équipe',
    'Gestion de projet (planification, budget, suivi)',
    'Organisation et priorisation',
    'Communication interpersonnelle et compte rendu d\'activité',
    'Autonomie et prise d\'initiative',
  ],
  adjoint: [
    'Coordination et suivi de dossiers',
    'Travail en équipe et coopération',
    'Organisation et rigueur',
    'Capacité d\'adaptation',
    'Prise d\'initiative',
  ],
  membre: [
    'Travail en équipe',
    'Sens de l\'engagement et fiabilité',
    'Organisation et gestion du temps',
    'Communication et aisance relationnelle',
    'Esprit d\'initiative',
  ],
};

/** Compétence « métier » ajoutée en tête pour certains rôles par défaut. */
export const ROLE_SKILLS = {
  president: 'Gouvernance associative et conduite du changement',
  tresorier: 'Comptabilité associative et suivi budgétaire',
  secretaire: 'Rédaction administrative et rigueur documentaire',
  secretaire_adjoint: 'Rédaction administrative et rigueur documentaire',
  responsable_communication: 'Stratégie de communication et gestion des réseaux sociaux',
  membre_communication: 'Création de contenus numériques',
  responsable_communication_interne: 'Communication interne et relations avec l\'établissement',
  responsable_projets: 'Gestion de projet événementiel',
  membre_projets: 'Organisation logistique d\'événements',
  responsable_sport: 'Organisation d\'événements sportifs et gestion de la sécurité',
  responsable_esport: 'Organisation de tournois et animation de communauté',
  responsable_partenariats: 'Prospection et négociation commerciale',
  membre_partenariats: 'Prospection et relation partenaires',
};

/** Qualités (groupes nominaux possessifs, sans accord de genre). */
export const KIND_QUALITIES = {
  bureau: [
    'son sens des responsabilités',
    'sa capacité à fédérer et à décider',
    'sa rigueur dans la conduite des dossiers',
    'sa maturité et son sens de l\'intérêt collectif',
  ],
  responsable: [
    'son sens de l\'organisation',
    'sa capacité à animer une équipe',
    'sa capacité à mener des projets à leur terme',
    'sa fiabilité',
  ],
  adjoint: [
    'sa fiabilité',
    'son esprit d\'équipe',
    'sa capacité d\'adaptation',
    'sa rigueur',
  ],
  membre: [
    'son implication',
    'son esprit d\'équipe',
    'sa fiabilité',
    'sa curiosité',
  ],
};

/** Responsabilités (lettre de mission), par niveau. */
export const KIND_RESPONSIBILITIES = {
  bureau: [
    'Participer aux réunions de bureau et aux décisions collégiales',
    'Rendre compte de son action au bureau et à l\'assemblée générale',
    'Respecter les statuts, le règlement intérieur et les décisions des instances',
    'N\'engager l\'association que dans la limite des pouvoirs prévus par les statuts',
    'Préparer la passation de ses fonctions en fin de mandat',
  ],
  responsable: [
    'Rendre compte régulièrement de l\'activité du pôle au bureau',
    'Soumettre au bureau toute dépense ou tout engagement au nom de l\'association',
    'Veiller à la bonne intégration des membres du pôle et au respect de la charte',
    'Préparer la passation de ses fonctions en fin de mandat',
  ],
  adjoint: [
    'Rendre compte au ou à la responsable de l\'avancement des dossiers délégués',
    'N\'engager l\'association (dépense, contrat, communication officielle) qu\'avec l\'accord préalable du bureau',
    'Participer aux réunions du pôle',
    'Contribuer à la passation en fin de mandat',
  ],
  membre: [
    'Participer aux réunions du pôle',
    'Rendre compte de l\'avancement des tâches confiées',
    'N\'engager l\'association (dépense, contrat, communication officielle) qu\'avec l\'accord préalable du bureau',
    'Respecter la charte d\'engagement du membre',
  ],
};

/** Éléments transmis lors d'une fin de fonctions (par rôle + communs). */
export function handoverItems(roleId, poleId) {
  const items = [
    'Dossiers et documents de travail liés à la fonction',
    'Accès aux espaces de stockage partagés (Drive)',
    'Identifiants des comptes et outils utilisés (transmis hors de ce document, puis modifiés)',
  ];
  const specific = {
    president: ['Documents officiels de l\'association (statuts, récépissés de déclaration, conventions en cours)'],
    vice_president: ['Suivi des projets transversaux en cours'],
    tresorier: ['Pièces comptables, relevés bancaires et justificatifs', 'Moyens de paiement et accès bancaires'],
    secretaire: ['Registres, procès-verbaux et liste des membres'],
    secretaire_adjoint: ['Documents de secrétariat en cours'],
  }[roleId];
  const byPole = {
    communication: ['Accès aux réseaux sociaux et charte graphique'],
    communication_interne: ['Listes de diffusion et supports d\'affichage'],
    partenariats: ['Conventions en cours et fichier des contacts partenaires'],
    projets: ['Rétroplannings et bilans des projets'],
    event: ['Rétroplannings et bilans des événements'],
    sport: ['Inventaire du matériel sportif'],
    esport: ['Accès aux serveurs et plateformes de jeu'],
  }[poleId];
  return [...(specific || byPole || []), ...items];
}

/** Étapes de passation (checklist du dossier de passation). */
export function handoverSteps(roleId) {
  const steps = [
    'Présenter le poste, ses missions et les dossiers en cours',
    'Remettre les documents, archives et matériel liés à la fonction',
    'Ouvrir les accès Drive du ou de la successeur(e) et retirer ceux du ou de la titulaire sortant(e)',
    'Transmettre les comptes et outils, puis en modifier les mots de passe',
    'Présenter le ou la successeur(e) aux partenaires et contacts clés',
    'Mettre à jour la fiche membre et les rôles dans BDE Manager',
  ];
  const specific = {
    president: [
      'Déclarer le changement de dirigeants au greffe des associations dans les trois mois (loi du 1er juillet 1901)',
      'Mettre à jour les interlocuteurs auprès de l\'établissement et de la banque',
    ],
    tresorier: [
      'Mettre à jour les pouvoirs bancaires (signature, moyens de paiement)',
      'Arrêter la situation de trésorerie à la date de passation',
    ],
    secretaire: ['Transmettre les registres, les procès-verbaux et la liste des membres'],
    vice_president: ['Transmettre le suivi des projets transversaux'],
  }[roleId];
  return [...steps.slice(0, 4), ...(specific || []), ...steps.slice(4)];
}

/** Valeurs de la charte d'engagement. */
export const CHARTER_VALUES = [
  'Respect et bienveillance envers chacun et chacune',
  'Solidarité et entraide',
  'Engagement et fiabilité',
  'Ouverture, inclusion et non-discrimination',
  'Transparence et intérêt collectif',
];

/** Engagements de la charte : [titre, texte]. */
export const CHARTER_COMMITMENTS = [
  ['Respect', 'Je m\'engage à adopter en toutes circonstances une attitude respectueuse et bienveillante envers les membres, les étudiants, le personnel de l\'établissement et les partenaires. Je proscris toute forme de discrimination, de harcèlement ou de bizutage, et j\'adopte un comportement responsable lors des événements, notamment en matière de consommation d\'alcool.'],
  ['Assiduité et fiabilité', 'Je m\'engage à participer aux réunions auxquelles je suis convié(e), à prévenir en cas d\'absence, à tenir les délais convenus et à rendre compte de l\'avancement des tâches qui me sont confiées.'],
  ['Confidentialité', 'Je m\'engage à ne pas divulguer les informations internes dont j\'ai connaissance dans le cadre de mon engagement (échanges du bureau, données des membres, informations financières, négociations avec les partenaires), y compris après la fin de mon engagement.'],
  ['Image de l\'association', 'Je m\'engage à ne pas m\'exprimer au nom de l\'association sans y avoir été autorisé(e) et à veiller à ce que mon comportement, notamment sur les réseaux sociaux, ne porte pas atteinte à son image ni à celle de l\'établissement.'],
  ['Usage des comptes et des outils', 'Je m\'engage à utiliser les comptes, réseaux sociaux, espaces de stockage et outils de l\'association exclusivement pour ses activités, à ne jamais communiquer mes accès à des tiers, et à ne pas modifier un mot de passe ou un paramètre de sécurité sans en informer le bureau.'],
  ['Protection des données personnelles', 'Je m\'engage à ne traiter les données personnelles auxquelles j\'ai accès (membres, participants, partenaires) que pour les besoins de l\'association, à ne pas les extraire ni les conserver à titre personnel, et à respecter le règlement général sur la protection des données (règlement (UE) 2016/679).'],
  ['Fin d\'engagement', 'En cas de départ, je m\'engage à prévenir le bureau, à assurer la passation des dossiers en cours, à restituer les documents et le matériel qui m\'ont été confiés et à cesser d\'utiliser les accès de l\'association, qui me seront retirés.'],
];

/** Engagements de l'association envers le membre. */
export const CHARTER_ASSOCIATION_COMMITMENTS = [
  'Accueillir le membre et lui présenter le fonctionnement de l\'association',
  'L\'associer aux décisions qui concernent ses missions et l\'informer de la vie de l\'association',
  'L\'accompagner dans ses missions et favoriser le développement de ses compétences',
  'Reconnaître son engagement, notamment par la délivrance d\'une attestation sur demande',
  'Protéger ses données personnelles et respecter sa vie privée',
];

/** Moyens de paiement (reçu de cotisation). */
export const PAYMENT_METHODS = [
  { value: 'especes', label: 'Espèces' },
  { value: 'virement', label: 'Virement bancaire' },
  { value: 'cheque', label: 'Chèque' },
  { value: 'carte', label: 'Carte bancaire' },
  { value: 'helloasso', label: 'HelloAsso (paiement en ligne)' },
  { value: 'autre', label: 'Autre' },
];
