// ============================================================
// Onglet « Logique » : règles de pages, variables calculées,
// réponses d'essai, vue d'ensemble des conditions.
// ============================================================
import { useId, useMemo } from 'react';
import { ArrowDown, ArrowUp, CornerDownRight, Plus, RotateCcw, Trash2, Variable } from 'lucide-react';
import { KEY_RX, QUESTION_TYPES } from '../../../forms/schema.js';
import { evaluateForm, flattenItems, newKeyFromLabel, RESERVED_KEYS } from '../../../forms/engine/index.js';
import { updatePage, usedKeys, itemLabel } from '../defOps.js';
import { Panel, Field } from '../ui.jsx';
import { ConditionEditor, FormulaInput } from './Formula.jsx';

const TYPE_LABEL = Object.fromEntries(QUESTION_TYPES.map(t => [t.type, t.label]));

function cleanLogic(logic) {
  const out = { ...logic };
  if (!out.showIf) delete out.showIf;
  if (!out.next?.length) delete out.next;
  return Object.keys(out).length ? out : undefined;
}

/** Règles « aller à la page X si … » d'une page. */
export function PageRules({ def, page, update }) {
  const rules = page.logic?.next || [];
  const index = def.pages.findIndex(p => p.id === page.id);
  const setRules = (next, opts = { snapshot: 'Règles de page' }) => update(d => updatePage(d, page.id, p => ({ ...p, logic: cleanLogic({ ...(p.logic || {}), next }) })), opts);
  const targets = def.pages.filter(p => p.id !== page.id);
  const uid = useId();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-ink">Après cette page</h4>
        <span className="text-[11px] text-muted">{rules.length ? `${rules.length} règle${rules.length > 1 ? 's' : ''}` : 'page suivante'}</span>
      </div>
      {rules.map((r, i) => (
        <div key={i} className="border border-line rounded-xl p-2 space-y-2 bg-surface">
          <div className="flex items-center gap-1.5">
            <CornerDownRight size={14} className="text-muted shrink-0" aria-hidden="true" />
            <label htmlFor={`${uid}-g${i}`} className="text-xs text-dim shrink-0">Aller à</label>
            <select id={`${uid}-g${i}`} className="input !py-1 text-xs" value={r.goTo} onChange={e => setRules(rules.map((x, j) => (j === i ? { ...x, goTo: e.target.value } : x)))}>
              {targets.map(p => {
                const pi = def.pages.findIndex(x => x.id === p.id);
                return <option key={p.id} value={p.id}>{pi < index ? '↑ ' : ''}Page {pi + 1} — {p.title || 'sans titre'}</option>;
              })}
              <option value="submit">Fin du formulaire (envoi)</option>
            </select>
            <button type="button" className="btn-ghost !p-1" disabled={i === 0} aria-label={`Monter la règle ${i + 1}`} onClick={() => { const n = [...rules]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setRules(n); }}><ArrowUp size={13} aria-hidden="true" /></button>
            <button type="button" className="btn-ghost !p-1" disabled={i === rules.length - 1} aria-label={`Descendre la règle ${i + 1}`} onClick={() => { const n = [...rules]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setRules(n); }}><ArrowDown size={13} aria-hidden="true" /></button>
            <button type="button" className="btn-ghost !p-1" aria-label={`Supprimer la règle ${i + 1}`} onClick={() => setRules(rules.filter((_, j) => j !== i))}><Trash2 size={13} aria-hidden="true" /></button>
          </div>
          <ConditionEditor label="si" emptyLabel="Toujours (règle par défaut)" def={def} value={r.when} onChange={v => setRules(rules.map((x, j) => (j === i ? { ...x, when: v } : x)), { coalesce: `rule:${page.id}:${i}` })} />
        </div>
      ))}
      <button type="button" className="btn-secondary !py-1 text-xs w-full" disabled={!targets.length && false} onClick={() => setRules([...rules, { when: '', goTo: targets.find((p) => def.pages.indexOf(p) > index)?.id || 'submit' }])}>
        <Plus size={13} aria-hidden="true" /> Ajouter une règle de saut
      </button>
      <p className="text-[11px] text-muted">Les règles sont évaluées dans l'ordre ; si aucune ne s'applique, le répondant passe à la page suivante visible.</p>
    </div>
  );
}

export default function LogicTab({ def, update, testAnswers, setTestAnswers, context, onSelect }) {
  const ev = useMemo(() => {
    try { return evaluateForm(def, testAnswers, { now: new Date(), params: {}, member: null }); } catch { return null; }
  }, [def, testAnswers]);

  return (
    <div className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-4 items-start">
      <div className="space-y-4 min-w-0">
        <Panel title="Parcours entre les pages" description="Affiche des pages sous condition et crée des sauts (« aller à la page X si … »).">
          {def.pages.length < 2 ? <p className="text-xs text-muted">Ajoute une deuxième page pour créer un parcours conditionnel.</p> : (
            <ol className="space-y-3">
              {def.pages.map((p, i) => (
                <li key={p.id} className="border border-line rounded-xl p-3 space-y-2 bg-elevated/40">
                  <div className="flex items-center justify-between gap-2">
                    <button type="button" className="text-sm font-semibold text-ink text-left hover:underline" onClick={() => onSelect({ kind: 'page', id: p.id, tab: 'build' })}>Page {i + 1} — {p.title || 'sans titre'}</button>
                    {ev && <span className={`badge ${ev.visiblePages?.includes?.(p.id) || ev.pageOrder?.includes?.(p.id) ? 'badge-emerald' : 'badge-neutral'}`}>{ev.visiblePages?.includes?.(p.id) || ev.pageOrder?.includes?.(p.id) ? 'visible (essai)' : 'masquée (essai)'}</span>}
                  </div>
                  <ConditionEditor label="Afficher la page si" emptyLabel="Toujours affichée" def={def} value={p.logic?.showIf}
                    onChange={v => update(d => updatePage(d, p.id, pp => ({ ...pp, logic: cleanLogic({ ...(pp.logic || {}), showIf: v }) })), { coalesce: `pshow:${p.id}` })} />
                  <PageRules def={def} page={p} update={update} />
                </li>
              ))}
            </ol>
          )}
        </Panel>
        <ConditionsOverview def={def} ev={ev} onSelect={onSelect} />
      </div>
      <div className="space-y-4 min-w-0">
        <VariablesPanel def={def} update={update} ev={ev} />
        <TestAnswers def={def} testAnswers={testAnswers} setTestAnswers={setTestAnswers} context={context} ev={ev} />
      </div>
    </div>
  );
}

function VariablesPanel({ def, update, ev }) {
  const vars = def.variables || [];
  const setVars = (next, opts) => update(d => ({ ...d, variables: next }), opts);
  const add = () => {
    const key = newKeyFromLabel('variable', usedKeys(def));
    setVars([...vars, { key, label: '', type: 'number', expr: '' }], { snapshot: 'Variable ajoutée' });
  };
  return (
    <Panel title="Variables calculées" description="Valeurs intermédiaires réutilisables dans les conditions, les montants et les champs calculés."
      actions={<button type="button" className="btn-secondary !py-1 text-xs" onClick={add}><Plus size={13} aria-hidden="true" /> Variable</button>}>
      {!vars.length && <p className="text-xs text-muted">Aucune variable. Exemple : <code className="font-mono">tarif</code> = <code className="font-mono">CHOIX(formule; "complete"; 45; 20) - SI(adherent; 5; 0)</code>.</p>}
      <ul className="space-y-3">
        {vars.map((v, i) => <VariableRow key={i} def={def} v={v} index={i} vars={vars} setVars={setVars} value={ev?.computed?.[v.key]} />)}
      </ul>
    </Panel>
  );
}

function VariableRow({ def, v, index, vars, setVars, value }) {
  const others = useMemo(() => {
    const s = usedKeys({ ...def, variables: vars.filter((_, j) => j !== index) });
    return s;
  }, [def, vars, index]);
  const keyError = !KEY_RX.test(v.key || '') ? 'Nom invalide (minuscules, chiffres, _).' : RESERVED_KEYS.has(v.key) ? 'Nom réservé.' : others.has(v.key) ? 'Nom déjà utilisé.' : null;
  const set = (patch, coalesce) => setVars(vars.map((x, j) => (j === index ? { ...x, ...patch } : x)), coalesce ? { coalesce: `var:${index}:${coalesce}` } : { snapshot: 'Variable' });
  const shown = value === null || value === undefined || value === '' ? '(vide)' : typeof value === 'boolean' ? (value ? 'VRAI' : 'FAUX') : typeof value === 'number' ? value.toLocaleString('fr-FR') : String(value);
  return (
    <li className="border border-line rounded-xl p-2.5 space-y-2 bg-surface">
      <div className="flex items-center gap-2">
        <Variable size={15} className="text-violet-600 shrink-0" aria-hidden="true" />
        <span className="text-xs font-mono text-ink truncate flex-1">{v.key}</span>
        <span className="badge badge-violet" title="Valeur avec les réponses d'essai">= {shown}</span>
        <button type="button" className="btn-ghost !p-1" aria-label={`Supprimer la variable ${v.key}`} onClick={() => setVars(vars.filter((_, j) => j !== index), { snapshot: 'Variable supprimée' })}><Trash2 size={13} aria-hidden="true" /></button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Nom (clé)" error={keyError}>{id => <input id={id} className="input !py-1 font-mono text-xs" value={v.key} onChange={e => set({ key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') }, 'key')} />}</Field>
        <Field label="Libellé">{id => <input id={id} className="input !py-1 text-xs" value={v.label || ''} onChange={e => set({ label: e.target.value }, 'label')} />}</Field>
        <Field label="Type">
          {id => (
            <select id={id} className="input !py-1 text-xs" value={v.type || 'text'} onChange={e => set({ type: e.target.value })}>
              <option value="number">Nombre</option><option value="text">Texte</option><option value="boolean">Oui/Non</option><option value="date">Date</option>
            </select>
          )}
        </Field>
      </div>
      <FormulaInput label="Formule" def={{ ...def, variables: vars }} excludeKey={v.key} value={v.expr || ''} onChange={x => set({ expr: x }, 'expr')} extraInfo={`Valeur d'essai : ${shown}.`} />
    </li>
  );
}

function TestAnswers({ def, testAnswers, setTestAnswers, ev }) {
  const uid = useId();
  const questions = useMemo(() => flattenItems(def).filter(e => e.item.kind === 'question' && !e.repeatKey && !['calculated', 'file', 'signature', 'payment', 'matrix', 'ranking', 'address', 'name'].includes(e.item.type)), [def]);
  const set = (key, value) => {
    const next = { ...testAnswers };
    if (value === '' || value === undefined || (Array.isArray(value) && !value.length)) delete next[key];
    else next[key] = value;
    setTestAnswers(next);
  };
  return (
    <Panel title="Réponses d'essai" description="Simule des réponses pour vérifier conditions, sauts et calculs (partagées avec l'aperçu)."
      actions={<button type="button" className="btn-ghost !py-1 text-xs" onClick={() => setTestAnswers({})}><RotateCcw size={13} aria-hidden="true" /> Réinitialiser l'essai</button>}>
      {!questions.length ? <p className="text-xs text-muted">Aucune question à simuler.</p> : (
        <ul className="space-y-2 max-h-[28rem] overflow-auto pr-1">
          {questions.map(({ item }) => {
            const id = `${uid}-${item.key}`;
            const v = testAnswers[item.key];
            const hidden = ev && ev.visible && typeof ev.visible.has === 'function' && !ev.visible.has(item.key);
            let control;
            if (item.type === 'yes_no' || item.type === 'consent') {
              control = (
                <select id={id} className="input !py-1 text-xs" value={v === true ? 'oui' : v === false ? 'non' : ''} onChange={e => set(item.key, e.target.value === 'oui' ? true : e.target.value === 'non' ? false : '')}>
                  <option value="">—</option><option value="oui">Oui</option><option value="non">Non</option>
                </select>
              );
            } else if (Array.isArray(item.options) && (item.type === 'multiple_choice' || (item.type === 'slots' && item.multiple))) {
              const arr = Array.isArray(v) ? v : [];
              control = (
                <div id={id} className="flex flex-wrap gap-1">
                  {item.options.map(o => {
                    const on = arr.includes(o.value);
                    return <button key={String(o.value)} type="button" aria-pressed={on} className={`chip !py-0.5 text-[11px] ${on ? 'chip-active' : 'chip-idle'}`} onClick={() => set(item.key, on ? arr.filter(x => x !== o.value) : [...arr, o.value])}>{o.label}</button>;
                  })}
                </div>
              );
            } else if (Array.isArray(item.options)) {
              control = (
                <select id={id} className="input !py-1 text-xs" value={v ?? ''} onChange={e => set(item.key, e.target.value)}>
                  <option value="">—</option>
                  {item.options.map(o => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
                </select>
              );
            } else if (['number', 'rating', 'scale', 'nps'].includes(item.type)) {
              control = <input id={id} type="number" className="input !py-1 text-xs" value={v ?? ''} onChange={e => set(item.key, e.target.value === '' ? '' : Number(e.target.value))} />;
            } else {
              const type = item.type === 'date' ? 'date' : item.type === 'time' ? 'time' : item.type === 'datetime' ? 'datetime-local' : 'text';
              control = <input id={id} type={type} className="input !py-1 text-xs" value={v ?? ''} onChange={e => set(item.key, e.target.value)} />;
            }
            return (
              <li key={item.key} className={`grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-2 items-center ${hidden ? 'opacity-50' : ''}`}>
                <label htmlFor={id} className="text-xs text-ink truncate" title={`${item.label} (${item.key})`}>
                  {item.label || item.key}
                  <span className="block text-[10px] text-muted font-mono">{item.key}{hidden ? ' · masquée' : ''}</span>
                </label>
                {control}
              </li>
            );
          })}
        </ul>
      )}
      {ev && Object.keys(ev.computed || {}).length > 0 && (
        <div className="border-t border-line pt-2">
          <p className="text-[11px] font-medium text-dim mb-1">Valeurs calculées</p>
          <ul className="flex flex-wrap gap-1.5">
            {Object.entries(ev.computed).map(([k, val]) => <li key={k} className="badge badge-violet font-mono">{k} = {val === null || val === undefined || val === '' ? '(vide)' : String(val)}</li>)}
          </ul>
          {typeof ev.score === 'number' && <p className="text-[11px] text-dim mt-1">Score : {ev.score} / {ev.maxScore}</p>}
        </div>
      )}
    </Panel>
  );
}

function ConditionsOverview({ def, ev, onSelect }) {
  const rows = useMemo(() => flattenItems(def).filter(e => e.item.showIf || typeof e.item.required === 'string' || e.item.readOnlyIf || e.item.options?.some(o => o?.showIf)), [def]);
  return (
    <Panel title="Toutes les conditions" description="Éléments affichés, obligatoires ou verrouillés sous condition.">
      {!rows.length ? <p className="text-xs text-muted">Aucune condition pour l'instant. Sélectionne une question puis l'onglet « Logique » de ses propriétés.</p> : (
        <ul className="divide-y divide-line">
          {rows.map(({ item }) => {
            const visible = ev?.visible && item.key ? ev.visible.has(item.key) : null;
            return (
              <li key={item.id} className="py-2">
                <button type="button" onClick={() => onSelect({ kind: 'item', id: item.id, tab: 'build' })} className="w-full text-left rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60">
                  <span className="text-xs font-medium text-ink">{itemLabel(item)}</span>
                  {item.kind === 'question' && <span className="text-[10px] text-muted ml-1">{TYPE_LABEL[item.type]}</span>}
                  {visible !== null && <span className={`badge ml-2 ${visible ? 'badge-emerald' : 'badge-neutral'}`}>{visible ? 'visible' : 'masquée'} (essai)</span>}
                  {item.showIf && <span className="block text-[11px] font-mono text-dim">si {item.showIf}</span>}
                  {typeof item.required === 'string' && <span className="block text-[11px] font-mono text-dim">obligatoire si {item.required}</span>}
                  {item.readOnlyIf && <span className="block text-[11px] font-mono text-dim">lecture seule si {item.readOnlyIf}</span>}
                  {item.options?.some(o => o?.showIf) && <span className="block text-[11px] text-dim">options conditionnelles</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

