import { useMemo } from 'react';
import { BarChart3, Users, Layers, Award, ShieldCheck, UserX, AlertTriangle } from 'lucide-react';
import { useStore } from '../store';
import { useCatalog } from '../core/useCatalog';
import { computeMemberStats } from './members/memberHelpers';

const COLOR_MAP = {
  blue: 'text-blue-500 bg-blue-500/10',
  emerald: 'text-emerald-500 bg-emerald-500/10',
  amber: 'text-amber-500 bg-amber-500/10',
  purple: 'text-purple-500 bg-purple-500/10',
  red: 'text-red-500 bg-red-500/10',
};

const ACCENT_MAP = {
  blue: 'bg-blue-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  purple: 'bg-purple-500',
};

function StatCard({ icon: Icon, label, value, sub, color = 'blue' }) {
  return (
    <div className="bg-surface border border-line rounded-2xl p-4 sm:p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2.5 rounded-xl ${COLOR_MAP[color]}`} aria-hidden="true">
          <Icon size={20} />
        </div>
        <span className="text-sm text-dim font-medium">{label}</span>
      </div>
      <div className="text-2xl sm:text-3xl font-black text-ink">{value}</div>
      {sub && <div className="text-xs text-dim mt-1">{sub}</div>}
    </div>
  );
}

/** Liste avec barres proportionnelles ; `d.color` (hex) remplace l'accent. */
function BreakdownList({ title, data, accent = 'blue', total: totalProp, emptyLabel = 'Aucune donnée.' }) {
  const total = totalProp || data.reduce((s, d) => s + d.count, 0) || 1;
  const visible = data.filter(d => d.count > 0);
  return (
    <section className="bg-surface border border-line rounded-2xl p-4 sm:p-5" aria-label={title}>
      <h3 className="font-bold text-ink mb-4">{title}</h3>
      {visible.length === 0 ? (
        <p className="text-dim text-sm">{emptyLabel}</p>
      ) : (
        <ul className="space-y-3">
          {visible.map(d => {
            const pct = Math.round((d.count / total) * 100);
            return (
              <li key={d.key}>
                <div className="flex justify-between text-sm mb-1 gap-2">
                  <span className="text-ink font-medium truncate flex items-center gap-1.5 min-w-0">
                    {d.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} aria-hidden="true" />}
                    <span className="truncate" title={d.label}>{d.label}</span>
                  </span>
                  <span className="text-dim font-mono shrink-0">
                    {d.count} <span className="sr-only">({pct} %)</span>
                  </span>
                </div>
                <div className="h-2 bg-elevated rounded-full overflow-hidden" aria-hidden="true">
                  <div
                    className={`h-full rounded-full transition-all ${d.color ? '' : ACCENT_MAP[accent]}`}
                    style={{ width: `${pct}%`, ...(d.color ? { backgroundColor: d.color } : {}) }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function Stats() {
  const members = useStore(s => s.members);
  const columns = useStore(s => s.columns);
  const vaultCount = useStore(s => s.vaultEntries?.length || 0);
  const vaultUnlocked = useStore(s => s._vaultKey != null);
  const vaultConfigured = useStore(s => !!(s.vaultEntriesBlob || s.vaultVerifier));
  const catalog = useCatalog();

  const stats = useMemo(() => computeMemberStats(members, catalog, columns), [members, catalog, columns]);
  const avgBadges = stats.total ? (stats.totalBadges / stats.total).toFixed(1) : 0;
  const polesInUse = stats.byPole.filter(p => !p.key.startsWith('__')).length;
  const legacyTotal = stats.offCatalog + stats.legacyOnly;

  const vaultValue = !vaultConfigured ? 0 : vaultUnlocked ? vaultCount : '🔒';
  const vaultSub = !vaultConfigured ? 'coffre non configuré' : vaultUnlocked ? 'entrées sécurisées' : 'coffre verrouillé';

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-purple-500/10 p-3 rounded-xl" aria-hidden="true">
          <BarChart3 size={24} className="text-purple-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-ink">Statistiques</h2>
          <p className="text-xs text-dim">Vue d'ensemble de ton BDE</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <StatCard icon={Users} label="Membres" value={stats.total} color="blue" />
        <StatCard icon={Layers} label="Pôles représentés" value={polesInUse}
          sub={`sur ${catalog.poleList.length} pôles · ${columns.length} colonnes`} color="emerald" />
        <StatCard icon={UserX} label="Sans rôle" value={stats.withoutRole}
          sub={stats.total ? `${Math.round((stats.withoutRole / stats.total) * 100)} % des membres` : undefined} color="purple" />
        <StatCard icon={Award} label="Badges (total)" value={stats.totalBadges} sub={`~${avgBadges} / membre`} color="amber" />
        <StatCard icon={ShieldCheck} label="Coffre-fort" value={vaultValue} sub={vaultSub} color="red" />
      </div>

      {legacyTotal > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm" role="note">
          <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-ink">
            <strong>{legacyTotal} membre{legacyTotal > 1 ? 's' : ''}</strong> {legacyTotal > 1 ? 'ont' : 'a'} un ancien rôle
            {stats.offCatalog > 0 && <> ({stats.offCatalog} hors catalogue)</>}
            {stats.legacyOnly > 0 && <> ({stats.legacyOnly} rôle{stats.legacyOnly > 1 ? 's' : ''} supprimé{stats.legacyOnly > 1 ? 's' : ''} du catalogue)</>}.
            {' '}<span className="text-dim">Modifie ces membres pour leur attribuer un rôle du catalogue (filtre « Rôle hors catalogue » dans l'onglet Membres).</span>
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <BreakdownList title="Répartition par pôle" data={stats.byPole} accent="blue" emptyLabel="Aucun membre." />
        <BreakdownList title="Répartition par rôle" data={stats.byRole} accent="emerald" emptyLabel="Aucun membre." />
        <BreakdownList title="Répartition par colonne" data={stats.byColumn} accent="purple" emptyLabel="Aucun membre." />
        <BreakdownList title="Badges les plus attribués" data={stats.byBadge} accent="amber" emptyLabel="Aucun badge attribué." />
      </div>
    </div>
  );
}
