import { create } from 'zustand';

// ============================================================
// NOTIFICATIONS (toasts)
// ============================================================
// Usage : toast.success(titre, description?, { duration? })
// ⚠️ Le 1er argument est le TITRE (en gras), le 2e la description.
// (Avant, le 1er argument était affiché en petit et le 2e en gras, alors
// que tous les appels passaient (titre, détail) : rendu inversé.)

const DEFAULT_DURATION = { success: 3000, info: 3500, warn: 5000, error: 6000 };
const MAX_TOASTS = 4;

export const useToast = create((set) => ({
  toasts: [],
  push: (toast) => {
    const id = Math.random().toString(36).slice(2);
    const duration = toast.duration || DEFAULT_DURATION[toast.type] || 3000;
    set((s) => ({ toasts: [...s.toasts, { ...toast, duration, id }].slice(-MAX_TOASTS) }));
    // Filet de sécurité (le composant gère l'animation de sortie avant).
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) }));
    }, duration + 500);
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));

const make = (type) => (title, description, options = {}) =>
  useToast.getState().push({ type, title, description, ...options });

export const toast = {
  success: make('success'),
  error: make('error'),
  info: make('info'),
  warn: make('warn'),
};
