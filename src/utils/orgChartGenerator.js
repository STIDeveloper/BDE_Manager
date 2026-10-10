// ============================================================
// GÉNÉRATEUR D'ORGANIGRAMME (Mermaid) — module PUR
// ============================================================
// Regroupe les membres par pôle du CATALOGUE (ordre, emoji, libellé,
// couleur), affiche les libellés de rôles du catalogue, et échappe
// toutes les données saisies par les utilisateurs (noms, libellés,
// codes de dossiers) : aucune balise ni syntaxe Mermaid ne peut être
// injectée dans le diagramme.

import { getActiveCatalog, levelKind, levelRank, listPoles, poleColorHex } from '../core/catalog.js';
import {
  resolveMemberRole, memberPoleId, memberRoleText, isLeaderRole, presetKeyForMember,
} from './memberRoles.js';

/**
 * Échappe un texte utilisateur pour un libellé Mermaid entre guillemets.
 * Les caractères sensibles deviennent des entités Mermaid (`#NN;`), que
 * Mermaid décode en entités HTML → affichées telles quelles, jamais
 * interprétées (ni balise HTML, ni fin de libellé, ni nouvelle instruction).
 */
export function escapeMermaid(str) {
  return String(str ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[#"<>;&[\]{}|`\\]/g, ch => `#${ch.charCodeAt(0)};`)
    .trim();
}

// ------------------------------------------------------------
// COULEURS (suivent le thème clair / sombre de l'application)
// ------------------------------------------------------------

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (rgb) => '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
/** Mélange `hex` avec `base` (ratio = part de `hex`). */
export function mixColors(hex, base, ratio) {
  const a = hexToRgb(hex);
  const b = hexToRgb(base);
  return toHex(a.map((v, i) => v * ratio + b[i] * (1 - ratio)));
}

const THEMES = {
  dark:  { bg: '#09090b', node: '#18181b', text: '#fafafa', rootFill: '#27272a', rootStroke: '#a1a1aa', lead: 0.45, member: 0.22, group: 0.10 },
  light: { bg: '#fafafa', node: '#ffffff', text: '#18181b', rootFill: '#f4f4f5', rootStroke: '#52525b', lead: 0.22, member: 0.08, group: 0.05 },
};

// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------

const fullName = (m) => `${m.firstName || ''} ${m.lastName || ''}`.trim() || 'Sans nom';

function editorFolderCodes(member, rolePresets, folders, catalog) {
  const key = presetKeyForMember(member, rolePresets, catalog);
  const preset = key ? rolePresets[key] : null;
  if (!preset) return [];
  return Object.entries(preset)
    .filter(([, lvl]) => lvl === 'editor')
    .map(([fid]) => folders.find(f => f.id === fid))
    .filter(Boolean)
    .map(f => f.code);
}

/**
 * Génère le code Mermaid de l'organigramme.
 * @param {{members: object[], folders?: object[], rolePresets?: object}} data
 * @param {{catalog?: object, dark?: boolean, title?: string}} [options]
 * @returns {string}
 */
export function generateOrgChart(
  { members = [], folders = [], rolePresets = {} },
  { catalog = getActiveCatalog(), dark = false, title = 'BDE' } = {},
) {
  const theme = dark ? THEMES.dark : THEMES.light;
  const lines = ['graph TD'];

  // Regroupement par pôle du catalogue
  const groups = new Map(listPoles(catalog).map(p => [p.id, { pole: p, leaders: [], others: [] }]));
  const orphans = [];
  members.forEach(m => {
    const poleId = memberPoleId(m, catalog);
    const group = poleId ? groups.get(poleId) : null;
    if (!group) { orphans.push(m); return; }
    const role = resolveMemberRole(m, catalog);
    (isLeaderRole(role, catalog) ? group.leaders : group.others).push({ member: m, role });
  });

  const rank = (role) => (role ? levelRank(catalog, role.level) : 0);
  const byHierarchy = (a, b) =>
    rank(b.role) - rank(a.role) ||
    (a.role?.order ?? 0) - (b.role?.order ?? 0) ||
    fullName(a.member).localeCompare(fullName(b.member), 'fr');

  // Styles
  lines.push(`    classDef root fill:${theme.rootFill},stroke:${theme.rootStroke},stroke-width:2px,color:${theme.text},font-weight:bold`);
  lines.push(`    classDef orphan fill:${theme.node},stroke:${theme.rootStroke},stroke-width:1px,stroke-dasharray:4 3,color:${theme.text}`);
  const usedGroups = [...groups.values()].filter(g => g.leaders.length + g.others.length > 0);
  usedGroups.forEach((g, i) => {
    const hex = poleColorHex(g.pole.color);
    lines.push(`    classDef lead${i} fill:${mixColors(hex, theme.node, theme.lead)},stroke:${hex},stroke-width:2px,color:${theme.text},font-weight:bold`);
    lines.push(`    classDef memb${i} fill:${mixColors(hex, theme.node, theme.member)},stroke:${hex},stroke-width:1px,color:${theme.text}`);
  });
  lines.push('');

  // Racine
  const count = members.length;
  lines.push(`    ROOT["🏛️ ${escapeMermaid(title)}<br/><i>${count} membre${count > 1 ? 's' : ''}</i>"]:::root`);
  lines.push('');

  let nodeSeq = 0;
  const nodeId = () => `M${nodeSeq++}`;

  usedGroups.forEach((g, i) => {
    const gid = `P${i}`;
    const hex = poleColorHex(g.pole.color);
    const leaders = [...g.leaders].sort(byHierarchy);
    const others = [...g.others].sort(byHierarchy);
    const leaderIds = [];

    lines.push(`    subgraph ${gid}["${escapeMermaid(`${g.pole.emoji || ''} ${g.pole.label}`)}"]`);
    leaders.forEach(({ member, role }) => {
      const id = nodeId();
      leaderIds.push({ id, role });
      const icon = levelKind(catalog, role?.level) === 'bureau' ? '👑' : '🎯';
      const codes = editorFolderCodes(member, rolePresets, folders, catalog);
      const drive = codes.length ? `<br/>📁 Drive : ${escapeMermaid(codes.join(', '))}` : '';
      lines.push(`        ${id}["${icon} ${escapeMermaid(fullName(member))}<br/><b>${escapeMermaid(memberRoleText(member, catalog) || 'Sans rôle')}</b>${drive}"]:::lead${i}`);
    });
    let groupId = null;
    if (others.length > 0) {
      groupId = `${gid}_MEMBERS`;
      const names = others
        .map(({ member }) => {
          const r = memberRoleText(member, catalog);
          return escapeMermaid(r ? `${fullName(member)} (${r})` : fullName(member));
        })
        .join('<br/>');
      lines.push(`        ${groupId}["👥 Membres<br/>${names}"]:::memb${i}`);
    }
    lines.push('    end');
    lines.push(`    style ${gid} fill:${mixColors(hex, theme.bg, theme.group)},stroke:${hex},color:${theme.text}`);
    lines.push(`    ROOT --> ${gid}`);

    // Hiérarchie interne : le poste le plus élevé encadre les niveaux inférieurs.
    if (leaderIds.length > 0) {
      const top = leaderIds[0];
      leaderIds.slice(1).forEach(l => {
        if (rank(l.role) < rank(top.role)) lines.push(`    ${top.id} --> ${l.id}`);
      });
      if (groupId) lines.push(`    ${top.id} --> ${groupId}`);
    }
    lines.push('');
  });

  if (orphans.length > 0) {
    lines.push('    subgraph OTHER["❔ Sans rôle du catalogue"]');
    [...orphans].sort((a, b) => fullName(a).localeCompare(fullName(b), 'fr')).forEach(m => {
      const role = memberRoleText(m, catalog);
      lines.push(`        ${nodeId()}["${escapeMermaid(fullName(m))}<br/><i>${escapeMermaid(role || 'Aucun rôle')}</i>"]:::orphan`);
    });
    lines.push('    end');
    lines.push('    ROOT -.-> OTHER');
  }

  return lines.join('\n');
}
