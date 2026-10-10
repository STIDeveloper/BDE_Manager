// ============================================================
// ORGANIGRAMME — calcul du placement (module PUR, testable sous Node)
// ============================================================
// Regroupe les affectations d'un scénario par pôle puis par rôle en suivant
// l'ORDRE DU CATALOGUE (rôles et pôles personnalisés inclus), complète les
// places vacantes jusqu'à la capacité de chaque rôle et sort les candidats
// non placés dans une colonne dédiée. Aucune dépendance React / DOM.

import { listPoles, listRoles, poleColorHex } from '../../core/catalog.js';
import { isPlaced, isUnplaced } from './scenarioStats.js';

export const NODE_W = 200;
export const NODE_H = 68;
export const POLE_H = 40;
export const ROLE_H = 26;
export const COL_GAP = 56;
export const SLOT_GAP = 12;
export const ROLE_GAP = 30;
export const PADDING = 40;
export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 2.5;

/** Pôle factice pour les affectations dont le rôle a été supprimé du catalogue. */
export const ORPHAN_POLE_ID = '__hors_catalogue__';

const slotIndex = (slotId) => {
  const n = Number(String(slotId || '').split('#')[1]);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Arbre pôle → rôle → places, dans l'ordre du catalogue.
 * @param {object|null} scenario
 * @param {{poles:object, levels:object, roles:object}} catalog
 * @returns {{ poles: Array<{pole:object, roles:Array<{role:object, slots:object[]}>}>, unplaced: object[] }}
 */
export function buildOrgTree(scenario, catalog) {
  const assignments = scenario?.assignments || [];
  const bySlotRole = new Map(); // roleId → lignes (placées ou vacantes)
  const unplaced = [];
  assignments.forEach(a => {
    if (isUnplaced(a)) { unplaced.push(a); return; }
    if (!a.slotId || !a.roleId) return;
    if (!bySlotRole.has(a.roleId)) bySlotRole.set(a.roleId, []);
    bySlotRole.get(a.roleId).push(a);
  });

  const roleList = listRoles(catalog);
  const seenRoles = new Set();
  const poles = [];

  listPoles(catalog).forEach(p => {
    const roles = [];
    roleList.filter(r => r.pole === p.id).forEach(role => {
      seenRoles.add(role.id);
      const rows = [...(bySlotRole.get(role.id) || [])];
      // Places vacantes manquantes (ex. capacité augmentée, recalcul en cours)
      const present = new Set(rows.map(a => a.slotId));
      for (let i = 1; i <= (role.capacity ?? 0); i++) {
        const slotId = `${role.id}#${i}`;
        if (!present.has(slotId)) rows.push({ candidateId: null, slotId, roleId: role.id, score: null, locked: false, vacant: true });
      }
      if (rows.length === 0) return;
      rows.sort((a, b) => slotIndex(a.slotId) - slotIndex(b.slotId));
      roles.push({ role, slots: rows });
    });
    if (roles.length) {
      poles.push({
        pole: { id: p.id, label: p.label, emoji: p.emoji || '', color: poleColorHex(p.color) },
        roles,
      });
    }
  });

  // Rôles supprimés du catalogue depuis le calcul (fenêtre de recalcul)
  const orphanRoles = [];
  bySlotRole.forEach((rows, roleId) => {
    if (seenRoles.has(roleId)) return;
    const placed = rows.filter(isPlaced);
    if (!placed.length) return;
    orphanRoles.push({ role: { id: roleId, label: `${roleId} (rôle supprimé)`, capacity: 0 }, slots: placed });
  });
  if (orphanRoles.length) {
    poles.push({ pole: { id: ORPHAN_POLE_ID, label: 'Hors catalogue', emoji: '❓', color: poleColorHex('zinc') }, roles: orphanRoles });
  }

  return { poles, unplaced };
}

/**
 * Positions des nœuds. Chaque nœud a une `key` STABLE (pas d'index).
 * Types : 'pole' | 'role' | 'slot' | 'unplacedHeader' | 'unplaced'.
 * @returns {{ nodes: object[], width: number, height: number }}
 */
export function layoutOrgTree(tree) {
  const nodes = [];
  let x = PADDING;
  let maxY = PADDING;

  tree.poles.forEach(({ pole, roles }) => {
    nodes.push({ key: `pole:${pole.id}`, type: 'pole', poleId: pole.id, label: pole.label, emoji: pole.emoji, color: pole.color, x, y: PADDING, w: NODE_W, h: POLE_H });
    let y = PADDING + POLE_H + ROLE_GAP / 2;
    roles.forEach(({ role, slots }) => {
      const filled = slots.filter(isPlaced).length;
      nodes.push({ key: `role:${role.id}`, type: 'role', roleId: role.id, label: role.label, filled, total: slots.length, color: pole.color, x, y, w: NODE_W, h: ROLE_H });
      y += ROLE_H + 6;
      slots.forEach(a => {
        nodes.push({
          key: `slot:${a.slotId}`, type: 'slot', poleId: pole.id, color: pole.color,
          slotId: a.slotId, roleId: a.roleId, candidateId: a.candidateId || null,
          score: a.score || null, locked: !!a.locked, vacant: !a.candidateId,
          x, y, w: NODE_W, h: NODE_H,
        });
        y += NODE_H + SLOT_GAP;
      });
      y += ROLE_GAP;
    });
    maxY = Math.max(maxY, y);
    x += NODE_W + COL_GAP;
  });

  if (tree.unplaced.length) {
    nodes.push({ key: 'unplaced:header', type: 'unplacedHeader', label: `Non placés (${tree.unplaced.length})`, x, y: PADDING, w: NODE_W, h: POLE_H });
    let y = PADDING + POLE_H + ROLE_GAP / 2;
    tree.unplaced.forEach(a => {
      nodes.push({
        key: `unplaced:${a.candidateId}`, type: 'unplaced',
        slotId: null, roleId: null, candidateId: a.candidateId, score: null, locked: false, vacant: false,
        x, y, w: NODE_W, h: NODE_H,
      });
      y += NODE_H + SLOT_GAP;
    });
    maxY = Math.max(maxY, y);
    x += NODE_W + COL_GAP;
  }

  return {
    nodes,
    width: Math.max(x - COL_GAP + PADDING, NODE_W + 2 * PADDING),
    height: maxY + PADDING,
  };
}

export const clampZoom = (z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

/**
 * Zoom autour d'un point (coordonnées écran relatives au conteneur) :
 * le point sous le curseur / entre les doigts reste immobile.
 * @param {{zoom:number, x:number, y:number}} view
 */
export function zoomAt(view, factor, px, py) {
  const zoom = clampZoom(view.zoom * factor);
  const k = zoom / view.zoom;
  return { zoom, x: px - (px - view.x) * k, y: py - (py - view.y) * k };
}

const parsePair = (p) => {
  const s = String(p);
  const i = s.indexOf(':');
  return i <= 0 ? null : { candidateId: s.slice(0, i), slotId: s.slice(i + 1) };
};

/**
 * Sémantique EXPLICITE de l'échange par glisser-déposer :
 * déposer le candidat A (place `fromSlotId`, ou non placé) sur la place
 * `toSlotId` occupée par B (ou vacante) =
 *   • verrou A → toSlotId ;
 *   • si B existe et que A avait une place : verrou B → fromSlotId ;
 *   • les verrous CONFLICTUELS sont retirés (autre verrou de A ou de B,
 *     autre candidat verrouillé sur l'une des deux places), sinon le solveur
 *     ignorerait silencieusement le nouveau verrou.
 * Un verrou déjà présent n'est jamais dupliqué ni inversé (pas de toggle).
 * @returns {{ pairs: string[], added: string[], removed: string[] }}
 */
export function computeSwapLocks(lockedPairs, { candidateId: a, fromSlotId }, { slotId: toSlotId, candidateId: b }) {
  const wanted = [`${a}:${toSlotId}`];
  if (b && b !== a && fromSlotId) wanted.push(`${b}:${fromSlotId}`);
  const wantedSet = new Set(wanted);

  const touchedCandidates = new Set([a]);
  const touchedSlots = new Set([toSlotId]);
  if (b && fromSlotId) { touchedCandidates.add(b); touchedSlots.add(fromSlotId); }

  const removed = [];
  const kept = [];
  (lockedPairs || []).forEach(p => {
    if (wantedSet.has(p)) { kept.push(p); return; }
    const pp = parsePair(p);
    if (pp && (touchedCandidates.has(pp.candidateId) || touchedSlots.has(pp.slotId))) removed.push(p);
    else kept.push(p);
  });
  const added = wanted.filter(p => !kept.includes(p));
  return { pairs: [...kept, ...added], added, removed };
}
