// ============================================================
// Moteur de formulaires — validation et nettoyage des réponses
// ============================================================
// Utilisé par la page répondant (page par page) ET par la fonction
// serveur d'envoi (revalidation complète). Ne fait jamais confiance au
// client : clés inconnues ignorées, réponses aux questions masquées
// retirées, champs calculés recalculés, valeurs normalisées.

import { compileForm } from './compile.js';
import { evaluateForm } from './runtime.js';
import { evaluate, isEmail } from './expr.js';
import { safeRegex } from './regex.js';
import {
  hasOwn, isEmpty, isPlainObject, truthy, toNumber, toBoolStrict, parseDate, ymdToIso,
  todayIso, formatDateFr, numberToText, cleanNumber,
} from './values.js';

const MSG = {
  required: 'Cette question est obligatoire.',
  invalid: 'Réponse invalide.',
};

const TEXT_MAX = { short_text: 2000, long_text: 20000, email: 254, phone: 40, url: 2000 };
const DEFAULT_MAX_FILES = 10;
const DEFAULT_MAX_FILE_MB = 10;
const MAX_SIGNATURE_LENGTH = 500000; // ≈ 370 Ko de PNG
const MAX_REPEAT = 200;
const ID_RX = /^[A-Za-z0-9_:.-]{1,100}$/;
const TIME_RX = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;
const DATETIME_RX = /^(\d{4}-\d{2}-\d{2})[T ]([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const PNG_DATA_URL_RX = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;

const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
const fmtNum = n => numberToText(n);

// ── Normalisations élémentaires ─────────────────────────────

function asText(raw) {
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  return null;
}

/** Téléphone : France (0X XX XX XX XX, +33…, 0033…) ou international E.164. → forme compacte ou null. */
export function normalizePhone(raw) {
  const s = asText(raw);
  if (s === null) return null;
  let p = s.trim().replace(/[\s.\-()\u00a0]/g, '');
  if (p.startsWith('00')) p = `+${p.slice(2)}`;
  if (/^0[1-9]\d{8}$/.test(p)) return p;
  if (p.startsWith('+33')) return /^\+33[1-9]\d{8}$/.test(p) ? p : null;
  if (/^\+[1-9]\d{6,14}$/.test(p)) return p;
  return null;
}

/** URL http(s) ; « exemple.fr » devient « https://exemple.fr ». → chaîne ou null. */
export function normalizeUrl(raw) {
  const s = asText(raw);
  if (s === null) return null;
  let u = s.trim();
  if (/\s/.test(u)) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = `https://${u}`;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!/^[^.]+(\.[^.]+)+$/.test(parsed.hostname) && parsed.hostname !== 'localhost') return null;
    return u;
  } catch {
    return null;
  }
}

function resolveDateBound(b, now, tz) {
  if (b === undefined || b === null || b === '') return null;
  if (typeof b === 'string' && /^(today|aujourd'?hui|aujourdhui)$/i.test(b.trim())) return todayIso(now, tz);
  const p = parseDate(b);
  return p ? ymdToIso(p) : null;
}

function findOption(list, raw) {
  if (!Array.isArray(list)) return null;
  const k = String(raw).trim();
  for (const o of list) if (o && String(o.value) === k) return o;
  return null;
}

function acceptMatches(accept, file) {
  if (!Array.isArray(accept) || !accept.length) return true;
  const type = String(file.type || '').toLowerCase();
  const name = String(file.name || '').toLowerCase();
  return accept.some(a => {
    const x = String(a).trim().toLowerCase();
    if (!x) return false;
    if (x.startsWith('.')) return name.endsWith(x);
    if (x.endsWith('/*')) return type.startsWith(x.slice(0, -1));
    return type === x;
  });
}

// ── Contrôle d'une valeur selon le type ─────────────────────

/**
 * → { value } (normalisée ; undefined si vide) ou { error }.
 * env : { required, partial, ev, settings, context, now, tz, meta, scope }
 */
function checkValue(q, raw, env) {
  const it = q.item;
  const v = isPlainObject(it.validation) ? it.validation : {};
  const type = q.type;
  const { required, partial } = env;
  const empty = isEmpty(raw);

  // Types dont la valeur ne dépend pas de la saisie
  if (type === 'payment') return checkPayment(q, raw, env);
  if (type === 'consent') {
    const b = toBoolStrict(raw) === true;
    if (!b && required) return { error: 'Tu dois accepter pour continuer.' };
    return { value: b };
  }
  if (empty) return required ? { error: MSG.required } : { value: undefined };

  switch (type) {
    case 'short_text': case 'long_text': case 'email': case 'phone': case 'url': {
      let s = asText(raw);
      if (s === null) return { error: MSG.invalid };
      s = type === 'long_text' ? s.replace(/\r\n?/g, '\n').trim() : s.trim();
      if (type === 'email') {
        s = s.toLowerCase();
        if (!isEmail(s)) return { error: 'Adresse e-mail invalide (ex. prenom.nom@exemple.fr).' };
      } else if (type === 'phone') {
        const p = normalizePhone(s);
        if (!p) return { error: 'Numéro de téléphone invalide (ex. 06 12 34 56 78 ou +33 6 12 34 56 78).' };
        s = p;
      } else if (type === 'url') {
        const u = normalizeUrl(s);
        if (!u) return { error: 'Lien invalide (ex. https://exemple.fr).' };
        s = u;
      }
      const max = Math.min(Number.isInteger(v.maxLength) ? v.maxLength : Infinity, TEXT_MAX[type]);
      if (s.length > max) return { error: `${plural(max, 'caractère')} maximum (actuellement ${s.length}).` };
      if (Number.isInteger(v.minLength) && s.length < v.minLength) return { error: `Au moins ${plural(v.minLength, 'caractère')} (actuellement ${s.length}).` };
      if (v.pattern) {
        const r = safeRegex(v.pattern);
        if (r.rx && !r.rx.test(s)) return { error: v.patternMessage ? String(v.patternMessage) : 'Le format de la réponse n\'est pas valide.' };
      }
      return { value: s };
    }
    case 'number': {
      const n = toNumber(raw);
      if (n === null) return { error: 'Indique un nombre.' };
      const min = toNumber(v.min), max = toNumber(v.max);
      if (min !== null && n < min) return { error: `La valeur doit être au moins ${fmtNum(min)}.` };
      if (max !== null && n > max) return { error: `La valeur doit être au plus ${fmtNum(max)}.` };
      return { value: cleanNumber(n) };
    }
    case 'rating': case 'scale': case 'nps': {
      const n = toNumber(raw);
      const lo = type === 'nps' ? 0 : toNumber(it.min ?? v.min) ?? (type === 'rating' ? 1 : 1);
      const hi = type === 'nps' ? 10 : toNumber(it.max ?? v.max) ?? 5;
      if (n === null || !Number.isInteger(n) || n < lo || n > hi) return { error: `Choisis une valeur entre ${fmtNum(lo)} et ${fmtNum(hi)}.` };
      return { value: n };
    }
    case 'date': {
      const p = typeof raw === 'string' ? parseDate(raw) : null;
      if (!p) return { error: 'Date invalide.' };
      const iso = ymdToIso(p);
      const min = resolveDateBound(v.min, env.now, env.tz), max = resolveDateBound(v.max, env.now, env.tz);
      if (min && iso < min) return { error: `La date doit être le ${formatDateFr(min)} ou après.` };
      if (max && iso > max) return { error: `La date doit être le ${formatDateFr(max)} ou avant.` };
      return { value: iso };
    }
    case 'time': {
      const m = typeof raw === 'string' ? TIME_RX.exec(raw.trim()) : null;
      if (!m) return { error: 'Heure invalide (format HH:MM).' };
      const t = `${m[1]}:${m[2]}`;
      if (typeof v.min === 'string' && TIME_RX.test(v.min) && t < v.min.slice(0, 5)) return { error: `L'heure doit être ${v.min.slice(0, 5)} ou plus tard.` };
      if (typeof v.max === 'string' && TIME_RX.test(v.max) && t > v.max.slice(0, 5)) return { error: `L'heure doit être ${v.max.slice(0, 5)} ou plus tôt.` };
      return { value: t };
    }
    case 'datetime': {
      const m = typeof raw === 'string' ? DATETIME_RX.exec(raw.trim()) : null;
      if (!m || !parseDate(m[1])) return { error: 'Date et heure invalides.' };
      const value = `${m[1]}T${m[2]}:${m[3]}${m[4] || ''}`;
      const key = `${m[1]}T${m[2]}:${m[3]}`;
      if (typeof v.min === 'string' && v.min && key < v.min.slice(0, 16)) return { error: `La date doit être le ${formatDateFr(v.min)} ou après.` };
      if (typeof v.max === 'string' && v.max && key > v.max.slice(0, 16)) return { error: `La date doit être le ${formatDateFr(v.max)} ou avant.` };
      return { value };
    }
    case 'yes_no': {
      const b = toBoolStrict(raw);
      return b === undefined ? { error: MSG.invalid } : { value: b };
    }
    case 'single_choice': case 'dropdown': case 'image_choice': case 'slots': {
      const multi = type === 'slots' && (it.multiple === true || (Number.isInteger(v.maxSelected) && v.maxSelected > 1));
      if (multi) return checkMulti(q, raw, env, v);
      if (typeof raw === 'object') return { error: MSG.invalid };
      return checkOne(q, raw, env);
    }
    case 'multiple_choice': return checkMulti(q, raw, env, v);
    case 'ranking': {
      if (!Array.isArray(raw)) return { error: 'Classement invalide.' };
      const opts = env.ev.options[q.key] || [];
      const seen = new Set();
      const out = [];
      for (const x of raw) {
        const o = findOption(opts, x);
        if (!o || seen.has(String(o.value))) return { error: 'Classement invalide.' };
        seen.add(String(o.value));
        out.push(o.value);
      }
      if (!partial && out.length !== opts.length) return { error: 'Classe tous les éléments.' };
      return { value: out };
    }
    case 'matrix': return checkMatrix(q, raw, env);
    case 'file': return checkFiles(raw, v);
    case 'signature': {
      if (typeof raw === 'string') {
        if (raw.length > MAX_SIGNATURE_LENGTH) return { error: 'Signature trop volumineuse.' };
        if (!PNG_DATA_URL_RX.test(raw)) return { error: 'Signature invalide.' };
        return { value: raw };
      }
      if (isPlainObject(raw) && typeof raw.id === 'string' && ID_RX.test(raw.id) && String(raw.type || '').toLowerCase() === 'image/png') {
        return { value: { id: raw.id, name: String(raw.name || 'signature.png').slice(0, 255), size: toNumber(raw.size) ?? 0, type: 'image/png' } };
      }
      return { error: 'Signature invalide.' };
    }
    case 'address': return checkAddress(raw, required, partial);
    case 'name': return checkName(raw, required, partial);
    case 'member_picker': case 'event_picker': {
      const list = Array.isArray(raw) ? raw : [raw];
      if (!it.multiple && list.length > 1) return { error: MSG.invalid };
      const lookup = env.context?.lookup?.[type === 'member_picker' ? 'members' : 'events'];
      const known = lookup instanceof Set ? lookup : Array.isArray(lookup) ? new Set(lookup.map(String)) : null;
      const out = [];
      for (const x of list) {
        const id = asText(x);
        if (id === null || !ID_RX.test(id.trim())) return { error: 'Sélection invalide.' };
        if (known && !known.has(id.trim())) return { error: type === 'member_picker' ? 'Membre introuvable.' : 'Événement introuvable.' };
        if (!out.includes(id.trim())) out.push(id.trim());
      }
      return { value: it.multiple ? out : out[0] };
    }
    case 'hidden': {
      const s = typeof raw === 'boolean' ? raw : asText(raw);
      if (s === null) return { value: undefined };
      return { value: typeof s === 'string' ? s.slice(0, 1000) : s };
    }
    default:
      return { error: MSG.invalid };
  }
}

function optionFull(q, o, env) {
  const full = env.ev.fullOptions[q.key];
  return !!(full && full.has(o.value) && !env.settings.waitlist);
}

function checkOne(q, raw, env) {
  const it = q.item;
  if (it.source && !Array.isArray(it.options)) {
    const s = asText(raw);
    if (s === null || !s.trim() || s.length > 200) return { error: MSG.invalid };
    return { value: s.trim() };
  }
  const o = findOption(env.ev.options[q.key], raw);
  if (!o) return { error: q.type === 'slots' ? 'Ce créneau n\'existe pas.' : 'Choix invalide.' };
  if (optionFull(q, o, env)) return { error: q.type === 'slots' ? `Le créneau « ${o.label || o.value} » est complet.` : `« ${o.label || o.value} » est complet.` };
  return { value: o.value };
}

function checkMulti(q, raw, env, v) {
  const list = Array.isArray(raw) ? raw : [raw];
  const out = [];
  const seen = new Set();
  for (const x of list) {
    if (isEmpty(x)) continue;
    if (typeof x === 'object') return { error: MSG.invalid };
    const r = checkOne(q, x, env);
    if (r.error) return r;
    const k = String(r.value);
    if (!seen.has(k)) { seen.add(k); out.push(r.value); }
  }
  if (!out.length) return env.required ? { error: MSG.required } : { value: undefined };
  if (!env.partial && Number.isInteger(v.minSelected) && out.length < v.minSelected) return { error: `Sélectionne au moins ${v.minSelected} choix.` };
  if (Number.isInteger(v.maxSelected) && out.length > v.maxSelected) return { error: `Sélectionne au plus ${v.maxSelected} choix.` };
  return { value: out };
}

function checkMatrix(q, raw, env) {
  if (!isPlainObject(raw)) return { error: MSG.invalid };
  const it = q.item;
  const rows = env.ev.options[q.key] || [];
  const cols = Array.isArray(it.columns) ? it.columns : [];
  const multiple = it.multiple === true || it.matrixType === 'multiple';
  const out = {};
  let answered = 0;
  for (const row of rows) {
    if (!row) continue;
    const rk = String(row.value);
    if (!hasOwn(raw, rk) || isEmpty(raw[rk])) continue;
    const cell = raw[rk];
    if (multiple) {
      const list = Array.isArray(cell) ? cell : [cell];
      const vals = [];
      for (const x of list) {
        const c = findOption(cols, x);
        if (!c) return { error: 'Réponse invalide dans le tableau.' };
        if (!vals.includes(c.value)) vals.push(c.value);
      }
      out[rk] = vals;
    } else {
      if (typeof cell === 'object') return { error: 'Réponse invalide dans le tableau.' };
      const c = findOption(cols, cell);
      if (!c) return { error: 'Réponse invalide dans le tableau.' };
      out[rk] = c.value;
    }
    answered++;
  }
  if (!answered) return env.required ? { error: MSG.required } : { value: undefined };
  if (env.required && !env.partial && answered < rows.length) return { error: 'Réponds à chaque ligne du tableau.' };
  return { value: out };
}

function checkFiles(raw, v) {
  const list = Array.isArray(raw) ? raw : [raw];
  const maxFiles = Number.isInteger(v.maxFiles) && v.maxFiles > 0 ? v.maxFiles : DEFAULT_MAX_FILES;
  const maxMb = toNumber(v.maxFileSizeMb) > 0 ? toNumber(v.maxFileSizeMb) : DEFAULT_MAX_FILE_MB;
  if (list.length > maxFiles) return { error: `${plural(maxFiles, 'fichier')} maximum.` };
  const out = [];
  for (const f of list) {
    if (!isPlainObject(f) || typeof f.id !== 'string' || !ID_RX.test(f.id)) return { error: 'Fichier invalide.' };
    const name = typeof f.name === 'string' ? f.name.trim().slice(0, 255) : '';
    const size = toNumber(f.size);
    const type = typeof f.type === 'string' ? f.type.trim().toLowerCase().slice(0, 200) : '';
    if (!name || size === null || size < 0) return { error: 'Fichier invalide.' };
    if (size > maxMb * 1024 * 1024) return { error: `« ${name} » dépasse ${fmtNum(maxMb)} Mo.` };
    if (!acceptMatches(v.accept, { name, type })) return { error: `Type de fichier non accepté pour « ${name} ».` };
    out.push({ id: f.id, name, size, type });
  }
  return { value: out };
}

const ADDRESS_ALIASES = {
  line1: ['line1', 'street', 'rue', 'adresse', 'address'],
  line2: ['line2', 'complement', 'complément'],
  postalCode: ['postalCode', 'zip', 'codePostal', 'code_postal', 'cp'],
  city: ['city', 'ville'],
  region: ['region', 'région', 'state'],
  country: ['country', 'pays'],
};

function pick(obj, aliases) {
  for (const a of aliases) if (hasOwn(obj, a) && typeof obj[a] === 'string' && obj[a].trim()) return obj[a].trim().slice(0, 200);
  return '';
}

function checkAddress(raw, required, partial) {
  const src = typeof raw === 'string' ? { line1: raw } : isPlainObject(raw) ? raw : null;
  if (!src) return { error: MSG.invalid };
  const out = {};
  for (const [k, al] of Object.entries(ADDRESS_ALIASES)) { const s = pick(src, al); if (s) out[k] = s; }
  if (!Object.keys(out).length) return required ? { error: MSG.required } : { value: undefined };
  const fr = !out.country || /^(fr|france)$/i.test(out.country);
  if (out.postalCode && fr && !/^\d{5}$/.test(out.postalCode.replace(/\s/g, ''))) return { error: 'Code postal invalide (5 chiffres).' };
  if (out.postalCode && fr) out.postalCode = out.postalCode.replace(/\s/g, '');
  if (required && !partial && (!out.line1 || !out.city || !out.postalCode)) return { error: 'Adresse incomplète : indique la rue, le code postal et la ville.' };
  return { value: out };
}

function checkName(raw, required, partial) {
  const src = typeof raw === 'string' ? { lastName: raw } : isPlainObject(raw) ? raw : null;
  if (!src) return { error: MSG.invalid };
  const firstName = pick(src, ['firstName', 'first', 'prenom', 'prénom']).slice(0, 100);
  const lastName = pick(src, ['lastName', 'last', 'nom']).slice(0, 100);
  if (!firstName && !lastName) return required ? { error: MSG.required } : { value: undefined };
  if (required && !partial && (!firstName || !lastName)) return { error: 'Indique ton prénom et ton nom.' };
  const out = {};
  if (firstName) out.firstName = firstName;
  if (lastName) out.lastName = lastName;
  return { value: out };
}

function checkPayment(q, raw, env) {
  const it = q.item;
  const v = isPlainObject(it.validation) ? it.validation : {};
  const currency = typeof it.currency === 'string' && /^[A-Z]{3}$/.test(it.currency) ? it.currency : 'EUR';
  const done = (amount, option) => {
    if (amount === null || !Number.isFinite(amount) || amount < 0 || amount > 100000) return { error: 'Montant invalide.' };
    const cents = Math.round(amount * 100) / 100;
    const out = { amount: cents, currency };
    if (option !== undefined) out.option = option;
    return { value: out };
  };
  const opts = env.ev.options[q.key];
  if (Array.isArray(opts) && opts.some(o => o && typeof o.price === 'number')) {
    const pickRaw = isPlainObject(raw) ? raw.option : raw;
    if (isEmpty(pickRaw)) return env.required ? { error: MSG.required } : { value: undefined };
    const o = findOption(opts, pickRaw);
    if (!o || typeof o.price !== 'number') return { error: 'Formule de paiement invalide.' };
    return done(o.price, o.value);
  }
  if (env.meta?.amountAst) return done(toNumber(evaluate(env.meta.amountAst, env.scope, { now: env.now, timeZone: env.tz })), undefined);
  if (it.amount !== undefined && it.amount !== null && !isPlainObject(it.amount)) return done(toNumber(it.amount), undefined);
  const amountRaw = isPlainObject(raw) ? raw.amount : raw;
  if (isEmpty(amountRaw)) return env.required ? { error: MSG.required } : { value: undefined };
  const n = toNumber(amountRaw);
  if (n === null || Math.round(n * 100) !== cleanNumber(n * 100)) return { error: 'Montant invalide (2 décimales au plus).' };
  const min = toNumber(v.min) ?? 0.01, max = toNumber(v.max) ?? 10000;
  if (n < min) return { error: `Le montant doit être au moins ${fmtNum(min)} €.` };
  if (n > max) return { error: `Le montant doit être au plus ${fmtNum(max)} €.` };
  return done(n, undefined);
}

function checkRepeated(q, raw, env) {
  const rep = isPlainObject(q.item.repeat) ? q.item.repeat : {};
  const list = (Array.isArray(raw) ? raw : isEmpty(raw) ? [] : [raw]).filter(x => !isEmpty(x));
  const min = Number.isInteger(rep.min) ? rep.min : 0;
  const max = Math.min(Number.isInteger(rep.max) ? rep.max : MAX_REPEAT, MAX_REPEAT);
  if (!list.length) return env.required || (!env.partial && min > 0) ? { error: MSG.required } : { value: undefined };
  if (list.length > max) return { error: `${plural(max, 'réponse')} au maximum.` };
  if (!env.partial && list.length < min) return { error: `Au moins ${plural(min, 'réponse')}.` };
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const r = checkValue(q, list[i], { ...env, required: true });
    if (r.error) return { error: `Réponse n°${i + 1} : ${r.error}` };
    out.push(r.value);
  }
  return { value: out };
}

// ── API ─────────────────────────────────────────────────────

/**
 * Valide et nettoie des réponses.
 * options : { pageId?: ne signaler que les erreurs de cette page, partial?: brouillon (pas d'obligation) }
 * → { ok, errors: { [clé]: message }, cleaned, computed, score, maxScore }
 * Erreurs d'une section répétable : clé « groupe.index.clé » (index à partir de 0).
 */
export function validateAnswers(definition, answers, context = {}, options = {}) {
  const c = compileForm(definition);
  const ctx = context && typeof context === 'object' ? context : {};
  const { pageId = null, partial = false } = options || {};
  const input = isPlainObject(answers) ? answers : {};
  const ev = evaluateForm(definition, input, ctx);
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const env0 = { partial: !!partial, ev, settings: c.settings, context: ctx, now, tz: ctx.timeZone };
  const scope = { ...ev.values, membre: ctx.member ?? null, params: ctx.params ?? null };
  const errors = {};
  const cleaned = {};
  const report = (q, key, msg) => {
    if (pageId !== null && q.pageId !== pageId) return;
    if (!hasOwn(errors, key)) errors[key] = msg;
  };

  for (const q of c.questions) {
    if (q.repeatKey || !ev.visible.has(q.key)) continue;
    if (q.type === 'calculated') {
      const val = ev.computed[q.key];
      if (!isEmpty(val)) cleaned[q.key] = val;
      continue;
    }
    let raw = hasOwn(input, q.key) ? input[q.key] : undefined;
    // Valeurs imposées : champ caché / lecture seule préremplis → la valeur calculée prime
    if (hasOwn(ev.defaults, q.key) && (ev.readOnly.has(q.key) || q.type === 'hidden')) raw = ev.defaults[q.key];
    const env = { ...env0, required: !partial && ev.required.has(q.key), meta: c.itemMeta.get(q.item), scope };
    const r = q.item.repeat ? checkRepeated(q, raw, env) : checkValue(q, raw, env);
    if (r.error) report(q, q.key, r.error);
    else if (r.value !== undefined) cleaned[q.key] = r.value;
  }

  // Sections répétables : tableau d'objets { cléEnfant: valeur }
  for (const [gk, g] of c.repeatGroups) {
    if (!ev.visible.has(gk)) continue;
    const gq = { pageId: g.entry.pageId };
    const rep = isPlainObject(g.item.repeat) ? g.item.repeat : {};
    const raw = hasOwn(input, gk) && Array.isArray(input[gk]) ? input[gk] : [];
    const min = Number.isInteger(rep.min) ? rep.min : 0;
    const max = Math.min(Number.isInteger(rep.max) ? rep.max : MAX_REPEAT, MAX_REPEAT);
    if (raw.length > max) { report(gq, gk, `${plural(max, 'élément')} au maximum.`); continue; }
    if (!partial && raw.length < min) report(gq, gk, `Ajoute au moins ${plural(min, 'élément')}.`);
    const out = [];
    raw.forEach((inst, i) => {
      const src = isPlainObject(inst) ? inst : {};
      const instScope = Object.assign(Object.create(null), scope);
      for (const ck of g.childKeys) instScope[ck] = hasOwn(src, ck) ? src[ck] : null;
      const row = {};
      const hiddenParents = new Set();
      for (const e of c.entries) {
        // éléments descendants de la section, dans l'ordre
        if (!e.ancestors.includes(g.item)) continue;
        const m = c.itemMeta.get(e.item);
        const parentHidden = e.ancestors.some(a => hiddenParents.has(a));
        const vis = !parentHidden && (!m?.showIf || truthy(evaluate(m.showIf, instScope, { now, timeZone: ctx.timeZone })));
        if (!vis) { hiddenParents.add(e.item); if (e.item.kind === 'question') instScope[e.item.key] = null; continue; }
        if (e.item.kind !== 'question') continue;
        const q = c.byKey.get(e.item.key);
        if (!q || q.item !== e.item) continue;
        if (q.type === 'calculated') {
          const val = m.calcAst ? evaluate(m.calcAst, instScope, { now, timeZone: ctx.timeZone }) : null;
          if (!isEmpty(val)) row[q.key] = val;
          continue;
        }
        const ro = m.readOnlyIf && truthy(evaluate(m.readOnlyIf, instScope, { now }));
        const req = !partial && !ro && q.type !== 'hidden' && (m.requiredAst ? truthy(evaluate(m.requiredAst, instScope, { now })) : m.required);
        const env = { ...env0, required: req, meta: m, scope: instScope };
        const r = q.item.repeat ? checkRepeated(q, src[q.key], env) : checkValue(q, src[q.key], env);
        if (r.error) report(gq, `${gk}.${i}.${q.key}`, r.error);
        else if (r.value !== undefined) { row[q.key] = r.value; instScope[q.key] = r.value; }
      }
      out.push(row);
    });
    if (out.length) cleaned[gk] = out;
  }

  const final = evaluateForm(definition, cleaned, ctx);
  for (const [k, val] of Object.entries(final.computed)) if (c.byKey.has(k) && final.visible.has(k) && !isEmpty(val)) cleaned[k] = val;
  return {
    ok: Object.keys(errors).length === 0,
    errors,
    cleaned,
    computed: final.computed,
    score: final.score,
    maxScore: final.maxScore,
  };
}
