// ============================================================
// CLOCHE DE NOTIFICATIONS (en-tête de l'application)
// ============================================================
// Intégration (responsable) : <NotificationBell /> dans l'en-tête, à côté
// de SyncStatusBadge. Panneau accessible : bouton aria-expanded, Échap et
// clic extérieur ferment, focus rendu au bouton.
// ============================================================
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Bell, CheckCheck, Trash2, X, ExternalLink } from 'lucide-react';
import { navigate } from '../core/router.js';
import { useNotificationsStore, markRead, markAllRead, removeNotification, clearNotifications } from './notifications.js';

const selectItems = s => s.items;
const DOT = { info: 'bg-blue-500', success: 'bg-emerald-500', warn: 'bg-amber-500', error: 'bg-rose-500' };

function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'à l\'instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export default function NotificationBell() {
  const items = useNotificationsStore(selectItems);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const btnRef = useRef(null);
  const panelRef = useRef(null);
  const list = useMemo(() => Object.values(items).sort((a, b) => b.at.localeCompare(a.at)), [items]);
  const unread = list.filter(n => !n.read).length;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); } };
    const onDown = (e) => {
      if (panelRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open]);

  const follow = (n) => {
    markRead(n.id);
    if (n.link?.href) { window.open(n.link.href, n.link.href.startsWith('mailto:') ? '_self' : '_blank', 'noopener'); return; }
    if (n.link?.section) { setOpen(false); navigate(n.link.section, ...(n.link.rest || []), ...(n.link.query ? [n.link.query] : [])); }
  };

  return (
    <div className="relative">
      <button ref={btnRef} type="button" className="btn-ghost !px-2 relative" aria-expanded={open} aria-controls={panelId}
        aria-label={unread ? `Notifications (${unread} non lue${unread > 1 ? 's' : ''})` : 'Notifications'} onClick={() => setOpen(o => !o)}>
        <Bell size={18} aria-hidden="true" />
        {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold leading-4 text-center" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div ref={panelRef} id={panelId} role="dialog" aria-label="Notifications"
          className="absolute right-0 mt-2 w-[min(92vw,22rem)] max-h-[70vh] overflow-auto z-50 bg-surface border border-line rounded-2xl shadow-xl">
          <div className="sticky top-0 bg-surface border-b border-line p-2 flex items-center justify-between gap-1">
            <p className="text-sm font-semibold text-ink px-1">Notifications</p>
            <div className="flex gap-1">
              <button type="button" className="btn-ghost !px-2 !py-1 text-xs" disabled={!unread} onClick={markAllRead}><CheckCheck size={14} aria-hidden="true" /> Tout lu</button>
              <button type="button" className="btn-ghost !px-2 !py-1 text-xs" disabled={!list.length} onClick={clearNotifications} aria-label="Effacer toutes les notifications"><Trash2 size={14} aria-hidden="true" /></button>
              <button type="button" className="btn-ghost !px-2 !py-1" aria-label="Fermer" onClick={() => { setOpen(false); btnRef.current?.focus(); }}><X size={14} aria-hidden="true" /></button>
            </div>
          </div>
          {!list.length ? <p className="p-6 text-center text-sm text-dim">Aucune notification.</p> : (
            <ul className="divide-y divide-line">
              {list.slice(0, 50).map(n => (
                <li key={n.id} className={`p-3 flex gap-2 ${n.read ? 'opacity-70' : ''}`}>
                  <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${n.read ? 'bg-line' : DOT[n.level] || DOT.info}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{n.title}{!n.read && <span className="sr-only"> (non lue)</span>}</p>
                    {n.body && <p className="text-xs text-dim">{n.body}</p>}
                    <p className="text-[11px] text-muted">{ago(n.at)}{n.source ? ` · ${n.source}` : ''}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {n.link && <button type="button" className="btn-ghost !px-2 !py-0.5 text-xs" onClick={() => follow(n)}><ExternalLink size={12} aria-hidden="true" /> {n.link.label || 'Ouvrir'}</button>}
                      {!n.read && <button type="button" className="btn-ghost !px-2 !py-0.5 text-xs" onClick={() => markRead(n.id)}>Marquer lu</button>}
                      <button type="button" className="btn-ghost !px-2 !py-0.5 text-xs" aria-label={`Supprimer la notification ${n.title}`} onClick={() => removeNotification(n.id)}><Trash2 size={12} aria-hidden="true" /></button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
