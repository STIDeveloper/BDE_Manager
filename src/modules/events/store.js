// ============================================================
// STORE DU MODULE ÉVÉNEMENTS
// ============================================================
// Forme : `events` dans src/modules/contracts.js (lue par l'agenda, la
// trésorerie et le tableau de bord). Les autres modules lisent via
// useEventsStore(s => s.events) et les sélecteurs exportés ci-dessous.

import { createModuleStore, newId } from '../../core/createModuleStore.js';
import { EVENT_TYPES, EVENT_STATUSES, roundMoney } from '../contracts.js';
import {
  arrivalStatus, capacityOf, occupiesSeat, participantKey, promoteWaitlist, shiftYears,
} from './logic.js';

const TYPE_IDS = EVENT_TYPES.map(t => t.id);
const STATUS_IDS = EVENT_STATUSES.map(s => s.id);
const PARTICIPANT_IDS = ['registered', 'waitlist', 'present', 'absent', 'cancelled'];

const str = (v) => String(v ?? '').trim();
const posNumber = (v) => {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** Normalise les champs « fiche » d'un événement (sans les sous-listes). */
function cleanCore(data, prev = {}) {
  const out = { ...prev };
  if ('title' in data) out.title = str(data.title) || 'Sans titre';
  if ('description' in data) out.description = String(data.description ?? '');
  if ('type' in data) out.type = TYPE_IDS.includes(data.type) ? data.type : 'autre';
  if ('status' in data) out.status = STATUS_IDS.includes(data.status) ? data.status : 'draft';
  if ('start' in data) out.start = data.start || '';
  if ('end' in data) out.end = data.end || data.start || '';
  if ('location' in data) out.location = str(data.location);
  if ('poleId' in data) { if (data.poleId) out.poleId = data.poleId; else delete out.poleId; }
  if ('responsibleIds' in data) out.responsibleIds = Array.isArray(data.responsibleIds) ? [...new Set(data.responsibleIds.filter(Boolean))] : [];
  if ('capacity' in data) {
    const c = posNumber(data.capacity);
    if (c && c >= 1) out.capacity = Math.floor(c); else delete out.capacity;
  }
  if ('price' in data) {
    const p = posNumber(data.price);
    if (p) out.price = roundMoney(p); else delete out.price;
  }
  if ('budgetId' in data) { if (data.budgetId) out.budgetId = data.budgetId; else delete out.budgetId; }
  if ('review' in data) out.review = data.review || undefined;
  return out;
}

const cleanParticipant = (p) => {
  const out = { id: p.id || newId(), name: str(p.name) || 'Sans nom', status: PARTICIPANT_IDS.includes(p.status) ? p.status : 'registered' };
  if (str(p.email)) out.email = str(p.email).toLowerCase();
  if (p.memberId) out.memberId = p.memberId;
  if (p.paid) out.paid = true;
  if (p.transactionId) out.transactionId = p.transactionId;
  return out;
};

export const useEventsStore = createModuleStore({
  name: 'events',
  label: 'Événements',
  version: 1,
  initialState: { events: {} },
  slices: [{ key: 'events', kind: 'map', capability: 'events', sensitive: true }],
  actions: (set, get, h) => {
    const read = (id) => get().events[id];
    /** Remplace un événement (horodaté). */
    const save = (ev) => h.upsert('events', ev);
    /** Modifie un événement via une fonction (ev) => ev. */
    const mutate = (id, fn) => {
      const ev = read(id);
      if (!ev) return null;
      return save(fn(ev));
    };

    return {
      createEvent: (data) => {
        const id = newId();
        const ev = cleanCore({
          title: '', description: '', type: 'autre', status: 'draft', start: '', end: '', location: '',
          responsibleIds: [], ...data,
        });
        save({
          ...ev, id,
          tasks: Array.isArray(data.tasks) ? data.tasks : [],
          volunteers: Array.isArray(data.volunteers) ? data.volunteers : [],
          participants: Array.isArray(data.participants) ? data.participants.map(cleanParticipant) : [],
        });
        return id;
      },

      /** Mise à jour de la fiche ; une capacité augmentée promeut la liste d'attente. */
      updateEvent: (id, patch) => {
        let promoted = [];
        mutate(id, (ev) => {
          const next = cleanCore(patch, ev);
          const res = promoteWaitlist(next, next.participants || []);
          promoted = res.promoted;
          return { ...next, participants: res.participants };
        });
        return { promoted };
      },

      deleteEvent: (id) => h.remove('events', id),

      /**
       * Duplique un événement (récurrent : WEI, gala…). Les inscriptions, le
       * bilan et le lien budgétaire ne sont jamais copiés.
       */
      duplicateEvent: (id, { shiftYear = true, keepTasks = true, keepVolunteers = false, title } = {}) => {
        const src = read(id);
        if (!src) return null;
        const years = shiftYear ? 1 : 0;
        const newEvId = newId();
        const { review: _r, budgetId: _b, createdAt: _c, updatedAt: _u, ...rest } = src;
        save({
          ...rest,
          id: newEvId,
          title: title || (shiftYear ? src.title.replace(/\b(20\d{2})\b/g, (y) => String(Number(y) + 1)) : `${src.title} (copie)`),
          status: 'draft',
          start: shiftYears(src.start, years),
          end: shiftYears(src.end, years),
          tasks: keepTasks ? (src.tasks || []).map(t => ({ ...t, id: newId(), done: false, due: t.due ? shiftYears(t.due, years) : t.due })) : [],
          volunteers: keepVolunteers ? (src.volunteers || []).map(v => ({ ...v, id: newId() })) : [],
          participants: [],
        });
        return newEvId;
      },

      // ── Tâches ──
      addTask: (eventId, task) => {
        const t = { id: newId(), title: str(task.title), done: false };
        if (!t.title) return null;
        if (task.assigneeId) t.assigneeId = task.assigneeId;
        if (task.due) t.due = task.due;
        mutate(eventId, ev => ({ ...ev, tasks: [...(ev.tasks || []), t] }));
        return t.id;
      },
      updateTask: (eventId, taskId, patch) => mutate(eventId, ev => ({
        ...ev,
        tasks: (ev.tasks || []).map(t => {
          if (t.id !== taskId) return t;
          const n = { ...t, ...patch };
          if (!n.assigneeId) delete n.assigneeId;
          if (!n.due) delete n.due;
          n.title = str(n.title) || t.title;
          n.done = !!n.done;
          return n;
        }),
      })),
      removeTask: (eventId, taskId) => mutate(eventId, ev => ({ ...ev, tasks: (ev.tasks || []).filter(t => t.id !== taskId) })),

      // ── Bénévoles ──
      addVolunteer: (eventId, vol) => {
        if (!vol.memberId) return null;
        const v = { id: newId(), memberId: vol.memberId, role: str(vol.role) || 'Bénévole' };
        if (str(vol.slot)) v.slot = str(vol.slot);
        mutate(eventId, ev => ({ ...ev, volunteers: [...(ev.volunteers || []), v] }));
        return v.id;
      },
      updateVolunteer: (eventId, volId, patch) => mutate(eventId, ev => ({
        ...ev,
        volunteers: (ev.volunteers || []).map(v => {
          if (v.id !== volId) return v;
          const n = { ...v, ...patch, role: str(patch.role ?? v.role) || 'Bénévole' };
          if (!str(n.slot)) delete n.slot; else n.slot = str(n.slot);
          return n;
        }),
      })),
      removeVolunteer: (eventId, volId) => mutate(eventId, ev => ({ ...ev, volunteers: (ev.volunteers || []).filter(v => v.id !== volId) })),

      // ── Participants ──
      /**
       * Ajoute des participants (doublons ignorés). Au-delà de la capacité,
       * ils passent automatiquement en liste d'attente.
       * @returns {{ added: number, waitlisted: number, duplicates: number }}
       */
      addParticipants: (eventId, list) => {
        const res = { added: 0, waitlisted: 0, duplicates: 0 };
        mutate(eventId, ev => {
          const participants = [...(ev.participants || [])];
          const keys = new Set(participants.filter(p => p.status !== 'cancelled').map(participantKey));
          list.forEach(raw => {
            const p = cleanParticipant({ ...raw, status: undefined });
            const key = participantKey(p);
            if (keys.has(key)) { res.duplicates++; return; }
            keys.add(key);
            p.status = arrivalStatus(ev, participants);
            if (p.status === 'waitlist') res.waitlisted++;
            res.added++;
            participants.push(p);
          });
          return { ...ev, participants };
        });
        return res;
      },

      /**
       * Modifie un participant. Changer de statut respecte la capacité ;
       * libérer une place promeut le premier de la liste d'attente.
       * @returns {{ ok: boolean, error?: string, promoted: object[] }}
       */
      updateParticipant: (eventId, pid, patch) => {
        const ev = read(eventId);
        const cur = ev?.participants?.find(p => p.id === pid);
        if (!cur) return { ok: false, error: 'Participant introuvable.', promoted: [] };
        const next = cleanParticipant({ ...cur, ...patch });
        if (patch.paid === false) delete next.paid;
        const others = ev.participants.filter(p => p.id !== pid);
        const cap = capacityOf(ev);
        if (occupiesSeat(next) && !occupiesSeat(cur) && cap !== null && others.filter(occupiesSeat).length >= cap) {
          return { ok: false, error: `Capacité atteinte (${cap} places) : libère une place ou augmente la capacité.`, promoted: [] };
        }
        if (next.status === 'waitlist' && cur.status !== 'waitlist' && (cap === null || others.filter(occupiesSeat).length < cap)) {
          return { ok: false, error: 'Il reste des places : la liste d\'attente ne sert que lorsque l\'événement est complet.', promoted: [] };
        }
        let promoted = [];
        mutate(eventId, e => {
          const list = e.participants.map(p => (p.id === pid ? next : p));
          const r = promoteWaitlist(e, list);
          promoted = r.promoted;
          return { ...e, participants: r.participants };
        });
        return { ok: true, promoted };
      },

      removeParticipant: (eventId, pid) => {
        let promoted = [];
        mutate(eventId, e => {
          const r = promoteWaitlist(e, (e.participants || []).filter(p => p.id !== pid));
          promoted = r.promoted;
          return { ...e, participants: r.participants };
        });
        return { promoted };
      },

      // ── Bilan ──
      setReview: (eventId, review) => mutate(eventId, ev => ({
        ...ev,
        review: {
          summary: String(review.summary ?? ''),
          attendance: Number.isFinite(Number(review.attendance)) && review.attendance !== '' ? Math.max(0, Math.round(Number(review.attendance))) : 0,
          ...(review.satisfaction ? { satisfaction: Math.min(5, Math.max(1, Number(review.satisfaction))) } : {}),
          lessons: String(review.lessons ?? ''),
        },
      })),
    };
  },
});

// ── Sélecteurs pour les autres modules (dériver avec useMemo) ──
/** Liste triée par date de début. */
export const listEvents = (eventsMap) => Object.values(eventsMap || {})
  .sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));

/** Prochains événements non brouillons / non annulés. */
export const upcomingEvents = (eventsMap, now = new Date()) => listEvents(eventsMap)
  .filter(e => !['draft', 'cancelled'].includes(e.status) && new Date(e.end || e.start) >= now);
