// Signature (pavé partagé des documents), sélecteurs de membre / d'événement
// avec recherche, paiement (montant calculé), champ calculé (lecture seule).

import { lazy, Suspense, useMemo, useState } from 'react';
import { CreditCard, PenLine, Search, Trash2, X } from 'lucide-react';
import { fold, pickerOptions } from './helpers.js';

const SignaturePad = lazy(() => import('../../../components/documents/SignaturePad.jsx'));

export function SignatureInput({ value, onChange, ids, ariaDescribedBy, invalid, readOnly, rt }) {
  const [open, setOpen] = useState(false);
  const has = typeof value === 'string' && value.startsWith('data:image/png');
  if (open && !readOnly) {
    return (
      <Suspense fallback={<p className="fr-help" role="status">Chargement du pavé de signature…</p>}>
        <SignaturePad
          name={rt.signerName || ''}
          onCancel={() => setOpen(false)}
          onSave={url => { onChange(url); setOpen(false); return true; }}
        />
      </Suspense>
    );
  }
  return (
    <div>
      {has && (
        <div style={{ background: '#fff', border: '1px solid rgb(var(--c-line))', borderRadius: 'var(--f-radius)', padding: 8, maxWidth: 360 }}>
          <img src={value} alt="Ta signature" style={{ maxHeight: 110, maxWidth: '100%', display: 'block', margin: '0 auto' }} />
        </div>
      )}
      {!has && value && typeof value === 'object' && <p className="fr-help">Signature déjà enregistrée.</p>}
      {!readOnly && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: has ? 8 : 0 }}>
          <button type="button" id={ids.control} className="fr-btn fr-btn-secondary" aria-describedby={ariaDescribedBy} aria-invalid={invalid || undefined} onClick={() => setOpen(true)}>
            <PenLine size={16} aria-hidden="true" /> {has ? 'Refaire ma signature' : 'Signer'}
          </button>
          {has && (
            <button type="button" className="fr-btn fr-btn-ghost" onClick={() => onChange(null)}>
              <Trash2 size={16} aria-hidden="true" /> Effacer
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function PickerInput({ item, value, onChange, ids, ariaDescribedBy, invalid, readOnly, required, rt }) {
  const options = useMemo(() => pickerOptions(item, rt.context), [item, rt.context]);
  const [q, setQ] = useState('');
  const multiple = item.multiple === true;
  const sel = (Array.isArray(value) ? value : value ? [value] : []).map(String);
  const filtered = useMemo(() => {
    const f = fold(q.trim());
    const list = f ? options.filter(o => fold(`${o.label} ${o.sub}`).includes(f)) : options;
    return list.slice(0, 50);
  }, [options, q]);
  const noun = item.type === 'member_picker' ? 'membre' : 'événement';
  if (!options.length) return <p className="fr-muted">Aucun {noun} disponible.</p>;
  const toggle = (val, on) => {
    if (!multiple) { onChange(on ? val : null); return; }
    const next = on ? [...sel.filter(x => x !== val), val] : sel.filter(x => x !== val);
    onChange(next.length ? next : null);
  };
  const labelOf = val => options.find(o => o.value === val)?.label || val;
  return (
    <div>
      {sel.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 8px', display: 'flex', flexWrap: 'wrap', gap: 6 }} aria-label="Sélection">
          {sel.map(val => (
            <li key={val} className="fr-pill" style={{ cursor: 'default', fontWeight: 500, gap: 4, paddingRight: 2 }}>
              {labelOf(val)}
              {!readOnly && (
                <button type="button" className="fr-iconbtn" style={{ border: 0, width: 36, height: 36 }} aria-label={`Retirer ${labelOf(val)}`} onClick={() => toggle(val, false)}>
                  <X size={14} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <>
          {options.length > 6 && (
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <Search size={16} aria-hidden="true" className="fr-muted" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                id={ids.control}
                type="search"
                className="fr-input"
                style={{ paddingLeft: 36 }}
                placeholder={`Rechercher un ${noun}…`}
                value={q}
                aria-describedby={ariaDescribedBy}
                aria-invalid={invalid || undefined}
                aria-controls={`${ids.control}-list`}
                onChange={e => setQ(e.target.value)}
              />
            </div>
          )}
          <div id={`${ids.control}-list`} className="fr-options" role={multiple ? 'group' : 'radiogroup'} aria-labelledby={ids.label} aria-required={required || undefined} style={{ maxHeight: 320, overflowY: 'auto', padding: 2 }}>
            {filtered.map((o, i) => (
              <label key={o.value} className="fr-option">
                <input
                  type={multiple ? 'checkbox' : 'radio'}
                  id={options.length <= 6 && i === 0 ? ids.control : undefined}
                  name={`${ids.control}-pick`}
                  checked={sel.includes(o.value)}
                  onChange={e => toggle(o.value, multiple ? e.target.checked : true)}
                />
                <span>{o.label}{o.sub && <span className="fr-help" style={{ display: 'block', marginTop: 0 }}>{o.sub}</span>}</span>
              </label>
            ))}
            {!filtered.length && <p className="fr-muted">Aucun résultat pour « {q} ».</p>}
          </div>
          <p className="sr-only" aria-live="polite">{q ? `${filtered.length} résultat${filtered.length > 1 ? 's' : ''}` : ''}</p>
        </>
      )}
    </div>
  );
}

export function PaymentInput({ value, onChange, ids, ariaDescribedBy, invalid, readOnly, required, rt }) {
  const opts = rt.options.filter(o => typeof o.price === 'number');
  if (opts.length) {
    const cur = value && typeof value === 'object' ? value.option : value;
    return (
      <div>
        <div className="fr-options" role="radiogroup" aria-labelledby={ids.label} aria-describedby={ariaDescribedBy} aria-invalid={invalid || undefined} aria-required={required || undefined}>
          {opts.map((o, i) => (
            <label key={String(o.value)} className="fr-option">
              <input type="radio" id={i === 0 ? ids.control : undefined} name={ids.control} checked={cur !== undefined && cur !== null && String(cur) === String(o.value)} disabled={readOnly} onChange={() => onChange({ option: o.value })} />
              <span>{o.label || String(o.value)}</span>
              <span className="fr-option-meta" style={{ fontWeight: 700, color: 'rgb(var(--c-ink))' }}>{rt.money(o.price)}</span>
            </label>
          ))}
        </div>
        <p className="fr-help"><CreditCard size={14} aria-hidden="true" style={{ display: 'inline', verticalAlign: '-2px' }} /> Le paiement en ligne (HelloAsso) s’ouvrira après l’envoi du formulaire.</p>
      </div>
    );
  }
  const fixed = rt.paymentAmount;
  if (fixed !== null && fixed !== undefined) {
    return (
      <div id={ids.control} tabIndex={-1} className="fr-alert fr-alert-info" aria-describedby={ariaDescribedBy}>
        <p style={{ fontSize: '1.25rem', fontWeight: 750 }}>{rt.money(fixed)}</p>
        <p className="fr-help" style={{ marginTop: 2 }}>Montant à régler. Le paiement en ligne (HelloAsso) s’ouvrira après l’envoi du formulaire.</p>
      </div>
    );
  }
  // Montant libre (don…)
  const amount = value && typeof value === 'object' ? value.amount : value;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: 240 }}>
        <input
          id={ids.control}
          className="fr-input"
          inputMode="decimal"
          value={amount === undefined || amount === null ? '' : String(amount)}
          placeholder="0,00"
          readOnly={readOnly}
          aria-describedby={ariaDescribedBy}
          aria-invalid={invalid || undefined}
          aria-required={required || undefined}
          onChange={e => {
            const s = e.target.value.replace(',', '.').trim();
            onChange(s === '' ? null : { amount: s });
          }}
        />
        <span aria-hidden="true">€</span>
      </div>
      <p className="fr-help">Montant de ton choix. Le paiement en ligne (HelloAsso) s’ouvrira après l’envoi du formulaire.</p>
    </div>
  );
}

export function CalculatedField({ item, ids, ariaDescribedBy, rt }) {
  const v = rt.computedValue;
  const empty = v === null || v === undefined || v === '';
  let text = empty ? '—' : String(v);
  if (!empty && typeof v === 'number') text = item.format === 'money' ? rt.money(v) : v.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  if (typeof v === 'boolean') text = v ? 'Oui' : 'Non';
  return (
    <output id={ids.control} aria-describedby={ariaDescribedBy} aria-live="polite" className="fr-input" style={{ display: 'flex', alignItems: 'center', background: 'rgb(var(--c-elevated))', fontWeight: 600 }}>
      {text}{!empty && item.unit ? ` ${item.unit}` : ''}
    </output>
  );
}
