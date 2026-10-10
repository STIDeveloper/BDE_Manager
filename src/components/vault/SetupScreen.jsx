import { useId, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useStore } from '../../store';
import { toast } from '../ui/toastStore';
import { PasswordField, PasswordStrengthMeter } from './PasswordField';
import { VaultScreenShell, SubmitButton, FormError } from './VaultScreenShell';
import { validateNewPassword } from './passwordStrength';

/** Écran 1 : création d'un nouveau coffre chiffré. */
export default function SetupScreen() {
  const vaultSetup = useStore(s => s.vaultSetup);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const errorId = useId();
  const strengthId = useId();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const msg = validateNewPassword(password, confirm);
    if (msg) { setError(msg); return; }
    setError('');
    setBusy(true);
    try {
      await vaultSetup(password);
      setPassword(''); setConfirm('');
      toast.success('Tes données sont chiffrées avec ton mot de passe maître.', 'Coffre-fort créé');
    } catch (err) {
      setError(err?.message || 'Impossible de créer le coffre-fort.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <VaultScreenShell icon={ShieldCheck} title="Créer le coffre-fort" titleId={titleId}>
      <p className="text-dim mb-6 text-center text-sm">
        Choisis un mot de passe maître. Toutes les entrées seront chiffrées (AES-256) avec une clé dérivée de ce mot de passe.<br />
        <span className="text-amber-500">⚠️ Aucun moyen de le récupérer s'il est perdu.</span>
      </p>
      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        <PasswordField
          label="Mot de passe maître"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          describedBy={`${strengthId} ${error ? errorId : ''}`.trim()}
          invalid={!!error}
          disabled={busy}
        />
        <PasswordStrengthMeter password={password} id={strengthId} />
        <PasswordField
          label="Confirmer le mot de passe"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          describedBy={error ? errorId : undefined}
          invalid={!!error}
          disabled={busy}
        />
        <FormError id={errorId}>{error}</FormError>
        <SubmitButton busy={busy} busyLabel="Chiffrement en cours…">Créer le coffre-fort</SubmitButton>
      </form>
    </VaultScreenShell>
  );
}
