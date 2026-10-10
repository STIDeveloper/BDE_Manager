// ============================================================
// ADMINISTRATION DES RÉPONSES — analyses (JavaScript pur)
// ============================================================
// Questions exploitables, valeurs lisibles, recherche, filtres
// multicritères, regroupements, statistiques par question, tableaux
// croisés, segments, quiz, évaluations, comparaison d'enquêtes.
// Aucune dépendance au navigateur : testable sous Node.
// ============================================================

import { compileForm, formatAnswer, computeScore, evaluate, isEmpty, toNumber, truthy } from '../engine/index.js';
import { DEFAULT_STATUSES } from '../schema.js';

const CHOICE = new Set(['single_choice', 'dropdown', 'image_choice', 'multiple_choice', 'yes_no', 'consent']);
const PICKER = new Set(['member_picker', 'event_picker']);
const CONTACT = new Set(['name', 'email', 'phone', 'address', 'url']);
const TEXT = new Set(['short_text', 'long_text']);
/** Types qui identifient la personne (masqués en évaluation à l'aveugle). */
export const IDENTITY_TYPES = new Set(['name', 'email', 'phone', 'address', 'signature']);

export const groupOfType = (type) => {
  if (CHOICE.has(type)) return 'choice';
  if (PICKER.has(type)) return 'picker';
  if (type === 'slots') return 'slots';
  if (type === 'rating' || type === 'scale') return 'scale';
  if (type === 'nps') return 'nps';
  if (type === 'number' || type === 'payment') return 'number';
  if (type === 'date' || type === 'datetime') return 'date';
  if (type === 'time') return 'time';
  if (TEXT.has(type)) return 'text';
  if (CONTACT.has(type)) return 'contact';
  if (type === 'ranking') return 'ranking';
  if (type === 'matrix') return 'matrix';
  if (type === 'file' || type === 'signature') return 'file';
  if (type === 'repeat') return 'repeat';
  return 'other';
};

const defCache = new WeakMap();

/**
 * Questions d'une définition, prêtes pour l'administration.
 * → [{ key, type, group, label, item, sensitive, options, min?, max? }]
 */
export function adminQuestions(def) {
  if (!def) return [];
  if (defCache.has(def)) return defCache.get(def);
  let c;
  try { c = compileForm(def); } catch { return []; }
  const out = [];
  const doneGroups = new Set();
  for (const q of c.questions) {
    if (q.repeatKey) {
      if (doneGroups.has(q.repeatKey)) continue;
      doneGroups.add(q.repeatKey);
      const g = c.repeatGroups.get(q.repeatKey);
      out.push({ key: q.repeatKey, type: 'repeat', group: 'repeat', label: g?.item?.title || q.repeatKey, item: { ...(g?.item || {}), type: 'repeat' }, sensitive: false, options: [] });
      continue;
    }
    const it = q.item;
    let type = q.type;
    let group = groupOfType(type);
    if (type === 'calculated') group = it.valueType === 'text' ? 'text' : 'number';
    if (type === 'hidden') group = 'other';
    const options = type === 'yes_no'
      ? [{ value: 'true', label: 'Oui' }, { value: 'false', label: 'Non' }]
      : type === 'consent' ? [{ value: 'true', label: 'Accepté' }, { value: 'false', label: 'Non accepté' }]
        : Array.isArray(it.options) ? it.options.filter(Boolean).map(o => ({ ...o, value: String(o.value), label: o.label || String(o.value) })) : [];
    const lo = type === 'nps' ? 0 : toNumber(it.min ?? it.validation?.min) ?? 1;
    const hi = type === 'nps' ? 10 : toNumber(it.max ?? it.validation?.max) ?? 5;
    out.push({
      key: q.key, type, group, label: it.label || q.key, item: it, sensitive: !!it.sensitive || type === 'signature',
      identity: IDENTITY_TYPES.has(type) || !!it.sensitive, options, min: lo, max: hi,
    });
  }
  defCache.set(def, out);
  return out;
}

/** Valeur brute d'une question pour une réponse. */
export function rawValue(row, q) {
  if (!row) return undefined;
  if (q.type === 'calculated') return row.computed?.[q.key] ?? row.answers?.[q.key];
  return row.answers?.[q.key];
}

/** Texte lisible d'une réponse à une question. */
export function displayValue(row, q, labelFor) {
  const v = rawValue(row, q);
  if (q.type === 'repeat') return Array.isArray(v) && v.length ? `${v.length} élément${v.length > 1 ? 's' : ''}` : '';
  if (q.type === 'signature') return isEmpty(v) ? '' : 'Signature fournie';
  try { return formatAnswer(q.item, v, labelFor) || ''; } catch { return ''; }
}

/** Valeurs catégorielles (liste de chaînes) d'une question de choix. */
export function choiceValues(row, q) {
  const v = rawValue(row, q);
  if (v === null || v === undefined || v === '') return [];
  if (q.type === 'yes_no' || q.type === 'consent') return v === true ? ['true'] : v === false ? ['false'] : [];
  if (q.type === 'payment' && v && typeof v === 'object') return v.option !== undefined ? [String(v.option)] : [];
  if (Array.isArray(v)) return v.filter(x => x !== null && x !== undefined && x !== '').map(String);
  if (typeof v === 'object') return [];
  return [String(v)];
}

/** Nombre associé (note, nombre, montant). */
export function numericValue(row, q) {
  const v = rawValue(row, q);
  if (q.type === 'payment') return v && typeof v === 'object' ? toNumber(v.amount) : toNumber(v);
  if (q.type === 'repeat') return Array.isArray(v) ? v.length : null;
  if (Array.isArray(v) || (v && typeof v === 'object')) return null;
  return toNumber(v);
}

export const optionLabelOf = (q, value) => q.options.find(o => o.value === String(value))?.label ?? String(value);

// ── Dates ───────────────────────────────────────────────────
const pad = n => String(n).padStart(2, '0');
export function dayKey(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function weekKey(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = (d.getDay() + 6) % 7; // lundi = 0
  d.setDate(d.getDate() - day);
  return dayKey(d.toISOString());
}
export const monthKey = iso => dayKey(iso).slice(0, 7);
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export function periodLabel(key, period) {
  if (!key) return 'Date inconnue';
  const [y, m, d] = key.split('-').map(Number);
  if (period === 'month') return `${MONTHS[m - 1]} ${y}`;
  if (period === 'week') return `Semaine du ${d} ${MONTHS[m - 1]} ${y}`;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
export const periodKey = (iso, period) => (period === 'month' ? monthKey(iso) : period === 'week' ? weekKey(iso) : dayKey(iso));

/** Série par jour (jours vides inclus) entre la première et la dernière date (ou `days` derniers jours). */
export function perDay(rows, { days = null, field = 'submittedAt', now = new Date() } = {}) {
  const counts = new Map();
  rows.forEach(r => { const k = dayKey(r[field]); if (k) counts.set(k, (counts.get(k) || 0) + 1); });
  if (!counts.size && !days) return [];
  const keys = [...counts.keys()].sort();
  const end = days ? new Date(now) : new Date(`${keys[keys.length - 1]}T12:00:00`);
  const start = days ? new Date(now.getTime() - (days - 1) * 86400000) : new Date(`${keys[0]}T12:00:00`);
  const out = [];
  const cur = new Date(start);
  cur.setHours(12, 0, 0, 0);
  end.setHours(12, 0, 0, 0);
  let guard = 0;
  while (cur <= end && guard++ < 2000) {
    const k = dayKey(cur.toISOString());
    out.push({ day: k, count: counts.get(k) || 0 });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

// ── Statuts ─────────────────────────────────────────────────
export function statusesOf(def) {
  const list = Array.isArray(def?.settings?.statuses) && def.settings.statuses.length ? def.settings.statuses : DEFAULT_STATUSES;
  return list.filter(s => s && s.id);
}
export const STATUS_BADGE = { blue: 'badge-brand', amber: 'badge-amber', zinc: 'badge-neutral', gray: 'badge-neutral', emerald: 'badge-emerald', green: 'badge-emerald', red: 'badge-rose', rose: 'badge-rose', violet: 'badge-violet', cyan: 'badge-cyan', pink: 'badge-pink', indigo: 'badge-indigo' };

// ── Recherche plein texte ───────────────────────────────────
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const hayCache = new WeakMap();
/** Texte indexé d'une réponse (hors données sensibles si masquées). */
export function haystack(row, questions, { labelFor, includeSensitive = false } = {}) {
  const cached = hayCache.get(row);
  if (cached && cached.q === questions && cached.s === includeSensitive) return cached.text;
  const parts = [row.id, row.status, ...(row.tags || []), row.assignee || ''];
  if (includeSensitive || !questions.some(q => q.sensitive && q.type === 'email')) parts.push(row.respondent?.email || '');
  for (const q of questions) {
    if (q.sensitive && !includeSensitive) continue;
    parts.push(displayValue(row, q, labelFor));
  }
  const text = fold(parts.join(' \u0001 '));
  hayCache.set(row, { q: questions, s: includeSensitive, text });
  return text;
}

// ── Filtres multicritères ───────────────────────────────────
export const EMPTY_FILTERS = Object.freeze({ q: '', status: [], tag: '', assignee: '', from: '', to: '', scoreMin: '', scoreMax: '', waitlisted: '', source: '', rules: [] });

/** Opérateurs proposés selon le groupe de la question. */
export function operatorsFor(group) {
  switch (group) {
    case 'choice': case 'picker': case 'slots':
      return [['is', 'est'], ['is_not', 'n\'est pas'], ['empty', 'est vide'], ['not_empty', 'est renseigné']];
    case 'scale': case 'nps': case 'number': case 'repeat':
      return [['eq', '='], ['gte', '≥'], ['lte', '≤'], ['between', 'entre'], ['empty', 'est vide'], ['not_empty', 'est renseigné']];
    case 'date':
      return [['on', 'le'], ['after', 'à partir du'], ['before', 'jusqu\'au'], ['between', 'entre'], ['empty', 'est vide'], ['not_empty', 'est renseigné']];
    default:
      return [['contains', 'contient'], ['not_contains', 'ne contient pas'], ['eq', 'est égal à'], ['empty', 'est vide'], ['not_empty', 'est renseigné']];
  }
}

function ruleMatches(rule, q, row, labelFor) {
  const v = rawValue(row, q);
  const empty = isEmpty(v) || (Array.isArray(v) && !v.length);
  if (rule.op === 'empty') return empty;
  if (rule.op === 'not_empty') return !empty;
  const g = q.group;
  if (g === 'choice' || g === 'picker' || g === 'slots') {
    const vals = choiceValues(row, q);
    const wanted = Array.isArray(rule.value) ? rule.value.map(String) : [String(rule.value ?? '')];
    const hit = vals.some(x => wanted.includes(x));
    return rule.op === 'is_not' ? !hit : hit;
  }
  if (g === 'scale' || g === 'nps' || g === 'number' || g === 'repeat') {
    const n = numericValue(row, q);
    if (n === null) return false;
    const a = toNumber(rule.value), b = toNumber(rule.value2);
    if (rule.op === 'eq') return a !== null && n === a;
    if (rule.op === 'gte') return a === null || n >= a;
    if (rule.op === 'lte') return a === null || n <= a;
    if (rule.op === 'between') return (a === null || n >= a) && (b === null || n <= b);
    return true;
  }
  if (g === 'date') {
    const d = typeof v === 'string' ? v.slice(0, 10) : '';
    if (!d) return false;
    if (rule.op === 'on') return !rule.value || d === rule.value;
    if (rule.op === 'after') return !rule.value || d >= rule.value;
    if (rule.op === 'before') return !rule.value || d <= rule.value;
    if (rule.op === 'between') return (!rule.value || d >= rule.value) && (!rule.value2 || d <= rule.value2);
    return true;
  }
  const text = fold(displayValue(row, q, labelFor));
  const needle = fold(rule.value);
  if (rule.op === 'eq') return text.trim() === needle.trim();
  if (rule.op === 'not_contains') return !text.includes(needle);
  return text.includes(needle);
}

/** Applique tous les filtres (côté client). ctx : { questions, labelFor, includeSensitive, scoreOf } */
export function applyFilters(rows, filters, ctx) {
  const f = { ...EMPTY_FILTERS, ...(filters || {}) };
  const byKey = new Map(ctx.questions.map(q => [q.key, q]));
  const rules = (f.rules || []).filter(r => r && byKey.has(r.key) && r.op);
  const needle = fold(f.q).trim();
  const terms = needle ? needle.split(/\s+/) : [];
  const smin = toNumber(f.scoreMin), smax = toNumber(f.scoreMax);
  return rows.filter(r => {
    if (f.status.length && !f.status.includes(r.status)) return false;
    if (f.tag && !(r.tags || []).includes(f.tag)) return false;
    if (f.assignee === '__none' && r.assignee) return false;
    if (f.assignee && f.assignee !== '__none' && r.assignee !== f.assignee) return false;
    if (f.waitlisted === 'yes' && !r.waitlisted) return false;
    if (f.waitlisted === 'no' && r.waitlisted) return false;
    if (f.source && r.source !== f.source) return false;
    if (f.from && dayKey(r.submittedAt) < f.from) return false;
    if (f.to && dayKey(r.submittedAt) > f.to) return false;
    if (smin !== null || smax !== null) {
      const s = ctx.scoreOf ? ctx.scoreOf(r) : r.score;
      if (s === null || s === undefined) return false;
      if (smin !== null && s < smin) return false;
      if (smax !== null && s > smax) return false;
    }
    for (const rule of rules) if (!ruleMatches(rule, byKey.get(rule.key), r, ctx.labelFor)) return false;
    if (terms.length) {
      const hay = haystack(r, ctx.questions, ctx);
      if (!terms.every(t => hay.includes(t))) return false;
    }
    return true;
  });
}

export function activeFilterCount(f) {
  if (!f) return 0;
  let n = 0;
  if (f.q) n++;
  if (f.status?.length) n++;
  ['tag', 'assignee', 'from', 'to', 'scoreMin', 'scoreMax', 'waitlisted', 'source'].forEach(k => { if (f[k]) n++; });
  return n + (f.rules?.length || 0);
}

// ── Dimensions (regroupements, tableaux croisés, segments) ──
/**
 * Dimensions catégorielles : questions de choix / notes + métadonnées.
 * → [{ id, label, values(row) → [{ value, label }], order: [{ value, label }] | null }]
 */
export function dimensions(def, ctx = {}) {
  const qs = adminQuestions(def);
  const out = [];
  for (const q of qs) {
    if (['choice', 'picker', 'slots'].includes(q.group)) {
      const order = q.options.length ? q.options.map(o => ({ value: o.value, label: o.label })) : null;
      out.push({
        id: q.key, label: q.label, question: q, order,
        values: row => choiceValues(row, q).map(v => ({ value: v, label: q.group === 'picker' && ctx.labelFor ? ctx.labelFor(q.type === 'member_picker' ? 'member' : 'event', v) || v : optionLabelOf(q, v) })),
      });
    } else if (q.group === 'scale' || q.group === 'nps') {
      const order = [];
      for (let i = q.min; i <= q.max && order.length < 30; i++) order.push({ value: String(i), label: String(i) });
      out.push({ id: q.key, label: q.label, question: q, order, values: row => { const n = numericValue(row, q); return n === null ? [] : [{ value: String(n), label: String(n) }]; } });
    }
  }
  const statuses = statusesOf(def);
  out.push({ id: '__status', label: 'Statut', order: statuses.map(s => ({ value: s.id, label: s.label })), values: r => [{ value: r.status, label: statuses.find(s => s.id === r.status)?.label || r.status }] });
  out.push({ id: '__month', label: 'Mois de réponse', order: null, sortKeys: true, values: r => { const k = monthKey(r.submittedAt); return k ? [{ value: k, label: periodLabel(k, 'month') }] : []; } });
  out.push({ id: '__week', label: 'Semaine de réponse', order: null, sortKeys: true, values: r => { const k = weekKey(r.submittedAt); return k ? [{ value: k, label: periodLabel(k, 'week') }] : []; } });
  out.push({ id: '__tags', label: 'Étiquette', order: null, values: r => (r.tags || []).map(t => ({ value: t, label: t })) });
  out.push({ id: '__source', label: 'Origine', order: null, values: r => [{ value: r.source || 'serveur', label: SOURCE_LABEL[r.source] || r.source }] });
  if (ctx.poleOfMember) {
    out.push({ id: '__pole', label: 'Pôle du répondant (membre)', order: null, values: r => { const p = r.respondent?.memberId ? ctx.poleOfMember(r.respondent.memberId) : null; return [p ? { value: p.id, label: p.label } : { value: '__none', label: 'Non-membre / inconnu' }]; } });
  }
  return out;
}

export const SOURCE_LABEL = { serveur: 'En ligne', local: 'Saisie locale', borne: 'Mode borne', 'hors-ligne': 'Envoi différé' };

/** Regroupe des réponses par dimension. → [{ value, label, rows }] (ordre des options, puis fréquence). */
export function groupRows(rows, dim) {
  const groups = new Map();
  const none = { value: '__empty', label: 'Sans réponse', rows: [] };
  for (const r of rows) {
    const vals = dim.values(r);
    if (!vals.length) { none.rows.push(r); continue; }
    for (const v of vals) {
      if (!groups.has(v.value)) groups.set(v.value, { value: v.value, label: v.label, rows: [] });
      groups.get(v.value).rows.push(r);
    }
  }
  let list = [...groups.values()];
  if (dim.order) {
    const idx = new Map(dim.order.map((o, i) => [o.value, i]));
    list.sort((a, b) => (idx.get(a.value) ?? 1e9) - (idx.get(b.value) ?? 1e9) || b.rows.length - a.rows.length);
  } else if (dim.sortKeys) list.sort((a, b) => String(b.value).localeCompare(String(a.value)));
  else list.sort((a, b) => b.rows.length - a.rows.length);
  if (none.rows.length) list.push(none);
  return list;
}

// ── Statistiques ────────────────────────────────────────────
export const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function stdev(xs) {
  if (xs.length < 2) return xs.length ? 0 : null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}
export const round = (n, d = 1) => (n === null || n === undefined || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);
export const fmtNum = (n, d = 1) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : round(n, d).toLocaleString('fr-FR'));
export const pct = (a, b) => (b ? (a / b) * 100 : 0);

const STOP = new Set(('a,à,au,aux,avec,ce,ces,c,cet,cette,dans,de,des,du,d,elle,en,et,est,eu,il,ils,je,j,la,le,les,l,leur,lui,ma,mais,me,m,même,mes,moi,mon,ne,n,nos,notre,nous,on,ou,où,par,pas,pour,qu,que,qui,sa,se,s,ses,son,sur,ta,te,t,tes,toi,ton,tu,un,une,vos,votre,vous,y,été,être,avoir,ai,as,avons,avez,ont,suis,es,sommes,êtes,sont,fait,faire,plus,très,trop,bien,aussi,comme,tout,tous,toute,toutes,cela,ça,ca,si,sans,sous,entre,donc,car,alors,ni,non,oui,the,and,of,to,is,in,it,for,that,this,was,are,be,peu,encore,déjà,ici,là,quand,dont,ceux,celle,celui,cest,jai,etait,était,avait,peut,veux,vraiment').split(','));

/** Mots les plus fréquents (nuage de mots simple). */
export function wordCounts(texts, limit = 40) {
  const counts = new Map();
  for (const t of texts) {
    const seen = new Set();
    for (const w of String(t || '').toLowerCase().split(/[^a-zà-ÿœæ0-9'’-]+/i)) {
      const word = w.replace(/^['’-]+|['’-]+$/g, '').replace(/^[ldjmnstc]['’]/, '');
      if (word.length < 3 || STOP.has(word) || /^\d+$/.test(word) || seen.has(word)) continue;
      seen.add(word);
      counts.set(word, (counts.get(word) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([word, count]) => ({ word, count }));
}

function histogram(xs, bins = 10) {
  if (!xs.length) return [];
  const lo = Math.min(...xs), hi = Math.max(...xs);
  if (lo === hi) return [{ from: lo, to: hi, count: xs.length }];
  const width = (hi - lo) / bins;
  const out = Array.from({ length: bins }, (_, i) => ({ from: lo + i * width, to: lo + (i + 1) * width, count: 0 }));
  xs.forEach(x => { out[Math.min(bins - 1, Math.floor((x - lo) / width))].count++; });
  return out;
}

/**
 * Statistiques d'une question sur un ensemble de réponses.
 * ctx : { labelFor, capacityCounts? }
 */
export function questionStats(q, rows, ctx = {}) {
  const total = rows.length;
  const answeredRows = rows.filter(r => { const v = rawValue(r, q); return !(isEmpty(v) || (Array.isArray(v) && !v.length)) || v === false; });
  const answered = answeredRows.length;
  const base = { key: q.key, label: q.label, type: q.type, group: q.group, total, answered };
  switch (q.group) {
    case 'choice': case 'picker': case 'slots': {
      const counts = new Map();
      answeredRows.forEach(r => choiceValues(r, q).forEach(v => counts.set(v, (counts.get(v) || 0) + 1)));
      const labelOf = v => (q.group === 'picker' && ctx.labelFor ? ctx.labelFor(q.type === 'member_picker' ? 'member' : 'event', v) || v : optionLabelOf(q, v));
      const known = q.options.map(o => ({ value: o.value, label: o.label, count: counts.get(o.value) || 0, capacity: toNumber(o.capacity) }));
      const extra = [...counts.keys()].filter(v => !q.options.some(o => o.value === v)).map(v => ({ value: v, label: labelOf(v), count: counts.get(v) }));
      let items = [...known, ...extra];
      if (q.group === 'picker') items.sort((a, b) => b.count - a.count);
      items = items.map(i => ({ ...i, pct: pct(i.count, answered) }));
      return { ...base, kind: q.group === 'slots' ? 'slots' : 'choice', multi: q.type === 'multiple_choice' || !!q.item.multiple, items };
    }
    case 'scale': case 'nps': {
      const xs = answeredRows.map(r => numericValue(r, q)).filter(n => n !== null);
      const dist = [];
      for (let i = q.min; i <= q.max && dist.length < 30; i++) dist.push({ value: i, count: xs.filter(x => x === i).length });
      const res = { ...base, kind: q.group, mean: mean(xs), median: median(xs), min: xs.length ? Math.min(...xs) : null, max: xs.length ? Math.max(...xs) : null, dist, n: xs.length };
      if (q.group === 'nps') {
        const pro = xs.filter(x => x >= 9).length, det = xs.filter(x => x <= 6).length, pas = xs.length - pro - det;
        Object.assign(res, { promoters: pro, passives: pas, detractors: det, score: xs.length ? Math.round(pct(pro, xs.length) - pct(det, xs.length)) : null });
      }
      return res;
    }
    case 'number': case 'repeat': {
      const xs = rows.map(r => numericValue(r, q)).filter(n => n !== null);
      return { ...base, answered: xs.length, kind: 'number', mean: mean(xs), median: median(xs), min: xs.length ? Math.min(...xs) : null, max: xs.length ? Math.max(...xs) : null, sum: xs.reduce((a, b) => a + b, 0), bins: histogram(xs), money: q.type === 'payment' };
    }
    case 'date': {
      const fake = answeredRows.map(r => ({ d: String(rawValue(r, q)).slice(0, 10) })).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.d));
      const counts = new Map();
      fake.forEach(x => counts.set(x.d, (counts.get(x.d) || 0) + 1));
      const byDay = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, count]) => ({ day, count }));
      return { ...base, kind: 'date', byDay, first: byDay[0]?.day || null, last: byDay[byDay.length - 1]?.day || null };
    }
    case 'time': {
      const byHour = Array.from({ length: 24 }, (_, h) => ({ value: h, count: 0 }));
      answeredRows.forEach(r => { const m = /^(\d{1,2}):/.exec(String(rawValue(r, q))); if (m && +m[1] < 24) byHour[+m[1]].count++; });
      return { ...base, kind: 'time', byHour };
    }
    case 'text': {
      const sorted = [...answeredRows].sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
      const texts = answeredRows.map(r => String(rawValue(r, q) ?? ''));
      return { ...base, kind: 'text', words: q.sensitive ? [] : wordCounts(texts), latest: q.sensitive ? [] : sorted.slice(0, 8).map(r => ({ id: r.id, at: r.submittedAt, text: String(rawValue(r, q)) })) };
    }
    case 'ranking': {
      const n = q.options.length;
      const items = q.options.map(o => {
        const ranks = [];
        answeredRows.forEach(r => { const v = rawValue(r, q); if (Array.isArray(v)) { const i = v.map(String).indexOf(o.value); if (i >= 0) ranks.push(i + 1); } });
        return { value: o.value, label: o.label, avgRank: mean(ranks), firstPct: pct(ranks.filter(x => x === 1).length, answered), count: ranks.length };
      }).sort((a, b) => (a.avgRank ?? 1e9) - (b.avgRank ?? 1e9));
      return { ...base, kind: 'ranking', items, n };
    }
    case 'matrix': {
      const rowsOpt = q.options;
      const cols = (Array.isArray(q.item.columns) ? q.item.columns : []).map(c => ({ value: String(c.value), label: c.label || String(c.value) }));
      const cells = rowsOpt.map(ro => cols.map(co => answeredRows.filter(r => {
        const v = rawValue(r, q);
        const cell = v && typeof v === 'object' ? v[ro.value] : undefined;
        return Array.isArray(cell) ? cell.map(String).includes(co.value) : cell !== undefined && String(cell) === co.value;
      }).length));
      return { ...base, kind: 'matrix', rows: rowsOpt, cols, cells };
    }
    default:
      return { ...base, kind: 'filled' };
  }
}

/** Tableau croisé de deux dimensions. → { rows:[{value,label}], cols, cells[i][j], rowTotals, colTotals, total } */
export function crossTab(dimA, dimB, rows) {
  const ga = groupRows(rows, dimA).filter(g => g.value !== '__empty');
  const gb = groupRows(rows, dimB).filter(g => g.value !== '__empty');
  const colIdx = new Map(gb.map((g, j) => [g.value, j]));
  const cells = ga.map(g => {
    const line = gb.map(() => 0);
    g.rows.forEach(r => dimB.values(r).forEach(v => { const j = colIdx.get(v.value); if (j !== undefined) line[j]++; }));
    return line;
  });
  const rowTotals = cells.map(l => l.reduce((a, b) => a + b, 0));
  const colTotals = gb.map((_, j) => cells.reduce((a, l) => a + l[j], 0));
  return { rows: ga.map(g => ({ value: g.value, label: g.label })), cols: gb.map(g => ({ value: g.value, label: g.label })), cells, rowTotals, colTotals, total: rowTotals.reduce((a, b) => a + b, 0) };
}

/** Indicateur principal d'une question (segments, comparaisons). */
export function headline(stats) {
  if (!stats) return { text: '—', value: null };
  switch (stats.kind) {
    case 'scale': return { text: `moyenne ${fmtNum(stats.mean)} / ${stats.dist?.[stats.dist.length - 1]?.value ?? ''}`, value: stats.mean };
    case 'nps': return { text: `NPS ${stats.score ?? '—'}`, value: stats.score };
    case 'number': return { text: `moyenne ${fmtNum(stats.mean)}`, value: stats.mean };
    case 'choice': case 'slots': {
      const top = [...stats.items].sort((a, b) => b.count - a.count)[0];
      if (stats.type === 'yes_no') { const yes = stats.items.find(i => i.value === 'true'); return { text: `${fmtNum(yes?.pct ?? 0, 0)} % oui`, value: yes?.pct ?? 0 }; }
      return top && top.count ? { text: `${top.label} (${fmtNum(top.pct, 0)} %)`, value: top.pct } : { text: '—', value: null };
    }
    case 'ranking': return stats.items[0] ? { text: `1er : ${stats.items[0].label} (rang moyen ${fmtNum(stats.items[0].avgRank)})`, value: stats.items[0].avgRank } : { text: '—', value: null };
    default: return { text: `${stats.answered} réponse${stats.answered > 1 ? 's' : ''}`, value: stats.answered };
  }
}

// ── Quiz ────────────────────────────────────────────────────
const scoreCache = new WeakMap();
export function scoreDetails(def, row) {
  const c = scoreCache.get(row);
  if (c && c.def === def) return c.res;
  let res;
  try { res = computeScore(def, row.answers || {}); } catch { res = { score: null, maxScore: null, details: [] }; }
  scoreCache.set(row, { def, res });
  return res;
}
export function scoreOf(def, row) {
  if (row.score !== null && row.score !== undefined && Number.isFinite(row.score)) return row.score;
  return scoreDetails(def, row).score;
}
export function quizStats(def, rows, passPct = 50) {
  const qs = new Map(adminQuestions(def).map(q => [q.key, q]));
  const per = new Map();
  let maxScore = null;
  const scores = [];
  rows.forEach(r => {
    const d = scoreDetails(def, r);
    if (d.maxScore !== null) maxScore = Math.max(maxScore ?? 0, d.maxScore);
    const s = scoreOf(def, r);
    if (s !== null) scores.push(s);
    d.details.forEach(x => {
      if (!per.has(x.key)) per.set(x.key, { key: x.key, label: qs.get(x.key)?.label || x.key, n: 0, success: 0, points: 0, max: x.max });
      const p = per.get(x.key);
      p.n++;
      p.points += x.points;
      if (x.correct === true || (x.correct === null && x.max > 0 && x.points >= x.max)) p.success++;
    });
  });
  const threshold = maxScore ? (maxScore * passPct) / 100 : null;
  return {
    n: scores.length, maxScore, mean: mean(scores), median: median(scores), min: scores.length ? Math.min(...scores) : null, max: scores.length ? Math.max(...scores) : null,
    threshold, passRate: threshold === null || !scores.length ? null : pct(scores.filter(s => s >= threshold).length, scores.length),
    bins: histogram(scores, Math.min(10, Math.max(1, Math.ceil(maxScore || 10)))),
    perQuestion: [...per.values()].map(p => ({ ...p, successPct: pct(p.success, p.n), avgPoints: p.n ? p.points / p.n : null })),
  };
}

// ── Quotas & capacités ──────────────────────────────────────
export function quotaUsage(def, rows) {
  const quotas = Array.isArray(def?.settings?.quotas) ? def.settings.quotas : [];
  const active = rows.filter(r => !r.waitlisted);
  return quotas.filter(q => q && q.expr).map(q => {
    let used = 0;
    for (const r of active) {
      try { if (truthy(evaluate(String(q.expr), { ...(r.computed || {}), ...(r.answers || {}) }, {}))) used++; } catch { /* formule invalide */ }
    }
    const max = toNumber(q.max);
    return { expr: q.expr, message: q.message || '', max, used, remaining: max === null ? null : Math.max(0, max - used) };
  });
}

/** Planning des créneaux : [{ key, label, slots: [{ value, label, capacity, count, waitlisted, rows }] }] */
export function slotPlanning(def, rows) {
  return adminQuestions(def).filter(q => q.type === 'slots' || (q.group === 'choice' && q.options.some(o => o.capacity))).map(q => ({
    key: q.key, label: q.label,
    slots: q.options.map(o => {
      const hit = rows.filter(r => choiceValues(r, q).includes(o.value));
      return { value: o.value, label: o.label, capacity: toNumber(o.capacity), count: hit.filter(r => !r.waitlisted).length, waitlisted: hit.filter(r => r.waitlisted).length, rows: hit };
    }),
  }));
}

// ── Évaluations (candidatures) ──────────────────────────────
export const DEFAULT_CRITERIA = [
  { id: 'motivation', label: 'Motivation', max: 5, weight: 1 },
  { id: 'disponibilite', label: 'Disponibilité', max: 5, weight: 1 },
  { id: 'experience', label: 'Expérience / compétences', max: 5, weight: 1 },
  { id: 'equipe', label: 'Esprit d\'équipe', max: 5, weight: 1 },
];

/** Note /20 d'une évaluation selon la grille (critères non notés ignorés). */
export function evaluationTotal(ev, criteria) {
  let got = 0, max = 0;
  for (const c of criteria) {
    const v = toNumber(ev?.scores?.[c.id]);
    if (v === null) continue;
    const w = toNumber(c.weight) ?? 1;
    got += Math.min(Math.max(v, 0), c.max) * w;
    max += c.max * w;
  }
  return max ? (got / max) * 20 : null;
}

/** Synthèse par réponse : { n, mean, sd, totals, conflicts, byCriterion } */
export function evaluationSummary(evals, criteria) {
  const valid = evals.filter(e => !e.conflict);
  const totals = valid.map(e => evaluationTotal(e, criteria)).filter(x => x !== null);
  const byCriterion = Object.fromEntries(criteria.map(c => [c.id, mean(valid.map(e => toNumber(e.scores?.[c.id])).filter(x => x !== null))]));
  return { n: totals.length, mean: mean(totals), sd: stdev(totals), totals, conflicts: evals.filter(e => e.conflict).length, byCriterion };
}

// ── Comparaison d'enquêtes ──────────────────────────────────
const normLabel = s => fold(s).replace(/[^a-z0-9]+/g, ' ').trim();
/** Questions comparables entre une référence et d'autres formulaires (par clé, sinon par intitulé). */
export function matchQuestions(baseDef, otherDefs) {
  const base = adminQuestions(baseDef).filter(q => ['scale', 'nps', 'number', 'choice'].includes(q.group));
  return base.map(q => ({
    question: q,
    matches: otherDefs.map(d => {
      const qs = adminQuestions(d);
      return qs.find(x => x.key === q.key && x.group === q.group) || qs.find(x => normLabel(x.label) === normLabel(q.label) && x.group === q.group) || null;
    }),
  }));
}
