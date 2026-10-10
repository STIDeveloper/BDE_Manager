// ============================================================
// INDICATEUR DE SYNCHRONISATION (en-tête)
// ============================================================
// Intégration (App.jsx, dans la barre d'actions de l'en-tête) :
//   import SyncStatusBadge from './backend/SyncStatusBadge';
//   …<SyncStatusBadge />  (avant <UndoButtons />)
// Clic : ouvre « Équipe & accès ». En mode local sans configuration,
// l'indicateur reste discret (icône seule sur mobile).
// ============================================================

import { useEffect } from 'react';
import { Cloud, CloudOff, RefreshCw, AlertTriangle, HardDrive, CheckCircle2 } from 'lucide-react';
import { useBackendState, STATUS_META } from './state.js';
import { bootBackend } from './bootstrap.js';
import { navigate } from '../core/router.js';

const ICONS = {
  local: HardDrive, starting: RefreshCw, synced: CheckCircle2, syncing: RefreshCw,
  offline: CloudOff, error: AlertTriangle, follower: Cloud,
};
const TONES = {
  neutral: 'text-dim border-line bg-elevated',
  brand: 'text-blue-600 dark:text-blue-300 border-blue-500/30 bg-blue-500/10',
  emerald: 'text-emerald-700 dark:text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
  amber: 'text-amber-700 dark:text-amber-300 border-amber-500/30 bg-amber-500/10',
  rose: 'text-rose-700 dark:text-rose-300 border-rose-500/30 bg-rose-500/10',
};

export default function SyncStatusBadge() {
  const status = useBackendState(s => s.status);
  const pending = useBackendState(s => s.pending);
  const workspaceName = useBackendState(s => s.workspaceName);
  const error = useBackendState(s => s.error);

  useEffect(() => { bootBackend(); }, []);

  const meta = STATUS_META[status] || STATUS_META.local;
  const Icon = ICONS[status] || HardDrive;
  const spinning = status === 'syncing' || status === 'starting';
  const label = status === 'syncing' && pending ? `${meta.label} (${pending})` : meta.label;
  const title = [workspaceName && `Espace : ${workspaceName}`, meta.hint, status === 'error' && error].filter(Boolean).join(' — ');

  return (
    <button
      type="button"
      onClick={() => navigate('team')}
      title={title}
      aria-label={`État de la synchronisation : ${label}. Ouvrir Équipe et accès.`}
      className={`tap inline-flex items-center gap-1.5 h-9 px-2 sm:px-2.5 rounded-xl border text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${TONES[meta.tone]}`}
    >
      <Icon size={15} aria-hidden="true" className={spinning ? 'animate-spin' : ''} />
      <span className="hidden lg:inline whitespace-nowrap" aria-hidden="true">{label}</span>
    </button>
  );
}
