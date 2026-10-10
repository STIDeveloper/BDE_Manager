// Suppression d'un rôle : impact calculé AVANT confirmation + choix du sort
// des membres (laisser sans rôle ou réaffecter).
import { useId, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from '../../Modal';
import { useStore } from '../../../store.js';
import { useCatalog } from '../../../core/useCatalog.js';
import { toast } from '../../ui/toastStore';
import { computeRoleImpact, plural } from './helpers.js';
import { inputCls } from './constants.js';
import { FieldError } from './ui.jsx';

const MAX_NAMES = 8;

/**
 * @param {{role:object, usage:object, onClose:()=>void, onDeleted?:(roleId:string)=>void}} props
 */
export default function DeleteRoleDialog({ role, usage, onClose, onDeleted }) {
  const { roleList, poles } = useCatalog();
  const impact = useMemo(() => computeRoleImpact(role.id, usage), [role.id, usage]);
  const [mode, setMode] = useState('detach'); // 'detach' | 'reassign'
  // Choix par défaut : un autre rôle du même pôle (le plus probable).
  const [target, setTarget] = useState(() => (
    roleList.find(r => r.id !== role.id && r.pole === role.pole)?.id
    || roleList.find(r => r.id !== role.id)?.id || ''
  ));
  const [error, setError] = useState('');
  const uid = useId();
  const id = (k) => `${uid}-${k}`;
  const others = roleList.filter(r => r.id !== role.id);

  const lines = [];
  if (impact.memberCount > 0) {
    const names = impact.memberNames.slice(0, MAX_NAMES).join(', ');
    const more = impact.memberCount > MAX_NAMES ? ` et ${impact.memberCount - MAX_NAMES} autre(s)` : '';
    lines.push(`${plural(impact.memberCount, 'membre occupe', 'membres occupent')} ce rôle : ${names}${more}.`);
  }
  if (impact.presetFolders > 0) lines.push(`Le preset Drive associé (${plural(impact.presetFolders, 'dossier', 'dossiers')}) sera supprimé. Les permissions déjà attribuées ne changent pas.`);
  if (impact.candidateCount > 0) lines.push(`${plural(impact.candidateCount, 'candidat l\'a', 'candidats l\'ont')} dans ses vœux : ce vœu ne sera plus reconnu au prochain calcul.`);
  if (impact.constraintCount > 0) lines.push(`${plural(impact.constraintCount, 'contrainte du moteur le cite', 'contraintes du moteur le citent')} (imposé / préféré / interdit) : elles seront retirées définitivement (Ctrl+Z ne les restaure pas).`);
  if (impact.assignedCount > 0) lines.push(`${plural(impact.assignedCount, 'candidat y est affecté', 'candidats y sont affectés')} dans le scénario actuel : le calcul sera relancé.`);

  const confirm = () => {
    const reassignTo = impact.memberCount > 0 && mode === 'reassign' ? target : '';
    if (impact.memberCount > 0 && mode === 'reassign' && !target) {
      setError('Choisis le rôle de remplacement.');
      return;
    }
    const res = useStore.getState().deleteRole(role.id, { reassignTo });
    if (!res.ok) { setError(res.error); return; }
    const n = res.affectedMembers || 0;
    const detail = n === 0 ? '' : reassignTo
      ? `${plural(n, 'membre réaffecté', 'membres réaffectés')} à « ${roleList.find(r => r.id === reassignTo)?.label || reassignTo} ». `
      : `${plural(n, 'membre laissé', 'membres laissés')} sans rôle. `;
    toast.success(`Rôle « ${role.label} » supprimé`, `${detail}Ctrl+Z pour annuler.`);
    onDeleted?.(role.id);
    onClose();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Supprimer le rôle « ${role.label} » ?`}
      maxWidth="max-w-lg"
      footer={(
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button type="button" data-autofocus onClick={onClose} className="btn-secondary min-h-[40px]">Annuler</button>
          <button type="button" onClick={confirm} className="btn-danger min-h-[40px]">Supprimer le rôle</button>
        </div>
      )}
    >
      <div className="space-y-4">
        <div className={`flex gap-3 items-start border rounded-xl p-3 ${impact.isUsed ? 'bg-red-500/10 border-red-500/30' : 'bg-elevated border-line'}`}>
          <AlertTriangle size={18} className={`shrink-0 mt-0.5 ${impact.isUsed ? 'text-red-500' : 'text-dim'}`} aria-hidden="true" />
          <div className="text-sm text-ink min-w-0">
            {lines.length === 0 ? (
              <p>Ce rôle n'est utilisé nulle part. Tu peux le supprimer sans risque.</p>
            ) : (
              <>
                <p className="font-medium mb-1">Conséquences :</p>
                <ul className="list-disc pl-4 space-y-1 text-dim">
                  {lines.map(l => <li key={l}>{l}</li>)}
                </ul>
              </>
            )}
          </div>
        </div>

        {impact.memberCount > 0 && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-ink mb-1">Que deviennent les membres ?</legend>
            <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-line cursor-pointer min-h-[44px]">
              <input
                type="radio" name={id('mode')} value="detach" checked={mode === 'detach'}
                onChange={() => { setMode('detach'); setError(''); }}
                className="mt-0.5 w-4 h-4 accent-blue-600"
              />
              <span className="text-sm text-ink">
                Laisser sans rôle
                <span className="block text-xs text-dim">L'ancien libellé « {role.label} » est conservé sur leur fiche.</span>
              </span>
            </label>
            <div className="p-2.5 rounded-lg border border-line space-y-2">
              <label className="flex items-start gap-2.5 cursor-pointer min-h-[28px]">
                <input
                  type="radio" name={id('mode')} value="reassign" checked={mode === 'reassign'}
                  onChange={() => setMode('reassign')} disabled={others.length === 0}
                  className="mt-0.5 w-4 h-4 accent-blue-600"
                />
                <span className="text-sm text-ink">Réaffecter à un autre rôle</span>
              </label>
              <label htmlFor={id('target')} className="sr-only">Rôle de remplacement</label>
              <select
                id={id('target')} value={target} disabled={mode !== 'reassign'}
                onChange={(e) => { setTarget(e.target.value); setError(''); }}
                className={`${inputCls} disabled:opacity-50`}
              >
                {others.map(r => (
                  <option key={r.id} value={r.id}>{poles[r.pole]?.emoji} {r.label}</option>
                ))}
              </select>
            </div>
          </fieldset>
        )}
        <FieldError id={id('err')}>{error}</FieldError>
      </div>
    </Modal>
  );
}
