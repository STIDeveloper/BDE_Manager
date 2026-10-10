// Éditeur d'un paramètre d'action : valeur fixe (listes du BDE) ou mappée
// depuis la réponse (jetons {reponse.cle}, formules « = … »).
import { useId, useRef, useState } from 'react';
import { Plus, Trash2, Braces } from 'lucide-react';
import { getTemplate } from '../../documents/registry.js';

const isMapped = (v) => typeof v === 'string' && (v.includes('{') || v.trim().startsWith('='));
const FIXED_TYPES = new Set(['select', 'member', 'event', 'board', 'column-tasks', 'column-members', 'template', 'status', 'role', 'category', 'boolean', 'members']);

/** Menu « insérer un champ de la réponse » (liste déroulante accessible). */
export function InsertMenu({ menu, onInsert, label = 'Insérer un champ' }) {
  const id = useId();
  if (!menu?.length) return null;
  const groups = [...new Set(menu.map(m => m.group))];
  return (
    <span className="inline-flex items-center gap-1 max-w-full min-w-0">
      <label htmlFor={id} className="sr-only">{label}</label>
      <select id={id} value="" className="input !py-1 text-xs max-w-full sm:!w-auto truncate" onChange={(e) => { if (e.target.value) onInsert(e.target.value); }}>
        <option value="">{label}…</option>
        {groups.map(g => (
          <optgroup key={g} label={g}>
            {menu.filter(m => m.group === g).map(m => <option key={m.token} value={m.token}>{m.label} — {m.token}</option>)}
          </optgroup>
        ))}
      </select>
    </span>
  );
}

function TextInput({ id, value, onChange, multiline, menu, placeholder }) {
  const ref = useRef(null);
  const insert = (token) => {
    const el = ref.current;
    const cur = String(value ?? '');
    if (el && typeof el.selectionStart === 'number' && document.activeElement !== null) {
      const s = el.selectionStart;
      const e = el.selectionEnd;
      onChange(cur.slice(0, s) + token + cur.slice(e));
    } else onChange(cur + token);
  };
  const common = { id, ref, value: value ?? '', onChange: (e) => onChange(e.target.value), placeholder, className: 'input font-mono text-xs' };
  return (
    <div className="space-y-1">
      {multiline ? <textarea rows={3} {...common} /> : <input type="text" {...common} />}
      <InsertMenu menu={menu} onInsert={insert} />
    </div>
  );
}

export default function ParamField({ param, value, onChange, options, allParams }) {
  const id = useId();
  const mappable = param.mappable !== false;
  const [forceMapped, setForceMapped] = useState(false);
  const mapped = forceMapped || isMapped(value);
  const showToggle = mappable && FIXED_TYPES.has(param.type);
  const { members = [], events = [], boards = [], roleList = [], categories = [], templates = [], statuses = [], memberColumns = [], menu = [] } = options;

  const fixed = () => {
    switch (param.type) {
      case 'textarea': return <TextInput id={id} value={value} onChange={onChange} multiline menu={mappable ? menu : null} />;
      case 'number': case 'text': return <TextInput id={id} value={value} onChange={onChange} menu={mappable ? menu : null} />;
      case 'boolean':
        return (
          <select id={id} className="input" value={value === true || value === 'true' ? 'true' : 'false'} onChange={(e) => onChange(e.target.value === 'true')}>
            <option value="true">Oui</option><option value="false">Non</option>
          </select>
        );
      case 'select':
        return (
          <select id={id} className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
            {(param.options || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        );
      case 'member':
        return (
          <select id={id} className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
            <option value="">— Aucun —</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        );
      case 'members': {
        const list = Array.isArray(value) ? value : [];
        return (
          <fieldset className="max-h-40 overflow-auto rounded-lg border border-line p-2 space-y-1">
            <legend className="sr-only">{param.label}</legend>
            {!members.length && <p className="text-xs text-muted">Aucun membre.</p>}
            {members.map(m => (
              <label key={m.id} className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={list.includes(m.id)} onChange={(e) => onChange(e.target.checked ? [...list, m.id] : list.filter(x => x !== m.id))} />
                {m.label}
              </label>
            ))}
          </fieldset>
        );
      }
      case 'roles': {
        const list = Array.isArray(value) ? value : [];
        return (
          <fieldset className="max-h-40 overflow-auto rounded-lg border border-line p-2 space-y-1">
            <legend className="sr-only">{param.label}</legend>
            {roleList.map(r => (
              <label key={r.id} className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={list.includes(r.id)} onChange={(e) => onChange(e.target.checked ? [...list, r.id] : list.filter(x => x !== r.id))} />
                {r.label}
              </label>
            ))}
          </fieldset>
        );
      }
      case 'role':
        return (
          <select id={id} className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
            <option value="">— Aucun —</option>
            {roleList.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        );
      case 'event':
        return (
          <select id={id} className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
            <option value="">— Choisir un événement —</option>
            {events.map(ev => <option key={ev.id} value={ev.id}>{ev.title}{ev.start ? ` (${String(ev.start).slice(0, 10)})` : ''}</option>)}
          </select>
        );
      case 'board':
        return (
          <select id={id} className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
            {boards.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
        );
      case 'column-tasks': {
        const board = boards.find(b => b.id === allParams?.board) || boards[0];
        return (
          <select id={id} className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
            <option value="">— Première colonne —</option>
            {(board?.columns || []).map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        );
      }
      case 'column-members':
        return (
          <select id={id} className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
            <option value="">— Première colonne —</option>
            {memberColumns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        );
      case 'template':
        return (
          <select id={id} className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
            {templates.map(t => <option key={t.id} value={t.id}>{t.title}{t.scope === 'member' ? '' : ' (sans membre)'}</option>)}
          </select>
        );
      case 'status':
        return (
          <select id={id} className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
            <option value="">— Choisir —</option>
            {statuses.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        );
      case 'category':
        return (
          <select id={id} className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
            {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        );
      case 'keyvalues':
        return <KeyValues value={value} onChange={onChange} menu={menu} templateId={allParams?.templateId} />;
      default:
        return <TextInput id={id} value={value} onChange={onChange} menu={menu} />;
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-semibold text-dim">
          {param.label}{param.required && <span className="text-rose-500" aria-hidden="true"> *</span>}
        </label>
        {showToggle && (
          <button type="button" className="btn-ghost !px-2 !py-0.5 text-xs" aria-pressed={mapped}
            onClick={() => {
              if (mapped) { setForceMapped(false); onChange(param.type === 'members' || param.type === 'roles' ? [] : (param.type === 'boolean' ? false : '')); } else { setForceMapped(true); onChange(''); }
            }}>
            <Braces size={12} aria-hidden="true" /> {mapped ? 'Valeur fixe' : 'Depuis la réponse'}
          </button>
        )}
      </div>
      {mapped && showToggle ? <TextInput id={id} value={Array.isArray(value) ? '' : value} onChange={onChange} menu={menu} placeholder="{reponse.cle} ou =formule" /> : fixed()}
      {param.help && <p className="text-[11px] text-muted">{param.help}</p>}
    </div>
  );
}

function KeyValues({ value, onChange, menu, templateId }) {
  const rows = Array.isArray(value) ? value : [];
  const fields = (getTemplate(templateId)?.fields || []).filter(f => f.key);
  const listId = useId();
  const set = (i, patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      <datalist id={listId}>{fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}</datalist>
      {!rows.length && <p className="text-xs text-muted">Valeurs par défaut du modèle.</p>}
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-1 sm:grid-cols-[10rem_1fr_auto] gap-2 items-start">
          <input aria-label={`Champ ${i + 1}`} list={listId} className="input text-xs" placeholder="clé du champ" value={r.key || ''} onChange={(e) => set(i, { key: e.target.value })} />
          <TextInput value={r.value} onChange={(v) => set(i, { value: v })} menu={menu} />
          <button type="button" className="btn-ghost !px-2" aria-label={`Retirer la valeur ${r.key || i + 1}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}><Trash2 size={14} aria-hidden="true" /></button>
        </div>
      ))}
      <button type="button" className="btn-secondary !py-1 text-xs" onClick={() => onChange([...rows, { key: '', value: '' }])}><Plus size={12} aria-hidden="true" /> Ajouter une valeur</button>
    </div>
  );
}
