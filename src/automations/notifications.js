// ============================================================
// CENTRE DE NOTIFICATIONS (léger, local à l'appareil)
// ============================================================
// items : { [id]: { id, at, title, body?, level: 'info'|'success'|'warn'|'error',
//           link?: { section, rest?, query?, href?, label? }, source?, read, dedupeKey? } }
// API hors React : notify({...}), markRead(id), markAllRead(), removeNotification(id),
// clearNotifications(). Composant : NotificationBell.jsx.
// Tranches de synchronisation : aucune (notifications propres à l'appareil).
// ============================================================

import { createModuleStore, newId, nowIso } from '../core/createModuleStore.js';

export const MAX_NOTIFICATIONS = 200;
const LEVELS = ['info', 'success', 'warn', 'error'];

export const useNotificationsStore = createModuleStore({
  name: 'notifications',
  label: 'Notifications',
  version: 1,
  initialState: { items: {} },
  slices: [],
  actions: (set, get) => ({
    push: (input) => {
      const items = get().items;
      if (input.dedupeKey) {
        const dup = Object.values(items).find(n => n.dedupeKey === input.dedupeKey);
        if (dup) return dup;
      }
      const n = {
        id: newId(), at: nowIso(), read: false,
        title: String(input.title || 'Notification').slice(0, 200),
        ...(input.body ? { body: String(input.body).slice(0, 1000) } : {}),
        level: LEVELS.includes(input.level) ? input.level : 'info',
        ...(input.link ? { link: input.link } : {}),
        ...(input.source ? { source: String(input.source).slice(0, 120) } : {}),
        ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
      };
      set(s => {
        let next = { ...s.items, [n.id]: n };
        const list = Object.values(next);
        if (list.length > MAX_NOTIFICATIONS) {
          const keep = new Set(list.sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX_NOTIFICATIONS).map(x => x.id));
          next = Object.fromEntries(Object.entries(next).filter(([k]) => keep.has(k)));
        }
        return { items: next };
      });
      return n;
    },
    markRead: (id) => set(s => (s.items[id] && !s.items[id].read ? { items: { ...s.items, [id]: { ...s.items[id], read: true } } } : {})),
    markAllRead: () => set(s => ({ items: Object.fromEntries(Object.entries(s.items).map(([k, v]) => [k, v.read ? v : { ...v, read: true }])) })),
    remove: (id) => set(s => {
      if (!s.items[id]) return {};
      const { [id]: _gone, ...items } = s.items;
      return { items };
    }),
    clear: () => set({ items: {} }),
  }),
});

const st = () => useNotificationsStore.getState();
export const notify = (input) => st().push(input || {});
export const markRead = (id) => st().markRead(id);
export const markAllRead = () => st().markAllRead();
export const removeNotification = (id) => st().remove(id);
export const clearNotifications = () => st().clear();
