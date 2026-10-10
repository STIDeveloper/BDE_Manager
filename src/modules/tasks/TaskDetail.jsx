// Fiche détaillée d'une tâche (Modal) : tous les champs, checklist,
// pièces jointes, liens vers les autres modules, validation.
import { useId, useMemo, useRef, useState } from 'react';
import {
  CalendarDays, ExternalLink, FileText, Paperclip, Plus, ShieldCheck, Tag, Trash2, Wallet, X, ClipboardList, User,
} from 'lucide-react';
import Modal from '../../components/Modal.jsx';
import { confirmDialog } from '../../components/ui/confirmStore.js';
import { toast } from '../../components/ui/toastStore.js';
import { useCan, usePermissionSource } from '../../core/permissions.js';
import { navigate } from '../../core/router.js';
import { saveAttachment, openAttachment, deleteAttachment } from '../../core/attachments.js';
import { formatDateLong } from '../../documents/context.js';
import { useTasksStore } from './store.js';
import { PRIORITIES, checklistProgress, isOverdue, isTaskDone, needsApproval, todayIso } from './logic.js';
import { useEventsList, useMe } from './hooks.js';

const SOURCE_LABEL = { manuel: 'Saisie manuelle', formulaire: 'Formulaire', automatisation: 'Automatisation', evenement: 'Événement' };
const fmtDateTime = (iso) => (iso ? `${formatDateLong(iso)} à ${new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : '');
const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`);

export default function TaskDetail({ taskId, members, onClose, allLabels }) {
  const uid = useId();
  const task = useTasksStore(s => s.tasks[taskId]);
  const boards = useTasksStore(s => s.boards);
  const { updateTask, moveTask, removeTask, approveTask, revokeApproval } = useTasksStore.getState();
  const canWrite = useCan('tasks', 'write');
  const canValidate = useCan('tasks', 'validate');
  const canManage = useCan('tasks', 'manage');
  const mayApprove = canValidate || canManage;
  const perm = usePermissionSource();
  const { meId } = useMe();
  const events = useEventsList();
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [labelDraft, setLabelDraft] = useState('');
  const [itemDraft, setItemDraft] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const board = task ? boards[task.boardId] : null;
  const activeBoards = useMemo(() => Object.values(boards).filter(b => !b.archived || b.id === task?.boardId)
    .sort((a, b) => a.title.localeCompare(b.title, 'fr')), [boards, task?.boardId]);

  if (!task) {
    return (
      <Modal isOpen onClose={onClose} title="Tâche introuvable">
        <p className="text-sm text-dim">Elle a peut-être été supprimée.</p>
      </Modal>
    );
  }

  const ro = !canWrite;
  const done = isTaskDone(task, boards);
  const late = isOverdue(task, boards, todayIso());
  const cl = checklistProgress(task);
  const patch = (p) => updateTask(task.id, p);
  const notifyMove = (r) => {
    if (!r.ok) { toast.error('Déplacement refusé', r.error); return; }
    if (r.wipExceeded) toast.warn('Limite de travail en cours dépassée', `« ${r.column.title} » contient plus de ${r.column.wipLimit} carte(s).`);
  };

  const commitTitle = () => {
    if (!title.trim()) { setTitle(task.title); return; }
    if (title.trim() !== task.title) patch({ title });
  };

  // ── Étiquettes ──
  const addLabel = () => {
    const l = labelDraft.trim();
    if (!l) return;
    if (!(task.labels || []).includes(l)) patch({ labels: [...(task.labels || []), l] });
    setLabelDraft('');
  };

  // ── Checklist ──
  const addItem = (e) => {
    e.preventDefault();
    const t = itemDraft.trim();
    if (!t) return;
    patch({ checklist: [...(task.checklist || []), { text: t, done: false }] });
    setItemDraft('');
  };
  const setItem = (id, p) => patch({ checklist: task.checklist.map(i => (i.id === id ? { ...i, ...p } : i)) });

  // ── Pièces jointes ──
  const upload = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    const added = [];
    for (const f of files) {
      try { added.push(await saveAttachment(f, { scope: 'tasks' })); } catch (err) { toast.error(`« ${f.name} » non ajouté`, err.message); }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
    if (!added.length) return;
    const cur = useTasksStore.getState().tasks[task.id];
    updateTask(task.id, { attachments: [...(cur?.attachments || []), ...added] });
    toast.success(added.length > 1 ? `${added.length} pièces jointes ajoutées` : 'Pièce jointe ajoutée');
  };
  const removeAttachment = async (a) => {
    if (!(await confirmDialog({ title: 'Retirer la pièce jointe ?', message: a.name, confirmLabel: 'Retirer', tone: 'danger' }))) return;
    await deleteAttachment(a.id);
    const cur = useTasksStore.getState().tasks[task.id];
    updateTask(task.id, { attachments: (cur?.attachments || []).filter(x => x.id !== a.id) });
    toast.success('Pièce jointe retirée');
  };
  const open = async (a) => { try { await openAttachment(a); } catch (err) { toast.error('Ouverture impossible', err.message); } };

  // ── Validation ──
  const approverName = (id) => (members.byId.has(id) ? members.name(id) : 'un·e responsable');
  const approve = () => {
    const r = approveTask(task.id, meId || perm?.user?.id || 'local');
    if (r.ok) toast.success('Tâche approuvée', task.title); else toast.error('Approbation impossible', r.error);
  };
  const revoke = async () => {
    if (!(await confirmDialog({ title: 'Retirer l\'approbation ?', message: 'La tâche ne pourra plus passer en « terminé » sans nouvelle approbation.', confirmLabel: 'Retirer', tone: 'warning' }))) return;
    const r = revokeApproval(task.id);
    if (!r.ok) toast.error('Action impossible', r.error);
  };

  const remove = async () => {
    if (!(await confirmDialog({ title: 'Supprimer la tâche ?', message: task.title, confirmLabel: 'Supprimer', tone: 'danger' }))) return;
    (task.attachments || []).forEach(a => deleteAttachment(a.id));
    removeTask(task.id);
    toast.success('Tâche supprimée', task.title);
    onClose();
  };

  const go = (...args) => { onClose(); navigate(...args); };
  const links = task.links || {};
  const linkedEvent = links.eventId ? events.byId[links.eventId] : null;
  const unassigned = members.list.filter(m => !(task.assigneeIds || []).includes(m.id));

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={task.title}
      description={`${board?.title || 'Tableau inconnu'} · ${board?.columns.find(c => c.id === task.columnId)?.title || ''}${late ? ' · en retard' : ''}`}
      maxWidth="max-w-3xl"
      footer={(
        <div className="flex flex-wrap gap-2 justify-between">
          {canWrite ? <button type="button" className="btn-ghost text-rose-600" onClick={remove}><Trash2 size={16} aria-hidden="true" /> Supprimer</button> : <span />}
          <button type="button" className="btn-primary" onClick={onClose}>Fermer</button>
        </div>
      )}
    >
      <div className="grid md:grid-cols-[1fr_15rem] gap-5">
        {/* Colonne principale */}
        <div className="space-y-5 min-w-0">
          <div>
            <label htmlFor={`${uid}-title`} className="block text-xs font-medium text-dim mb-1">Titre</label>
            <input id={`${uid}-title`} className="input font-medium" value={title} readOnly={ro}
              onChange={(e) => setTitle(e.target.value)} onBlur={commitTitle}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
          </div>
          <div>
            <label htmlFor={`${uid}-desc`} className="block text-xs font-medium text-dim mb-1">Description</label>
            <textarea id={`${uid}-desc`} rows={4} className="input" value={description} readOnly={ro} placeholder="Détails, contexte, critères de réussite…"
              onChange={(e) => setDescription(e.target.value)} onBlur={() => { if (description !== (task.description || '')) patch({ description }); }} />
          </div>

          {/* Checklist */}
          <section aria-labelledby={`${uid}-cl`} className="space-y-2">
            <h4 id={`${uid}-cl`} className="text-sm font-semibold text-ink flex items-center gap-2">
              Checklist {cl.total > 0 && <span className="badge badge-neutral">{cl.done}/{cl.total}</span>}
            </h4>
            {cl.total > 0 && (
              <div role="progressbar" aria-label="Avancement de la checklist" aria-valuemin={0} aria-valuemax={cl.total} aria-valuenow={cl.done}
                className="h-1.5 rounded-full bg-elevated overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(cl.done / cl.total) * 100}%` }} />
              </div>
            )}
            <ul className="space-y-1">
              {(task.checklist || []).map(i => (
                <li key={i.id} className="flex items-center gap-2">
                  <input type="checkbox" id={`${uid}-i-${i.id}`} className="w-4 h-4 shrink-0" checked={i.done} disabled={ro} onChange={(e) => setItem(i.id, { done: e.target.checked })} />
                  <label htmlFor={`${uid}-i-${i.id}`} className={`flex-1 text-sm ${i.done ? 'line-through text-muted' : 'text-ink'}`}>{i.text}</label>
                  {!ro && (
                    <button type="button" className="btn-ghost p-1" aria-label={`Retirer « ${i.text} » de la checklist`}
                      onClick={() => patch({ checklist: task.checklist.filter(x => x.id !== i.id) })}>
                      <X size={14} aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {!ro && (
              <form onSubmit={addItem} className="flex gap-2">
                <label htmlFor={`${uid}-item`} className="sr-only">Nouvel élément de checklist</label>
                <input id={`${uid}-item`} className="input py-1.5" value={itemDraft} placeholder="Ajouter un élément…" onChange={(e) => setItemDraft(e.target.value)} />
                <button type="submit" className="btn-secondary py-1.5" aria-label="Ajouter l'élément à la checklist"><Plus size={14} aria-hidden="true" /></button>
              </form>
            )}
          </section>

          {/* Pièces jointes */}
          <section aria-labelledby={`${uid}-att`} className="space-y-2">
            <h4 id={`${uid}-att`} className="text-sm font-semibold text-ink">Pièces jointes</h4>
            {(task.attachments || []).length === 0 && <p className="text-xs text-muted">Aucune pièce jointe.</p>}
            <ul className="space-y-1">
              {(task.attachments || []).map(a => (
                <li key={a.id} className="flex items-center gap-2 text-sm border border-line rounded-lg px-2 py-1.5">
                  <Paperclip size={14} className="text-dim shrink-0" aria-hidden="true" />
                  <button type="button" className="flex-1 min-w-0 text-left truncate text-blue-600 dark:text-blue-400 hover:underline" onClick={() => open(a)}>
                    {a.name}
                  </button>
                  <span className="text-[11px] text-muted shrink-0">{fmtSize(a.size || 0)}</span>
                  {!ro && (
                    <button type="button" className="btn-ghost p-1" aria-label={`Retirer la pièce jointe « ${a.name} »`} onClick={() => removeAttachment(a)}>
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {!ro && (
              <div>
                <label htmlFor={`${uid}-file`} className={`btn-secondary cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                  <Paperclip size={14} aria-hidden="true" /> {uploading ? 'Envoi…' : 'Joindre des fichiers'}
                </label>
                <input id={`${uid}-file`} ref={fileRef} type="file" multiple className="sr-only" disabled={uploading}
                  onChange={(e) => upload([...e.target.files])} />
                <p className="text-[11px] text-muted mt-1">10 Mo maximum par fichier, stockés sur cet appareil{perm?.mode === 'remote' ? ' et sur le serveur' : ''}.</p>
              </div>
            )}
          </section>

          {/* Liens */}
          <section aria-labelledby={`${uid}-links`} className="space-y-2">
            <h4 id={`${uid}-links`} className="text-sm font-semibold text-ink">Liens</h4>
            <div>
              <label htmlFor={`${uid}-ev`} className="block text-xs font-medium text-dim mb-1">Lier à un événement</label>
              <div className="flex gap-2">
                <select id={`${uid}-ev`} className="input" value={links.eventId || ''} disabled={ro || !events.available}
                  onChange={(e) => patch({ links: { ...links, eventId: e.target.value } })}>
                  <option value="">{events.available ? '— Aucun —' : 'Module Événements indisponible'}</option>
                  {links.eventId && !linkedEvent && <option value={links.eventId}>Événement supprimé</option>}
                  {events.list.map(ev => <option key={ev.id} value={ev.id}>{ev.title}{ev.start ? ` (${formatDateLong(ev.start)})` : ''}</option>)}
                </select>
                {linkedEvent && (
                  <button type="button" className="btn-secondary shrink-0" onClick={() => go('events', linkedEvent.id)} aria-label={`Ouvrir l'événement « ${linkedEvent.title} »`}>
                    <CalendarDays size={14} aria-hidden="true" /> <ExternalLink size={12} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
            <div>
              <label htmlFor={`${uid}-mb`} className="block text-xs font-medium text-dim mb-1">Membre concerné</label>
              <select id={`${uid}-mb`} className="input" value={links.memberId || ''} disabled={ro}
                onChange={(e) => patch({ links: { ...links, memberId: e.target.value } })}>
                <option value="">— Aucun —</option>
                {members.list.map(m => <option key={m.id} value={m.id}>{members.name(m.id)}</option>)}
              </select>
            </div>
            {(links.formId || links.responseId || links.transactionId) && (
              <ul className="flex flex-wrap gap-2">
                {links.formId && (
                  <li><button type="button" className="btn-secondary text-xs py-1.5" onClick={() => go('forms', links.formId, links.responseId ? 'reponses' : '', links.responseId ? { response: links.responseId } : undefined)}>
                    <ClipboardList size={14} aria-hidden="true" /> {links.responseId ? 'Voir la réponse au formulaire' : 'Voir le formulaire'}
                  </button></li>
                )}
                {links.transactionId && (
                  <li><button type="button" className="btn-secondary text-xs py-1.5" onClick={() => go('finance', 'transactions', { tx: links.transactionId })}>
                    <Wallet size={14} aria-hidden="true" /> Voir l'opération
                  </button></li>
                )}
              </ul>
            )}
          </section>
        </div>

        {/* Colonne latérale */}
        <aside className="space-y-4 min-w-0">
          <div>
            <label htmlFor={`${uid}-board`} className="block text-xs font-medium text-dim mb-1">Tableau</label>
            <select id={`${uid}-board`} className="input" value={task.boardId} disabled={ro}
              onChange={(e) => { const b = boards[e.target.value]; if (b) notifyMove(moveTask(task.id, b.columns.find(c => !c.done)?.id || b.columns[0].id, Infinity, b.id)); }}>
              {activeBoards.map(b => <option key={b.id} value={b.id}>{b.title}{b.archived ? ' (archivé)' : ''}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${uid}-col`} className="block text-xs font-medium text-dim mb-1">Colonne</label>
            <select id={`${uid}-col`} className="input" value={task.columnId} disabled={ro}
              onChange={(e) => notifyMove(moveTask(task.id, e.target.value, Infinity))}>
              {(board?.columns || []).map(c => <option key={c.id} value={c.id}>{c.title}{c.done ? ' ✓' : ''}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${uid}-prio`} className="block text-xs font-medium text-dim mb-1">Priorité</label>
            <select id={`${uid}-prio`} className="input" value={task.priority} disabled={ro} onChange={(e) => patch({ priority: e.target.value })}>
              {PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${uid}-due`} className="block text-xs font-medium text-dim mb-1">Échéance</label>
            <input id={`${uid}-due`} type="date" className={`input ${late ? 'border-rose-500/60 text-rose-600' : ''}`} value={task.dueDate || ''} readOnly={ro}
              aria-describedby={late ? `${uid}-late` : undefined} onChange={(e) => patch({ dueDate: e.target.value })} />
            {late && <p id={`${uid}-late`} className="text-[11px] text-rose-600 dark:text-rose-400 mt-0.5">Échéance dépassée</p>}
          </div>

          {/* Assignés */}
          <div>
            <p className="block text-xs font-medium text-dim mb-1" id={`${uid}-as`}>Assignés</p>
            <ul aria-labelledby={`${uid}-as`} className="flex flex-wrap gap-1 mb-1.5">
              {(task.assigneeIds || []).length === 0 && <li className="text-xs text-muted">Personne</li>}
              {(task.assigneeIds || []).map(id => (
                <li key={id} className="badge badge-brand text-xs">
                  <User size={11} aria-hidden="true" /> {members.name(id)}
                  {!ro && (
                    <button type="button" className="ml-0.5 rounded hover:text-rose-600" aria-label={`Retirer ${members.name(id)}`}
                      onClick={() => patch({ assigneeIds: task.assigneeIds.filter(x => x !== id) })}>
                      <X size={11} aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {!ro && (
              <>
                <label htmlFor={`${uid}-add-as`} className="sr-only">Ajouter une personne assignée</label>
                <select id={`${uid}-add-as`} className="input py-1.5 text-xs" value="" onChange={(e) => { if (e.target.value) patch({ assigneeIds: [...(task.assigneeIds || []), e.target.value] }); }}>
                  <option value="">+ Assigner un membre…</option>
                  {meId && unassigned.some(m => m.id === meId) && <option value={meId}>Moi ({members.name(meId)})</option>}
                  {unassigned.map(m => <option key={m.id} value={m.id}>{members.name(m.id)}</option>)}
                </select>
              </>
            )}
          </div>

          {/* Étiquettes */}
          <div>
            <p className="block text-xs font-medium text-dim mb-1" id={`${uid}-lb`}>Étiquettes</p>
            <ul aria-labelledby={`${uid}-lb`} className="flex flex-wrap gap-1 mb-1.5">
              {(task.labels || []).length === 0 && <li className="text-xs text-muted">Aucune</li>}
              {(task.labels || []).map(l => (
                <li key={l} className="badge badge-neutral text-xs">
                  <Tag size={11} aria-hidden="true" /> {l}
                  {!ro && (
                    <button type="button" className="ml-0.5 rounded hover:text-rose-600" aria-label={`Retirer l'étiquette ${l}`}
                      onClick={() => patch({ labels: task.labels.filter(x => x !== l) })}>
                      <X size={11} aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {!ro && (
              <div className="flex gap-1">
                <label htmlFor={`${uid}-lbl`} className="sr-only">Nouvelle étiquette</label>
                <input id={`${uid}-lbl`} list={`${uid}-lbls`} className="input py-1.5 text-xs" value={labelDraft} placeholder="Ajouter…"
                  onChange={(e) => setLabelDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLabel(); } }} />
                <datalist id={`${uid}-lbls`}>{allLabels.map(l => <option key={l} value={l} />)}</datalist>
                <button type="button" className="btn-secondary py-1 px-2" aria-label="Ajouter l'étiquette" onClick={addLabel}><Plus size={14} aria-hidden="true" /></button>
              </div>
            )}
          </div>

          {/* Validation */}
          <div className="border border-line rounded-xl p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" className="w-4 h-4" checked={!!task.requiresApproval} disabled={ro || (done && !!task.requiresApproval)}
                onChange={(e) => patch({ requiresApproval: e.target.checked })} />
              Validation requise
            </label>
            {task.requiresApproval && (task.approvedAt ? (
              <div className="text-xs text-emerald-700 dark:text-emerald-300 space-y-1">
                <p className="flex items-center gap-1"><ShieldCheck size={14} aria-hidden="true" /> Approuvée par {approverName(task.approvedBy)} le {fmtDateTime(task.approvedAt)}.</p>
                {mayApprove && !done && <button type="button" className="btn-ghost text-xs py-1 px-2" onClick={revoke}>Retirer l'approbation</button>}
              </div>
            ) : (
              <div className="text-xs space-y-1.5">
                <p className="text-amber-700 dark:text-amber-300">En attente d'approbation : la tâche ne peut pas passer en colonne « terminé ».</p>
                {mayApprove
                  ? <button type="button" className="btn-primary w-full py-1.5 text-xs" onClick={approve}><ShieldCheck size={14} aria-hidden="true" /> Approuver</button>
                  : <p className="text-muted">Une personne ayant le droit « valider » sur les tâches doit l'approuver.</p>}
              </div>
            ))}
            {needsApproval(task) && done && <p className="text-[11px] text-muted">Déjà terminée avant l'activation de la validation.</p>}
          </div>

          <dl className="text-[11px] text-muted space-y-0.5">
            <div><dt className="inline">Créée : </dt><dd className="inline">{fmtDateTime(task.createdAt)}</dd></div>
            {task.updatedAt && <div><dt className="inline">Modifiée : </dt><dd className="inline">{fmtDateTime(task.updatedAt)}</dd></div>}
            {task.completedAt && <div><dt className="inline">Terminée : </dt><dd className="inline">{fmtDateTime(task.completedAt)}</dd></div>}
            {task.source && <div><dt className="inline">Origine : </dt><dd className="inline"><FileText size={10} className="inline" aria-hidden="true" /> {SOURCE_LABEL[task.source] || task.source}</dd></div>}
          </dl>
        </aside>
      </div>
    </Modal>
  );
}
