// ============================================================
// ÉVÉNEMENTS — LOGIQUE PURE (sans React ni store)
// ============================================================
// Capacité / liste d'attente, statistiques, import de participants,
// texte d'annonce, fichier iCalendar (.ics), dates.
// Forme des données : voir `events` dans src/modules/contracts.js.

import { EVENT_TYPES, EVENT_STATUSES } from '../contracts.js';

export const PARTICIPANT_STATUSES = [
  { id: 'registered', label: 'Inscrit', badge: 'badge-brand' },
  { id: 'waitlist', label: 'Liste d\'attente', badge: 'badge-amber' },
  { id: 'present', label: 'Présent', badge: 'badge-emerald' },
  { id: 'absent', label: 'Absent', badge: 'badge-rose' },
  { id: 'cancelled', label: 'Annulé', badge: 'badge-neutral' },
];

export const STATUS_BADGE = {
  draft: 'badge-neutral', planned: 'badge-violet', open: 'badge-brand', done: 'badge-emerald', cancelled: 'badge-rose',
};

export const typeOf = (id) => EVENT_TYPES.find(t => t.id === id) || EVENT_TYPES[EVENT_TYPES.length - 1];
export const statusLabel = (id) => EVENT_STATUSES.find(s => s.id === id)?.label || id;
export const participantStatusOf = (id) => PARTICIPANT_STATUSES.find(s => s.id === id) || PARTICIPANT_STATUSES[0];

// ── Places ──────────────────────────────────────────────────
/** Statuts qui occupent une place (l'absent avait réservé sa place). */
export const SEAT_STATUSES = ['registered', 'present', 'absent'];
export const occupiesSeat = (p) => SEAT_STATUSES.includes(p?.status);

/** Capacité numérique (> 0) ou null si illimitée. */
export function capacityOf(ev) {
  const c = Number(ev?.capacity);
  return Number.isFinite(c) && c > 0 ? Math.floor(c) : null;
}

export function seatCount(participants = []) {
  return participants.filter(occupiesSeat).length;
}

export function freeSeats(ev) {
  const cap = capacityOf(ev);
  if (cap === null) return Infinity;
  return Math.max(0, cap - seatCount(ev?.participants || []));
}

/**
 * Promeut la liste d'attente (ordre d'inscription = ordre du tableau) tant
 * qu'il reste des places. Renvoie { participants, promoted: participant[] }.
 */
export function promoteWaitlist(ev, participants = ev?.participants || []) {
  const cap = capacityOf(ev);
  let seats = seatCount(participants);
  const promoted = [];
  const next = participants.map(p => {
    if (p.status !== 'waitlist') return p;
    if (cap !== null && seats >= cap) return p;
    seats++;
    const up = { ...p, status: 'registered' };
    promoted.push(up);
    return up;
  });
  return { participants: promoted.length ? next : participants, promoted };
}

/** Statut d'arrivée d'un nouvel inscrit : inscrit, ou liste d'attente si complet. */
export function arrivalStatus(ev, participants = ev?.participants || []) {
  const cap = capacityOf(ev);
  return cap !== null && seatCount(participants) >= cap ? 'waitlist' : 'registered';
}

// ── Statistiques ────────────────────────────────────────────
export function eventStats(ev) {
  const ps = ev?.participants || [];
  const count = (st) => ps.filter(p => p.status === st).length;
  const tasks = ev?.tasks || [];
  const done = tasks.filter(t => t.done).length;
  const present = count('present');
  const absent = count('absent');
  const seats = seatCount(ps);
  return {
    registered: count('registered'),
    waitlist: count('waitlist'),
    present,
    absent,
    cancelled: count('cancelled'),
    seats,
    capacity: capacityOf(ev),
    paid: ps.filter(p => p.paid && p.status !== 'cancelled').length,
    tasksDone: done,
    tasksTotal: tasks.length,
    taskProgress: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
    // Fréquentation : présents / (présents + absents) si pointage fait, sinon / places.
    attendanceRate: present + absent > 0
      ? Math.round((present / (present + absent)) * 100)
      : (seats > 0 && present > 0 ? Math.round((present / seats) * 100) : null),
    fillRate: capacityOf(ev) ? Math.min(100, Math.round((seats / capacityOf(ev)) * 100)) : null,
    volunteers: (ev?.volunteers || []).length,
  };
}

// ── Dates ───────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');

/** ISO → { date: 'AAAA-MM-JJ', time: 'HH:MM' } en heure locale. */
export function splitIso(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return { date: '', time: '' };
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/** 'AAAA-MM-JJ' + 'HH:MM' (heure locale) → ISO, ou '' si invalide. */
export function joinIso(date, time = '00:00') {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  if (!m) return '';
  const t = /^(\d{1,2}):(\d{2})$/.exec(time || '') || [null, '0', '0'];
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(t[1]), Number(t[2]));
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

/** Décale une date ISO (ou 'AAAA-MM-JJ') de n années, en gardant le jour de la semaine proche. */
export function shiftYears(value, years) {
  if (!value) return value;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = dateOnly ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const out = new Date(d);
  out.setFullYear(d.getFullYear() + years);
  // Récurrence annuelle (ex. WEI) : on garde le même jour de la semaine
  // (décalage de 1 ou 2 jours vers la date la plus proche).
  const diff = ((d.getDay() - out.getDay()) + 7) % 7;
  out.setDate(out.getDate() + (diff > 3 ? diff - 7 : diff));
  if (dateOnly) return `${out.getFullYear()}-${pad(out.getMonth() + 1)}-${pad(out.getDate())}`;
  return out.toISOString();
}

/** « sam. 12 oct. · 18:30 → 23:00 » */
export function formatRange(start, end) {
  const s = start ? new Date(start) : null;
  if (!s || Number.isNaN(s.getTime())) return 'Date à définir';
  const e = end ? new Date(end) : null;
  const day = (d) => d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const hour = (d) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (!e || Number.isNaN(e.getTime())) return `${day(s)} · ${hour(s)}`;
  if (s.toDateString() === e.toDateString()) return `${day(s)} · ${hour(s)} → ${hour(e)}`;
  return `${day(s)} ${hour(s)} → ${day(e)} ${hour(e)}`;
}

/** Durée lisible (« 3 h 30 », « 2 jours »). */
export function durationLabel(start, end) {
  const s = new Date(start); const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e <= s) return '';
  const minutes = Math.round((e - s) / 60000);
  if (minutes >= 24 * 60) {
    const days = Math.round(minutes / (24 * 60));
    return `${days} jour${days > 1 ? 's' : ''}`;
  }
  const h = Math.floor(minutes / 60); const m = minutes % 60;
  return h ? `${h} h${m ? ` ${pad(m)}` : ''}` : `${m} min`;
}

/** Catégorie temporelle d'un événement pour les vues de la liste. */
export function eventBucket(ev, now = new Date()) {
  if (ev.status === 'draft') return 'draft';
  const end = new Date(ev.end || ev.start);
  if (!Number.isNaN(end.getTime()) && end < now) return 'past';
  return 'upcoming';
}

// ── Import de participants (CSV ou liste collée) ────────────
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const EMAIL_RE = /[^\s,;<>"']+@[^\s,;<>"']+\.[^\s,;<>"']+/;

function splitCsvLine(line, sep) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

/**
 * Analyse un CSV (séparateur , ; ou tabulation) ou une liste collée
 * (« Prénom Nom », « Prénom Nom <mail> », « Nom ; mail »).
 * Rapproche chaque ligne d'un membre (e-mail, puis nom complet).
 * @returns {{ name, email, memberId }[]}
 */
export function parseParticipantList(text, members = []) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  // Sans en-tête, les cellules sont rejointes : une liste « Nom, Prénom » reste lisible.
  const sep = [';', '\t', ','].find(s => lines[0].includes(s)) || null;
  let rows = lines.map(l => (sep ? splitCsvLine(l, sep) : [l]));

  // En-tête éventuel.
  let idx = { first: -1, last: -1, name: -1, email: -1 };
  const head = rows[0].map(norm);
  const find = (...keys) => head.findIndex(h => keys.some(k => h === k || h.startsWith(k)));
  if (sep && head.some(h => /nom|name|mail|prenom/.test(h))) {
    idx = { first: find('prenom', 'first'), last: find('nom de famille', 'last', 'nom'), name: find('nom complet', 'participant', 'name'), email: find('e-mail', 'email', 'mail', 'courriel') };
    if (idx.last === idx.name) idx.name = -1;
    rows = rows.slice(1);
  }

  const byEmail = new Map(members.filter(m => m.email).map(m => [norm(m.email), m]));
  const byName = new Map();
  members.forEach(m => {
    const a = norm(`${m.firstName} ${m.lastName}`); const b = norm(`${m.lastName} ${m.firstName}`);
    if (a) byName.set(a, m);
    if (b) byName.set(b, m);
  });

  const seen = new Set();
  const out = [];
  rows.forEach(cells => {
    let name; let email;
    if (idx.first >= 0 || idx.last >= 0 || idx.name >= 0 || idx.email >= 0) {
      name = idx.name >= 0 ? cells[idx.name] : [cells[idx.first], cells[idx.last]].filter(Boolean).join(' ');
      email = idx.email >= 0 ? cells[idx.email] : '';
    } else {
      const joined = cells.join(' ');
      email = (joined.match(EMAIL_RE) || [''])[0];
      name = joined.replace(EMAIL_RE, ' ').replace(/[<>()]/g, ' ').replace(/^[-*•\d.)\s]+/, '').replace(/\s+/g, ' ').trim();
    }
    email = String(email || '').replace(/[<>]/g, '').trim().toLowerCase();
    name = String(name || '').trim();
    if (!name && email) name = email.split('@')[0];
    if (!name) return;
    const member = (email && byEmail.get(norm(email))) || byName.get(norm(name)) || null;
    const key = member ? `m:${member.id}` : (email ? `e:${email}` : `n:${norm(name)}`);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      name: member ? `${member.firstName || ''} ${member.lastName || ''}`.trim() || name : name,
      email: email || member?.email || '',
      memberId: member?.id || null,
    });
  });
  return out;
}

/** Clé de dédoublonnage d'un participant (membre, e-mail ou nom). */
export function participantKey(p) {
  if (p.memberId) return `m:${p.memberId}`;
  if (p.email) return `e:${norm(p.email)}`;
  return `n:${norm(p.name)}`;
}

// ── Annonce ─────────────────────────────────────────────────
export function announcementText(ev, { channel = 'whatsapp', orgName = '', poleLabel = '' } = {}) {
  const t = typeOf(ev.type);
  const when = formatRange(ev.start, ev.end);
  const price = Number(ev.price) > 0 ? `${String(Number(ev.price).toFixed(2)).replace('.', ',').replace(',00', '')} €` : 'Gratuit';
  const cap = capacityOf(ev);
  const left = cap ? freeSeats(ev) : null;
  const desc = String(ev.description || '').trim();
  if (channel === 'instagram') {
    const tags = ['#BDE', `#${t.label.replace(/[^\p{L}\p{N}]/gu, '')}`, orgName ? `#${orgName.replace(/[^\p{L}\p{N}]/gu, '')}` : '', '#VieEtudiante'].filter(Boolean);
    return [
      `${t.emoji} ${ev.title.toUpperCase()} ${t.emoji}`,
      '',
      desc,
      desc ? '' : null,
      `📅 ${when}`,
      ev.location ? `📍 ${ev.location}` : null,
      `🎟️ ${price}${cap ? ` · ${cap} places` : ''}`,
      '',
      'Infos et inscriptions en bio 🔗',
      '',
      tags.join(' '),
    ].filter(l => l !== null).join('\n');
  }
  return [
    `${t.emoji} *${ev.title}*`,
    poleLabel ? `_Organisé par ${poleLabel}${orgName ? ` — ${orgName}` : ''}_` : (orgName ? `_${orgName}_` : null),
    '',
    desc || null,
    desc ? '' : null,
    `📅 *Quand :* ${when}`,
    ev.location ? `📍 *Où :* ${ev.location}` : null,
    `💶 *Prix :* ${price}`,
    cap ? `👥 *Places :* ${cap}${left === 0 ? ' — complet, liste d\'attente ouverte' : left !== null && left < cap ? ` (plus que ${left} !)` : ''}` : null,
    '',
    '👉 Réponds à ce message pour t\'inscrire !',
  ].filter(l => l !== null).join('\n');
}

// ── iCalendar (RFC 5545) ────────────────────────────────────
const icsDate = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const icsEscape = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Plie les lignes à 75 octets (continuation par une espace). */
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = []; let cur = ''; let len = 0;
  for (const ch of line) {
    const l = new TextEncoder().encode(ch).length;
    if (len + l > (out.length ? 74 : 75)) { out.push(cur); cur = ''; len = 0; }
    cur += ch; len += l;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function buildIcs(ev, { orgName = '', now = new Date() } = {}) {
  const start = new Date(ev.start);
  if (Number.isNaN(start.getTime())) throw new Error('Date de début manquante.');
  let end = new Date(ev.end);
  if (Number.isNaN(end.getTime()) || end <= start) end = new Date(start.getTime() + 2 * 3600000);
  const status = ev.status === 'cancelled' ? 'CANCELLED' : (ev.status === 'draft' ? 'TENTATIVE' : 'CONFIRMED');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BDE Manager//Evenements//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${ev.id}@bde-manager`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(ev.title)}`,
    (ev.description || orgName) ? `DESCRIPTION:${icsEscape([ev.description, orgName && `Organisé par ${orgName}`].filter(Boolean).join('\n\n'))}` : null,
    ev.location ? `LOCATION:${icsEscape(ev.location)}` : null,
    `CATEGORIES:${icsEscape(typeOf(ev.type).label)}`,
    `STATUS:${status}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsEscape(ev.title)}`,
    'TRIGGER:-PT1H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** Nom de fichier sûr. */
export const safeName = (s) => String(s || 'evenement').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '_').slice(0, 60) || 'evenement';

/** Télécharge un texte comme fichier. */
export function downloadFile(text, fileName, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Événement vierge (formulaire de création). */
export function blankEvent(defaults = {}) {
  const d = new Date();
  d.setDate(d.getDate() + 14); d.setHours(19, 0, 0, 0);
  const e = new Date(d); e.setHours(23, 0, 0, 0);
  return {
    title: '', description: '', type: 'soiree', status: 'draft',
    start: d.toISOString(), end: e.toISOString(), location: '', poleId: '',
    responsibleIds: [], capacity: '', price: '', budgetId: '',
    tasks: [], volunteers: [], participants: [],
    ...defaults,
  };
}
