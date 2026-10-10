// ============================================================
// PONT VERS LA TRÉSORERIE (module facultatif)
// ============================================================
// Le module finance peut être absent (développement en parallèle) : on le
// charge via import.meta.glob et on dégrade proprement. On n'écrit JAMAIS
// directement dans son état : uniquement via ses actions.

import { useMemo, useSyncExternalStore } from 'react';

const mods = import.meta.glob('../finance/store.js', { eager: true });
const financeModule = Object.values(mods)[0] || null;

/** Store Zustand de la trésorerie, ou null si le module n'existe pas. */
export const financeStore = financeModule?.useFinanceStore || null;

const noopSubscribe = () => () => {};
const EMPTY = Object.freeze({});

/** Action de création d'opération exposée par la trésorerie (nom toléré). */
export function financeCreateAction() {
  if (!financeStore) return null;
  const s = financeStore.getState();
  return ['addTransaction', 'createTransaction', 'upsertTransaction'].map(k => s[k]).find(fn => typeof fn === 'function') || null;
}

/** Données de trésorerie réactives (maps brutes). */
export function useFinanceData() {
  const sub = financeStore ? financeStore.subscribe : noopSubscribe;
  const transactions = useSyncExternalStore(sub, () => financeStore?.getState().transactions || EMPTY, () => EMPTY);
  const budgets = useSyncExternalStore(sub, () => financeStore?.getState().budgets || EMPTY, () => EMPTY);
  const categories = useSyncExternalStore(sub, () => financeStore?.getState().categories || EMPTY, () => EMPTY);
  return useMemo(() => ({ available: !!financeStore, transactions, budgets, categories }), [transactions, budgets, categories]);
}

/**
 * Crée une opération liée à l'événement via l'action de la trésorerie.
 * @returns {string|null} id de l'opération créée.
 */
export function createLinkedTransaction(data) {
  const fn = financeCreateAction();
  if (!fn) throw new Error('La trésorerie n\'est pas disponible dans cette version.');
  const now = new Date().toISOString();
  const res = fn({
    date: data.date || now.slice(0, 10),
    type: data.type === 'income' ? 'income' : 'expense',
    amount: Math.round(Math.abs(Number(data.amount) || 0) * 100) / 100,
    label: data.label,
    // Statut laissé à la trésorerie (circuit de validation du trésorier).
    ...(data.categoryId ? { categoryId: data.categoryId } : {}),
    method: data.method || 'autre',
    eventId: data.eventId,
    ...(data.memberId ? { memberId: data.memberId } : {}),
    ...(data.counterparty ? { counterparty: data.counterparty } : {}),
    attachments: [],
    notes: data.notes || '',
  });
  if (typeof res === 'string') return res;
  if (res && typeof res === 'object') return res.id || res.transaction?.id || null;
  return null;
}
