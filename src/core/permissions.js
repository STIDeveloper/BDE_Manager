// ============================================================
// PERMISSIONS (contrat côté interface)
// ============================================================
// L'interface masque / désactive les actions non autorisées avec useCan().
// ⚠️ Ce n'est qu'un confort d'interface : en mode collaboratif, les droits
// sont CONTRÔLÉS CÔTÉ SERVEUR (politiques RLS Postgres, voir supabase/).
//
// Mode local (aucun backend configuré) : l'utilisateur de l'appareil a tous
// les droits. Le module backend remplace la source via setPermissionSource() :
//   { mode: 'remote', grants: { [capability]: level }, user: { id, email, role, memberId } }
// où `grants` provient de la RPC my_grants (src/backend/engine.js). En mode
// « remote », une capacité absente vaut 'none' et des droits pas encore
// chargés (grants null) n'accordent RIEN (refus par défaut).
//
// Capacités (familles) : members, catalog, drive, documents, organization,
//   vault, recruitment, finance, membership, events, calendar, handover, tasks,
//   forms, admin
// Niveaux : 'read' < 'write' < 'validate' < 'manage'
//   - finance.validate : valider / rejeter une dépense ;
//   - tasks.validate : approuver une tâche soumise à validation ;
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
  { id: 'tasks', label: 'Tâches' },
  { id: 'forms', label: 'Formulaires' },
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
  return evaluate(source, capability, level);
}

/** Règle commune à can() et useCan(). */
function evaluate(src, capability, level) {
  if (src.mode !== 'remote') return true;
  if (!src.grants) return false;
  return rank(src.grants[capability] || 'none') >= rank(level);
}

/** Niveau effectif d'une capacité ('manage' en mode local). */
export function levelOf(capability) {
  if (source.mode !== 'remote') return 'manage';
  return source.grants?.[capability] || 'none';
}

const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** Hook réactif : true si l'utilisateur courant a au moins ce niveau. */
export function useCan(capability, level = 'write') {
  const src = useSyncExternalStore(subscribe, getPermissionSource, getPermissionSource);
  return evaluate(src, capability, level);
}

export function usePermissionSource() {
  return useSyncExternalStore(subscribe, getPermissionSource, getPermissionSource);
}
