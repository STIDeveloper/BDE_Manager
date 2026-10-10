// Saisie / modification d'une opération (recette ou dépense) avec justificatifs.
import { useId, useMemo, useRef, useState } from 'react';
import { Camera, Paperclip, Trash2, FileText, Loader2, ExternalLink } from 'lucide-react';
import Modal from '../../components/Modal.jsx';
import { toast } from '../../components/ui/toastStore.js';
import { PAYMENT_METHODS } from '../contracts.js';
import { isoDate } from '../../documents/context.js';
import { saveAttachment, deleteAttachment, openAttachment } from '../../core/attachments.js';
import { useFinanceStore } from './store.js';
import { parseMoney } from './csv.js';
import { useEventOptions, useRealMembers, memberName, currentUserName, labelCls, eventsModuleAvailable } from './hooks.js';

const blank = (type = 'expense') => ({
  type, amount: '', date: isoDate(), label: '', categoryId: '', method: 'carte',
  eventId: '', memberId: '', counterparty: '', reference: '', notes: '', attachments: [],
});

/**
 * @param {{ open, onClose, initial?: object, canValidate: boolean }} props
 * initial : opération existante (édition) ou valeurs de départ (nouvelle).
 */
export default function TransactionForm({ open, onClose, initial, canValidate }) {
  const [form, setForm] = useState(() => ({ ...blank(initial?.type), ...(initial || {}), amount: initial?.amount ? String(initial.amount).replace('.', ',') : '' }));
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const addedRef = useRef([]); // justificatifs envoyés pendant cette saisie (nettoyés si annulation)
  const categories = useFinanceStore(s => s.categories);
  const addTransaction = useFinanceStore(s => s.addTransaction);
  const updateTransaction = useFinanceStore(s => s.updateTransaction);
  const events = useEventOptions();
  const members = useRealMembers();
  const uid = useId();
  const ids = Object.fromEntries(['type', 'amount', 'date', 'label', 'cat', 'method', 'event', 'member', 'cp', 'ref', 'notes', 'file', 'cam'].map(k => [k, `${uid}-${k}`]));
  const editing = !!initial?.id;

  const catOptions = useMemo(() => Object.values(categories)
    .filter(c => c.type === 'both' || c.type === form.type)
    .sort((a, b) => a.label.localeCompare(b.label, 'fr')), [categories, form.type]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const close = async () => {
    // Saisie abandonnée : on supprime les fichiers envoyés pour rien.
    await Promise.all(addedRef.current.map(a => deleteAttachment(a.id)));
    addedRef.current = [];
    onClose();
  };

  const onFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const metas = [];
      for (const f of files) {
        if (!/^image\/|^application\/pdf$/.test(f.type)) { toast.warn('Format ignoré', `${f.name} : photo ou PDF uniquement.`); continue; }
        const meta = await saveAttachment(f, { scope: 'finance' });
        metas.push(meta);
      }
      addedRef.current.push(...metas);
      setForm(fm => ({ ...fm, attachments: [...fm.attachments, ...metas] }));
      if (metas.length) toast.success('Justificatif ajouté', metas.map(m => m.name).join(', '));
    } catch (e) {
      toast.error('Envoi impossible', e.message);
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = async (meta) => {
    setForm(f => ({ ...f, attachments: f.attachments.filter(a => a.id !== meta.id) }));
    // Fichier ajouté pendant cette saisie : suppression immédiate ; sinon à l'enregistrement.
    if (addedRef.current.some(a => a.id === meta.id)) {
      addedRef.current = addedRef.current.filter(a => a.id !== meta.id);
      await deleteAttachment(meta.id);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    const amount = parseMoney(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) { setError('Montant invalide : saisis un nombre positif (ex. 12,50).'); return; }
    if (!form.label.trim()) { setError('Le libellé est obligatoire.'); return; }
    if (!form.date) { setError('La date est obligatoire.'); return; }
    const record = {
      type: form.type, amount, date: form.date, label: form.label.trim(),
      categoryId: form.categoryId || 'autre', method: form.method,
      eventId: form.eventId || undefined, memberId: form.memberId || undefined,
      counterparty: form.counterparty.trim(), reference: form.reference.trim(), notes: form.notes.trim(),
      attachments: form.attachments,
    };
    if (editing) {
      // Fichiers retirés d'une opération existante : suppression définitive.
      const kept = new Set(form.attachments.map(a => a.id));
      (initial.attachments || []).filter(a => !kept.has(a.id)).forEach(a => deleteAttachment(a.id));
      // Une opération validée modifiée par une personne sans droit de validation repasse en attente.
      const status = initial.status === 'validated' && !canValidate ? 'pending' : initial.status;
      updateTransaction(initial.id, { ...record, status });
      toast.success('Opération modifiée', record.label);
    } else {
      const status = record.type === 'expense' ? 'pending' : (canValidate ? 'validated' : 'pending');
      addTransaction({ ...record, status, createdBy: currentUserName(), ...(status === 'validated' ? { validatedBy: currentUserName(), validatedAt: new Date().toISOString() } : {}) });
      toast.success(record.type === 'expense' ? 'Dépense enregistrée' : 'Recette enregistrée', status === 'pending' ? 'En attente de validation par la trésorerie.' : record.label);
    }
    addedRef.current = [];
    onClose();
  };

  return (
    <Modal
      isOpen={open}
      onClose={close}
      title={editing ? 'Modifier l\'opération' : 'Nouvelle opération'}
      description={!editing && form.type === 'expense' ? 'Une dépense saisie reste « en attente » jusqu\'à sa validation par la trésorerie.' : undefined}
      maxWidth="max-w-2xl"
      footer={(
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={close}>Annuler</button>
          <button type="submit" form={`${uid}-form`} className="btn-primary" disabled={uploading}>{editing ? 'Enregistrer' : 'Ajouter'}</button>
        </div>
      )}
    >
      <form id={`${uid}-form`} onSubmit={submit} className="space-y-3" noValidate>
        <fieldset>
          <legend className={labelCls}>Type</legend>
          <div className="grid grid-cols-2 gap-2">
            {[['expense', 'Dépense'], ['income', 'Recette']].map(([v, l]) => (
              <label key={v} className={`chip justify-center py-2 ${form.type === v ? 'chip-active' : 'chip-idle'} has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500/60`}>
                <input type="radio" name={ids.type} value={v} checked={form.type === v} onChange={() => setForm(f => ({ ...f, type: v, categoryId: categories[f.categoryId]?.type === 'both' ? f.categoryId : '' }))} className="sr-only" />
                {l}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor={ids.amount} className={labelCls}>Montant (€) *</label>
            <input id={ids.amount} data-autofocus className="input tabular-nums" inputMode="decimal" placeholder="12,50" value={form.amount} onChange={e => set('amount', e.target.value)} required />
          </div>
          <div>
            <label htmlFor={ids.date} className={labelCls}>Date *</label>
            <input id={ids.date} type="date" className="input" value={form.date} onChange={e => set('date', e.target.value)} required />
          </div>
          <div>
            <label htmlFor={ids.method} className={labelCls}>Moyen</label>
            <select id={ids.method} className="input" value={form.method} onChange={e => set('method', e.target.value)}>
              {PAYMENT_METHODS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor={ids.label} className={labelCls}>Libellé *</label>
          <input id={ids.label} className="input" placeholder={form.type === 'expense' ? 'Courses soirée d\'intégration' : 'Billetterie gala'} value={form.label} onChange={e => set('label', e.target.value)} required />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={ids.cat} className={labelCls}>Catégorie</label>
            <select id={ids.cat} className="input" value={form.categoryId} onChange={e => set('categoryId', e.target.value)}>
              <option value="">— Choisir (Autre par défaut) —</option>
              {catOptions.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={ids.event} className={labelCls}>Événement lié</label>
            <select id={ids.event} className="input" value={form.eventId} onChange={e => set('eventId', e.target.value)} disabled={!events.length}>
              <option value="">{events.length ? 'Aucun' : (eventsModuleAvailable ? 'Aucun événement créé' : 'Module Événements indisponible')}</option>
              {events.map(ev => <option key={ev.id} value={ev.id}>{ev.title}{ev.start ? ` (${String(ev.start).slice(0, 10)})` : ''}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={ids.member} className={labelCls}>Membre concerné</label>
            <select id={ids.member} className="input" value={form.memberId} onChange={e => set('memberId', e.target.value)}>
              <option value="">Aucun</option>
              {members.map(m => <option key={m.id} value={m.id}>{memberName(m)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={ids.cp} className={labelCls}>Tiers (fournisseur, payeur)</label>
            <input id={ids.cp} className="input" value={form.counterparty} onChange={e => set('counterparty', e.target.value)} />
          </div>
          <div>
            <label htmlFor={ids.ref} className={labelCls}>Référence (facture, chèque…)</label>
            <input id={ids.ref} className="input" value={form.reference} onChange={e => set('reference', e.target.value)} />
          </div>
          <div>
            <label htmlFor={ids.notes} className={labelCls}>Notes</label>
            <input id={ids.notes} className="input" value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>

        <div>
          <p className={labelCls}>Justificatifs (photo ou PDF, 10 Mo max.)</p>
          <div className="flex flex-wrap gap-2">
            <input id={ids.file} type="file" accept="image/*,application/pdf" multiple className="sr-only peer/file" onChange={e => { onFiles(e.target.files); e.target.value = ''; }} />
            <label htmlFor={ids.file} className="btn-secondary cursor-pointer peer-focus-visible/file:ring-2 peer-focus-visible/file:ring-blue-500/60">
              <Paperclip size={14} aria-hidden="true" /> Joindre un fichier
            </label>
            <input id={ids.cam} type="file" accept="image/*" capture="environment" className="sr-only peer/cam" onChange={e => { onFiles(e.target.files); e.target.value = ''; }} />
            <label htmlFor={ids.cam} className="btn-secondary cursor-pointer peer-focus-visible/cam:ring-2 peer-focus-visible/cam:ring-blue-500/60">
              <Camera size={14} aria-hidden="true" /> Prendre une photo
            </label>
            {uploading && <span role="status" className="text-xs text-dim inline-flex items-center gap-1"><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Envoi…</span>}
          </div>
          {form.attachments.length > 0 && (
            <ul className="mt-2 space-y-1">
              {form.attachments.map(a => (
                <li key={a.id} className="flex items-center gap-2 text-sm bg-elevated border border-line rounded-lg px-2 py-1">
                  <FileText size={14} className="text-dim shrink-0" aria-hidden="true" />
                  <span className="truncate flex-1">{a.name}</span>
                  <span className="text-xs text-muted shrink-0">{Math.max(1, Math.round(a.size / 1024))} Ko</span>
                  <button type="button" className="btn-ghost p-1" aria-label={`Ouvrir ${a.name}`} onClick={() => openAttachment(a).catch(err => toast.error('Ouverture impossible', err.message))}><ExternalLink size={14} aria-hidden="true" /></button>
                  <button type="button" className="btn-ghost p-1" aria-label={`Retirer ${a.name}`} onClick={() => removeAttachment(a)}><Trash2 size={14} aria-hidden="true" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      </form>
    </Modal>
  );
}
