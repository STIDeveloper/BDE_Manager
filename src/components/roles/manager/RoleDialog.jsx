// Création d'un rôle (la modification se fait sur place dans le détail).
import { useId, useState } from 'react';
import Modal from '../../Modal';
import { useStore } from '../../../store.js';
import { useCatalog } from '../../../core/useCatalog.js';
import { CATALOG_LIMITS } from '../../../core/catalog.js';
import { toast } from '../../ui/toastStore';
import { AliasEditor } from './fields.jsx';
import { FieldError } from './ui.jsx';
import { inputCls, labelCls } from './constants.js';

/**
 * @param {{defaultPole?:string|null, onClose:()=>void, onCreated?:(id:string)=>void}} props
 */
export default function RoleDialog({ defaultPole, onClose, onCreated }) {
  const { poles, roles, poleList, levelList } = useCatalog();
  const [form, setForm] = useState(() => ({
    label: '',
    pole: defaultPole && poles[defaultPole] ? defaultPole : (poleList[0]?.id || ''),
    // Par défaut : le niveau le plus bas (le cas le plus fréquent : « Membre … »).
    level: levelList.at(-1)?.id || '',
    capacity: '1',
    leadership: false,
    essential: false,
    aliases: [],
  }));
  const [error, setError] = useState('');
  const uid = useId();
  const id = (k) => `${uid}-${k}`;
  const patch = (p) => setForm(f => ({ ...f, ...p }));

  const submit = (e) => {
    e.preventDefault();
    const label = form.label.trim();
    if (!label) { setError('Le nom du rôle est obligatoire.'); return; }
    const capacity = Number(form.capacity);
    if (!Number.isInteger(capacity) || capacity < 0 || capacity > CATALOG_LIMITS.maxCapacity) {
      setError(`La capacité doit être un nombre entier entre 0 et ${CATALOG_LIMITS.maxCapacity}.`);
      return;
    }
    const res = useStore.getState().addRole({
      label, pole: form.pole, level: form.level, capacity,
      leadership: form.leadership, essential: form.essential, aliases: form.aliases,
    });
    if (!res.ok) { setError(res.error); return; }
    toast.success(`Rôle « ${label} » créé`);
    onCreated?.(res.id);
    onClose();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Nouveau rôle"
      description="Le rôle apparaît aussitôt dans l'organigramme, le moteur d'affectation et les fiches membres."
      maxWidth="max-w-xl"
      footer={(
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary min-h-[40px]">Annuler</button>
          <button type="submit" form={id('form')} className="btn-primary min-h-[40px]">Créer le rôle</button>
        </div>
      )}
    >
      <form id={id('form')} onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label htmlFor={id('label')} className={labelCls}>Nom du rôle *</label>
          <input
            id={id('label')} data-autofocus type="text" value={form.label} maxLength={CATALOG_LIMITS.maxLabel}
            onChange={(e) => { patch({ label: e.target.value }); setError(''); }}
            placeholder="Ex. Responsable Design"
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? id('err') : undefined}
            className={inputCls}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_7rem] gap-3">
          <div>
            <label htmlFor={id('pole')} className={labelCls}>Pôle</label>
            <select id={id('pole')} value={form.pole} onChange={(e) => patch({ pole: e.target.value })} className={inputCls}>
              {poleList.map(p => <option key={p.id} value={p.id}>{p.emoji} {p.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={id('level')} className={labelCls}>Niveau</label>
            <select id={id('level')} value={form.level} onChange={(e) => patch({ level: e.target.value })} className={inputCls}>
              {levelList.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={id('cap')} className={labelCls}>Capacité</label>
            <input
              id={id('cap')} type="number" inputMode="numeric" min={0} max={CATALOG_LIMITS.maxCapacity} step={1}
              value={form.capacity} onChange={(e) => patch({ capacity: e.target.value })}
              aria-describedby={id('capHelp')}
              className={inputCls}
            />
          </div>
        </div>
        <p id={id('capHelp')} className="text-xs text-dim -mt-2">Capacité = nombre de places à pourvoir pour ce rôle (0 à {CATALOG_LIMITS.maxCapacity}).</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-line cursor-pointer min-h-[44px]">
            <input type="checkbox" checked={form.leadership} onChange={(e) => patch({ leadership: e.target.checked })} className="mt-0.5 w-4 h-4 accent-blue-600" />
            <span className="text-sm text-ink">⭐ Rôle de leadership<span className="block text-xs text-dim">Encadre une équipe ou un projet.</span></span>
          </label>
          <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-line cursor-pointer min-h-[44px]">
            <input type="checkbox" checked={form.essential} onChange={(e) => patch({ essential: e.target.checked })} className="mt-0.5 w-4 h-4 accent-blue-600" />
            <span className="text-sm text-ink">🔒 Rôle essentiel<span className="block text-xs text-dim">Poste indispensable, à pourvoir en priorité.</span></span>
          </label>
        </div>

        <div>
          <label htmlFor={id('alias')} className={labelCls}>Alias (optionnel)</label>
          <AliasEditor
            id={id('alias')} value={form.aliases} roles={roles} describedBy={id('aliasHelp')}
            onChange={(aliases) => patch({ aliases })}
          />
          <p id={id('aliasHelp')} className="text-xs text-dim mt-1">
            Autres noms utilisés dans les réponses du Google Form (ex. « Prez », « Respo com »). Ils permettent de reconnaître ce rôle lors de l'import CSV.
          </p>
        </div>

        <FieldError id={id('err')}>{error}</FieldError>
      </form>
    </Modal>
  );
}
