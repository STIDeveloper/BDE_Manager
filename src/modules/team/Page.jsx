// ============================================================
// ÉCRAN « ÉQUIPE & ACCÈS » (section team)
// ============================================================
// Sans configuration : guide pas à pas (projet Supabase gratuit) et
// formulaire URL + clé publique. Ensuite : compte, choix de l'espace,
// puis gestion de l'espace (membres, invitations, droits, journal).
// Lien d'invitation : #/team/invite/<jeton>.
// ============================================================

import { useEffect, useState } from 'react';
import { ShieldCheck, Loader2, Settings, HardDrive } from 'lucide-react';
import { useBackendState, STATUS_META } from '../../backend/state.js';
import { getBackendConfig, clearBackendConfig } from '../../backend/config.js';
import { bootBackend, rebootBackend } from '../../backend/bootstrap.js';
import { useRoute } from '../../core/router.js';
import { toast } from '../../components/ui/toastStore.js';
import { confirmDialog } from '../../components/ui/confirmStore.js';
import SetupPanel from './SetupPanel.jsx';
import AuthPanel, { NewPasswordForm } from './AuthPanel.jsx';
import WorkspacePanel from './WorkspacePanel.jsx';
import ConnectedPanel from './ConnectedPanel.jsx';
import { PENDING_INVITE_KEY, parseInviteToken } from './connectFlow.js';

function ConfigSummary({ config, onChanged }) {
  const user = useBackendState(s => s.user);
  const workspaceId = useBackendState(s => s.workspaceId);
  const host = (() => { try { return new URL(config.url).host; } catch { return config.url; } })();
  const change = async () => {
    if (!(await confirmDialog({
      title: 'Changer de projet Supabase ?',
      message: 'La synchronisation s’arrête et tu seras déconnecté·e. Les données restent sur cet appareil.',
      tone: 'warning', confirmLabel: 'Changer de projet',
    }))) return;
    try {
      const engine = await bootBackend();
      if (engine && user) await engine.signOut();
    } catch { /* hors ligne */ }
    clearBackendConfig();
    await rebootBackend();
    toast.info('Configuration effacée', 'Renseigne le nouveau projet.');
    onChanged();
  };
  return (
    <p className="text-xs text-muted flex flex-wrap items-center gap-2">
      <Settings size={13} aria-hidden="true" /> Projet : <span className="font-mono">{host}</span>
      {config.source === 'env' ? <span>(fourni au déploiement)</span> : !workspaceId && (
        <button type="button" className="underline hover:text-ink" onClick={change}>Changer de projet</button>
      )}
    </p>
  );
}

export default function TeamPage() {
  const route = useRoute();
  const ready = useBackendState(s => s.ready);
  const user = useBackendState(s => s.user);
  const workspaceId = useBackendState(s => s.workspaceId);
  const recovery = useBackendState(s => s.recovery);
  const status = useBackendState(s => s.status);
  const [configVersion, setConfigVersion] = useState(0);
  // Relue à chaque changement de configuration (configVersion).
  const [config, setConfig] = useState(() => getBackendConfig());

  useEffect(() => { bootBackend(); }, [configVersion]);
  const refreshConfig = () => { setConfig(getBackendConfig()); setConfigVersion(v => v + 1); };

  // Lien d'invitation : le jeton est gardé le temps de se connecter.
  const inviteToken = route.rest[0] === 'invite' ? parseInviteToken(route.rest[1]) : '';
  useEffect(() => {
    if (!inviteToken) return;
    try { sessionStorage.setItem(PENDING_INVITE_KEY, inviteToken); } catch { /* ignoré */ }
    toast.info('Invitation détectée', 'Connecte-toi avec l’adresse invitée, puis accepte l’invitation.');
  }, [inviteToken]);

  const meta = STATUS_META[status] || STATUS_META.local;

  let body;
  if (!config) body = <SetupPanel onConfigured={refreshConfig} />;
  else if (!ready) body = <p role="status" className="text-sm text-dim flex items-center gap-2 py-8 justify-center"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Connexion au serveur…</p>;
  else if (recovery && user) body = <NewPasswordForm />;
  else if (!user) body = <AuthPanel />;
  else if (!workspaceId) body = <WorkspacePanel key={inviteToken} />;
  else body = <ConnectedPanel />;

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink flex items-center gap-2"><ShieldCheck size={20} className="text-blue-500" aria-hidden="true" /> Équipe & accès</h2>
          <p className="text-sm text-dim mt-1">Travail à plusieurs, comptes, rôles d’accès et droits appliqués par le serveur.</p>
        </div>
        {!config && (
          <span className="badge badge-neutral text-xs"><HardDrive size={12} aria-hidden="true" /> {meta.label} — données sur cet appareil</span>
        )}
      </header>
      {config && <ConfigSummary config={config} onChanged={refreshConfig} />}
      {body}
    </div>
  );
}
