import { Trophy, TrendingUp, AlertTriangle, Users, CheckCircle2 } from 'lucide-react';
import { useRolesStore } from '../../roleEngine/store.js';
import { useCatalog } from '../../core/useCatalog.js';
import { countAssignments } from './scenarioStats.js';

function StatMini({ label, value, tone = 'ink' }) {
  const toneCls = {
    ink: 'text-ink',
    emerald: 'text-emerald-500',
    amber: 'text-amber-500',
    blue: 'text-blue-500',
    red: 'text-red-500',
  }[tone];
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted font-medium">{label}</div>
      <div className={`text-sm font-bold tabular-nums mt-0.5 ${toneCls}`}>{value}</div>
    </div>
  );
}

export default function ScenarioCompare() {
  const scenarios = useRolesStore(s => s.scenarios);
  const ranking = useRolesStore(s => s.ranking);
  const selectedScenarioIndex = useRolesStore(s => s.selectedScenarioIndex);
  const setSelectedScenario = useRolesStore(s => s.setSelectedScenario);
  const { poleList, poleLabel, poleColor } = useCatalog();

  if (scenarios.length === 0) {
    return <div className="text-center py-16 text-dim text-sm">Aucun scénario disponible. Importe d'abord un CSV.</div>;
  }

  // Pôles présents dans au moins un scénario, dans l'ordre du catalogue
  const poleIds = new Set(scenarios.flatMap(s => Object.keys(s.poleSizes || {})));
  const orderedPoles = [
    ...poleList.filter(p => poleIds.has(p.id)).map(p => p.id),
    ...[...poleIds].filter(id => !poleList.some(p => p.id === id)),
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Trophy size={16} className="text-amber-500" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-ink">Comparaison des {scenarios.length} scénarios</h3>
      </div>
      <p className="text-[11px] text-dim -mt-3">
        Clique sur un scénario pour l'activer : il sera utilisé par l'organigramme, les alertes, le tableau de bord et « Appliquer au BDE ».
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3" role="radiogroup" aria-label="Scénario actif">
        {scenarios.map((s, idx) => {
          const isSelected = selectedScenarioIndex === idx;
          const c = countAssignments(s);
          const dangers = (s.alerts || []).filter(a => a.severity === 'danger').length;

          return (
            <button
              type="button"
              key={s.name}
              role="radio"
              aria-checked={isSelected}
              onClick={() => setSelectedScenario(idx)}
              className={`text-left rounded-xl border-2 p-4 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
                isSelected
                  ? 'border-blue-500 bg-blue-500/10 shadow-md'
                  : 'border-line bg-surface hover:border-line-strong'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-ink truncate">{s.name}</h4>
                  <p className="text-[11px] text-dim mt-0.5 line-clamp-2">
                    {idx === 0 ? 'Tes curseurs de pondération (onglet Pondération).' : s.description}
                  </p>
                </div>
                {isSelected ? (
                  <span className="text-[9px] bg-blue-500 text-white px-1.5 py-0.5 rounded font-bold shrink-0 flex items-center gap-1">
                    <CheckCircle2 size={10} aria-hidden="true" /> ACTIF
                  </span>
                ) : (
                  <span className="text-[9px] text-muted border border-line px-1.5 py-0.5 rounded shrink-0">Choisir</span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 pb-3 border-b border-line">
                <StatMini label="Score" value={s.globalScore.toFixed(0)} tone="blue" />
                <StatMini label="Moy." value={s.avgSatisfaction.toFixed(0)} tone="emerald" />
                <StatMini label="Min." value={s.worstSatisfaction.toFixed(0)} tone={s.worstSatisfaction < 40 ? 'amber' : 'ink'} />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-3 text-[11px]">
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-dim">🥇 {c.rank1}</span></div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" /><span className="text-dim">🥈 {c.rank2}</span></div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /><span className="text-dim">🥉 {c.rank3}</span></div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-zinc-500" /><span className="text-dim">⚠️ {c.out + c.discover}</span></div>
              </div>

              <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-line text-[11px]">
                <div className="flex items-center gap-1.5 text-dim flex-wrap">
                  <Users size={11} aria-hidden="true" /> {c.placed} placés
                  {c.unplaced > 0 && <span className="text-amber-500">· {c.unplaced} non placés</span>}
                  <span>· {c.vacant} vacants</span>
                </div>
                {dangers > 0 && (
                  <span className="flex items-center gap-1 text-red-500 font-medium shrink-0" title={`${dangers} alerte(s) critique(s)`}>
                    <AlertTriangle size={10} aria-hidden="true" /> {dangers}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Classement */}
      {ranking && (
        <div className="bg-surface border border-line rounded-xl p-4">
          <h4 className="text-xs font-semibold text-ink mb-3 flex items-center gap-2">
            <TrendingUp size={13} className="text-emerald-500" /> Classements multicritères
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            <div className="flex items-center justify-between py-1.5 border-b border-line/50">
              <span className="text-dim">Meilleur score global</span>
              <span className="text-ink font-medium">{ranking.bestGlobalScore}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-line/50">
              <span className="text-dim">Meilleure satisfaction moyenne</span>
              <span className="text-ink font-medium">{ranking.bestAvg}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-line/50">
              <span className="text-dim">Meilleur pire cas (équité)</span>
              <span className="text-ink font-medium">{ranking.bestWorst}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-line/50">
              <span className="text-dim">Meilleur équilibre des pôles</span>
              <span className="text-ink font-medium">{ranking.bestBalance}</span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-dim">Moins d'alertes</span>
              <span className="text-ink font-medium">{ranking.fewestAlerts}</span>
            </div>
          </div>
        </div>
      )}

      {/* Tableau détaillé */}
      {orderedPoles.length > 0 && (
        <div className="bg-surface border border-line rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-line">
            <h4 className="text-sm font-medium text-ink">Répartition par pôle</h4>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[520px]">
            <thead className="bg-elevated">
              <tr className="border-b border-line">
                <th scope="col" className="text-left px-4 py-2 text-dim font-medium">Pôle</th>
                {scenarios.map((s, idx) => (
                  <th scope="col" key={s.name} className={`text-center px-4 py-2 font-medium ${idx === selectedScenarioIndex ? 'text-blue-500' : 'text-dim'}`}>
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orderedPoles.map(pole => (
                <tr key={pole} className="border-b border-line/50">
                  <th scope="row" className="px-4 py-2 text-ink font-normal text-left">
                    <span className="inline-block w-2 h-2 rounded-full mr-2 align-middle" style={{ background: poleColor(pole) }} aria-hidden="true" />
                    {poleLabel(pole)}
                  </th>
                  {scenarios.map((s, idx) => {
                    const size = s.poleSizes?.[pole] || 0;
                    const target = s.poleTargets?.[pole] || 0;
                    const diff = size - target;
                    return (
                      <td key={s.name} className={`text-center px-4 py-2 ${idx === selectedScenarioIndex ? 'bg-blue-500/5' : ''}`}>
                        <span className="font-mono text-ink">{size}</span>
                        <span className="text-muted text-[10px]"> / {target}</span>
                        {diff !== 0 && (
                          <span className={`ml-1 text-[10px] ${
                            Math.abs(diff) > 2 ? 'text-amber-500' : 'text-dim'
                          }`}>
                            {diff > 0 ? `+${diff}` : diff}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Renvoi vers organigramme */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 flex items-center justify-between gap-3 text-xs">
        <span className="text-dim">
          Le scénario <strong className="text-ink">{scenarios[selectedScenarioIndex]?.name}</strong> est actif.
          Consulte l'onglet <strong className="text-ink">Organigramme</strong> pour visualiser et ajuster.
        </span>
      </div>
    </div>
  );
}