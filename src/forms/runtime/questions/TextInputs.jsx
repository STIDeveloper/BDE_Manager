// Saisies textuelles et natives : texte court/long (compteur), e-mail,
// téléphone, lien, nombre, date, heure, date et heure.

import { todayIso } from '../../engine/index.js';

const INPUT_META = {
  short_text: { type: 'text', autoComplete: 'on' },
  email: { type: 'email', inputMode: 'email', autoComplete: 'email', spellCheck: false, autoCapitalize: 'none' },
  phone: { type: 'tel', inputMode: 'tel', autoComplete: 'tel' },
  url: { type: 'url', inputMode: 'url', autoComplete: 'url', spellCheck: false, autoCapitalize: 'none' },
  number: { type: 'text', inputMode: 'decimal', autoComplete: 'off' },
  date: { type: 'date' },
  time: { type: 'time' },
  datetime: { type: 'datetime-local' },
};

const PLACEHOLDERS = { email: 'prenom.nom@exemple.fr', phone: '06 12 34 56 78', url: 'https://…' };

function dateBound(b) {
  if (b === undefined || b === null || b === '') return undefined;
  if (typeof b === 'string' && /^(today|aujourd'?hui)$/i.test(b.trim())) return todayIso();
  return typeof b === 'string' ? b.slice(0, 10) : undefined;
}

function Counter({ length, max, id }) {
  if (!max) return null;
  const near = length > max * 0.9;
  return (
    <p id={id} className="fr-help" style={{ textAlign: 'right', color: length > max ? 'var(--f-danger)' : undefined }}>
      {length} / {max}{near && <span className="sr-only"> caractères utilisés</span>}
    </p>
  );
}

export function TextInput({ item, value, onChange, ids, ariaDescribedBy, invalid, readOnly, required }) {
  const type = item.type;
  const v = item.validation || {};
  const str = value === null || value === undefined ? '' : String(value);
  const counterId = `${ids.control}-count`;
  const maxLength = Number.isInteger(v.maxLength) ? v.maxLength : undefined;
  const describedBy = [ariaDescribedBy, maxLength ? counterId : null].filter(Boolean).join(' ') || undefined;
  const common = {
    id: ids.control,
    className: 'fr-input',
    value: str,
    'aria-describedby': describedBy,
    'aria-invalid': invalid || undefined,
    'aria-required': required || undefined,
    readOnly,
    placeholder: item.placeholder || PLACEHOLDERS[type] || undefined,
    onChange: e => onChange(e.target.value),
  };
  if (type === 'long_text') {
    return (
      <>
        <textarea {...common} rows={item.rows || 5} />
        <Counter length={str.length} max={maxLength} id={counterId} />
      </>
    );
  }
  const meta = INPUT_META[type] || INPUT_META.short_text;
  const extra = {};
  if (type === 'date') { extra.min = dateBound(v.min); extra.max = dateBound(v.max); }
  if (type === 'time') { extra.min = typeof v.min === 'string' ? v.min : undefined; extra.max = typeof v.max === 'string' ? v.max : undefined; }
  if (type === 'datetime') { extra.min = typeof v.min === 'string' ? v.min.slice(0, 16) : undefined; extra.max = typeof v.max === 'string' ? v.max.slice(0, 16) : undefined; }
  if (type === 'short_text' && item.autocomplete) extra.autoComplete = item.autocomplete;
  // Valeur d'un champ datetime normalisée pour <input type="datetime-local">
  const val = type === 'datetime' ? str.slice(0, 16) : str;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input {...meta} {...common} {...extra} value={val} style={type === 'number' ? { maxWidth: 260 } : undefined} />
        {type === 'number' && item.unit && <span className="fr-muted">{item.unit}</span>}
      </div>
      {type !== 'number' && <Counter length={str.length} max={maxLength} id={counterId} />}
    </>
  );
}
