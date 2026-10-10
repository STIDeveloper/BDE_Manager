// Création / modification d'un pôle.
import { useId, useState } from 'react';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import Modal from '../../Modal';
import { useStore } from '../../../store.js';
import { POLE_PALETTE, poleColorHex, CATALOG_LIMITS } from '../../../core/catalog.js';
import { toast } from '../../ui/toastStore';
import { affinityEntries, formatDecimal } from './helpers.js';
import {
  COLOR_NAMES, EMOJI_SUGGESTIONS, FOCUS_RING, KNOWN_FORMATIONS, inputCls, labelCls,
} from './constants.js';
import { FieldError, IconButton } from './ui.jsx';

/**
 * @param {{pole?:object|null, onClose:()=>void, onSaved?:(id:string)=>void}} props
 *   pole absent → création.
 */
export default function PoleDialog({ pole, onClose, onSaved }) {
  const isEdit = !!pole;
  const columns = useStore(s => s.columns);
  const [form, setForm] = useState(() => ({
    label: pole?.label || '',
    short: pole?.short && pole.short !== pole.label ? pole.short : '',
    emoji: pole?.emoji || '📌',
    color: pole?.color || 'blue',
    columnId: pole?.columnId || '',
    affinity: affinityEntries(pole?.affinity),
  }));
  const [error, setError] = useState('');
  const [showAffinity, setShowAffinity] = useState(() => affinityEntries(pole?.affinity).length > 0);
  const [newFormation, setNewFormation] = useState('');
  const uid = useId();
  const ids = Object.fromEntries(
    ['label', 'short', 'emoji', 'color', 'custom', 'column', 'columnHelp', 'form', 'aff', 'newF', 'affHelp']
      .map(k => [k, `${uid}-${k}`]),
  );

  const patch = (p) => setForm(f => ({ ...f, ...p }));
  const customHex = poleColorHex(form.color);
  const isPaletteColor = !!POLE_PALETTE[form.color];

  const setAffinity = (name, value) => patch({
    affinity: form.affinity.map(a => (a.name === name ? { ...a, value } : a)),
  });
  const removeAffinity = (name) => patch({ affinity: form.affinity.filter(a => a.name !== name) });
  const addFormation = (name) => {
    const n = String(name || '').trim();
    if (!n || form.affinity.some(a => a.name.toLowerCase() === n.toLowerCase())) return;
    patch({ affinity: [...form.affinity, { name: n, value: 0.5 }] });
    setNewFormation('');
  };
  const missingKnown = KNOWN_FORMATIONS.filter(f => !form.affinity.some(a => a.name === f));

  const submit = (e) => {
    e.preventDefault();
    const label = form.label.trim();
    if (!label) { setError('Le nom du pôle est obligatoire.'); return; }
    const data = {
      label,
      short: form.short.trim() || label,
      emoji: form.emoji.trim() || '📌',
      color: form.color,
      columnId: form.columnId,
      affinity: Object.fromEntries(form.affinity.map(a => [a.name, a.value])),
    };
    const st = useStore.getState();
    const res = isEdit ? st.updatePole(pole.id, data) : st.addPole(data);
    if (!res.ok) { setError(res.error); return; }
    toast.success(isEdit ? `Pôle « ${label} » mis à jour` : `Pôle « ${label} » créé`);
    onSaved?.(isEdit ? pole.id : res.id);
    onClose();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEdit ? `Modifier le pôle « ${pole.label} »` : 'Nouveau pôle'}
      description="Un pôle regroupe des rôles (Bureau, Communication…) et définit leur couleur dans l'organigramme."
      maxWidth="max-w-xl"
      footer={(
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary min-h-[40px]">Annuler</button>
          <button type="submit" form={ids.form} className="btn-primary min-h-[40px]">
            {isEdit ? 'Enregistrer' : 'Créer le pôle'}
          </button>
        </div>
      )}
    >
      <form id={ids.form} onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_9rem] gap-3">
          <div>
            <label htmlFor={ids.label} className={labelCls}>Nom du pôle *</label>
            <input
              id={ids.label} data-autofocus type="text" required value={form.label}
              maxLength={CATALOG_LIMITS.maxLabel}
              onChange={(e) => { patch({ label: e.target.value }); setError(''); }}
              placeholder="Ex. Créatif"
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? `${ids.form}-msg` : undefined}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor={ids.short} className={labelCls}>Nom court</label>
            <input
              id={ids.short} type="text" value={form.short} maxLength={CATALOG_LIMITS.maxShort}
              onChange={(e) => patch({ short: e.target.value })}
              placeholder={form.label.trim().slice(0, CATALOG_LIMITS.maxShort) || 'Ex. Créa'}
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label htmlFor={ids.emoji} className={labelCls}>Emoji</label>
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              id={ids.emoji} type="text" value={form.emoji} maxLength={8}
              onChange={(e) => patch({ emoji: e.target.value })}
              className={`${inputCls} !w-16 text-center text-lg`}
            />
            {EMOJI_SUGGESTIONS.map(em => (
              <button
                key={em} type="button" onClick={() => patch({ emoji: em })}
                aria-label={`Choisir l'emoji ${em}`} aria-pressed={form.emoji === em}
                className={`w-9 h-9 rounded-lg text-lg border ${form.emoji === em ? 'border-blue-500 bg-blue-500/10' : 'border-transparent hover:bg-elevated'} ${FOCUS_RING}`}
              >
                {em}
              </button>
            ))}
          </div>
        </div>

        <fieldset>
          <legend className={labelCls}>Couleur</legend>
          <div className="flex flex-wrap items-center gap-1.5">
            {Object.entries(POLE_PALETTE).map(([key, hex]) => (
              <label key={key} className="relative cursor-pointer" title={COLOR_NAMES[key] || key}>
                <input
                  type="radio" name={ids.color} value={key} checked={form.color === key}
                  onChange={() => patch({ color: key })}
                  className="peer sr-only"
                />
                <span className="sr-only">{COLOR_NAMES[key] || key}</span>
                <span
                  aria-hidden="true"
                  className="block w-8 h-8 rounded-full border-2 border-transparent peer-checked:border-ink peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500/60 ring-offset-2 ring-offset-surface"
                  style={{ backgroundColor: hex }}
                />
              </label>
            ))}
            <label htmlFor={ids.custom} className="inline-flex items-center gap-2 ml-1 text-xs text-dim cursor-pointer">
              <input
                id={ids.custom} type="color" value={customHex}
                onChange={(e) => patch({ color: e.target.value.toLowerCase() })}
                className={`w-9 h-9 rounded-lg border border-line bg-transparent cursor-pointer ${!isPaletteColor ? 'ring-2 ring-ink' : ''}`}
              />
              Couleur personnalisée{!isPaletteColor && <span className="font-mono">{customHex}</span>}
            </label>
          </div>
        </fieldset>

        <div>
          <label htmlFor={ids.column} className={labelCls}>Colonne du tableau des membres (optionnel)</label>
          <select
            id={ids.column} value={form.columnId} onChange={(e) => patch({ columnId: e.target.value })}
            aria-describedby={ids.columnHelp} className={inputCls}
          >
            <option value="">Aucune colonne liée</option>
            {columns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            {form.columnId && !columns.some(c => c.id === form.columnId) && (
              <option value={form.columnId}>Colonne supprimée</option>
            )}
          </select>
          <p id={ids.columnHelp} className="text-xs text-dim mt-1">
            Quand tu appliques les résultats du moteur au BDE, les membres affectés à un rôle de ce pôle sont rangés dans cette colonne.
          </p>
        </div>

        {/* Choix UX : réglage avancé, replié par défaut pour ne pas intimider. */}
        <div className="border border-line rounded-xl">
          <button
            type="button" onClick={() => setShowAffinity(v => !v)}
            aria-expanded={showAffinity} aria-controls={ids.aff}
            className={`w-full flex items-center justify-between gap-2 px-3 min-h-[44px] text-sm font-medium text-ink rounded-xl ${FOCUS_RING}`}
          >
            <span>Affinités formation <span className="text-xs font-normal text-dim">(avancé)</span></span>
            <ChevronDown size={16} aria-hidden="true" className={`text-dim transition-transform ${showAffinity ? 'rotate-180' : ''}`} />
          </button>
          {showAffinity && (
            <div id={ids.aff} className="px-3 pb-3 space-y-3">
              <p id={ids.affHelp} className="text-xs text-dim">
                Indique à quel point chaque formation correspond à ce pôle (0 = pas du tout, 1 = parfaitement).
                Le moteur s'en sert pour départager les candidats. Une formation absente compte pour 0,5 (neutre).
              </p>
              {form.affinity.length === 0 && <p className="text-xs text-dim italic">Aucune affinité définie.</p>}
              <ul className="space-y-2">
                {form.affinity.map(a => {
                  const sliderId = `${ids.aff}-${encodeURIComponent(a.name)}`;
                  return (
                    <li key={a.name} className="flex items-center gap-2">
                      <label htmlFor={sliderId} className="text-sm text-ink w-28 truncate" title={a.name}>{a.name}</label>
                      <input
                        id={sliderId} type="range" min={0} max={1} step={0.1} value={a.value}
                        onChange={(e) => setAffinity(a.name, Number(e.target.value))}
                        aria-describedby={ids.affHelp}
                        className="flex-1 accent-blue-600 min-h-[36px]"
                      />
                      <span className="w-8 text-right text-xs tabular-nums text-dim">{formatDecimal(a.value)}</span>
                      <IconButton label={`Retirer l'affinité ${a.name}`} tone="danger" onClick={() => removeAffinity(a.name)}>
                        <Trash2 size={14} aria-hidden="true" />
                      </IconButton>
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap items-center gap-1.5">
                {missingKnown.map(f => (
                  <button key={f} type="button" onClick={() => addFormation(f)} className={`inline-flex items-center gap-1.5 px-2.5 min-h-[32px] rounded-lg text-xs font-medium border border-line text-dim hover:text-ink hover:bg-elevated ${FOCUS_RING}`}>
                    <Plus size={12} aria-hidden="true" /> {f}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <label htmlFor={ids.newF} className="sr-only">Autre formation</label>
                <input
                  id={ids.newF} type="text" value={newFormation} maxLength={40}
                  onChange={(e) => setNewFormation(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFormation(newFormation); } }}
                  placeholder="Autre formation (ex. TC)"
                  className={inputCls}
                />
                <button type="button" onClick={() => addFormation(newFormation)} disabled={!newFormation.trim()} className="btn-secondary !py-1.5 shrink-0">
                  Ajouter
                </button>
              </div>
            </div>
          )}
        </div>

        <FieldError id={`${ids.form}-msg`}>{error}</FieldError>
      </form>
    </Modal>
  );
}
