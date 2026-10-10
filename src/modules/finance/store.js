// ============================================================
// TRÉSORERIE — store du module (voir src/modules/contracts.js)
// ============================================================
// transactions / categories / budgets (maps) + settings (singleton).
// Montants toujours positifs, sens porté par `type`.
// Champs ajoutés au contrat (facultatifs, ignorables par les autres
// modules) : reconciled / reconciledAt (rapprochement bancaire),
// rejectionReason (motif de rejet), importKey (empreinte d'import bancaire).
// ============================================================

import { createModuleStore } from '../../core/createModuleStore.js';
import { roundMoney } from '../contracts.js';
import { isoDate } from '../../documents/context.js';

/** Catégories par défaut (ids stables : la catégorie « cotisations » est utilisée par les adhésions). */
export const DEFAULT_CATEGORIES = [
  { id: 'cotisations', label: 'Cotisations', type: 'both', color: '#2563eb' },
  { id: 'billetterie', label: 'Billetterie', type: 'income', color: '#7c3aed' },
  { id: 'subventions', label: 'Subventions', type: 'income', color: '#0891b2' },
  { id: 'partenariats', label: 'Partenariats', type: 'income', color: '#059669' },
  { id: 'dons', label: 'Dons', type: 'income', color: '#65a30d' },
  { id: 'alimentation', label: 'Alimentation', type: 'expense', color: '#ea580c' },
  { id: 'materiel', label: 'Matériel', type: 'expense', color: '#b45309' },
  { id: 'communication', label: 'Communication', type: 'expense', color: '#db2777' },
  { id: 'location', label: 'Location', type: 'expense', color: '#9333ea' },
  { id: 'transport', label: 'Transport', type: 'expense', color: '#0d9488' },
  { id: 'frais-bancaires', label: 'Frais bancaires', type: 'expense', color: '#64748b' },
  { id: 'autre', label: 'Autre', type: 'both', color: '#6b7280' },
];

export const COTISATION_CATEGORY_ID = 'cotisations';
export const OTHER_CATEGORY_ID = 'autre';

export const DEFAULT_FINANCE_SETTINGS = {
  openingBalance: 0,
  openingDate: '',
  fiscalYearStart: '09-01',
  bankLabel: 'Compte courant',
};

const now = () => new Date().toISOString();

function cleanTransaction(t) {
  return {
    ...t,
    amount: roundMoney(Math.abs(Number(t.amount) || 0)),
    type: t.type === 'income' ? 'income' : 'expense',
    label: String(t.label || '').trim() || 'Opération',
    date: t.date || isoDate(),
    attachments: Array.isArray(t.attachments) ? t.attachments : [],
  };
}

export const useFinanceStore = createModuleStore({
  name: 'finance',
  label: 'Trésorerie',
  version: 1,
  initialState: {
    transactions: {},
    categories: Object.fromEntries(DEFAULT_CATEGORIES.map(c => [c.id, c])),
    budgets: {},
    settings: { ...DEFAULT_FINANCE_SETTINGS },
  },
  slices: [
    { key: 'transactions', kind: 'map', capability: 'finance', sensitive: true },
    { key: 'categories', kind: 'map', capability: 'finance' },
    { key: 'budgets', kind: 'map', capability: 'finance' },
    { key: 'settings', kind: 'singleton', capability: 'finance' },
  ],
  actions: (set, get, h) => ({
    /** Crée une opération. Une dépense est « en attente » sauf statut explicite. */
    addTransaction: (input) => {
      const t = cleanTransaction({
        status: input.type === 'income' ? 'validated' : 'pending',
        categoryId: OTHER_CATEGORY_ID,
        method: 'autre',
        ...input,
        id: input.id || h.newId(),
      });
      return h.upsert('transactions', t);
    },
    /** Ajoute plusieurs opérations en une seule écriture (imports). */
    addTransactions: (list) => {
      const t0 = now();
      const records = list.map(input => cleanTransaction({
        status: 'pending', categoryId: OTHER_CATEGORY_ID, method: 'autre',
        ...input, id: input.id || h.newId(), createdAt: t0, updatedAt: t0,
      }));
      set(s => ({ transactions: { ...s.transactions, ...Object.fromEntries(records.map(r => [r.id, r])) } }));
      return records;
    },
    updateTransaction: (id, patch) => {
      const prev = get().transactions[id];
      if (!prev) return null;
      return h.upsert('transactions', cleanTransaction({ ...prev, ...patch, id }));
    },
    deleteTransaction: (id) => h.remove('transactions', id),
    validateTransaction: (id, by = '') => {
      const prev = get().transactions[id];
      if (!prev) return null;
      return h.upsert('transactions', { ...prev, status: 'validated', validatedBy: by, validatedAt: now(), rejectionReason: '' });
    },
    rejectTransaction: (id, reason, by = '') => {
      const prev = get().transactions[id];
      if (!prev) return null;
      return h.upsert('transactions', { ...prev, status: 'rejected', rejectionReason: String(reason || '').trim(), validatedBy: by, validatedAt: now() });
    },
    setReconciled: (id, reconciled) => {
      const prev = get().transactions[id];
      if (!prev) return null;
      return h.upsert('transactions', { ...prev, reconciled: !!reconciled, reconciledAt: reconciled ? now() : '' });
    },

    upsertCategory: (c) => h.upsert('categories', { color: '#6b7280', type: 'both', ...c, id: c.id || h.newId(), label: String(c.label || '').trim() || 'Catégorie' }),
    /** Supprime une catégorie ; ses opérations / lignes de budget passent dans « Autre ». */
    deleteCategory: (id) => {
      if (id === OTHER_CATEGORY_ID || id === COTISATION_CATEGORY_ID) return false;
      set(s => {
        const { [id]: _gone, ...categories } = s.categories;
        const t = now();
        const transactions = Object.fromEntries(Object.entries(s.transactions).map(([k, v]) => [k, v.categoryId === id ? { ...v, categoryId: OTHER_CATEGORY_ID, updatedAt: t } : v]));
        const budgets = Object.fromEntries(Object.entries(s.budgets).map(([k, b]) => [k, (b.lines || []).some(l => l.categoryId === id)
          ? { ...b, lines: b.lines.map(l => (l.categoryId === id ? { ...l, categoryId: OTHER_CATEGORY_ID } : l)), updatedAt: t } : b]));
        return { categories, transactions, budgets };
      });
      return true;
    },
    restoreDefaultCategories: () => set(s => ({
      categories: { ...Object.fromEntries(DEFAULT_CATEGORIES.map(c => [c.id, { ...c, createdAt: now(), updatedAt: now() }])), ...s.categories },
    })),

    upsertBudget: (b) => h.upsert('budgets', {
      ...b,
      id: b.id || h.newId(),
      label: String(b.label || '').trim() || 'Budget',
      lines: (b.lines || []).map(l => ({ categoryId: l.categoryId || OTHER_CATEGORY_ID, label: String(l.label || '').trim(), planned: roundMoney(Math.abs(Number(l.planned) || 0)), type: l.type === 'income' ? 'income' : 'expense' })),
    }),
    deleteBudget: (id) => h.remove('budgets', id),

    updateSettings: (patch) => set(s => ({ settings: { ...s.settings, ...patch, updatedAt: now() } })),
  }),
  migrate: (persisted) => persisted,
});

/** Libellé d'une catégorie (repli : id). */
export const categoryLabel = (categories, id) => categories?.[id]?.label || (id ? 'Catégorie supprimée' : '—');
