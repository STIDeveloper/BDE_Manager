// Choix : unique (cartes = vrais boutons radio), cases à cocher (min/max),
// liste déroulante, oui/non, choix en images, créneaux avec capacité.

import { ImageOff } from 'lucide-react';
import { useMediaSrc } from '../media.js';

const sameVal = (a, b) => String(a) === String(b);
const asList = v => (Array.isArray(v) ? v : v === null || v === undefined || v === '' ? [] : [v]);

/** Places restantes d'une option à capacité (null si illimitée). */
function remainingFor(item, option, stats) {
  if (typeof option?.capacity !== 'number') return null;
  const counts = stats?.optionCounts?.[item.key];
  const used = counts && Object.prototype.hasOwnProperty.call(counts, String(option.value)) ? Number(counts[String(option.value)]) || 0 : 0;
  return Math.max(0, option.capacity - used);
}

function capacityText(rem, waitlist) {
  if (rem === null) return null;
  if (rem <= 0) return waitlist ? 'Complet · liste d’attente' : 'Complet';
  return `${rem} place${rem > 1 ? 's' : ''} restante${rem > 1 ? 's' : ''}`;
}

function ClearButton({ onClear, label }) {
  return (
    <button type="button" className="fr-btn fr-btn-ghost" style={{ marginTop: 6, minHeight: 36, padding: '0 10px', fontSize: '0.85rem' }} onClick={onClear}>
      Effacer {label ? `« ${label} »` : 'la réponse'}
    </button>
  );
}

export function SingleChoice({ item, value, onChange, ids, ariaDescribedBy, invalid, readOnly, required, rt }) {
  const options = rt.options;
  const full = rt.full;
  const waitlist = !!rt.settings?.waitlist;
  const isSlots = item.type === 'slots';
  const multi = isSlots && (item.multiple === true || (Number.isInteger(item.validation?.maxSelected) && item.validation.maxSelected > 1));
  if (multi) return <MultipleChoice {...{ item, value, onChange, ids, ariaDescribedBy, invalid, readOnly, required, rt }} />;
  if (!options.length) return <p className="fr-muted">Aucun choix disponible pour le moment.</p>;
  return (
    <>
      <div className={`fr-options ${options.length > 6 && !isSlots ? 'fr-options-2' : ''}`} role="radiogroup" aria-labelledby={ids.label} aria-describedby={ariaDescribedBy} aria-required={required || undefined} aria-invalid={invalid || undefined}>
        {options.map((o, i) => {
          const rem = isSlots || typeof o.capacity === 'number' ? remainingFor(item, o, rt.stats) : null;
          const isFull = (full?.has(o.value) || rem === 0) && !waitlist;
          const checked = sameVal(value, o.value);
          return (
            <label key={String(o.value)} className="fr-option">
              <input
                type="radio"
                id={i === 0 ? ids.control : undefined}
                name={ids.control}
                value={String(o.value)}
                checked={checked}
                disabled={readOnly || (isFull && !checked)}
                onChange={() => onChange(o.value)}
              />
              <span>{o.label || String(o.value)}</span>
              {(rem !== null || typeof o.price === 'number') && (
                <span className="fr-option-meta">
                  {typeof o.price === 'number' ? rt.money(o.price) : null}
                  {typeof o.price === 'number' && rem !== null ? ' · ' : null}
                  {capacityText(rem, waitlist)}
                </span>
              )}
            </label>
          );
        })}
      </div>
      {!required && !readOnly && value !== undefined && value !== null && value !== '' && <ClearButton onClear={() => onChange(null)} />}
    </>
  );
}

export function MultipleChoice({ item, value, onChange, ids, ariaDescribedBy, invalid, readOnly, rt }) {
  const options = rt.options;
  const sel = asList(value);
  const v = item.validation || {};
  const max = Number.isInteger(v.maxSelected) ? v.maxSelected : null;
  const min = Number.isInteger(v.minSelected) ? v.minSelected : null;
  const waitlist = !!rt.settings?.waitlist;
  const hintId = `${ids.control}-hint`;
  const toggle = (o, on) => {
    const next = on ? [...sel.filter(x => !sameVal(x, o.value)), o.value] : sel.filter(x => !sameVal(x, o.value));
    // ordre des options conservé
    onChange(options.map(x => x.value).filter(x => next.some(n => sameVal(n, x))));
  };
  if (!options.length) return <p className="fr-muted">Aucun choix disponible pour le moment.</p>;
  return (
    <>
      {(min || max) && (
        <p id={hintId} className="fr-help" style={{ marginTop: 0, marginBottom: 8 }}>
          {min && max ? `Entre ${min} et ${max} choix` : min ? `Au moins ${min} choix` : `Jusqu’à ${max} choix`} · {sel.length} sélectionné{sel.length > 1 ? 's' : ''}
        </p>
      )}
      <div className={`fr-options ${options.length > 6 ? 'fr-options-2' : ''}`} role="group" aria-labelledby={ids.label} aria-describedby={[ariaDescribedBy, (min || max) ? hintId : null].filter(Boolean).join(' ') || undefined}>
        {options.map((o, i) => {
          const checked = sel.some(x => sameVal(x, o.value));
          const rem = typeof o.capacity === 'number' ? remainingFor(item, o, rt.stats) : null;
          const isFull = (rt.full?.has(o.value) || rem === 0) && !waitlist;
          const atMax = max !== null && sel.length >= max && !checked;
          return (
            <label key={String(o.value)} className="fr-option">
              <input
                type="checkbox"
                id={i === 0 ? ids.control : undefined}
                value={String(o.value)}
                checked={checked}
                aria-invalid={invalid || undefined}
                disabled={readOnly || ((atMax || isFull) && !checked)}
                onChange={e => toggle(o, e.target.checked)}
              />
              <span>{o.label || String(o.value)}</span>
              {(rem !== null || typeof o.price === 'number') && (
                <span className="fr-option-meta">{typeof o.price === 'number' ? rt.money(o.price) : capacityText(rem, waitlist)}</span>
              )}
            </label>
          );
        })}
      </div>
    </>
  );
}

export function Dropdown({ item, value, onChange, ids, ariaDescribedBy, invalid, readOnly, required, rt }) {
  const options = rt.options;
  const waitlist = !!rt.settings?.waitlist;
  return (
    <select
      id={ids.control}
      className="fr-input"
      value={value === null || value === undefined ? '' : String(value)}
      aria-describedby={ariaDescribedBy}
      aria-invalid={invalid || undefined}
      aria-required={required || undefined}
      disabled={readOnly}
      onChange={e => {
        const o = options.find(x => String(x.value) === e.target.value);
        onChange(o ? o.value : null);
      }}
    >
      <option value="">{item.placeholder || '— Choisir —'}</option>
      {options.map(o => {
        const rem = typeof o.capacity === 'number' ? remainingFor(item, o, rt.stats) : null;
        const isFull = (rt.full?.has(o.value) || rem === 0) && !waitlist;
        return (
          <option key={String(o.value)} value={String(o.value)} disabled={isFull && !sameVal(value, o.value)}>
            {o.label || String(o.value)}{isFull ? ' (complet)' : ''}
          </option>
        );
      })}
    </select>
  );
}

export function YesNo({ value, onChange, ids, ariaDescribedBy, invalid, readOnly, required, item }) {
  const yes = item.yesLabel || 'Oui';
  const no = item.noLabel || 'Non';
  return (
    <div className="fr-pills" role="radiogroup" aria-labelledby={ids.label} aria-describedby={ariaDescribedBy} aria-invalid={invalid || undefined} aria-required={required || undefined}>
      {[[true, yes], [false, no]].map(([v, label], i) => (
        <label key={label} className="fr-pill" style={{ minWidth: 96 }}>
          <input type="radio" id={i === 0 ? ids.control : undefined} name={ids.control} checked={value === v} disabled={readOnly} onChange={() => onChange(v)} />
          {label}
        </label>
      ))}
    </div>
  );
}

function OptionImage({ image, alt }) {
  const src = useMediaSrc(image);
  return (
    <span className="fr-image-frame">
      {src ? <img src={src} alt={alt || ''} loading="lazy" /> : <ImageOff size={28} aria-hidden="true" className="fr-muted" />}
    </span>
  );
}

export function ImageChoice({ value, onChange, ids, ariaDescribedBy, invalid, readOnly, required, rt }) {
  const options = rt.options;
  return (
    <div className="fr-image-grid" role="radiogroup" aria-labelledby={ids.label} aria-describedby={ariaDescribedBy} aria-invalid={invalid || undefined} aria-required={required || undefined}>
      {options.map((o, i) => (
        <label key={String(o.value)} className="fr-option fr-image-option">
          <OptionImage image={o.image} alt={o.alt || ''} />
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="radio" id={i === 0 ? ids.control : undefined} name={ids.control} checked={sameVal(value, o.value)} disabled={readOnly} onChange={() => onChange(o.value)} />
            <span>{o.label || String(o.value)}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
