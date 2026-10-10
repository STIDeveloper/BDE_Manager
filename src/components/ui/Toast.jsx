import { useEffect, useState } from 'react';
import { Check, AlertTriangle, Info, X } from 'lucide-react';
import { useToast } from './toastStore';

const TYPE_META = {
  success: { icon: Check,          bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-500' },
  error:   { icon: AlertTriangle,  bg: 'bg-red-500/10',     border: 'border-red-500/30',     text: 'text-red-500' },
  warn:    { icon: AlertTriangle,  bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   text: 'text-amber-500' },
  info:    { icon: Info,           bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    text: 'text-blue-500' },
};

function ToastItem({ item }) {
  const dismiss = useToast(s => s.dismiss);
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const meta = TYPE_META[item.type] || TYPE_META.info;
  const Icon = meta.icon;

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    let removeTimer;
    const timer = setTimeout(() => {
      setLeaving(true);
      removeTimer = setTimeout(() => dismiss(item.id), 200);
    }, Math.max(500, (item.duration || 3000) - 200));
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); clearTimeout(removeTimer); };
  }, [item.id, item.duration, dismiss]);

  const handleClose = () => {
    setLeaving(true);
    setTimeout(() => dismiss(item.id), 200);
  };

  // Les erreurs sont annoncées immédiatement (role="alert"), le reste poliment
  // via la région live du conteneur.
  return (
    <div
      role={item.type === 'error' ? 'alert' : undefined}
      className={`flex items-start gap-3 bg-surface border ${meta.border} rounded-xl shadow-2xl p-3 w-full md:w-auto md:min-w-[280px] max-w-md pointer-events-auto transition-all duration-200 ${
        visible && !leaving ? 'translate-y-0 opacity-100' : '-translate-y-2 md:translate-y-2 opacity-0'
      }`}
    >
      <div className={`shrink-0 p-1.5 rounded-lg ${meta.bg} border ${meta.border}`} aria-hidden="true">
        <Icon size={14} className={meta.text} />
      </div>
      <div className="flex-1 min-w-0">
        {item.title && <div className="text-sm font-bold text-ink">{item.title}</div>}
        {item.description && <div className="text-xs text-dim mt-0.5 break-words">{item.description}</div>}
      </div>
      <button
        type="button"
        onClick={handleClose}
        aria-label="Fermer la notification"
        className="shrink-0 text-dim hover:text-ink p-1 -m-0.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * Pile de notifications.
 * Placement : en HAUT sur mobile, en BAS À DROITE à partir de md — le
 * bandeau de mise à jour PWA occupe le bas de l'écran (pleine largeur sur
 * mobile, bas-gauche sur desktop) : les deux ne se chevauchent jamais.
 * z-[120] : au-dessus des modales (z-[100]) et du bandeau PWA (z-[110]).
 */
export function ToastContainer() {
  const toasts = useToast(s => s.toasts);
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Notifications"
      className="fixed z-[120] pointer-events-none flex flex-col gap-2
        top-[max(0.75rem,env(safe-area-inset-top))] left-3 right-3 items-center
        md:top-auto md:left-auto md:bottom-4 md:right-4 md:items-end"
    >
      {toasts.map(t => <ToastItem key={t.id} item={t} />)}
    </div>
  );
}
