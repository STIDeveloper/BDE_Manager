// ============================================================
// AGENDA — export iCalendar (.ics, RFC 5545) — PUR
// ============================================================
// - lignes terminées par CRLF, pliées à 75 octets (UTF-8) ;
// - échappement TEXT (\\ ; , retours à la ligne) ;
// - UID stables (même élément → même UID : un ré-import met à jour) ;
// - événements datés en UTC, rappels horaires en Europe/Paris (VTIMEZONE
//   inclus), échéances sans heure en dates entières (VALUE=DATE) ;
// - rappels récurrents exportés en RRULE (+ EXDATE des occurrences faites) ;
// - VALARM sur les rappels et échéances à traiter.
// ============================================================

import { addDays, SOURCE_LABELS, categoryOf } from './agenda.js';

const CRLF = '\r\n';
const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const byteLen = (s) => (encoder ? encoder.encode(s).length : unescape(encodeURIComponent(s)).length);

/** Échappement d'une valeur TEXT. */
export function escapeText(v) {
  return String(v ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Pliage d'une ligne de contenu à 75 octets (sans couper un caractère UTF-8). */
export function foldLine(line) {
  if (byteLen(line) <= 75) return line;
  const out = [];
  let cur = '';
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = byteLen(ch);
    if (curBytes + b > limit) {
      out.push(cur);
      cur = ' ';
      curBytes = 1;
      limit = 75;
    }
    cur += ch;
    curBytes += b;
  }
  out.push(cur);
  return out.join(CRLF);
}

const compactDate = (ymd) => ymd.replace(/-/g, '');
const compactTime = (hhmm) => `${hhmm.replace(':', '')}00`;
export function utcStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

const VTIMEZONE_PARIS = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Paris',
  'X-LIC-LOCATION:Europe/Paris',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

const RRULES = { weekly: 'FREQ=WEEKLY', monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY' };

function alarm(description, allDay) {
  return [
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(description)}`,
    // Journée entière : la veille à 9 h ; horaire : 30 min avant.
    allDay ? 'TRIGGER:-PT15H' : 'TRIGGER:-PT30M',
    'END:VALARM',
  ];
}

/** Dates de début / fin d'un élément (propriétés iCalendar). */
function timing(item) {
  if (item.source === 'event' && item.start) {
    const start = new Date(item.start);
    const end = item.end ? new Date(item.end) : null;
    if (!Number.isNaN(start.getTime())) {
      const validEnd = end && !Number.isNaN(end.getTime()) && end > start ? end : new Date(start.getTime() + 3600000);
      return { allDay: false, lines: [`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(validEnd)}`] };
    }
  }
  if (item.time) {
    const [h, m] = item.time.split(':').map(Number);
    const endH = String(Math.min(23, h + 1)).padStart(2, '0');
    const endTime = h >= 23 ? '23:59' : `${endH}:${String(m).padStart(2, '0')}`;
    return {
      allDay: false,
      lines: [
        `DTSTART;TZID=Europe/Paris:${compactDate(item.date)}T${compactTime(item.time)}`,
        `DTEND;TZID=Europe/Paris:${compactDate(item.date)}T${compactTime(endTime)}`,
      ],
    };
  }
  return {
    allDay: true,
    lines: [
      `DTSTART;VALUE=DATE:${compactDate(item.date)}`,
      `DTEND;VALUE=DATE:${compactDate(addDays(item.endDate || item.date, 1))}`,
    ],
  };
}

const uidOf = (id, host) => `bde-${String(id).replace(/[^A-Za-z0-9._:-]/g, '-')}@${host}`;

/**
 * @param {{ items: object[], reminders: object, calendarName?: string, host?: string, now?: Date }} p
 *   items : éléments calculés (les rappels personnalisés sont exportés depuis `reminders`).
 * @returns {string} contenu du fichier .ics
 */
export function buildIcs({ items = [], reminders = {}, calendarName = 'BDE Manager', host = 'bde-manager.local', now = new Date() }) {
  const stamp = utcStamp(now);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BDE Manager//Agenda//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    'X-WR-TIMEZONE:Europe/Paris',
    `X-WR-CALDESC:${escapeText('Agenda de l\'association — usage interne, contient des données personnelles (noms des membres).')}`,
    ...VTIMEZONE_PARIS,
  ];

  // Éléments calculés (hors rappels personnalisés), une occurrence = un VEVENT.
  items.filter(i => i.source !== 'reminder').forEach(item => {
    const t = timing(item);
    const desc = [item.subtitle, item.notes, `Source : ${SOURCE_LABELS[item.source] || 'Agenda'} (BDE Manager)`].filter(Boolean).join('\n');
    lines.push(
      'BEGIN:VEVENT',
      // UID stable par élément (l'échéance peut se déplacer sans créer de doublon) ;
      // seule l'assurance (une occurrence par an) inclut la date.
      `UID:${uidOf(item.source === 'insurance' ? `${item.id}-${item.date}` : item.id, host)}`,
      `DTSTAMP:${stamp}`,
      ...t.lines,
      `SUMMARY:${escapeText(item.asap ? `${item.title} (dès que possible)` : item.title)}`,
      `DESCRIPTION:${escapeText(desc)}`,
      `CATEGORIES:${escapeText(categoryOf(item.category).label)}`,
      ...(item.source === 'event' && item.subtitle ? [`LOCATION:${escapeText(item.subtitle)}`] : []),
      'TRANSP:TRANSPARENT',
      ...(item.actionable && !item.done ? alarm(item.title, t.allDay) : []),
      'END:VEVENT',
    );
  });

  // Rappels personnalisés : un VEVENT par rappel (RRULE si récurrent).
  Object.values(reminders || {}).forEach(r => {
    if (!r || !/^\d{4}-\d{2}-\d{2}$/.test(r.date || '')) return;
    const recurring = RRULES[r.recurrence];
    const t = timing({ date: r.date, time: r.time || undefined });
    const done = !recurring && r.done;
    const exdates = recurring ? (r.doneDates || []).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
    const exLine = exdates.length
      ? (r.time
        ? `EXDATE;TZID=Europe/Paris:${exdates.map(d => `${compactDate(d)}T${compactTime(r.time)}`).join(',')}`
        : `EXDATE;VALUE=DATE:${exdates.map(compactDate).join(',')}`)
      : null;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uidOf(`reminder-${r.id}`, host)}`,
      `DTSTAMP:${stamp}`,
      ...t.lines,
      ...(recurring ? [`RRULE:${recurring}`] : []),
      ...(exLine ? [exLine] : []),
      `SUMMARY:${escapeText(`${done ? '✓ ' : ''}${r.title}`)}`,
      ...(r.notes ? [`DESCRIPTION:${escapeText(r.notes)}`] : []),
      `CATEGORIES:${escapeText(categoryOf(r.category).label)}`,
      'TRANSP:TRANSPARENT',
      ...(done ? [] : alarm(r.title, t.allDay)),
      'END:VEVENT',
    );
  });

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join(CRLF) + CRLF;
}

/** Déclenche le téléchargement du fichier .ics. */
export function downloadIcs(content, fileName = 'agenda-bde.ics') {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
