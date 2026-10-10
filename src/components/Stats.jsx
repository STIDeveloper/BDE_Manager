import React, { useMemo } from 'react';
import { BarChart3, Users, Layers, Award, ShieldCheck } from 'lucide-react';
import { useStore } from '../store';

function StatCard({ icon: Icon, label, value, sub, color = 'blue' }) {
  const colorMap = {
    blue: 'text-blue-500 bg-blue-500/10',
    emerald: 'text-emerald-500 bg-emerald-500/10',
    amber: 'text-amber-500 bg-amber-500/10',
    purple: 'text-purple-500 bg-purple-500/10',
    red: 'text-red-500 bg-red-500/10',
  };
  return (
    <div className="bg-surface border border-line rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2.5 rounded-xl ${colorMap[color]}`}>
          <Icon size={20} />
        </div>
        <span className="text-sm text-dim font-medium">{label}</span>
      </div>
      <div className="text-3xl font-black text-ink">{value}</div>
      {sub && <div className="text-xs text-dim mt-1">{sub}</div>}
    </div>
  );
}

function BreakdownList({ title, data, accent = 'blue' }) {
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  const accentMap = {
    blue: 'bg-blue-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    purple: 'bg-purple-500',
  };
  return (
    <div className="bg-surface border border-line rounded-2xl p-5">
      <h3 className="font-bold text-ink mb-4">{title}</h3>
      {data.length === 0 ? (
        <p className="text-dim text-sm">Aucune donnée.</p>
      ) : (
        <div className="space-y-3">
          {data.map(d => (
            <div key={d.label}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-ink font-medium truncate pr-2">{d.label}</span>
                <span className="text-dim font-mono">{d.count}</span>
              </div>
              <div className="h-2 bg-elevated rounded-full overflow-hidden">
                <div
                  className={`h-full ${accentMap[accent]} rounded-full transition-all`}
                  style={{ width: `${(d.count / total) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Stats() {
  const { members, columns, vaultEntries } = useStore();

  const byColumn = useMemo(() => {
    return columns.map(c => ({
      label: c.title,
      count: members.filter(m => m.columnId === c.id).length,
    })).sort((a, b) => b.count - a.count);
  }, [members, columns]);

  const byRole = useMemo(() => {
    const map = {};
    members.forEach(m => {
      const r = m.mainRole || 'Sans rôle';
      map[r] = (map[r] || 0) + 1;
    });
    return Object.entries(map).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  }, [members]);

  const byBadge = useMemo(() => {
    const map = {};
    members.forEach(m => m.badges.forEach(b => { map[b] = (map[b] || 0) + 1; }));
    return Object.entries(map).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  }, [members]);

  const totalBadges = members.reduce((s, m) => s + m.badges.length, 0);
  const avgBadges = members.length ? (totalBadges / members.length).toFixed(1) : 0;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-purple-500/10 p-3 rounded-xl">
          <BarChart3 size={24} className="text-purple-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-ink">Statistiques</h2>
          <p className="text-xs text-dim">Vue d'ensemble de ton BDE</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard icon={Users} label="Membres" value={members.length} color="blue" />
        <StatCard icon={Layers} label="Pôles" value={columns.length} color="emerald" />
        <StatCard icon={Award} label="Badges (total)" value={totalBadges} sub={`~${avgBadges} / membre`} color="amber" />
        <StatCard icon={ShieldCheck} label="Coffre-fort" value={vaultEntries.length} sub="entrées sécurisées" color="red" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BreakdownList title="Répartition par pôle" data={byColumn} accent="blue" />
        <BreakdownList title="Répartition par rôle" data={byRole} accent="emerald" />
        <BreakdownList title="Badges les plus attribués" data={byBadge} accent="amber" />
      </div>
    </div>
  );
}