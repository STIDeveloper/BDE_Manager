// Recherche plein texte + filtres multicritères (appliqués au tableau,
// aux statistiques, aux croisements et aux exports).
import { useId, useMemo, useState } from 'react';
import { Search, SlidersHorizontal, Plus, X, RotateCcw } from 'lucide-react';
import { activeFilterCount, EMPTY_FILTERS, operatorsFor, statusesOf, SOURCE_LABEL } from './analytics.js';

const newRuleId = () => Math.random().toString(36).slice(2, 9);

export default function FiltersBar({ ctx }) {
  const uid = useId();
  const { filters, setFilters, def, questions, rows, members, filtered } = ctx;
  const [open, setOpen] = useState(false);
  const n = activeFilterCount(filters);
  const set = patch => setFilters(f => ({ ...f, ...patch }));
  const statuses = statusesOf(def);
  const tags = useMemo(() => [...new Set(rows.flatMap(r => r.tags || []))].sort((a, b) => a.localeCompare(b, 'fr')), [rows]);
  const sources = useMemo(() => [...new Set(rows.map(r => r.source))], [rows]);
  const isQuiz = ctx.columns.some(c => c.id === '__score');
  const filterable = questions.filter(q => q.type !== 'signature' && q.type !== 'file' && (!q.sensitive || ctx.revealed));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[12rem]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <label htmlFor={`${uid}-q`} className="sr-only">Rechercher dans les réponses</label>
          <input id={`${uid}-q`} type="search" className="input pl-9" placeholder="Rechercher dans toutes les réponses…" value={filters.q} onChange={e => set({ q: e.target.value })} />
        </div>
        <button type="button" className={`btn-secondary !py-2 ${n ? '!border-blue-500/50' : ''}`} aria-expanded={open} aria-controls={`${uid}-panel`} onClick={() => setOpen(o => !o)}>
          <SlidersHorizontal size={15} aria-hidden="true" /> Filtres{n ? ` (${n})` : ''}
        </button>
        {n > 0 && <button type="button" className="btn-ghost !py-2 !text-xs" onClick={() => setFilters(EMPTY_FILTERS)}><RotateCcw size={13} aria-hidden="true" /> Réinitialiser</button>}
        <span className="text-xs text-dim" aria-live="polite">{filtered.length} / {rows.length}</span>
      </div>

      {open && (
        <div id={`${uid}-panel`} className="bg-surface border border-line rounded-2xl p-3 space-y-3">
          <fieldset>
            <legend className="text-xs font-medium text-dim mb-1">Statut</legend>
            <div className="flex flex-wrap gap-1.5">
              {statuses.map(s => {
                const on = filters.status.includes(s.id);
                return (
                  <button key={s.id} type="button" aria-pressed={on} className={`chip ${on ? 'chip-active' : 'chip-idle'}`}
                    onClick={() => set({ status: on ? filters.status.filter(x => x !== s.id) : [...filters.status, s.id] })}>{s.label}</button>
                );
              })}
            </div>
          </fieldset>
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <Sel id={`${uid}-tag`} label="Étiquette" value={filters.tag} onChange={v => set({ tag: v })} options={[['', 'Toutes'], ...tags.map(t => [t, t])]} />
            <Sel id={`${uid}-as`} label="Assigné à" value={filters.assignee} onChange={v => set({ assignee: v })}
              options={[['', 'Tous'], ['__none', 'Non assignées'], ...(members || []).map(m => [m.id, [m.firstName, m.lastName].filter(Boolean).join(' ') || m.email || 'Membre'])]} />
            <div>
              <label htmlFor={`${uid}-from`} className="block text-xs font-medium text-dim mb-1">Reçues du</label>
              <input id={`${uid}-from`} type="date" className="input" value={filters.from} onChange={e => set({ from: e.target.value })} />
            </div>
            <div>
              <label htmlFor={`${uid}-to`} className="block text-xs font-medium text-dim mb-1">au</label>
              <input id={`${uid}-to`} type="date" className="input" value={filters.to} onChange={e => set({ to: e.target.value })} />
            </div>
            <Sel id={`${uid}-wl`} label="Liste d'attente" value={filters.waitlisted} onChange={v => set({ waitlisted: v })} options={[['', 'Toutes'], ['yes', 'En liste d\'attente'], ['no', 'Hors liste d\'attente']]} />
            {sources.length > 1 && <Sel id={`${uid}-src`} label="Origine" value={filters.source} onChange={v => set({ source: v })} options={[['', 'Toutes'], ...sources.map(s => [s, SOURCE_LABEL[s] || s])]} />}
            {isQuiz && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor={`${uid}-smin`} className="block text-xs font-medium text-dim mb-1">Score min.</label>
                  <input id={`${uid}-smin`} type="number" className="input" value={filters.scoreMin} onChange={e => set({ scoreMin: e.target.value })} />
                </div>
                <div>
                  <label htmlFor={`${uid}-smax`} className="block text-xs font-medium text-dim mb-1">Score max.</label>
                  <input id={`${uid}-smax`} type="number" className="input" value={filters.scoreMax} onChange={e => set({ scoreMax: e.target.value })} />
                </div>
              </div>
            )}
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-dim">Conditions sur les réponses</legend>
            {filters.rules.map((rule, i) => (
              <RuleRow key={rule.id} rule={rule} questions={filterable} index={i}
                onChange={r => set({ rules: filters.rules.map(x => (x.id === rule.id ? r : x)) })}
                onRemove={() => set({ rules: filters.rules.filter(x => x.id !== rule.id) })} />
            ))}
            {filterable.length > 0 && (
              <button type="button" className="btn-ghost !py-1 !text-xs" onClick={() => {
                const q = filterable[0];
                set({ rules: [...filters.rules, { id: newRuleId(), key: q.key, op: operatorsFor(q.group)[0][0], value: '', value2: '' }] });
              }}><Plus size={13} aria-hidden="true" /> Ajouter une condition</button>
            )}
          </fieldset>
        </div>
      )}
    </div>
  );
}

function Sel({ id, label, value, onChange, options }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-dim mb-1">{label}</label>
      <select id={id} className="input" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

function RuleRow({ rule, questions, onChange, onRemove, index }) {
  const uid = useId();
  const q = questions.find(x => x.key === rule.key) || questions[0];
  if (!q) return null;
  const ops = operatorsFor(q.group);
  const noValue = rule.op === 'empty' || rule.op === 'not_empty';
  const isChoice = ['choice', 'picker', 'slots'].includes(q.group);
  const isNum = ['scale', 'nps', 'number', 'repeat'].includes(q.group);
  const isDate = q.group === 'date';
  return (
    <div className="flex flex-wrap items-end gap-2 p-2 rounded-xl bg-elevated border border-line">
      <div className="min-w-[10rem] flex-1">
        <label htmlFor={`${uid}-k`} className="block text-[11px] text-dim mb-0.5">Question (condition {index + 1})</label>
        <select id={`${uid}-k`} className="input" value={q.key} onChange={e => {
          const nq = questions.find(x => x.key === e.target.value);
          onChange({ ...rule, key: nq.key, op: operatorsFor(nq.group)[0][0], value: '', value2: '' });
        }}>
          {questions.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor={`${uid}-op`} className="block text-[11px] text-dim mb-0.5">Opérateur</label>
        <select id={`${uid}-op`} className="input" value={rule.op} onChange={e => onChange({ ...rule, op: e.target.value })}>
          {ops.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {!noValue && (
        <div className="flex items-end gap-2 flex-1 min-w-[8rem]">
          <div className="flex-1">
            <label htmlFor={`${uid}-v`} className="block text-[11px] text-dim mb-0.5">Valeur</label>
            {isChoice && q.options.length ? (
              <select id={`${uid}-v`} className="input" value={rule.value} onChange={e => onChange({ ...rule, value: e.target.value })}>
                <option value="">—</option>
                {q.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input id={`${uid}-v`} className="input" type={isNum ? 'number' : isDate ? 'date' : 'text'} value={rule.value} onChange={e => onChange({ ...rule, value: e.target.value })} />
            )}
          </div>
          {rule.op === 'between' && (
            <div className="flex-1">
              <label htmlFor={`${uid}-v2`} className="block text-[11px] text-dim mb-0.5">et</label>
              <input id={`${uid}-v2`} className="input" type={isNum ? 'number' : 'date'} value={rule.value2} onChange={e => onChange({ ...rule, value2: e.target.value })} />
            </div>
          )}
        </div>
      )}
      <button type="button" className="btn-ghost !p-2" onClick={onRemove} aria-label={`Retirer la condition ${index + 1}`}><X size={15} aria-hidden="true" /></button>
    </div>
  );
}
