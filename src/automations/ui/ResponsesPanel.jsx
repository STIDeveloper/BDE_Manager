// Réponses LOCALES (mode local) : reprises de la borne hors ligne ou saisies
// à la main (réponse papier, inscription au stand). Chaque ajout, changement
// de statut ou paiement confirmé déclenche les automatisations.
import { useId, useMemo, useState } from 'react';
import { Plus, Trash2, CreditCard, Tablet, Inbox } from 'lucide-react';
import Modal from '../../components/Modal.jsx';
import { useStore } from '../../store.js';
import { useCan } from '../../core/permissions.js';
import { useCatalog } from '../../core/useCatalog.js';
import { useFormsStore } from '../../modules/forms/store.js';
import { useEventsStore } from '../../modules/events/store.js';
import { toast } from '../../components/ui/toastStore.js';
import { confirmDialog } from '../../components/ui/confirmStore.js';
import { evaluateForm } from '../../forms/engine/index.js';
import { formatMoney } from '../../documents/context.js';
import { useAutomationsStore } from '../store.js';
import { addLocalResponse, changeLocalResponseStatus, confirmLocalPayment, statusesOf } from '../pipeline.js';
import { runNow } from '../runner.js';
import { formQuestions, valueToText } from '../mapping.js';
import { fmtDate } from './format.js';

const selectResponses = s => s.responses;
const selectDefs = s => s.definitions;
const SUPPORTED = new Set(['short_text', 'long_text', 'email', 'phone', 'url', 'number', 'date', 'time', 'datetime', 'name', 'single_choice', 'dropdown', 'yes_no', 'multiple_choice', 'payment', 'member_picker', 'event_picker', 'rating', 'scale', 'nps', 'consent', 'hidden', 'address']);

export default function ResponsesPanel() {
  const uid = useId();
  const canWrite = useCan('forms', 'write');
  const responses = useAutomationsStore(selectResponses);
  const defs = useFormsStore(selectDefs);
  const [formFilter, setFormFilter] = useState('');
  const [adding, setAdding] = useState(false);
  const [payFor, setPayFor] = useState(null);

  const list = useMemo(() => Object.values(responses).filter(r => !formFilter || r.formId === formFilter)
    .sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt))), [responses, formFilter]);
  const forms = useMemo(() => Object.values(defs).filter(d => d.status !== 'archived'), [defs]);

  const changeStatus = (r, status) => {
    changeLocalResponseStatus(r.id, status);
    toast.info('Statut modifié', 'Les automatisations concernées sont lancées.');
    runNow().catch(() => {});
  };
  const remove = async (r) => {
    if (!(await confirmDialog({ title: 'Supprimer cette réponse locale ?', message: 'Les données déjà créées par les automatisations restent en place.', confirmLabel: 'Supprimer', tone: 'danger' }))) return;
    useAutomationsStore.getState().deleteResponse(r.id);
    toast.success('Réponse supprimée');
  };
  const summary = (r) => {
    const def = defs[r.formId];
    const qs = formQuestions(def).filter(q => !['consent', 'signature', 'file', 'member_picker', 'event_picker', 'hidden'].includes(q.type) && !q.item?.sensitive).slice(0, 3);
    return qs.map(q => valueToText(r.answers?.[q.key])).filter(Boolean).join(' · ');
  };

  return (
    <div className="space-y-3">
      <div className="card p-3 flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[12rem]">
          <label htmlFor={`${uid}-f`} className="text-xs font-semibold text-dim">Formulaire</label>
          <select id={`${uid}-f`} className="input" value={formFilter} onChange={(e) => setFormFilter(e.target.value)}>
            <option value="">Tous</option>{forms.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
          </select>
        </div>
        <button type="button" className="btn-secondary" onClick={() => runNow().then(res => toast.info('Borne vérifiée', `${res?.ingested || 0} nouvelle(s) réponse(s) reprise(s).`)).catch(err => toast.error('Erreur', String(err?.message || err)))}>
          <Tablet size={16} aria-hidden="true" /> Reprendre la borne
        </button>
        {canWrite && <button type="button" className="btn-primary" disabled={!forms.length} onClick={() => setAdding(true)}><Plus size={16} aria-hidden="true" /> Ajouter une réponse</button>}
      </div>
      <p className="text-xs text-muted">Mode local : les réponses saisies sur la borne de cet appareil (mode hors ligne) et celles ajoutées ici déclenchent les automatisations. En mode connecté, les réponses sont sur le serveur (module Formulaires).</p>
      {!list.length && <div className="card p-8 text-center text-sm text-dim"><Inbox className="mx-auto mb-2 text-muted" size={28} aria-hidden="true" />Aucune réponse locale.</div>}
      <ul className="space-y-2">
        {list.map(r => {
          const def = defs[r.formId];
          const statuses = statusesOf(def);
          const paid = r.paymentStatus === 'paid' || r.paymentStatus === 'manual';
          const hasPayment = formQuestions(def).some(q => q.type === 'payment');
          return (
            <li key={r.id} className="card p-3 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink truncate">{def?.title || 'Formulaire supprimé'}</p>
                <p className="text-xs text-dim truncate">{fmtDate(r.submittedAt)} · {r.source === 'borne' ? 'borne' : 'saisie manuelle'}{summary(r) ? ` · ${summary(r)}` : ''}</p>
                {paid && <span className="badge badge-emerald mt-1">Payé{Number.isFinite(r.paymentAmount) ? ` ${formatMoney(r.paymentAmount)}` : ''}</span>}
              </div>
              <div>
                <label htmlFor={`${uid}-st-${r.id}`} className="sr-only">Statut de la réponse</label>
                <select id={`${uid}-st-${r.id}`} className="input !w-auto" value={r.status} disabled={!canWrite} onChange={(e) => changeStatus(r, e.target.value)}>
                  {statuses.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  {!statuses.some(s => s.id === r.status) && <option value={r.status}>{r.status}</option>}
                </select>
              </div>
              {canWrite && hasPayment && !paid && <button type="button" className="btn-secondary" onClick={() => setPayFor(r)}><CreditCard size={14} aria-hidden="true" /> Paiement reçu</button>}
              {canWrite && <button type="button" className="btn-ghost !px-2" aria-label="Supprimer la réponse" onClick={() => remove(r)}><Trash2 size={14} aria-hidden="true" /></button>}
            </li>
          );
        })}
      </ul>
      {adding && <AddResponseModal forms={forms} initialFormId={formFilter || forms[0]?.id} onClose={() => setAdding(false)} />}
      {payFor && <PaymentModal response={payFor} onClose={() => setPayFor(null)} />}
    </div>
  );
}

function PaymentModal({ response, onClose }) {
  const id = useId();
  const [amount, setAmount] = useState(Number.isFinite(response.paymentAmount) ? String(response.paymentAmount) : '');
  const submit = (e) => {
    e.preventDefault();
    confirmLocalPayment(response.id, amount.replace(',', '.'));
    toast.success('Paiement confirmé', 'Les automatisations « paiement confirmé » sont lancées.');
    runNow().catch(() => {});
    onClose();
  };
  return (
    <Modal isOpen onClose={onClose} title="Confirmer un paiement" description="Paiement reçu hors ligne (espèces, chèque, virement)."
      footer={<div className="flex gap-2 justify-end"><button type="button" className="btn-secondary" onClick={onClose}>Annuler</button><button type="submit" form={id} className="btn-primary">Confirmer</button></div>}>
      <form id={id} onSubmit={submit} className="space-y-2">
        <label htmlFor={`${id}-a`} className="text-xs font-semibold text-dim">Montant (€)</label>
        <input id={`${id}-a`} className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </form>
    </Modal>
  );
}

function AddResponseModal({ forms, initialFormId, onClose }) {
  const id = useId();
  const [formId, setFormId] = useState(initialFormId || '');
  const [answers, setAnswers] = useState({});
  const [status, setStatus] = useState('received');
  const [paid, setPaid] = useState(false);
  const def = forms.find(f => f.id === formId) || null;
  const questions = useMemo(() => formQuestions(def).filter(q => q.item && q.item.kind === 'question'), [def]);
  const statuses = statusesOf(def);
  const members = useStore(s => s.members);
  const eventsMap = useEventsStore(s => s.events);
  const { roleList, poleList } = useCatalog();
  const sources = useMemo(() => ({
    members: (members || []).map(m => ({ value: m.id, label: [m.firstName, m.lastName].filter(Boolean).join(' ') || m.email || 'Membre' })),
    events: Object.values(eventsMap || {}).map(e => ({ value: e.id, label: e.title })),
    roles: roleList.map(r => ({ value: r.id, label: r.label })),
    poles: poleList.map(p => ({ value: p.id, label: p.label })),
  }), [members, eventsMap, roleList, poleList]);
  const set = (k, v) => setAnswers(a => ({ ...a, [k]: v }));

  const submit = (e) => {
    e.preventDefault();
    if (!def) return;
    const filled = Object.fromEntries(Object.entries(answers).filter(([, v]) => v !== '' && v !== undefined && !(Array.isArray(v) && !v.length)));
    // Questions d'une section répétable : une ligne { cle: valeur } dans answers[groupe].
    const clean = {};
    Object.entries(filled).forEach(([k, v]) => {
      const q = questions.find(x => x.key === k);
      if (q?.repeatKey) { clean[q.repeatKey] = [{ ...(clean[q.repeatKey]?.[0] || {}), [k]: v }]; } else clean[k] = v;
    });
    let computed;
    try { computed = evaluateForm(def, clean, {}).computed || {}; } catch { computed = {}; }
    const payQ = questions.find(q => q.type === 'payment');
    const amount = payQ ? Number(clean[payQ.key]?.amount) : NaN;
    const email = questions.find(q => q.type === 'email' && clean[q.key]);
    addLocalResponse({
      formId: def.id, version: def.publishedVersion ?? null, answers: clean, computed, status,
      respondent: email ? { email: clean[email.key] } : null, source: 'manuel',
      paymentStatus: paid ? 'manual' : null, paymentAmount: Number.isFinite(amount) ? amount : null,
    });
    toast.success('Réponse ajoutée', 'Les automatisations concernées sont lancées.');
    runNow().catch(() => {});
    onClose();
  };

  const optionsOf = (q) => (q.options?.length ? q.options.map(o => ({ value: String(o.value), label: o.label || String(o.value) })) : (sources[q.item?.source] || []));
  const field = (q) => {
    const fid = `${id}-${q.key}`;
    const v = answers[q.key];
    const label = <label htmlFor={fid} className="text-xs font-semibold text-dim">{q.label}{q.item?.required === true && <span aria-hidden="true" className="text-rose-500"> *</span>}</label>;
    switch (q.type) {
      case 'name':
        return (<div key={q.key} className="sm:col-span-2"><span className="text-xs font-semibold text-dim">{q.label}</span>
          <div className="grid grid-cols-2 gap-2">
            <input aria-label={`${q.label} — prénom`} id={fid} className="input" placeholder="Prénom" value={v?.firstName || ''} onChange={(e) => set(q.key, { ...(v || {}), firstName: e.target.value })} />
            <input aria-label={`${q.label} — nom`} className="input" placeholder="Nom" value={v?.lastName || ''} onChange={(e) => set(q.key, { ...(v || {}), lastName: e.target.value })} />
          </div></div>);
      case 'address':
        return <div key={q.key} className="sm:col-span-2">{label}<input id={fid} className="input" placeholder="Adresse, code postal ville" value={v?.line1 || ''} onChange={(e) => set(q.key, { line1: e.target.value })} /></div>;
      case 'long_text':
        return <div key={q.key} className="sm:col-span-2">{label}<textarea id={fid} rows={3} className="input" value={v || ''} onChange={(e) => set(q.key, e.target.value)} /></div>;
      case 'number': case 'rating': case 'scale': case 'nps':
        return <div key={q.key}>{label}<input id={fid} type="number" className="input" value={v ?? ''} onChange={(e) => set(q.key, e.target.value === '' ? '' : Number(e.target.value))} /></div>;
      case 'date': case 'time': case 'datetime':
        return <div key={q.key}>{label}<input id={fid} type={q.type === 'datetime' ? 'datetime-local' : q.type} className="input" value={v || ''} onChange={(e) => set(q.key, e.target.value)} /></div>;
      case 'yes_no': case 'consent':
        return <div key={q.key}>{label}<select id={fid} className="input" value={v === true ? 'true' : v === false ? 'false' : ''} onChange={(e) => set(q.key, e.target.value === '' ? '' : e.target.value === 'true')}><option value="">—</option><option value="true">Oui</option><option value="false">Non</option></select></div>;
      case 'single_choice': case 'dropdown': case 'member_picker': case 'event_picker': {
        const opts = q.type === 'member_picker' ? sources.members : q.type === 'event_picker' ? sources.events : optionsOf(q);
        return <div key={q.key}>{label}<select id={fid} className="input" value={v || ''} onChange={(e) => set(q.key, e.target.value)}><option value="">—</option>{opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>;
      }
      case 'multiple_choice': {
        const list = Array.isArray(v) ? v : [];
        return (<fieldset key={q.key} className="sm:col-span-2"><legend className="text-xs font-semibold text-dim">{q.label}</legend>
          <div className="flex flex-wrap gap-3">{optionsOf(q).map(o => (
            <label key={o.value} className="flex items-center gap-1.5 text-sm text-ink"><input type="checkbox" checked={list.includes(o.value)} onChange={(e) => set(q.key, e.target.checked ? [...list, o.value] : list.filter(x => x !== o.value))} />{o.label}</label>
          ))}</div></fieldset>);
      }
      case 'payment':
        return <div key={q.key}>{label}<input id={fid} type="number" step="0.01" className="input" placeholder="Montant (€)" value={v?.amount ?? ''} onChange={(e) => set(q.key, e.target.value === '' ? '' : { amount: Number(e.target.value), currency: 'EUR' })} /></div>;
      default:
        return <div key={q.key}>{label}<input id={fid} type={q.type === 'email' ? 'email' : 'text'} className="input" value={v || ''} onChange={(e) => set(q.key, e.target.value)} /></div>;
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Ajouter une réponse" description="Réponse papier ou saisie au stand : elle déclenche les automatisations comme une réponse en ligne." maxWidth="max-w-2xl"
      footer={<div className="flex gap-2 justify-end"><button type="button" className="btn-secondary" onClick={onClose}>Annuler</button><button type="submit" form={id} className="btn-primary" disabled={!def}>Ajouter</button></div>}>
      <form id={id} onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-form`} className="text-xs font-semibold text-dim">Formulaire</label>
            <select id={`${id}-form`} className="input" value={formId} onChange={(e) => { setFormId(e.target.value); setAnswers({}); setStatus('received'); }}>
              {forms.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-status`} className="text-xs font-semibold text-dim">Statut initial</label>
            <select id={`${id}-status`} className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {statuses.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {questions.filter(q => SUPPORTED.has(q.type)).map(field)}
        </div>
        {questions.some(q => !SUPPORTED.has(q.type) && q.type !== 'calculated' && q.type !== 'variable') && (
          <p className="text-xs text-muted">Non saisissables ici : {questions.filter(q => !SUPPORTED.has(q.type) && q.type !== 'calculated' && q.type !== 'variable').map(q => q.label).join(', ')}.</p>
        )}
        {questions.some(q => q.type === 'payment') && (
          <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> Paiement déjà reçu (déclenche « paiement confirmé »)</label>
        )}
      </form>
    </Modal>
  );
}
