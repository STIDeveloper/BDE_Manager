// ============================================================
// Moteur de formulaires — valeurs : conversions, égalité, dates
// ============================================================
// JavaScript pur (navigateur, Node, Deno). Aucune dépendance.
// Représentation des valeurs dans le moteur :
//   vide      → null (undefined, '' et [] sont aussi considérés vides)
//   nombre    → number fini
//   texte     → string
//   booléen   → boolean
//   date      → chaîne ISO 'AAAA-MM-JJ' (datetime : 'AAAA-MM-JJTHH:MM')
//   liste     → tableau (sélections multiples, réponses répétées)
//   objet     → { ... } (nom, adresse, matrice)

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
export { hasOwn };

export const MAX_TEXT = 100000;

/** Vrai si la valeur est « vide » (null, undefined, '', espaces, [], objet sans valeur). */
export function isEmpty(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (typeof v === 'number') return Number.isNaN(v);
  if (Array.isArray(v)) return v.length === 0 || v.every(isEmpty);
  if (typeof v === 'object') {
    for (const k in v) if (hasOwn(v, k) && !isEmpty(v[k])) return false;
    return true;
  }
  return false;
}

const NUM_RX = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/;

/** Convertit en nombre (« 12,5 », « 1 000 », true → 1). Renvoie null si impossible. */
export function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    const s = v.replace(/[\s\u00a0\u202f]/g, '');
    if (!s || s.length > 40 || !NUM_RX.test(s)) return null;
    const n = Number(s.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  if (Array.isArray(v) && v.length === 1) return toNumber(v[0]);
  return null;
}

/** Corrige les erreurs d'arrondi binaires (0,1 + 0,2 = 0,3). */
export function cleanNumber(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  if (Number.isInteger(n)) return n;
  return Number(n.toPrecision(15));
}

const TRUE_WORDS = new Set(['oui', 'vrai', 'true', 'yes', '1', 'on']);
const FALSE_WORDS = new Set(['non', 'faux', 'false', 'no', '0', 'off']);

/** Booléen « strict » : renvoie undefined si la valeur n'est pas interprétable comme booléen. */
export function toBoolStrict(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1 ? true : v === 0 ? false : undefined;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (TRUE_WORDS.has(s)) return true;
    if (FALSE_WORDS.has(s)) return false;
  }
  return undefined;
}

/** Valeur de vérité (conditions SI, ET, OU, showIf…). */
export function truthy(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s !== '' && !FALSE_WORDS.has(s);
  }
  if (Array.isArray(v)) return v.some(x => !isEmpty(x));
  return !isEmpty(v);
}

/** Formate un nombre à la française (virgule décimale, sans séparateur de milliers). */
export function numberToText(n) {
  return String(cleanNumber(n)).replace('.', ',');
}

/** Conversion en texte (concaténation &, CONCAT, CONTIENT). */
export function toText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? numberToText(v) : '';
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  if (Array.isArray(v)) return v.map(toText).filter(Boolean).join(', ');
  if (typeof v === 'object') {
    const parts = [];
    for (const k in v) if (hasOwn(v, k) && !isEmpty(v[k])) parts.push(toText(v[k]));
    return parts.join(' ');
  }
  return '';
}

/** Minuscule sans accents (comparaisons tolérantes, noms de fonctions). */
export function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// ── Dates ───────────────────────────────────────────────────

const ISO_DATE_RX = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const FR_DATE_RX = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function validYMD(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || y < 1 || y > 9999) return false;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= dim;
}

/** Analyse une date (ISO, JJ/MM/AAAA ou Date) → { y, m, d } ou null. */
export function parseDate(v) {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return { y: v.getUTCFullYear(), m: v.getUTCMonth() + 1, d: v.getUTCDate() };
  }
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let mt = ISO_DATE_RX.exec(s);
  if (mt) {
    const y = +mt[1], m = +mt[2], d = +mt[3];
    return validYMD(y, m, d) ? { y, m, d } : null;
  }
  mt = FR_DATE_RX.exec(s);
  if (mt) {
    const y = +mt[3], m = +mt[2], d = +mt[1];
    return validYMD(y, m, d) ? { y, m, d } : null;
  }
  return null;
}

const pad = (n, w = 2) => String(n).padStart(w, '0');
export const ymdToIso = ({ y, m, d }) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
export const ymdToDays = ({ y, m, d }) => Math.floor(Date.UTC(y, m - 1, d) / 86400000);
export function daysToIso(days) {
  const dt = new Date(days * 86400000);
  return ymdToIso({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() });
}

/** Vrai si la chaîne ressemble à une date (sert aux comparaisons et à date + n). */
export function isDateLike(v) {
  return typeof v === 'string' && (ISO_DATE_RX.test(v.trim()) || FR_DATE_RX.test(v.trim())) && parseDate(v) !== null;
}

const tzFormatters = new Map();
/** Date du jour 'AAAA-MM-JJ' dans le fuseau donné (défaut Europe/Paris, identique client/serveur). */
export function todayIso(now, timeZone = 'Europe/Paris') {
  const date = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  try {
    let f = tzFormatters.get(timeZone);
    if (!f) {
      f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
      tzFormatters.set(timeZone, f);
    }
    const parts = {};
    for (const p of f.formatToParts(date)) parts[p.type] = p.value;
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch {
    return ymdToIso({ y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() });
  }
}

/** Formate une date ISO en français (JJ/MM/AAAA). */
export function formatDateFr(v) {
  const p = parseDate(v);
  if (!p) return toText(v);
  let out = `${pad(p.d)}/${pad(p.m)}/${pad(p.y, 4)}`;
  const t = typeof v === 'string' ? /[T ](\d{2}):(\d{2})/.exec(v) : null;
  if (t) out += ` à ${t[1]}h${t[2]}`;
  return out;
}

// ── Égalité et comparaison ──────────────────────────────────

/** Égalité tolérante : vide = vide, « 4 » = 4, texte insensible à la casse, oui = VRAI. */
export function looseEqual(a, b) {
  const ea = isEmpty(a), eb = isEmpty(b);
  if (ea || eb) return ea && eb;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (Array.isArray(a) && Array.isArray(b)) {
      return a.length === b.length && a.every((x, i) => looseEqual(x, b[i]));
    }
    const arr = Array.isArray(a) ? a : b;
    const other = Array.isArray(a) ? b : a;
    return arr.length === 1 && looseEqual(arr[0], other);
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    const ba = toBoolStrict(a), bb = toBoolStrict(b);
    return ba !== undefined && ba === bb;
  }
  if (typeof a === 'object' || typeof b === 'object') {
    if (typeof a === 'object' && typeof b === 'object') {
      try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
    }
    return false;
  }
  const na = toNumber(a), nb = toNumber(b);
  if (na !== null && nb !== null) return cleanNumber(na) === cleanNumber(nb);
  if (isDateLike(a) && isDateLike(b)) return ymdToIso(parseDate(a)) === ymdToIso(parseDate(b)) && sameTime(a, b);
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function sameTime(a, b) {
  const ta = /[T ](\d{2}:\d{2})/.exec(a), tb = /[T ](\d{2}:\d{2})/.exec(b);
  if (!ta || !tb) return true;
  return ta[1] === tb[1];
}

/**
 * Comparaison ordonnée : renvoie <0, 0, >0, ou null si non comparable
 * (une valeur vide n'est jamais plus petite ni plus grande).
 */
export function compareValues(a, b) {
  if (isEmpty(a) || isEmpty(b)) return null;
  if (Array.isArray(a) || Array.isArray(b) || typeof a === 'object' || typeof b === 'object') return null;
  const na = toNumber(a), nb = toNumber(b);
  if (na !== null && nb !== null) return na - nb;
  if (isDateLike(a) && isDateLike(b)) {
    const ka = normDateKey(a), kb = normDateKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  }
  const sa = String(a).trim().toLowerCase(), sb = String(b).trim().toLowerCase();
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function normDateKey(v) {
  const iso = ymdToIso(parseDate(v));
  const t = /[T ](\d{2}:\d{2}(?::\d{2})?)/.exec(v);
  return t ? `${iso}T${t[1]}` : iso;
}

/** Aplatit les arguments (listes imbriquées) pour SOMME, MOYENNE, MIN, MAX. */
export function flatValues(args, out = [], depth = 0) {
  for (const a of args) {
    if (Array.isArray(a) && depth < 4) flatValues(a, out, depth + 1);
    else out.push(a);
  }
  return out;
}

/** Vrai pour un objet « simple » ({…} littéral, pas tableau). */
export const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);
