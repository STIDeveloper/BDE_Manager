// ============================================================
// RECOMMANDATIONS — générées à partir des données réelles (module PUR)
// ============================================================
// Aucune donnée fictive : chaque recommandation cite les rôles, pôles et
// membres effectivement présents dans le store / le catalogue.

import { getActiveCatalog, listPoles, listRoles } from '../core/catalog.js';
import { resolveMemberRole, isLeaderRole, presetKeyForMember, memberRoleText } from './memberRoles.js';
import { analyzeDriveState } from './driveAnalyzer.js';

const fullName = (m) => `${m.firstName || ''}${m.lastName ? ' ' + m.lastName : ''}`.trim() || 'Sans nom';
const plural = (n, word, pluralWord = word + 's') => `${n} ${n > 1 ? pluralWord : word}`;

/**
 * @param {{members: object[], folders?: object[], drivePermissions?: object, rolePresets?: object}} data
 * @param {object} [catalog]
 * @returns {{
 *   id: string, severity: 'danger'|'warning'|'info', category: 'roles'|'drive',
 *   title: string, description: string, items: string[], fix: string,
 * }[]}
 */
export function buildRecommendations(
  { members = [], folders = [], drivePermissions = {}, rolePresets = {} },
  catalog = getActiveCatalog(),
) {
  const recos = [];
  const holders = new Map(); // roleId → membres
  const unresolved = [];
  const noRole = [];
  members.forEach(m => {
    if (!m.mainRole) { noRole.push(m); return; }
    const role = resolveMemberRole(m, catalog);
    if (!role) { unresolved.push(m); return; }
    if (!holders.has(role.id)) holders.set(role.id, []);
    holders.get(role.id).push(m);
  });
  const roles = listRoles(catalog);

  // 1. Rôles essentiels vacants
  const vacant = roles.filter(r => r.essential && !(holders.get(r.id)?.length));
  if (vacant.length) {
    recos.push({
      id: 'essential-vacant', severity: 'danger', category: 'roles',
      title: `${plural(vacant.length, 'rôle essentiel vacant', 'rôles essentiels vacants')}`,
      description: 'Ces rôles sont marqués « essentiels » dans le catalogue mais aucun membre ne les occupe.',
      items: vacant.map(r => `${r.label} (${catalog.poles?.[r.pole]?.label || r.pole})`),
      fix: 'Attribue ces rôles depuis le Moteur de rôles ou les fiches membres.',
    });
  }

  // 2. Pôles sans encadrant
  const leaderless = listPoles(catalog).filter(p => {
    const leadRoles = roles.filter(r => r.pole === p.id && isLeaderRole(r, catalog));
    if (leadRoles.length === 0) return false;
    return !leadRoles.some(r => holders.get(r.id)?.length);
  });
  if (leaderless.length) {
    recos.push({
      id: 'pole-leaderless', severity: 'warning', category: 'roles',
      title: `${plural(leaderless.length, 'pôle sans encadrant', 'pôles sans encadrant')}`,
      description: 'Aucun membre n\'occupe un rôle d\'encadrement (responsable, bureau ou rôle « leadership ») dans ces pôles.',
      items: leaderless.map(p => {
        const n = roles.filter(r => r.pole === p.id).reduce((s, r) => s + (holders.get(r.id)?.length || 0), 0);
        return `${p.emoji || ''} ${p.label} — ${plural(n, 'membre')}`.trim();
      }),
      fix: 'Désigne un responsable pour chaque pôle actif.',
    });
  }

  // 3. Capacité dépassée
  const over = roles.filter(r => r.capacity > 0 && (holders.get(r.id)?.length || 0) > r.capacity);
  if (over.length) {
    recos.push({
      id: 'role-over-capacity', severity: 'info', category: 'roles',
      title: `${plural(over.length, 'rôle au-delà de sa capacité', 'rôles au-delà de leur capacité')}`,
      description: 'Plus de membres occupent ces rôles que la capacité prévue dans le catalogue.',
      items: over.map(r => `${r.label} : ${holders.get(r.id).length} / ${r.capacity}`),
      fix: 'Ajuste la capacité du rôle dans le catalogue ou réaffecte certains membres.',
    });
  }

  // 4. Membres sans rôle / rôle hors catalogue
  if (noRole.length) {
    recos.push({
      id: 'members-no-role', severity: 'warning', category: 'roles',
      title: `${plural(noRole.length, 'membre sans rôle', 'membres sans rôle')}`,
      description: 'Sans rôle, ces membres n\'apparaissent dans aucun pôle et aucun preset Drive ne peut leur être appliqué.',
      items: noRole.map(fullName),
      fix: 'Attribue-leur un rôle du catalogue.',
    });
  }
  if (unresolved.length) {
    recos.push({
      id: 'members-unknown-role', severity: 'info', category: 'roles',
      title: `${plural(unresolved.length, 'membre avec un rôle hors catalogue', 'membres avec un rôle hors catalogue')}`,
      description: 'Leur rôle est un ancien texte libre qui ne correspond à aucun rôle du catalogue.',
      items: unresolved.map(m => `${fullName(m)} — « ${memberRoleText(m, catalog)} »`),
      fix: 'Associe-les à un rôle existant, ou crée le rôle correspondant dans le catalogue.',
    });
  }

  // 5. Drive : rôles occupés sans preset
  const withoutPreset = roles.filter(r => holders.get(r.id)?.length && !rolePresets[r.id]
    && !holders.get(r.id).some(m => presetKeyForMember(m, rolePresets, catalog)));
  if (withoutPreset.length) {
    recos.push({
      id: 'roles-without-preset', severity: 'info', category: 'drive',
      title: `${plural(withoutPreset.length, 'rôle occupé sans preset Drive', 'rôles occupés sans preset Drive')}`,
      description: 'Sans preset, les accès Drive de ces membres doivent être réglés à la main et ne peuvent pas être vérifiés.',
      items: withoutPreset.map(r => `${r.label} — ${holders.get(r.id).map(fullName).join(', ')}`),
      fix: 'Crée un preset pour ces rôles (Droits Drive → Presets).',
    });
  }

  // 6. Drive : écarts avec le preset du rôle + alertes de sécurité
  const alerts = analyzeDriveState({ members, folders, drivePermissions, rolePresets }, catalog);
  const outside = new Map();
  alerts.filter(a => a.ruleId === 'permission-outside-preset').forEach(a => {
    const m = a.data.member;
    if (!outside.has(m.id)) outside.set(m.id, { member: m, folders: [] });
    outside.get(m.id).folders.push(a.data.folder.code);
  });
  if (outside.size) {
    recos.push({
      id: 'drive-outside-preset', severity: 'warning', category: 'drive',
      title: `${plural(outside.size, 'membre a', 'membres ont')} des accès Drive hors preset`,
      description: 'Ces accès ne sont pas prévus par le preset de leur rôle.',
      items: [...outside.values()].map(({ member, folders: codes }) =>
        `${fullName(member)} (${memberRoleText(member, catalog)}) : ${codes.join(', ')}`),
      fix: 'Mets à jour le preset du rôle, ou retire ces accès (Droits Drive → Par membre → Appliquer le preset).',
    });
  }
  const notApplied = members.filter(m => {
    if (!presetKeyForMember(m, rolePresets, catalog)) return false;
    return Object.values(drivePermissions[m.id] || {}).every(v => !v || v === 'none');
  });
  if (notApplied.length) {
    recos.push({
      id: 'drive-preset-not-applied', severity: 'info', category: 'drive',
      title: `${plural(notApplied.length, 'membre n\'a', 'membres n\'ont')} aucun accès Drive malgré un preset`,
      description: 'Un preset existe pour leur rôle mais n\'a jamais été appliqué.',
      items: notApplied.map(m => `${fullName(m)} (${memberRoleText(m, catalog)})`),
      fix: 'Applique le preset depuis Droits Drive → Par membre.',
    });
  }
  const security = alerts.filter(a => a.severity === 'danger' || a.ruleId === 'confidential-non-bureau');
  if (security.length) {
    recos.push({
      id: 'drive-security', severity: 'danger', category: 'drive',
      title: `${plural(security.length, 'point de sécurité Drive', 'points de sécurité Drive')}`,
      description: 'Dossiers confidentiels ou sensibles trop ouverts.',
      items: security.slice(0, 8).map(a => a.description).concat(security.length > 8 ? [`… et ${security.length - 8} autre(s)`] : []),
      fix: 'Consulte Droits Drive → Vérifications pour le détail et les corrections.',
    });
  }

  const order = { danger: 0, warning: 1, info: 2 };
  return recos.sort((a, b) => order[a.severity] - order[b.severity]);
}
