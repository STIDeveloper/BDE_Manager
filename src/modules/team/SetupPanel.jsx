// Configuration du projet Supabase : guide pas à pas + formulaire.
import { useId, useState } from 'react';
import { Server, ExternalLink, Copy, Loader2, CheckCircle2, AlertCircle, KeyRound } from 'lucide-react';
import { validateBackendConfig, testBackendConfig, saveBackendConfig } from '../../backend/config.js';
import { rebootBackend } from '../../backend/bootstrap.js';
import { toast } from '../../components/ui/toastStore.js';
import migrationSql from '../../../supabase/migrations/0001_init.sql?raw';

const STEPS = [
  { title: 'Crée un projet Supabase gratuit', body: 'Va sur supabase.com, crée un compte puis « New project » (offre Free). Choisis une région européenne (ex. Paris / Francfort) et note le mot de passe de la base dans le coffre-fort.' },
  { title: 'Exécute la migration SQL', body: 'Dans le projet : menu « SQL Editor » › « New query ». Copie le script ci-dessous (bouton « Copier le script SQL »), colle-le puis clique « Run ». Le message « Success. No rows returned » confirme l’installation. Le script peut être relancé sans risque.' },
  { title: 'Règle l’authentification', body: 'Menu « Authentication » › « URL Configuration » : mets l’adresse de l’application (ex. https://ton-bde.vercel.app) dans « Site URL » et ajoute-la dans « Redirect URLs ». Les liens de connexion par e-mail y renverront.' },
  { title: 'Copie l’URL et la clé publique', body: 'Menu « Project Settings » › « API » (ou « Data API » / « API Keys ») : copie la « Project URL » et la clé « anon public » (ou « publishable »). Ne copie JAMAIS la clé « service_role » / « secret ».' },
  { title: 'Renseigne-les ci-dessous', body: 'L’application teste la connexion avant d’enregistrer. Ces informations restent dans ce navigateur (ou peuvent être fournies au déploiement via VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY).' },
];

export default function SetupPanel({ onConfigured }) {
  const urlId = useId();
  const keyId = useId();
  const errId = useId();
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const copySql = async () => {
    try {
      await navigator.clipboard.writeText(migrationSql);
      toast.success('Script SQL copié', 'Colle-le dans Supabase › SQL Editor puis clique « Run ».');
    } catch {
      toast.error('Copie impossible', 'Ouvre le fichier supabase/migrations/0001_init.sql du projet.');
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const invalid = validateBackendConfig({ url, key });
    if (invalid) { setError(invalid); return; }
    setBusy(true);
    try {
      const problem = await testBackendConfig({ url, key });
      if (problem) { setError(problem); return; }
      saveBackendConfig({ url, key });
      await rebootBackend();
      toast.success('Projet connecté', 'Crée maintenant ton compte ou connecte-toi.');
      onConfigured?.();
    } catch (err) {
      setError(err?.message || 'Configuration impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
      <section className="bg-surface border border-line rounded-2xl p-5" aria-labelledby="setup-title">
        <div className="flex items-center gap-2 mb-1">
          <Server size={18} className="text-blue-500" aria-hidden="true" />
          <h3 id="setup-title" className="font-semibold text-ink">Activer le mode collaboratif</h3>
        </div>
        <p className="text-sm text-dim mb-4">
          Aujourd’hui, tes données restent sur cet appareil (mode local) : tout fonctionne sans serveur.
          Pour travailler à plusieurs (bureau, trésorier, membres) avec des droits par rôle, connecte un projet Supabase gratuit.
        </p>
        <ol className="space-y-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-300 text-xs font-bold flex items-center justify-center" aria-hidden="true">{i + 1}</span>
              <div>
                <p className="text-sm font-medium text-ink">{s.title}</p>
                <p className="text-sm text-dim">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2 mt-4">
          <button type="button" className="btn-secondary" onClick={copySql}>
            <Copy size={15} aria-hidden="true" /> Copier le script SQL
          </button>
          <a className="btn-ghost" href="https://supabase.com/dashboard/projects" target="_blank" rel="noopener noreferrer">
            <ExternalLink size={15} aria-hidden="true" /> Ouvrir Supabase
          </a>
        </div>
      </section>

      <section className="bg-surface border border-line rounded-2xl p-5 self-start" aria-labelledby="config-title">
        <div className="flex items-center gap-2 mb-3">
          <KeyRound size={18} className="text-blue-500" aria-hidden="true" />
          <h3 id="config-title" className="font-semibold text-ink">Connexion au projet</h3>
        </div>
        <form onSubmit={submit} noValidate className="space-y-3">
          <div>
            <label htmlFor={urlId} className="block text-xs font-medium text-dim mb-1">URL du projet</label>
            <input id={urlId} className="input" type="url" inputMode="url" autoComplete="off" spellCheck={false}
              placeholder="https://abcdefgh.supabase.co" value={url} onChange={e => setUrl(e.target.value)}
              aria-invalid={!!error} aria-describedby={error ? errId : undefined} required />
          </div>
          <div>
            <label htmlFor={keyId} className="block text-xs font-medium text-dim mb-1">Clé publique (anon / publishable)</label>
            <textarea id={keyId} className="input font-mono text-xs min-h-[84px]" autoComplete="off" spellCheck={false}
              placeholder="eyJhbGciOi… ou sb_publishable_…" value={key} onChange={e => setKey(e.target.value)}
              aria-invalid={!!error} aria-describedby={error ? errId : undefined} required />
            <p className="text-[11px] text-muted mt-1">Clé publique uniquement : la sécurité est assurée par les règles du serveur.</p>
          </div>
          {error && (
            <p id={errId} role="alert" className="flex items-start gap-2 text-sm text-rose-600 dark:text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5">
              <AlertCircle size={16} className="shrink-0 mt-0.5" aria-hidden="true" /> {error}
            </p>
          )}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <CheckCircle2 size={15} aria-hidden="true" />}
            {busy ? 'Test de la connexion…' : 'Tester et enregistrer'}
          </button>
        </form>
      </section>
    </div>
  );
}
