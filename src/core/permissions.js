// ============================================================
// PERMISSIONS (contrat côté interface)
// ============================================================
// L'interface masque / désactive les actions non autorisées avec useCan().
// ⚠️ Ce n'est qu'un confort d'interface : en mode collaboratif, les droits
// sont CONTRÔLÉS CÔTÉ SERVEUR (politiques RLS Postgres, voir supabase/).
//
// Mode local (aucun backend configuré) : l'utilisateur de l'appareil a tous
// les droits. Le module backend remplace la source via setPermissionSource().
//
// Capacités (familles) : members, catalog, drive, documents, organization,
//   vault, recruitment, finance, membership, events, calendar, handover, admin
// Niveaux : 'read' < 'write' < 'validate' < 'manage'
//   - finance.validate : valider / rejeter une dépense ;
//   - admin.manage : gérer les comptes, rôles d'accès et invitations.
// ============================================================

import { useSyncExternalStore } from 'react';

export const CAPABILITIES = [
  { id: 'members', label: 'Membres' },
  { id: 'catalog', label: 'Rôles & pôles' },
  { id: 'drive', label: 'Drive' },
  { id: 'documents', label: 'Documents' },
  { id: 'organization', label: 'Profil de l\'association' },
  { id: 'vault', label: 'Coffre-fort' },
  { id: 'recruitment', label: 'Recrutement' },
  { id: 'finance', label: 'Trésorerie' },
  { id: 'membership', label: 'Adhésions' },
  { id: 'events', label: 'Événements' },
  { id: 'calendar', label: 'Agenda' },
  { id: 'handover', label: 'Passations' },
  { id: 'admin', label: 'Administration' },
];
export const LEVELS = ['none', 'read', 'write', 'validate', 'manage'];
const rank = (lvl) => Math.max(0, LEVELS.indexOf(lvl));

// Source : { mode: 'local' | 'remote', grants: { [capability]: level }, user? }
let source = { mode: 'local', grants: null, user: null };
const listeners = new Set();

export function setPermissionSource(next) {
  source = { mode: 'local', grants: null, user: null, ...next };
  listeners.forEach(fn => fn());
}
export const getPermissionSource = () => source;

/** Vérification non réactive (gestionnaires d'événements, stores). */
export function can(capability, level = 'write') {
  if (source.mode === 'local' || !source.grants) return true;
  return rank(source.grants[capability] || 'none') >= rank(level);
}

const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** Hook réactif : true si l'utilisateur courant a au moins ce niveau. */
export function useCan(capability, level = 'write') {
  const src = useSyncExternalStore(subscribe, getPermissionSource, getPermissionSource);
  if (src.mode === 'local' || !src.grants) return true;
  return rank(src.grants[capability] || 'none') >= rank(level);
}

export function usePermissionSource() {
  return useSyncExternalStore(subscribe, getPermissionSource, getPermissionSource);
}
