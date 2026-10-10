// ============================================================
// AGENDA — calcul PUR des éléments datés (aucun accès aux stores)
// ============================================================
// getAgendaItems(ctx) agrège toutes les échéances de l'association :
//   - événements (store events) et échéances de leurs tâches ;
//   - débuts / fins de mandat (members[].mandateStart / mandateEnd) ;
//   - AG annuelle (dernière convocation / PV émis + intervalle, ou date manuelle) ;
//   - déclaration des dirigeants (changement de bureau → 3 mois) ;
//   - cotisations en attente de la campagne en cours (module membership) ;
//   - renouvellement de l'assurance (réglage) ;
//   - rappels personnalisés (occurrences des récurrences générées).
//
// Élément : { id, key, date: 'AAAA-MM-JJ', endDate?, time?, title, subtitle?,
//   category, source, severity, actionable, asap?, link: { section, path? },
//   done?, reminderId?, notes? }
// severity : 'overdue' | 'today' | 'soon' (≤ 7 j) | 'upcoming' | 'past' | 'done'
// ============================================================

import { buildContext, bureauMembers, fullName, roleLabelOf, formatDateLong } from '../../documents/context.js';
import gouvernance, { latestDirigeantsEntry } from '../../documents/templates/gouvernance.js';

export const CATEGORIES = [
  { id: 'conformite', label: 'Conformité', dot: 'bg-rose-500', badge: 'badge-rose', pill: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30' },
  { id: 'finance', label: 'Finances', dot: 'bg-emerald-500', badge: 'badge-emerald', pill: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' },
  { id: 'equipe', label: 'Équipe', dot: 'bg-violet-500', badge: 'badge-violet', pill: 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30' },
  { id: 'evenement', label: 'Événements', dot: 'bg-blue-500', badge: 'badge-brand', pill: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30' },
  { id: 'autre', label: 'Autre', dot: 'bg-amber-500', badge: 'badge-amber', pill: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30' },
];
export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));
export const categoryOf = (id) => CATEGORY_BY_ID[id] || CATEGORY_BY_ID.autre;

export const RECURRENCES = [
  { id: 'none', label: 'Une seule fois' },
  { id: 'weekly', label: 'Chaque semaine' },
  { id: 'monthly', label: 'Chaque mois' },
  { id: 'yearly', label: 'Chaque année' },
];

export const SOURCE_LABELS = {
  event: 'Événement',
  task: 'Tâche d\'événement',
  'mandate-start': 'Début de mandat',
  'mandate-end': 'Fin de mandat',
  ag: 'Assemblée générale',
  dirigeants: 'Déclaration des dirigeants',
  cotisation: 'Cotisations',
  insurance: 'Assurance',
  reminder: 'Rappel',
};

// ------------------------------------------------------------
// Dates locales 'AAAA-MM-JJ'
// ------------------------------------------------------------

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function parseYmd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}
export const isYmd = (s) => !!parseYmd(s);
export function addDays(s, n) {
  const d = parseYmd(s);
  if (!d) return s;
  d.setDate(d.getDate() + n);
  return ymd(d);
}
/** Ajoute n mois en bornant le jour (31 janvier + 1 mois → 28/29 février). */
export function addMonths(s, n) {
  const d = parseYmd(s);
  if (!d) return s;
  const day = d.getDate();
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(day, last));
  return ymd(t);
}
export function diffDays(a, b) {
  const da = parseYmd(a); const db = parseYmd(b);
  if (!da || !db) return NaN;
  return Math.round((Date.UTC(db.getFullYear(), db.getMonth(), db.getDate()) - Date.UTC(da.getFullYear(), da.getMonth(), da.getDate())) / 86400000);
}
/** Lundi de la semaine contenant s. */
export function startOfWeek(s) {
  const d = parseYmd(s);
  const wd = (d.getDay() + 6) % 7;
  return addDays(s, -wd);
}
/** Date locale + heure 'HH:MM' d'un horodatage ISO. */
export function splitIso(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return { date: null, time: null };
  return { date: ymd(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}
const isoToYmd = (v) => (isYmd(v) && String(v).length === 10 ? v : splitIso(v).date);

// ------------------------------------------------------------
// Sévérité
// ------------------------------------------------------------

export function severityOf(date, today, { actionable = true, done = false, soonDays = 7 } = {}) {
  if (done) return 'done';
  const d = diffDays(today, date);
  if (Number.isNaN(d)) return 'upcoming';
  if (d < 0) return actionable ? 'overdue' : 'past';
  if (d === 0) return 'today';
  if (d <= soonDays) return 'soon';
  return 'upcoming';
}

// ------------------------------------------------------------
// Récurrences
// ------------------------------------------------------------

/** Occurrences d'un rappel dans [from, to] (au plus `max`). */
export function reminderOccurrences(r, from, to, max = 400) {
  if (!isYmd(r?.date)) return [];
  if (!r.recurrence || r.recurrence === 'none') return r.date >= from && r.date <= to ? [r.date] : [];
  const step = (k) => (r.recurrence === 'weekly' ? addDays(r.date, 7 * k)
    : r.recurrence === 'monthly' ? addMonths(r.date, k) : addMonths(r.date, 12 * k));
  // Saut direct près de `from` pour éviter d'itérer sur des années.
  let k = 0;
  if (from > r.date) {
    const gap = diffDays(r.date, from);
    k = Math.max(0, r.recurrence === 'weekly' ? Math.floor(gap / 7) - 1
      : r.recurrence === 'monthly' ? Math.floor(gap / 31) - 1 : Math.floor(gap / 366) - 1);
  }
  const out = [];
  for (let guard = 0; guard < 5000 && out.length < max; guard++, k++) {
    const d = step(k);
    if (d > to) break;
    if (d >= from) out.push(d);
  }
  return out;
}

// ------------------------------------------------------------
// Déclaration des dirigeants
// ------------------------------------------------------------

const DIRIGEANTS_TEMPLATE = gouvernance.find(t => t.id === 'liste-dirigeants');

/** Signature de la composition actuelle du bureau (membre:rôle triés). */
export function bureauSignature(ctx) {
  return bureauMembers(ctx).map(m => `${m.id}:${m.mainRole || ''}`).sort().join('|');
}

/** Suggestion « liste des dirigeants » du modèle (ou null si rien à déclarer). */
export function dirigeantsSuggestion(ctx) {
  try {
    const [s] = DIRIGEANTS_TEMPLATE?.suggest?.(ctx) || [];
    return s || null;
  } catch {
    return null;
  }
}

/**
 * Valeur à mémoriser dans settings.dirigeantsChange (date à laquelle l'app
 * a constaté le changement), ou null si rien à changer.
 */
export function nextDirigeantsChange(ctx, current, today) {
  const sugg = dirigeantsSuggestion(ctx);
  if (!sugg || sugg.id !== 'liste-dirigeants-modification') return current ? { clear: true } : null;
  const signature = bureauSignature(ctx);
  if (current?.signature === signature) return null;
  // Composition différente : on garde la date du premier constat si un changement était déjà en attente.
  return { signature, since: current?.since || today };
}

// ------------------------------------------------------------
// Agrégation
// ------------------------------------------------------------

const DEFAULT_SETTINGS = { agIntervalMonths: 12 };

/**
 * @param {{ main?: object, documentLog?: object[], events?: object, memberships?: object,
 *   membershipSettings?: object, reminders?: object, settings?: object,
 *   today?: string, from?: string, to?: string }} input
 * @returns {object[]} éléments triés par date puis heure
 */
export function getAgendaItems(input = {}) {
  const today = input.today || ymd(new Date());
  const from = input.from || addDays(today, -60);
  const to = input.to || addDays(today, 400);
  const settings = { ...DEFAULT_SETTINGS, ...(input.settings || {}) };
  const main = input.main || {};
  const documentLog = input.documentLog || main.documentLog || [];
  const ctx = buildContext({ ...main, documentLog }, { today });
  const inRange = (d) => d && d >= from && d <= to;
  const items = [];
  const push = (it) => {
    const severity = it.asap ? (it.done ? 'done' : 'soon')
      : severityOf(it.date, today, { actionable: it.actionable, done: it.done, soonDays: it.soonDays });
    items.push({ ...it, key: `${it.id}@${it.date}`, severity });
  };

  // ── Événements + tâches ──
  const events = Object.values(input.events || {}).filter(e => e && e.status !== 'cancelled');
  let upcomingAgEvent = null;
  events.forEach(ev => {
    const s = splitIso(ev.start);
    const e = splitIso(ev.end);
    if (s.date) {
      if (ev.type === 'ag' && s.date >= today && (!upcomingAgEvent || s.date < splitIso(upcomingAgEvent.start).date)) upcomingAgEvent = ev;
      // Fin à minuit pile : l'événement ne déborde pas sur le jour suivant.
      const endT = ev.end ? new Date(ev.end).getTime() : NaN;
      const lastDay = Number.isFinite(endT) ? splitIso(new Date(endT - 60000).toISOString()).date : null;
      const endDate = lastDay && lastDay > s.date ? lastDay : undefined;
      if (inRange(s.date) || (endDate && s.date < from && endDate >= from)) {
        push({
          id: `event:${ev.id}`, source: 'event', category: 'evenement', actionable: false,
          date: s.date, endDate, time: s.time, endTime: e.time,
          start: ev.start, end: ev.end,
          title: ev.title || 'Événement', subtitle: ev.location || '',
          notes: ev.description || '', done: ev.status === 'done',
          link: { section: 'events', path: ev.id },
        });
      }
    }
    (ev.tasks || []).forEach(t => {
      const due = isoToYmd(t?.due);
      if (!due || t.done || !inRange(due)) return;
      push({
        id: `task:${ev.id}:${t.id}`, source: 'task', category: 'evenement', actionable: true,
        date: due, title: t.title || 'Tâche', subtitle: `Tâche — ${ev.title || 'événement'}`,
        link: { section: 'events', path: ev.id },
      });
    });
  });

  // ── Mandats ──
  ctx.members.forEach(m => {
    const name = fullName(m) || 'Membre';
    const role = roleLabelOf(ctx, m, '');
    if (isYmd(m.mandateEnd) && inRange(m.mandateEnd)) {
      push({
        id: `mandate-end:${m.id}`, source: 'mandate-end', category: 'equipe', actionable: false, soonDays: 30,
        date: m.mandateEnd, title: `Fin de mandat : ${name}`, subtitle: role,
        notes: 'Pense à préparer la passation (documents, accès, contacts).',
        link: { section: 'handover' }, fallbackLink: { section: 'kanban' },
      });
    }
    if (isYmd(m.mandateStart) && inRange(m.mandateStart)) {
      push({
        id: `mandate-start:${m.id}`, source: 'mandate-start', category: 'equipe', actionable: false,
        date: m.mandateStart, title: `Début de mandat : ${name}`, subtitle: role,
        link: { section: 'kanban' },
      });
    }
  });

  // ── AG annuelle ──
  if (upcomingAgEvent) {
    // L'événement « AG » planifié couvre déjà l'échéance : pas de doublon calculé.
  } else if (isYmd(settings.agDate)) {
    if (inRange(settings.agDate)) {
      push({
        id: 'ag', source: 'ag', category: 'conformite', actionable: true, soonDays: 30,
        date: settings.agDate, title: 'Assemblée générale annuelle', subtitle: 'Date fixée dans les réglages de l\'agenda',
        notes: 'Pense à convoquer les membres dans le délai prévu par les statuts.',
        link: { section: 'documents', path: 'convocation-ag' },
      });
    }
  } else {
    const time = (e) => { const t = new Date(e?.createdAt).getTime(); return Number.isFinite(t) ? t : 0; };
    const last = documentLog
      .filter(e => e && ['pv-ag', 'convocation-ag'].includes(e.templateId || e.meta?.templateId))
      .sort((a, b) => time(b) - time(a))[0];
    const interval = Math.max(1, Math.min(36, Number(settings.agIntervalMonths) || 12));
    if (last) {
      const base = isoToYmd(last.values?.date) || isoToYmd(last.createdAt);
      if (base) {
        const convened = base >= today;
        const date = convened ? base : addMonths(base, interval);
        if (inRange(date)) {
          push({
            id: 'ag', source: 'ag', category: 'conformite', actionable: true, soonDays: 30, date,
            time: convened && /^\d{2}:\d{2}$/.test(last.values?.heure || '') ? last.values.heure : undefined,
            title: convened ? 'Assemblée générale (convoquée)' : 'Assemblée générale annuelle à tenir',
            subtitle: convened
              ? `Convocation émise le ${formatDateLong(last.createdAt)}`
              : `Dernière AG le ${formatDateLong(base)} + ${interval} mois`,
            notes: convened ? '' : 'Échéance estimée : ajuste-la dans les réglages de l\'agenda si tes statuts prévoient une autre date.',
            link: { section: 'documents', path: convened ? 'pv-ag' : 'convocation-ag' },
          });
        }
      }
    } else {
      push({
        id: 'ag', source: 'ag', category: 'conformite', actionable: false, asap: true, date: today,
        title: 'Assemblée générale annuelle à planifier',
        subtitle: 'Aucune convocation ni PV d\'AG dans le registre',
        notes: 'Fixe la date dans les réglages de l\'agenda, ou émets la convocation depuis le studio documents.',
        link: { section: 'documents', path: 'convocation-ag' },
      });
    }
  }

  // ── Déclaration des dirigeants ──
  const sugg = dirigeantsSuggestion(ctx);
  if (sugg) {
    const lastList = latestDirigeantsEntry(documentLog);
    const lastAt = lastList ? isoToYmd(lastList.createdAt) : null;
    const starts = bureauMembers(ctx).map(m => m.mandateStart).filter(d => isYmd(d) && (!lastAt || d > lastAt)).sort();
    const sig = bureauSignature(ctx);
    const seen = settings.dirigeantsChange?.signature === sig ? settings.dirigeantsChange.since : null;
    const changeDate = starts[starts.length - 1] || (sugg.id === 'liste-dirigeants-modification' ? seen : null);
    const base = {
      id: 'dirigeants', source: 'dirigeants', category: 'conformite', actionable: true, soonDays: 30,
      notes: sugg.reason, link: { section: 'documents', path: 'liste-dirigeants' },
    };
    if (changeDate) {
      push({
        ...base, date: addMonths(changeDate, 3),
        title: 'Déclarer la modification des dirigeants',
        subtitle: `Changement du ${formatDateLong(changeDate)}${starts.length ? ' (début de mandat)' : ' (constaté par l\'app)'} + 3 mois`,
      });
    } else {
      push({
        ...base, date: today, asap: true,
        title: 'Déclarer la liste des dirigeants',
        subtitle: 'Dès que possible (date du changement inconnue)',
      });
    }
  }

  // ── Cotisations (campagne en cours) ──
  const msSettings = input.membershipSettings || {};
  const campaign = msSettings.campaignYear;
  if (campaign) {
    const due = Object.values(input.memberships || {}).filter(x => x && x.year === campaign && x.status === 'due');
    if (due.length) {
      const startYear = Number(String(campaign).slice(0, 4)) || new Date().getFullYear();
      const date = isYmd(msSettings.dueDate) ? msSettings.dueDate : `${startYear}-10-31`;
      push({
        id: `cotisation:${campaign}`, source: 'cotisation', category: 'finance', actionable: true, soonDays: 14, date,
        title: `Cotisations en attente : ${due.length}`,
        subtitle: `Campagne ${campaign}`,
        notes: isYmd(msSettings.dueDate) ? '' : 'Échéance par défaut (31 octobre) : la date limite n\'est pas fixée dans le module Adhésions.',
        link: { section: 'membership' },
      });
    }
  }

  // ── Assurance ──
  if (isYmd(settings.insuranceRenewal)) {
    reminderOccurrences({ date: settings.insuranceRenewal, recurrence: 'yearly' }, from, to, 5).forEach(d => {
      push({
        id: 'insurance', source: 'insurance', category: 'conformite', actionable: true, soonDays: 30, date: d,
        title: `Renouvellement de l'assurance${settings.insuranceLabel ? ` (${settings.insuranceLabel})` : ''}`,
        subtitle: 'Responsabilité civile / multirisque de l\'association',
        // Seule l'échéance la plus proche peut être « en retard ».
        link: { section: 'calendar' },
      });
    });
  }

  // ── Rappels personnalisés ──
  Object.values(input.reminders || {}).forEach(r => {
    if (!r || !isYmd(r.date)) return;
    const occ = reminderOccurrences(r, from, to);
    const recurring = r.recurrence && r.recurrence !== 'none';
    const doneDates = new Set(r.doneDates || []);
    const pastOpen = occ.filter(d => d < today && !doneDates.has(d));
    const latestDone = [...doneDates].sort().pop() || '';
    // Une occurrence cochée « solde » les occurrences manquées plus anciennes.
    const lastMissed = pastOpen.filter(d => d > latestDone).pop();
    occ.forEach(d => {
      const done = recurring ? doneDates.has(d) : !!r.done;
      push({
        id: `reminder:${r.id}`, reminderId: r.id, source: 'reminder', category: CATEGORY_BY_ID[r.category] ? r.category : 'autre',
        // Récurrence : seule la dernière occurrence manquée reste « en retard ».
        actionable: !recurring || d >= today || d === lastMissed,
        date: d, time: r.time || undefined, title: r.title || 'Rappel', notes: r.notes || '',
        subtitle: recurring ? RECURRENCES.find(x => x.id === r.recurrence)?.label : '',
        recurrence: r.recurrence || 'none', done,
        link: { section: 'calendar' },
      });
    });
  });

  // Une seule échéance d'assurance passée peut être en retard (la plus récente).
  const insPast = items.filter(i => i.source === 'insurance' && i.severity === 'overdue');
  insPast.slice(0, -1).forEach(i => { i.severity = 'past'; i.actionable = false; });

  return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.time || '99').localeCompare(b.time || '99')));
}

/** L'élément concerne-t-il le jour d (événements sur plusieurs jours compris) ? */
export const coversDay = (item, d) => item.date === d || (item.endDate && item.date <= d && item.endDate >= d);

/** Éléments à notifier : du jour ou en retard, non faits, non encore notifiés. */
export function notificationCandidates(items, today, notified = {}) {
  return items.filter(i => !i.done && !i.asap && i.date <= today
    && (i.severity === 'today' || i.severity === 'overdue')
    && !notified[i.key]);
}

/**
 * Ne garde que la prochaine occurrence à venir de chaque rappel récurrent
 * (vue liste, compteurs) : les occurrences passées / en retard sont conservées.
 */
export function collapseRecurring(items, today) {
  const seen = new Set();
  return items.filter(i => {
    if (i.source !== 'reminder' || !i.recurrence || i.recurrence === 'none' || i.date < today) return true;
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });
}

export const SEVERITY_LABELS = {
  overdue: 'En retard', today: 'Aujourd\'hui', soon: 'Bientôt', upcoming: 'À venir', past: 'Passé', done: 'Fait',
};
