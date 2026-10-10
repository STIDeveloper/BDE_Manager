// ============================================================
// STUDIO FORMULAIRES — rendu de l'arbre des éléments d'une page
// ============================================================
// Sections (repliables, répétables), colonnes, contenus, questions
// (éventuellement répétées). Les données viennent du contexte fourni par
// FormRenderer (évaluation du moteur, réponses, erreurs, setters).

import { Suspense, useContext, useState } from 'react';
import { ChevronDown, Minus, Plus } from 'lucide-react';
import { evaluate, truthy, isEmpty } from '../engine/index.js';
import { QUESTION_COMPONENTS } from './questions/index.js';
import Field from './questions/Field.jsx';
import { describedBy, fieldIds } from './questions/helpers.js';
import RichText from './RichText.jsx';
import { useMediaSrc } from './media.js';
import { RendererContext } from './context.js';

const safeId = s => String(s).replace(/[^A-Za-z0-9_-]/g, '_');

/** Portée de formules d'une instance de section répétable. */
function instanceScope(r, inst) {
  return { ...r.baseScope, ...(inst || {}) };
}

function evalOpts(r) {
  return { now: r.engineCtx.now, stats: r.engineCtx.stats, timeZone: 'Europe/Paris' };
}

/** Visibilité d'un élément (global : moteur ; instance : formule locale). */
function isVisible(r, item, scope) {
  if (!scope) {
    if (item.kind === 'question' && item.key) return r.ev.visible.has(item.key);
    return item.id === undefined || r.ev.visible.has(item.id);
  }
  return !item.showIf || truthy(evaluate(item.showIf, instanceScope(r, scope.instance), evalOpts(r)));
}

function PreviewWrap({ item, children }) {
  const r = useContext(RendererContext);
  if (r.mode !== 'preview' || !r.onItemClick) {
    if (r.highlightItemId && r.highlightItemId === item.id) return <div className="fr-highlight" data-item-id={item.id} style={{ borderRadius: 'var(--f-radius)' }}>{children}</div>;
    return children;
  }
  const hl = r.highlightItemId === item.id;
  return (
    <div
      className={`fr-preview-item ${hl ? 'fr-highlight' : ''}`}
      data-item-id={item.id}
      onClick={e => { e.stopPropagation(); r.onItemClick(item.id); }}
    >
      {children}
    </div>
  );
}

export function ItemList({ items, scope = null }) {
  const r = useContext(RendererContext);
  const list = (Array.isArray(items) ? items : []).filter(it => it && typeof it === 'object');
  const shown = list.filter(it => !(it.kind === 'question' && it.type === 'hidden') && isVisible(r, it, scope));
  if (!shown.length) return null;
  return (
    <div className="fr-stack">
      {shown.map((it, i) => (
        <PreviewWrap key={it.id ?? i} item={it}>
          <ItemView item={it} scope={scope} />
        </PreviewWrap>
      ))}
    </div>
  );
}

function ItemView({ item, scope }) {
  switch (item.kind) {
    case 'section':
      return item.repeat && item.key && !scope ? <RepeatSection item={item} /> : <Section item={item} scope={scope} />;
    case 'columns': {
      const cols = Array.isArray(item.columns) ? item.columns.slice(0, 3) : [];
      return (
        <div className={`fr-cols fr-cols-${Math.max(1, cols.length)}`}>
          {cols.map((col, i) => <div key={i} style={{ minWidth: 0 }}><ItemList items={col} scope={scope} /></div>)}
        </div>
      );
    }
    case 'content': return <Content item={item} />;
    case 'question': return <Question item={item} scope={scope} />;
    default: return null;
  }
}

function ContentImage({ item }) {
  const src = useMediaSrc(item.image);
  if (!src) return null;
  return <img src={src} alt={item.alt || ''} style={{ maxWidth: '100%', borderRadius: 'var(--f-radius)', display: 'block' }} loading="lazy" />;
}

function Content({ item }) {
  if (item.format === 'divider') return <hr className="fr-divider" />;
  if (item.format === 'image') return <ContentImage item={item} />;
  return <RichText text={item.text} className="fr-content" />;
}

function sectionHasError(r, item, scope) {
  const keys = Object.keys(r.errors);
  if (!keys.length) return false;
  const inner = [];
  const walk = items => (items || []).forEach(it => {
    if (!it) return;
    if (it.kind === 'question' && it.key) inner.push(it.key);
    if (it.kind === 'section') { if (it.repeat && it.key) inner.push(it.key); walk(it.items); }
    if (it.kind === 'columns') (it.columns || []).forEach(walk);
  });
  walk(item.items);
  const prefix = scope ? `${scope.groupKey}.${scope.index}.` : '';
  return keys.some(k => inner.some(q => k === prefix + q || k.startsWith(`${q}.`)));
}

function Section({ item, scope }) {
  const r = useContext(RendererContext);
  const [open, setOpen] = useState(item.collapsed !== true);
  const forced = sectionHasError(r, item, scope);
  const isOpen = open || forced || !item.collapsible;
  const bodyId = `fr-sec-${safeId(item.id)}${scope ? `-${scope.index}` : ''}`;
  const head = (
    <>
      <span style={{ flex: 1 }}>
        {item.title && <span className="fr-page-title" style={{ fontSize: '1.05rem', display: 'block' }}>{item.title}</span>}
        {item.description && <span className="fr-help" style={{ display: 'block' }}><RichText text={item.description} /></span>}
      </span>
      {item.collapsible && <ChevronDown size={20} aria-hidden="true" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', flex: 'none', marginTop: 2 }} />}
    </>
  );
  return (
    <section className="fr-section" aria-label={item.title || undefined}>
      {item.collapsible ? (
        <button type="button" className="fr-section-head" aria-expanded={isOpen} aria-controls={bodyId} onClick={() => setOpen(o => !o)} disabled={forced && isOpen}>
          {head}
        </button>
      ) : (item.title || item.description) ? <div className="fr-section-head">{head}</div> : null}
      <div id={bodyId} hidden={!isOpen} style={{ marginTop: item.title || item.description ? 'var(--f-gap)' : 0 }}>
        <ItemList items={item.items} scope={scope} />
      </div>
    </section>
  );
}

function RepeatSection({ item }) {
  const r = useContext(RendererContext);
  const rep = item.repeat && typeof item.repeat === 'object' ? item.repeat : {};
  const min = Number.isInteger(rep.min) ? rep.min : 0;
  const max = Math.min(Number.isInteger(rep.max) ? rep.max : 50, 200);
  const raw = Array.isArray(r.answers[item.key]) ? r.answers[item.key] : [];
  const count = Math.max(raw.length, min, 0);
  const instances = Array.from({ length: count }, (_, i) => (raw[i] && typeof raw[i] === 'object' ? raw[i] : {}));
  const error = r.errors[item.key];
  const ids = fieldIds(`fr-${safeId(item.key)}`);
  const ro = r.readOnly;
  const add = () => r.setValue(item.key, [...instances, {}]);
  const remove = i => r.setValue(item.key, instances.filter((_, j) => j !== i));
  return (
    <section className="fr-section" aria-labelledby={ids.label} data-field-key={item.key}>
      <h3 id={ids.label} className="fr-page-title" style={{ fontSize: '1.05rem' }}>{item.title || 'Éléments'}</h3>
      {item.description && <div className="fr-help"><RichText text={item.description} /></div>}
      <div className="fr-stack" style={{ marginTop: 'var(--f-gap)' }}>
        {instances.map((inst, i) => (
          <div key={i} className="fr-repeat-item" role="group" aria-label={`${item.title || 'Élément'} n°${i + 1}`}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
              <strong>{item.title || 'Élément'} n°{i + 1}</strong>
              {!ro && count > min && (
                <button type="button" className="fr-btn fr-btn-ghost" onClick={() => remove(i)} aria-label={`Retirer ${item.title || 'l’élément'} n°${i + 1}`}>
                  <Minus size={16} aria-hidden="true" /> Retirer
                </button>
              )}
            </div>
            <ItemList items={item.items} scope={{ groupKey: item.key, index: i, instance: inst, instances }} />
          </div>
        ))}
        {!count && <p className="fr-muted">Aucun élément pour l’instant.</p>}
      </div>
      {!ro && count < max && (
        <button type="button" className="fr-btn fr-btn-secondary" style={{ marginTop: 12 }} onClick={add} id={ids.control}>
          <Plus size={16} aria-hidden="true" /> {rep.addLabel || 'Ajouter'}
        </button>
      )}
      {error && <p id={ids.error} className="fr-error">{error}</p>}
    </section>
  );
}

/** Montant d'une question paiement (fixe ou formule), hors formules à options. */
function paymentAmount(r, item, scope) {
  const a = item.amount;
  if (a === undefined || a === null) return null;
  if (typeof a === 'object') {
    const ex = typeof a.expr === 'string' ? a.expr : null;
    if (!ex) return null;
    const v = Number(evaluate(ex, scope ? instanceScope(r, scope.instance) : r.baseScope, evalOpts(r)));
    return Number.isFinite(v) ? Math.max(0, Math.round(v * 100) / 100) : null;
  }
  const n = Number(a);
  return Number.isFinite(n) ? n : null;
}

function Question({ item, scope }) {
  const r = useContext(RendererContext);
  const entry = QUESTION_COMPONENTS[item.type];
  if (!entry) {
    return r.mode === 'preview' ? <p className="fr-alert fr-alert-warn">Type de question inconnu : {String(item.type)}</p> : null;
  }
  const key = item.key || item.id;
  const errKey = scope ? `${scope.groupKey}.${scope.index}.${key}` : key;
  const iScope = scope ? instanceScope(r, scope.instance) : null;
  const value = scope ? scope.instance[key] : r.answers[key];
  const required = scope
    ? (typeof item.required === 'string' ? truthy(evaluate(item.required, iScope, evalOpts(r))) : item.required === true) && item.type !== 'calculated'
    : r.ev.required.has(key);
  const readOnly = r.readOnly || (scope
    ? item.type === 'calculated' || (!!item.readOnlyIf && truthy(evaluate(item.readOnlyIf, iScope, evalOpts(r))))
    : r.ev.readOnly.has(key));
  const error = r.errors[errKey];
  const ids = fieldIds(`fr-${safeId(errKey)}`);
  const aria = describedBy(ids, { help: item.help, error });
  const options = scope
    ? (Array.isArray(item.options) ? item.options.filter(o => o && (!o.showIf || truthy(evaluate(o.showIf, iScope, evalOpts(r))))) : [])
    : (r.ev.options[key] || (Array.isArray(item.options) ? item.options : []));
  const computedValue = item.type === 'calculated'
    ? (scope ? evaluate(item.expr || item.default?.expr || '', iScope, evalOpts(r)) : r.ev.computed[key] ?? r.ev.values[key] ?? null)
    : null;
  const rt = {
    ...r.rtBase,
    options: options.filter(Boolean),
    full: scope ? null : r.ev.fullOptions[key] || null,
    computedValue,
    paymentAmount: item.type === 'payment' ? paymentAmount(r, item, scope) : null,
  };
  const set = v => (scope ? r.setInstanceValue(scope.groupKey, scope.index, scope.instances, key, v) : r.setValue(key, v));
  const { Component } = entry;
  const props = { item, ids, ariaDescribedBy: aria, invalid: !!error, readOnly, required, rt };

  let body;
  if (item.repeat && item.kind === 'question' && item.type !== 'calculated') {
    const rep = typeof item.repeat === 'object' ? item.repeat : {};
    const min = Math.max(1, Number.isInteger(rep.min) ? rep.min : 1);
    const max = Math.min(Number.isInteger(rep.max) ? rep.max : 20, 200);
    const list = Array.isArray(value) ? value : isEmpty(value) ? [] : [value];
    const count = Math.max(list.length, min);
    const rows = Array.from({ length: count }, (_, i) => list[i] ?? null);
    const setAt = (i, v) => { const next = rows.slice(); next[i] = v; set(next); };
    body = (
      <div className="fr-stack-sm">
        {rows.map((v, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Component {...props} ids={i === 0 ? ids : { ...ids, control: `${ids.control}-${i}`, label: ids.label }} value={v} onChange={x => setAt(i, x)} />
            </div>
            {!readOnly && count > min && (
              <button type="button" className="fr-iconbtn" aria-label={`Retirer la réponse n°${i + 1}`} onClick={() => set(rows.filter((_, j) => j !== i))}>
                <Minus size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
        {!readOnly && count < max && (
          <button type="button" className="fr-btn fr-btn-secondary" onClick={() => set([...rows, null])}>
            <Plus size={16} aria-hidden="true" /> {rep.addLabel || 'Ajouter une réponse'}
          </button>
        )}
      </div>
    );
  } else {
    body = <Component {...props} value={value} onChange={set} />;
  }
  if (entry.lazy) body = <Suspense fallback={<p className="fr-help" role="status">Chargement…</p>}>{body}</Suspense>;

  return (
    <div data-field-key={errKey}>
      <Field item={item} ids={ids} error={error} required={required} group={!!entry.group || !!item.repeat}>
        {body}
      </Field>
    </div>
  );
}

