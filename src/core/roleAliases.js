// ============================================================
// MAPPING DES ANCIENNES TAXONOMIES → IDs CANONIQUES
// ============================================================

import { normalizeKey } from '../roleEngine/normalizer.js';

const SEED_ALIASES = {
  'Président':              'president',
  'Vice-Président':         'vice_president',
  'Trésorier':              'tresorier',
  'Secrétaire Général':     'secretaire',
  'Respo Com':              'responsable_communication',
  'Respo Com Interne':      'responsable_communication_interne',
  'Respo Insta':            'membre_communication',
  'Respo TikTok':           'membre_communication',
  'Respo Event':            'responsable_projets',
  'Respo Partenariat':      'responsable_partenariats',
  'Respo Sport':            'responsable_sport',
  'Respo Projet':           'responsable_projets',
  'Chargé de projet Com':   'membre_communication',
  'Chargé de projet Event': 'membre_projets',
  'Membre Com':             'membre_communication',
  'Membre Event':           'membre_projets',
  'Membre Projet':          'membre_projets',
  'Membre':                 'membre_communication',
  'Admin':                  'president',
};

const ENGINE_ALIASES = {
  'president(e)':           'president',
  'president':              'president',
  'vice-president(e)':      'vice_president',
  'vice-president':         'vice_president',
  'secretaire':             'secretaire',
  'secretaire adjoint(e)':  'secretaire_adjoint',
  'secretaire adjoint':     'secretaire_adjoint',
  'tresorier(ere)':         'tresorier',
  'tresorier':              'tresorier',
  'responsable communication':         'responsable_communication',
  'responsable com':                    'responsable_communication',
  'responsable com. interne':           'responsable_communication_interne',
  'responsable communication interne':  'responsable_communication_interne',
  'responsable projets':                'responsable_projets',
  'responsable sport':                  'responsable_sport',
  'responsable e-sport':                'responsable_esport',
  'responsable esport':                 'responsable_esport',
  'responsable partenariats':           'responsable_partenariats',
  'responsable partenariat':            'responsable_partenariats',
  'membre communication':               'membre_communication',
  'membre com':                         'membre_communication',
  'membre communication interne':       'membre_communication_interne',
  'membre com. interne':                'membre_communication_interne',
  'membre projets':                     'membre_projets',
  'membre projet':                      'membre_projets',
  'membre sport':                       'membre_sport',
  'membre e-sport':                     'membre_esport',
  'membre esport':                      'membre_esport',
  'membre partenariats':                'membre_partenariats',
  'membre partenariat':                 'membre_partenariats',
};

const ALL_ALIASES = { ...SEED_ALIASES, ...ENGINE_ALIASES };

const NORMALIZED_ALIASES = Object.fromEntries(
  Object.entries(ALL_ALIASES).map(([k, v]) => [normalizeKey(k), v])
);

export function resolveRoleId(raw) {
  if (!raw) return null;
  const key = normalizeKey(raw);
  if (!key) return null;

  if (NORMALIZED_ALIASES[key]) return NORMALIZED_ALIASES[key];

  for (const [alias, id] of Object.entries(NORMALIZED_ALIASES)) {
    if (key.includes(alias)) return id;
  }

  if (key.includes('president')) return 'president';
  if (key.includes('vice')) return 'vice_president';
  if (key.includes('tresorier')) return 'tresorier';
  if (key.includes('secretaire adjoint')) return 'secretaire_adjoint';
  if (key.includes('secretaire')) return 'secretaire';

  if (key.includes('communication interne') && key.startsWith('responsable')) return 'responsable_communication_interne';
  if (key.includes('communication interne')) return 'membre_communication_interne';
  if (key.includes('communication') && key.startsWith('responsable')) return 'responsable_communication';
  if (key.includes('communication')) return 'membre_communication';

  if (key.includes('projet') && key.startsWith('responsable')) return 'responsable_projets';
  if (key.includes('projet')) return 'membre_projets';

  if (key.includes('partenariat') && key.startsWith('responsable')) return 'responsable_partenariats';
  if (key.includes('partenariat')) return 'membre_partenariats';

  if (key.includes('sport') && key.startsWith('responsable')) return 'responsable_sport';
  if (key.includes('sport')) return 'membre_sport';

  if ((key.includes('e-sport') || key.includes('esport')) && key.startsWith('responsable')) return 'responsable_esport';
  if (key.includes('e-sport') || key.includes('esport')) return 'membre_esport';

  return null;
}

export function migrateMemberRole(member) {
  if (!member) return member;
  const canonical = resolveRoleId(member.mainRole);
  if (!canonical) return member;
  return {
    ...member,
    legacyMainRole: member.legacyMainRole || member.mainRole,
    mainRole: canonical,
  };
}

export function migratePresets(presets) {
  const result = {};
  Object.entries(presets || {}).forEach(([key, value]) => {
    const canonical = resolveRoleId(key);
    if (canonical) result[canonical] = value;
  });
  return result;
}