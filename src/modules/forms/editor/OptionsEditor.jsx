// Édition des options d'une question (choix, lignes de tableau, créneaux…).
import { useId, useState } from 'react';
import { ArrowDown, ArrowUp, ClipboardPaste, Filter, ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { optionValue } from '../../../forms/templates/index.js';
import { toast } from '../../../components/ui/toastStore.js';
import { ConditionEditor } from './Formula.jsx';
import { importPublicImage, formatKb, imageBytes } from '../image.js';

/** Valeur unique dans la liste. */
function uniqueValue(base, list, except = -1) {
  const taken = new Set(list.filter((_, i) => i !== except).map(o => String(o.value)));
  const root = base || 'option';
  let v = root;
  for (let i = 2; taken.has(v); i++) v = `${root}_${i}`;
  return v;
}

/**
 * options : Option[] ; onChange(next) ; features : { capacity, price, image, condition }
 */
export default function OptionsEditor({ options, onChange, features = {}, def, title = 'Options', addLabel = 'Ajouter une option' }) {
  const uid = useId();
  const list = Array.isArray(options) ? options : [];
  const [bulk, setBulk] = useState(null); // texte du collage en masse
  const [condFor, setCondFor] = useState(null);
  const [showValues, setShowValues] = useState(false);

  const set = (i, patch) => {
    const next = list.map((o, j) => {
      if (j !== i) return o;
      const merged = { ...o, ...patch };
      // Valeur dérivée du libellé tant qu'elle n'a pas été personnalisée
      if ('label' in patch && (o.value === optionValue(o.label || '') || /^(option|choix|creneau|ligne)_\d+$/.test(String(o.value)))) {
        merged.value = uniqueValue(optionValue(patch.label) || 'option', list, i);
      }
      for (const k of Object.keys(merged)) if (merged[k] === undefined || merged[k] === '') { if (k !== 'label' && k !== 'value') delete merged[k]; }
      return merged;
    });
    onChange(next);
  };
  const add = () => {
    const n = list.length + 1;
    const label = `Option ${n}`;
    onChange([...list, { value: uniqueValue(`option_${n}`, list), label }]);
  };
  const remove = i => onChange(list.filter((_, j) => j !== i));
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const applyBulk = (mode) => {
    const lines = String(bulk || '').split(/\r?\n/).map(l => l.replace(/^[-*•\d.)\s]+(?=\S)/, '').trim()).filter(Boolean);
    if (!lines.length) { setBulk(null); return; }
    const base = mode === 'replace' ? [] : [...list];
    for (const line of lines) {
      // « Libellé | 12 » : prix ou capacité selon la question
      const [label, extra] = line.split('|').map(s => s.trim());
      const o = { value: uniqueValue(optionValue(label) || 'option', base), label };
      const n = Number(String(extra || '').replace(',', '.'));
      if (extra && Number.isFinite(n)) {
        if (features.price) o.price = n;
        else if (features.capacity) o.capacity = Math.max(0, Math.round(n));
      }
      base.push(o);
    }
    onChange(base);
    setBulk(null);
    toast.success(`${lines.length} option${lines.length > 1 ? 's' : ''} ajoutée${lines.length > 1 ? 's' : ''}`);
  };
  const pickImage = async (i, file) => {
    if (!file) return;
    try {
      const ref = await importPublicImage(file);
      set(i, { image: ref });
      toast.success('Image ajoutée', `${formatKb(imageBytes(ref))} (compressée pour la page publique)`);
    } catch (err) {
      toast.error('Image refusée', String(err?.message || err));
    }
  };
  const values = list.map(o => String(o.value));
  const dup = new Set(values.filter((v, i) => values.indexOf(v) !== i));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-ink">{title} <span className="text-muted font-normal">({list.length})</span></h4>
        <div className="flex items-center gap-1">
          <button type="button" className="btn-ghost !px-2 !py-1 text-[11px]" aria-pressed={showValues} onClick={() => setShowValues(v => !v)}>{showValues ? 'Masquer les valeurs' : 'Valeurs'}</button>
          <button type="button" className="btn-ghost !px-2 !py-1 text-[11px]" onClick={() => setBulk('')}><ClipboardPaste size={12} aria-hidden="true" /> Coller une liste</button>
        </div>
      </div>
      {bulk !== null && (
        <div className="border border-line rounded-lg p-2 space-y-2 bg-elevated">
          <label htmlFor={`${uid}-bulk`} className="text-[11px] text-dim">Une option par ligne{features.price ? ' (prix après « | », ex. « Formule A | 25 »)' : features.capacity ? ' (capacité après « | », ex. « Lundi 12 h | 10 »)' : ''}.</label>
          <textarea id={`${uid}-bulk`} rows={5} className="input text-xs" value={bulk} onChange={e => setBulk(e.target.value)} placeholder={'Option A\nOption B\nOption C'} />
          <div className="flex flex-wrap gap-1.5 justify-end">
            <button type="button" className="btn-ghost !py-1 text-xs" onClick={() => setBulk(null)}>Annuler</button>
            <button type="button" className="btn-secondary !py-1 text-xs" onClick={() => applyBulk('replace')}>Remplacer</button>
            <button type="button" className="btn-primary !py-1 text-xs" onClick={() => applyBulk('append')}>Ajouter à la suite</button>
          </div>
        </div>
      )}
      <ol className="space-y-1.5">
        {list.map((o, i) => (
          <li key={i} className="border border-line rounded-lg p-1.5 space-y-1.5 bg-surface">
            <div className="flex items-center gap-1">
              <div className="flex flex-col">
                <button type="button" className="text-muted hover:text-ink disabled:opacity-30 p-0.5" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Monter l'option ${o.label || i + 1}`}><ArrowUp size={12} aria-hidden="true" /></button>
                <button type="button" className="text-muted hover:text-ink disabled:opacity-30 p-0.5" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label={`Descendre l'option ${o.label || i + 1}`}><ArrowDown size={12} aria-hidden="true" /></button>
              </div>
              <label className="sr-only" htmlFor={`${uid}-l${i}`}>Libellé de l'option {i + 1}</label>
              <input id={`${uid}-l${i}`} className="input !py-1 text-xs flex-1 min-w-0" value={o.label ?? ''} onChange={e => set(i, { label: e.target.value })} placeholder={`Option ${i + 1}`} />
              {features.condition && (
                <button type="button" className={`btn-ghost !p-1 ${o.showIf ? '!text-amber-600' : ''}`} aria-label={`Condition d'affichage de l'option ${o.label || i + 1}`} aria-expanded={condFor === i} onClick={() => setCondFor(c => (c === i ? null : i))}><Filter size={13} aria-hidden="true" /></button>
              )}
              <button type="button" className="btn-ghost !p-1" aria-label={`Supprimer l'option ${o.label || i + 1}`} onClick={() => remove(i)}><Trash2 size={13} aria-hidden="true" /></button>
            </div>
            {(showValues || dup.has(String(o.value)) || features.capacity || features.price || features.image) && (
              <div className="flex flex-wrap items-center gap-1.5 pl-5">
                {(showValues || dup.has(String(o.value))) && (
                  <span className="flex items-center gap-1">
                    <label htmlFor={`${uid}-v${i}`} className="text-[10px] text-muted">valeur</label>
                    <input id={`${uid}-v${i}`} className={`input !py-0.5 !px-1.5 text-[11px] font-mono w-28 ${dup.has(String(o.value)) ? '!border-red-500' : ''}`} value={o.value ?? ''}
                      onChange={e => set(i, { value: e.target.value.replace(/\s+/g, '_') })} aria-invalid={dup.has(String(o.value))} />
                  </span>
                )}
                {features.capacity && (
                  <span className="flex items-center gap-1">
                    <label htmlFor={`${uid}-c${i}`} className="text-[10px] text-muted">places</label>
                    <input id={`${uid}-c${i}`} type="number" min={0} className="input !py-0.5 !px-1.5 text-[11px] w-16" value={o.capacity ?? ''}
                      onChange={e => set(i, { capacity: e.target.value === '' ? undefined : Math.max(0, Math.round(Number(e.target.value))) })} placeholder="∞" />
                  </span>
                )}
                {features.price && (
                  <span className="flex items-center gap-1">
                    <label htmlFor={`${uid}-p${i}`} className="text-[10px] text-muted">prix €</label>
                    <input id={`${uid}-p${i}`} type="number" min={0} step="0.01" className="input !py-0.5 !px-1.5 text-[11px] w-20" value={o.price ?? ''}
                      onChange={e => set(i, { price: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })} />
                  </span>
                )}
                {features.image && (
                  <span className="flex items-center gap-1">
                    {o.image?.dataUrl ? (
                      <>
                        <img src={o.image.dataUrl} alt="" className="w-8 h-8 rounded object-cover border border-line" />
                        <button type="button" className="btn-ghost !p-0.5" aria-label={`Retirer l'image de l'option ${o.label || i + 1}`} onClick={() => set(i, { image: undefined })}><X size={12} aria-hidden="true" /></button>
                      </>
                    ) : (
                      <label className="btn-ghost !px-1.5 !py-0.5 text-[11px] cursor-pointer">
                        <ImagePlus size={12} aria-hidden="true" /> Image
                        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={e => { pickImage(i, e.target.files?.[0]); e.target.value = ''; }} />
                      </label>
                    )}
                  </span>
                )}
              </div>
            )}
            {dup.has(String(o.value)) && <p className="text-[10px] text-red-600 pl-5">Valeur en double : chaque option doit avoir une valeur unique.</p>}
            {features.condition && condFor === i && (
              <ConditionEditor value={o.showIf} onChange={v => set(i, { showIf: v })} def={def} label="Proposer cette option si" emptyLabel="Toujours proposée" />
            )}
          </li>
        ))}
      </ol>
      <button type="button" className="btn-secondary !py-1 text-xs w-full" onClick={add}><Plus size={13} aria-hidden="true" /> {addLabel}</button>
    </div>
  );
}
