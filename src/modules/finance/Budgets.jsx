// Budgets prévisionnels (par événement ou par exercice) : prévu vs réalisé.
import { useId, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Calculator, FileDown, Loader2, Target } from 'lucide-react';
import Modal from '../../components/Modal.jsx';
import { confirmDialog } from '../../components/ui/confirmStore.js';
import { toast } from '../../components/ui/toastStore.js';
import { formatMoney, isoDate } from '../../documents/context.js';
import { issueDocuments } from '../../documents/issue.js';
import { useFinanceStore, categoryLabel } from './store.js';
import { budgetReport, gapTone, fiscalRange } from './logic.js';
import { parseMoney } from './csv.js';
import { useEventsMap, useEventOptions, labelCls } from './hooks.js';
import { Empty } from './shared.jsx';

const TONES = {
  good: 'text-emerald-600 dark:text-emerald-400', warn: 'text-amber-600 dark:text-amber-400',
  bad: 'text-rose-600 dark:text-rose-400', neutral: 'text-dim',
};
const TONE_TEXT = { good: 'conforme', warn: 'à surveiller', bad: 'dépassement', neutral: '' };

export default function Budgets({ range, years, canWrite }) {
  const budgets = useFinanceStore(s => s.budgets);
  const transactions = useFinanceStore(s => s.transactions);
  const categories = useFinanceStore(s => s.categories);
  const settings = useFinanceStore(s => s.settings);
  const deleteBudget = useFinanceStore(s => s.deleteBudget);
  const events = useEventsMap();
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState('');

  const list = useMemo(() => Object.values(budgets).sort((a, b) => String(b.year).localeCompare(String(a.year)) || a.label.localeCompare(b.label, 'fr')), [budgets]);

  const remove = async (b) => {
    if (!(await confirmDialog({ title: 'Supprimer le budget ?', message: `« ${b.label} » sera supprimé (les opérations ne sont pas touchées).`, confirmLabel: 'Supprimer', tone: 'danger' }))) return;
    deleteBudget(b.id);
    toast.success('Budget supprimé', b.label);
  };

  const exportDoc = async (b) => {
    setBusy(b.id);
    try {
      const ev = b.eventId ? events[b.eventId] : null;
      const toLines = (type) => (b.lines || []).filter(l => l.type === type).map(l => ({ label: l.label || categoryLabel(categories, l.categoryId), amount: l.planned }));
      const res = await issueDocuments({
        templateId: 'budget-previsionnel',
        values: {
          projectName: ev?.title || b.label,
          startDate: ev?.start ? String(ev.start).slice(0, 10) : fiscalRange(Number(String(b.year).slice(0, 4)) || range.startYear, settings.fiscalYearStart).start,
          endDate: ev?.end ? String(ev.end).slice(0, 10) : (ev ? '' : fiscalRange(Number(String(b.year).slice(0, 4)) || range.startYear, settings.fiscalYearStart).last),
          charges: toLines('expense'), produits: toLines('income'), date: isoDate(),
        },
        format: 'pdf',
        origin: 'finance',
      });
      toast.success('Budget prévisionnel émis', `${res.refs[0]} — inscrit au registre des documents.`);
    } catch (e) {
      toast.error('Émission impossible', e.message);
    } finally { setBusy(''); }
  };

  return (
    <div className="space-y-3">
      {canWrite && (
        <div className="flex justify-end">
          <button type="button" className="btn-primary" onClick={() => setEditing({ label: '', year: range.label, eventId: '', lines: [] })}>
            <Plus size={14} aria-hidden="true" /> Nouveau budget
          </button>
        </div>
      )}
      {list.length === 0 ? (
        <div className="bg-surface border border-line rounded-2xl">
          <Empty icon={Calculator} title="Aucun budget prévisionnel">Crée un budget pour un événement (réalisé = opérations liées à l'événement) ou pour l'exercice entier.</Empty>
        </div>
      ) : list.map(b => {
        const r = budgetReport(b, transactions, settings);
        const ev = b.eventId ? events[b.eventId] : null;
        return (
          <section key={b.id} className="bg-surface border border-line rounded-2xl p-4" aria-label={`Budget ${b.label}`}>
            <div className="flex flex-wrap items-start gap-2 justify-between">
              <div>
                <h3 className="font-semibold text-ink">{b.label}</h3>
                <p className="text-xs text-dim">{b.eventId ? `Événement : ${ev?.title || 'événement introuvable'}` : `Budget annuel · exercice ${b.year}`}</p>
              </div>
              <div className="flex gap-1">
                <button type="button" className="btn-ghost py-1" onClick={() => exportDoc(b)} disabled={busy === b.id}>
                  {busy === b.id ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <FileDown size={14} aria-hidden="true" />} Document
                </button>
                {canWrite && <button type="button" className="btn-ghost p-1.5" aria-label={`Modifier le budget ${b.label}`} onClick={() => setEditing(b)}><Pencil size={14} aria-hidden="true" /></button>}
                {canWrite && <button type="button" className="btn-ghost p-1.5" aria-label={`Supprimer le budget ${b.label}`} onClick={() => remove(b)}><Trash2 size={14} aria-hidden="true" /></button>}
              </div>
            </div>
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-dim border-b border-line">
                    <th scope="col" className="py-1.5 pr-2 font-medium">Poste</th>
                    <th scope="col" className="py-1.5 px-2 font-medium text-right">Prévu</th>
                    <th scope="col" className="py-1.5 px-2 font-medium text-right">Réalisé</th>
                    <th scope="col" className="py-1.5 pl-2 font-medium text-right">Écart</th>
                  </tr>
                </thead>
                <tbody>
                  {['income', 'expense'].map(type => {
                    const lines = r.lines.filter(l => l.type === type);
                    if (!lines.length) return null;
                    return [
                      <tr key={`h-${type}`}><th colSpan={4} scope="colgroup" className="text-left text-xs uppercase tracking-wide text-muted pt-3 pb-1">{type === 'income' ? 'Recettes' : 'Dépenses'}</th></tr>,
                      ...lines.map((l, i) => {
                        const tone = l.shared ? 'neutral' : gapTone(type, l.plannedGroup, l.actual);
                        return (
                          <tr key={`${type}-${i}`} className="border-b border-line/60">
                            <td className="py-1.5 pr-2 text-ink">{l.label || categoryLabel(categories, l.categoryId)}{l.label && <span className="text-xs text-muted"> · {categoryLabel(categories, l.categoryId)}</span>}</td>
                            <td className="py-1.5 px-2 text-right tabular-nums">{formatMoney(l.planned)}</td>
                            <td className="py-1.5 px-2 text-right tabular-nums">
                              {l.shared ? <span className="text-xs text-muted">inclus ci-dessus</span> : formatMoney(l.actual)}
                              {!l.shared && l.pending > 0 && <div className="text-[11px] text-amber-600 dark:text-amber-400">+{formatMoney(l.pending)} en attente</div>}
                            </td>
                            <td className={`py-1.5 pl-2 text-right tabular-nums font-medium ${TONES[tone]}`}>
                              {l.shared ? '' : <>{l.gap > 0 ? '+' : ''}{formatMoney(l.gap)}<span className="sr-only"> ({TONE_TEXT[tone]})</span></>}
                            </td>
                          </tr>
                        );
                      }),
                    ];
                  })}
                  {r.unplanned.map(u => (
                    <tr key={`u-${u.type}-${u.categoryId}`} className="border-b border-line/60">
                      <td className="py-1.5 pr-2 text-dim italic">Non budgété : {categoryLabel(categories, u.categoryId)} ({u.type === 'income' ? 'recette' : 'dépense'})</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">—</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{formatMoney(u.actual)}</td>
                      <td className={`py-1.5 pl-2 text-right ${u.type === 'expense' ? TONES.bad : TONES.good}`}>{u.type === 'expense' ? 'imprévu' : 'bonus'}</td>
                    </tr>
                  ))}
                  {!r.lines.length && !r.unplanned.length && <tr><td colSpan={4} className="py-3 text-dim">Aucune ligne prévue.</td></tr>}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <th scope="row" className="pt-2 pr-2 text-left">Résultat</th>
                    <td className="pt-2 px-2 text-right tabular-nums">{formatMoney(r.plannedNet)}</td>
                    <td className="pt-2 px-2 text-right tabular-nums">{formatMoney(r.actualNet)}</td>
                    <td className={`pt-2 pl-2 text-right tabular-nums ${r.actualNet - r.plannedNet < 0 ? TONES.bad : TONES.good}`}>{formatMoney(r.actualNet - r.plannedNet)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        );
      })}
      {editing && <BudgetEditor budget={editing} years={years} onClose={() => setEditing(null)} />}
    </div>
  );
}

function BudgetEditor({ budget, years, onClose }) {
  const categories = useFinanceStore(s => s.categories);
  const settings = useFinanceStore(s => s.settings);
  const upsertBudget = useFinanceStore(s => s.upsertBudget);
  const events = useEventOptions();
  const uid = useId();
  const [form, setForm] = useState(() => ({
    ...budget,
    lines: (budget.lines || []).map(l => ({ ...l, planned: String(l.planned ?? '').replace('.', ',') })),
  }));
  const [error, setError] = useState('');
  const yearLabels = useMemo(() => years.map(y => fiscalRange(y, settings.fiscalYearStart).label), [years, settings.fiscalYearStart]);
  const cats = useMemo(() => Object.values(categories).sort((a, b) => a.label.localeCompare(b.label, 'fr')), [categories]);

  const setLine = (i, patch) => setForm(f => ({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const addLine = (type) => setForm(f => ({ ...f, lines: [...f.lines, { type, categoryId: cats.find(c => c.type === type)?.id || 'autre', label: '', planned: '' }] }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.label.trim()) { setError('Donne un nom au budget.'); return; }
    const bad = form.lines.findIndex(l => !Number.isFinite(parseMoney(l.planned || '0')) || parseMoney(l.planned || '0') < 0);
    if (bad >= 0) { setError(`Ligne ${bad + 1} : montant invalide.`); return; }
    upsertBudget({ ...form, eventId: form.eventId || undefined, lines: form.lines.map(l => ({ ...l, planned: parseMoney(l.planned || '0') })) });
    toast.success('Budget enregistré', form.label);
    onClose();
  };

  return (
    <Modal isOpen onClose={onClose} title={budget.id ? 'Modifier le budget' : 'Nouveau budget prévisionnel'} maxWidth="max-w-3xl"
      footer={(
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Annuler</button>
          <button type="submit" form={`${uid}-f`} className="btn-primary">Enregistrer</button>
        </div>
      )}>
      <form id={`${uid}-f`} onSubmit={submit} className="space-y-3" noValidate>
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="sm:col-span-1">
            <label htmlFor={`${uid}-l`} className={labelCls}>Nom *</label>
            <input id={`${uid}-l`} className="input" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Gala 2027" />
          </div>
          <div>
            <label htmlFor={`${uid}-ev`} className={labelCls}>Événement (facultatif)</label>
            <select id={`${uid}-ev`} className="input" value={form.eventId || ''} onChange={e => {
              const ev = events.find(x => x.id === e.target.value);
              setForm(f => ({ ...f, eventId: e.target.value, label: f.label || ev?.title || '' }));
            }}>
              <option value="">Aucun (budget annuel)</option>
              {events.map(ev => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${uid}-y`} className={labelCls}>Exercice</label>
            <select id={`${uid}-y`} className="input" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))}>
              {[...new Set([form.year, ...yearLabels].filter(Boolean))].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {['income', 'expense'].map(type => (
          <fieldset key={type} className="border border-line rounded-xl p-3">
            <legend className="text-sm font-semibold text-ink px-1">{type === 'income' ? 'Recettes prévues' : 'Dépenses prévues'}</legend>
            <div className="space-y-2">
              {form.lines.map((l, i) => l.type !== type ? null : (
                <div key={i} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_1fr_8rem_auto] gap-2 items-end">
                  <div>
                    <label htmlFor={`${uid}-c${i}`} className={labelCls}>Catégorie</label>
                    <select id={`${uid}-c${i}`} className="input" value={l.categoryId} onChange={e => setLine(i, { categoryId: e.target.value })}>
                      {cats.filter(c => c.type === 'both' || c.type === type).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </div>
                  <div className="hidden sm:block">
                    <label htmlFor={`${uid}-n${i}`} className={labelCls}>Libellé</label>
                    <input id={`${uid}-n${i}`} className="input" value={l.label} onChange={e => setLine(i, { label: e.target.value })} />
                  </div>
                  <div className="col-start-1 sm:col-start-auto">
                    <label htmlFor={`${uid}-p${i}`} className={labelCls}>Prévu (€)</label>
                    <input id={`${uid}-p${i}`} className="input tabular-nums" inputMode="decimal" value={l.planned} onChange={e => setLine(i, { planned: e.target.value })} />
                  </div>
                  <button type="button" className="btn-ghost p-2 row-start-1 col-start-2 sm:row-start-auto sm:col-start-auto" aria-label={`Supprimer la ligne ${i + 1}`}
                    onClick={() => setForm(f => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }))}><Trash2 size={14} aria-hidden="true" /></button>
                </div>
              ))}
              <button type="button" className="btn-ghost" onClick={() => addLine(type)}><Plus size={14} aria-hidden="true" /> Ajouter une ligne</button>
            </div>
          </fieldset>
        ))}
        <p className="text-xs text-dim flex items-start gap-1"><Target size={12} className="mt-0.5 shrink-0" aria-hidden="true" />Le réalisé est calculé automatiquement à partir des opérations validées {form.eventId ? 'liées à l\'événement' : 'de l\'exercice'} dans chaque catégorie.</p>
        {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      </form>
    </Modal>
  );
}
