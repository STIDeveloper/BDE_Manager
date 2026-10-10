import React, { useState } from 'react';
import { Search, X, Filter, Download } from 'lucide-react';
import { useStore } from '../store';

export default function FilterBar({ filters, setFilters, resultCount, onExportGlobal }) {
  const { availableBadges, availableRoles, columns } = useStore();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const activeCount = (filters.role ? 1 : 0) + (filters.badge ? 1 : 0) + (filters.columnId ? 1 : 0);
  const clearAll = () => setFilters({ search: '', role: '', badge: '', columnId: '' });

  const selectCls = "w-full bg-elevated border border-line rounded-lg px-3 py-2 text-ink text-sm focus:outline-none focus:border-blue-500";

  return (
    <div className="bg-surface border border-line rounded-2xl p-4 mb-6">
      <div className="flex gap-2 items-center flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
          <input type="text" value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="Rechercher un membre, un rôle, un badge..."
            className="w-full bg-elevated border border-line rounded-xl pl-10 pr-4 py-2.5 text-ink placeholder-dim focus:outline-none focus:border-blue-500" />
        </div>

        <button onClick={() => setShowAdvanced(!showAdvanced)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-colors border ${
            showAdvanced || activeCount > 0
              ? 'bg-blue-500/10 border-blue-500/50 text-blue-500'
              : 'bg-elevated border-line text-ink hover:border-dim'
          }`}>
          <Filter size={16} /> Filtres {activeCount > 0 && `(${activeCount})`}
        </button>

        <button onClick={onExportGlobal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-colors"
          title="Exporter la liste filtrée au format WhatsApp">
          <Download size={16} /> Exporter
        </button>
      </div>

      {showAdvanced && (
        <div className="mt-4 pt-4 border-t border-line grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-dim uppercase font-semibold mb-1 block">Rôle principal</label>
            <select value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })} className={selectCls}>
              <option value="">Tous les rôles</option>
              {availableRoles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-dim uppercase font-semibold mb-1 block">Badge</label>
            <select value={filters.badge} onChange={(e) => setFilters({ ...filters, badge: e.target.value })} className={selectCls}>
              <option value="">Tous les badges</option>
              {availableBadges.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-dim uppercase font-semibold mb-1 block">Pôle</label>
            <select value={filters.columnId} onChange={(e) => setFilters({ ...filters, columnId: e.target.value })} className={selectCls}>
              <option value="">Tous les pôles</option>
              {columns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
        </div>
      )}

      <div className="mt-3 flex justify-between items-center text-xs">
        <span className="text-dim">{resultCount} membre{resultCount > 1 ? 's' : ''} affiché{resultCount > 1 ? 's' : ''}</span>
        {(activeCount > 0 || filters.search) && (
          <button onClick={clearAll} className="text-blue-500 hover:text-blue-400 flex items-center gap-1 font-medium">
            <X size={12} /> Effacer les filtres
          </button>
        )}
      </div>
    </div>
  );
}