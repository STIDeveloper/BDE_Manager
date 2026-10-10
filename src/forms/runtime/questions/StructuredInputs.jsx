// Réponses structurées : prénom + nom, adresse postale, consentement.

import RichText from '../RichText.jsx';

const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

function SubField({ id, label, children, wide }) {
  return (
    <div style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <label htmlFor={id} style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }} className="fr-muted">{label}</label>
      {children}
    </div>
  );
}

export function NameInput({ value, onChange, ids, ariaDescribedBy, invalid, readOnly, required }) {
  const v = obj(value);
  const set = (k, x) => onChange({ ...v, [k]: x });
  const common = { className: 'fr-input', 'aria-describedby': ariaDescribedBy, 'aria-invalid': invalid || undefined, 'aria-required': required || undefined, readOnly };
  return (
    <div className="fr-grid-2">
      <SubField id={ids.control} label="Prénom">
        <input id={ids.control} {...common} autoComplete="given-name" value={v.firstName || ''} onChange={e => set('firstName', e.target.value)} />
      </SubField>
      <SubField id={`${ids.control}-last`} label="Nom">
        <input id={`${ids.control}-last`} {...common} autoComplete="family-name" value={v.lastName || ''} onChange={e => set('lastName', e.target.value)} />
      </SubField>
    </div>
  );
}

export function AddressInput({ value, onChange, ids, ariaDescribedBy, invalid, readOnly, required, item }) {
  const v = obj(value);
  const set = (k, x) => onChange({ ...v, [k]: x });
  const common = { className: 'fr-input', 'aria-describedby': ariaDescribedBy, 'aria-invalid': invalid || undefined, readOnly };
  const id = k => (k === 'line1' ? ids.control : `${ids.control}-${k}`);
  return (
    <div className="fr-grid-2">
      <SubField id={id('line1')} label="Numéro et rue" wide>
        <input id={id('line1')} {...common} aria-required={required || undefined} autoComplete="address-line1" value={v.line1 || ''} onChange={e => set('line1', e.target.value)} />
      </SubField>
      <SubField id={id('line2')} label="Complément (facultatif)" wide>
        <input id={id('line2')} {...common} autoComplete="address-line2" value={v.line2 || ''} onChange={e => set('line2', e.target.value)} />
      </SubField>
      <SubField id={id('postalCode')} label="Code postal">
        <input id={id('postalCode')} {...common} aria-required={required || undefined} inputMode="numeric" autoComplete="postal-code" value={v.postalCode || ''} onChange={e => set('postalCode', e.target.value)} />
      </SubField>
      <SubField id={id('city')} label="Ville">
        <input id={id('city')} {...common} aria-required={required || undefined} autoComplete="address-level2" value={v.city || ''} onChange={e => set('city', e.target.value)} />
      </SubField>
      {item.showRegion && (
        <SubField id={id('region')} label="Région">
          <input id={id('region')} {...common} autoComplete="address-level1" value={v.region || ''} onChange={e => set('region', e.target.value)} />
        </SubField>
      )}
      <SubField id={id('country')} label="Pays">
        <input id={id('country')} {...common} autoComplete="country-name" placeholder="France" value={v.country || ''} onChange={e => set('country', e.target.value)} />
      </SubField>
    </div>
  );
}

export function ConsentInput({ item, value, onChange, ids, ariaDescribedBy, invalid, readOnly, required, rt }) {
  const text = item.consentText || rt.settings?.consentText || item.text;
  return (
    <div>
      {text && <div className="fr-help" style={{ marginTop: 0, marginBottom: 8 }}><RichText text={text} /></div>}
      <label className="fr-option">
        <input
          type="checkbox"
          id={ids.control}
          checked={value === true}
          disabled={readOnly}
          aria-describedby={ariaDescribedBy}
          aria-invalid={invalid || undefined}
          aria-required={required || undefined}
          onChange={e => onChange(e.target.checked)}
        />
        <span>{item.checkboxLabel || 'J’accepte'}</span>
      </label>
    </div>
  );
}
