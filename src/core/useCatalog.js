// ============================================================
// HOOKS RÉACTIFS DU CATALOGUE (composants React)
// ============================================================
// ⚠️ Zustand v5 : un sélecteur qui crée un nouvel objet/tableau à chaque
// appel (ex. `useStore(s => ({ roles: Object.values(s.roles) }))`) provoque
// une boucle de rendu infinie. On sélectionne donc les maps BRUTES (références
// stables) et on dérive les listes avec useMemo.

import { useMemo } from 'react';
import { useStore } from '../store.js';
import {
  listRoles, listPoles, listLevels, roleLabelIn, poleLabelIn, poleColorHex,
} from './catalog.js';

/** Maps brutes { id → objet } (stables tant que le catalogue ne change pas). */
export function useCatalogMaps() {
  const poles = useStore(s => s.poles);
  const levels = useStore(s => s.levels);
  const roles = useStore(s => s.roles);
  return useMemo(() => ({ poles, levels, roles }), [poles, levels, roles]);
}

/**
 * Catalogue complet + listes triées + helpers d'affichage.
 * @returns {{
 *   poles: object, levels: object, roles: object,
 *   poleList: object[], levelList: object[], roleList: object[],
 *   roleLabel: (id:string)=>string, poleLabel: (id:string)=>string,
 *   levelLabel: (id:string)=>string, poleColor: (id:string)=>string,
 *   rolesByPole: Record<string, object[]>,
 * }}
 */
export function useCatalog() {
  const maps = useCatalogMaps();
  return useMemo(() => {
    const roleList = listRoles(maps);
    const rolesByPole = {};
    roleList.forEach(r => { (rolesByPole[r.pole] ||= []).push(r); });
    return {
      ...maps,
      poleList: listPoles(maps),
      levelList: listLevels(maps),
      roleList,
      rolesByPole,
      roleLabel: (id) => roleLabelIn(maps, id),
      poleLabel: (id) => poleLabelIn(maps, id),
      levelLabel: (id) => maps.levels[id]?.label || id || '',
      poleColor: (id) => poleColorHex(maps.poles[id]?.color),
    };
  }, [maps]);
}

/** Libellé lisible du rôle principal d'un membre (id, ou ancien texte libre). */
export function memberRoleLabel(member, roles) {
  if (!member) return '';
  if (member.mainRole && roles?.[member.mainRole]) return roles[member.mainRole].label;
  return member.mainRole || member.legacyMainRole || '';
}
