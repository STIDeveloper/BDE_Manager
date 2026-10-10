import { useEffect } from 'react';
import { Undo2, Redo2 } from 'lucide-react';
import { useStore } from '../store';
import { isTypingTarget, undoShortcutAction } from './members/shortcuts';

export default function UndoButtons() {
  const undo = useStore(s => s.undo);
  const redo = useStore(s => s.redo);
  // Sélecteurs atomiques (booléens) : re-rendu uniquement quand ils changent.
  const canUndo = useStore(s => s._history.past.length > 0);
  const canRedo = useStore(s => s._history.future.length > 0);

  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented) return;
      const action = undoShortcutAction(e);
      if (!action) return;
      // Dans un champ, Ctrl+Z annule la frappe (comportement natif).
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      if (action === 'undo') undo();
      else redo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const btn = (enabled) => `p-2 rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
    enabled ? 'text-ink hover:bg-surface' : 'text-dim/40 cursor-not-allowed'
  }`;

  return (
    <div className="flex bg-elevated p-1 rounded-xl" role="group" aria-label="Historique des modifications">
      <button
        type="button"
        onClick={undo}
        disabled={!canUndo}
        aria-label="Annuler la dernière action"
        aria-keyshortcuts="Control+Z Meta+Z"
        title="Annuler (Ctrl+Z)"
        className={btn(canUndo)}>
        <Undo2 size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={redo}
        disabled={!canRedo}
        aria-label="Rétablir l'action annulée"
        aria-keyshortcuts="Control+Shift+Z Control+Y Meta+Shift+Z"
        title="Rétablir (Ctrl+Maj+Z ou Ctrl+Y)"
        className={btn(canRedo)}>
        <Redo2 size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
