// ============================================================
// MAPPING DES ANCIENNES TAXONOMIES → IDs CANONIQUES
// ============================================================
// Utilisé par les migrations (membres, presets Drive) et le chargement du
// seed BDE. Le résolveur est « catalogue-aware » : il ne renvoie jamais un
// id absent du catalogue fourni, et reconnaît les libellés / alias des
// rôles personnalisés créés depuis l'interface.

import { normalizeKey } from '../roleEngine/normalizer.js';
import { getActiveCatalog } from './catalog.js';

// Libellés historiques (seed BDE, saisies libres de l'ancienne version).
const LEGACY_ALIASES = {
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

const NORMALIZED_LEGACY = Object.fromEntries(
  Object.entries(LEGACY_ALIASES).map(([k, v]) => [normalizeKey(k), v])
);

// Règles par mots-clés, de la plus spécifique à la plus générale.
// ⚠️ L'ordre compte : « vice président » avant « président »,
// « e-sport » avant « sport », « com interne » avant « com ».
const KEYWORD_RULES = [
  { test: k => /\bvice\b/.test(k) || /\bpresident(e)?\s+adjoint/.test(k), id: 'vice_president' },
  { test: k => /\bpresident/.test(k), id: 'president' },
  { test: k => /\btresorier/.test(k), id: 'tresorier' },
  { test: k => /\bsecretaire\s+adjoint/.test(k), id: 'secretaire_adjoint' },
  { test: k => /\bsecretaire/.test(k), id: 'secretaire' },
  { test: k => /\b(e\s?sport|esport)/.test(k), lead: 'responsable_esport', member: 'membre_esport' },
  { test: k => /\bsport/.test(k), lead: 'responsable_sport', member: 'membre_sport' },
  { test: k => /\bcom(munication|\b)\s*interne/.test(k), lead: 'responsable_communication_interne', member: 'membre_communication_interne' },
  { test: k => /\bcom(munication)?\b/.test(k), lead: 'responsable_communication', member: 'membre_communication' },
  { test: k => /\bpartenariat/.test(k), lead: 'responsable_partenariats', member: 'membre_partenariats' },
  { test: k => /\bprojets?\b/.test(k), lead: 'responsable_projets', member: 'membre_projets' },
];

const isLeadKey = (k) => /^(respo|responsable|resp)\b/.test(k);

/**
 * Convertit un libellé libre en id de rôle du catalogue.
 * @param {string} raw
 * @param {{roles: object}} [catalog]
 * @returns {string|null}
 */
export function resolveRoleId(raw, catalog = getActiveCatalog()) {
  if (!raw || typeof raw !== 'string') return null;
  const roles = catalog?.roles || {};
  const exists = (id) => (id && roles[id] ? id : null);

  // 1. Déjà un id valide.
  if (roles[raw]) return raw;

  const key = normalizeKey(raw);
  if (!key) return null;

  // 2. Libellé ou alias exact d'un rôle du catalogue (inclut les rôles custom).
  for (const role of Object.values(roles)) {
    if (normalizeKey(role.label) === key) return role.id;
    if ((role.aliases || []).some(a => normalizeKey(a) === key)) return role.id;
  }

  // 3. Libellés historiques exacts.
  if (exists(NORMALIZED_LEGACY[key])) return NORMALIZED_LEGACY[key];

  // 4. Règles par mots-clés.
  for (const rule of KEYWORD_RULES) {
    if (!rule.test(key)) continue;
    const id = rule.id || (isLeadKey(key) ? rule.lead : rule.member);
    return exists(id);
  }
  return null;
}

/** Migre le rôle principal d'un membre vers un id (conserve l'ancien libellé). */
export function migrateMemberRole(member, catalog = getActiveCatalog()) {
  if (!member || !member.mainRole) return member;
  const canonical = resolveRoleId(member.mainRole, catalog);
  if (!canonical || canonical === member.mainRole) return member;
  return {
    ...member,
    legacyMainRole: member.legacyMainRole || member.mainRole,
    mainRole: canonical,
  };
}

/**
 * Migre les clés des presets Drive vers des ids de rôles.
 * Aucune perte : une clé non résolue, ou qui entrerait en collision avec un
 * preset déjà présent pour le même rôle, est conservée telle quelle (elle
 * apparaîtra comme « preset hors catalogue » dans l'interface).
 */
export function migratePresets(presets, catalog = getActiveCatalog()) {
  const entries = Object.entries(presets || {});
  const result = {};
  // Passe 1 : clés déjà canoniques (prioritaires).
  entries.forEach(([key, value]) => {
    if (catalog?.roles?.[key]) result[key] = value;
  });
  // Passe 2 : libellés à convertir.
  entries.forEach(([key, value]) => {
    if (catalog?.roles?.[key]) return;
    const canonical = resolveRoleId(key, catalog);
    if (canonical && !(canonical in result)) result[canonical] = value;
    else if (!(key in result)) result[key] = value;
  });
  return result;
}
