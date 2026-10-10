// Logique pure des formules et du constructeur de conditions (sans composant).
import { useMemo } from 'react';
import { tryParse, collectRefs, flattenItems, OPTION_TYPES } from '../../../forms/engine/index.js';

const NUMERIC = new Set(['number', 'rating', 'scale', 'nps', 'calculated']);
const BOOL = new Set(['yes_no', 'consent']);
export const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
export { NUMERIC };

/** Références disponibles dans les formules : questions + variables. */
export function useRefs(def, excludeKey) {
  return useMemo(() => buildRefs(def, excludeKey), [def, excludeKey]);
}

export function buildRefs(def, excludeKey) {
  const out = [];
  for (const e of flattenItems(def)) {
    const it = e.item;
    if (it.kind === 'question' && it.key && it.key !== excludeKey) {
      out.push({ key: it.key, label: it.label || it.key, type: it.type, options: Array.isArray(it.options) ? it.options : null, source: it.source, kind: 'question' });
    } else if (it.kind === 'section' && it.repeat && it.key && it.key !== excludeKey) {
      out.push({ key: it.key, label: `${it.title || it.key} (groupe répété)`, type: 'group', kind: 'group' });
    }
  }
  for (const v of def.variables || []) {
    if (v?.key && v.key !== excludeKey) out.push({ key: v.key, label: v.label || v.key, type: v.type === 'number' ? 'number' : v.type === 'boolean' ? 'yes_no' : v.type === 'date' ? 'date' : 'short_text', kind: 'variable' });
  }
  return out;
}

/** Analyse d'une formule pour l'éditeur. */
export function analyzeFormula(src, refs) {
  if (!String(src || '').trim()) return { empty: true, error: null, unknown: [] };
  const { ast, error } = tryParse(String(src));
  if (error) return { empty: false, error: { message: error.detail, position: error.position }, unknown: [] };
  const known = new Set([...refs.map(r => r.key), 'membre', 'params']);
  const unknown = [...collectRefs(ast)].filter(r => !known.has(r));
  return { empty: false, error: null, unknown, ast };
}

export const OPS = {
  eq: { label: 'est égal à', needs: true },
  neq: { label: 'est différent de', needs: true },
  gt: { label: 'est supérieur à', needs: true },
  gte: { label: 'est supérieur ou égal à', needs: true },
  lt: { label: 'est inférieur à', needs: true },
  lte: { label: 'est inférieur ou égal à', needs: true },
  contains: { label: 'contient', needs: true },
  notcontains: { label: 'ne contient pas', needs: true },
  notempty: { label: 'est renseigné', needs: false },
  empty: { label: 'est vide', needs: false },
  true: { label: 'est Oui', needs: false },
  false: { label: 'est Non', needs: false },
  age_lt: { label: 'âge (ans) inférieur à', needs: true },
  age_gte: { label: 'âge (ans) au moins', needs: true },
};
const CMP = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };
const CMP_REV = { '=': 'eq', '==': 'eq', '<>': 'neq', '!=': 'neq', '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte' };

export function opsFor(ref) {
  if (!ref) return ['eq', 'neq', 'notempty', 'empty'];
  const t = ref.type;
  if (BOOL.has(t)) return ['true', 'false', 'notempty', 'empty'];
  if (NUMERIC.has(t)) return ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'notempty', 'empty'];
  if (t === 'date' || t === 'datetime' || t === 'time') return ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', ...(t === 'date' ? ['age_lt', 'age_gte'] : []), 'notempty', 'empty'];
  if (t === 'multiple_choice' || (t === 'slots') || t === 'ranking' || t === 'group') return ['contains', 'notcontains', 'notempty', 'empty'];
  if (OPTION_TYPES.has(t) || t === 'dropdown') return ['eq', 'neq', 'notempty', 'empty'];
  return ['eq', 'neq', 'contains', 'notcontains', 'notempty', 'empty'];
}

const quote = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
function literal(ref, op, value) {
  if (op === 'age_lt' || op === 'age_gte') return String(Number(value) || 0);
  if (ref && NUMERIC.has(ref.type) && value !== '' && Number.isFinite(Number(String(value).replace(',', '.')))) return String(Number(String(value).replace(',', '.')));
  return quote(value);
}

export function clauseToExpr(c, refs) {
  if (!c.key) return '';
  const ref = refs.find(r => r.key === c.key);
  switch (c.op) {
    case 'true': return c.key;
    case 'false': return `NON ${c.key}`;
    case 'empty': return `VIDE(${c.key})`;
    case 'notempty': return `NON_VIDE(${c.key})`;
    case 'contains': return `CONTIENT(${c.key}; ${quote(c.value)})`;
    case 'notcontains': return `NON CONTIENT(${c.key}; ${quote(c.value)})`;
    case 'age_lt': return `AGE(${c.key}) < ${literal(ref, c.op, c.value)}`;
    case 'age_gte': return `AGE(${c.key}) >= ${literal(ref, c.op, c.value)}`;
    default: return `${c.key} ${CMP[c.op] || '='} ${literal(ref, c.op, c.value)}`;
  }
}

export function clausesToExpr(clauses, join, refs) {
  const parts = clauses.map(c => clauseToExpr(c, refs)).filter(Boolean);
  return parts.join(join === 'OU' ? ' OU ' : ' ET ');
}

/** Coupe au niveau 0 sur ET / OU (hors chaînes et parenthèses). */
function splitTop(src) {
  const parts = [];
  const joins = [];
  let depth = 0, quoteCh = null, start = 0;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoteCh) {
      if (ch === quoteCh) { if (src[i + 1] === quoteCh) i++; else quoteCh = null; }
      continue;
    }
    if (ch === '"' || ch === '\'') { quoteCh = ch; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0 && /\s/.test(ch)) {
      const m = /^\s+(ET|OU|AND|OR)\s+/i.exec(src.slice(i));
      if (m) {
        parts.push(src.slice(start, i));
        joins.push(fold(m[1]) === 'OU' || fold(m[1]) === 'OR' ? 'OU' : 'ET');
        i += m[0].length - 1;
        start = i + 1;
      }
    }
  }
  parts.push(src.slice(start));
  return { parts: parts.map(p => p.trim()), joins };
}

const KEY = '([a-z][a-z0-9_]*)';
const STR = '"((?:[^"]|"")*)"';
const VAL = `(${STR}|-?\\d+(?:[.,]\\d+)?|VRAI|FAUX)`;
const unq = s => s.replace(/""/g, '"');

function parseClause(p) {
  let m;
  if ((m = new RegExp(`^${KEY}$`).exec(p))) return { key: m[1], op: 'true', value: '' };
  if ((m = new RegExp(`^NON\\s+${KEY}$`, 'i').exec(p))) return { key: m[1], op: 'false', value: '' };
  if ((m = new RegExp(`^VIDE\\(\\s*${KEY}\\s*\\)$`, 'i').exec(p))) return { key: m[1], op: 'empty', value: '' };
  if ((m = new RegExp(`^NON_VIDE\\(\\s*${KEY}\\s*\\)$`, 'i').exec(p))) return { key: m[1], op: 'notempty', value: '' };
  if ((m = new RegExp(`^(NON\\s+)?CONTIENT\\(\\s*${KEY}\\s*[;,]\\s*${STR}\\s*\\)$`, 'i').exec(p))) return { key: m[2], op: m[1] ? 'notcontains' : 'contains', value: unq(m[3]) };
  if ((m = new RegExp(`^AGE\\(\\s*${KEY}\\s*\\)\\s*(<|>=)\\s*(\\d+)$`, 'i').exec(p))) return { key: m[1], op: m[2] === '<' ? 'age_lt' : 'age_gte', value: m[3] };
  if ((m = new RegExp(`^${KEY}\\s*(<=|>=|<>|!=|==|=|<|>)\\s*${VAL}$`).exec(p))) {
    const raw = m[3];
    const value = m[4] !== undefined ? unq(m[4]) : raw;
    return { key: m[1], op: CMP_REV[m[2]], value };
  }
  return null;
}

/** Formule → { clauses, join } ou null si non représentable visuellement. */
export function parseConditions(src) {
  const s = String(src || '').trim();
  if (!s) return { clauses: [], join: 'ET' };
  const { parts, joins } = splitTop(s);
  if (new Set(joins).size > 1) return null;
  const clauses = [];
  for (const p of parts) {
    const c = parseClause(p);
    if (!c) return null;
    clauses.push(c);
  }
  return { clauses, join: joins[0] || 'ET' };
}

