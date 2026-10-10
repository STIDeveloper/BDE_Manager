// Habillage commun d'une question : libellé (ou légende de fieldset pour
// les groupes de contrôles), aide, erreur reliée par aria-describedby.

import { AlertCircle } from 'lucide-react';
import RichText from '../RichText.jsx';

export default function Field({ item, ids, error, required, group = false, children, hideLabel = false }) {
  const label = (
    <>
      <span>{item.label || 'Question sans titre'}</span>
      {required && <span className="fr-req" aria-hidden="true">*</span>}
      {required && <span className="sr-only"> (obligatoire)</span>}
    </>
  );
  const help = item.help ? <div id={ids.help} className="fr-help"><RichText text={item.help} /></div> : null;
  const err = error ? (
    <p id={ids.error} className="fr-error">
      <AlertCircle size={16} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} />
      <span>{error}</span>
    </p>
  ) : null;

  if (group) {
    return (
      <fieldset className="fr-field" aria-describedby={[item.help ? ids.help : null, error ? ids.error : null].filter(Boolean).join(' ') || undefined}>
        <legend id={ids.label} className={hideLabel ? 'sr-only' : 'fr-label'}>{label}</legend>
        {help}
        <div style={{ marginTop: 10 }}>{children}</div>
        {err}
      </fieldset>
    );
  }
  return (
    <div className="fr-field">
      <label id={ids.label} htmlFor={ids.control} className={hideLabel ? 'sr-only' : 'fr-label'}>{label}</label>
      {help}
      <div style={{ marginTop: 8 }}>{children}</div>
      {err}
    </div>
  );
}
