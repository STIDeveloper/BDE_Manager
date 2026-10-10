// Fiche d'une réponse (panneau latéral) : réponses lisibles, fichiers,
// signature, score, statut, étiquettes, assignation, notes, historique,
// navigation, actions (document, tâche, automatisations, e-mail).
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Lock, Paperclip, ExternalLink, FileBadge, KanbanSquare, Zap, Mail, Loader2, StickyNote, History, Tag, PenLine } from 'lucide-react';
import { summarizeAnswers } from '../engine/index.js';
import { adminQuestions, rawValue, statusesOf, STATUS_BADGE, scoreDetails, fmtNum, SOURCE_LABEL } from './analytics.js';
import { formatDateTimeFr, respondentLabel, respondentEmail } from './columns.js';
import { hasTasks, createTaskFor } from './integrations.js';
import { automationsAvailable, listAutomationsFor, runAutomationManually } from './manualActions.js';
import { useCan } from '../../core/permissions.js';
import { navigate } from '../../core/router.js';
import Modal from '../../components/Modal.jsx';
import { toast } from '../../components/ui/toastStore.js';

const RUN_LABEL = { done: 'réussie', partial: 'partielle', failed: 'échec', skipped: 'conditions non remplies' };
const ACTION_LABEL = { submitted: 'Réponse envoyée', status: 'Statut modifié', edited: 'Réponse modifiée par le répondant', tags: 'Étiquettes', assignee: 'Assignation', waitlist: 'Liste d\'attente', deleted: 'Supprimée', restored: 'Restaurée', payment: 'Paiement', note: 'Note interne' };

export default function ResponseDrawer({ ctx, row, list, onNavigate, onClose }) {
  const { def, repo, canWrite, revealed, labelFor, memberName, members, questions, mode } = ctx;
  const panelRef = useRef(null);
  const headingId = useId();
  const definition = ctx.definitionFor(row);
  const statuses = statusesOf(def);
  const idx = list.findIndex(r => r.id === row.id);
  const prev = idx > 0 ? list[idx - 1] : null;
  const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(null);
  const [historyTick, setHistoryTick] = useState(0);
  const [modal, setModal] = useState(null);

  const lines = useMemo(() => {
    try { return summarizeAnswers(definition, row.answers || {}, { labelFor }); } catch { return []; }
  }, [definition, row.answers, labelFor]);
  const qs = useMemo(() => adminQuestions(definition), [definition]);
  const files = qs.filter(q => q.type === 'file').flatMap(q => { const v = rawValue(row, q); return (Array.isArray(v) ? v : v ? [v] : []).map(f => ({ q, f })); });
  const signatures = qs.filter(q => q.type === 'signature').map(q => ({ q, v: rawValue(row, q) })).filter(x => x.v);
  const score = scoreDetails(definition, row);
  const who = respondentLabel(row, questions, memberName);
  const email = respondentEmail(row, questions);

  useEffect(() => { panelRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = e => {
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (e.key === 'Escape') onClose();
      if (e.altKey && e.key === 'ArrowDown' && next) onNavigate(next.id);
      if (e.altKey && e.key === 'ArrowUp' && prev) onNavigate(prev.id);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, onNavigate, next, prev]);

  useEffect(() => {
    if (!repo?.history) return undefined;
    let alive = true;
    repo.history(row.id).then(h => { if (alive) setHistory(h || []); }).catch(err => { if (alive) setHistory({ error: err?.message || String(err) }); });
    return () => { alive = false; };
  }, [repo, row.id, row.updatedAt, historyTick]);

  const act = async (label, fn) => {
    setBusy(true);
    try { await fn(); toast.success(label); ctx.reload(); setHistoryTick(t => t + 1); } catch (err) { toast.error('Action impossible', err?.message || String(err)); } finally { setBusy(false); }
  };
  const patch = (p, label) => act(label, () => repo.update([row], p));

  const notes = Array.isArray(history) ? history.filter(h => h.action === 'note') : row.notes || [];
  const masked = (s) => (revealed ? s : '•••••');
  const openFile = async (f) => {
    try {
      const url = await repo.fileUrl(f, row);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) { toast.error('Fichier indisponible', err?.message || String(err)); }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="presentation">
      <button type="button" className="absolute inset-0 bg-black/30" aria-label="Fermer la fiche" onClick={onClose} tabIndex={-1} />
      <aside ref={panelRef} tabIndex={-1} role="dialog" aria-modal="false" aria-labelledby={headingId}
        className="relative w-full sm:w-[34rem] h-full bg-base border-l border-line shadow-2xl flex flex-col focus:outline-none">
        <header className="p-3 border-b border-line flex items-start gap-2 bg-surface">
          <div className="min-w-0 flex-1">
            <h2 id={headingId} className="font-semibold text-ink truncate">{who || 'Réponse anonyme'}</h2>
            <p className="text-xs text-dim">{formatDateTimeFr(row.submittedAt)} · {SOURCE_LABEL[row.source] || row.source}{row.version ? ` · v${row.version}` : ''}{idx >= 0 ? ` · ${idx + 1} / ${list.length}` : ''}</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {row.pending && <span className="badge badge-amber">En attente d'envoi{row.queueError ? ' (refusée)' : ''}</span>}
              {row.waitlisted && <span className="badge badge-violet">Liste d'attente</span>}
              {row.deletedAt && <span className="badge badge-rose">Dans la corbeille</span>}
            </div>
          </div>
          <button type="button" className="btn-ghost !p-1.5" disabled={!prev} onClick={() => prev && onNavigate(prev.id)} aria-label="Réponse précédente (Alt+↑)"><ChevronLeft size={16} aria-hidden="true" /></button>
          <button type="button" className="btn-ghost !p-1.5" disabled={!next} onClick={() => next && onNavigate(next.id)} aria-label="Réponse suivante (Alt+↓)"><ChevronRight size={16} aria-hidden="true" /></button>
          <button type="button" className="btn-ghost !p-1.5" onClick={onClose} aria-label="Fermer la fiche (Échap)"><X size={16} aria-hidden="true" /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {row.queueError && <p role="alert" className="text-xs p-2 rounded-lg bg-red-500/10 text-red-700 dark:text-red-300">Envoi refusé par le serveur : {row.queueError}</p>}

          {/* Traitement */}
          <section className="grid grid-cols-2 gap-2" aria-label="Traitement">
            <Field label="Statut">
              {id => (
                <select id={id} className="input" value={row.status} disabled={!canWrite || busy || !!row.deletedAt} onChange={e => patch({ status: e.target.value }, 'Statut modifié')}>
                  {statuses.map(s => <option key={s.id} value={s.id}>{s.label}{s.final ? ' (final)' : ''}</option>)}
                  {!statuses.some(s => s.id === row.status) && <option value={row.status}>{row.status}</option>}
                </select>
              )}
            </Field>
            <Field label="Assigné à">
              {id => (
                <select id={id} className="input" value={row.assignee || ''} disabled={!canWrite || busy || !!row.deletedAt} onChange={e => patch({ assignee: e.target.value || null }, 'Assignation modifiée')}>
                  <option value="">Personne</option>
                  {(members || []).map(m => <option key={m.id} value={m.id}>{memberName(m.id)}</option>)}
                </select>
              )}
            </Field>
            <div className="col-span-2">
              <TagsEditor tags={row.tags || []} disabled={!canWrite || busy || !!row.deletedAt} onChange={tags => patch({ tags }, 'Étiquettes mises à jour')} />
            </div>
            {canWrite && def.settings?.waitlist && (
              <label className="col-span-2 flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={!!row.waitlisted} disabled={busy} onChange={e => patch({ waitlisted: e.target.checked }, e.target.checked ? 'Placée en liste d\'attente' : 'Sortie de la liste d\'attente')} /> En liste d'attente
              </label>
            )}
            <div className="col-span-2 flex flex-wrap gap-1">
              {statuses.map(s => s.id === row.status ? <span key={s.id} className={`badge ${STATUS_BADGE[s.color] || 'badge-neutral'}`}>{s.label}</span> : null)}
            </div>
          </section>

          {score.score !== null && (
            <section aria-label="Score" className="p-3 rounded-xl bg-elevated border border-line">
              <p className="text-sm text-ink"><strong>Score : {fmtNum(score.score)} / {fmtNum(score.maxScore)}</strong></p>
              <ul className="text-xs text-dim mt-1 grid grid-cols-2 gap-x-3">
                {score.details.map(d => <li key={d.key} className="truncate">{qs.find(q => q.key === d.key)?.label || d.key} : {fmtNum(d.points)} / {fmtNum(d.max)}</li>)}
              </ul>
            </section>
          )}

          {/* Réponses */}
          <section aria-labelledby={`${headingId}-a`}>
            <h3 id={`${headingId}-a`} className="text-sm font-semibold text-ink mb-1">Réponses</h3>
            {lines.length === 0 ? <p className="text-sm text-dim">Aucune réponse lisible.</p> : (
              <dl className="divide-y divide-line border border-line rounded-xl bg-surface">
                {lines.map(l => (
                  <div key={l.key} className="p-2">
                    <dt className="text-[11px] text-muted">{l.label}{l.sensitive && <Lock size={10} className="inline ml-1 -mt-0.5" aria-label="sensible" />}</dt>
                    <dd className="text-sm text-ink whitespace-pre-wrap break-words">{l.sensitive ? masked(l.value) : l.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {!revealed && lines.some(l => l.sensitive) && <p className="text-[11px] text-muted mt-1">Données sensibles masquées : utilise « Révéler les données sensibles » en haut de l'onglet.</p>}
          </section>

          {files.length > 0 && (
            <section aria-label="Fichiers">
              <h3 className="text-sm font-semibold text-ink mb-1 flex items-center gap-1"><Paperclip size={14} aria-hidden="true" /> Fichiers</h3>
              <ul className="space-y-1">
                {files.map(({ q, f }, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className="truncate flex-1 text-ink">{q.sensitive && !revealed ? '•••••' : f?.name || 'fichier'} <span className="text-xs text-muted">({q.label})</span></span>
                    <button type="button" className="btn-ghost !py-1 !text-xs" disabled={q.sensitive && !revealed} onClick={() => openFile(f)}><ExternalLink size={12} aria-hidden="true" /> Ouvrir</button>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-muted mt-1">{mode === 'server' ? 'Lien signé temporaire (5 min).' : 'Les fichiers déjà envoyés au serveur ne sont pas conservés sur l\'appareil.'}</p>
            </section>
          )}

          {signatures.length > 0 && (
            <section aria-label="Signature">
              <h3 className="text-sm font-semibold text-ink mb-1 flex items-center gap-1"><PenLine size={14} aria-hidden="true" /> Signature</h3>
              {signatures.map(({ q, v }) => (
                <div key={q.key} className="p-2 rounded-xl border border-line bg-white">
                  {!revealed ? <p className="text-xs text-zinc-500">Signature masquée (donnée sensible).</p>
                    : typeof v === 'string' && v.startsWith('data:image/png') ? <img src={v} alt={`Signature — ${q.label}`} className="max-h-28 mx-auto" />
                      : <button type="button" className="btn-secondary !text-xs" onClick={() => openFile(v)}>Afficher la signature</button>}
                </div>
              ))}
            </section>
          )}

          {/* Actions */}
          {!row.deletedAt && (
            <section aria-label="Actions" className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary !py-1.5 !text-xs" onClick={() => setModal('document')}><FileBadge size={14} aria-hidden="true" /> Générer un document</button>
              {hasTasks && canWrite && <button type="button" className="btn-secondary !py-1.5 !text-xs" disabled={busy} onClick={() => act('Tâche créée', async () => {
                const t = await createTaskFor({ title: `Traiter : ${def.title} — ${who || 'réponse anonyme'}`.slice(0, 200), description: `Réponse du ${formatDateTimeFr(row.submittedAt)} au formulaire « ${def.title} ».`, assigneeIds: row.assignee ? [row.assignee] : [], links: { formId: def.id, responseId: row.id }, source: 'formulaire' });
                toast.info('Tâche ajoutée au tableau', t?.title || '');
              })}><KanbanSquare size={14} aria-hidden="true" /> Créer une tâche</button>}
              {automationsAvailable && canWrite && <button type="button" className="btn-secondary !py-1.5 !text-xs" onClick={() => setModal('automation')}><Zap size={14} aria-hidden="true" /> Automatisations</button>}
              <button type="button" className="btn-secondary !py-1.5 !text-xs" disabled={!email} title={email ? '' : 'Aucune adresse e-mail'} onClick={() => setModal('email')}><Mail size={14} aria-hidden="true" /> E-mail</button>
            </section>
          )}

          {/* Notes */}
          <section aria-labelledby={`${headingId}-n`}>
            <h3 id={`${headingId}-n`} className="text-sm font-semibold text-ink mb-1 flex items-center gap-1"><StickyNote size={14} aria-hidden="true" /> Notes internes</h3>
            {notes.length === 0 ? <p className="text-xs text-dim">Aucune note.</p> : (
              <ul className="space-y-1">
                {notes.map((n, i) => <li key={i} className="p-2 rounded-lg bg-elevated text-sm"><p className="whitespace-pre-wrap text-ink">{n.text}</p><p className="text-[11px] text-muted">{formatDateTimeFr(n.at)}{n.by ? ` · ${n.by}` : ''}</p></li>)}
              </ul>
            )}
            {canWrite && repo?.addNote && !row.deletedAt && <NoteForm busy={busy} onAdd={text => act('Note ajoutée', () => repo.addNote(row.id, text))} />}
          </section>

          {/* Historique */}
          <section aria-labelledby={`${headingId}-h`}>
            <h3 id={`${headingId}-h`} className="text-sm font-semibold text-ink mb-1 flex items-center gap-1"><History size={14} aria-hidden="true" /> Historique</h3>
            {history === null ? <p className="text-xs text-dim">Chargement…</p> : history.error ? <p className="text-xs text-red-600" role="alert">{history.error}</p> : (
              <ol className="border-l border-line ml-1 space-y-1.5">
                {[...history].sort((a, b) => String(a.at).localeCompare(String(b.at))).map((h, i) => (
                  <li key={i} className="pl-3 text-xs">
                    <p className="text-ink">{ACTION_LABEL[h.action] || h.action}{h.action === 'status' ? ` : ${statuses.find(s => s.id === h.from)?.label || h.from || '—'} → ${statuses.find(s => s.id === h.to)?.label || h.to}` : ''}
                      {h.action === 'assignee' ? ` : ${h.to ? memberName(h.to) || h.to : 'personne'}` : ''}
                      {h.action === 'tags' && Array.isArray(h.to) ? ` : ${h.to.join(', ') || 'aucune'}` : ''}
                      {h.action === 'note' && h.text ? ` : « ${String(h.text).slice(0, 60)}${String(h.text).length > 60 ? '…' : ''} »` : ''}</p>
                    <p className="text-muted">{formatDateTimeFr(h.at)}{h.by ? ` · ${h.by}` : ''}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </aside>

      {modal === 'document' && <DocumentModal ctx={ctx} row={row} definition={definition} who={who} onClose={() => setModal(null)} />}
      {modal === 'automation' && <AutomationModal ctx={ctx} row={row} definition={definition} onClose={() => { setModal(null); setHistoryTick(t => t + 1); }} />}
      {modal === 'email' && <EmailModal ctx={ctx} row={row} email={email} onClose={() => setModal(null)} />}
    </div>
  );
}

function Field({ label, children }) {
  const id = useId();
  return <div><label htmlFor={id} className="block text-[11px] font-medium text-dim mb-0.5">{label}</label>{children(id)}</div>;
}

function TagsEditor({ tags, onChange, disabled }) {
  const id = useId();
  const [v, setV] = useState('');
  const add = () => { const t = v.trim().slice(0, 40); if (t && !tags.includes(t)) onChange([...tags, t]); setV(''); };
  return (
    <div>
      <label htmlFor={id} className="block text-[11px] font-medium text-dim mb-0.5">Étiquettes</label>
      <div className="flex flex-wrap items-center gap-1">
        {tags.map(t => (
          <span key={t} className="badge badge-indigo inline-flex items-center gap-1"><Tag size={10} aria-hidden="true" />{t}
            {!disabled && <button type="button" aria-label={`Retirer l'étiquette ${t}`} onClick={() => onChange(tags.filter(x => x !== t))}><X size={10} aria-hidden="true" /></button>}
          </span>
        ))}
        {!disabled && <input id={id} className="input !w-36 !py-1 !text-xs" placeholder="Ajouter (Entrée)" value={v} maxLength={40} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} onBlur={() => v.trim() && add()} />}
      </div>
    </div>
  );
}

function NoteForm({ onAdd, busy }) {
  const id = useId();
  const [text, setText] = useState('');
  return (
    <form className="mt-2 space-y-1" onSubmit={e => { e.preventDefault(); if (text.trim()) { onAdd(text.trim()); setText(''); } }}>
      <label htmlFor={id} className="sr-only">Nouvelle note interne</label>
      <textarea id={id} className="input min-h-[4rem]" maxLength={5000} placeholder="Note visible uniquement par l'équipe…" value={text} onChange={e => setText(e.target.value)} />
      <button type="submit" className="btn-secondary !py-1 !text-xs" disabled={busy || !text.trim()}>Ajouter la note</button>
    </form>
  );
}

// ── Générer un document (issueDocuments + mappage simple) ──
const MAPPABLE = new Set(['text', 'textarea', 'date', 'number', 'list', 'money', 'amount']);
function DocumentModal({ ctx, row, definition, who, onClose }) {
  const uid = useId();
  const canDocs = useCan('documents', 'write');
  const [templates, setTemplates] = useState(null);
  const [templateId, setTemplateId] = useState('');
  const pickerMember = adminQuestions(definition).filter(q => q.type === 'member_picker').map(q => rawValue(row, q)).find(v => typeof v === 'string');
  const [memberId, setMemberId] = useState(row.respondent?.memberId || pickerMember || '');
  const [mapping, setMapping] = useState({});
  const [busy, setBusy] = useState(false);
  const qs = adminQuestions(definition);
  useEffect(() => {
    let alive = true;
    import('../../documents/registry.js').then(m => { if (alive) setTemplates(m.getAllTemplates()); }).catch(() => { if (alive) setTemplates([]); });
    return () => { alive = false; };
  }, []);
  const template = templates?.find(t => t.id === templateId) || null;
  const fields = (template?.fields || []).filter(f => MAPPABLE.has(f.type));
  const valueOf = (key, type) => {
    const q = qs.find(x => x.key === key);
    if (!q) return undefined;
    const raw = rawValue(row, q);
    if (type === 'date') return typeof raw === 'string' ? raw.slice(0, 10) : '';
    if (type === 'number' || type === 'money' || type === 'amount') return typeof raw === 'number' ? raw : (raw && typeof raw === 'object' && 'amount' in raw ? raw.amount : Number(String(raw).replace(',', '.')) || 0);
    let text;
    try { text = summarizeAnswers(definition, { [key]: raw }, { labelFor: ctx.labelFor }).find(l => l.key === key)?.value || ''; } catch { text = String(raw ?? ''); }
    return type === 'list' ? text.split(/,\s*|\n/).filter(Boolean) : text;
  };
  const submit = async () => {
    if (!template) return;
    setBusy(true);
    try {
      const values = {};
      Object.entries(mapping).forEach(([fk, qk]) => { if (qk) { const f = fields.find(x => x.key === fk); const v = valueOf(qk, f?.type); if (v !== undefined) values[fk] = v; } });
      const { issueDocuments } = await import('../../documents/issue.js');
      const res = await issueDocuments({ templateId: template.id, memberIds: template.scope === 'member' && memberId ? [memberId] : [], values, format: 'pdf', origin: { type: 'form', formId: ctx.def.id, responseId: row.id } });
      toast.success('Document émis', `${res.refs?.[0] || ''} — ${template.title} (PDF téléchargé, inscrit au registre).`);
      onClose();
    } catch (err) { toast.error('Document non émis', err?.message || String(err)); } finally { setBusy(false); }
  };
  return (
    <Modal isOpen onClose={onClose} title="Générer un document" description={`À partir de la réponse de ${who || 'ce répondant'} : choisis un modèle et associe ses champs aux réponses.`} maxWidth="max-w-xl"
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Annuler</button><button type="button" className="btn-primary" disabled={!template || busy || !canDocs || (template.scope === 'member' && !memberId)} onClick={submit}>{busy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} Émettre (PDF)</button></>}>
      <div className="space-y-3">
        {!canDocs && <p className="text-xs text-amber-700 dark:text-amber-300">Ton rôle ne permet pas d'émettre des documents (Documents › écriture).</p>}
        <div>
          <label htmlFor={`${uid}-t`} className="block text-xs font-medium text-dim mb-1">Modèle</label>
          <select id={`${uid}-t`} className="input" value={templateId} onChange={e => { setTemplateId(e.target.value); setMapping({}); }}>
            <option value="">{templates ? 'Choisir un modèle…' : 'Chargement…'}</option>
            {(templates || []).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </div>
        {template?.scope === 'member' && (
          <div>
            <label htmlFor={`${uid}-m`} className="block text-xs font-medium text-dim mb-1">Membre concerné (obligatoire pour ce modèle)</label>
            <select id={`${uid}-m`} className="input" value={memberId} onChange={e => setMemberId(e.target.value)}>
              <option value="">—</option>
              {(ctx.members || []).map(m => <option key={m.id} value={m.id}>{ctx.memberName(m.id)}</option>)}
            </select>
            {!memberId && <p className="text-[11px] text-muted mt-1">Le répondant n'est pas relié à un membre : choisis-le (ou crée-le via une automatisation « Créer / mettre à jour un membre »).</p>}
          </div>
        )}
        {fields.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-dim">Champs du modèle ← réponses (facultatif : sinon valeur par défaut)</legend>
            {fields.map(f => (
              <div key={f.key} className="grid grid-cols-2 gap-2 items-center">
                <label htmlFor={`${uid}-f-${f.key}`} className="text-sm text-ink truncate">{f.label}</label>
                <select id={`${uid}-f-${f.key}`} className="input" value={mapping[f.key] || ''} onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value }))}>
                  <option value="">Valeur par défaut</option>
                  {qs.filter(q => q.type !== 'signature' && q.type !== 'file').map(q => <option key={q.key} value={q.key}>{q.label}</option>)}
                </select>
              </div>
            ))}
          </fieldset>
        )}
      </div>
    </Modal>
  );
}

function AutomationModal({ ctx, row, definition, onClose }) {
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(null);
  const [result, setResult] = useState(null);
  useEffect(() => {
    let alive = true;
    listAutomationsFor(ctx.def.id, ctx.mode).then(l => { if (alive) setList(l); }).catch(err => { if (alive) setList({ error: err?.message || String(err) }); });
    return () => { alive = false; };
  }, [ctx.def.id, ctx.mode]);
  const run = async (a) => {
    setBusy(a.id);
    try {
      const res = await runAutomationManually({ automation: a, row, definition, mode: ctx.mode, formId: ctx.def.id });
      setResult({ name: a.name, ...res });
      if (res.status === 'done') toast.success('Automatisation exécutée', a.name);
      else if (res.status === 'skipped') toast.info('Conditions non remplies', a.name);
      else toast.warn('Exécution incomplète', a.name);
      ctx.reload();
    } catch (err) { toast.error('Exécution impossible', err?.message || String(err)); } finally { setBusy(null); }
  };
  return (
    <Modal isOpen onClose={onClose} title="Déclencher une automatisation" description="Exécute maintenant les actions sur cette réponse (conditions vérifiées, journal des automatisations)." maxWidth="max-w-lg"
      footer={<><button type="button" className="btn-ghost" onClick={() => navigate('automations')}>Gérer les automatisations</button><button type="button" className="btn-secondary" onClick={onClose}>Fermer</button></>}>
      {list === null ? <p className="text-sm text-dim">Chargement…</p> : list.error ? <p role="alert" className="text-sm text-red-600">{list.error}</p> : list.length === 0 ? (
        <p className="text-sm text-dim">Aucune automatisation pour ce formulaire.</p>
      ) : (
        <ul className="space-y-2">
          {list.map(a => (
            <li key={a.id} className="flex items-center gap-2 p-2 rounded-xl border border-line">
              <div className="min-w-0 flex-1"><p className="text-sm text-ink truncate">{a.name}</p><p className="text-[11px] text-muted">{(a.actions || []).length} action(s){a.enabled ? '' : ' · désactivée'}</p></div>
              <button type="button" className="btn-primary !py-1 !text-xs" disabled={!!busy} onClick={() => run(a)}>{busy === a.id ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Zap size={13} aria-hidden="true" />} Exécuter</button>
            </li>
          ))}
        </ul>
      )}
      {result && (
        <div className="mt-3 p-2 rounded-xl bg-elevated text-xs space-y-1" aria-live="polite">
          <p className="font-semibold text-ink">{result.name} : {RUN_LABEL[result.status] || result.status}</p>
          {(result.actions || []).map((x, i) => <p key={i} className={x.status === 'error' ? 'text-red-600' : 'text-dim'}>• {x.label} — {x.status === 'error' ? x.error : x.summary}</p>)}
        </div>
      )}
    </Modal>
  );
}

function EmailModal({ ctx, row, email, onClose }) {
  const uid = useId();
  const [subject, setSubject] = useState(`À propos de ta réponse : ${ctx.def.title}`);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const brevo = ctx.mode === 'server' && typeof ctx.repo?.sendEmail === 'function';
  const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
  const send = async () => {
    setBusy(true);
    try {
      const r = await ctx.repo.sendEmail({ rows: [row], subject, message });
      toast.success('E-mail envoyé', `${r.sent} envoyé(s)${r.ignored ? `, ${r.ignored} ignoré(s)` : ''}.`);
      onClose();
    } catch (err) { toast.error('Envoi impossible', err?.message || String(err)); } finally { setBusy(false); }
  };
  return (
    <Modal isOpen onClose={onClose} title="Écrire au répondant" description={brevo ? 'Envoi par le serveur (Brevo), adresse jamais exposée dans l\'URL.' : 'Ouvre ta messagerie avec le message prérempli.'}
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Annuler</button>
        {brevo ? <button type="button" className="btn-primary" disabled={busy || !subject.trim() || !message.trim()} onClick={send}>{busy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} Envoyer</button>
          : <a className="btn-primary" href={mailto} onClick={() => setTimeout(onClose, 100)}>Ouvrir la messagerie</a>}</>}>
      <div className="space-y-2">
        <p className="text-xs text-dim">Destinataire : {ctx.revealed ? email : `${email.slice(0, 2)}•••@${email.split('@')[1] || ''}`}</p>
        <div><label htmlFor={`${uid}-s`} className="block text-xs font-medium text-dim mb-1">Objet</label><input id={`${uid}-s`} className="input" value={subject} maxLength={200} onChange={e => setSubject(e.target.value)} /></div>
        <div><label htmlFor={`${uid}-m`} className="block text-xs font-medium text-dim mb-1">Message</label><textarea id={`${uid}-m`} className="input min-h-[8rem]" value={message} maxLength={5000} onChange={e => setMessage(e.target.value)} /></div>
      </div>
    </Modal>
  );
}
