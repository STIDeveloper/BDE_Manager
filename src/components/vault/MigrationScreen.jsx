import { useId, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useStore, hashPassword } from '../../store';
import { toast } from '../ui/toastStore';
import { PasswordField, PasswordStrengthMeter } from './PasswordField';
import { VaultScreenShell, SubmitButton, FormError } from './VaultScreenShell';
import { validateNewPassword } from './passwordStrength';

/** S'assure que chaque ancienne entrée a un id (compatibilité avec les cartes / l'édition). */
function normalizeLegacyEntries(entries) {
  return (entries || [])
    .filter(e => e && typeof e === 'object')
    .map(e => ({
      ...e,
      id: e.id ?? crypto.randomUUID(),
      type: e.type || 'other',
      label: e.label ?? '',
      value: e.value ?? '',
    }));
}

/**
 * Écran de migration : les anciennes entrées (avant v10) étaient stockées en clair
 * dans le navigateur. On les chiffre avec un nouveau mot de passe maître.
 * Si l'ancien hash existe, on vérifie l'ancien mot de passe avant de migrer.
 */
export default function MigrationScreen({ onRequestDiscard }) {
  const legacyHash = useStore(s => s._legacyMasterHash);
  const legacyEntries = useStore(s => s._legacyVaultEntries);
  const vaultMigrateFromLegacy = useStore(s => s.vaultMigrateFromLegacy);

  const [oldPassword, setOldPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const errorId = useId();
  const strengthId = useId();

  const count = Array.isArray(legacyEntries) ? legacyEntries.length : 0;
  const needsOldPassword = !!legacyHash;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (needsOldPassword && !oldPassword) { setError('Entre ton ancien mot de passe maître.'); return; }
    const msg = validateNewPassword(password, confirm);
    if (msg) { setError(msg); return; }
    setError('');
    setBusy(true);
    try {
      if (needsOldPassword) {
        const oldHash = await hashPassword(oldPassword);
        if (oldHash !== legacyHash) {
          setOldPassword('');
          setError('Ancien mot de passe incorrect.');
          return;
        }
      }
      await vaultMigrateFromLegacy(password, normalizeLegacyEntries(legacyEntries));
      setOldPassword(''); setPassword(''); setConfirm('');
      toast.success(`${count} entrée${count > 1 ? 's' : ''} chiffrée${count > 1 ? 's' : ''}. Les données en clair ont été supprimées.`, 'Migration terminée');
    } catch (err) {
      setError(err?.message || 'La migration a échoué.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <VaultScreenShell
      icon={ShieldAlert}
      tone="amber"
      wide
      title="Mise à niveau du coffre-fort"
      titleId={titleId}
      footer={(
        <button
          type="button"
          onClick={onRequestDiscard}
          className="text-xs text-dim hover:text-red-500 underline underline-offset-2"
        >
          {needsOldPassword
            ? 'Je n\'ai plus l\'ancien mot de passe → supprimer les anciennes entrées'
            : 'Je ne veux pas garder ces entrées → les supprimer'}
        </button>
      )}
    >
      <div className="text-sm text-dim mb-6 space-y-2">
        <p className="text-center">
          Ton coffre contient <strong className="text-ink">{count} ancienne{count > 1 ? 's' : ''} entrée{count > 1 ? 's' : ''}</strong>{' '}
          enregistrée{count > 1 ? 's' : ''} <strong className="text-amber-500">sans chiffrement</strong> dans ce navigateur.
        </p>
        <p className="text-center">
          {needsOldPassword
            ? 'Confirme ton ancien mot de passe maître, puis choisis le mot de passe qui chiffrera désormais le coffre (il peut être identique).'
            : 'Choisis le mot de passe maître qui chiffrera désormais ces entrées.'}
          {' '}Les copies en clair seront ensuite effacées.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        {needsOldPassword && (
          <PasswordField
            label="Ancien mot de passe maître"
            value={oldPassword}
            onChange={setOldPassword}
            autoComplete="current-password"
            describedBy={error ? errorId : undefined}
            invalid={!!error}
            disabled={busy}
          />
        )}
        <PasswordField
          label="Nouveau mot de passe maître"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          describedBy={`${strengthId} ${error ? errorId : ''}`.trim()}
          disabled={busy}
        />
        <PasswordStrengthMeter password={password} id={strengthId} />
        <PasswordField
          label="Confirmer le nouveau mot de passe"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          describedBy={error ? errorId : undefined}
          disabled={busy}
        />
        <FormError id={errorId}>{error}</FormError>
        <SubmitButton busy={busy} busyLabel="Chiffrement en cours…">Chiffrer mes entrées</SubmitButton>
      </form>
    </VaultScreenShell>
  );
}
