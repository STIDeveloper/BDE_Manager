// Évaluations : étoiles (vrais boutons radio → flèches du clavier),
// échelle linéaire min..max avec libellés, NPS 0..10.

import { Star } from 'lucide-react';

const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v !== null && v !== undefined ? Number(v) : d);

export function Rating({ item, value, onChange, ids, ariaDescribedBy, invalid, readOnly, required }) {
  const max = Math.min(10, Math.max(2, num(item.max ?? item.validation?.max, 5)));
  const current = num(value, 0);
  return (
    <div>
      <div className="fr-stars" role="radiogroup" aria-labelledby={ids.label} aria-describedby={ariaDescribedBy} aria-invalid={invalid || undefined} aria-required={required || undefined}>
        {Array.from({ length: max }, (_, i) => i + 1).map(n => (
          <label key={n} className={`fr-star ${n <= current ? 'fr-on' : ''}`} title={`${n} sur ${max}`}>
            <input type="radio" id={n === 1 ? ids.control : undefined} name={ids.control} value={n} checked={current === n} disabled={readOnly} onChange={() => onChange(n)} />
            <Star aria-hidden="true" fill={n <= current ? 'currentColor' : 'none'} strokeWidth={1.8} />
            <span className="sr-only">{n} étoile{n > 1 ? 's' : ''} sur {max}</span>
          </label>
        ))}
      </div>
      <p className="fr-help" aria-hidden="true">{current ? `${current} / ${max}` : 'Aucune note'}</p>
    </div>
  );
}

function Pills({ from, to, value, onChange, ids, ariaDescribedBy, invalid, readOnly, required, className = '', labelOf }) {
  const current = value === null || value === undefined || value === '' ? null : Number(value);
  const values = [];
  for (let n = from; n <= to && values.length < 21; n++) values.push(n);
  return (
    <div className={`fr-pills ${className}`} role="radiogroup" aria-labelledby={ids.label} aria-describedby={ariaDescribedBy} aria-invalid={invalid || undefined} aria-required={required || undefined}>
      {values.map((n, i) => (
        <label key={n} className="fr-pill">
          <input type="radio" id={i === 0 ? ids.control : undefined} name={ids.control} value={n} checked={current === n} disabled={readOnly} onChange={() => onChange(n)} />
          <span aria-hidden="true">{n}</span>
          <span className="sr-only">{labelOf(n)}</span>
        </label>
      ))}
    </div>
  );
}

export function Scale({ item, ...p }) {
  const min = Math.round(num(item.min ?? item.validation?.min, 1));
  const max = Math.round(num(item.max ?? item.validation?.max, 5));
  const lo = Math.min(min, max), hi = Math.max(min, max);
  const minLabel = item.minLabel ?? item.labels?.min ?? '';
  const maxLabel = item.maxLabel ?? item.labels?.max ?? '';
  const labelOf = n => `${n}${n === lo && minLabel ? ` (${minLabel})` : ''}${n === hi && maxLabel ? ` (${maxLabel})` : ''}`;
  return (
    <div>
      <Pills from={lo} to={hi} labelOf={labelOf} {...p} />
      {(minLabel || maxLabel) && <div className="fr-scale-labels" aria-hidden="true"><span>{minLabel}</span><span>{maxLabel}</span></div>}
    </div>
  );
}

export function Nps({ item, ...p }) {
  const minLabel = item.minLabel ?? 'Pas du tout probable';
  const maxLabel = item.maxLabel ?? 'Très probable';
  const labelOf = n => `${n}${n === 0 ? ` (${minLabel})` : ''}${n === 10 ? ` (${maxLabel})` : ''}`;
  return (
    <div>
      <Pills from={0} to={10} labelOf={labelOf} className="fr-pills-nps" {...p} />
      <div className="fr-scale-labels" aria-hidden="true"><span>0 · {minLabel}</span><span>{maxLabel} · 10</span></div>
    </div>
  );
}
