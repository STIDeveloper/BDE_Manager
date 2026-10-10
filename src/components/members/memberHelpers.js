// ============================================================
// HELPERS PURS — membres (formulaire, filtres, exports, stats)
// ============================================================
// Aucune dépendance React / Zustand : testables sous Node
// (voir memberHelpers.test.js). Les composants leur passent les maps
// brutes du catalogue ({ roles, poles }) issues de useCatalog().

import { listPoles, listRoles, poleColorHex } from '../../core/catalog.js';

/** Valeurs spéciales du filtre « rôle » (jamais des ids de rôle valides). */
export const ROLE_FILTER_NONE = '__none__';
export const ROLE_FILTER_LEGACY = '__legacy__';

// ------------------------------------------------------------
// RÔLES
// ------------------------------------------------------------

/** true si le membre a un rôle texte libre absent du catalogue. */
export function hasOffCatalogRole(member, roles) {
  return !!(member?.mainRole && !roles?.[member.mainRole]);
}

/** true si le membre n'a pas de rôle du catalogue mais un ancien libellé (ou un rôle hors catalogue). */
export function hasLegacyRole(member, roles) {
  if (!member) return false;
  if (hasOffCatalogRole(member, roles)) return true;
  return !member.mainRole && !!member.legacyMainRole;
}

/**
 * Libellé lisible du rôle principal : libellé du catalogue, sinon texte
 * libre historique. Ne renvoie PAS legacyMainRole quand le rôle est vide
 * (le membre n'a réellement plus de rôle).
 */
export function roleText(member, roles) {
  if (!member?.mainRole) return '';
  return roles?.[member.mainRole]?.label || member.mainRole;
}

/** Couleur hex du pôle du rôle principal (null si hors catalogue / sans rôle). */
export function rolePoleColor(member, catalog) {
  const role = catalog?.roles?.[member?.mainRole];
  if (!role) return null;
  return poleColorHex(catalog?.poles?.[role.pole]?.color);
}

/**
 * Options du sélecteur de rôle, groupées par pôle (ordre du catalogue).
 * @param {{poles: object, levels?: object, roles: object}} catalog
 * @param {string} [initialRole] rôle du membre à l'ouverture du formulaire
 * @returns {{ groups: {pole: object, roles: object[]}[], legacy: string|null }}
 *   `legacy` : ancien rôle texte libre à conserver comme option.
 */
export function buildRoleOptions(catalog, initialRole = '') {
  const roleList = listRoles(catalog);
  const groups = listPoles(catalog)
    .map(pole => ({ pole, roles: roleList.filter(r => r.pole === pole.id) }))
    .filter(g => g.roles.length > 0);
  // Rôles rattachés à un pôle inconnu (ne devrait pas arriver après normalisation).
  const known = new Set(groups.flatMap(g => g.roles.map(r => r.id)));
  const orphans = roleList.filter(r => !known.has(r.id));
  if (orphans.length) groups.push({ pole: { id: '__other__', label: 'Autres rôles' }, roles: orphans });
  const legacy = initialRole && !catalog?.roles?.[initialRole] ? initialRole : null;
  return { groups, legacy };
}

// ------------------------------------------------------------
// FORMULAIRE MEMBRE
// ------------------------------------------------------------

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** @returns {Record<string,string>} erreurs par champ (objet vide si valide). */
export function validateMemberForm(form) {
  const errors = {};
  if (!String(form?.firstName || '').trim()) errors.firstName = 'Le prénom est obligatoire.';
  const email = String(form?.email || '').trim();
  if (email && !EMAIL_RX.test(email)) errors.email = 'Adresse email invalide (ex. prenom.nom@gmail.com).';
  return errors;
}

/** Données normalisées envoyées au store (champs éditables uniquement). */
export function toMemberPayload(form) {
  return {
    firstName: String(form.firstName || '').trim(),
    lastName: String(form.lastName || '').trim(),
    email: String(form.email || '').trim(),
    mainRole: form.mainRole || '',
    columnId: form.columnId || '',
    notes: form.notes || '',
    badges: Array.isArray(form.badges) ? form.badges : [],
  };
}

export const memberDisplayName = (m) =>
  [m?.firstName, m?.lastName].filter(s => s && String(s).trim()).join(' ') || 'Ce membre';

// ------------------------------------------------------------
// RECHERCHE / FILTRES (utilisés par App.jsx)
// ------------------------------------------------------------

/** Texte de recherche d'un membre (le rôle est cherché par LIBELLÉ, pas par id). */
export function memberSearchText(member, roles) {
  return [
    member?.firstName, member?.lastName, roleText(member, roles), member?.legacyMainRole,
    ...(member?.badges || []), member?.notes,
  ].filter(Boolean).join(' \n ').toLowerCase();
}

export function memberMatchesRole(member, roleFilter, roles) {
  if (!roleFilter) return true;
  if (roleFilter === ROLE_FILTER_NONE) return !member?.mainRole;
  if (roleFilter === ROLE_FILTER_LEGACY) return hasOffCatalogRole(member, roles);
  return member?.mainRole === roleFilter;
}

/** Applique { search, role, badge, columnId } à un membre. */
export function memberMatchesFilters(member, filters, roles) {
  const s = String(filters?.search || '').trim().toLowerCase();
  if (s && !memberSearchText(member, roles).includes(s)) return false;
  if (!memberMatchesRole(member, filters?.role, roles)) return false;
  if (filters?.badge && !(member?.badges || []).includes(filters.badge)) return false;
  if (filters?.columnId && member?.columnId !== filters.columnId) return false;
  return true;
}

/** Libellé lisible d'une valeur du filtre rôle (pour les exports). */
export function roleFilterLabel(roleFilter, roles) {
  if (!roleFilter) return '';
  if (roleFilter === ROLE_FILTER_NONE) return 'Sans rôle';
  if (roleFilter === ROLE_FILTER_LEGACY) return 'Rôle hors catalogue';
  return roles?.[roleFilter]?.label || roleFilter;
}

// ------------------------------------------------------------
// EXPORT WHATSAPP D'UNE COLONNE
// ------------------------------------------------------------

/** Texte WhatsApp d'une colonne — jamais de « undefined ». */
export function columnWhatsAppText(column, members, roles) {
  const lines = (members || []).map(m => {
    let line = `• *${memberDisplayName(m)}*`;
    const role = roleText(m, roles);
    if (role) line += ` — ${role}`;
    const badges = (m.badges || []).filter(Boolean);
    if (badges.length) line += ` (Badges : ${badges.join(', ')})`;
    return line;
  });
  const title = column?.title || 'Colonne';
  const body = lines.length ? lines.join('\n') : '_Aucun membre_';
  return `📋 *${title}* (${lines.length})\n\n${body}\n`;
}

/** Nom de fichier sûr (Windows / mobile) à partir d'un titre libre. */
export function safeFileName(title, fallback = 'export') {
  const s = String(title || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\- ]+/g, ' ').trim().replace(/\s+/g, '_').slice(0, 60);
  return s || fallback;
}

// ------------------------------------------------------------
// STATISTIQUES
// ------------------------------------------------------------

const sortCounts = (list) => list.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr'));

/**
 * @returns {{
 *   total: number, withoutRole: number, offCatalog: number, legacyOnly: number,
 *   byColumn: {key,label,count}[], byPole: {key,label,count,color}[],
 *   byRole: {key,label,count,color}[], byBadge: {key,label,count}[],
 *   totalBadges: number,
 * }}
 */
export function computeMemberStats(members, catalog, columns = []) {
  const roles = catalog?.roles || {};
  const poles = catalog?.poles || {};
  const list = Array.isArray(members) ? members : [];

  const byColumn = columns.map(c => ({
    key: c.id, label: c.title, count: list.filter(m => m.columnId === c.id).length,
  }));
  const orphanCol = list.filter(m => !columns.some(c => c.id === m.columnId)).length;
  if (orphanCol) byColumn.push({ key: '__nocol__', label: 'Sans colonne', count: orphanCol });

  const poleMap = new Map();
  const roleMap = new Map();
  const badgeMap = new Map();
  let withoutRole = 0, offCatalog = 0, legacyOnly = 0, totalBadges = 0;

  list.forEach(m => {
    const role = roles[m.mainRole];
    if (!m.mainRole) {
      withoutRole++;
      if (m.legacyMainRole) legacyOnly++;
    } else if (!role) {
      offCatalog++;
    }

    // Par pôle (via le rôle du catalogue)
    const poleKey = role ? role.pole : (m.mainRole ? '__offcat__' : '__none__');
    if (!poleMap.has(poleKey)) {
      const pole = poles[poleKey];
      poleMap.set(poleKey, {
        key: poleKey,
        label: pole ? pole.label : (poleKey === '__offcat__' ? 'Rôle hors catalogue' : 'Sans rôle'),
        color: pole ? poleColorHex(pole.color) : null,
        count: 0,
      });
    }
    poleMap.get(poleKey).count++;

    // Par rôle (libellé)
    const roleKey = role ? role.id : (m.mainRole ? `__offcat__:${m.mainRole}` : '__none__');
    if (!roleMap.has(roleKey)) {
      roleMap.set(roleKey, {
        key: roleKey,
        label: role ? role.label : (m.mainRole ? `${m.mainRole} (hors catalogue)` : 'Sans rôle'),
        color: role ? poleColorHex(poles[role.pole]?.color) : null,
        count: 0,
      });
    }
    roleMap.get(roleKey).count++;

    (m.badges || []).forEach(b => {
      totalBadges++;
      if (!badgeMap.has(b)) badgeMap.set(b, { key: b, label: b, count: 0 });
      badgeMap.get(b).count++;
    });
  });

  return {
    total: list.length,
    withoutRole,
    offCatalog,
    legacyOnly,
    totalBadges,
    byColumn: sortCounts(byColumn),
    byPole: sortCounts([...poleMap.values()]),
    byRole: sortCounts([...roleMap.values()]),
    byBadge: sortCounts([...badgeMap.values()]),
  };
}
