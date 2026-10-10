// Connexion / création de compte / lien magique / mot de passe oublié.
import { useId, useState } from 'react';
import { LogIn, UserPlus, Mail, KeyRound, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import * as engine from '../../backend/engine.js';
import { toast } from '../../components/ui/toastStore.js';

const MODES = [
  { id: 'login', label: 'Connexion', icon: LogIn },
  { id: 'signup', label: 'Créer un compte', icon: UserPlus },
  { id: 'magic', label: 'Lien magique', icon: Mail },
  { id: 'reset', label: 'Mot de passe oublié', icon: KeyRound },
];

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function AuthPanel() {
  const emailId = useId();
  const pwId = useId();
  const pw2Id = useId();
  const msgId = useId();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const needsPassword = mode === 'login' || mode === 'signup';

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');
    if (!EMAIL_RE.test(email.trim())) { setError('Adresse e-mail invalide.'); return; }
    if (needsPassword && !password) { setError('Indique ton mot de passe.'); return; }
    if (mode === 'signup') {
      if (password.length < 8) { setError('Mot de passe trop court (8 caractères minimum).'); return; }
      if (password !== password2) { setError('Les deux mots de passe ne correspondent pas.'); return; }
    }
    setBusy(true);
    try {
      if (mode === 'login') {
        await engine.signInWithPassword(email, password);
        toast.success('Connecté·e', email.trim());
      } else if (mode === 'signup') {
        const r = await engine.signUp(email, password);
        if (r.needsConfirmation) setInfo('Compte créé : ouvre le lien de confirmation reçu par e-mail, puis reviens te connecter.');
        else toast.success('Compte créé', 'Tu es connecté·e.');
      } else if (mode === 'magic') {
        await engine.sendMagicLink(email);
        setInfo('Lien envoyé : ouvre l’e-mail sur CET appareil et clique sur le lien pour te connecter.');
      } else {
        await engine.sendPasswordReset(email);
        setInfo('Si un compte existe pour cette adresse, un lien de réinitialisation vient d’être envoyé.');
      }
      setPassword(''); setPassword2('');
    } catch (err) {
      setError(err?.message || 'Opération impossible.');
    } finally {
      setBusy(false);
    }
  };

  const current = MODES.find(m => m.id === mode);

  return (
    <section className="bg-surface border border-line rounded-2xl p-5 max-w-lg" aria-labelledby="auth-title">
      <h3 id="auth-title" className="font-semibold text-ink mb-3">Ton compte</h3>
      <div role="group" aria-label="Mode de connexion" className="flex flex-wrap gap-1.5 mb-4">
        {MODES.map(m => {
          const Icon = m.icon;
          return (
            <button key={m.id} type="button" aria-pressed={mode === m.id}
              onClick={() => { setMode(m.id); setError(''); setInfo(''); }}
              className={`chip ${mode === m.id ? 'chip-active' : 'chip-idle'}`}>
              <Icon size={13} aria-hidden="true" /> {m.label}
            </button>
          );
        })}
      </div>
      <form onSubmit={submit} noValidate className="space-y-3" aria-describedby={error || info ? msgId : undefined}>
        <div>
          <label htmlFor={emailId} className="block text-xs font-medium text-dim mb-1">Adresse e-mail</label>
          <input id={emailId} className="input" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        {needsPassword && (
          <div>
            <label htmlFor={pwId} className="block text-xs font-medium text-dim mb-1">Mot de passe</label>
            <input id={pwId} className="input" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password} onChange={e => setPassword(e.target.value)} required minLength={mode === 'signup' ? 8 : undefined} />
          </div>
        )}
        {mode === 'signup' && (
          <div>
            <label htmlFor={pw2Id} className="block text-xs font-medium text-dim mb-1">Confirme le mot de passe</label>
            <input id={pw2Id} className="input" type="password" autoComplete="new-password" value={password2} onChange={e => setPassword2(e.target.value)} required />
          </div>
        )}
        {error && (
          <p id={msgId} role="alert" className="flex items-start gap-2 text-sm text-rose-600 dark:text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5">
            <AlertCircle size={16} className="shrink-0 mt-0.5" aria-hidden="true" /> {error}
          </p>
        )}
        {info && !error && (
          <p id={msgId} role="status" className="flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5">
            <CheckCircle2 size={16} className="shrink-0 mt-0.5" aria-hidden="true" /> {info}
          </p>
        )}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
          {mode === 'login' ? 'Se connecter' : mode === 'signup' ? 'Créer mon compte' : mode === 'magic' ? 'Recevoir un lien de connexion' : 'Recevoir un lien de réinitialisation'}
        </button>
        <p className="text-[11px] text-muted">{current?.id === 'magic' ? 'Aucun mot de passe : un lien à usage unique est envoyé par e-mail.' : 'Ton compte sert à rejoindre l’espace de ton BDE ; les droits dépendent du rôle d’accès donné par le propriétaire.'}</p>
      </form>
    </section>
  );
}

/** Formulaire affiché au retour d'un lien « mot de passe oublié ». */
export function NewPasswordForm() {
  const id = useId();
  const id2 = useId();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (pw.length < 8) { setError('Mot de passe trop court (8 caractères minimum).'); return; }
    if (pw !== pw2) { setError('Les deux mots de passe ne correspondent pas.'); return; }
    setBusy(true);
    try {
      await engine.updatePassword(pw);
      toast.success('Mot de passe modifié', 'Tu peux l’utiliser dès maintenant.');
    } catch (err) {
      setError(err?.message || 'Modification impossible.');
    } finally { setBusy(false); }
  };
  return (
    <section className="bg-surface border border-line rounded-2xl p-5 max-w-lg" aria-labelledby="newpw-title">
      <h3 id="newpw-title" className="font-semibold text-ink mb-3">Choisis un nouveau mot de passe</h3>
      <form onSubmit={submit} noValidate className="space-y-3">
        <div>
          <label htmlFor={id} className="block text-xs font-medium text-dim mb-1">Nouveau mot de passe</label>
          <input id={id} className="input" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} />
        </div>
        <div>
          <label htmlFor={id2} className="block text-xs font-medium text-dim mb-1">Confirmation</label>
          <input id={id2} className="input" type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />} Enregistrer
        </button>
      </form>
    </section>
  );
}
