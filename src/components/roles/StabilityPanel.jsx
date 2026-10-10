import { useMemo } from 'react';
import {
  Activity, Play, AlertTriangle, Shield, Info, Users, UserX,
} from 'lucide-react';
import { useRolesStore } from '../../roleEngine/store.js';
import { useCatalog } from '../../core/useCatalog.js';
import { isPlaced, isUnplaced } from './scenarioStats.js';

const fullName = (c) => (c ? `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.displayName || 'Candidat' : 'Candidat inconnu');

export default function StabilityPanel() {
  const stability = useRolesStore(s => s.stability);
  const stabilityLoading = useRolesStore(s => s.stabilityLoading);
  const runStability = useRolesStore(s => s.runStability);
  const candidates = useRolesStore(s => s.candidates);
  const scenario = useRolesStore(s => s.scenarios[s.selectedScenarioIndex] || null);
  const { roleLabel } = useCatalog();
  const candidatesById = useMemo(() => new Map(candidates.map(c => [c.id, c])), [candidates]);

  const handleRun = () => runStability(200);

  // ---------- État initial ----------
  if (!stability || !scenario) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-blue-500" />
          <h3 className="text-sm font-semibold text-ink">Analyse de stabilité</h3>
        </div>

        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 flex items-start gap-3">
          <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />
          <div className="text-xs text-dim">
            <p className="text-ink font-medium mb-1">Comment ça marche ?</p>
            <p>
              L'algorithme perturbe <strong className="text-ink">200 fois</strong> les pondérations (± 20 %)
              et relance le solveur à chaque fois. Les affectations <strong className="text-ink">stables</strong> (≥ 75 % de fréquence)
              sont fiables. Les autres méritent un <strong className="text-ink">arbitrage humain</strong>.
            </p>
          </div>
        </div>

        <button
          onClick={handleRun}
          disabled={stabilityLoading || !scenario}
          className="btn-primary disabled:opacity-50">
          <Play size={13} /> {stabilityLoading ? 'Analyse en cours...' : 'Lancer l\'analyse (200 itérations)'}
        </button>
      </div>
    );
  }

  // ---------- Résultats ----------
  // Uniquement les candidats PLACÉS (les non placés ont roleId null)
  const stabilityList = scenario.assignments
    .filter(isPlaced)
    .map(a => ({
      assignment: a,
      candidate: candidatesById.get(a.candidateId),
      roleName: roleLabel(a.roleId),
      stability: stability.stability.get(`${a.candidateId}:${a.roleId}`) ?? 0,
    }))
    .sort((a, b) => a.stability - b.stability);

  // Non placés : fréquence à laquelle ils obtiennent un poste (n'importe lequel)
  const unplacedList = scenario.assignments
    .filter(isUnplaced)
    .map(a => {
      let placedFreq = 0;
      stability.stability.forEach((v, k) => { if (k.startsWith(`${a.candidateId}:`)) placedFreq += v; });
      return { candidateId: a.candidateId, candidate: candidatesById.get(a.candidateId), placedFreq: Math.min(1, placedFreq) };
    });

  const stable = stabilityList.filter(s => s.stability >= 0.75);
  const unstable = stabilityList.filter(s => s.stability >= 0.5 && s.stability < 0.75);
  const critical = stabilityList.filter(s => s.stability < 0.5);

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-blue-500" />
          <h3 className="text-sm font-semibold text-ink">Analyse de stabilité</h3>
          <span className="text-[10px] bg-elevated border border-line text-dim px-1.5 py-0.5 rounded font-mono">
            200 itérations
          </span>
        </div>
        <button
          onClick={handleRun}
          disabled={stabilityLoading}
          className="text-xs text-dim hover:text-ink flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-line transition-colors">
          <Play size={11} /> Relancer
        </button>
      </div>

      {/* Résumé */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Shield size={12} className="text-emerald-500" />
            <span className="text-[10px] uppercase tracking-wider text-emerald-500 font-semibold">
              Stables
            </span>
          </div>
          <div className="text-2xl font-bold text-ink">{stable.length}</div>
          <p className="text-[10px] text-dim mt-0.5">≥ 75 % de fréquence</p>
        </div>
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3.5">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle size={12} className="text-amber-500" />
            <span className="text-[10px] uppercase tracking-wider text-amber-500 font-semibold">
              Modérées
            </span>
          </div>
          <div className="text-2xl font-bold text-ink">{unstable.length}</div>
          <p className="text-[10px] text-dim mt-0.5">50–75 %</p>
        </div>
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3.5">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle size={12} className="text-red-500" />
            <span className="text-[10px] uppercase tracking-wider text-red-500 font-semibold">
              Critiques
            </span>
          </div>
          <div className="text-2xl font-bold text-ink">{critical.length}</div>
          <p className="text-[10px] text-dim mt-0.5">&lt; 50 % — arbitrage requis</p>
        </div>
      </div>

      {/* Liste détaillée */}
      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-line flex items-center gap-2">
          <Users size={13} className="text-dim" aria-hidden="true" />
          <h4 className="text-sm font-medium text-ink">Stabilité par affectation</h4>
          <span className="text-[10px] text-muted ml-auto">Scénario : {scenario.name}</span>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-elevated">
              <tr className="border-b border-line">
                <th className="text-left px-4 py-2 text-dim font-medium">Candidat</th>
                <th className="text-left px-4 py-2 text-dim font-medium">Poste</th>
                <th className="text-right px-4 py-2 text-dim font-medium">Score</th>
                <th className="text-right px-4 py-2 text-dim font-medium">Stabilité</th>
              </tr>
            </thead>
            <tbody>
              {stabilityList.map((row) => {
                const pct = Math.round(row.stability * 100);
                const tone = row.stability >= 0.75 ? 'emerald' : row.stability >= 0.5 ? 'amber' : 'red';
                return (
                  <tr key={row.assignment.candidateId} className="border-b border-line/50 hover:bg-elevated/40">
                    <td className="px-4 py-2 text-ink font-medium">
                      {fullName(row.candidate)}
                    </td>
                    <td className="px-4 py-2 text-dim">{row.roleName}</td>
                    <td className="px-4 py-2 text-right font-mono text-dim">
                      {row.assignment.score?.total?.toFixed(1) ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 h-1.5 bg-elevated rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              tone === 'emerald' ? 'bg-emerald-500'
                              : tone === 'amber' ? 'bg-amber-500'
                              : 'bg-red-500'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="font-mono text-dim tabular-nums w-10 text-right">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Candidats non placés (listés à part : pas de rôle à évaluer) */}
      {unplacedList.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <UserX size={14} className="text-amber-500" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-ink">
              {unplacedList.length} candidat{unplacedList.length > 1 ? 's' : ''} non placé{unplacedList.length > 1 ? 's' : ''}
            </h4>
          </div>
          <p className="text-[11px] text-dim mb-3">
            Aucun poste au-dessus du seuil d'éligibilité dans ce scénario. Le pourcentage indique la part des simulations où le candidat obtient malgré tout un poste.
          </p>
          <ul className="space-y-1.5">
            {unplacedList.map(u => (
              <li key={u.candidateId} className="flex items-center justify-between gap-3 py-1.5 px-3 bg-surface rounded-lg border border-line text-xs">
                <span className="text-ink font-medium truncate">{fullName(u.candidate)}</span>
                <span className="font-mono text-dim shrink-0">placé dans {Math.round(u.placedFreq * 100)} %</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Paires bloquantes */}
      {stability.arbitrationsRequired.length > 0 && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={14} className="text-red-500" />
            <h4 className="text-sm font-semibold text-ink">
              {stability.arbitrationsRequired.length} arbitrage{stability.arbitrationsRequired.length > 1 ? 's' : ''} humain{stability.arbitrationsRequired.length > 1 ? 's' : ''} requis
            </h4>
          </div>
          <div className="space-y-2">
            {stability.arbitrationsRequired.slice(0, 10).map((arb) => {
              const c = candidatesById.get(arb.candidateId);
              return (
                <div key={`${arb.candidateId}:${arb.roleId}`} className="flex items-center justify-between gap-3 py-1.5 px-3 bg-surface rounded-lg border border-line">
                  <div className="min-w-0">
                    <div className="text-xs text-ink font-medium truncate">
                      {fullName(c)}
                    </div>
                    <div className="text-[10px] text-dim truncate">{roleLabel(arb.roleId)}</div>
                  </div>
                  <span className="text-[10px] font-mono text-red-500">
                    {Math.round(arb.stability * 100)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}