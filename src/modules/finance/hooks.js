// ============================================================
// TRÉSORERIE — hooks et utilitaires partagés (aussi utilisés par le module
// Adhésions) : lecture du module Événements, membres, utilisateur courant.
// ============================================================
import { useMemo } from 'react';
import { create } from 'zustand';
import { useStore } from '../../store.js';
import { isPlaceholderMember } from '../../documents/context.js';
import { getPermissionSource } from '../../core/permissions.js';

// Module Événements : facultatif (développement en parallèle) → store de repli vide.
const eventMods = import.meta.glob('../events/store.js', { eager: true });
const useFallbackEvents = create(() => ({ events: {} }));
const useEventsStore = Object.values(eventMods)[0]?.useEventsStore || useFallbackEvents;
export const eventsModuleAvailable = useEventsStore !== useFallbackEvents;

const EMPTY = {};

/** Map { id → événement } (vide si le module n'existe pas). */
export function useEventsMap() {
  const events = useEventsStore(s => s.events);
  return events || EMPTY;
}

/** Événements triés (les plus récents d'abord) pour les listes déroulantes. */
export function useEventOptions() {
  const events = useEventsMap();
  return useMemo(() => Object.values(events)
    .filter(e => e && e.id)
    .sort((a, b) => String(b.start || '').localeCompare(String(a.start || ''))), [events]);
}

/** Membres réels (sans fiches « poste vacant »), triés par nom. */
export function useRealMembers() {
  const members = useStore(s => s.members);
  return useMemo(() => (members || [])
    .filter(m => !isPlaceholderMember(m))
    .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'fr')), [members]);
}

export const memberName = (m) => (m ? [m.firstName, m.lastName].filter(Boolean).join(' ') : '');

/** Nom de l'utilisateur courant (mode collaboratif) ou « Cet appareil ». */
export function currentUserName() {
  const u = getPermissionSource()?.user;
  return u?.name || u?.displayName || u?.email || 'Cet appareil';
}

export const labelCls = 'block text-xs font-medium text-dim mb-1';
