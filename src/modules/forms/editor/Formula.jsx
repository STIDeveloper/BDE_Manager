// ============================================================
// Éditeur de formules (mode expert) et constructeur de conditions
// ============================================================
// FormulaInput : coloration simple, autocomplétion (clés + fonctions),
// validation en direct (message + position via le moteur), aide intégrée.
// ConditionEditor : « Afficher si [question] [opérateur] [valeur] ET/OU … »
// qui génère l'expression ; bascule vers le mode expert si la formule ne
// correspond pas à une suite de conditions simples.

import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { HelpCircle, Plus, Trash2, Wand2, Code2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { FUNCTION_DOCS } from '../../../forms/engine/index.js';
import { useRefs, analyzeFormula, parseConditions, clausesToExpr, opsFor, OPS, NUMERIC, fold } from './formulaUtils.js';

const EXTRA_REFS = [
  { key: 'membre.email', label: 'E-mail du membre connecté', kind: 'context' },
  { key: 'membre.firstName', label: 'Prénom du membre connecté', kind: 'context' },
  { key: 'params.', label: 'Paramètre de l\'adresse (params.source…)', kind: 'context' },
];

// ── Coloration ──────────────────────────────────────────────
const TOKEN_RX = /("(?:[^"\\]|\\.|"")*"?|'(?:[^'\\]|\\.|'')*'?|«[^»]*»?)|(\d+(?:[.,]\d+)?)|([A-Za-zÀ-ÿ_][\wÀ-ÿ.]*)(\s*\()?|(<=|>=|<>|!=|==|&&|\|\||[=<>+\-*/%&!;(),])|(\s+)|(.)/g;
const KEYWORDS = new Set(['ET', 'OU', 'NON', 'AND', 'OR', 'NOT', 'VRAI', 'FAUX', 'TRUE', 'FALSE', 'VIDE']);

function highlight(src, known, errorPos) {
  const parts = [];
  let m;
  TOKEN_RX.lastIndex = 0;
  let i = 0;
  while ((m = TOKEN_RX.exec(src)) !== null) {
    if (m[0] === '') { TOKEN_RX.lastIndex++; continue; }
    const start = m.index;
    let cls = '';
    if (m[1]) cls = 'text-emerald-700 dark:text-emerald-400';
    else if (m[2]) cls = 'text-amber-700 dark:text-amber-400';
    else if (m[3]) {
      const up = fold(m[3]);
      if (m[4]) cls = 'text-violet-700 dark:text-violet-400 font-semibold';
      else if (KEYWORDS.has(up)) cls = 'text-pink-700 dark:text-pink-400 font-semibold';
      else if (known.has(m[3].split('.')[0])) cls = 'text-blue-700 dark:text-blue-400';
      else cls = 'text-red-600 dark:text-red-400 underline decoration-wavy';
    } else if (m[5]) cls = 'text-dim';
    const text = m[3] && m[4] ? m[3] : m[0];
    const isErr = errorPos !== null && errorPos >= start && errorPos < start + text.length;
    parts.push(<span key={i++} className={`${cls} ${isErr ? 'bg-red-500/25 rounded-sm' : ''}`}>{text}</span>);
    if (m[3] && m[4]) parts.push(<span key={i++} className="text-dim">{m[4]}</span>);
  }
  if (errorPos !== null && errorPos >= src.length) parts.push(<span key="err-end" className="bg-red-500/40 rounded-sm"> </span>);
  return parts;
}

/**
 * Champ de formule (mode expert).
 */
export function FormulaInput({ value, onChange, def, excludeKey, id: idProp, label = 'Formule', placeholder = 'ex. age >= 18 ET adherent', rows = 2, hint, extraInfo }) {
  const autoId = useId();
  const id = idProp || autoId;
  const refs = useRefs(def, excludeKey);
  const known = useMemo(() => new Set([...refs.map(r => r.key), 'membre', 'params']), [refs]);
  const taRef = useRef(null);
  const preRef = useRef(null);
  const pendingCaret = useRef(null);
  const [caret, setCaret] = useState(0);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [help, setHelp] = useState(false);
  const [helpQ, setHelpQ] = useState('');
  const src = String(value ?? '');
  const analysis = useMemo(() => analyzeFormula(src, refs), [src, refs]);

  useLayoutEffect(() => {
    if (pendingCaret.current !== null && taRef.current) {
      const p = pendingCaret.current;
      pendingCaret.current = null;
      taRef.current.focus();
      taRef.current.setSelectionRange(p, p);
    }
  });

  // Mot en cours de saisie (avant le curseur)
  const word = useMemo(() => {
    const before = src.slice(0, caret);
    const m = /([A-Za-zÀ-ÿ_][\wÀ-ÿ.]*)$/.exec(before);
    if (!m) return null;
    // Pas d'autocomplétion dans une chaîne
    const quotes = (before.match(/"/g) || []).length;
    if (quotes % 2 === 1) return null;
    return { text: m[1], start: caret - m[1].length };
  }, [src, caret]);

  const suggestions = useMemo(() => {
    if (!word || word.text.length < 1) return [];
    const w = fold(word.text);
    const keys = [...refs, ...EXTRA_REFS]
      .filter(r => fold(r.key).startsWith(w) && r.key !== word.text)
      .slice(0, 6)
      .map(r => ({ kind: 'key', insert: r.key, label: r.key, detail: r.label }));
    const fns = FUNCTION_DOCS
      .filter(f => fold(f.name).startsWith(w))
      .slice(0, 6)
      .map(f => ({ kind: 'fn', insert: `${f.name}(`, label: f.name, detail: f.signature }));
    return [...keys, ...fns].slice(0, 8);
  }, [word, refs]);

  const showList = open && suggestions.length > 0;

  const accept = (s) => {
    if (!word) return;
    const next = src.slice(0, word.start) + s.insert + src.slice(caret);
    pendingCaret.current = word.start + s.insert.length;
    setCaret(word.start + s.insert.length);
    onChange(next);
    setOpen(false);
  };

  const insertAtCaret = (text) => {
    const pos = taRef.current ? taRef.current.selectionStart : src.length;
    const next = src.slice(0, pos) + text + src.slice(pos);
    pendingCaret.current = pos + text.length;
    onChange(next);
  };

  const onKeyDown = (e) => {
    if (!showList) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % suggestions.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + suggestions.length) % suggestions.length); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); accept(suggestions[Math.min(active, suggestions.length - 1)]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); }
  };

  const syncScroll = () => {
    if (preRef.current && taRef.current) {
      preRef.current.scrollTop = taRef.current.scrollTop;
      preRef.current.scrollLeft = taRef.current.scrollLeft;
    }
  };

  const errId = `${id}-status`;
  const listId = `${id}-list`;
  const docs = useMemo(() => {
    const qn = fold(helpQ.trim());
    return FUNCTION_DOCS.filter(f => !qn || fold(f.name).includes(qn) || fold(f.description).includes(qn));
  }, [helpQ]);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-dim">{label}</label>
        <button type="button" className="text-[11px] text-blue-600 dark:text-blue-400 inline-flex items-center gap-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60" aria-expanded={help} onClick={() => setHelp(h => !h)}>
          <HelpCircle size={12} aria-hidden="true" /> Aide formules
        </button>
      </div>
      <div className="relative">
        <pre ref={preRef} aria-hidden="true"
          className="absolute inset-0 m-0 px-3 py-2 font-mono text-[13px] leading-5 whitespace-pre-wrap break-words overflow-hidden pointer-events-none rounded-lg border border-transparent text-ink">
          {src ? highlight(src, known, analysis.error ? analysis.error.position : null) : <span className="text-muted">{placeholder}</span>}{'\n'}
        </pre>
        <textarea
          ref={taRef}
          id={id}
          rows={rows}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          value={src}
          aria-describedby={errId}
          aria-invalid={!!analysis.error}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          onChange={e => { setCaret(e.target.selectionStart); setOpen(true); setActive(0); onChange(e.target.value); }}
          onSelect={e => setCaret(e.target.selectionStart)}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onScroll={syncScroll}
          className={`relative w-full bg-transparent px-3 py-2 font-mono text-[13px] leading-5 rounded-lg border resize-y text-transparent caret-current selection:bg-blue-500/30 focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${analysis.error ? 'border-red-500/60' : 'border-line'}`}
          style={{ caretColor: 'rgb(var(--c-ink))', WebkitTextFillColor: 'transparent' }}
        />
        {showList && (
          <ul id={listId} role="listbox" aria-label="Suggestions" className="absolute z-30 left-0 right-0 top-full mt-1 bg-surface border border-line rounded-lg shadow-xl max-h-56 overflow-auto py-1">
            {suggestions.map((s, i) => (
              <li key={`${s.kind}-${s.label}`} role="option" aria-selected={i === active}
                onMouseDown={e => { e.preventDefault(); accept(s); }}
                className={`px-3 py-1.5 cursor-pointer flex items-baseline gap-2 text-xs ${i === active ? 'bg-blue-500/10' : ''}`}>
                <span className={`font-mono ${s.kind === 'fn' ? 'text-violet-700 dark:text-violet-400' : 'text-blue-700 dark:text-blue-400'}`}>{s.label}</span>
                <span className="text-muted truncate">{s.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div id={errId} aria-live="polite" className="text-[11px] min-h-4">
        {analysis.error ? (
          <span className="text-red-600 dark:text-red-400 inline-flex items-start gap-1"><AlertCircle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />Erreur au caractère {analysis.error.position + 1} : {analysis.error.message}.</span>
        ) : analysis.unknown.length ? (
          <span className="text-amber-700 dark:text-amber-400 inline-flex items-start gap-1"><AlertCircle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />Référence inconnue : {analysis.unknown.join(', ')}.</span>
        ) : !analysis.empty ? (
          <span className="text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1"><CheckCircle2 size={12} aria-hidden="true" />Formule valide.{extraInfo ? ` ${extraInfo}` : ''}</span>
        ) : hint ? <span className="text-muted">{hint}</span> : null}
      </div>
      {help && (
        <div className="border border-line rounded-lg bg-elevated p-2 space-y-2">
          <label htmlFor={`${id}-help`} className="sr-only">Rechercher une fonction</label>
          <input id={`${id}-help`} className="input !py-1 text-xs" placeholder="Rechercher une fonction…" value={helpQ} onChange={e => setHelpQ(e.target.value)} />
          <p className="text-[11px] text-dim">Opérateurs : <code>= &lt;&gt; &lt; &lt;= &gt; &gt;=</code>, <code>ET</code>, <code>OU</code>, <code>NON</code>, <code>+ - * /</code>, <code>&amp;</code> (texte). Textes entre guillemets, arguments séparés par <code>;</code>.</p>
          <ul className="max-h-48 overflow-auto space-y-1">
            {docs.map(f => (
              <li key={f.name}>
                <button type="button" onClick={() => insertAtCaret(`${f.name}(`)} className="w-full text-left p-1.5 rounded hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60">
                  <span className="font-mono text-xs text-violet-700 dark:text-violet-400">{f.signature}</span>
                  <span className="block text-[11px] text-dim">{f.description}</span>
                  <span className="block text-[11px] text-muted font-mono">ex. {f.example}</span>
                </button>
              </li>
            ))}
          </ul>
          {refs.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-dim mb-1">Clés disponibles</p>
              <div className="flex flex-wrap gap-1">
                {refs.map(r => (
                  <button key={r.key} type="button" title={r.label} onClick={() => insertAtCaret(r.key)} className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-surface border border-line text-blue-700 dark:text-blue-400 hover:border-line-strong">{r.key}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Constructeur visuel ─────────────────────────────────────

/**
 * Condition (Afficher si / Obligatoire si / Aller à la page si…).
 * value : formule ('' = aucune) ; onChange(formule | undefined).
 */
export function ConditionEditor({ value, onChange, def, excludeKey, label = 'Condition', emptyLabel = 'Toujours', allowEmpty = true }) {
  const refs = useRefs(def, excludeKey);
  const parsed = useMemo(() => parseConditions(value), [value]);
  const [expert, setExpert] = useState(() => parsed === null);
  const isExpert = expert || parsed === null;
  const uid = useId();

  const clauses = parsed?.clauses || [];
  const join = parsed?.join || 'ET';

  const emit = (nextClauses, nextJoin = join) => {
    const expr = clausesToExpr(nextClauses, nextJoin, refs);
    onChange(expr || undefined);
  };
  const addClause = () => {
    const ref = refs[0];
    if (!ref) return;
    const op = opsFor(ref)[0];
    emit([...clauses, { key: ref.key, op, value: ref.options?.[0]?.value ?? '' }]);
  };
  const setClause = (i, patch) => {
    const next = clauses.map((c, j) => {
      if (j !== i) return c;
      const merged = { ...c, ...patch };
      if (patch.key && patch.key !== c.key) {
        const ref = refs.find(r => r.key === patch.key);
        const ops = opsFor(ref);
        if (!ops.includes(merged.op)) merged.op = ops[0];
        merged.value = ref?.options?.[0]?.value ?? '';
      }
      return merged;
    });
    emit(next);
  };

  return (
    <fieldset className="space-y-2 border border-line rounded-xl p-2.5">
      <legend className="px-1 text-xs font-medium text-dim">{label}</legend>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted">{value ? (isExpert ? 'Formule personnalisée' : `${clauses.length} condition${clauses.length > 1 ? 's' : ''}`) : emptyLabel}</span>
        <button type="button" className="text-[11px] inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:opacity-40"
          disabled={!isExpert ? false : parsed === null}
          title={parsed === null ? 'Cette formule ne peut pas être affichée dans le constructeur visuel.' : undefined}
          onClick={() => setExpert(e => !e)}>
          {isExpert ? <><Wand2 size={12} aria-hidden="true" /> Constructeur visuel</> : <><Code2 size={12} aria-hidden="true" /> Mode expert</>}
        </button>
      </div>
      {isExpert ? (
        <FormulaInput value={value || ''} onChange={v => onChange(v.trim() ? v : (allowEmpty ? undefined : v))} def={def} excludeKey={excludeKey} label="Formule (vraie = condition remplie)" />
      ) : (
        <div className="space-y-2">
          {clauses.map((c, i) => {
            const ref = refs.find(r => r.key === c.key);
            const ops = opsFor(ref);
            const need = OPS[c.op]?.needs;
            return (
              <div key={i} className="space-y-1.5">
                {i > 0 && (
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => emit(clauses, join === 'ET' ? 'OU' : 'ET')}
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-md border border-line bg-elevated text-pink-700 dark:text-pink-400 hover:border-line-strong"
                      aria-label={`Liaison : ${join}. Cliquer pour basculer en ${join === 'ET' ? 'OU' : 'ET'}`}>{join}</button>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                )}
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
                  <div className="grid gap-1.5">
                    <label className="sr-only" htmlFor={`${uid}-k${i}`}>Question</label>
                    <select id={`${uid}-k${i}`} className="input !py-1.5 text-xs" value={c.key} onChange={e => setClause(i, { key: e.target.value })}>
                      {!ref && <option value={c.key}>{c.key} (inconnue)</option>}
                      {refs.map(r => <option key={r.key} value={r.key}>{r.label} ({r.key})</option>)}
                    </select>
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="sr-only" htmlFor={`${uid}-o${i}`}>Opérateur</label>
                      <select id={`${uid}-o${i}`} className="input !py-1.5 text-xs" value={c.op} onChange={e => setClause(i, { op: e.target.value })}>
                        {ops.map(o => <option key={o} value={o}>{OPS[o].label}</option>)}
                      </select>
                      {need ? <ValueInput id={`${uid}-v${i}`} refInfo={ref} op={c.op} value={c.value} onChange={v => setClause(i, { value: v })} /> : <span />}
                    </div>
                  </div>
                  <button type="button" className="btn-ghost !p-1.5 self-start" aria-label={`Supprimer la condition ${i + 1}`} onClick={() => emit(clauses.filter((_, j) => j !== i))}>
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
          {refs.length ? (
            <button type="button" className="btn-secondary !py-1 text-xs w-full" onClick={addClause}><Plus size={13} aria-hidden="true" /> {clauses.length ? 'Ajouter une condition' : 'Ajouter une condition'}</button>
          ) : <p className="text-[11px] text-muted">Ajoute d'abord d'autres questions pour créer une condition.</p>}
          {value && <p className="text-[11px] text-muted font-mono break-all" aria-label="Formule générée">{value}</p>}
        </div>
      )}
    </fieldset>
  );
}

function ValueInput({ id, refInfo, op, value, onChange }) {
  const label = <label className="sr-only" htmlFor={id}>Valeur</label>;
  if (op === 'age_lt' || op === 'age_gte' || (refInfo && NUMERIC.has(refInfo.type))) {
    return <>{label}<input id={id} type="number" className="input !py-1.5 text-xs" value={value ?? ''} onChange={e => onChange(e.target.value)} /></>;
  }
  if (refInfo?.type === 'date') return <>{label}<input id={id} type="date" className="input !py-1.5 text-xs" value={value ?? ''} onChange={e => onChange(e.target.value)} /></>;
  if (refInfo?.type === 'time') return <>{label}<input id={id} type="time" className="input !py-1.5 text-xs" value={value ?? ''} onChange={e => onChange(e.target.value)} /></>;
  if (refInfo?.options?.length) {
    const known = refInfo.options.some(o => String(o.value) === String(value));
    return (
      <>{label}
        <select id={id} className="input !py-1.5 text-xs" value={value ?? ''} onChange={e => onChange(e.target.value)}>
          {!known && <option value={value ?? ''}>{value || '—'}</option>}
          {refInfo.options.map(o => <option key={String(o.value)} value={String(o.value)}>{o.label || o.value}</option>)}
        </select>
      </>
    );
  }
  return <>{label}<input id={id} className="input !py-1.5 text-xs" value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder="valeur" /></>;
}

