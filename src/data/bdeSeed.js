// ============================================================
// Configuration officielle du BDE IUT Montreuil
// ============================================================
// ⚠️ Les rôles (`mainRole`) et les clés de presets sont les LIBELLÉS
// historiques. Ils sont convertis en ids du catalogue au chargement
// (voir src/components/members/seedConversion.js → buildConvertedBDEConfig).

export const BDE_COLUMNS = [
  { id: 'direction',  title: '🏛️ Bureau & Direction' },
  { id: 'com',        title: '📣 Pôle Communication' },
  { id: 'event',      title: '🎉 Pôle Événementiel' },
  { id: 'part',       title: '🤝 Pôle Partenariat' },
  { id: 'transverse', title: '🧩 Membres transversaux' },
];

/** Prénom utilisé pour les postes non pourvus (exclus du décompte des membres). */
export const VACANT_FIRST_NAME = '[Poste vacant]';

export const BDE_MEMBERS = [
  // ========== BUREAU ==========
  { id: 'bde_kenzo',   firstName: 'Kenzo',    lastName: '',              email: '', mainRole: 'Président',          badges: ['Président', 'Accès Banque', 'Accès Drive', 'Super Admin'], columnId: 'direction',  notes: 'Super Admin communauté WhatsApp' },
  { id: 'bde_bilal',   firstName: 'Bilal',    lastName: '',              email: '', mainRole: 'Trésorier',          badges: ['Trésorier', 'Accès Banque'],                               columnId: 'direction',  notes: '' },
  { id: 'bde_thainam',  firstName: 'Minh Anh',  lastName: '',              email: '', mainRole: 'Secrétaire Général',  badges: ['Secrétaire Général', 'Accès Drive'],                       columnId: 'direction',  notes: '' },
  { id: 'bde_vp',       firstName: VACANT_FIRST_NAME, lastName: '',        email: '', mainRole: 'Vice-Président',      badges: [],                                                          columnId: 'direction',  notes: 'À pourvoir' },

  // ========== PÔLE COMMUNICATION ==========
  { id: 'bde_capucine',       firstName: 'Capucine',   lastName: 'Fontanel',          email: '', mainRole: 'Respo Com',             badges: ['Respo Com', 'Respo Com Globale', 'Accès Insta', 'Accès TikTok', 'Membre Com'], columnId: 'com', notes: 'Responsable Com Globale' },
  { id: 'bde_albane',        firstName: 'Albane',    lastName: '',                  email: '', mainRole: 'Respo Com Interne',     badges: ['Respo Com Interne', 'Membre Com'],                                                columnId: 'com', notes: 'Responsable Com Interne (IUT/terrain)' },
  { id: 'bde_clarisse_insta',  firstName: 'Clarisse',    lastName: '',                  email: '', mainRole: 'Respo Insta',           badges: ['Respo Insta', 'Accès Insta', 'Membre Com'],                                       columnId: 'com', notes: '' },
  { id: 'bde_ilona',         firstName: 'Ilona',     lastName: '',                  email: '', mainRole: 'Respo TikTok',          badges: ['Respo TikTok', 'Accès TikTok', 'Membre Com'],                                     columnId: 'com', notes: '' },
  { id: 'bde_berenice',       firstName: 'Bérénice',   lastName: '',                  email: '', mainRole: 'Chargé de projet Com',  badges: ['Chargé de projet Com', 'Membre Com'],                                             columnId: 'com', notes: '' },
  { id: 'bde_lison',      firstName: 'Lison',  lastName: '',                  email: '', mainRole: 'Chargé de projet Com',  badges: ['Chargé de projet Com', 'Membre Com'],                                             columnId: 'com', notes: '' },
  { id: 'bde_gaspard',         firstName: 'Gaspard',     lastName: '',                  email: '', mainRole: 'Chargé de projet Com',  badges: ['Chargé de projet Com', 'Membre Com'],                                             columnId: 'com', notes: '' },
  { id: 'bde_ophélie',       firstName: 'Ophélie',   lastName: '',                  email: '', mainRole: 'Chargé de projet Com',  badges: ['Chargé de projet Com', 'Membre Com'],                                             columnId: 'com', notes: '' },

  // ========== PÔLE ÉVÉNEMENTIEL ==========
  { id: 'bde_jade',      firstName: 'Jade',     lastName: '',                    email: '', mainRole: 'Respo Event',            badges: ['Respo Event', 'Membre Event'],     columnId: 'event', notes: 'Responsable Événementiel' },
  { id: 'bde_maelys',   firstName: 'Maelys',  lastName: 'IUT',                 email: '', mainRole: 'Respo Sport',            badges: ['Respo Sport', 'Membre Event'],     columnId: 'event', notes: 'Responsable Sport' },
  { id: 'bde_salma',   firstName: 'Salma',  lastName: 'INFO BDE Sport',      email: '', mainRole: 'Chargé de projet Event', badges: ['Chargé de projet Event', 'Membre Event', 'Sport'], columnId: 'event', notes: 'Projet Sport' },
  { id: 'bde_noam',      firstName: 'Noam',     lastName: 'INFO BDE Projet',     email: '', mainRole: 'Chargé de projet Event', badges: ['Chargé de projet Event', 'Membre Event'],          columnId: 'event', notes: '' },

  // ========== PÔLE PARTENARIAT ==========
  { id: 'bde_sophia', firstName: 'Sophia', lastName: '(DELORME)', email: '', mainRole: 'Respo Partenariat', badges: ['Respo Partenariat', 'Accès Banque'], columnId: 'part', notes: 'Responsable Partenariat' },

  // ========== MEMBRES TRANSVERSAUX ==========
  { id: 'bde_adrien',        firstName: 'Adrien',       lastName: 'BDE Info',              email: '', mainRole: 'Membre', badges: ['Membre', 'Accès Drive'], columnId: 'transverse', notes: '' },
  { id: 'bde_maxence',      firstName: 'Maxence',     lastName: 'BDE PROJET KABEYA',    email: '', mainRole: 'Membre', badges: ['Membre', 'Membre Projet'], columnId: 'transverse', notes: 'Projet KABEYA' },
  { id: 'bde_clarisse_vasseur',firstName: 'Clarisse',      lastName: 'BDE PROJET Vasseur',     email: '', mainRole: 'Membre', badges: ['Membre', 'Membre Projet'], columnId: 'transverse', notes: 'Projet Vasseur' },
  { id: 'bde_valentin',     firstName: 'Valentin',    lastName: 'Esteves IUT',           email: '', mainRole: 'Membre', badges: ['Ancien Membre', 'Accès Drive'], columnId: 'transverse', notes: 'Ancien Resp. Com — Passation en cours' },
  { id: 'bde_anis',  firstName: 'Anis', lastName: 'IUT MEZIANE',          email: '', mainRole: 'Membre', badges: ['Membre'],                  columnId: 'transverse', notes: '' },
  { id: 'bde_elif',      firstName: 'Elif',     lastName: 'BDE QLIO',              email: '', mainRole: 'Membre', badges: ['Membre'],                  columnId: 'transverse', notes: '' },
];

// ============================================================
// Presets de permissions par rôle (mappés sur les IDs de dossiers)
// Clés = libellés historiques (convertis en ids au chargement).
// ============================================================
export const BDE_ROLE_PERMISSIONS = {
  'Président': {
    'f00': 'editor', 'f00.1': 'editor', 'f00.2': 'editor', 'f00.3': 'editor',
    'f01': 'editor', 'f01.1': 'editor', 'f01.2': 'editor', 'f01.3': 'editor',
    'f01.3.1': 'editor', 'f01.3.2': 'editor', 'f01.4': 'editor', 'f01.5': 'editor',
    'f02': 'editor', 'f02.1': 'editor', 'f02.2': 'editor', 'f02.3': 'editor',
    'f03': 'editor', 'f03.1': 'editor', 'f03.2': 'editor', 'f03.3': 'editor',
    'f04': 'editor',
  },
  'Vice-Président': {
    'f00': 'editor', 'f00.1': 'editor', 'f00.3': 'editor',
    'f01': 'reader', 'f02': 'reader', 'f03': 'reader', 'f04': 'reader',
  },
  'Trésorier': {
    'f00': 'editor', 'f00.1': 'editor', 'f00.2': 'editor', 'f00.3': 'editor',
    'f01': 'reader', 'f02': 'reader', 'f03': 'reader', 'f04': 'reader',
  },
  'Secrétaire Général': {
    'f00': 'editor', 'f00.1': 'editor', 'f00.3': 'editor',
    'f01': 'reader', 'f02': 'reader', 'f03': 'reader', 'f04': 'reader',
  },
  'Respo Com': {
    'f01': 'editor', 'f01.1': 'editor', 'f01.2': 'editor', 'f01.3': 'editor',
    'f01.3.1': 'editor', 'f01.3.2': 'editor', 'f01.4': 'editor', 'f01.5': 'editor',
    'f02': 'reader', 'f03': 'reader', 'f04': 'reader',
  },
  'Respo Com Interne': {
    'f01': 'reader', 'f01.2': 'editor', 'f01.4': 'editor',
    'f02': 'reader', 'f03': 'reader', 'f04': 'reader',
  },
  'Respo Insta': {
    'f01': 'reader', 'f01.1': 'reader', 'f01.2': 'reader', 'f01.3': 'reader',
    'f01.3.1': 'editor', 'f01.4': 'editor', 'f01.5': 'reader',
  },
  'Respo TikTok': {
    'f01': 'reader', 'f01.1': 'reader', 'f01.2': 'reader', 'f01.3': 'reader',
    'f01.3.2': 'editor', 'f01.4': 'editor', 'f01.5': 'reader',
  },
  'Chargé de projet Com': {
    'f01': 'reader', 'f01.4': 'reader',
  },
  'Respo Event': {
    'f02': 'editor', 'f02.1': 'editor', 'f02.2': 'editor', 'f02.3': 'editor',
    'f01': 'reader', 'f03': 'reader', 'f04': 'editor',
  },
  'Respo Sport': {
    'f02': 'editor', 'f02.1': 'editor', 'f02.2': 'editor', 'f02.3': 'editor',
    'f04': 'editor',
  },
  'Chargé de projet Event': {
    'f02': 'reader', 'f04': 'reader',
  },
  'Respo Partenariat': {
    'f03': 'editor', 'f03.1': 'editor', 'f03.2': 'editor', 'f03.3': 'editor',
    'f00': 'reader', 'f01': 'reader', 'f02': 'reader',
  },
  'Membre': {
    'f01': 'reader',
  },
};

// ============================================================
// Presets officiels ajoutés / mis à jour au chargement
// ============================================================
export const BDE_NEW_PRESETS = {
  'Respo Com Interne':      BDE_ROLE_PERMISSIONS['Respo Com Interne'],
  'Chargé de projet Com':   BDE_ROLE_PERMISSIONS['Chargé de projet Com'],
  'Chargé de projet Event': BDE_ROLE_PERMISSIONS['Chargé de projet Event'],
  'Vice-Président':         BDE_ROLE_PERMISSIONS['Vice-Président'],
};

/** Chiffres affichés dans le bandeau (calculés, jamais codés en dur). */
export function bdeSeedSummary() {
  const vacancies = BDE_MEMBERS.filter(m => m.firstName === VACANT_FIRST_NAME).length;
  return {
    members: BDE_MEMBERS.length - vacancies,
    vacancies,
    columns: BDE_COLUMNS.length,
  };
}

// ============================================================
// Construction de la config BRUTE (libellés historiques)
// ============================================================
// Les permissions Drive individuelles sont calculées à partir du libellé
// d'origine : deux rôles fusionnés dans le même id (ex. Respo Insta /
// Respo TikTok → membre_communication) gardent leurs accès spécifiques.
export function buildBDEConfig() {
  const members = BDE_MEMBERS.map(m => ({ ...m, badges: [...m.badges] }));
  const columns = BDE_COLUMNS.map(c => ({ ...c }));
  const drivePermissions = {};

  members.forEach(m => {
    const preset = BDE_ROLE_PERMISSIONS[m.mainRole];
    if (preset) {
      drivePermissions[m.id] = { ...preset };
    }
  });

  return { members, columns, drivePermissions };
}
