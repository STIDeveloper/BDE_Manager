import { useMemo } from 'react';
import { AlertTriangle, AlertCircle, Info, Bell } from 'lucide-react';
import { useRolesStore } from '../../roleEngine/store.js';
import { useCatalogMaps } from '../../core/useCatalog.js';
import { refLabel } from './scenarioStats.js';

const SEVERITY = {
  danger:  { icon: AlertTriangle, bg: 'bg-red-500/5',     border: 'border-red-500/30',     text: 'text-red-500',     label: 'Critique' },
  warning: { icon: AlertCircle,   bg: 'bg-amber-500/5',   border: 'border-amber-500/30',   text: 'text-amber-500',   label: 'Attention' },
  info:    { icon: Info,          bg: 'bg-blue-500/5',    border: 'border-blue-500/20',    text: 'text-blue-500',    label: 'Info' },
};

export default function AlertsPanel() {
  const scenario = useRolesStore(s => s.scenarios[s.selectedScenarioIndex] || null);
  const candidates = useRolesStore(s => s.candidates);
  const catalog = useCatalogMaps();
  const candidatesById = useMemo(() => new Map(candidates.map(c => [c.id, c])), [candidates]);

  if (!scenario) {
    return <div className="text-center py-16 text-dim text-sm">Aucun scénario disponible. Importe d'abord un CSV.</div>;
  }

  const grouped = {
    danger: scenario.alerts.filter(a => a.severity === 'danger'),
    warning: scenario.alerts.filter(a => a.severity === 'warning'),
    info: scenario.alerts.filter(a => a.severity === 'info'),
  };

  const total = scenario.alerts.length;

  if (total === 0) {
    return (
      <div className="text-center py-16 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl">
        <Bell size={40} className="mx-auto text-emerald-500 mb-3" />
        <p className="text-emerald-500 font-bold">Aucune alerte !</p>
        <p className="text-xs text-dim mt-1">Le scénario actif ne présente aucune incohérence détectable.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-amber-500" />
          <h3 className="text-sm font-semibold text-ink">
            {total} alerte{total > 1 ? 's' : ''} détectée{total > 1 ? 's' : ''}
          </h3>
        </div>
        <div className="flex gap-1.5 text-[11px]">
          {grouped.danger.length > 0 && (
            <span className="text-red-500 font-medium">{grouped.danger.length} critique{grouped.danger.length > 1 ? 's' : ''}</span>
          )}
          {grouped.warning.length > 0 && (
            <span className="text-amber-500 font-medium">{grouped.warning.length} attention</span>
          )}
          {grouped.info.length > 0 && (
            <span className="text-blue-500 font-medium">{grouped.info.length} info</span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {['danger', 'warning', 'info'].flatMap(sev =>
          grouped[sev].map((alert) => {
            const meta = SEVERITY[sev];
            const Icon = meta.icon;
            // Clé stable : code + références (pas d'index : la liste change à chaque recalcul)
            const key = `${alert.code || alert.title}:${(alert.refs || []).join(',')}`;
            return (
              <div key={key} className={`${meta.bg} ${meta.border} border rounded-xl p-3.5`}>
                <div className="flex items-start gap-3">
                  <div className={`shrink-0 p-1.5 rounded-lg ${meta.bg} border ${meta.border}`}>
                    <Icon size={13} className={meta.text} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-semibold text-ink">{alert.title}</h4>
                      <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${meta.text} ${meta.bg} border ${meta.border}`}>
                        {meta.label}
                      </span>
                    </div>
                    <p className="text-xs text-dim mt-1">{alert.message}</p>

                    {alert.refs && alert.refs.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {[...new Set(alert.refs)].slice(0, 8).map((ref) => {
                          // Les refs mélangent ids de candidats, de rôles et de pôles → libellés
                          const label = refLabel(ref, { candidatesById, catalog });
                          return (
                            <span key={ref} className="text-[10px] bg-elevated border border-line rounded px-1.5 py-0.5 text-dim">
                              {label}
                            </span>
                          );
                        })}
                        {alert.refs.length > 8 && (
                          <span className="text-[10px] text-muted">+{alert.refs.length - 8}...</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}