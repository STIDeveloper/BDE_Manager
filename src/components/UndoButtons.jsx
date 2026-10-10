import React, { useEffect, useState } from 'react';
import { Undo2, Redo2 } from 'lucide-react';
import { useStore } from '../store';

export default function UndoButtons() {
  const { undo, redo } = useStore();
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    const unsubscribe = useStore.subscribe((state) => {
      setCanUndo(state._history.past.length > 0);
      setCanRedo(state._history.future.length > 0);
    });
    const s = useStore.getState();
    setCanUndo(s._history.past.length > 0);
    setCanRedo(s._history.future.length > 0);
    return unsubscribe;
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  return (
    <div className="flex bg-elevated p-1 rounded-xl">
      <button
        onClick={undo}
        disabled={!canUndo}
        title="Annuler (Ctrl+Z)"
        className={`p-2 rounded-lg transition-all ${
          canUndo ? 'text-ink hover:bg-surface' : 'text-dim/40 cursor-not-allowed'
        }`}>
        <Undo2 size={16} />
      </button>
      <button
        onClick={redo}
        disabled={!canRedo}
        title="Rétablir (Ctrl+Shift+Z)"
        className={`p-2 rounded-lg transition-all ${
          canRedo ? 'text-ink hover:bg-surface' : 'text-dim/40 cursor-not-allowed'
        }`}>
        <Redo2 size={16} />
      </button>
    </div>
  );
}