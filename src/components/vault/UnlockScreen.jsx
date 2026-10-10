import { useEffect, useId, useRef, useState } from 'react';
import { Lock, Unlock } from 'lucide-react';
import { useStore } from '../../store';
import { toast } from '../ui/toastStore';
import { PasswordField } from './PasswordField';
import { VaultScreenShell, SubmitButton, FormError } from './VaultScreenShell';

// Anti-bruteforce côté interface : après 5 échecs, blocage de 30 s, doublé à
// chaque nouvelle série de 5 échecs (max 5 min). Conservé au niveau du module
// pour survivre aux changements d'onglet dans l'app (réinitialisé au rechargement :
// la vraie protection reste le coût de PBKDF2 — 250 000 itérations).
const MAX_ATTEMPTS = 5;
const BASE_LOCKOUT_MS = 30_000;
const MAX_LOCKOUT_MS = 5 * 60_000;
const throttle = { failures: 0, lockedUntil: 0 };

function registerFailure() {
  throttle.failures += 1;
  if (throttle.failures % MAX_ATTEMPTS === 0) {
    const series = throttle.failures / MAX_ATTEMPTS;
    throttle.lockedUntil = Date.now() + Math.min(MAX_LOCKOUT_MS, BASE_LOCKOUT_MS * 2 ** (series - 1));
  }
}

const WRONG_PASSWORD_MSG = 'Mot de passe incorrect.';

/** Écran 2 : coffre configuré mais verrouillé. */
export default function UnlockScreen({ onRequestReset }) {
  const vaultUnlock = useStore(s => s.vaultUnlock);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(() => throttle.lockedUntil);
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef(null);
  const titleId = useId();
  const errorId = useId();
  const lockId = useId();

  const remainingMs = lockedUntil - now;
  const isThrottled = remainingMs > 0;

  useEffect(() => {
    if (!isThrottled) return undefined;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [isThrottled]);

  // Focus automatique à l'arrivée et à la fin d'un blocage
  useEffect(() => {
    if (!isThrottled && !busy) inputRef.current?.focus();
  }, [isThrottled, busy]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy || Date.now() < throttle.lockedUntil) return;
    if (!password) { setError('Entre ton mot de passe maître.'); return; }
    setError('');
    setBusy(true);
    try {
      await vaultUnlock(password);
      throttle.failures = 0;
      throttle.lockedUntil = 0;
      toast.success('Coffre-fort déverrouillé');
    } catch (err) {
      setPassword('');
      if (err?.message === WRONG_PASSWORD_MSG) {
        registerFailure();
        setLockedUntil(throttle.lockedUntil);
        setNow(Date.now());
        const left = MAX_ATTEMPTS - (throttle.failures % MAX_ATTEMPTS);
        setError(
          throttle.failures % MAX_ATTEMPTS === 0
            ? 'Trop de tentatives incorrectes.'
            : `${WRONG_PASSWORD_MSG}${throttle.failures >= 3 ? ` Encore ${left} essai${left > 1 ? 's' : ''} avant un blocage temporaire.` : ''}`
        );
      } else {
        setError(err?.message && err.name !== 'OperationError'
          ? err.message
          : 'Impossible de déchiffrer le coffre (données corrompues ?).');
      }
    } finally {
      setBusy(false);
    }
  };

  const seconds = Math.ceil(Math.max(0, remainingMs) / 1000);

  return (
    <VaultScreenShell
      icon={Lock}
      title="Coffre-fort verrouillé"
      titleId={titleId}
      footer={(
        <button
          type="button"
          onClick={onRequestReset}
          className="text-xs text-dim hover:text-red-500 underline underline-offset-2"
        >
          Mot de passe oublié ? Réinitialiser le coffre
        </button>
      )}
    >
      <p className="text-dim mb-6 text-center text-sm">
        Entre ton mot de passe maître pour déchiffrer les données sensibles.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        <PasswordField
          ref={inputRef}
          label="Mot de passe maître"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          describedBy={[error && errorId, isThrottled && lockId].filter(Boolean).join(' ') || undefined}
          invalid={!!error}
          disabled={busy || isThrottled}
        />
        <FormError id={errorId}>{error}</FormError>
        {isThrottled && (
          <p id={lockId} role="status" className="text-amber-500 text-sm">
            Blocage temporaire.{' '}
            <span aria-hidden="true">Réessaie dans {seconds} s.</span>
            <span className="sr-only">Réessaie dans quelques instants.</span>
          </p>
        )}
        <SubmitButton busy={busy} disabled={isThrottled} busyLabel="Déchiffrement…">
          <Unlock size={16} aria-hidden="true" /> Déverrouiller
        </SubmitButton>
      </form>
    </VaultScreenShell>
  );
}
