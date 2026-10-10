import { useId, useMemo, useState } from 'react';
import { Search, X, Filter, Download } from 'lucide-react';
import { useStore } from '../store';
import { useCatalog } from '../core/useCatalog';
import { buildRoleOptions, ROLE_FILTER_LEGACY, ROLE_FILTER_NONE } from './members/memberHelpers';

const EMPTY = { search: '', role: '', badge: '', columnId: '' };

export default function FilterBar({ filters, setFilters, resultCount, onExportGlobal }) {
  const availableBadges = useStore(s => s.availableBadges);
  const columns = useStore(s => s.columns);
  const members = useStore(s => s.members);
  const catalog = useCatalog();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const uid = useId();
  const ids = { search: `${uid}-q`, role: `${uid}-role`, badge: `${uid}-badge`, column: `${uid}-col`, panel: `${uid}-panel` };

  const { groups } = useMemo(() => buildRoleOptions(catalog), [catalog]);
  // Options spéciales affichées seulement si utiles.
  const { hasNoRole, hasOffCatalog } = useMemo(() => ({
    hasNoRole: members.some(m => !m.mainRole),
    hasOffCatalog: members.some(m => m.mainRole && !catalog.roles[m.mainRole]),
  }), [members, catalog.roles]);

  const activeCount = (filters.role ? 1 : 0) + (filters.badge ? 1 : 0) + (filters.columnId ? 1 : 0);
  const clearAll = () => setFilters(EMPTY);
  const update = (field) => (e) => setFilters({ ...filters, [field]: e.target.value });

  const selectCls = 'w-full bg-elevated border border-line rounded-lg px-3 py-2 text-ink text-sm focus:outline-none focus:border-blue-500';
  const labelCls = 'text-xs text-dim uppercase font-semibold mb-1 block';

  return (
    <div className="bg-surface border border-line rounded-2xl p-3 sm:p-4 mb-4 sm:mb-6" role="search" aria-label="Filtrer les membres">
      <div className="flex gap-2 items-center flex-wrap">
        <div className="flex-1 basis-full sm:basis-auto min-w-0 sm:min-w-[200px] relative">
          <label htmlFor={ids.search} className="sr-only">Rechercher un membre</label>
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim pointer-events-none" aria-hidden="true" />
          <input id={ids.search} type="search" value={filters.search}
            onChange={update('search')}
            placeholder="Rechercher un membre, un rôle, un badge..."
            className="w-full bg-elevated border border-line rounded-xl pl-10 pr-4 py-2.5 text-ink placeholder-dim focus:outline-none focus:border-blue-500" />
        </div>

        <button type="button" onClick={() => setShowAdvanced(v => !v)}
          aria-expanded={showAdvanced}
          aria-controls={ids.panel}
          className={`flex-1 sm:flex-none justify-center flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-colors border ${
            showAdvanced || activeCount > 0
              ? 'bg-blue-500/10 border-blue-500/50 text-blue-500'
              : 'bg-elevated border-line text-ink hover:border-dim'
          }`}>
          <Filter size={16} aria-hidden="true" /> Filtres {activeCount > 0 && `(${activeCount})`}
        </button>

        <button type="button" onClick={onExportGlobal}
          className="flex-1 sm:flex-none justify-center flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-colors"
          title="Exporter la liste filtrée au format WhatsApp">
          <Download size={16} aria-hidden="true" /> Exporter
        </button>
      </div>

      {showAdvanced && (
        <div id={ids.panel} className="mt-4 pt-4 border-t border-line grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label htmlFor={ids.role} className={labelCls}>Rôle principal</label>
            <select id={ids.role} value={filters.role} onChange={update('role')} className={selectCls}>
              <option value="">Tous les rôles</option>
              {(hasNoRole || filters.role === ROLE_FILTER_NONE) && <option value={ROLE_FILTER_NONE}>Sans rôle</option>}
              {(hasOffCatalog || filters.role === ROLE_FILTER_LEGACY) && <option value={ROLE_FILTER_LEGACY}>Rôle hors catalogue</option>}
              {groups.map(g => (
                <optgroup key={g.pole.id} label={g.pole.label}>
                  {g.roles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={ids.badge} className={labelCls}>Badge</label>
            <select id={ids.badge} value={filters.badge} onChange={update('badge')} className={selectCls}>
              <option value="">Tous les badges</option>
              {availableBadges.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={ids.column} className={labelCls}>Colonne</label>
            <select id={ids.column} value={filters.columnId} onChange={update('columnId')} className={selectCls}>
              <option value="">Toutes les colonnes</option>
              {columns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
        </div>
      )}

      <div className="mt-3 flex justify-between items-center text-xs gap-2">
        <span className="text-dim" aria-live="polite">
          {resultCount} membre{resultCount > 1 ? 's' : ''} affiché{resultCount > 1 ? 's' : ''}
        </span>
        {(activeCount > 0 || filters.search) && (
          <button type="button" onClick={clearAll} className="text-blue-500 hover:text-blue-400 flex items-center gap-1 font-medium">
            <X size={12} aria-hidden="true" /> Effacer les filtres
          </button>
        )}
      </div>
    </div>
  );
}
