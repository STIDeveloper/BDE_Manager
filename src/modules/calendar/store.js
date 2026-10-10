// ============================================================
// AGENDA & RAPPELS — store (rappels personnalisés + réglages)
// ============================================================
// Forme : voir src/modules/contracts.js (section calendar).
//   reminders: { [id]: { id, title, date, time?, notes?, recurrence, category,
//                        done, doneAt?, doneDates?: string[] (occurrences faites
//                        d'un rappel récurrent), createdAt, updatedAt } }
//   settings : { notifications, lastNotifiedAt?, agDate?, agIntervalMonths,
//                insuranceRenewal?, insuranceLabel?, dirigeantsChange? }
// Les échéances calculées (événements, mandats, AG…) ne sont PAS stockées :
// voir agenda.js. Le planificateur de notifications (scheduler.js) est
// chargé à la demande, après le démarrage, côté navigateur uniquement.
// ============================================================

import { createModuleStore } from '../../core/createModuleStore.js';

export const DEFAULT_CALENDAR_SETTINGS = {
  notifications: false,
  lastNotifiedAt: null,
  agDate: '',
  agIntervalMonths: 12,
  insuranceRenewal: '',
  insuranceLabel: '',
  dirigeantsChange: null, // { signature, since } : changement de bureau constaté par l'app
};

const RECURRENCES = ['none', 'weekly', 'monthly', 'yearly'];
const CATEGORIES = ['conformite', 'finance', 'equipe', 'evenement', 'autre'];

function cleanReminder(input = {}) {
  const title = String(input.title || '').trim().slice(0, 200);
  if (!title) throw new Error('Le titre est obligatoire.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.date || ''))) throw new Error('La date est invalide.');
  const time = /^\d{2}:\d{2}$/.test(String(input.time || '')) ? input.time : '';
  return {
    title,
    date: input.date,
    time,
    notes: String(input.notes || '').slice(0, 4000),
    recurrence: RECURRENCES.includes(input.recurrence) ? input.recurrence : 'none',
    category: CATEGORIES.includes(input.category) ? input.category : 'autre',
  };
}

export const useCalendarStore = createModuleStore({
  name: 'calendar',
  label: 'Agenda',
  version: 1,
  initialState: {
    reminders: {},
    settings: { ...DEFAULT_CALENDAR_SETTINGS },
  },
  slices: [
    { key: 'reminders', kind: 'map', capability: 'calendar' },
    { key: 'settings', kind: 'singleton', capability: 'calendar' },
  ],
  actions: (set, get, h) => ({
    addReminder: (input) => {
      const rec = { id: h.newId(), ...cleanReminder(input), done: false, doneAt: null, doneDates: [] };
      return h.upsert('reminders', rec);
    },
    updateReminder: (id, input) => {
      const prev = get().reminders[id];
      if (!prev) throw new Error('Rappel introuvable.');
      const next = { ...prev, ...cleanReminder({ ...prev, ...input }) };
      // Changement de date ou de récurrence : les occurrences cochées ne correspondent plus.
      if (next.date !== prev.date || next.recurrence !== prev.recurrence) next.doneDates = [];
      return h.upsert('reminders', next);
    },
    deleteReminder: (id) => h.remove('reminders', id),
    /** Marque fait / à faire (une occurrence précise pour un rappel récurrent). */
    setReminderDone: (id, done, occurrenceDate) => {
      const r = get().reminders[id];
      if (!r) return null;
      const recurring = r.recurrence && r.recurrence !== 'none';
      if (recurring && occurrenceDate) {
        const set_ = new Set(r.doneDates || []);
        if (done) set_.add(occurrenceDate); else set_.delete(occurrenceDate);
        // Garde un historique borné (les 200 dernières occurrences).
        const doneDates = [...set_].sort().slice(-200);
        return h.upsert('reminders', { ...r, doneDates, doneAt: done ? h.nowIso() : r.doneAt || null });
      }
      return h.upsert('reminders', { ...r, done: !!done, doneAt: done ? h.nowIso() : null });
    },
    updateSettings: (patch) => set(s => ({ settings: { ...DEFAULT_CALENDAR_SETTINGS, ...s.settings, ...patch } })),
  }),
  migrate: (persisted) => ({
    ...persisted,
    settings: { ...DEFAULT_CALENDAR_SETTINGS, ...(persisted?.settings || {}) },
  }),
});

// Démarrage du planificateur de notifications : navigateur uniquement, sans
// bloquer le premier rendu (module chargé à la demande).
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  setTimeout(() => {
    import('./scheduler.js')
      .then(m => m.startScheduler())
      .catch(() => { /* planificateur indisponible : l'agenda reste utilisable */ });
  }, 2500);
}
