import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { useStore, ENTRY_TYPES } from '../store';

export default function VaultEntryFormModal({ isOpen, onClose, entry }) {
  const { addVaultEntry, updateVaultEntry } = useStore();
  const [form, setForm] = useState({ type: 'login', label: '', value: '', date: '', notes: '' });

  useEffect(() => {
    if (!isOpen) return;
    if (entry) setForm(entry);
    else setForm({ type: 'login', label: '', value: '', date: '', notes: '' });
  }, [entry, isOpen]);

  const currentType = ENTRY_TYPES.find(t => t.id === form.type);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.label.trim() || !form.value.trim()) return;
    if (entry) updateVaultEntry(entry.id, form);
    else addVaultEntry(form);
    onClose();
  };

  const inputCls = "w-full bg-elevated border border-line rounded-lg px-3 py-2 text-ink focus:outline-none focus:border-red-500";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={entry ? 'Modifier l\'entrée' : 'Nouvelle entrée sécurisée'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs text-dim uppercase font-semibold mb-2 block">Type de donnée</label>
          <div className="grid grid-cols-3 gap-2">
            {ENTRY_TYPES.map(t => (
              <button key={t.id} type="button" onClick={() => setForm({ ...form, type: t.id })}
                className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs transition-colors ${
                  form.type === t.id
                    ? 'bg-red-500/10 border-red-500/50 text-red-500'
                    : 'bg-elevated border-line text-dim hover:border-dim'
                }`}>
                <span className="text-lg">{t.icon}</span>
                <span className="text-center leading-tight">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-dim uppercase font-semibold mb-1 block">
            Libellé * <span className="text-dim normal-case">(ex: Compte Insta BDE)</span>
          </label>
          <input type="text" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
            className={inputCls} placeholder="Compte Insta BDE" required />
        </div>

        <div>
          <label className="text-xs text-dim uppercase font-semibold mb-1 block">
            {currentType?.sensitive ? '🔒 Valeur sensible *' : 'Valeur *'}
          </label>
          {form.type === 'note' ? (
            <textarea value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })}
              className={`${inputCls} min-h-[100px]`} placeholder="Contenu de la note..." required />
          ) : (
            <input type={currentType?.sensitive ? 'password' : 'text'} value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              className={`${inputCls} font-mono`}
              placeholder={currentType?.sensitive ? '••••••••' : 'Valeur...'} required />
          )}
        </div>

        {currentType?.hasDate && (
          <div>
            <label className="text-xs text-dim uppercase font-semibold mb-1 block">Date du rappel</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} />
          </div>
        )}

        <div>
          <label className="text-xs text-dim uppercase font-semibold mb-1 block">Notes additionnelles</label>
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className={`${inputCls} min-h-[60px] text-sm`} placeholder="Contexte, astuces..." />
        </div>

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 bg-elevated hover:bg-line text-ink font-medium py-2.5 rounded-lg transition-colors border border-line">
            Annuler
          </button>
          <button type="submit" className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-lg transition-colors">
            {entry ? 'Enregistrer' : 'Ajouter au coffre'}
          </button>
        </div>
      </form>
    </Modal>
  );
}