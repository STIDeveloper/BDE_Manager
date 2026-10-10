import { create } from 'zustand';

export const useToast = create((set) => ({
  toasts: [],
  push: (toast) => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) }));
    }, toast.duration || 2500);
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));

export const toast = {
  success: (message, title) => useToast.getState().push({ type: 'success', message, title }),
  error: (message, title) => useToast.getState().push({ type: 'error', message, title }),
  info: (message, title) => useToast.getState().push({ type: 'info', message, title }),
  warn: (message, title) => useToast.getState().push({ type: 'warn', message, title }),
};
