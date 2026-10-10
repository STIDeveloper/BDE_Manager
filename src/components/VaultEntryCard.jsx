import React, { useState } from 'react';
import { Eye, EyeOff, Copy, Pencil, Trash2, Check } from 'lucide-react';
import { ENTRY_TYPES, useStore } from '../store';
import { toast } from './ui/toastStore';

export default function VaultEntryCard({ entry, onEdit }) {
  const { deleteVaultEntry } = useStore();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const type = ENTRY_TYPES.find(t => t.id === entry.type) || ENTRY_TYPES[ENTRY_TYPES.length - 1];
  const isSensitive = type.sensitive;

  const copyValue = async () => {
    try {
      await navigator.clipboard.writeText(entry.value);
      setCopied(true);
      toast.success('Copié dans le presse-papiers');
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      toast.error('Copie impossible');
    }
  };

  const handleDelete = () => {
    if (window.confirm(`Supprimer "${entry.label}" du coffre-fort ?`)) {
      deleteVaultEntry(entry.id);
      toast.info('Entrée supprimée', entry.label);
    }
  };

  const formatDate = (d) => {
    if (!d) return null;
    try {
      return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    } catch { return d; }
  };

  return (
    <div className="bg-surface border border-line rounded-xl p-4 hover:border-dim transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="bg-elevated p-2 rounded-lg text-xl">{type.icon}</div>
          <div>
            <h3 className="font-bold text-ink">{entry.label}</h3>
            <span className="text-[10px] uppercase tracking-wider text-dim font-semibold">{type.label}</span>
          </div>
        </div>
        <div className="flex gap-1">
          <button onClick={() => onEdit(entry)} className="text-dim hover:text-blue-500 p-1.5 transition-colors" title="Modifier">
            <Pencil size={14} />
          </button>
          <button onClick={handleDelete} className="text-dim hover:text-red-500 p-1.5 transition-colors" title="Supprimer">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="bg-base border border-line rounded-lg p-3 flex items-center gap-2">
        <code className={`flex-1 text-sm truncate ${isSensitive && !revealed ? 'tracking-widest text-dim' : 'text-emerald-600 dark:text-emerald-400 font-mono'}`}>
          {isSensitive && !revealed ? '••••••••••••' : entry.value}
        </code>
        {isSensitive && (
          <button onClick={() => setRevealed(!revealed)} className="text-dim hover:text-ink p-1 transition-colors">
            {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
        <button onClick={copyValue} className="text-dim hover:text-ink p-1 transition-colors">
          {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
        </button>
      </div>

      {type.hasDate && entry.date && (
        <div className="mt-2 text-xs text-amber-500 flex items-center gap-1">⏰ Rappel : {formatDate(entry.date)}</div>
      )}

      {entry.notes && <p className="mt-2 text-xs text-dim italic">{entry.notes}</p>}
    </div>
  );
}
