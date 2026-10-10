import { useEffect, useId, useRef, useState } from 'react';
import { Eye, EyeOff, Copy, Pencil, Trash2, Check } from 'lucide-react';
import { ENTRY_TYPES } from '../store';
import { toast } from './ui/toastStore';

const AUTO_REMASK_MS = 30_000;

function getEntryType(typeId) {
  return ENTRY_TYPES.find(t => t.id === typeId) || ENTRY_TYPES[ENTRY_TYPES.length - 1];
}

function formatDate(d) {
  if (!d) return null;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

/**
 * Carte d'une entrée du coffre.
 * Les valeurs sensibles sont masquées par défaut, ré-masquées automatiquement
 * après 30 s, et l'état "révélé" disparaît avec la carte (démontage = masquée).
 */
export default function VaultEntryCard({ entry, onEdit, onDelete }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef(null);
  const valueId = useId();

  const type = getEntryType(entry.type);
  const isSensitive = !!type.sensitive;
  const masked = isSensitive && !revealed;
  const label = entry.label || 'Sans titre';
  const value = entry.value ?? '';

  // Ré-masquage automatique après un délai
  useEffect(() => {
    if (!revealed) return undefined;
    const id = setTimeout(() => setRevealed(false), AUTO_REMASK_MS);
    return () => clearTimeout(id);
  }, [revealed]);

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  const copyValue = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API indisponible');
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1500);
      toast.success(
        isSensitive ? 'Pense à vider ton presse-papiers après usage.' : 'Copié dans le presse-papiers',
        isSensitive ? `${label} copié` : undefined
      );
    } catch {
      toast.error('Copie impossible (autorisation du navigateur refusée ?)');
    }
  };

  const reminder = type.hasDate && entry.date ? formatDate(entry.date) : null;

  return (
    <article className="bg-surface border border-line rounded-xl p-4 hover:border-dim transition-colors min-w-0">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-elevated p-2 rounded-lg text-xl shrink-0" aria-hidden="true">{type.icon}</div>
          <div className="min-w-0">
            <h3 className="font-bold text-ink truncate">{label}</h3>
            <span className="text-[10px] uppercase tracking-wider text-dim font-semibold">{type.label}</span>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onEdit(entry)}
            className="text-dim hover:text-blue-500 p-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            aria-label={`Modifier « ${label} »`}
            title="Modifier"
          >
            <Pencil size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(entry)}
            className="text-dim hover:text-red-500 p-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/40"
            aria-label={`Supprimer « ${label} »`}
            title="Supprimer"
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="bg-base border border-line rounded-lg p-2 pl-3 flex items-center gap-1">
        {masked ? (
          <code id={valueId} className="flex-1 text-sm tracking-widest text-dim select-none" aria-label="Valeur masquée">
            ••••••••••••
          </code>
        ) : (
          <code
            id={valueId}
            className={`flex-1 min-w-0 text-sm font-mono text-emerald-600 dark:text-emerald-400 ${
              entry.type === 'note' ? 'whitespace-pre-wrap break-words max-h-40 overflow-y-auto' : 'truncate'
            }`}
            title={entry.type === 'note' ? undefined : value}
          >
            {value}
          </code>
        )}
        {isSensitive && (
          <button
            type="button"
            onClick={() => setRevealed(r => !r)}
            className="text-dim hover:text-ink p-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/40"
            aria-label={revealed ? `Masquer la valeur de « ${label} »` : `Afficher la valeur de « ${label} »`}
            aria-pressed={revealed}
            aria-controls={valueId}
            title={revealed ? 'Masquer' : 'Afficher (30 s)'}
          >
            {revealed ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
          </button>
        )}
        <button
          type="button"
          onClick={copyValue}
          className="text-dim hover:text-ink p-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/40"
          aria-label={`Copier la valeur de « ${label} »`}
          title="Copier"
        >
          {copied ? <Check size={14} className="text-emerald-500" aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        </button>
      </div>

      {reminder && (
        <div className="mt-2 text-xs text-amber-500 flex items-center gap-1">
          <span aria-hidden="true">⏰</span> Rappel : {reminder}
        </div>
      )}

      {entry.notes && <p className="mt-2 text-xs text-dim italic whitespace-pre-wrap break-words">{entry.notes}</p>}
    </article>
  );
}
