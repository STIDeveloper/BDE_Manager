import { useMemo } from 'react';
import {
  LayoutDashboard, Users, Target, TrendingUp, Award, AlertTriangle,
  GraduationCap, Briefcase,
} from 'lucide-react';
import { useRolesStore } from '../../roleEngine/store.js';
import { useCatalog } from '../../core/useCatalog.js';
import { countAssignments, isPlaced } from './scenarioStats.js';

function StatCard({ icon: Icon, label, value, sub, tone = 'blue' }) {
  const toneCls = {
    blue: 'text-blue-500 bg-blue-500/10',
    emerald: 'text-emerald-500 bg-emerald-500/10',
    amber: 'text-amber-500 bg-amber-500/10',
    red: 'text-red-500 bg-red-500/10',
    purple: 'text-purple-500 bg-purple-500/10',
  }[tone];
  return (
    <div className="bg-surface border border-line rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg ${toneCls}`}>
          <Icon size={14} />
        </div>
        <span className="text-[11px] text-dim font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold text-ink tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

function Bar({ label, value, total, tone = 'blue' }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  const toneCls = {
    blue: 'bg-blue-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    purple: 'bg-purple-500',
  }[tone];
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-ink truncate flex-1">{label}</span>
      <div className="w-24 h-1.5 bg-elevated rounded-full overflow-hidden">
        <div className={`h-full ${toneCls} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-dim tabular-nums w-10 text-right">{value}</span>
    </div>
  );
}

export default function DashboardPanel() {
  const candidates = useRolesStore(s => s.candidates);
  const scenario = useRolesStore(s => s.scenarios[s.selectedScenarioIndex] || null);
  const { roles, poleList } = useCatalog();

  const stats = useMemo(() => {
    if (!scenario) return null;
    // Placés = candidat ET place (les non placés ont slotId null)
    const { placed, unplaced, vacant, rank1, rank2, rank3, discover, out } = countAssignments(scenario);

    // Effectif par pôle (ordre et libellés du catalogue, pôles personnalisés inclus)
    const perPole = new Map(poleList.map(p => [p.id, { id: p.id, label: `${p.emoji ? p.emoji + ' ' : ''}${p.label}`, placed: 0, capacity: 0 }]));
    Object.values(roles).forEach(r => {
      const e = perPole.get(r.pole);
      if (e) e.capacity += r.capacity ?? 0;
    });
    scenario.assignments.filter(isPlaced).forEach(a => {
      const e = perPole.get(roles[a.roleId]?.pole);
      if (e) e.placed++;
    });
    const byPole = [...perPole.values()].filter(e => e.capacity > 0 || e.placed > 0);

    // Stats par formation
    const byFormation = {};
    candidates.forEach(c => {
      byFormation[c.formation] = (byFormation[c.formation] || 0) + 1;
    });

    // Stats par année
    const byYear = {};
    candidates.forEach(c => {
      byYear[c.year] = (byYear[c.year] || 0) + 1;
    });

    // Alternance
    const alternance = candidates.filter(c => c.alternance).length;

    // Disponibilité
    const byAvailability = {
      'Dispo et réactif': candidates.filter(c => c.availability >= 1.0).length,
      'Régulier': candidates.filter(c => c.availability >= 0.7 && c.availability < 1.0).length,
      'Ciblé': candidates.filter(c => c.availability >= 0.4 && c.availability < 0.7).length,
      'Chargé': candidates.filter(c => c.availability < 0.4).length,
    };

    // Couteau suisse
    const swissKnife = candidates.filter(c => c.swissKnife >= 1.0).length;

    return {
      total: candidates.length,
      assigned: placed,
      unplaced,
      vacant,
      rank1, rank2, rank3, discover, out,
      byPole,
      byFormation, byYear, alternance, byAvailability, swissKnife,
      avgScore: scenario.avgSatisfaction,
      worstScore: scenario.worstSatisfaction,
    };
  }, [scenario, candidates, roles, poleList]);

  if (!stats) {
    return <div className="text-center py-16 text-dim text-sm">Aucune donnée disponible.</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <LayoutDashboard size={16} className="text-purple-500" />
        <h3 className="text-sm font-semibold text-ink">Tableau de bord — {scenario.name}</h3>
      </div>

      {/* Stats principales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Users} label="Candidats" value={stats.total} sub={`${stats.assigned} placés${stats.unplaced ? ` · ${stats.unplaced} non placés` : ''}`} tone={stats.unplaced ? 'amber' : 'blue'} />
        <StatCard icon={Target} label="Score moyen" value={stats.avgScore.toFixed(0)} sub="/ 100" tone="emerald" />
        <StatCard icon={TrendingUp} label="Pire cas" value={stats.worstScore.toFixed(0)} sub="équité" tone={stats.worstScore < 40 ? 'amber' : 'emerald'} />
        <StatCard icon={AlertTriangle} label="Postes vacants" value={stats.vacant} sub="à pourvoir" tone={stats.vacant > 0 ? 'amber' : 'emerald'} />
      </div>

      {/* Répartition des choix obtenus */}
      <div className="bg-surface border border-line rounded-xl p-4">
        <h4 className="text-xs font-semibold text-ink mb-3">Rangs obtenus</h4>
        <div className="space-y-2">
          <Bar label="🥇 1er choix" value={stats.rank1} total={stats.assigned} tone="emerald" />
          <Bar label="🥈 2e choix" value={stats.rank2} total={stats.assigned} tone="blue" />
          <Bar label="🥉 3e choix" value={stats.rank3} total={stats.assigned} tone="amber" />
          {stats.discover > 0 && <Bar label="✨ Rôle à découvrir" value={stats.discover} total={stats.assigned} tone="blue" />}
          <Bar label="⚠️ Hors choix (renfort)" value={stats.out} total={stats.assigned} tone="purple" />
        </div>
        {stats.unplaced > 0 && (
          <p className="text-[11px] text-amber-500 mt-3">
            {stats.unplaced} candidat{stats.unplaced > 1 ? 's' : ''} non placé{stats.unplaced > 1 ? 's' : ''} (aucun poste au-dessus du seuil d'éligibilité) — visibles dans la colonne « Non placés » de l'organigramme.
          </p>
        )}
      </div>

      {/* Effectifs par pôle */}
      <div className="bg-surface border border-line rounded-xl p-4">
        <h4 className="text-xs font-semibold text-ink mb-3">Postes pourvus par pôle</h4>
        <div className="space-y-2">
          {stats.byPole.map(p => (
            <Bar key={p.id} label={`${p.label} (${p.placed}/${p.capacity})`} value={p.placed} total={p.capacity} tone={p.placed < p.capacity ? 'amber' : 'emerald'} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Formations */}
        <div className="bg-surface border border-line rounded-xl p-4">
          <h4 className="text-xs font-semibold text-ink mb-3 flex items-center gap-1.5">
            <GraduationCap size={12} className="text-blue-500" />
            Répartition par formation
          </h4>
          <div className="space-y-2">
            {Object.entries(stats.byFormation).sort((a, b) => b[1] - a[1]).map(([f, n]) => (
              <Bar key={f} label={f} value={n} total={stats.total} tone="blue" />
            ))}
          </div>
        </div>

        {/* Années */}
        <div className="bg-surface border border-line rounded-xl p-4">
          <h4 className="text-xs font-semibold text-ink mb-3 flex items-center gap-1.5">
            <Award size={12} className="text-purple-500" />
            Répartition par année
          </h4>
          <div className="space-y-2">
            {Object.entries(stats.byYear).sort((a, b) => a[0].localeCompare(b[0])).map(([y, n]) => (
              <Bar key={y} label={y} value={n} total={stats.total} tone="purple" />
            ))}
          </div>
        </div>
      </div>

      {/* Disponibilité */}
      <div className="bg-surface border border-line rounded-xl p-4">
        <h4 className="text-xs font-semibold text-ink mb-3">Disponibilité annoncée</h4>
        <div className="space-y-2">
          <Bar label="🚀 Dispo et réactif" value={stats.byAvailability['Dispo et réactif']} total={stats.total} tone="emerald" />
          <Bar label="⚖️ Régulier avec limites" value={stats.byAvailability['Régulier']} total={stats.total} tone="blue" />
          <Bar label="🎯 Investissement ciblé" value={stats.byAvailability['Ciblé']} total={stats.total} tone="amber" />
          <Bar label="⚠️ Emploi du temps chargé" value={stats.byAvailability['Chargé']} total={stats.total} tone="purple" />
        </div>
      </div>

      {/* Profil global */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-surface border border-line rounded-xl p-4">
          <h4 className="text-xs font-semibold text-ink mb-2 flex items-center gap-1.5">
            <Briefcase size={12} className="text-amber-500" />
            Alternance
          </h4>
          <div className="text-2xl font-bold text-ink tabular-nums">{stats.alternance}</div>
          <p className="text-[11px] text-dim mt-1">
            sur {stats.total} candidats
          </p>
        </div>
        <div className="bg-surface border border-line rounded-xl p-4">
          <h4 className="text-xs font-semibold text-ink mb-2 flex items-center gap-1.5">
            <Target size={12} className="text-emerald-500" />
            Profils couteau suisse 🔥
          </h4>
          <div className="text-2xl font-bold text-ink tabular-nums">{stats.swissKnife}</div>
          <p className="text-[11px] text-dim mt-1">
            Réserve de renfort transversale
          </p>
        </div>
      </div>
    </div>
  );
}