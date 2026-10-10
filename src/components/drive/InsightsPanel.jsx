import { useState, useMemo } from 'react';
import {
  AlertTriangle, AlertCircle, Info, ChevronDown, ChevronRight,
  CheckCircle2, Shield, Zap, Filter, X,
} from 'lucide-react';
import { useStore } from '../../store';
import { useCatalogMaps } from '../../core/useCatalog';
import { analyzeDriveState } from '../../utils/driveAnalyzer';

const SEVERITY_META = {
  danger:  { label: 'Critique', icon: AlertTriangle, bg: 'bg-red-500/10',     border: 'border-red-500/30',     text: 'text-red-500' },
  warning: { label: 'Attention', icon: AlertCircle,  bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   text: 'text-amber-500' },
  info:    { label: 'Info',     icon: Info,          bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    text: 'text-blue-500' },
};

function AlertRow({ alert, onNavigate }) {
  const [expanded, setExpanded] = useState(false);
  const meta = SEVERITY_META[alert.severity];
  const Icon = meta.icon;

  return (
    <div className={`rounded-xl border ${meta.border} ${meta.bg} overflow-hidden`}>
      <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-white/[0.02] transition-colors">
        <div className={`shrink-0 p-1.5 rounded-lg ${meta.bg} border ${meta.border}`}>
          <Icon size={14} className={meta.text} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-ink">{alert.title}</div>
          <div className="text-xs text-dim mt-0.5">{alert.description}</div>
        </div>
        <div className="shrink-0 text-dim">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-line/50 space-y-2">
          <div className="flex items-start gap-2 text-xs">
            <Zap size={12} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <span className="text-dim font-medium">Suggestion : </span>
              <span className="text-ink">{alert.fix}</span>
            </div>
          </div>

          {alert.data?.members && (
            <div className="text-xs">
              <span className="text-dim font-medium">Concernés : </span>
              <div className="flex flex-wrap gap-1 mt-1">
                {alert.data.members.map((m, i) => (
                  <span key={i} className="text-[10px] bg-elevated border border-line rounded px-1.5 py-0.5 text-ink">
                    {m.firstName} {m.lastName}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(alert.memberId || alert.folderId) && (
            <button onClick={() => onNavigate?.(alert)}
              className="text-xs text-blue-500 hover:text-blue-400 font-medium flex items-center gap-1 mt-1">
              <Filter size={11} /> Voir dans la matrice
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function InsightsPanel({ onNavigate }) {
  const members = useStore(s => s.members);
  const folders = useStore(s => s.folders);
  const drivePermissions = useStore(s => s.drivePermissions);
  const rolePresets = useStore(s => s.rolePresets);
  const catalog = useCatalogMaps();
  const [severityFilter, setSeverityFilter] = useState('all');
  const [search, setSearch] = useState('');

  const alerts = useMemo(() =>
    analyzeDriveState({ members, folders, drivePermissions, rolePresets }, catalog),
    [members, folders, drivePermissions, rolePresets, catalog]);

  const counts = useMemo(() => {
    const c = { danger: 0, warning: 0, info: 0 };
    alerts.forEach(a => { c[a.severity]++; });
    return c;
  }, [alerts]);

  const filtered = useMemo(() => {
    return alerts.filter(a => {
      const matchSeverity = severityFilter === 'all' || a.severity === severityFilter;
      const s = search.toLowerCase();
      const matchSearch = !s || a.title.toLowerCase().includes(s) || a.description.toLowerCase().includes(s);
      return matchSeverity && matchSearch;
    });
  }, [alerts, severityFilter, search]);

  const filterButtons = [
    { id: 'all',     label: 'Toutes',    count: alerts.length,  color: 'text-ink' },
    { id: 'danger',  label: 'Critiques', count: counts.danger,  color: 'text-red-500' },
    { id: 'warning', label: 'Attention', count: counts.warning, color: 'text-amber-500' },
    { id: 'info',    label: 'Infos',     count: counts.info,    color: 'text-blue-500' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="bg-amber-500/10 p-2 rounded-lg"><Shield size={18} className="text-amber-500" /></div>
          <div>
            <h3 className="text-sm font-bold text-ink">Vérifications automatiques</h3>
            <p className="text-[10px] text-dim">
              {alerts.length === 0
                ? 'Aucun problème détecté ✓'
                : `${alerts.length} point${alerts.length > 1 ? 's' : ''} d'attention détecté${alerts.length > 1 ? 's' : ''}`}
            </p>
          </div>
        </div>

        <div className="flex-1 min-w-[200px] relative">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une alerte..."
            className="w-full bg-surface border border-line rounded-xl px-3 py-1.5 text-ink placeholder-dim focus:outline-none focus:border-amber-500 text-sm" />
          {search && (
            <button type="button" onClick={() => setSearch('')} aria-label="Effacer la recherche" className="absolute right-2 top-1/2 -translate-y-1/2 text-dim hover:text-ink">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {filterButtons.map(f => (
          <button key={f.id} onClick={() => setSeverityFilter(f.id)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-all border ${
              severityFilter === f.id
                ? 'bg-surface border-line shadow-sm'
                : 'bg-elevated border-transparent hover:border-line'
            }`}>
            <span className={f.color}>{f.label}</span>
            <span className="text-[10px] font-mono text-dim">{f.count}</span>
          </button>
        ))}
      </div>

      {alerts.length === 0 ? (
        <div className="text-center py-12 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl">
          <CheckCircle2 size={40} className="mx-auto text-emerald-500 mb-3" />
          <p className="text-emerald-500 font-bold">Tout est cohérent !</p>
          <p className="text-xs text-dim mt-1">Aucune incohérence détectée dans ta matrice de permissions.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-dim text-sm">Aucune alerte pour ces filtres.</div>
      ) : (
        <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-1">
          {filtered.map(alert => <AlertRow key={alert.id} alert={alert} onNavigate={onNavigate} />)}
        </div>
      )}
    </div>
  );
}