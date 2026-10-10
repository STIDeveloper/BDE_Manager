// Aperçu statique d'un élément dans le canevas (mode édition).
// Le rendu exact (thème, interactions) est assuré par FormRenderer
// (mode « Rendu réel » du canevas et onglet Aperçu).
import { Star, Upload, PenLine, CreditCard, Calculator, EyeOff, CalendarRange, GripVertical, Users, PartyPopper } from 'lucide-react';

const box = 'h-9 rounded-[var(--fr,10px)] border border-line bg-surface/70 px-3 flex items-center text-xs text-muted';
const SOURCE_LABEL = { members: 'membres du BDE', events: 'événements', roles: 'rôles du catalogue', poles: 'pôles' };

function Options({ item, kind }) {
  if (item.source) return <p className="text-xs text-muted italic">Choix alimentés par les {SOURCE_LABEL[item.source] || item.source}.</p>;
  const opts = (item.options || []).slice(0, 6);
  const more = (item.options || []).length - opts.length;
  return (
    <ul className="space-y-1.5">
      {opts.map(o => (
        <li key={String(o.value)} className="flex items-center gap-2 text-sm text-ink">
          <span className={`w-4 h-4 border-2 border-line-strong shrink-0 ${kind === 'radio' ? 'rounded-full' : 'rounded'}`} aria-hidden="true" />
          <span className="truncate">{o.label || o.value}</span>
          {typeof o.price === 'number' && <span className="text-xs text-muted">{o.price.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span>}
          {typeof o.capacity === 'number' && <span className="text-[10px] text-muted">{o.capacity} places</span>}
          {o.showIf && <span className="badge badge-amber">si…</span>}
        </li>
      ))}
      {more > 0 && <li className="text-xs text-muted">+ {more} autre{more > 1 ? 's' : ''}</li>}
    </ul>
  );
}

export function ControlPreview({ item }) {
  switch (item.type) {
    case 'long_text': return <div className={`${box} !h-16 items-start pt-2`}>{item.placeholder || 'Réponse longue…'}</div>;
    case 'single_choice': return <Options item={item} kind="radio" />;
    case 'multiple_choice': return <Options item={item} kind="check" />;
    case 'dropdown': return <div className={`${box} justify-between`}><span>{item.source ? `Liste des ${SOURCE_LABEL[item.source]}` : item.placeholder || 'Choisir…'}</span><span aria-hidden="true">▾</span></div>;
    case 'yes_no': return <div className="flex gap-2">{['Oui', 'Non'].map(x => <span key={x} className="px-4 py-1.5 text-xs rounded-lg border border-line text-ink">{x}</span>)}</div>;
    case 'image_choice': return (
      <div className="grid grid-cols-3 gap-2">
        {(item.options || []).slice(0, 6).map(o => (
          <div key={String(o.value)} className="rounded-lg border border-line overflow-hidden text-center">
            {o.image?.dataUrl ? <img src={o.image.dataUrl} alt="" className="w-full h-14 object-cover" /> : <div className="h-14 bg-elevated" />}
            <p className="text-[11px] text-ink p-1 truncate">{o.label}</p>
          </div>
        ))}
      </div>
    );
    case 'ranking': return (
      <ol className="space-y-1">
        {(item.options || []).slice(0, 5).map((o, i) => <li key={String(o.value)} className="flex items-center gap-2 text-xs text-ink border border-line rounded-lg px-2 py-1"><GripVertical size={12} className="text-muted" aria-hidden="true" />{i + 1}. {o.label}</li>)}
      </ol>
    );
    case 'matrix': return (
      <div className="overflow-x-auto">
        <table className="text-[11px] text-ink w-full">
          <thead><tr><th />{(item.columns || []).map(c => <th key={String(c.value)} className="font-normal text-muted px-1">{c.label}</th>)}</tr></thead>
          <tbody>{(item.options || []).slice(0, 5).map(r => <tr key={String(r.value)}><td className="pr-2 py-0.5">{r.label}</td>{(item.columns || []).map(c => <td key={String(c.value)} className="text-center"><span className="inline-block w-3 h-3 rounded-full border border-line-strong" /></td>)}</tr>)}</tbody>
        </table>
      </div>
    );
    case 'rating': return <div className="flex gap-1 text-muted">{Array.from({ length: item.max || 5 }, (_, i) => <Star key={i} size={20} aria-hidden="true" />)}</div>;
    case 'scale': case 'nps': {
      const lo = item.type === 'nps' ? 0 : item.min ?? 1, hi = item.type === 'nps' ? 10 : item.max ?? 10;
      const n = Math.max(0, Math.min(11, hi - lo + 1));
      return (
        <div>
          <div className="flex gap-1 flex-wrap">{Array.from({ length: n }, (_, i) => <span key={i} className="w-7 h-7 rounded-md border border-line text-[11px] flex items-center justify-center text-ink">{lo + i}</span>)}</div>
          {(item.minLabel || item.maxLabel) && <div className="flex justify-between text-[10px] text-muted mt-1"><span>{item.minLabel}</span><span>{item.maxLabel}</span></div>}
        </div>
      );
    }
    case 'date': return <div className={box}>jj/mm/aaaa</div>;
    case 'time': return <div className={box}>hh:mm</div>;
    case 'datetime': return <div className={box}>jj/mm/aaaa hh:mm</div>;
    case 'number': return <div className={box}>{item.placeholder || '0'}</div>;
    case 'email': return <div className={box}>{item.placeholder || 'prenom.nom@exemple.fr'}</div>;
    case 'phone': return <div className={box}>{item.placeholder || '06 12 34 56 78'}</div>;
    case 'url': return <div className={box}>{item.placeholder || 'https://'}</div>;
    case 'name': return <div className="grid grid-cols-2 gap-2"><div className={box}>Prénom</div><div className={box}>Nom</div></div>;
    case 'address': return <div className="grid gap-2"><div className={box}>Adresse</div><div className="grid grid-cols-[6rem_1fr] gap-2"><div className={box}>Code postal</div><div className={box}>Ville</div></div></div>;
    case 'slots': return <div className="space-y-1"><p className="text-[11px] text-muted flex items-center gap-1"><CalendarRange size={12} aria-hidden="true" />Créneaux{item.multiple ? ' (plusieurs possibles)' : ''}</p><Options item={item} kind={item.multiple ? 'check' : 'radio'} /></div>;
    case 'file': return <div className={`${box} !h-14 justify-center gap-2 border-dashed`}><Upload size={14} aria-hidden="true" /> Déposer un fichier</div>;
    case 'signature': return <div className={`${box} !h-16 justify-center gap-2 border-dashed`}><PenLine size={14} aria-hidden="true" /> Signer ici</div>;
    case 'consent': return null;
    case 'member_picker': return <div className={`${box} gap-2`}><Users size={14} aria-hidden="true" /> Choisir {item.multiple ? 'des membres' : 'un membre'}</div>;
    case 'event_picker': return <div className={`${box} gap-2`}><PartyPopper size={14} aria-hidden="true" /> Choisir {item.multiple ? 'des événements' : 'un événement'}</div>;
    case 'payment': {
      const amount = typeof item.amount === 'number' ? item.amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : item.amount?.expr ? `= ${item.amount.expr}` : null;
      return item.options?.some(o => typeof o.price === 'number') ? <Options item={item} kind="radio" /> : <div className={`${box} gap-2`}><CreditCard size={14} aria-hidden="true" /> Montant : {amount || 'saisi par le répondant'}</div>;
    }
    case 'calculated': return <div className={`${box} gap-2 font-mono`}><Calculator size={14} aria-hidden="true" /> = {item.expr || '…'}</div>;
    case 'hidden': return <div className={`${box} gap-2 border-dashed`}><EyeOff size={14} aria-hidden="true" /> Champ caché {item.prefillFrom ? `(${item.prefillFrom})` : ''}</div>;
    default: return <div className={box}>{item.placeholder || 'Ta réponse'}</div>;
  }
}

export default function ItemPreview({ item }) {
  if (item.kind === 'content') {
    if (item.format === 'divider') return <hr className="border-line my-1" />;
    if (item.format === 'image') {
      return item.image?.dataUrl
        ? <img src={item.image.dataUrl} alt={item.alt || ''} className="max-h-48 rounded-lg object-contain" />
        : <div className="h-20 rounded-lg border border-dashed border-line flex items-center justify-center text-xs text-muted">Image (à choisir dans les propriétés)</div>;
    }
    return <p className="text-sm text-ink whitespace-pre-line">{item.text || <span className="text-muted">Texte vide</span>}</p>;
  }
  if (item.kind !== 'question') return null;
  const required = item.required === true || (item.type === 'consent' && item.required !== false);
  if (item.type === 'consent') {
    return (
      <label className="flex items-start gap-2 text-sm text-ink">
        <span className="w-4 h-4 mt-0.5 rounded border-2 border-line-strong shrink-0" aria-hidden="true" />
        <span>{item.label}{required && <span className="text-red-500"> *</span>}</span>
      </label>
    );
  }
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-ink">
        {item.label || <span className="text-muted">Question sans intitulé</span>}
        {required && <span className="text-red-500" aria-label="obligatoire"> *</span>}
        {typeof item.required === 'string' && <span className="text-amber-600 text-xs" title={`Obligatoire si ${item.required}`}> *?</span>}
      </p>
      {item.help && <p className="text-xs text-dim">{item.help}</p>}
      <ControlPreview item={item} />
      {item.repeat && <p className="text-[11px] text-blue-600">+ {item.repeat.addLabel || 'Ajouter'} (répétable)</p>}
    </div>
  );
}
