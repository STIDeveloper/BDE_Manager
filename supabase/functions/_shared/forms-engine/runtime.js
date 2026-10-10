// FICHIER GÉNÉRÉ par scripts/build-edge.mjs — ne pas modifier ici (source : src/forms/).
// ============================================================
// Moteur de formulaires — évaluation d'un formulaire rempli
// ============================================================
// evaluateForm : visibilité (pages, éléments, options), obligations,
// lecture seule, valeurs par défaut, variables calculées, score,
// parcours effectif (règles « next »). Point fixe : une question masquée
// est considérée vide pour les conditions suivantes (masquages en cascade).

import { compileForm } from './compile.js';
import { evaluate } from './expr.js';
import {
  hasOwn, isEmpty, isPlainObject, truthy, toNumber, toText, parseDate, ymdToIso,
  looseEqual, fold, cleanNumber,
} from './values.js';

const MAX_PASSES = 6;

function readPrefill(prefillFrom, context) {
  if (typeof prefillFrom !== 'string') return undefined;
  if (prefillFrom.startsWith('member.')) {
    const m = context.member;
    const f = prefillFrom.slice(7);
    return m && typeof m === 'object' && hasOwn(m, f) ? m[f] : undefined;
  }
  if (prefillFrom.startsWith('url:')) {
    const p = context.params;
    const name = prefillFrom.slice(4);
    if (!p) return undefined;
    if (typeof p.get === 'function') { const v = p.get(name); return v === null ? undefined : v; }
    return typeof p === 'object' && hasOwn(p, name) ? p[name] : undefined;
  }
  return undefined;
}

function plainParams(p) {
  if (!p) return null;
  if (typeof p.entries === 'function' && typeof p.get === 'function') {
    const o = {};
    for (const [k, v] of p.entries()) if (!hasOwn(o, k)) o[k] = v;
    return o;
  }
  return isPlainObject(p) ? p : null;
}

/** Convertit le résultat d'une variable vers son type déclaré. */
export function coerceType(v, type) {
  if (v === null || v === undefined) return null;
  switch (type) {
    case 'number': return toNumber(v);
    case 'text': return isEmpty(v) ? null : toText(v);
    case 'boolean': return truthy(v);
    case 'date': { const p = parseDate(v); return p ? ymdToIso(p) : null; }
    default: return v;
  }
}

// ── Score ───────────────────────────────────────────────────

const MULTI_TYPES = new Set(['multiple_choice']);

function isCorrect(type, v, correct) {
  if (isEmpty(v)) return false;
  if (type === 'ranking') {
    return Array.isArray(correct) && Array.isArray(v) && v.length === correct.length && v.every((x, i) => looseEqual(x, correct[i]));
  }
  if (MULTI_TYPES.has(type)) {
    const exp = Array.isArray(correct) ? correct : [correct];
    const got = Array.isArray(v) ? v : [v];
    return got.length === exp.length && exp.every(e => got.some(g => looseEqual(g, e)));
  }
  const accepted = Array.isArray(correct) ? correct : [correct];
  return accepted.some(c => {
    if (typeof c === 'string' && typeof v === 'string') return fold(c.trim()) === fold(v.trim());
    return looseEqual(v, c);
  });
}

function scoreInternal(c, values, visible) {
  let score = 0, max = 0, any = false;
  const details = [];
  for (const q of c.questions) {
    const s = q.item.score;
    if (!isPlainObject(s) || q.repeatKey) continue;
    if (visible && !visible.has(q.key)) continue;
    any = true;
    const v = values[q.key];
    let pts = 0, qmax = 0, correct = null;
    if (isPlainObject(s.perOption)) {
      const per = s.perOption;
      const sel = Array.isArray(v) ? v : isEmpty(v) ? [] : [v];
      for (const x of sel) { const k = String(x); if (hasOwn(per, k)) pts += toNumber(per[k]) ?? 0; }
      const all = Object.keys(per).map(k => toNumber(per[k]) ?? 0);
      qmax = MULTI_TYPES.has(q.type) ? all.filter(x => x > 0).reduce((a, b) => a + b, 0) : Math.max(0, ...all);
    } else if (s.correct !== undefined) {
      const points = typeof s.points === 'number' ? s.points : 1;
      correct = isCorrect(q.type, v, s.correct);
      pts = correct ? points : 0;
      qmax = Math.max(0, points);
    }
    score += pts;
    max += qmax;
    details.push({ key: q.key, points: cleanNumber(pts), max: cleanNumber(qmax), correct });
  }
  return any ? { score: cleanNumber(score), maxScore: cleanNumber(max), details } : { score: null, maxScore: null, details };
}

/**
 * Score d'un quiz : score.correct (+ points, 1 par défaut) ou score.perOption.
 * options.visible : Set des clés visibles (les questions masquées ne comptent pas).
 * → { score, maxScore, details: [{ key, points, max, correct }] } (score null si aucune question notée)
 */
export function computeScore(definition, answers, options = {}) {
  return scoreInternal(compileForm(definition), isPlainObject(answers) ? answers : {}, options?.visible);
}

// ── Évaluation complète ─────────────────────────────────────

/**
 * Évalue l'état d'un formulaire pour des réponses données.
 * context : { now?: Date, member?, params?, stats?: { optionCounts, total, quotaCounts? }, timeZone? }
 */
export function evaluateForm(definition, answers, context = {}) {
  const c = compileForm(definition);
  const ctx = context && typeof context === 'object' ? context : {};
  const now = ctx.now instanceof Date && !Number.isNaN(ctx.now.getTime()) ? ctx.now : new Date();
  const input = isPlainObject(answers) ? answers : {};
  const params = plainParams(ctx.params);

  // Portée de base : réponses connues uniquement (les clés inconnues sont ignorées)
  const base = Object.create(null);
  for (const k of c.answerKeys) if (hasOwn(input, k)) base[k] = input[k];
  for (const [gk, g] of c.repeatGroups) {
    const arr = Array.isArray(base[gk]) ? base[gk] : [];
    for (const ck of g.childKeys) base[ck] = arr.map(inst => (isPlainObject(inst) && hasOwn(inst, ck) ? inst[ck] : null));
  }
  base.membre = ctx.member ?? null;
  base.params = params;

  const questions = c.questions;
  const pages = c.pages;
  let hidden = new Set();
  let prevVisible = null;
  let state;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const diagnostics = [];
    const opts = { now, timeZone: ctx.timeZone, stats: ctx.stats, diagnostics, score: null };
    const scope = Object.assign(Object.create(null), base);
    for (const k of hidden) scope[k] = null;

    // Valeurs par défaut et préremplissage (seulement si la réponse est vide)
    const defaults = {};
    for (const q of questions) {
      if (q.repeatKey || hidden.has(q.key) || q.type === 'calculated') continue;
      const it = q.item;
      // Un champ caché prérempli (paramètre d'URL, membre) prend la valeur du contexte, pas celle du client
      const forced = q.type === 'hidden' && it.prefillFrom;
      if (!isEmpty(scope[q.key]) && !forced) continue;
      let v = readPrefill(it.prefillFrom, { member: ctx.member, params });
      if (forced && isEmpty(v) && !isEmpty(scope[q.key])) continue;
      if (isEmpty(v) && it.default !== undefined && it.default !== null) {
        const m = c.itemMeta.get(it);
        v = m.defaultAst ? evaluate(m.defaultAst, scope, opts) : isPlainObject(it.default) && 'expr' in it.default ? null : it.default;
      }
      if (!isEmpty(v)) { defaults[q.key] = v; scope[q.key] = v; }
    }

    // Score (avec la visibilité de la passe précédente), puis variables / champs calculés
    const sc = scoreInternal(c, scope, prevVisible);
    opts.score = sc.score;
    const computed = {};
    for (const node of c.computedOrder) {
      const v = coerceType(evaluate(node.ast, scope, opts), node.type);
      computed[node.key] = v;
      scope[node.key] = v;
    }
    for (const k of c.cyclic) { computed[k] = null; scope[k] = null; }

    // Pages visibles et parcours
    const pageVisible = pages.map(p => !p.showIf || truthy(evaluate(p.showIf, scope, opts)));
    const firstVisibleFrom = i => {
      for (let j = i; j < pages.length; j++) if (pageVisible[j]) return pages[j].id;
      return 'submit';
    };
    const stepFrom = idx => {
      const p = pages[idx];
      for (const rule of p.next) {
        if (!rule.when || truthy(evaluate(rule.when, scope, opts))) {
          return rule.goTo === 'submit' ? 'submit' : firstVisibleFrom(c.pagePos.get(rule.goTo));
        }
      }
      return firstVisibleFrom(idx + 1);
    };
    const pageOrder = [];
    const onPath = new Set();
    for (let id = firstVisibleFrom(0); id !== 'submit' && !onPath.has(id);) {
      pageOrder.push(id);
      onPath.add(id);
      id = stepFrom(c.pagePos.get(id));
    }

    // Éléments visibles
    const visible = new Set();
    const itemVisible = new Map();
    for (const e of c.entries) {
      const it = e.item;
      const parentOk = e.parentId === null ? onPath.has(e.pageId) : itemVisible.get(e.ancestors[e.ancestors.length - 1]) === true;
      const m = c.itemMeta.get(it);
      const ok = parentOk && (!m || !m.showIf || truthy(evaluate(m.showIf, scope, opts)));
      itemVisible.set(it, ok);
      if (ok) {
        if (it.id !== undefined) visible.add(it.id);
        if (it.kind === 'question' && it.key) visible.add(it.key);
        if (it.kind === 'section' && it.repeat && it.key) visible.add(it.key);
      }
    }
    const newHidden = new Set();
    for (const q of questions) if (!visible.has(q.key)) newHidden.add(q.key);
    for (const [gk] of c.repeatGroups) if (!visible.has(gk)) newHidden.add(gk);

    state = { scope, opts, diagnostics, defaults, computed, pageVisible, pageOrder, onPath, visible, stepFrom, itemVisible };
    const stable = newHidden.size === hidden.size && [...newHidden].every(k => hidden.has(k));
    hidden = newHidden;
    prevVisible = visible;
    if (stable) break;
  }

  const { scope, opts, diagnostics, defaults, computed, pageVisible, pageOrder, visible, stepFrom } = state;

  // Obligations, lecture seule, options visibles / complètes
  const required = new Set();
  const readOnly = new Set();
  const options = {};
  const fullOptions = {};
  const counts = ctx.stats && isPlainObject(ctx.stats.optionCounts) ? ctx.stats.optionCounts : null;
  for (const q of questions) {
    if (!visible.has(q.key)) continue;
    const it = q.item;
    const m = c.itemMeta.get(it);
    const ro = q.type === 'calculated' || (m.readOnlyIf && truthy(evaluate(m.readOnlyIf, scope, opts)));
    if (ro) readOnly.add(q.key);
    else if (q.type !== 'hidden' && (m.requiredAst ? truthy(evaluate(m.requiredAst, scope, opts)) : m.required)) required.add(q.key);
    if (Array.isArray(it.options)) {
      options[q.key] = m.optionShowIf
        ? it.options.filter(o => { const a = m.optionShowIf.get(String(o?.value)); return !a || truthy(evaluate(a, scope, opts)); })
        : it.options;
      if (counts && isPlainObject(counts[q.key])) {
        const qc = counts[q.key];
        for (const o of it.options) {
          if (!o || typeof o.capacity !== 'number') continue;
          const n = hasOwn(qc, String(o.value)) ? toNumber(qc[String(o.value)]) ?? 0 : 0;
          if (n >= o.capacity) (fullOptions[q.key] ??= new Set()).add(o.value);
        }
      }
    }
  }

  const sc = scoreInternal(c, scope, visible);

  // Valeurs effectives (réponses visibles + défauts + calculs), objet ordinaire
  const values = {};
  for (const k of c.answerKeys) if (visible.has(k) && !isEmpty(scope[k])) values[k] = scope[k];
  for (const k of Object.keys(computed)) values[k] = computed[k];

  const visiblePages = pages.filter((_, i) => pageVisible[i]).map(p => p.id);
  const nextPageId = currentPageId => {
    const i = pageOrder.indexOf(currentPageId);
    if (i >= 0) return pageOrder[i + 1] ?? 'submit';
    const idx = c.pagePos.get(currentPageId);
    if (idx === undefined) return pageOrder[0] ?? 'submit';
    return stepFrom(idx);
  };
  const prevPageId = currentPageId => {
    const i = pageOrder.indexOf(currentPageId);
    return i > 0 ? pageOrder[i - 1] : null;
  };

  return {
    visiblePages,
    visible,
    required,
    readOnly,
    computed,
    score: sc.score,
    maxScore: sc.maxScore,
    pageOrder,
    nextPageId,
    prevPageId,
    defaults,
    values,
    options,
    fullOptions,
    diagnostics,
  };
}

// ── Quotas, capacités, ouverture ────────────────────────────

const fmtCache = {};
function formatDateTime(t) {
  try {
    fmtCache.f ??= new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' });
    return fmtCache.f.format(new Date(t));
  } catch {
    return new Date(t).toISOString();
  }
}

function deriveCount(ast, stats) {
  if (!ast || ast.type !== 'binary' || ast.op !== '=') return null;
  const { left, right } = ast;
  const ref = left.type === 'ref' ? left : right.type === 'ref' ? right : null;
  const lit = left.type === 'lit' ? left : right.type === 'lit' ? right : null;
  if (!ref || !lit || ref.path.length !== 1) return null;
  const oc = isPlainObject(stats.optionCounts) ? stats.optionCounts[ref.name] : null;
  if (!isPlainObject(oc)) return 0;
  const k = String(lit.value);
  return hasOwn(oc, k) ? toNumber(oc[k]) ?? 0 : 0;
}

/**
 * Peut-on (encore) répondre ? → { allowed, waitlist, message?, reasons }
 * Contrôle : statut fermé/archivé, opensAt/closesAt, maxResponses, quotas
 * (settings.quotas : la réponse est concernée si son expr est vraie ; le
 * comptage vient de context.stats.quotaCounts[i] ou, pour `cle = "valeur"`,
 * de stats.optionCounts), capacités des options/créneaux sélectionnés.
 * Si settings.waitlist : complet → autorisé en liste d'attente.
 */
export function quotaStatus(definition, answers, context = {}) {
  const c = compileForm(definition);
  const ctx = context && typeof context === 'object' ? context : {};
  const s = c.settings;
  const now = ctx.now instanceof Date && !Number.isNaN(ctx.now.getTime()) ? ctx.now : new Date();
  const closed = message => ({ allowed: false, waitlist: false, message, reasons: [message] });

  if (definition?.status === 'closed' || definition?.status === 'archived') return closed('Ce formulaire est fermé.');
  const open = s.opensAt ? new Date(s.opensAt).getTime() : NaN;
  if (!Number.isNaN(open) && now.getTime() < open) return closed(`Ce formulaire ouvrira le ${formatDateTime(open)}.`);
  const close = s.closesAt ? new Date(s.closesAt).getTime() : NaN;
  if (!Number.isNaN(close) && now.getTime() >= close) return closed(`Ce formulaire est fermé depuis le ${formatDateTime(close)}.`);

  const stats = isPlainObject(ctx.stats) ? ctx.stats : null;
  const reasons = [];
  if (stats) {
    const total = toNumber(stats.total);
    if (Number.isInteger(s.maxResponses) && total !== null && total >= s.maxResponses) {
      reasons.push('Le nombre maximal de réponses est atteint.');
    }
    const ev = evaluateForm(definition, answers, ctx);
    const scope = { ...ev.values, membre: ctx.member ?? null, params: plainParams(ctx.params) };
    const qc = Array.isArray(stats.quotaCounts) || isPlainObject(stats.quotaCounts) ? stats.quotaCounts : null;
    for (const q of c.quotas) {
      if (!Number.isInteger(q.max)) continue;
      const concerned = !q.ast || truthy(evaluate(q.ast, scope, { now, stats, score: ev.score }));
      if (!concerned) continue;
      let count = qc && qc[q.index] !== undefined ? toNumber(qc[q.index]) : null;
      if (count === null) count = q.ast ? deriveCount(q.ast, stats) : total;
      if (count !== null && count >= q.max) reasons.push(q.message ? String(q.message) : 'Le quota pour ce choix est atteint.');
    }
    for (const q of c.questions) {
      if (!ev.visible.has(q.key) || !Array.isArray(q.item.options) || q.repeatKey) continue;
      const full = ev.fullOptions[q.key];
      if (!full) continue;
      const v = ev.values[q.key];
      const sel = Array.isArray(v) ? v : isEmpty(v) ? [] : [v];
      for (const x of sel) {
        const o = q.item.options.find(op => op && String(op.value) === String(x));
        if (o && full.has(o.value)) reasons.push(`« ${o.label || o.value} » est complet.`);
      }
    }
  }
  if (!reasons.length) return { allowed: true, waitlist: false, reasons };
  if (s.waitlist) {
    return { allowed: true, waitlist: true, message: `${reasons[0]} Ta réponse sera placée sur liste d'attente.`, reasons };
  }
  return { allowed: false, waitlist: false, message: reasons[0], reasons };
}
