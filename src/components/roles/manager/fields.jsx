// Champs d'édition « sur place » : enregistrement à la sortie du champ ou
// avec Entrée, Échap pour annuler. En cas de refus du store, l'erreur est
// affichée sous le champ et la valeur d'origine revient.
import { useId, useState } from 'react';
import { X } from 'lucide-react';
import { addAlias, findAliasConflict } from './helpers.js';
import { FOCUS_RING, inputCls } from './constants.js';
import { FieldError } from './ui.jsx';

/**
 * @param {{id:string, value:string, onCommit:(v:string)=>({ok:boolean,error?:string}|void), maxLength?:number, placeholder?:string, describedBy?:string}} props
 */
export function InlineText({ id, value, onCommit, maxLength, placeholder, describedBy, className = '' }) {
  const [draft, setDraft] = useState(null); // null = pas en cours d'édition
  const [error, setError] = useState('');
  const errorId = useId();

  const commit = () => {
    if (draft === null) return;
    const next = draft.trim();
    setDraft(null);
    if (next === value) { setError(''); return; }
    const res = onCommit(next);
    setError(res && res.ok === false ? (res.error || 'Modification refusée.') : '');
  };

  return (
    <div>
      <input
        id={id}
        type="text"
        value={draft ?? value}
        maxLength={maxLength}
        placeholder={placeholder}
        onFocus={() => setDraft(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
          else if (e.key === 'Escape' && draft !== null && draft !== value) {
            // Échap annule la saisie (sans fermer la fenêtre).
            e.preventDefault();
            e.stopPropagation();
            setDraft(null);
            setError('');
          }
        }}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={[error ? errorId : null, describedBy].filter(Boolean).join(' ') || undefined}
        className={`${inputCls} ${className}`}
      />
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}

/** Champ numérique entier borné, même logique que InlineText. */
export function InlineNumber({ id, value, min = 0, max = 99, onCommit, describedBy, className = '' }) {
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const errorId = useId();

  const commit = () => {
    if (draft === null) return;
    const raw = draft.trim();
    setDraft(null);
    const n = Number(raw);
    if (raw === '' || !Number.isInteger(n) || n < min || n > max) {
      setError(`Saisis un nombre entier entre ${min} et ${max}.`);
      return;
    }
    if (n === value) { setError(''); return; }
    const res = onCommit(n);
    setError(res && res.ok === false ? (res.error || 'Modification refusée.') : '');
  };

  return (
    <div>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={draft ?? String(value)}
        onFocus={() => setDraft(String(value))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
          else if (e.key === 'Escape' && draft !== null && draft !== String(value)) {
            e.preventDefault();
            e.stopPropagation();
            setDraft(null);
            setError('');
          }
        }}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={[error ? errorId : null, describedBy].filter(Boolean).join(' ') || undefined}
        className={`${inputCls} ${className}`}
      />
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}

/**
 * Saisie d'alias en « puces » : Entrée ou virgule pour ajouter.
 * @param {{id:string, value:string[], onChange:(list:string[])=>({ok:boolean,error?:string}|void), roles:object, roleId?:string, describedBy?:string}} props
 */
export function AliasEditor({ id, value, onChange, roles, roleId, describedBy }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const errorId = useId();
  const list = Array.isArray(value) ? value : [];

  const add = () => {
    const res = addAlias(list, text);
    if (!res.ok) { setError(text.trim() ? res.error : ''); return; }
    const conflict = findAliasConflict(text, roles, roleId);
    const out = onChange(res.list);
    if (out && out.ok === false) { setError(out.error || 'Alias refusé.'); return; }
    setText('');
    setError('');
    // Un alias partagé rend la reconnaissance CSV ambiguë : on prévient sans bloquer.
    setWarning(conflict ? `Attention : « ${text.trim()} » désigne déjà le rôle « ${conflict.label} ». L'import CSV pourrait les confondre.` : '');
  };

  const remove = (alias) => {
    const out = onChange(list.filter(a => a !== alias));
    if (out && out.ok === false) setError(out.error || 'Modification refusée.');
    else { setError(''); setWarning(''); }
  };

  return (
    <div>
      {list.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 mb-2" aria-label="Alias enregistrés">
          {list.map(alias => (
            <li key={alias} className="inline-flex items-center gap-1 pl-2.5 pr-0.5 rounded-lg bg-elevated border border-line text-xs text-ink">
              <span className="py-1">{alias}</span>
              <button
                type="button"
                onClick={() => remove(alias)}
                aria-label={`Retirer l'alias ${alias}`}
                title={`Retirer l'alias ${alias}`}
                className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-dim hover:text-red-500 hover:bg-red-500/10 ${FOCUS_RING}`}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          value={text}
          placeholder="Ex. Prez, Président BDE…"
          onChange={(e) => { setText(e.target.value); setError(''); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
          }}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={[error ? errorId : null, describedBy].filter(Boolean).join(' ') || undefined}
          className={inputCls}
        />
        <button type="button" onClick={add} disabled={!text.trim()} className="btn-secondary !py-1.5 shrink-0 min-h-[36px]">
          Ajouter
        </button>
      </div>
      <FieldError id={errorId}>{error}</FieldError>
      {warning && <p role="status" className="text-xs text-amber-600 dark:text-amber-400 mt-1">{warning}</p>}
    </div>
  );
}
