// Création / modification d'un niveau hiérarchique.
import { useId, useState } from 'react';
import Modal from '../../Modal';
import { useStore } from '../../../store.js';
import { LEVEL_KINDS, CATALOG_LIMITS } from '../../../core/catalog.js';
import { toast } from '../../ui/toastStore';
import { FieldError } from './ui.jsx';
import { inputCls, labelCls } from './constants.js';

/**
 * @param {{level?:object|null, onClose:()=>void}} props  level absent → création.
 */
export default function LevelDialog({ level, onClose }) {
  const isEdit = !!level;
  const [form, setForm] = useState(() => ({
    label: level?.label || '',
    kind: level?.kind || 'membre',
    requirement: Math.round((level?.requirement ?? 0.5) * 100),
  }));
  const [error, setError] = useState('');
  const uid = useId();
  const id = (k) => `${uid}-${k}`;
  const patch = (p) => setForm(f => ({ ...f, ...p }));
  const kind = LEVEL_KINDS.find(k => k.id === form.kind);

  const submit = (e) => {
    e.preventDefault();
    const label = form.label.trim();
    if (!label) { setError('Le nom du niveau est obligatoire.'); return; }
    const data = { label, kind: form.kind, requirement: form.requirement / 100 };
    const st = useStore.getState();
    const res = isEdit ? st.updateLevel(level.id, data) : st.addLevel(data);
    if (!res.ok) { setError(res.error); return; }
    toast.success(isEdit ? `Niveau « ${label} » mis à jour` : `Niveau « ${label} » créé (placé en bas de la hiérarchie)`);
    onClose();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEdit ? `Modifier le niveau « ${level.label} »` : 'Nouveau niveau'}
      description="Un niveau situe un rôle dans la hiérarchie (Bureau, Responsable, Membre…)."
      maxWidth="max-w-lg"
      footer={(
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary min-h-[40px]">Annuler</button>
          <button type="submit" form={id('form')} className="btn-primary min-h-[40px]">{isEdit ? 'Enregistrer' : 'Créer le niveau'}</button>
        </div>
      )}
    >
      <form id={id('form')} onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label htmlFor={id('label')} className={labelCls}>Nom du niveau *</label>
          <input
            id={id('label')} data-autofocus type="text" value={form.label} maxLength={CATALOG_LIMITS.maxLabel}
            onChange={(e) => { patch({ label: e.target.value }); setError(''); }}
            placeholder="Ex. Chargé de mission"
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? id('err') : undefined}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor={id('kind')} className={labelCls}>Comportement dans le moteur</label>
          <select id={id('kind')} value={form.kind} onChange={(e) => patch({ kind: e.target.value })} aria-describedby={id('kindHelp')} className={inputCls}>
            {LEVEL_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
          <p id={id('kindHelp')} className="text-xs text-dim mt-1">{kind?.description}</p>
        </div>
        <div>
          <label htmlFor={id('req')} className={labelCls}>Disponibilité attendue : {form.requirement} %</label>
          <input
            id={id('req')} type="range" min={0} max={100} step={5} value={form.requirement}
            onChange={(e) => patch({ requirement: Number(e.target.value) })}
            aria-valuetext={`${form.requirement} %`} aria-describedby={id('reqHelp')}
            className="w-full accent-blue-600 min-h-[36px]"
          />
          <p id={id('reqHelp')} className="text-xs text-dim mt-1">
            Disponibilité minimale souhaitée pour les rôles de ce niveau : le moteur pénalise les candidats moins disponibles.
          </p>
        </div>
        <FieldError id={id('err')}>{error}</FieldError>
      </form>
    </Modal>
  );
}
