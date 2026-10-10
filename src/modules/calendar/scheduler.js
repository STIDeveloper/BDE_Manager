// ============================================================
// AGENDA — planificateur de notifications (navigateur, app ouverte)
// ============================================================
// À l'ouverture de l'app puis toutes les ~15 min (et au retour sur l'onglet),
// notifie les échéances du jour / en retard pas encore notifiées.
// Limite assumée : sans serveur de push, AUCUNE notification n'est envoyée
// quand l'application est fermée.
// L'anti-répétition est propre à l'appareil (localStorage, non synchronisée) :
// chaque appareil notifie une fois chaque échéance.
// ============================================================

import { useStore } from '../../store.js';
import { useCalendarStore, DEFAULT_CALENDAR_SETTINGS } from './store.js';
import { getAgendaSnapshot } from './sources.js';
import { notificationCandidates, nextDirigeantsChange, ymd, addDays, SOURCE_LABELS } from './agenda.js';
import { buildContext } from '../../documents/context.js';
import { timeLabel } from './format.js';

const NOTIFIED_KEY = 'bde-calendar-notified';
const INTERVAL_MS = 15 * 60 * 1000;
let started = false;
let timer = null;

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;
export const notificationPermission = () => (notificationsSupported() ? Notification.permission : 'unsupported');

export function readNotified() {
  try { return JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '{}') || {}; } catch { return {}; }
}
function writeNotified(map) {
  // Purge des entrées de plus de 120 jours.
  const limit = Date.now() - 120 * 86400000;
  const kept = Object.fromEntries(Object.entries(map).filter(([, at]) => new Date(at).getTime() > limit));
  try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify(kept)); } catch { /* stockage indisponible */ }
}
export function resetNotified() {
  try { localStorage.removeItem(NOTIFIED_KEY); } catch { /* ignoré */ }
}

/** Affiche une notification (via le service worker si possible). */
export async function showNotification(title, options = {}) {
  if (notificationPermission() !== 'granted') return false;
  const opts = { icon: '/icon-192.png', badge: '/icon-192.png', lang: 'fr', ...options };
  try {
    if ('serviceWorker' in navigator) {
      const reg = await Promise.race([
        navigator.serviceWorker.getRegistration(),
        new Promise(r => setTimeout(() => r(null), 1500)),
      ]);
      if (reg?.active) {
        await reg.showNotification(title, opts);
        return true;
      }
    }
  } catch { /* repli sur l'API Notification ci-dessous */ }
  try {
    const n = new Notification(title, opts);
    n.onclick = () => { window.focus(); window.location.hash = '/calendar'; n.close(); };
    return true;
  } catch {
    return false;
  }
}

/** Mémorise la date du changement de bureau constaté (déclaration des dirigeants). */
export function recordDirigeantsChange(today) {
  const main = useStore.getState();
  const cal = useCalendarStore.getState();
  const ctx = buildContext(main, { today });
  const next = nextDirigeantsChange(ctx, cal.settings?.dirigeantsChange, today);
  if (!next) return;
  cal.updateSettings({ dirigeantsChange: next.clear ? null : next });
}

/** Une passe de vérification. Renvoie le nombre d'échéances notifiées. */
export async function checkNow({ force = false } = {}) {
  const today = ymd(new Date());
  try { recordDirigeantsChange(today); } catch { /* sans effet sur les notifications */ }
  const settings = { ...DEFAULT_CALENDAR_SETTINGS, ...useCalendarStore.getState().settings };
  if (!settings.notifications && !force) return 0;
  if (notificationPermission() !== 'granted') return 0;

  const items = getAgendaSnapshot({ today, from: addDays(today, -60), to: today });
  const notified = readNotified();
  const due = notificationCandidates(items, today, notified);
  if (!due.length) return 0;

  const now = new Date().toISOString();
  if (due.length <= 3) {
    for (const it of due) {
      const when = it.severity === 'overdue' ? 'En retard' : it.time ? `Aujourd'hui à ${timeLabel(it.time)}` : 'Aujourd\'hui';
      await showNotification(it.title, {
        body: `${when} · ${SOURCE_LABELS[it.source] || 'Agenda'}${it.subtitle ? ` — ${it.subtitle}` : ''}`,
        tag: `bde-agenda-${it.key}`,
        data: { url: '/#/calendar' },
      });
    }
  } else {
    const overdue = due.filter(i => i.severity === 'overdue').length;
    await showNotification(`${due.length} échéances à traiter`, {
      body: `${overdue ? `${overdue} en retard, ` : ''}${due.length - overdue} aujourd'hui. Ouvre l'agenda pour le détail.`,
      tag: 'bde-agenda-digest',
      data: { url: '/#/calendar' },
    });
  }
  due.forEach(i => { notified[i.key] = now; });
  writeNotified(notified);
  useCalendarStore.getState().updateSettings({ lastNotifiedAt: now });
  return due.length;
}

export function startScheduler() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const run = () => { checkNow().catch(() => {}); };
  run();
  timer = setInterval(run, INTERVAL_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run(); });
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}
