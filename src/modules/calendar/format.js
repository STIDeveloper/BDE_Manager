// Formats d'affichage (français) propres à l'agenda.
import { parseYmd, diffDays } from './agenda.js';

const fmt = (opts) => new Intl.DateTimeFormat('fr-FR', opts);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// « 1 octobre » → « 1er octobre ».
const first = (s) => s.replace(/(^|\s)1 (?=\D)/, '$11er ');

export const monthLabel = (ymd) => cap(fmt({ month: 'long', year: 'numeric' }).format(parseYmd(ymd)));
export const dayLabel = (ymd) => first(cap(fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(parseYmd(ymd))));
export const dayLabelYear = (ymd) => first(cap(fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(parseYmd(ymd))));
export const shortDay = (ymd) => first(fmt({ day: 'numeric', month: 'short' }).format(parseYmd(ymd)));
export const weekdayShort = (ymd) => cap(fmt({ weekday: 'short' }).format(parseYmd(ymd)).replace('.', ''));
export function timeLabel(hhmm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || ''));
  if (!m) return '';
  return m[2] === '00' ? `${Number(m[1])} h` : `${Number(m[1])} h ${m[2]}`;
}

/** « aujourd'hui », « demain », « dans 5 jours », « il y a 3 jours ». */
export function relativeLabel(date, today) {
  const d = diffDays(today, date);
  if (Number.isNaN(d)) return '';
  if (d === 0) return 'aujourd\'hui';
  if (d === 1) return 'demain';
  if (d === -1) return 'hier';
  return d > 0 ? `dans ${d} jours` : `il y a ${-d} jours`;
}

export const WEEKDAY_HEADERS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export const SEVERITY_STYLES = {
  overdue: 'badge-rose',
  today: 'badge-amber',
  soon: 'badge-amber',
  upcoming: 'badge-neutral',
  past: 'badge-neutral',
  done: 'badge-emerald',
};
