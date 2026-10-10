// Réglages de la trésorerie : compte, solde d'ouverture, exercice, catégories.
import { useId, useState } from 'react';
import { Plus, Trash2, Save, RotateCcw } from 'lucide-react';
import { confirmDialog } from '../../components/ui/confirmStore.js';
import { toast } from '../../components/ui/toastStore.js';
import { useFinanceStore, COTISATION_CATEGORY_ID, OTHER_CATEGORY_ID } from './store.js';
import { parseMoney } from './csv.js';
import { labelCls } from './hooks.js';

const TYPE_OPTIONS = [['income', 'Recettes'], ['expense', 'Dépenses'], ['both', 'Les deux']];

export default function Settings({ canWrite }) {
  const settings = useFinanceStore(s => s.settings);
  const updateSettings = useFinanceStore(s => s.updateSettings);
  const uid = useId();
  const [form, setForm] = useState(() => ({
    bankLabel: settings.bankLabel || '',
    openingBalance: String(settings.openingBalance ?? 0).replace('.', ','),
    openingDate: settings.openingDate || '',
    fiscalYearStart: settings.fiscalYearStart || '09-01',
  }));
  const [error, setError] = useState('');

  const save = (e) => {
    e.preventDefault();
    const opening = parseMoney(form.openingBalance || '0');
    if (!Number.isFinite(opening)) { setError('Solde d\'ouverture invalide.'); return; }
    if (!/^\d{2}-\d{2}$/.test(form.fiscalYearStart)) { setError('Début d\'exercice au format MM-JJ (ex. 09-01).'); return; }
    setError('');
    updateSettings({ bankLabel: form.bankLabel.trim(), openingBalance: opening, openingDate: form.openingDate, fiscalYearStart: form.fiscalYearStart });
    toast.success('Réglages enregistrés');
  };

  const [mm, dd] = form.fiscalYearStart.split('-');
  return (
    <div className="grid lg:grid-cols-2 gap-4 items-start">
      <form onSubmit={save} className="bg-surface border border-line rounded-2xl p-4 space-y-3" aria-labelledby={`${uid}-t`}>
        <h2 id={`${uid}-t`} className="font-semibold text-ink">Compte et exercice</h2>
        <div>
          <label htmlFor={`${uid}-bank`} className={labelCls}>Libellé du compte</label>
          <input id={`${uid}-bank`} className="input" value={form.bankLabel} disabled={!canWrite} onChange={e => setForm(f => ({ ...f, bankLabel: e.target.value }))} placeholder="Compte courant Crédit Mutuel" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${uid}-ob`} className={labelCls}>Solde d'ouverture (€)</label>
            <input id={`${uid}-ob`} className="input tabular-nums" inputMode="decimal" disabled={!canWrite} value={form.openingBalance} onChange={e => setForm(f => ({ ...f, openingBalance: e.target.value }))} />
          </div>
          <div>
            <label htmlFor={`${uid}-od`} className={labelCls}>Au (date)</label>
            <input id={`${uid}-od`} type="date" className="input" disabled={!canWrite} value={form.openingDate} onChange={e => setForm(f => ({ ...f, openingDate: e.target.value }))} />
          </div>
        </div>
        <p className="text-xs text-dim">Le solde affiché = solde d'ouverture + opérations validées datées à partir de cette date (les opérations antérieures sont supposées incluses).</p>
        <fieldset>
          <legend className={labelCls}>Début de l'exercice comptable</legend>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${uid}-fd`} className="sr-only">Jour</label>
              <select id={`${uid}-fd`} className="input" disabled={!canWrite} value={dd} onChange={e => setForm(f => ({ ...f, fiscalYearStart: `${mm}-${e.target.value}` }))}>
                {Array.from({ length: 28 }, (_, i) => String(i + 1).padStart(2, '0')).map(d => <option key={d} value={d}>{Number(d) === 1 ? '1er' : Number(d)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={`${uid}-fm`} className="sr-only">Mois</label>
              <select id={`${uid}-fm`} className="input" disabled={!canWrite} value={mm} onChange={e => setForm(f => ({ ...f, fiscalYearStart: `${e.target.value}-${dd}` }))}>
                {['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'].map((l, i) => <option key={l} value={String(i + 1).padStart(2, '0')}>{l}</option>)}
              </select>
            </div>
          </div>
        </fieldset>
        {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        {canWrite && <button type="submit" className="btn-primary"><Save size={14} aria-hidden="true" /> Enregistrer</button>}
      </form>
      <Categories canWrite={canWrite} />
    </div>
  );
}

function Categories({ canWrite }) {
  const categories = useFinanceStore(s => s.categories);
  const transactions = useFinanceStore(s => s.transactions);
  const upsertCategory = useFinanceStore(s => s.upsertCategory);
  const deleteCategory = useFinanceStore(s => s.deleteCategory);
  const restoreDefaultCategories = useFinanceStore(s => s.restoreDefaultCategories);
  const uid = useId();
  const [draft, setDraft] = useState({ label: '', type: 'expense', color: '#0ea5e9' });
  const list = Object.values(categories).sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  const used = (id) => Object.values(transactions).filter(t => t.categoryId === id).length;

  const add = (e) => {
    e.preventDefault();
    if (!draft.label.trim()) return;
    upsertCategory(draft);
    toast.success('Catégorie ajoutée', draft.label);
    setDraft(d => ({ ...d, label: '' }));
  };
  const remove = async (c) => {
    const n = used(c.id);
    if (!(await confirmDialog({ title: `Supprimer « ${c.label} » ?`, message: n ? `${n} opération(s) passeront dans « Autre ».` : 'Aucune opération n\'utilise cette catégorie.', confirmLabel: 'Supprimer', tone: 'danger' }))) return;
    deleteCategory(c.id);
    toast.success('Catégorie supprimée', c.label);
  };

  return (
    <section className="bg-surface border border-line rounded-2xl p-4 space-y-3" aria-labelledby={`${uid}-t`}>
      <div className="flex items-center justify-between gap-2">
        <h2 id={`${uid}-t`} className="font-semibold text-ink">Catégories</h2>
        {canWrite && <button type="button" className="btn-ghost py-1 text-xs" onClick={() => { restoreDefaultCategories(); toast.info('Catégories par défaut restaurées'); }}><RotateCcw size={12} aria-hidden="true" /> Restaurer les défauts</button>}
      </div>
      <ul className="divide-y divide-line">
        {list.map(c => (
          <li key={c.id} className="py-2 grid grid-cols-[auto_1fr_auto_auto] gap-2 items-center">
            <label className="sr-only" htmlFor={`${uid}-c-${c.id}`}>Couleur de {c.label}</label>
            <input id={`${uid}-c-${c.id}`} type="color" value={c.color || '#6b7280'} disabled={!canWrite} onChange={e => upsertCategory({ ...c, color: e.target.value })} className="w-7 h-7 rounded border border-line bg-transparent" />
            <div className="min-w-0">
              <label className="sr-only" htmlFor={`${uid}-l-${c.id}`}>Nom de la catégorie {c.label}</label>
              <input id={`${uid}-l-${c.id}`} className="input py-1" defaultValue={c.label} disabled={!canWrite}
                onBlur={e => { const v = e.target.value.trim(); if (v && v !== c.label) { upsertCategory({ ...c, label: v }); toast.success('Catégorie renommée', v); } }} />
              <span className="text-[11px] text-muted">{used(c.id)} opération(s)</span>
            </div>
            <div>
              <label className="sr-only" htmlFor={`${uid}-t-${c.id}`}>Type de {c.label}</label>
              <select id={`${uid}-t-${c.id}`} className="input py-1" value={c.type} disabled={!canWrite || c.id === COTISATION_CATEGORY_ID} onChange={e => upsertCategory({ ...c, type: e.target.value })}>
                {TYPE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            {canWrite && ![COTISATION_CATEGORY_ID, OTHER_CATEGORY_ID].includes(c.id)
              ? <button type="button" className="btn-ghost p-1.5" aria-label={`Supprimer la catégorie ${c.label}`} onClick={() => remove(c)}><Trash2 size={14} aria-hidden="true" /></button>
              : <span className="w-7" />}
          </li>
        ))}
      </ul>
      {canWrite && (
        <form onSubmit={add} className="grid grid-cols-[auto_1fr_auto_auto] gap-2 items-end border-t border-line pt-3">
          <div>
            <label htmlFor={`${uid}-nc`} className="sr-only">Couleur</label>
            <input id={`${uid}-nc`} type="color" value={draft.color} onChange={e => setDraft(d => ({ ...d, color: e.target.value }))} className="w-7 h-9 rounded border border-line bg-transparent" />
          </div>
          <div>
            <label htmlFor={`${uid}-nl`} className={labelCls}>Nouvelle catégorie</label>
            <input id={`${uid}-nl`} className="input" value={draft.label} onChange={e => setDraft(d => ({ ...d, label: e.target.value }))} placeholder="Goodies" />
          </div>
          <div>
            <label htmlFor={`${uid}-nt`} className="sr-only">Type</label>
            <select id={`${uid}-nt`} className="input" value={draft.type} onChange={e => setDraft(d => ({ ...d, type: e.target.value }))}>
              {TYPE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <button type="submit" className="btn-primary" disabled={!draft.label.trim()} aria-label="Ajouter la catégorie"><Plus size={14} aria-hidden="true" /></button>
        </form>
      )}
    </section>
  );
}
