import { ArrowRight, CheckCircle2, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import Modal from '../../components/Modal.jsx';
import { confirmDialog } from '../../components/ui/confirmStore.js';
import { toast } from '../../components/ui/toastStore.js';
import { navigate } from '../../core/router.js';
import { useCan } from '../../core/permissions.js';
import { useCalendarStore } from './store.js';
import { categoryOf, SEVERITY_LABELS, SOURCE_LABELS, RECURRENCES } from './agenda.js';
import { dayLabelYear, relativeLabel, timeLabel, SEVERITY_STYLES } from './format.js';
import { resolveLink } from './sources.js';

const SECTION_LABELS = {
  events: 'Ouvrir l\'événement', documents: 'Ouvrir dans le studio documents', handover: 'Préparer la passation',
  kanban: 'Voir les membres', membership: 'Ouvrir les adhésions', finance: 'Ouvrir la trésorerie',
};

export default function ItemDetailModal({ item, today, onClose, onEdit }) {
  const canWrite = useCan('calendar', 'write');
  const reminder = useCalendarStore(s => (item?.reminderId ? s.reminders[item.reminderId] : null));
  const setReminderDone = useCalendarStore(s => s.setReminderDone);
  const deleteReminder = useCalendarStore(s => s.deleteReminder);
  const cat = categoryOf(item.category);
  const link = resolveLink(item);
  const external = link && link.section !== 'calendar';
  const recurring = reminder && reminder.recurrence && reminder.recurrence !== 'none';

  const toggleDone = () => {
    const next = !item.done;
    setReminderDone(item.reminderId, next, item.date);
    toast.success(next ? 'Marqué comme fait' : 'Remis à faire', item.title);
    onClose();
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: 'Supprimer ce rappel ?',
      message: recurring ? `« ${reminder.title} » et toutes ses occurrences seront supprimés.` : `« ${reminder.title} » sera supprimé.`,
      confirmLabel: 'Supprimer', tone: 'danger',
    });
    if (!ok) return;
    deleteReminder(reminder.id);
    toast.success('Rappel supprimé', reminder.title);
    onClose();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={item.title}
      description={SOURCE_LABELS[item.source] || 'Agenda'}
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          {reminder && canWrite && (
            <>
              <button type="button" className="btn-ghost text-red-600 dark:text-red-400 mr-auto" onClick={remove}>
                <Trash2 size={15} aria-hidden="true" /> Supprimer
              </button>
              <button type="button" className="btn-secondary" onClick={() => onEdit(reminder)}>
                <Pencil size={15} aria-hidden="true" /> Modifier
              </button>
              <button type="button" className={item.done ? 'btn-secondary' : 'btn-primary'} onClick={toggleDone}>
                {item.done ? <><RotateCcw size={15} aria-hidden="true" /> Remettre à faire</> : <><CheckCircle2 size={15} aria-hidden="true" /> Marquer fait</>}
              </button>
            </>
          )}
          {external && (
            <button type="button" className="btn-primary" onClick={() => { onClose(); navigate(link.section, link.path); }}>
              {SECTION_LABELS[link.section] || 'Ouvrir'} <ArrowRight size={15} aria-hidden="true" />
            </button>
          )}
          {!reminder && !external && <button type="button" className="btn-secondary" onClick={onClose}>Fermer</button>}
        </div>
      )}
    >
      <dl className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-1.5">
          <span className={`badge ${cat.badge}`}><span className={`h-2 w-2 rounded-full ${cat.dot}`} aria-hidden="true" /> {cat.label}</span>
          <span className={`badge ${SEVERITY_STYLES[item.severity] || 'badge-neutral'}`}>{item.asap ? 'Dès que possible' : SEVERITY_LABELS[item.severity]}</span>
          {item.recurrence && item.recurrence !== 'none' && <span className="badge badge-neutral">{RECURRENCES.find(r => r.id === item.recurrence)?.label}</span>}
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-dim">Quand</dt>
          <dd className="text-ink mt-0.5">
            {item.asap ? 'Dès que possible' : <>
              {dayLabelYear(item.date)}{item.endDate ? ` → ${dayLabelYear(item.endDate)}` : ''}
              {item.time ? ` · ${timeLabel(item.time)}${item.endTime && item.source === 'event' ? ` – ${timeLabel(item.endTime)}` : ''}` : ''}
              <span className="text-dim"> ({relativeLabel(item.date, today)})</span>
            </>}
          </dd>
        </div>
        {item.subtitle && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-dim">{item.source === 'event' ? 'Lieu' : 'Précisions'}</dt>
            <dd className="text-ink mt-0.5">{item.subtitle}</dd>
          </div>
        )}
        {item.notes && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-dim">Notes</dt>
            <dd className="text-ink mt-0.5 whitespace-pre-line">{item.notes}</dd>
          </div>
        )}
        {recurring && item.done && (
          <p className="text-xs text-dim">Seule l'occurrence du {dayLabelYear(item.date)} est marquée comme faite.</p>
        )}
        {!reminder && item.source !== 'event' && (
          <p className="text-xs text-dim">Échéance calculée automatiquement à partir des données de l'application : elle disparaît ou se met à jour quand la source change.</p>
        )}
      </dl>
    </Modal>
  );
}
