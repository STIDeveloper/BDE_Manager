// ============================================================
// TRÉSORERIE — calculs purs (soldes, exercices, budgets, doublons)
// ============================================================
import { roundMoney } from '../contracts.js';
import { normalizeText } from './csv.js';

export const TYPE_LABELS = { income: 'Recette', expense: 'Dépense' };
export const STATUS_LABELS = { draft: 'Brouillon', pending: 'En attente', validated: 'Validée', rejected: 'Rejetée' };
export const STATUS_BADGES = { draft: 'badge-neutral', pending: 'badge-amber', validated: 'badge-emerald', rejected: 'badge-rose' };

const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const monthShort = (m) => MONTHS_SHORT[m] || '';

const pad = (n) => String(n).padStart(2, '0');
const signed = (t) => (t.type === 'income' ? t.amount : -t.amount);

/** Année de début de l'exercice contenant `date` ('AAAA-MM-JJ'). */
export function fiscalYearOf(date, fiscalYearStart = '09-01') {
  const [y, m, d] = String(date).split('-').map(Number);
  const [fm, fd] = String(fiscalYearStart || '09-01').split('-').map(Number);
  if (!y) return new Date().getFullYear();
  return (m > fm || (m === fm && d >= fd)) ? y : y - 1;
}

/** Bornes de l'exercice commençant l'année `startYear` : [start, end) en 'AAAA-MM-JJ' + libellé. */
export function fiscalRange(startYear, fiscalYearStart = '09-01') {
  const fs = /^\d{2}-\d{2}$/.test(fiscalYearStart || '') ? fiscalYearStart : '09-01';
  const start = `${startYear}-${fs}`;
  const endExclusive = `${startYear + 1}-${fs}`;
  const d = new Date(startYear + 1, Number(fs.slice(0, 2)) - 1, Number(fs.slice(3)) - 1);
  const last = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const label = fs === '01-01' ? String(startYear) : `${startYear}-${startYear + 1}`;
  return { start, endExclusive, last, label, startYear };
}

/** Années d'exercice présentes dans les données (+ courante), décroissantes. */
export function fiscalYearsAvailable(transactions, fiscalYearStart, today) {
  const set = new Set([fiscalYearOf(today, fiscalYearStart)]);
  Object.values(transactions || {}).forEach(t => set.add(fiscalYearOf(t.date, fiscalYearStart)));
  return [...set].sort((a, b) => b - a);
}

const inRange = (date, from, toExclusive) => (!from || date >= from) && (!toExclusive || date < toExclusive);

/** Solde : ouverture + opérations validées datées à partir de la date d'ouverture (jusqu'à `until` exclu). */
export function balanceAt(transactions, settings, until) {
  const opening = Number(settings?.openingBalance) || 0;
  const from = settings?.openingDate || '';
  let total = opening;
  Object.values(transactions || {}).forEach(t => {
    if (t.status === 'validated' && inRange(t.date, from, until)) total += signed(t);
  });
  return roundMoney(total);
}

/** Totaux recettes / dépenses validées sur une période. */
export function totals(list, from, toExclusive, statuses = ['validated']) {
  let income = 0; let expense = 0;
  list.forEach(t => {
    if (!statuses.includes(t.status) || !inRange(t.date, from, toExclusive)) return;
    if (t.type === 'income') income += t.amount; else expense += t.amount;
  });
  return { income: roundMoney(income), expense: roundMoney(expense), net: roundMoney(income - expense) };
}

/** 12 mois de l'exercice : [{ key:'AAAA-MM', label, income, expense }]. */
export function monthlySeries(list, range) {
  const [sy, sm] = range.start.split('-').map(Number);
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(sy, sm - 1 + i, 1);
    return { key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, label: monthShort(d.getMonth()), year: d.getFullYear(), income: 0, expense: 0 };
  });
  const idx = Object.fromEntries(months.map((m, i) => [m.key, i]));
  list.forEach(t => {
    if (t.status !== 'validated' || !inRange(t.date, range.start, range.endExclusive)) return;
    const i = idx[t.date.slice(0, 7)];
    if (i === undefined) return;
    months[i][t.type] = roundMoney(months[i][t.type] + t.amount);
  });
  return months;
}

/** Répartition par catégorie d'un type, triée décroissante. */
export function byCategory(list, type, categories, from, toExclusive) {
  const map = new Map();
  list.forEach(t => {
    if (t.type !== type || t.status !== 'validated' || !inRange(t.date, from, toExclusive)) return;
    map.set(t.categoryId, roundMoney((map.get(t.categoryId) || 0) + t.amount));
  });
  const total = roundMoney([...map.values()].reduce((a, b) => a + b, 0));
  return {
    total,
    items: [...map.entries()].map(([categoryId, amount]) => ({
      categoryId, amount,
      label: categories?.[categoryId]?.label || 'Catégorie supprimée',
      color: categories?.[categoryId]?.color || '#6b7280',
      share: total > 0 ? amount / total : 0,
    })).sort((a, b) => b.amount - a.amount),
  };
}

/**
 * Prévu vs réalisé d'un budget. Réalisé = opérations validées liées à
 * l'événement du budget (ou, budget annuel, de l'exercice) dans la catégorie
 * et le sens de la ligne. Plusieurs lignes d'une même catégorie se partagent
 * le réalisé : il est affiché sur la première, les suivantes sont « incluses ».
 * `pending` = montants encore en attente de validation.
 */
export function budgetReport(budget, transactions, settings) {
  const list = Object.values(transactions || {});
  let scope;
  if (budget.eventId) scope = list.filter(t => t.eventId === budget.eventId);
  else {
    const startYear = Number(String(budget.year || '').slice(0, 4)) || new Date().getFullYear();
    const r = fiscalRange(startYear, settings?.fiscalYearStart);
    scope = list.filter(t => inRange(t.date, r.start, r.endExclusive));
  }
  const sum = (type, categoryId, status) => roundMoney(scope
    .filter(t => t.type === type && t.categoryId === categoryId && t.status === status)
    .reduce((a, t) => a + t.amount, 0));
  const seen = new Set();
  const lines = (budget.lines || []).map(l => {
    const key = `${l.type}:${l.categoryId}`;
    const first = !seen.has(key);
    seen.add(key);
    const plannedGroup = roundMoney((budget.lines || []).filter(x => `${x.type}:${x.categoryId}` === key).reduce((a, x) => a + (Number(x.planned) || 0), 0));
    const actual = first ? sum(l.type, l.categoryId, 'validated') : null;
    const pending = first ? sum(l.type, l.categoryId, 'pending') : null;
    return { ...l, actual, pending, shared: !first, plannedGroup, gap: first ? roundMoney(actual - plannedGroup) : null };
  });
  // Opérations du périmètre hors lignes prévues (non budgétées).
  const keys = new Set((budget.lines || []).map(l => `${l.type}:${l.categoryId}`));
  const unplanned = {};
  scope.filter(t => t.status === 'validated' && !keys.has(`${t.type}:${t.categoryId}`)).forEach(t => {
    const k = `${t.type}:${t.categoryId}`;
    unplanned[k] = { type: t.type, categoryId: t.categoryId, actual: roundMoney((unplanned[k]?.actual || 0) + t.amount) };
  });
  const plannedIncome = roundMoney((budget.lines || []).filter(l => l.type === 'income').reduce((a, l) => a + (Number(l.planned) || 0), 0));
  const plannedExpense = roundMoney((budget.lines || []).filter(l => l.type === 'expense').reduce((a, l) => a + (Number(l.planned) || 0), 0));
  const t = totals(scope, '', '');
  return {
    lines,
    unplanned: Object.values(unplanned),
    plannedIncome, plannedExpense, plannedNet: roundMoney(plannedIncome - plannedExpense),
    actualIncome: t.income, actualExpense: t.expense, actualNet: t.net,
  };
}

/**
 * Tonalité d'un écart : dépense au-delà du prévu → mauvais ; recette en deçà → à surveiller.
 * @returns {'good'|'warn'|'bad'|'neutral'}
 */
export function gapTone(type, planned, actual) {
  if (!planned && !actual) return 'neutral';
  if (type === 'expense') {
    if (actual > planned * 1.0001) return actual > planned * 1.1 ? 'bad' : 'warn';
    return 'good';
  }
  if (actual >= planned) return 'good';
  return actual >= planned * 0.8 ? 'warn' : 'bad';
}

/** Empreinte d'une ligne bancaire (date + montant signé + libellé normalisé). */
export const bankKey = (date, signedAmount, label) => `${date}|${roundMoney(signedAmount).toFixed(2)}|${normalizeText(label).slice(0, 40)}`;

/**
 * Doublon probable : même empreinte d'import, ou même sens + même montant
 * à 3 jours près. Renvoie l'opération existante la plus proche, ou null.
 */
export function findDuplicate(row, transactions, used = new Set()) {
  const list = Object.values(transactions || {});
  const exact = list.find(t => t.importKey && t.importKey === row.key);
  if (exact) return { tx: exact, exact: true };
  const target = new Date(row.date).getTime();
  let best = null; let bestGap = Infinity;
  list.forEach(t => {
    if (used.has(t.id) || t.type !== row.type || Math.abs(t.amount - row.amount) > 0.004 || t.status === 'rejected') return;
    const gap = Math.abs(new Date(t.date).getTime() - target) / 86400000;
    if (gap <= 3 && gap < bestGap) { best = t; bestGap = gap; }
  });
  return best ? { tx: best, exact: false } : null;
}

export const EMPTY_FILTERS = { search: '', from: '', to: '', type: '', categoryId: '', status: '', eventId: '', reconciled: '' };

/** Filtre de la liste des opérations. */
export function filterTransactions(list, f, { categories, members, events } = {}) {
  const q = normalizeText(f.search);
  return list.filter(t => {
    if (f.from && t.date < f.from) return false;
    if (f.to && t.date > f.to) return false;
    if (f.type && t.type !== f.type) return false;
    if (f.categoryId && t.categoryId !== f.categoryId) return false;
    if (f.status && t.status !== f.status) return false;
    if (f.eventId && t.eventId !== f.eventId) return false;
    if (f.reconciled === 'yes' && !t.reconciled) return false;
    if (f.reconciled === 'no' && t.reconciled) return false;
    if (q) {
      const m = members?.find(x => x.id === t.memberId);
      const hay = normalizeText([
        t.label, t.counterparty, t.reference, t.notes, categories?.[t.categoryId]?.label,
        m ? `${m.firstName} ${m.lastName}` : '', events?.[t.eventId]?.title, String(t.amount).replace('.', ','),
      ].filter(Boolean).join(' '));
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => (b.date.localeCompare(a.date)) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}
