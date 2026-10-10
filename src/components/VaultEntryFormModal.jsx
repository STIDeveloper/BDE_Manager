import { useId, useRef, useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useStore, ENTRY_TYPES } from '../store';
import { toast } from './ui/toastStore';
import VaultDialog from './vault/VaultDialog';

const EMPTY_FORM = { type: 'login', label: '', value: '', date: '', notes: '' };

/**
 * Formulaire d'ajout / édition d'une entrée du coffre.
 * Le contenu est remonté à chaque ouverture (état initial frais, aucune donnée
 * sensible conservée entre deux ouvertures).
 */
export default function VaultEntryFormModal({ isOpen, onClose, entry }) {
  if (!isOpen) return null;
  return <EntryForm key={entry?.id ?? 'new'} onClose={onClose} entry={entry} />;
}

function EntryForm({ onClose, entry }) {
  const addVaultEntry = useStore(s => s.addVaultEntry);
  const updateVaultEntry = useStore(s => s.updateVaultEntry);

  // Compatibilité avec les anciennes entrées (champs manquants → chaînes vides)
  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    ...(entry ? {
      type: entry.type || 'other',
      label: entry.label ?? '',
      value: entry.value ?? '',
      date: entry.date ?? '',
      notes: entry.notes ?? '',
    } : {}),
  }));
  const [showValue, setShowValue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const labelRef = useRef(null);

  const ids = {
    type: useId(), label: useId(), value: useId(), date: useId(), notes: useId(), error: useId(),
  };

  const currentType = ENTRY_TYPES.find(t => t.id === form.type);
  const isSensitive = !!currentType?.sensitive;
  const update = (patch) => setForm(f => ({ ...f, ...patch }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!form.label.trim() || !form.value.trim()) {
      setError('Le libellé et la valeur sont obligatoires.');
      return;
    }
    setError('');
    setSaving(true);
    const payload = {
      type: form.type,
      label: form.label.trim(),
      value: form.value,
      date: currentType?.hasDate ? form.date : '',
      notes: form.notes,
    };
    try {
      if (entry) {
        await updateVaultEntry(entry.id, { ...payload, updatedAt: Date.now() });
        toast.success('Entrée mise à jour', payload.label);
      } else {
        await addVaultEntry(payload);
        toast.success('Entrée ajoutée au coffre', payload.label);
      }
      onClose();
    } catch (err) {
      setError(err?.message || 'Enregistrement impossible.');
      toast.error(err?.message || 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full bg-elevated border border-line rounded-lg px-3 py-2 text-ink focus:outline-none focus:border-red-500';
  const labelCls = 'text-xs text-dim uppercase font-semibold mb-1 block';

  return (
    <VaultDialog
      isOpen
      onClose={onClose}
      closeDisabled={saving}
      initialFocusRef={labelRef}
      title={entry ? 'Modifier l\'entrée' : 'Nouvelle entrée sécurisée'}
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <fieldset>
          <legend id={ids.type} className="text-xs text-dim uppercase font-semibold mb-2 block">Type de donnée</legend>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ENTRY_TYPES.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => update({ type: t.id })}
                aria-pressed={form.type === t.id}
                className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/40 ${
                  form.type === t.id
                    ? 'bg-red-500/10 border-red-500/50 text-red-500'
                    : 'bg-elevated border-line text-dim hover:border-dim'
                }`}
              >
                <span className="text-lg" aria-hidden="true">{t.icon}</span>
                <span className="text-center leading-tight">{t.label}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor={ids.label} className={labelCls}>
            Libellé * <span className="text-dim normal-case">(ex: Compte Insta BDE)</span>
          </label>
          <input
            id={ids.label}
            ref={labelRef}
            type="text"
            value={form.label}
            onChange={(e) => update({ label: e.target.value })}
            className={inputCls}
            placeholder="Compte Insta BDE"
            autoComplete="off"
            required
            aria-required="true"
          />
        </div>

        <div>
          <label htmlFor={ids.value} className={labelCls}>
            {isSensitive ? '🔒 Valeur sensible *' : 'Valeur *'}
          </label>
          {form.type === 'note' ? (
            <textarea
              id={ids.value}
              value={form.value}
              onChange={(e) => update({ value: e.target.value })}
              className={`${inputCls} min-h-[100px]`}
              placeholder="Contenu de la note..."
              required
              aria-required="true"
            />
          ) : (
            <div className="relative">
              <input
                id={ids.value}
                type={isSensitive && !showValue ? 'password' : 'text'}
                value={form.value}
                onChange={(e) => update({ value: e.target.value })}
                className={`${inputCls} font-mono ${isSensitive ? 'pr-11' : ''}`}
                placeholder={isSensitive ? '••••••••' : 'Valeur...'}
                autoComplete={isSensitive ? 'new-password' : 'off'}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                required
                aria-required="true"
              />
              {isSensitive && (
                <button
                  type="button"
                  onClick={() => setShowValue(v => !v)}
                  aria-label={showValue ? 'Masquer la valeur' : 'Afficher la valeur'}
                  aria-pressed={showValue}
                  aria-controls={ids.value}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 text-dim hover:text-ink rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/40"
                >
                  {showValue ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                </button>
              )}
            </div>
          )}
        </div>

        {currentType?.hasDate && (
          <div>
            <label htmlFor={ids.date} className={labelCls}>Date du rappel</label>
            <input
              id={ids.date}
              type="date"
              value={form.date}
              onChange={(e) => update({ date: e.target.value })}
              className={inputCls}
            />
          </div>
        )}

        <div>
          <label htmlFor={ids.notes} className={labelCls}>Notes additionnelles</label>
          <textarea
            id={ids.notes}
            value={form.notes}
            onChange={(e) => update({ notes: e.target.value })}
            className={`${inputCls} min-h-[60px] text-sm`}
            placeholder="Contexte, astuces..."
          />
        </div>

        {error && <p id={ids.error} role="alert" className="text-red-500 text-sm">{error}</p>}

        <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 bg-elevated hover:bg-line text-ink font-medium py-2.5 rounded-lg transition-colors border border-line disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={saving}
            aria-busy={saving}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-lg transition-colors disabled:opacity-60"
          >
            {saving && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {entry ? 'Enregistrer' : 'Ajouter au coffre'}
          </button>
        </div>
      </form>
    </VaultDialog>
  );
}
