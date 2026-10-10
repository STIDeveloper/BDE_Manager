// Liste filtrable des opérations : validation / rejet, rapprochement,
// justificatifs, export CSV, suppression.
import { useId, useMemo, useState } from 'react';
import {
  Plus, Download, Upload, Check, X, Pencil, Trash2, Paperclip, Link2, Link2Off, Search, Receipt, RotateCcw,
} from 'lucide-react';
import Modal from '../../components/Modal.jsx';
import { confirmDialog } from '../../components/ui/confirmStore.js';
import { toast } from '../../components/ui/toastStore.js';
import { formatDateShort, formatMoney, isoDate } from '../../documents/context.js';
import { deleteAttachment, openAttachment } from '../../core/attachments.js';
import { PAYMENT_METHODS } from '../contracts.js';
import { useFinanceStore, categoryLabel } from './store.js';
import { filterTransactions, EMPTY_FILTERS, STATUS_LABELS, STATUS_BADGES, TYPE_LABELS } from './logic.js';
import { downloadCsv } from './csv.js';
import { useEventsMap, useEventOptions, useRealMembers, memberName, currentUserName, labelCls } from './hooks.js';
import { Amount, Empty } from './shared.jsx';

const PAGE = 100;

export default function Transactions({ filters, setFilters, range, onNew, onEdit, onImport, canWrite, canValidate }) {
  const transactions = useFinanceStore(s => s.transactions);
  const categories = useFinanceStore(s => s.categories);
  const validateTransaction = useFinanceStore(s => s.validateTransaction);
  const setReconciled = useFinanceStore(s => s.setReconciled);
  const deleteTransaction = useFinanceStore(s => s.deleteTransaction);
  const events = useEventsMap();
  const eventOptions = useEventOptions();
  const members = useRealMembers();
  const [limit, setLimit] = useState(PAGE);
  const [rejecting, setRejecting] = useState(null);
  const uid = useId();

  const list = useMemo(() => filterTransactions(Object.values(transactions), filters, { categories, members, events }),
    [transactions, filters, categories, members, events]);
  const sums = useMemo(() => list.reduce((a, t) => {
    if (t.status === 'rejected') return a;
    a[t.type] += t.amount; return a;
  }, { income: 0, expense: 0 }), [list]);

  const set = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setLimit(PAGE); };
  const period = (kind) => {
    const today = isoDate();
    if (kind === 'month') setFilters(f => ({ ...f, from: `${today.slice(0, 7)}-01`, to: '' }));
    else if (kind === 'year') setFilters(f => ({ ...f, from: range.start, to: range.last }));
    else setFilters(f => ({ ...f, from: '', to: '' }));
  };
  const active = Object.values(filters).some(Boolean);

  const exportCsv = () => {
    const methodLabel = (id) => PAYMENT_METHODS.find(m => m.id === id)?.label || id || '';
    const rows = [['Date', 'Type', 'Libellé', 'Catégorie', 'Montant', 'Montant signé', 'Moyen', 'Statut', 'Rapprochée', 'Événement', 'Membre', 'Tiers', 'Référence', 'Justificatifs', 'Notes']];
    list.forEach(t => rows.push([
      formatDateShort(t.date), TYPE_LABELS[t.type], t.label, categoryLabel(categories, t.categoryId),
      t.amount.toFixed(2).replace('.', ','), (t.type === 'income' ? t.amount : -t.amount).toFixed(2).replace('.', ','),
      methodLabel(t.method), STATUS_LABELS[t.status] || t.status, t.reconciled ? 'oui' : 'non',
      events[t.eventId]?.title || '', memberName(members.find(m => m.id === t.memberId)), t.counterparty || '', t.reference || '',
      (t.attachments || []).length, t.notes || '',
    ]));
    downloadCsv(rows, `Tresorerie_operations_${isoDate()}_usage_interne.csv`);
    toast.success('Export CSV prêt', `${list.length} opération(s).`);
  };

  const remove = async (t) => {
    const ok = await confirmDialog({
      title: 'Supprimer l\'opération ?',
      message: `« ${t.label} » (${formatMoney(t.amount)}) sera supprimée définitivement${(t.attachments || []).length ? ', ainsi que ses justificatifs' : ''}.`,
      details: t.membershipId ? ['Cette recette est liée à une cotisation : la cotisation repassera « à payer ».'] : undefined,
      confirmLabel: 'Supprimer', tone: 'danger',
    });
    if (!ok) return;
    deleteTransaction(t.id);
    (t.attachments || []).forEach(a => deleteAttachment(a.id));
    if (t.membershipId) {
      // Import dynamique : évite un cycle (le module Adhésions importe la trésorerie).
      const mod = await import('../membership/store.js').catch(() => null);
      mod?.useMembershipStore?.getState().onTransactionDeleted?.(t.membershipId, t.id);
    }
    toast.success('Opération supprimée', t.label);
  };

  const ids = { search: `${uid}-q`, from: `${uid}-from`, to: `${uid}-to`, type: `${uid}-type`, cat: `${uid}-cat`, status: `${uid}-st`, ev: `${uid}-ev`, rec: `${uid}-rec` };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 justify-between">
        <div className="flex flex-wrap gap-2">
          {canWrite && <button type="button" className="btn-primary" onClick={onNew}><Plus size={14} aria-hidden="true" /> Nouvelle opération</button>}
          {canWrite && <button type="button" className="btn-secondary" onClick={onImport}><Upload size={14} aria-hidden="true" /> Importer un relevé</button>}
        </div>
        <button type="button" className="btn-secondary" onClick={exportCsv} disabled={!list.length}><Download size={14} aria-hidden="true" /> Exporter CSV</button>
      </div>

      <div className="bg-surface border border-line rounded-2xl p-3 space-y-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <label htmlFor={ids.search} className="sr-only">Rechercher une opération</label>
          <input id={ids.search} className="input pl-8" placeholder="Rechercher (libellé, tiers, membre, montant…)" value={filters.search} onChange={e => set('search', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          <div><label htmlFor={ids.from} className={labelCls}>Du</label><input id={ids.from} type="date" className="input" value={filters.from} onChange={e => set('from', e.target.value)} /></div>
          <div><label htmlFor={ids.to} className={labelCls}>Au</label><input id={ids.to} type="date" className="input" value={filters.to} onChange={e => set('to', e.target.value)} /></div>
          <div><label htmlFor={ids.type} className={labelCls}>Type</label>
            <select id={ids.type} className="input" value={filters.type} onChange={e => set('type', e.target.value)}>
              <option value="">Tous</option><option value="income">Recettes</option><option value="expense">Dépenses</option>
            </select></div>
          <div><label htmlFor={ids.cat} className={labelCls}>Catégorie</label>
            <select id={ids.cat} className="input" value={filters.categoryId} onChange={e => set('categoryId', e.target.value)}>
              <option value="">Toutes</option>
              {Object.values(categories).sort((a, b) => a.label.localeCompare(b.label, 'fr')).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select></div>
          <div><label htmlFor={ids.status} className={labelCls}>Statut</label>
            <select id={ids.status} className="input" value={filters.status} onChange={e => set('status', e.target.value)}>
              <option value="">Tous</option>
              {Object.entries(STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></div>
          <div><label htmlFor={ids.ev} className={labelCls}>Événement</label>
            <select id={ids.ev} className="input" value={filters.eventId} onChange={e => set('eventId', e.target.value)}>
              <option value="">Tous</option>
              {eventOptions.map(ev => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
            </select></div>
          <div><label htmlFor={ids.rec} className={labelCls}>Rapprochement</label>
            <select id={ids.rec} className="input" value={filters.reconciled} onChange={e => set('reconciled', e.target.value)}>
              <option value="">Tous</option><option value="yes">Rapprochées</option><option value="no">Non rapprochées</option>
            </select></div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button type="button" className="chip chip-idle" onClick={() => period('month')}>Ce mois</button>
          <button type="button" className="chip chip-idle" onClick={() => period('year')}>Exercice {range.label}</button>
          <button type="button" className="chip chip-idle" onClick={() => period('all')}>Toute période</button>
          {active && <button type="button" className="chip chip-idle" onClick={() => setFilters(EMPTY_FILTERS)}><RotateCcw size={12} aria-hidden="true" /> Réinitialiser</button>}
          <span className="text-xs text-dim ml-auto" role="status">{list.length} opération(s) · +{formatMoney(sums.income)} / −{formatMoney(sums.expense)} (hors rejetées)</span>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="bg-surface border border-line rounded-2xl">
          <Empty icon={Receipt} title={active ? 'Aucune opération ne correspond aux filtres' : 'Aucune opération'}>
            {active ? 'Modifie ou réinitialise les filtres.' : 'Saisis une opération ou importe un relevé bancaire.'}
          </Empty>
        </div>
      ) : (
        <ul className="space-y-2" aria-label="Opérations">
          {list.slice(0, limit).map(t => (
            <li key={t.id} className="bg-surface border border-line rounded-2xl p-3">
              <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                <div className="flex-1 min-w-[12rem]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-ink">{t.label}</span>
                    <span className={`badge ${STATUS_BADGES[t.status] || 'badge-neutral'}`}>{STATUS_LABELS[t.status] || t.status}</span>
                    {t.reconciled && <span className="badge badge-cyan" title="Rapprochée avec le relevé bancaire"><Link2 size={10} aria-hidden="true" />Rapprochée</span>}
                    {t.membershipId && <span className="badge badge-brand">Cotisation</span>}
                  </div>
                  <div className="text-xs text-dim mt-0.5 flex flex-wrap gap-x-2">
                    <span className="tabular-nums">{formatDateShort(t.date)}</span>
                    <span>{categoryLabel(categories, t.categoryId)}</span>
                    <span>{PAYMENT_METHODS.find(m => m.id === t.method)?.label || ''}</span>
                    {t.eventId && <span>· {events[t.eventId]?.title || 'Événement supprimé'}</span>}
                    {t.memberId && <span>· {memberName(members.find(m => m.id === t.memberId)) || 'Membre supprimé'}</span>}
                    {t.counterparty && <span>· {t.counterparty}</span>}
                  </div>
                  {t.status === 'rejected' && t.rejectionReason && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">Motif du rejet : {t.rejectionReason}</p>}
                  {t.status === 'validated' && t.validatedBy && <p className="text-xs text-muted mt-0.5">Validée par {t.validatedBy}{t.validatedAt ? ` le ${formatDateShort(t.validatedAt)}` : ''}</p>}
                </div>
                <Amount type={t.type} amount={t.amount} className="text-base" />
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {(t.attachments || []).map(a => (
                  <button key={a.id} type="button" className="chip chip-idle" onClick={() => openAttachment(a).catch(e => toast.error('Ouverture impossible', e.message))} aria-label={`Ouvrir le justificatif ${a.name}`}>
                    <Paperclip size={12} aria-hidden="true" /><span className="max-w-[10rem] truncate">{a.name}</span>
                  </button>
                ))}
                {t.type === 'expense' && !(t.attachments || []).length && <span className="badge badge-amber">Sans justificatif</span>}
                <span className="flex-1" />
                {canValidate && t.status === 'pending' && (
                  <>
                    <button type="button" className="btn-secondary py-1 text-emerald-700 dark:text-emerald-300" onClick={() => { validateTransaction(t.id, currentUserName()); toast.success('Opération validée', t.label); }}>
                      <Check size={14} aria-hidden="true" /> Valider
                    </button>
                    <button type="button" className="btn-secondary py-1 text-rose-700 dark:text-rose-300" onClick={() => setRejecting(t)}>
                      <X size={14} aria-hidden="true" /> Rejeter
                    </button>
                  </>
                )}
                {canValidate && t.status === 'rejected' && (
                  <button type="button" className="btn-ghost py-1" onClick={() => { validateTransaction(t.id, currentUserName()); toast.success('Opération validée', t.label); }}>
                    <Check size={14} aria-hidden="true" /> Valider finalement
                  </button>
                )}
                {canWrite && (
                  <button type="button" className="btn-ghost py-1" aria-pressed={!!t.reconciled}
                    onClick={() => { setReconciled(t.id, !t.reconciled); toast.info(t.reconciled ? 'Rapprochement annulé' : 'Opération rapprochée', t.label); }}>
                    {t.reconciled ? <Link2Off size={14} aria-hidden="true" /> : <Link2 size={14} aria-hidden="true" />}
                    {t.reconciled ? 'Dé-rapprocher' : 'Rapprocher'}
                  </button>
                )}
                {canWrite && (canValidate || t.status === 'pending' || t.status === 'draft') && (
                  <>
                    <button type="button" className="btn-ghost p-1.5" aria-label={`Modifier ${t.label}`} onClick={() => onEdit(t)}><Pencil size={14} aria-hidden="true" /></button>
                    <button type="button" className="btn-ghost p-1.5" aria-label={`Supprimer ${t.label}`} onClick={() => remove(t)}><Trash2 size={14} aria-hidden="true" /></button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {list.length > limit && (
        <button type="button" className="btn-secondary w-full" onClick={() => setLimit(l => l + PAGE)}>Afficher plus ({list.length - limit} restantes)</button>
      )}

      {rejecting && <RejectDialog tx={rejecting} onClose={() => setRejecting(null)} />}
    </div>
  );
}

function RejectDialog({ tx, onClose }) {
  const [reason, setReason] = useState('');
  const rejectTransaction = useFinanceStore(s => s.rejectTransaction);
  const id = useId();
  const submit = (e) => {
    e.preventDefault();
    if (!reason.trim()) return;
    rejectTransaction(tx.id, reason, currentUserName());
    toast.warn('Opération rejetée', tx.label);
    onClose();
  };
  return (
    <Modal isOpen onClose={onClose} title="Rejeter l'opération" description={`« ${tx.label} » — ${formatMoney(tx.amount)}`}
      footer={(
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Annuler</button>
          <button type="submit" form={`${id}-f`} className="btn-danger" disabled={!reason.trim()}>Rejeter</button>
        </div>
      )}>
      <form id={`${id}-f`} onSubmit={submit}>
        <label htmlFor={id} className={labelCls}>Motif du rejet (obligatoire)</label>
        <textarea id={id} className="input min-h-[90px]" value={reason} onChange={e => setReason(e.target.value)} placeholder="Justificatif illisible, dépense non autorisée…" required />
      </form>
    </Modal>
  );
}
