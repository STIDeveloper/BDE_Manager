// Choix / création d'un espace, invitations reçues, connexion de l'appareil.
import { useCallback, useEffect, useId, useState } from 'react';
import { Building2, Plus, Loader2, Link2, RefreshCw, LogOut, AlertCircle } from 'lucide-react';
import * as engine from '../../backend/engine.js';
import { useBackendState } from '../../backend/state.js';
import { toast } from '../../components/ui/toastStore.js';
import { ROLE_LABELS, ROLE_BADGE } from './labels.js';
import { PENDING_INVITE_KEY, parseInviteToken, runConnectFlow } from './connectFlow.js';

export default function WorkspacePanel() {
  const nameId = useId();
  const tokenId = useId();
  const user = useBackendState(s => s.user);
  const progress = useBackendState(s => s.progress);
  const lastError = useBackendState(s => s.error);
  const [list, setList] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState('');
  const [tokenInput, setTokenInput] = useState(() => {
    try { return sessionStorage.getItem(PENDING_INVITE_KEY) || ''; } catch { return ''; }
  });

  const reload = useCallback(async () => {
    setLoadError('');
    try { setList(await engine.listMyWorkspaces()); } catch (err) { setLoadError(err?.message || 'Chargement impossible.'); setList([]); }
  }, []);

  useEffect(() => {
    let alive = true;
    engine.listMyWorkspaces()
      .then((l) => { if (alive) setList(l); })
      .catch((err) => { if (alive) { setLoadError(err?.message || 'Chargement impossible.'); setList([]); } });
    return () => { alive = false; };
  }, []);

  const create = async (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setBusy('create');
    try {
      await engine.createWorkspace(n);
      setName('');
      toast.success('Espace créé', `Tu en es le propriétaire. Connecte cet appareil pour y publier tes données.`);
      await reload();
    } catch (err) {
      toast.error('Création impossible', err?.message);
    } finally { setBusy(''); }
  };

  const accept = async (e) => {
    e.preventDefault();
    const token = parseInviteToken(tokenInput);
    if (!token) { toast.error('Lien invalide', 'Colle le lien d’invitation complet reçu.'); return; }
    setBusy('accept');
    try {
      await engine.acceptInvitation(token);
      try { sessionStorage.removeItem(PENDING_INVITE_KEY); } catch { /* ignoré */ }
      setTokenInput('');
      toast.success('Invitation acceptée', 'Tu fais maintenant partie de l’espace : connecte cet appareil.');
      await reload();
    } catch (err) {
      toast.error('Invitation refusée', err?.message);
    } finally { setBusy(''); }
  };

  const connect = async (ws) => {
    setBusy(ws.id);
    try { await runConnectFlow(ws); } catch (err) { toast.error('Connexion à l’espace impossible', err?.message); } finally { setBusy(''); }
  };

  return (
    <div className="space-y-5">
      <section className="bg-surface border border-line rounded-2xl p-5" aria-labelledby="ws-title">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 id="ws-title" className="font-semibold text-ink flex items-center gap-2"><Building2 size={18} className="text-blue-500" aria-hidden="true" /> Mes espaces</h3>
          <div className="flex gap-1">
            <button type="button" className="btn-ghost" onClick={reload} aria-label="Actualiser la liste des espaces"><RefreshCw size={15} aria-hidden="true" /></button>
            <button type="button" className="btn-ghost" onClick={() => engine.signOut()}><LogOut size={15} aria-hidden="true" /> Se déconnecter</button>
          </div>
        </div>
        <p className="text-sm text-dim mb-3">Connecté·e en tant que <strong className="text-ink">{user?.email}</strong>. Un espace = les données partagées d’un BDE.</p>
        {lastError && <p role="alert" className="text-sm text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 mb-3">{lastError}</p>}
        {progress && (
          <div role="status" className="mb-3 text-sm text-dim">
            <div className="flex items-center gap-2"><Loader2 size={15} className="animate-spin" aria-hidden="true" /> {progress.label} ({progress.done}/{progress.total})</div>
            <div className="h-1.5 bg-elevated rounded-full mt-2 overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} /></div>
          </div>
        )}
        {list === null ? (
          <p role="status" className="text-sm text-dim flex items-center gap-2"><Loader2 size={15} className="animate-spin" aria-hidden="true" /> Chargement…</p>
        ) : loadError ? (
          <p role="alert" className="text-sm text-rose-600 dark:text-rose-300 flex items-center gap-2"><AlertCircle size={15} aria-hidden="true" /> {loadError}</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-dim border border-dashed border-line rounded-xl p-4 text-center">Aucun espace pour l’instant : crée celui de ton BDE ou accepte une invitation.</p>
        ) : (
          <ul className="divide-y divide-line border border-line rounded-xl">
            {list.map(ws => (
              <li key={ws.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink truncate">{ws.name}</p>
                  <span className={`badge ${ROLE_BADGE[ws.role] || 'badge-neutral'}`}>{ROLE_LABELS[ws.role] || ws.role}</span>
                </div>
                <button type="button" className="btn-primary" disabled={!!busy} onClick={() => connect(ws)}>
                  {busy === ws.id && <Loader2 size={15} className="animate-spin" aria-hidden="true" />} Connecter cet appareil
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="bg-surface border border-line rounded-2xl p-5" aria-labelledby="ws-new">
          <h3 id="ws-new" className="font-semibold text-ink mb-3 flex items-center gap-2"><Plus size={16} aria-hidden="true" /> Créer un espace</h3>
          <form onSubmit={create} className="space-y-3">
            <div>
              <label htmlFor={nameId} className="block text-xs font-medium text-dim mb-1">Nom de l’espace</label>
              <input id={nameId} className="input" maxLength={80} placeholder="BDE …" value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <button type="submit" className="btn-secondary w-full" disabled={!!busy || !name.trim()}>
              {busy === 'create' && <Loader2 size={15} className="animate-spin" aria-hidden="true" />} Créer (j’en serai propriétaire)
            </button>
          </form>
        </section>
        <section className="bg-surface border border-line rounded-2xl p-5" aria-labelledby="ws-invite">
          <h3 id="ws-invite" className="font-semibold text-ink mb-3 flex items-center gap-2"><Link2 size={16} aria-hidden="true" /> Rejoindre avec une invitation</h3>
          <form onSubmit={accept} className="space-y-3">
            <div>
              <label htmlFor={tokenId} className="block text-xs font-medium text-dim mb-1">Lien d’invitation reçu</label>
              <input id={tokenId} className="input font-mono text-xs" autoComplete="off" spellCheck={false} placeholder="https://…/#/team/invite/…" value={tokenInput} onChange={e => setTokenInput(e.target.value)} />
              <p className="text-[11px] text-muted mt-1">L’invitation n’est valable que pour l’adresse e-mail à laquelle elle a été envoyée.</p>
            </div>
            <button type="submit" className="btn-secondary w-full" disabled={!!busy || !tokenInput.trim()}>
              {busy === 'accept' && <Loader2 size={15} className="animate-spin" aria-hidden="true" />} Accepter l’invitation
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
