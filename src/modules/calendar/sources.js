// ============================================================
// AGENDA — lecture des sources (stores) pour getAgendaItems
// ============================================================
// Les modules events / membership sont lus SANS dépendance d'ordre : s'ils
// n'existent pas (encore), leurs données sont simplement ignorées.

import { useMemo } from 'react';
import { create } from 'zustand';
import { useStore } from '../../store.js';
import { useCalendarStore, DEFAULT_CALENDAR_SETTINGS } from './store.js';
import { getAgendaItems, ymd } from './agenda.js';

const findStore = (mods) => {
  for (const mod of Object.values(mods)) {
    const hook = Object.values(mod || {}).find(v => typeof v === 'function' && typeof v.getState === 'function');
    if (hook) return hook;
  }
  return null;
};

const eventsMods = import.meta.glob('../events/store.js', { eager: true });
const membershipMods = import.meta.glob('../membership/store.js', { eager: true });
const tasksMods = import.meta.glob('../tasks/store.js', { eager: true });
const taskSelectorMods = import.meta.glob('../tasks/selectors.js', { eager: true });
const getTaskDeadlines = Object.values(taskSelectorMods)[0]?.getTaskDeadlines || (() => []);

// Store vide de repli : les hooks sont toujours appelés (règles des hooks).
const useEmpty = create(() => ({}));
const useEventsSource = findStore(eventsMods) || useEmpty;
const useMembershipSource = findStore(membershipMods) || useEmpty;
const useTasksSource = findStore(tasksMods) || useEmpty;

export const hasEventsModule = useEventsSource !== useEmpty;
export const hasMembershipModule = useMembershipSource !== useEmpty;

// Sections disposant d'un écran (pour les liens vers les modules sources).
const pages = import.meta.glob('../*/Page.jsx');
const BUILTIN_SECTIONS = ['kanban', 'org', 'documents', 'drive', 'stats', 'sensitive'];
export const sectionAvailable = (section) => BUILTIN_SECTIONS.includes(section) || Object.keys(pages).some(p => p.split('/')[1] === section);
export const resolveLink = (item) => {
  if (item?.link && sectionAvailable(item.link.section)) return item.link;
  if (item?.fallbackLink && sectionAvailable(item.fallbackLink.section)) return item.fallbackLink;
  return null;
};

/** Instantané non réactif (planificateur de notifications). */
export function getAgendaSnapshot({ today = ymd(new Date()), from, to } = {}) {
  const main = useStore.getState();
  const cal = useCalendarStore.getState();
  const ev = useEventsSource.getState();
  const ms = useMembershipSource.getState();
  const tk = useTasksSource.getState();
  return getAgendaItems({
    taskDeadlines: getTaskDeadlines(tk.tasks, tk.boards, { today }),
    main, documentLog: main.documentLog,
    events: ev.events, memberships: ms.memberships, membershipSettings: ms.settings,
    reminders: cal.reminders, settings: { ...DEFAULT_CALENDAR_SETTINGS, ...cal.settings },
    today, from, to,
  });
}

/** Hook : données brutes des sources (sélections stables). */
export function useAgendaSources() {
  const members = useStore(s => s.members);
  const roles = useStore(s => s.roles);
  const levels = useStore(s => s.levels);
  const poles = useStore(s => s.poles);
  const organization = useStore(s => s.organization);
  const documentLog = useStore(s => s.documentLog);
  const reminders = useCalendarStore(s => s.reminders);
  const settings = useCalendarStore(s => s.settings);
  const events = useEventsSource(s => s.events);
  const memberships = useMembershipSource(s => s.memberships);
  const membershipSettings = useMembershipSource(s => s.settings);
  const tasks = useTasksSource(s => s.tasks);
  const boards = useTasksSource(s => s.boards);
  return useMemo(() => ({
    taskDeadlines: getTaskDeadlines(tasks, boards),
    main: { members, roles, levels, poles, organization },
    documentLog, reminders,
    settings: { ...DEFAULT_CALENDAR_SETTINGS, ...settings },
    events, memberships, membershipSettings,
  }), [members, roles, levels, poles, organization, documentLog, reminders, settings, events, memberships, membershipSettings, tasks, boards]);
}

/** Hook : éléments d'agenda sur [from, to]. */
export function useAgendaItems({ today, from, to }) {
  const src = useAgendaSources();
  return useMemo(() => getAgendaItems({ ...src, today, from, to }), [src, today, from, to]);
}
