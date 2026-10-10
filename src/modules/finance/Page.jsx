// ============================================================
// TRÉSORERIE — écran du module (section « finance »)
// ============================================================
// Onglets (route #/finance/<onglet>) : tableau de bord, opérations,
// budgets, rapport financier, réglages.
import { useId, useMemo, useState } from 'react';
import { LayoutDashboard, ListOrdered, Calculator, FileBarChart, Settings2, Plus, Lock } from 'lucide-react';
import { navigate, useRoute } from '../../core/router.js';
import { useCan } from '../../core/permissions.js';
import { isoDate } from '../../documents/context.js';
import { useFinanceStore } from './store.js';
import { fiscalRange, fiscalYearOf, fiscalYearsAvailable, EMPTY_FILTERS } from './logic.js';
import { Tabs } from './shared.jsx';
import Dashboard from './Dashboard.jsx';
import Transactions from './Transactions.jsx';
import TransactionForm from './TransactionForm.jsx';
import BankImport from './BankImport.jsx';
import Budgets from './Budgets.jsx';
import Report from './Report.jsx';
import Settings from './Settings.jsx';

export default function FinancePage() {
  const route = useRoute();
  const canRead = useCan('finance', 'read');
  const canWrite = useCan('finance', 'write');
  const canValidate = useCan('finance', 'validate');
  const transactions = useFinanceStore(s => s.transactions);
  const fiscalYearStart = useFinanceStore(s => s.settings.fiscalYearStart);
  const uid = useId();

  const today = isoDate();
  const years = useMemo(() => fiscalYearsAvailable(transactions, fiscalYearStart, today), [transactions, fiscalYearStart, today]);
  const [year, setYear] = useState(() => fiscalYearOf(today, fiscalYearStart));
  const range = useMemo(() => fiscalRange(year, fiscalYearStart), [year, fiscalYearStart]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [form, setForm] = useState(null); // { initial } | null
  const [importOpen, setImportOpen] = useState(false);
  const pendingCount = useMemo(() => Object.values(transactions).filter(t => t.status === 'pending').length, [transactions]);

  const tabs = [
    { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
    { id: 'operations', label: 'Opérations', icon: ListOrdered, count: canValidate ? pendingCount : 0 },
    { id: 'budgets', label: 'Budgets', icon: Calculator },
    { id: 'rapport', label: 'Rapport AG', icon: FileBarChart },
    { id: 'reglages', label: 'Réglages', icon: Settings2 },
  ];
  const active = tabs.some(t => t.id === route.rest[0]) ? route.rest[0] : 'dashboard';
  const go = (id) => navigate('finance', id);

  if (!canRead) {
    return (
      <div className="max-w-xl mx-auto p-6 text-center text-dim">
        <Lock size={28} className="mx-auto mb-2" aria-hidden="true" />
        <p className="font-medium text-ink">Accès à la trésorerie non autorisé</p>
        <p className="text-sm mt-1">Demande un accès « Trésorerie » à un administrateur.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-4 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink">Trésorerie</h2>
          <p className="text-sm text-dim">Recettes, dépenses, justificatifs, budgets et rapport financier.</p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label htmlFor={`${uid}-y`} className="block text-xs font-medium text-dim mb-1">Exercice</label>
            <select id={`${uid}-y`} className="input" value={year} onChange={e => setYear(Number(e.target.value))}>
              {years.map(y => <option key={y} value={y}>{fiscalRange(y, fiscalYearStart).label}</option>)}
            </select>
          </div>
          {canWrite && <button type="button" className="btn-primary" onClick={() => setForm({ initial: null })}><Plus size={14} aria-hidden="true" /> Saisir</button>}
        </div>
      </div>

      <Tabs tabs={tabs} active={active} onChange={go} label="Sections de la trésorerie" />

      <div role="tabpanel" aria-labelledby={`tab-${active}`}>
        {active === 'dashboard' && (
          <Dashboard range={range} canWrite={canWrite} onNew={() => setForm({ initial: null })}
            onShowPending={() => { setFilters({ ...EMPTY_FILTERS, status: 'pending' }); go('operations'); }} />
        )}
        {active === 'operations' && (
          <Transactions filters={filters} setFilters={setFilters} range={range} canWrite={canWrite} canValidate={canValidate}
            onNew={() => setForm({ initial: null })} onEdit={(t) => setForm({ initial: t })} onImport={() => setImportOpen(true)} />
        )}
        {active === 'budgets' && <Budgets range={range} years={years} canWrite={canWrite} />}
        {active === 'rapport' && <Report range={range} />}
        {active === 'reglages' && <Settings canWrite={canWrite} />}
      </div>

      {form && (
        <TransactionForm key={form.initial?.id || 'new'} open onClose={() => setForm(null)} initial={form.initial} canValidate={canValidate} />
      )}
      {importOpen && <BankImport open onClose={() => setImportOpen(false)} />}
    </div>
  );
}
