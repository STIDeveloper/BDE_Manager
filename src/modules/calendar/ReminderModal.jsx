import { useId, useState } from 'react';
import Modal from '../../components/Modal.jsx';
import { toast } from '../../components/ui/toastStore.js';
import { useCalendarStore } from './store.js';
import { CATEGORIES, RECURRENCES } from './agenda.js';

/**
 * Création / édition d'un rappel personnalisé.
 * Monté uniquement quand il est ouvert (état initial = rappel édité).
 */
export default function ReminderModal({ reminder, defaultDate, onClose }) {
  const addReminder = useCalendarStore(s => s.addReminder);
  const updateReminder = useCalendarStore(s => s.updateReminder);
  const [form, setForm] = useState(() => ({
    title: reminder?.title || '',
    date: reminder?.date || defaultDate,
    time: reminder?.time || '',
    recurrence: reminder?.recurrence || 'none',
    category: reminder?.category || 'autre',
    notes: reminder?.notes || '',
  }));
  const [error, setError] = useState('');
  const uid = useId();
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    try {
      if (reminder) {
        updateReminder(reminder.id, form);
        toast.success('Rappel mis à jour', form.title);
      } else {
        addReminder(form);
        toast.success('Rappel créé', form.title);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Enregistrement impossible.');
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={reminder ? 'Modifier le rappel' : 'Nouveau rappel'}
      footer={(
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Annuler</button>
          <button type="submit" form={`${uid}-form`} className="btn-primary">{reminder ? 'Enregistrer' : 'Créer le rappel'}</button>
        </div>
      )}
    >
      <form id={`${uid}-form`} onSubmit={submit} className="space-y-3" noValidate>
        <div>
          <label htmlFor={`${uid}-title`} className="block text-sm font-medium text-ink mb-1">Titre</label>
          <input id={`${uid}-title`} data-autofocus className="input w-full" value={form.title} onChange={set('title')} maxLength={200} required placeholder="Ex. Déposer les chèques à la banque" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${uid}-date`} className="block text-sm font-medium text-ink mb-1">Date</label>
            <input id={`${uid}-date`} type="date" className="input w-full" value={form.date} onChange={set('date')} required />
          </div>
          <div>
            <label htmlFor={`${uid}-time`} className="block text-sm font-medium text-ink mb-1">Heure <span className="text-dim font-normal">(facultatif)</span></label>
            <input id={`${uid}-time`} type="time" className="input w-full" value={form.time} onChange={set('time')} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${uid}-rec`} className="block text-sm font-medium text-ink mb-1">Récurrence</label>
            <select id={`${uid}-rec`} className="input w-full" value={form.recurrence} onChange={set('recurrence')}>
              {RECURRENCES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${uid}-cat`} className="block text-sm font-medium text-ink mb-1">Catégorie</label>
            <select id={`${uid}-cat`} className="input w-full" value={form.category} onChange={set('category')}>
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor={`${uid}-notes`} className="block text-sm font-medium text-ink mb-1">Notes</label>
          <textarea id={`${uid}-notes`} className="input w-full min-h-[80px]" value={form.notes} onChange={set('notes')} maxLength={4000} />
        </div>
        {reminder && form.recurrence !== reminder.recurrence && (reminder.doneDates || []).length > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">Changer la récurrence remet à zéro les occurrences déjà cochées.</p>
        )}
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </form>
    </Modal>
  );
}
