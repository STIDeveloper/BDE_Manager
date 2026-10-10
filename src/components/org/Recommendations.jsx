import { useMemo, useState } from 'react';
import {
  Lightbulb, AlertTriangle, AlertCircle, Info, CheckCircle2, ChevronDown, ChevronRight, Users, FolderTree,
} from 'lucide-react';
import { useStore } from '../../store';
import { useCatalogMaps } from '../../core/useCatalog';
import { buildRecommendations } from '../../utils/recommendations';

// Recommandations calculées à partir des données réelles (membres, catalogue
// de rôles, presets et permissions Drive). Rien n'est rédigé à la main :
// si tout est en ordre, l'écran le dit.

const SEVERITY = {
  danger:  { label: 'Prioritaire', icon: AlertTriangle, box: 'border-red-500/30 bg-red-500/5',     text: 'text-red-500' },
  warning: { label: 'À traiter',   icon: AlertCircle,   box: 'border-amber-500/30 bg-amber-500/5', text: 'text-amber-500' },
  info:    { label: 'Conseil',     icon: Info,          box: 'border-blue-500/30 bg-blue-500/5',   text: 'text-blue-500' },
};

const CATEGORY = {
  roles: { label: 'Rôles & pôles', icon: Users },
  drive: { label: 'Droits Drive', icon: FolderTree },
};

function RecoCard({ reco }) {
  const [open, setOpen] = useState(reco.severity === 'danger');
  const meta = SEVERITY[reco.severity];
  const Icon = meta.icon;
  const Cat = CATEGORY[reco.category]?.icon || Info;
  const MAX = 12;
  return (
    <div className={`border rounded-2xl ${meta.box}`}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="w-full flex items-start gap-3 p-4 text-left">
        <Icon size={18} className={`${meta.text} shrink-0 mt-0.5`} aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${meta.text}`}>{meta.label}</span>
            <span className="text-[10px] text-dim flex items-center gap-1">
              <Cat size={10} aria-hidden="true" /> {CATEGORY[reco.category]?.label}
            </span>
          </div>
          <h4 className="text-sm font-bold text-ink mt-0.5">{reco.title}</h4>
          <p className="text-xs text-dim mt-0.5">{reco.description}</p>
        </div>
        {open ? <ChevronDown size={16} className="text-dim shrink-0" aria-hidden="true" />
              : <ChevronRight size={16} className="text-dim shrink-0" aria-hidden="true" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pl-11 space-y-2">
          <ul className="text-xs text-ink space-y-0.5 list-disc pl-4">
            {reco.items.slice(0, MAX).map((it, i) => <li key={i}>{it}</li>)}
            {reco.items.length > MAX && <li className="text-dim list-none">… et {reco.items.length - MAX} de plus</li>}
          </ul>
          <p className="text-xs text-dim"><strong className="text-ink">Que faire ?</strong> {reco.fix}</p>
        </div>
      )}
    </div>
  );
}

export default function Recommendations() {
  const members = useStore(s => s.members);
  const folders = useStore(s => s.folders);
  const drivePermissions = useStore(s => s.drivePermissions);
  const rolePresets = useStore(s => s.rolePresets);
  const catalog = useCatalogMaps();

  const recos = useMemo(
    () => buildRecommendations({ members, folders, drivePermissions, rolePresets }, catalog),
    [members, folders, drivePermissions, rolePresets, catalog]);

  const roleCount = Object.keys(catalog.roles || {}).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="bg-yellow-500/10 p-3 rounded-xl">
          <Lightbulb size={22} className="text-yellow-500" aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-base font-bold text-ink">Recommandations</h3>
          <p className="text-xs text-dim">
            Calculées à partir de tes données : {members.length} membre{members.length > 1 ? 's' : ''} • {roleCount} rôle{roleCount > 1 ? 's' : ''} au catalogue • {folders.length} dossier{folders.length > 1 ? 's' : ''} Drive
          </p>
        </div>
      </div>

      {recos.length === 0 ? (
        <div className="text-center py-12 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl">
          <CheckCircle2 size={36} className="mx-auto text-emerald-500 mb-2" aria-hidden="true" />
          <p className="text-emerald-500 font-bold">Rien à signaler</p>
          <p className="text-xs text-dim mt-1">Rôles essentiels pourvus, pôles encadrés et accès Drive cohérents avec les presets.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {recos.map(r => <RecoCard key={r.id} reco={r} />)}
        </div>
      )}
    </div>
  );
}
