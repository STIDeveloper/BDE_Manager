import { useId, useRef, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import VaultDialog from './VaultDialog';

/**
 * Dialogue de confirmation d'une action destructive.
 * - `confirmWord` (ex: "SUPPRIMER") : l'utilisateur doit le taper pour activer le bouton.
 *   Passe `confirmWord={null}` pour une simple confirmation.
 * - `onConfirm` peut être async : le dialogue affiche un état de chargement
 *   et reste ouvert si la promesse est rejetée (le parent gère l'erreur/toast).
 */
export default function TypeToConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  children,
  confirmWord = 'SUPPRIMER',
  confirmLabel = 'Supprimer définitivement',
}) {
  if (!isOpen) return null;
  return (
    <DialogBody
      onClose={onClose}
      onConfirm={onConfirm}
      title={title}
      description={description}
      confirmWord={confirmWord}
      confirmLabel={confirmLabel}
    >
      {children}
    </DialogBody>
  );
}

function DialogBody({ onClose, onConfirm, title, description, children, confirmWord, confirmLabel }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const cancelRef = useRef(null);
  const inputId = useId();
  const hintId = useId();

  const matches = !confirmWord || typed.trim() === confirmWord;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!matches || busy) return;
    setBusy(true);
    try {
      await onConfirm?.();
    } catch {
      // L'appelant affiche l'erreur ; on laisse le dialogue ouvert
    } finally {
      setBusy(false);
    }
  };

  return (
    <VaultDialog
      isOpen
      onClose={onClose}
      title={title}
      description={description}
      maxWidth="max-w-md"
      closeDisabled={busy}
      initialFocusRef={confirmWord ? inputRef : cancelRef}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-3 items-start bg-red-500/10 border border-red-500/30 rounded-xl p-3">
          <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-sm text-ink space-y-2">{children}</div>
        </div>

        {confirmWord && (
          <div>
            <label htmlFor={inputId} className="text-xs text-dim uppercase font-semibold mb-1 block">
              Tape <span className="font-mono text-red-500 normal-case">{confirmWord}</span> pour confirmer
            </label>
            <input
              id={inputId}
              ref={inputRef}
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-describedby={hintId}
              aria-invalid={typed.length > 0 && !matches}
              className="w-full bg-elevated border border-line rounded-lg px-3 py-2 text-ink font-mono focus:outline-none focus:border-red-500"
            />
            <p id={hintId} className="sr-only">
              Le bouton de confirmation reste désactivé tant que le mot exact n'est pas saisi.
            </p>
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 bg-elevated hover:bg-line text-ink font-medium py-2.5 rounded-lg transition-colors border border-line disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={!matches || busy}
            aria-busy={busy}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </button>
        </div>
      </form>
    </VaultDialog>
  );
}
