import React from 'react';
import {
  Trophy, Target, TrendingUp, AlertTriangle, Users, ChevronRight,
} from 'lucide-react';
import { useRolesStore } from '../../roleEngine/store.js';
import { ROLE_CATALOG } from '../../roleEngine/config.js';

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
  const {
    scenarios, ranking, setSelectedScenario, selectedScenarioIndex,
  } = useRolesStore();

  const standardScenarios = scenarios.slice(1); // exclut le "Personnalisé"

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Trophy size={16} className="text-amber-500" />
        <h3 className="text-sm font-semibold text-ink">Comparaison des 3 scénarios</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {standardScenarios.map((s, i) => {
          const realIndex = i + 1;
          const isSelected = selectedScenarioIndex === realIndex;
          const globalIdx = scenarios.findIndex(x => x.name === s.name);

          // Compteurs
          const assigned = s.assignments.filter(a => a.candidateId).length;
          const vacant = s.assignments.filter(a => a.vacant).length;
          const rank1 = s.assignments.filter(a => a.score?.rank === 1).length;
          const rank2 = s.assignments.filter(a => a.score?.rank === 2).length;
          const rank3 = s.assignments.filter(a => a.score?.rank === 3).length;
          const outRank = assigned - rank1 - rank2 - rank3;

          const dangers = s.alerts.filter(a => a.severity === 'danger').length;

          return (
            <button
              key={s.name}
              onClick={() => setSelectedScenario(globalIdx)}
              className={`text-left rounded-xl border p-4 transition-all ${
                isSelected
                  ? 'border-blue-500/50 bg-blue-500/5 shadow-md'
                  : 'border-line bg-surface hover:border-line-strong'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-ink truncate">{s.name}</h4>
                  <p className="text-[11px] text-dim mt-0.5 line-clamp-2">{s.description}</p>
                </div>
                {isSelected && (
                  <span className="text-[9px] bg-blue-500 text-white px-1.5 py-0.5 rounded font-bold shrink-0">
                    ACTIF
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 pb-3 border-b border-line">
                <StatMini label="Score" value={s.globalScore.toFixed(0)} tone="blue" />
                <StatMini label="Moy." value={s.avgSatisfaction.toFixed(0)} tone="emerald" />
                <StatMini label="Min." value={s.worstSatisfaction.toFixed(0)} tone={s.worstSatisfaction < 40 ? 'amber' : 'ink'} />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-3 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-dim">🥇 {rank1}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-dim">🥈 {rank2}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-dim">🥉 {rank3}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-zinc-500" />
                  <span className="text-dim">⚠️ {outRank}</span>
                </div>
              </div>

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-line text-[11px]">
                <div className="flex items-center gap-1.5 text-dim">
                  <Users size={11} /> {assigned} placés · {vacant} vacants
                </div>
                {dangers > 0 && (
                  <span className="flex items-center gap-1 text-red-500 font-medium">
                    <AlertTriangle size={10} /> {dangers}
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
      {standardScenarios.length > 0 && (
        <div className="bg-surface border border-line rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-line">
            <h4 className="text-sm font-medium text-ink">Répartition par pôle</h4>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-elevated">
              <tr className="border-b border-line">
                <th className="text-left px-4 py-2 text-dim font-medium">Pôle</th>
                {standardScenarios.map(s => (
                  <th key={s.name} className="text-center px-4 py-2 text-dim font-medium">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.keys(standardScenarios[0].poleSizes).map(pole => (
                <tr key={pole} className="border-b border-line/50">
                  <td className="px-4 py-2 text-ink">{pole}</td>
                  {standardScenarios.map(s => {
                    const size = s.poleSizes[pole] || 0;
                    const target = s.poleTargets[pole] || 0;
                    const diff = size - target;
                    return (
                      <td key={s.name} className="text-center px-4 py-2">
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