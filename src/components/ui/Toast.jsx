import React, { useEffect, useState } from 'react';
import { Check, AlertTriangle, Info, X } from 'lucide-react';
import { useToast } from './toastStore';

const TYPE_META = {
  success: { icon: Check,          bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-500' },
  error:   { icon: AlertTriangle,  bg: 'bg-red-500/10',     border: 'border-red-500/30',     text: 'text-red-500' },
  warn:    { icon: AlertTriangle,  bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   text: 'text-amber-500' },
  info:    { icon: Info,           bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    text: 'text-blue-500' },
};

function ToastItem({ item }) {
  const { dismiss } = useToast();
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const meta = TYPE_META[item.type] || TYPE_META.info;
  const Icon = meta.icon;

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setLeaving(true);
      setTimeout(() => dismiss(item.id), 200);
    }, (item.duration || 2500) - 200);
    return () => clearTimeout(timer);
  }, [item.id, item.duration, dismiss]);

  const handleClose = () => {
    setLeaving(true);
    setTimeout(() => dismiss(item.id), 200);
  };

  return (
    <div
      className={`flex items-start gap-3 bg-surface border ${meta.border} rounded-xl shadow-2xl p-3 min-w-[280px] max-w-md pointer-events-auto transition-all duration-200 ${
        visible && !leaving ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}
    >
      <div className={`shrink-0 p-1.5 rounded-lg ${meta.bg} border ${meta.border}`}>
        <Icon size={14} className={meta.text} />
      </div>
      <div className="flex-1 min-w-0">
        {item.title && (
          <div className="text-sm font-bold text-ink mb-0.5">{item.title}</div>
        )}
        <div className="text-xs text-dim">{item.message}</div>
      </div>
      <button onClick={handleClose} className="shrink-0 text-dim hover:text-ink p-0.5">
        <X size={12} />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts } = useToast();
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => <ToastItem key={t.id} item={t} />)}
    </div>
  );
}