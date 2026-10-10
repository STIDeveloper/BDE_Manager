import { useId, useMemo, useState } from 'react';
import { RotateCcw, Search, UserRound } from 'lucide-react';
import { LinesEditor, ResolutionsEditor } from './RowEditors';
import { memberMatchesPicker, memberName, normalizeOptions, numberInputValue, parseListText } from './studioHelpers';

const labelCls = 'text-[13px] font-semibold text-ink';
const inputCls = (invalid) => `input ${invalid ? 'border-red-500 focus:border-red-500 focus:ring-red-500/10' : ''}`;

/**
 * Champ de formulaire dynamique d'un modèle (tous les types du contrat).
 *
 * @param {{
 *   field: object, value: any, onChange: (v:any)=>void, error?: string,
 *   perMember?: boolean,       // valeur propre à chaque membre (non modifiée)
 *   onResetDefault?: ()=>void, // rétablir la valeur par défaut (par membre)
 *   members: object[],         // membres triés
 *   catalog: object,           // useCatalog()
 *   domId: string,             // id DOM du contrôle principal (focus sur erreur)
 *   ctx: object,               // contexte de génération (options calculées)
 * }} props
 */
export default function FormField({ field, value, onChange, error, perMember, onResetDefault, members, catalog, domId, ctx }) {
  const helpId = `${domId}-help`;
  const errId = `${domId}-err`;
  const describedBy = [field.help || perMember ? helpId : null, error ? errId : null].filter(Boolean).join(' ') || undefined;
  const common = { id: domId, 'aria-invalid': !!error || undefined, 'aria-describedby': describedBy, 'aria-required': field.required || undefined };

  const label = (
    <span className={labelCls}>
      {field.label}
      {field.required && <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>}
    </span>
  );

  const help = (field.help || perMember || onResetDefault) && (
    <div id={helpId} className="text-xs text-dim mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {field.help && <span>{field.help}</span>}
      {perMember && <span className="text-blue-600 dark:text-blue-400">Valeur calculée pour chaque membre (modifie-la pour l'imposer à tous).</span>}
      {onResetDefault && (
        <button type="button" onClick={onResetDefault} className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 rounded">
          <RotateCcw size={11} aria-hidden="true" /> Valeur propre à chaque membre
        </button>
      )}
    </div>
  );

  const errorMsg = error && <p id={errId} className="text-xs text-red-500 mt-1">{error}</p>;

  // Groupes de contrôles → fieldset / legend.
  if (['members', 'resolutions', 'lines'].includes(field.type)) {
    return (
      <fieldset className="min-w-0" aria-describedby={describedBy}>
        <legend className="mb-1.5">{label}</legend>
        {field.type === 'members' && (
          <MembersChecklist value={value} onChange={onChange} members={members} catalog={catalog} domId={domId} invalid={!!error} />
        )}
        {field.type === 'resolutions' && <ResolutionsEditor value={value} onChange={onChange} invalid={!!error} />}
        {field.type === 'lines' && <LinesEditor value={value} onChange={onChange} invalid={!!error} />}
        {help}
        {errorMsg}
      </fieldset>
    );
  }

  if (field.type === 'checkbox') {
    return (
      <div>
        <label htmlFor={domId} className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-line bg-elevated/40 px-3 py-2.5 hover:border-line-strong">
          <input type="checkbox" {...common} checked={!!value} onChange={(e) => onChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-blue-600 shrink-0" />
          <span className="text-sm text-ink">{field.label}{field.required && <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>}</span>
        </label>
        {help}
        {errorMsg}
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={domId} className="block mb-1">{label}</label>
      <Control field={field} value={value} onChange={onChange} common={common} invalid={!!error} members={members} catalog={catalog} ctx={ctx} />
      {help}
      {errorMsg}
    </div>
  );
}

function Control({ field, value, onChange, common, invalid, members, catalog, ctx }) {
  const v = value ?? '';
  switch (field.type) {
    case 'textarea':
      return <textarea {...common} className={`${inputCls(invalid)} min-h-[96px] leading-relaxed`} value={v} placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)} />;
    case 'date':
      return <input {...common} type="date" className={inputCls(invalid)} value={v} min={field.min} max={field.max} onChange={(e) => onChange(e.target.value)} />;
    case 'time':
      return <input {...common} type="time" className={inputCls(invalid)} value={v} onChange={(e) => onChange(e.target.value)} />;
    case 'number':
      return <input {...common} type="number" inputMode="decimal" className={`${inputCls(invalid)} tabular-nums`} value={v}
        min={field.min} max={field.max} placeholder={field.placeholder} onChange={(e) => onChange(numberInputValue(e.target.value))} />;
    case 'money':
      return (
        <div className="relative">
          <input {...common} type="number" step="0.01" min={field.min ?? 0} max={field.max} inputMode="decimal"
            className={`${inputCls(invalid)} pr-8 tabular-nums`} value={v} placeholder={field.placeholder || '0,00'}
            onChange={(e) => onChange(numberInputValue(e.target.value))} />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted pointer-events-none" aria-hidden="true">€</span>
        </div>
      );
    case 'select': {
      const options = resolveOptions(field, ctx);
      return (
        <select {...common} className={inputCls(invalid)} value={String(v)} onChange={(e) => onChange(e.target.value)}>
          {!field.required && !options.some(o => o.value === '') && <option value="">—</option>}
          {field.required && !options.some(o => o.value === String(v)) && <option value="" disabled>Choisir…</option>}
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    case 'member':
      return (
        <select {...common} className={inputCls(invalid)} value={v} onChange={(e) => onChange(e.target.value)}>
          <option value="">{field.required ? 'Choisir un membre…' : '— Aucun / par défaut —'}</option>
          {members.map(m => (
            <option key={m.id} value={m.id}>
              {memberName(m)}{catalog.roles[m.mainRole] ? ` — ${catalog.roles[m.mainRole].label}` : ''}
            </option>
          ))}
        </select>
      );
    case 'role':
      return (
        <select {...common} className={inputCls(invalid)} value={v} onChange={(e) => onChange(e.target.value)}>
          <option value="">{field.required ? 'Choisir un rôle…' : '—'}</option>
          {catalog.poleList.map(p => (catalog.rolesByPole[p.id]?.length ? (
            <optgroup key={p.id} label={p.label}>
              {catalog.rolesByPole[p.id].map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </optgroup>
          ) : null))}
        </select>
      );
    case 'list':
      return <ListTextarea common={common} value={value} onChange={onChange} invalid={invalid} placeholder={field.placeholder} />;
    case 'text':
    default:
      return <input {...common} type="text" className={inputCls(invalid)} value={v} placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)} />;
  }
}

/** Options d'un select : tableau, ou fonction (ctx) => options. */
function resolveOptions(field, ctx) {
  if (typeof field.options !== 'function') return normalizeOptions(field.options);
  try { return normalizeOptions(field.options(ctx)); } catch { return []; }
}

/**
 * Liste « une ligne par élément ». Le texte brut est conservé localement
 * (lignes vides en cours de frappe) ; la valeur transmise est le tableau
 * des lignes non vides.
 */
function ListTextarea({ common, value, onChange, invalid, placeholder }) {
  const list = Array.isArray(value) ? value : [];
  const [text, setText] = useState(() => list.join('\n'));
  // Valeur modifiée de l'extérieur (réinitialisation…) → resynchronisation.
  if (JSON.stringify(parseListText(text)) !== JSON.stringify(list)) setText(list.join('\n'));
  const count = list.length;
  return (
    <>
      <textarea {...common} className={`${inputCls(invalid)} min-h-[96px] leading-relaxed`} value={text}
        placeholder={placeholder || 'Un élément par ligne'}
        onChange={(e) => { setText(e.target.value); onChange(parseListText(e.target.value)); }} />
      <p className="text-[11px] text-muted mt-0.5 text-right tabular-nums" aria-live="polite">
        {count} élément{count > 1 ? 's' : ''} · un par ligne
      </p>
    </>
  );
}

/** Champ « members » : cases à cocher avec recherche. */
function MembersChecklist({ value, onChange, members, catalog, domId, invalid }) {
  const searchId = useId();
  const [query, setQuery] = useState('');
  const selected = useMemo(() => new Set(Array.isArray(value) ? value : []), [value]);
  const visible = useMemo(
    () => members.filter(m => memberMatchesPicker(m, { query }, catalog.roles)),
    [members, query, catalog.roles],
  );
  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    // Ordre stable : celui de la liste des membres.
    onChange(members.filter(m => next.has(m.id)).map(m => m.id));
  };
  const allVisible = visible.length > 0 && visible.every(m => selected.has(m.id));
  const toggleVisible = () => {
    const next = new Set(selected);
    visible.forEach(m => (allVisible ? next.delete(m.id) : next.add(m.id)));
    onChange(members.filter(m => next.has(m.id)).map(m => m.id));
  };

  if (!members.length) {
    return <p className="text-xs text-muted border border-dashed border-line rounded-lg p-3">Aucun membre dans l'application.</p>;
  }

  return (
    <div className={`rounded-xl border ${invalid ? 'border-red-500/70' : 'border-line'} overflow-hidden`}>
      <div className="flex items-center gap-2 p-2 border-b border-line bg-elevated/40">
        <div className="relative flex-1 min-w-0">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <label htmlFor={searchId} className="sr-only">Rechercher un membre</label>
          <input id={searchId} type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher…" className="input py-1.5 pl-8 text-xs" />
        </div>
        <span className="text-[11px] text-dim tabular-nums shrink-0" aria-live="polite">{selected.size} sélectionné{selected.size > 1 ? 's' : ''}</span>
        <button type="button" onClick={toggleVisible} className="btn-ghost px-2 py-1 text-[11px] shrink-0" disabled={!visible.length}>
          {allVisible ? 'Aucun' : 'Tous'}
        </button>
      </div>
      <ul className="max-h-48 overflow-y-auto divide-y divide-line" id={domId} tabIndex={-1} aria-label="Membres">
        {visible.map(m => {
          const id = `${domId}-${m.id}`;
          return (
            <li key={m.id}>
              <label htmlFor={id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-hover">
                <input id={id} type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} className="h-4 w-4 accent-blue-600 shrink-0" />
                <UserRound size={14} className="text-muted shrink-0" aria-hidden="true" />
                <span className="text-sm text-ink truncate">{memberName(m)}</span>
                {catalog.roles[m.mainRole] && <span className="text-[11px] text-dim truncate ml-auto">{catalog.roles[m.mainRole].label}</span>}
              </label>
            </li>
          );
        })}
        {!visible.length && <li className="px-3 py-3 text-xs text-muted text-center">Aucun membre ne correspond.</li>}
      </ul>
    </div>
  );
}
