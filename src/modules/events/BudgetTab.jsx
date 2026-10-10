import { useId, useMemo, useState } from 'react';
import { ExternalLink, Plus, Receipt, Wallet } from 'lucide-react';
import { useEventsStore } from './store.js';
import { navigate } from '../../core/router.js';
import { useCan } from '../../core/permissions.js';
import { toast } from '../../components/ui/toastStore.js';
import Modal from '../../components/Modal.jsx';
import { formatMoney, formatDateShort, isoDate } from '../../documents/context.js';
import { PAYMENT_METHODS, roundMoney } from '../contracts.js';
import { createLinkedTransaction, financeCreateAction, useFinanceData } from './financeBridge.js';

const TX_STATUS = { draft: 'Brouillon', pending: 'À valider', validated: 'Validée', rejected: 'Rejetée' };

export default function BudgetTab({ ev, canWrite }) {
  const finance = useFinanceData();
  const canFinance = useCan('finance', 'write');
  const updateEvent = useEventsStore(s => s.updateEvent);
  const updateParticipant = useEventsStore(s => s.updateParticipant);
  const [adding, setAdding] = useState(null); // 'expense' | 'income' | null
  const uid = useId();
  const price = Number(ev.price) || 0;
  const paidParticipants = (ev.participants || []).filter(p => p.paid && p.status !== 'cancelled');
  const unlinkedPaid = paidParticipants.filter(p => !p.transactionId);
  const canCreate = finance.available && !!financeCreateAction();

  const txs = useMemo(() => Object.values(finance.transactions || {})
    .filter(t => t.eventId === ev.id)
    .sort((a, b) => String(b.date).localeCompare(String(a.date))), [finance.transactions, ev.id]);

  const totals = useMemo(() => {
    const live = txs.filter(t => t.status !== 'rejected');
    const sum = (type, onlyValidated = false) => roundMoney(live.filter(t => t.type === type && (!onlyValidated || t.status === 'validated')).reduce((a, t) => a + (Number(t.amount) || 0), 0));
    const income = sum('income'); const expense = sum('expense');
    return { income, expense, balance: roundMoney(income - expense), incomeValidated: sum('income', true), expenseValidated: sum('expense', true) };
  }, [txs]);

  const budget = ev.budgetId ? finance.budgets?.[ev.budgetId] : null;
  const budgetLines = useMemo(() => {
    if (!budget) return [];
    return (budget.lines || []).map((l, i) => {
      const actual = roundMoney(txs.filter(t => t.status !== 'rejected' && t.type === l.type && l.categoryId && t.categoryId === l.categoryId).reduce((a, t) => a + Number(t.amount || 0), 0));
      return { key: `${l.categoryId}-${i}`, ...l, actual, label: l.label || finance.categories?.[l.categoryId]?.label || 'Poste' };
    });
  }, [budget, txs, finance.categories]);
  const planned = (type) => roundMoney(budgetLines.filter(l => l.type === type).reduce((a, l) => a + Number(l.planned || 0), 0));
  const candidateBudgets = useMemo(() => Object.values(finance.budgets || {}).filter(b => !b.eventId || b.eventId === ev.id), [finance.budgets, ev.id]);

  const recordPayments = () => {
    if (!canCreate) return;
    let ok = 0;
    try {
      unlinkedPaid.forEach(p => {
        const txId = createLinkedTransaction({
          type: 'income', amount: price, label: `${ev.title} — ${p.name}`, eventId: ev.id,
          categoryId: finance.categories?.billetterie ? 'billetterie' : '',
          memberId: p.memberId, counterparty: p.name, notes: 'Paiement participant (module Événements)',
        });
        if (txId) updateParticipant(ev.id, p.id, { transactionId: txId });
        ok++;
      });
      toast.success('Paiements enregistrés en trésorerie', `${ok} recette(s) de ${formatMoney(price)} liée(s) à l'événement.`);
    } catch (e) {
      toast.error('Enregistrement interrompu', `${ok} enregistrée(s). ${e.message}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Recettes" value={formatMoney(totals.income)} sub={finance.available ? `${formatMoney(totals.incomeValidated)} validées` : 'Trésorerie indisponible'} tone="text-emerald-600" />
        <Stat label="Dépenses" value={formatMoney(totals.expense)} sub={finance.available ? `${formatMoney(totals.expenseValidated)} validées` : '—'} tone="text-rose-600" />
        <Stat label="Solde" value={formatMoney(totals.balance)} sub={price ? `Billetterie attendue : ${formatMoney(roundMoney(price * paidParticipants.length))} (${paidParticipants.length} payé(s))` : 'Événement gratuit'} tone={totals.balance >= 0 ? 'text-ink' : 'text-rose-600'} />
      </div>

      {!finance.available ? (
        <div className="bg-surface border border-dashed border-line rounded-2xl p-4 text-sm text-dim flex gap-3">
          <Wallet size={20} className="shrink-0 text-muted" aria-hidden="true" />
          <p>Le module <strong className="text-ink">Trésorerie</strong> n'est pas disponible dans cette version : les opérations liées à l'événement (dépenses, recettes, budget prévisionnel) s'afficheront ici dès qu'il sera installé. Les paiements des participants restent suivis dans l'onglet Participants.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 justify-between items-center">
            <div className="flex flex-wrap gap-2">
              {canWrite && canFinance && (
                <>
                  <button type="button" className="btn-primary" disabled={!canCreate} onClick={() => setAdding('expense')}><Plus size={14} aria-hidden="true" /> Ajouter une dépense</button>
                  <button type="button" className="btn-secondary" disabled={!canCreate} onClick={() => setAdding('income')}><Plus size={14} aria-hidden="true" /> Ajouter une recette</button>
                </>
              )}
              {canWrite && canFinance && price > 0 && unlinkedPaid.length > 0 && (
                <button type="button" className="btn-secondary" disabled={!canCreate} onClick={recordPayments}>
                  <Receipt size={14} aria-hidden="true" /> Enregistrer {unlinkedPaid.length} paiement(s) participant(s)
                </button>
              )}
            </div>
            <button type="button" className="btn-ghost" onClick={() => navigate('finance')}><ExternalLink size={14} aria-hidden="true" /> Trésorerie</button>
          </div>
          {!canCreate && <p className="text-xs text-amber-600">La trésorerie n'expose pas d'action de création d'opération : ajoute-la depuis l'écran Trésorerie.</p>}

          <section className="bg-surface border border-line rounded-2xl p-4 space-y-2" aria-labelledby={`${uid}-b`}>
            <div className="flex flex-wrap justify-between items-center gap-2">
              <h3 id={`${uid}-b`} className="font-semibold text-ink">Budget prévisionnel</h3>
              {canWrite && (
                <select aria-label="Budget lié" className="input w-auto py-1 text-sm" value={ev.budgetId || ''}
                  onChange={(e) => { updateEvent(ev.id, { budgetId: e.target.value }); toast.success(e.target.value ? 'Budget lié' : 'Budget délié'); }}>
                  <option value="">— Aucun budget lié —</option>
                  {candidateBudgets.map(b => <option key={b.id} value={b.id}>{b.label}{b.year ? ` (${b.year})` : ''}</option>)}
                </select>
              )}
            </div>
            {!budget ? <p className="text-sm text-dim">{ev.budgetId ? 'Budget introuvable (supprimé ?).' : 'Aucun budget prévisionnel lié.'}</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-dim text-left"><th className="py-1 font-medium">Poste</th><th className="font-medium">Type</th><th className="text-right font-medium">Prévu</th><th className="text-right font-medium">Réalisé</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {budgetLines.map(l => (
                      <tr key={l.key}>
                        <td className="py-1.5 text-ink">{l.label}</td>
                        <td className="text-dim">{l.type === 'income' ? 'Recette' : 'Dépense'}</td>
                        <td className="text-right">{formatMoney(l.planned)}</td>
                        <td className={`text-right ${l.type === 'expense' && l.actual > l.planned ? 'text-rose-600 font-medium' : ''}`}>{formatMoney(l.actual)}</td>
                      </tr>
                    ))}
                    <tr className="font-medium"><td className="py-1.5">Total dépenses</td><td /><td className="text-right">{formatMoney(planned('expense'))}</td><td className="text-right">{formatMoney(totals.expense)}</td></tr>
                    <tr className="font-medium"><td className="py-1.5">Total recettes</td><td /><td className="text-right">{formatMoney(planned('income'))}</td><td className="text-right">{formatMoney(totals.income)}</td></tr>
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="bg-surface border border-line rounded-2xl" aria-labelledby={`${uid}-t`}>
            <h3 id={`${uid}-t`} className="font-semibold text-ink px-4 pt-3 pb-2">Opérations liées ({txs.length})</h3>
            {txs.length === 0 ? <p className="text-sm text-dim px-4 pb-4">Aucune opération liée à cet événement.</p> : (
              <ul className="divide-y divide-line border-t border-line">
                {txs.map(t => (
                  <li key={t.id} className="px-4 py-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-xs text-dim w-20">{formatDateShort(t.date)}</span>
                    <span className="flex-1 min-w-[140px] text-ink">{t.label}</span>
                    <span className={`badge ${t.status === 'validated' ? 'badge-emerald' : t.status === 'rejected' ? 'badge-rose' : 'badge-amber'}`}>{TX_STATUS[t.status] || t.status}</span>
                    <span className={`font-medium ${t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>{t.type === 'income' ? '+' : '−'}{formatMoney(t.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {adding && <TransactionModal ev={ev} type={adding} categories={finance.categories} onClose={() => setAdding(null)} />}
    </div>
  );
}

function Stat({ label, value, sub, tone }) {
  return (
    <div className="bg-surface border border-line rounded-2xl p-3">
      <p className="text-xs text-dim">{label}</p>
      <p className={`text-lg font-bold ${tone}`}>{value}</p>
      <p className="text-[11px] text-muted">{sub}</p>
    </div>
  );
}

function TransactionModal({ ev, type: initialType, categories, onClose }) {
  const uid = useId();
  const [type, setType] = useState(initialType);
  const [amount, setAmount] = useState('');
  const [label, setLabel] = useState('');
  const [date, setDate] = useState(isoDate());
  const [method, setMethod] = useState('virement');
  const [categoryId, setCategoryId] = useState('');
  const cats = Object.values(categories || {}).filter(c => c.type === type || c.type === 'both');

  const submit = (e) => {
    e.preventDefault();
    const n = Number(String(amount).replace(',', '.'));
    if (!(n > 0)) { document.getElementById(`${uid}-a`)?.focus(); toast.warn('Montant invalide', 'Saisis un montant positif.'); return; }
    if (!label.trim()) { document.getElementById(`${uid}-l`)?.focus(); toast.warn('Libellé requis'); return; }
    try {
      createLinkedTransaction({ type, amount: n, label: label.trim(), date, method, categoryId, eventId: ev.id, notes: `Événement : ${ev.title}` });
      toast.success(type === 'income' ? 'Recette ajoutée' : 'Dépense ajoutée', `${formatMoney(n)} — visible dans la trésorerie.`);
      onClose();
    } catch (err) {
      toast.error('Ajout impossible', err.message);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={type === 'income' ? 'Nouvelle recette' : 'Nouvelle dépense'} description={`Liée à « ${ev.title} » dans la trésorerie.`}
      footer={<div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={onClose}>Annuler</button><button type="submit" form={`${uid}-f`} className="btn-primary">Ajouter</button></div>}>
      <form id={`${uid}-f`} onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${uid}-ty`} className="block text-xs text-dim mb-1">Sens</label>
          <select id={`${uid}-ty`} className="input" value={type} onChange={(e) => { setType(e.target.value); setCategoryId(''); }}>
            <option value="expense">Dépense</option><option value="income">Recette</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${uid}-a`} className="block text-xs text-dim mb-1">Montant (€)</label>
          <input id={`${uid}-a`} inputMode="decimal" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} data-autofocus />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${uid}-l`} className="block text-xs text-dim mb-1">Libellé</label>
          <input id={`${uid}-l`} className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. Location sono" />
        </div>
        <div>
          <label htmlFor={`${uid}-d`} className="block text-xs text-dim mb-1">Date</label>
          <input id={`${uid}-d`} type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${uid}-m`} className="block text-xs text-dim mb-1">Moyen de paiement</label>
          <select id={`${uid}-m`} className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAYMENT_METHODS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${uid}-c`} className="block text-xs text-dim mb-1">Catégorie</label>
          <select id={`${uid}-c`} className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">— Sans catégorie —</option>
            {cats.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
      </form>
    </Modal>
  );
}
