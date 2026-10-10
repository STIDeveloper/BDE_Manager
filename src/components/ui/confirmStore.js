import { create } from 'zustand';

// ============================================================
// CONFIRMATIONS — remplace window.confirm (bloquant, non stylable,
// inaccessible sur certains navigateurs mobiles / PWA installée).
// ============================================================
// Usage :
//   if (!(await confirmDialog({ title: 'Supprimer ?', message: '…', tone: 'danger' }))) return;
// Options :
//   title, message (string | ReactNode), details (string[]),
//   confirmLabel, cancelLabel, tone: 'danger' | 'warning' | 'primary',
//   requireWord: mot à taper pour activer le bouton (actions irréversibles).

export const useConfirmStore = create((set, get) => ({
  queue: [],
  _push: (req) => set(s => ({ queue: [...s.queue, req] })),
  _resolve: (id, value) => {
    const req = get().queue.find(r => r.id === id);
    if (!req) return;
    set(s => ({ queue: s.queue.filter(r => r.id !== id) }));
    req.resolve(value);
  },
}));

let seq = 0;

/** @returns {Promise<boolean>} true si l'utilisateur confirme. */
export function confirmDialog(options = {}) {
  return new Promise((resolve) => {
    useConfirmStore.getState()._push({
      id: ++seq,
      title: 'Confirmer',
      confirmLabel: 'Confirmer',
      cancelLabel: 'Annuler',
      tone: 'primary',
      ...options,
      resolve,
    });
  });
}
