import { useId, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import Modal from '../../components/Modal.jsx';
import { useCatalog } from '../../core/useCatalog.js';
import { EVENT_TYPES, EVENT_STATUSES } from '../contracts.js';
import { blankEvent, joinIso, splitIso } from './logic.js';
import { useMembers } from './hooks.js';
import { MemberSelect } from './ui.jsx';
import { useFinanceData } from './financeBridge.js';

/**
 * Création / édition de la fiche d'un événement.
 * @param {{ event?: object, onClose: () => void, onSave: (data) => void }} props
 */
export default function EventFormModal({ event, onClose, onSave }) {
  const uid = useId();
  const id = (k) => `${uid}-${k}`;
  const { poleList } = useCatalog();
  const members = useMembers();
  const finance = useFinanceData();
  const init = event || blankEvent();
  const s0 = splitIso(init.start); const e0 = splitIso(init.end);
  const [f, setF] = useState({
    title: init.title || '', description: init.description || '', type: init.type || 'soiree', status: init.status || 'draft',
    startDate: s0.date, startTime: s0.time || '19:00', endDate: e0.date || s0.date, endTime: e0.time || '23:00',
    location: init.location || '', poleId: init.poleId || '', responsibleIds: init.responsibleIds || [],
    capacity: init.capacity ?? '', price: init.price ?? '', budgetId: init.budgetId || '',
  });
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }));

  const budgets = useMemo(() => Object.values(finance.budgets || {})
    .filter(b => !b.eventId || b.eventId === event?.id), [finance.budgets, event?.id]);

  const submit = (e) => {
    e.preventDefault();
    const errs = {};
    if (!f.title.trim()) errs.title = 'Donne un titre à l\'événement.';
    const start = joinIso(f.startDate, f.startTime);
    const end = joinIso(f.endDate || f.startDate, f.endTime || f.startTime);
    if (!start) errs.start = 'Date de début requise.';
    else if (end && new Date(end) < new Date(start)) errs.end = 'La fin doit être après le début.';
    if (f.capacity !== '' && !(Number(f.capacity) >= 1)) errs.capacity = 'Capacité : nombre ≥ 1, ou vide (illimitée).';
    if (f.price !== '' && !(Number(String(f.price).replace(',', '.')) >= 0)) errs.price = 'Prix invalide.';
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.getElementById(id(Object.keys(errs)[0] === 'start' ? 'startDate' : Object.keys(errs)[0] === 'end' ? 'endDate' : Object.keys(errs)[0]))?.focus();
      return;
    }
    onSave({
      title: f.title, description: f.description, type: f.type, status: f.status, start, end: end || start,
      location: f.location, poleId: f.poleId, responsibleIds: f.responsibleIds,
      capacity: f.capacity, price: String(f.price).replace(',', '.'), budgetId: f.budgetId,
    });
  };

  const addResponsible = (mid) => { if (mid && !f.responsibleIds.includes(mid)) setF(p => ({ ...p, responsibleIds: [...p.responsibleIds, mid] })); };
  const err = (k) => errors[k] && <p id={id(`${k}-err`)} className="text-xs text-rose-500 mt-1">{errors[k]}</p>;
  const lbl = 'block text-xs font-medium text-dim mb-1';

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={event ? 'Modifier l\'événement' : 'Nouvel événement'}
      maxWidth="max-w-2xl"
      footer={(
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Annuler</button>
          <button type="submit" form={id('form')} className="btn-primary">{event ? 'Enregistrer' : 'Créer l\'événement'}</button>
        </div>
      )}
    >
      <form id={id('form')} onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3" noValidate>
        <div className="sm:col-span-2">
          <label htmlFor={id('title')} className={lbl}>Titre *</label>
          <input id={id('title')} className="input" value={f.title} onChange={set('title')} data-autofocus
            aria-invalid={!!errors.title} aria-describedby={errors.title ? id('title-err') : undefined} placeholder="Ex. WEI 2026" />
          {err('title')}
        </div>
        <div>
          <label htmlFor={id('type')} className={lbl}>Type</label>
          <select id={id('type')} className="input" value={f.type} onChange={set('type')}>
            {EVENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={id('status')} className={lbl}>Statut</label>
          <select id={id('status')} className="input" value={f.status} onChange={set('status')}>
            {EVENT_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={id('startDate')} className={lbl}>Début *</label>
          <div className="flex gap-2">
            <input id={id('startDate')} type="date" className="input" value={f.startDate} aria-invalid={!!errors.start}
              onChange={(e) => setF(p => ({ ...p, startDate: e.target.value, endDate: !p.endDate || p.endDate < e.target.value ? e.target.value : p.endDate }))} />
            <input type="time" aria-label="Heure de début" className="input w-32" value={f.startTime} onChange={set('startTime')} />
          </div>
          {err('start')}
        </div>
        <div>
          <label htmlFor={id('endDate')} className={lbl}>Fin</label>
          <div className="flex gap-2">
            <input id={id('endDate')} type="date" className="input" value={f.endDate} min={f.startDate} onChange={set('endDate')} aria-invalid={!!errors.end} />
            <input type="time" aria-label="Heure de fin" className="input w-32" value={f.endTime} onChange={set('endTime')} />
          </div>
          {err('end')}
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={id('location')} className={lbl}>Lieu</label>
          <input id={id('location')} className="input" value={f.location} onChange={set('location')} placeholder="Ex. Salle des fêtes, campus…" />
        </div>
        <div>
          <label htmlFor={id('poleId')} className={lbl}>Pôle organisateur</label>
          <select id={id('poleId')} className="input" value={f.poleId} onChange={set('poleId')}>
            <option value="">— Aucun —</option>
            {poleList.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={id('resp')} className={lbl}>Responsables</label>
          <MemberSelect id={id('resp')} value="" members={members.list.filter(m => !f.responsibleIds.includes(m.id))}
            placeholder="+ Ajouter un responsable" onChange={addResponsible} />
          {f.responsibleIds.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 mt-2" aria-label="Responsables choisis">
              {f.responsibleIds.map(mid => (
                <li key={mid} className="chip chip-active">
                  {members.name(mid)}
                  <button type="button" aria-label={`Retirer ${members.name(mid)}`} className="text-dim hover:text-ink"
                    onClick={() => setF(p => ({ ...p, responsibleIds: p.responsibleIds.filter(x => x !== mid) }))}>
                    <X size={12} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <label htmlFor={id('capacity')} className={lbl}>Capacité (places)</label>
          <input id={id('capacity')} type="number" min="1" inputMode="numeric" className="input" value={f.capacity} onChange={set('capacity')}
            placeholder="Illimitée" aria-invalid={!!errors.capacity} />
          {err('capacity')}
        </div>
        <div>
          <label htmlFor={id('price')} className={lbl}>Prix (€)</label>
          <input id={id('price')} inputMode="decimal" className="input" value={f.price} onChange={set('price')} placeholder="Gratuit" aria-invalid={!!errors.price} />
          {err('price')}
        </div>
        {finance.available && (
          <div className="sm:col-span-2">
            <label htmlFor={id('budgetId')} className={lbl}>Budget prévisionnel (trésorerie)</label>
            <select id={id('budgetId')} className="input" value={f.budgetId} onChange={set('budgetId')}>
              <option value="">— Aucun —</option>
              {budgets.map(b => <option key={b.id} value={b.id}>{b.label}{b.year ? ` (${b.year})` : ''}</option>)}
            </select>
          </div>
        )}
        <div className="sm:col-span-2">
          <label htmlFor={id('description')} className={lbl}>Description</label>
          <textarea id={id('description')} rows={4} className="input" value={f.description} onChange={set('description')}
            placeholder="Programme, dress code, infos pratiques…" />
        </div>
      </form>
    </Modal>
  );
}
