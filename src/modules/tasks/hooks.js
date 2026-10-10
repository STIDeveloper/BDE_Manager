// Hooks du module Tâches (membres, « moi », lecture des événements).
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useStore } from '../../store.js';
import { isPlaceholderMember } from '../../documents/context.js';
import { usePermissionSource } from '../../core/permissions.js';

export const memberLabel = (m) => (m ? `${m.firstName || ''} ${m.lastName || ''}`.trim() || 'Sans nom' : 'Membre supprimé');
export const initials = (m) => (m ? `${(m.firstName || '?')[0] || ''}${(m.lastName || '')[0] || ''}`.toUpperCase() : '?');

/** Membres réels (sans postes vacants), triés, + index. */
export function useMembers() {
  const raw = useStore(s => s.members);
  return useMemo(() => {
    const list = (raw || []).filter(m => !isPlaceholderMember(m))
      .sort((a, b) => memberLabel(a).localeCompare(memberLabel(b), 'fr'));
    const byId = new Map(list.map(m => [m.id, m]));
    return { list, byId, name: (id) => memberLabel(byId.get(id)) };
  }, [raw]);
}

// ── « Moi » ──
// En mode collaboratif : le membre lié au compte connecté. En mode local
// (un seul appareil), la personne choisit qui elle est (préférence de
// l'appareil, localStorage — simple confort, non synchronisé).
const ME_KEY = 'bde-tasks-me';
const meListeners = new Set();
const readLocalMe = () => { try { return localStorage.getItem(ME_KEY) || ''; } catch { return ''; } };
const subscribeMe = (fn) => { meListeners.add(fn); return () => meListeners.delete(fn); };

export function useMe() {
  const src = usePermissionSource();
  const localMe = useSyncExternalStore(subscribeMe, readLocalMe, () => '');
  const remoteId = src?.mode === 'remote' ? src.user?.memberId || '' : '';
  const setLocalMe = useCallback((id) => {
    try { if (id) localStorage.setItem(ME_KEY, id); else localStorage.removeItem(ME_KEY); } catch { /* stockage indisponible */ }
    meListeners.forEach(fn => fn());
  }, []);
  return { meId: remoteId || localMe, isRemote: !!remoteId, setLocalMe };
}

// ── Événements (module events, lu sans dépendance d'ordre) ──
const eventsMods = import.meta.glob('../events/store.js', { eager: true });
const useEventsStore = Object.values(eventsMods)[0]?.useEventsStore;
const EMPTY = {};
const useNoEvents = () => EMPTY;
const useEventsRaw = useEventsStore ? () => useEventsStore(s => s.events) : useNoEvents;

/** Événements triés (récents d'abord) ; liste vide si le module est absent. */
export function useEventsList() {
  const map = useEventsRaw();
  return useMemo(() => {
    const list = Object.values(map || {}).sort((a, b) => String(b.start || '').localeCompare(String(a.start || '')));
    return { list, byId: map || EMPTY, available: !!useEventsStore };
  }, [map]);
}
