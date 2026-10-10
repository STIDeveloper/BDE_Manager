// Éditeur visuel d'une automatisation : Déclencheur → Conditions → Actions → Test.
import { useEffect, useId, useMemo, useState } from 'react';
import {
  ArrowDown, ArrowUp, Check, FlaskConical, Plus, Save, Trash2, X, AlertTriangle, Loader2, ShieldCheck,
} from 'lucide-react';
import { useStore } from '../../store.js';
import { useCatalog } from '../../core/useCatalog.js';
import { usePermissionSource, can } from '../../core/permissions.js';
import { useFormsStore } from '../../modules/forms/store.js';
import { useEventsStore } from '../../modules/events/store.js';
import { useTasksStore } from '../../modules/tasks/store.js';
import { useFinanceStore } from '../../modules/finance/store.js';
import { getAllTemplates } from '../../documents/registry.js';
import { tryParse } from '../../forms/engine/index.js';
import { toast } from '../../components/ui/toastStore.js';
import { ACTIONS, getAction, defaultParams } from '../actions/index.js';
import { TRIGGERS, CONDITION_EVENTS, OPERATORS, conditionsExpr, normalizeAutomation } from '../model.js';
import { formQuestions, mappingMenu } from '../mapping.js';
import { missingKeys } from '../templates.js';
import { statusesOf, simulateAutomation } from '../pipeline.js';
import { useAutomationsStore } from '../store.js';
import { listServerResponses, serverFormIdOf } from '../server.js';
import { newId } from '../../core/createModuleStore.js';
import ParamField, { InsertMenu } from './ParamField.jsx';
import { SimulationResult } from './RunDetails.jsx';

const STEPS = [
  { id: 'trigger', label: '1. Déclencheur' },
  { id: 'conditions', label: '2. Conditions' },
  { id: 'actions', label: '3. Actions' },
  { id: 'test', label: '4. Tester' },
];
const INFO_FIELDS = [
  { key: 'info.statut', label: 'Statut de la réponse' }, { key: 'info.email', label: 'Email du répondant' },
  { key: 'info.montant', label: 'Montant payé' }, { key: 'info.paiement', label: 'État du paiement' },
];
const selectDefs = s => s.definitions;
const selectMembers = s => s.members;
const selectColumns = s => s.columns;
const selectEvents = s => s.events;
const selectBoards = s => s.boards;
const selectCategories = s => s.categories;
const selectResponses = s => s.responses;

function FormulaField({ id, label, value, onChange, menu, help }) {
  const check = useMemo(() => (String(value || '').trim() ? tryParse(value) : null), [value]);
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-semibold text-dim">{label}</label>
      <textarea id={id} rows={2} className="input font-mono text-xs" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder='ex. age >= 18 ET CONTIENT(activites; "escalade")' aria-invalid={!!check?.error} aria-describedby={`${id}-msg`} />
      <div className="flex flex-wrap items-center gap-2">
        <InsertMenu menu={menu} onInsert={(t) => onChange(`${value || ''}${t.replace(/^\{reponse\./, '').replace(/\|libelle\}$/, '').replace(/[{}]/g, '')}`)} label="Insérer une clé" />
        <span id={`${id}-msg`} className={`text-[11px] ${check?.error ? 'text-rose-500' : 'text-muted'}`} role={check?.error ? 'alert' : undefined}>
          {check?.error ? `Formule invalide : ${check.error.detail || check.error.message}` : (help || 'Langage des formules du Studio Formulaires (SI, ET, OU, CONTIENT, AUJOURDHUI…).')}
        </span>
      </div>
    </div>
  );
}

export default function Editor({ initial, connected, onClose, onSave }) {
  const uid = useId();
  const [draft, setDraft] = useState(() => normalizeAutomation(initial));
  const [step, setStep] = useState('trigger');
  const [saving, setSaving] = useState(false);
  const perm = usePermissionSource();
  const definitions = useFormsStore(selectDefs);
  const membersRaw = useStore(selectMembers);
  const memberColumns = useStore(selectColumns);
  const eventsMap = useEventsStore(selectEvents);
  const boardsMap = useTasksStore(selectBoards);
  const categoriesMap = useFinanceStore(selectCategories);
  const { roleList } = useCatalog();

  const forms = useMemo(() => Object.values(definitions).filter(d => d.status !== 'archived').sort((a, b) => String(a.title).localeCompare(String(b.title), 'fr')), [definitions]);
  const definition = draft.formId ? definitions[draft.formId] || null : null;
  const questions = useMemo(() => formQuestions(definition), [definition]);
  const menu = useMemo(() => mappingMenu(definition), [definition]);
  const statuses = useMemo(() => statusesOf(definition), [definition]);
  const options = useMemo(() => ({
    members: (membersRaw || []).filter(m => m.firstName || m.lastName).map(m => ({ id: m.id, label: [m.firstName, m.lastName].filter(Boolean).join(' ') })).sort((a, b) => a.label.localeCompare(b.label, 'fr')),
    events: Object.values(eventsMap || {}).filter(e => e.status !== 'cancelled').sort((a, b) => String(b.start || '').localeCompare(String(a.start || ''))),
    boards: Object.values(boardsMap || {}).filter(b => !b.archived),
    roleList, memberColumns,
    categories: Object.values(categoriesMap || {}),
    templates: getAllTemplates().filter(t => !t.hidden).sort((a, b) => (a.scope === 'member' ? 0 : 1) - (b.scope === 'member' ? 0 : 1) || String(a.title).localeCompare(String(b.title), 'fr')),
    statuses, menu,
  }), [membersRaw, eventsMap, boardsMap, roleList, memberColumns, categoriesMap, statuses, menu]);

  const set = (patch) => setDraft(d => ({ ...d, ...patch }));
  const setTrigger = (patch) => setDraft(d => ({ ...d, trigger: { ...d.trigger, ...patch } }));
  const setCond = (patch) => setDraft(d => ({ ...d, conditions: { ...d.conditions, ...patch } }));
  const setAction = (i, patch) => setDraft(d => ({ ...d, actions: d.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) }));
  const setParam = (i, key, value) => setDraft(d => ({ ...d, actions: d.actions.map((a, j) => (j === i ? { ...a, params: { ...a.params, [key]: value } } : a)) }));
  const move = (i, dir) => setDraft(d => {
    const list = [...d.actions];
    const j = i + dir;
    if (j < 0 || j >= list.length) return d;
    [list[i], list[j]] = [list[j], list[i]];
    return { ...d, actions: list };
  });

  // ── Contrôles ──
  const missing = useMemo(() => missingKeys(draft, definition), [draft, definition]);
  const problems = useMemo(() => {
    const out = [];
    if (!String(draft.name || '').trim()) out.push('Donne un nom à l\'automatisation.');
    if (!draft.actions.length) out.push('Ajoute au moins une action.');
    draft.actions.forEach((a, i) => {
      const def = getAction(a.type);
      if (!def) { out.push(`Étape ${i + 1} : action inconnue.`); return; }
      def.params.filter(p => p.required).forEach(p => {
        const v = a.params?.[p.key];
        if (v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length)) out.push(`Étape ${i + 1} (${def.label}) : « ${p.label} » est vide.`);
      });
    });
    const exprs = [draft.trigger.type === 'condition' ? draft.trigger.when : '', draft.conditions.formula].filter(x => String(x || '').trim());
    exprs.forEach(x => { if (tryParse(x).error) out.push(`Formule invalide : ${x.slice(0, 50)}`); });
    if (draft.trigger.type === 'condition' && !String(draft.trigger.when || '').trim()) out.push('Le déclencheur « condition remplie » demande une formule.');
    if (connected && draft.formId && !serverFormIdOf(draft.formId)) out.push('Mode connecté : publie d\'abord le formulaire choisi.');
    return out;
  }, [draft, connected]);

  const save = async (activate) => {
    if (activate && problems.length) { toast.error('Impossible d\'activer', problems[0]); return; }
    setSaving(true);
    try {
      const saved = await onSave({ ...draft, enabled: activate === undefined ? draft.enabled : activate });
      toast.success('Automatisation enregistrée', saved?.enabled ? 'Active.' : 'Inactive (brouillon).');
      onClose(saved);
    } catch (err) {
      toast.error('Enregistrement impossible', String(err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  const conditionFieldOptions = [...questions.map(q => ({ key: q.key, label: q.label })), ...INFO_FIELDS];
  const dateQuestions = questions.filter(q => ['date', 'datetime'].includes(q.type));
  // Droits de l'utilisateur courant par action (recalculés si les droits changent).
  const allowedMap = useMemo(() => Object.fromEntries(ACTIONS.map(a => [a.id, !!perm && can(a.capability[0], a.capability[1])])), [perm]);

  return (
    <section className="space-y-4" aria-labelledby={`${uid}-title`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${uid}-title`} className="text-lg font-semibold text-ink">{initial?.createdAt || initial?.serverId ? 'Modifier l\'automatisation' : 'Nouvelle automatisation'}</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={() => onClose(null)}><X size={16} aria-hidden="true" /> Annuler</button>
          <button type="button" className="btn-secondary" disabled={saving} onClick={() => save(undefined)}><Save size={16} aria-hidden="true" /> Enregistrer</button>
          {!draft.enabled && <button type="button" className="btn-primary" disabled={saving} onClick={() => save(true)}><Check size={16} aria-hidden="true" /> Enregistrer et activer</button>}
        </div>
      </div>

      <nav aria-label="Étapes de l'éditeur" className="flex flex-wrap gap-1">
        {STEPS.map(s => (
          <button key={s.id} type="button" onClick={() => setStep(s.id)} aria-current={step === s.id ? 'step' : undefined}
            className={`chip ${step === s.id ? 'chip-active' : 'chip-idle'}`}>{s.label}{s.id === 'actions' ? ` (${draft.actions.length})` : ''}</button>
        ))}
      </nav>

      {(problems.length > 0 || missing.length > 0) && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3 text-sm text-ink space-y-1" role="status">
          {problems.map(p => <p key={p} className="flex gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" aria-hidden="true" />{p}</p>)}
          {missing.length > 0 && <p className="flex gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" aria-hidden="true" />Clés absentes du formulaire choisi : {missing.join(', ')} (elles vaudront vide).</p>}
        </div>
      )}

      {step === 'trigger' && (
        <div className="card p-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`${uid}-name`} className="text-xs font-semibold text-dim">Nom</label>
              <input id={`${uid}-name`} className="input" value={draft.name} onChange={(e) => set({ name: e.target.value })} maxLength={200} />
            </div>
            <div>
              <label htmlFor={`${uid}-form`} className="text-xs font-semibold text-dim">Formulaire</label>
              <select id={`${uid}-form`} className="input" value={draft.formId || ''} onChange={(e) => set({ formId: e.target.value || null })}>
                <option value="">Tous les formulaires</option>
                {forms.map(f => <option key={f.id} value={f.id}>{f.title}{connected && !serverFormIdOf(f.id) ? ' (non publié)' : ''}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor={`${uid}-desc`} className="text-xs font-semibold text-dim">Description (facultatif)</label>
            <textarea id={`${uid}-desc`} rows={2} className="input" value={draft.description || ''} onChange={(e) => set({ description: e.target.value })} />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-dim mb-1">Déclencheur</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {TRIGGERS.map(t => (
                <label key={t.id} className={`card p-3 cursor-pointer flex gap-2 ${draft.trigger.type === t.id ? 'border-blue-500/60' : ''}`}>
                  <input type="radio" name={`${uid}-trigger`} value={t.id} checked={draft.trigger.type === t.id} onChange={() => setTrigger({ type: t.id })} className="mt-1" />
                  <span><span className="block text-sm font-medium text-ink">{t.label}</span><span className="block text-xs text-dim">{t.hint}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          {draft.trigger.type === 'response.status_changed' && (
            <div className="max-w-sm">
              <label htmlFor={`${uid}-tstatus`} className="text-xs font-semibold text-dim">Quand la réponse passe à</label>
              <select id={`${uid}-tstatus`} className="input" value={draft.trigger.status || ''} onChange={(e) => setTrigger({ status: e.target.value || undefined })}>
                <option value="">N'importe quel statut</option>
                {statuses.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          )}
          {draft.trigger.type === 'condition' && (
            <div className="space-y-3">
              <div className="max-w-sm">
                <label htmlFor={`${uid}-ton`} className="text-xs font-semibold text-dim">Vérifier la condition</label>
                <select id={`${uid}-ton`} className="input" value={draft.trigger.on || 'response.created'} onChange={(e) => setTrigger({ on: e.target.value })}>
                  {CONDITION_EVENTS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                </select>
              </div>
              <FormulaField id={`${uid}-when`} label="Condition à remplir" value={draft.trigger.when} onChange={(v) => setTrigger({ when: v })} menu={menu} />
            </div>
          )}
          {draft.trigger.type === 'schedule' && (
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <label htmlFor={`${uid}-sfrom`} className="text-xs font-semibold text-dim">Date de référence</label>
                <select id={`${uid}-sfrom`} className="input" value={draft.trigger.schedule?.from === 'answer' ? `answer:${draft.trigger.schedule.key || ''}` : (draft.trigger.schedule?.from || 'submitted')}
                  onChange={(e) => {
                    const v = e.target.value;
                    setTrigger({ schedule: { ...draft.trigger.schedule, ...(v.startsWith('answer:') ? { from: 'answer', key: v.slice(7) } : { from: v, key: undefined }) } });
                  }}>
                  <option value="submitted">Date de réception de la réponse</option>
                  {dateQuestions.map(q => <option key={q.key} value={`answer:${q.key}`}>Réponse : {q.label}</option>)}
                  <option value="fixed">Date fixe</option>
                </select>
              </div>
              {draft.trigger.schedule?.from === 'fixed' && (
                <div>
                  <label htmlFor={`${uid}-sdate`} className="text-xs font-semibold text-dim">Date</label>
                  <input id={`${uid}-sdate`} type="date" className="input" value={draft.trigger.schedule?.date || ''} onChange={(e) => setTrigger({ schedule: { ...draft.trigger.schedule, date: e.target.value } })} />
                </div>
              )}
              <div>
                <label htmlFor={`${uid}-soff`} className="text-xs font-semibold text-dim">Décalage (jours, négatif = avant)</label>
                <input id={`${uid}-soff`} type="number" className="input" value={draft.trigger.schedule?.offsetDays ?? 0} onChange={(e) => setTrigger({ schedule: { ...draft.trigger.schedule, offsetDays: Number(e.target.value) || 0 } })} />
              </div>
              <div>
                <label htmlFor={`${uid}-stime`} className="text-xs font-semibold text-dim">Heure</label>
                <input id={`${uid}-stime`} type="time" className="input" value={draft.trigger.schedule?.time || '09:00'} onChange={(e) => setTrigger({ schedule: { ...draft.trigger.schedule, time: e.target.value } })} />
              </div>
              <p className="sm:col-span-4 text-xs text-muted">La date est calculée à la réception de la réponse ; l'exécution a lieu au premier passage de l'exécuteur après cette date (application ouverte).</p>
            </div>
          )}
          <label className="flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" className="mt-1" checked={draft.requiresApproval} onChange={(e) => set({ requiresApproval: e.target.checked })} />
            <span><span className="font-medium inline-flex items-center gap-1"><ShieldCheck size={14} aria-hidden="true" /> Validation humaine</span>
              <span className="block text-xs text-dim">Chaque exécution attend un « Approuver » d'une personne ayant le droit Formulaires › valider.</span></span>
          </label>
          <div className="flex justify-end"><button type="button" className="btn-secondary" onClick={() => setStep('conditions')}>Suivant : conditions</button></div>
        </div>
      )}

      {step === 'conditions' && (
        <div className="card p-4 space-y-4">
          <p className="text-sm text-dim">Facultatif : l'automatisation ne s'exécute que si ces conditions sont vraies sur la réponse.</p>
          <fieldset className="flex flex-wrap gap-3 text-sm text-ink">
            <legend className="sr-only">Combinaison des règles</legend>
            <label className="flex items-center gap-2"><input type="radio" name={`${uid}-mode`} checked={draft.conditions.mode !== 'any'} onChange={() => setCond({ mode: 'all' })} /> Toutes les règles (ET)</label>
            <label className="flex items-center gap-2"><input type="radio" name={`${uid}-mode`} checked={draft.conditions.mode === 'any'} onChange={() => setCond({ mode: 'any' })} /> Au moins une règle (OU)</label>
          </fieldset>
          <ul className="space-y-2">
            {draft.conditions.rules.map((r, i) => {
              const op = OPERATORS.find(o => o.id === r.op) || OPERATORS[0];
              const q = questions.find(x => x.key === r.field);
              const upd = (patch) => setCond({ rules: draft.conditions.rules.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
              return (
                <li key={i} className="grid gap-2 sm:grid-cols-[1fr_12rem_1fr_auto] items-end">
                  <div>
                    <label htmlFor={`${uid}-rf${i}`} className="text-[11px] text-dim">Champ</label>
                    <select id={`${uid}-rf${i}`} className="input" value={r.field} onChange={(e) => upd({ field: e.target.value, value: '' })}>
                      {conditionFieldOptions.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                      {!conditionFieldOptions.some(f => f.key === r.field) && <option value={r.field}>{r.field}</option>}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`${uid}-ro${i}`} className="text-[11px] text-dim">Opérateur</label>
                    <select id={`${uid}-ro${i}`} className="input" value={r.op} onChange={(e) => upd({ op: e.target.value })}>
                      {OPERATORS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    {op.needsValue && (<>
                      <label htmlFor={`${uid}-rv${i}`} className="text-[11px] text-dim">Valeur</label>
                      {r.field === 'info.statut' ? (
                        <select id={`${uid}-rv${i}`} className="input" value={r.value || ''} onChange={(e) => upd({ value: e.target.value })}>
                          <option value="">—</option>{statuses.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                      ) : q?.options?.length ? (
                        <select id={`${uid}-rv${i}`} className="input" value={r.value || ''} onChange={(e) => upd({ value: e.target.value })}>
                          <option value="">—</option>{q.options.map(o => <option key={o.value} value={o.value}>{o.label || o.value}</option>)}
                        </select>
                      ) : <input id={`${uid}-rv${i}`} className="input" value={r.value || ''} onChange={(e) => upd({ value: e.target.value })} />}
                    </>)}
                  </div>
                  <button type="button" className="btn-ghost !px-2" aria-label={`Retirer la règle ${i + 1}`} onClick={() => setCond({ rules: draft.conditions.rules.filter((_, j) => j !== i) })}><Trash2 size={14} aria-hidden="true" /></button>
                </li>
              );
            })}
          </ul>
          <button type="button" className="btn-secondary" onClick={() => setCond({ rules: [...draft.conditions.rules, { field: conditionFieldOptions[0]?.key || 'info.statut', op: 'eq', value: '' }] })}><Plus size={14} aria-hidden="true" /> Ajouter une règle</button>
          <FormulaField id={`${uid}-cformula`} label="Formule supplémentaire (ET)" value={draft.conditions.formula} onChange={(v) => setCond({ formula: v })} menu={menu} />
          {conditionsExpr(draft.conditions) && <p className="text-xs text-dim">Formule évaluée : <code className="font-mono text-ink break-all">{conditionsExpr(draft.conditions)}</code></p>}
          <div className="flex justify-end"><button type="button" className="btn-secondary" onClick={() => setStep('actions')}>Suivant : actions</button></div>
        </div>
      )}

      {step === 'actions' && (
        <div className="space-y-3">
          {!draft.actions.length && <p className="card p-4 text-sm text-dim">Aucune action : ajoute la première ci-dessous.</p>}
          {draft.actions.map((a, i) => {
            const def = getAction(a.type);
            const allowed = !!allowedMap[a.type];
            return (
              <article key={a.id} className="card p-4 space-y-3" aria-label={`Étape ${i + 1} : ${def?.label || a.type}`}>
                <header className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted">Étape {i + 1} · {def?.module}</p>
                    <h3 className="font-semibold text-ink">{def?.label || a.type}</h3>
                    <p className="text-xs text-dim">{def?.description}</p>
                    {!allowed && <p className="text-xs text-rose-500 mt-1">Tu n'as pas le droit {def?.capability.join(' › ')} : cette étape échouera si c'est toi qui exécutes.</p>}
                  </div>
                  <div className="flex gap-1">
                    <button type="button" className="btn-ghost !px-2" aria-label={`Monter l'étape ${i + 1}`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} aria-hidden="true" /></button>
                    <button type="button" className="btn-ghost !px-2" aria-label={`Descendre l'étape ${i + 1}`} disabled={i === draft.actions.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} aria-hidden="true" /></button>
                    <button type="button" className="btn-ghost !px-2" aria-label={`Supprimer l'étape ${i + 1}`} onClick={() => setDraft(d => ({ ...d, actions: d.actions.filter((_, j) => j !== i) }))}><Trash2 size={14} aria-hidden="true" /></button>
                  </div>
                </header>
                <div className="grid gap-3 md:grid-cols-2">
                  {(def?.params || []).map(p => (
                    <div key={p.key} className={p.type === 'textarea' || p.type === 'keyvalues' || p.type === 'members' || p.type === 'roles' ? 'md:col-span-2' : ''}>
                      <ParamField param={p} value={a.params?.[p.key]} onChange={(v) => setParam(i, p.key, v)} options={options} allParams={a.params} />
                    </div>
                  ))}
                </div>
                <div>
                  <label htmlFor={`${uid}-alabel${i}`} className="text-[11px] text-dim">Nom de l'étape dans le journal (facultatif)</label>
                  <input id={`${uid}-alabel${i}`} className="input" value={a.label || ''} onChange={(e) => setAction(i, { label: e.target.value || undefined })} />
                </div>
              </article>
            );
          })}
          <AddAction onAdd={(type) => setDraft(d => ({ ...d, actions: [...d.actions, { id: newId(), type, params: defaultParams(type) }] }))} />
          <div className="flex justify-end"><button type="button" className="btn-secondary" onClick={() => setStep('test')}>Suivant : tester</button></div>
        </div>
      )}

      {step === 'test' && <TestPanel draft={draft} definition={definition} connected={connected} />}
    </section>
  );
}

function AddAction({ onAdd }) {
  const id = useId();
  const [type, setType] = useState(ACTIONS[0].id);
  const modules = [...new Set(ACTIONS.map(a => a.module))];
  return (
    <div className="card p-4 flex flex-wrap items-end gap-2">
      <div className="flex-1 min-w-[14rem]">
        <label htmlFor={id} className="text-xs font-semibold text-dim">Ajouter une action</label>
        <select id={id} className="input" value={type} onChange={(e) => setType(e.target.value)}>
          {modules.map(m => <optgroup key={m} label={m}>{ACTIONS.filter(a => a.module === m).map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</optgroup>)}
        </select>
      </div>
      <button type="button" className="btn-primary" onClick={() => onAdd(type)}><Plus size={16} aria-hidden="true" /> Ajouter</button>
    </div>
  );
}

function TestPanel({ draft, definition, connected }) {
  const id = useId();
  const localResponses = useAutomationsStore(selectResponses);
  const [serverList, setServerList] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [responseId, setResponseId] = useState('');
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!connected || !draft.formId) return undefined;
    let alive = true;
    listServerResponses(draft.formId)
      .then(list => { if (alive) { setServerList(list); setLoadError(null); } })
      .catch(err => { if (alive) setLoadError(String(err?.message || err)); });
    return () => { alive = false; };
  }, [connected, draft.formId]);

  const list = useMemo(() => {
    if (connected) return serverList || [];
    return Object.values(localResponses).filter(r => !draft.formId || r.formId === draft.formId)
      .sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
  }, [connected, serverList, localResponses, draft.formId]);
  const response = list.find(r => r.id === responseId) || null;

  const run = async () => {
    if (!response) return;
    setRunning(true);
    try { setResult(await simulateAutomation(normalizeAutomation(draft), response, definition)); } catch (err) { setResult({ error: String(err?.message || err) }); } finally { setRunning(false); }
  };

  const labelOf = (r) => `${new Date(r.submittedAt).toLocaleString('fr-FR')} — ${r.respondent?.email || r.answers?.email || 'réponse'} (${r.status})`;

  return (
    <div className="card p-4 space-y-3">
      <p className="text-sm text-dim flex gap-2"><FlaskConical size={16} className="shrink-0 mt-0.5" aria-hidden="true" />Simulation sur une réponse existante : les conditions et chaque action sont évaluées, <strong className="text-ink">sans aucune écriture</strong> (aucun membre, document, opération… n'est créé).</p>
      {loadError && <p className="text-sm text-rose-500" role="alert">{loadError}</p>}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[14rem]">
          <label htmlFor={id} className="text-xs font-semibold text-dim">Réponse</label>
          <select id={id} className="input" value={responseId} onChange={(e) => { setResponseId(e.target.value); setResult(null); }}>
            <option value="">{list.length ? '— Choisir une réponse —' : 'Aucune réponse disponible'}</option>
            {list.map(r => <option key={r.id} value={r.id}>{labelOf(r)}</option>)}
          </select>
        </div>
        <button type="button" className="btn-primary" disabled={!response || running} onClick={run}>
          {running ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <FlaskConical size={16} aria-hidden="true" />} Simuler
        </button>
      </div>
      {!connected && !list.length && <p className="text-xs text-muted">Ajoute une réponse dans l'onglet « Réponses locales » (ou via la borne) pour tester.</p>}
      {result && (result.error ? <p className="text-sm text-rose-500" role="alert">{result.error}</p> : <SimulationResult result={result} />)}
    </div>
  );
}
