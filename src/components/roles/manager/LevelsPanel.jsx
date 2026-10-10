// Gestion des niveaux hiérarchiques (Bureau, Responsable, Adjoint, Membre…).
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, Layers3 } from 'lucide-react';
import { useStore } from '../../../store.js';
import { LEVEL_KINDS } from '../../../core/catalog.js';
import { confirmDialog } from '../../ui/confirmStore';
import { toast } from '../../ui/toastStore';
import { levelUsage, plural } from './helpers.js';
import { LEVEL_KIND_BADGE } from './constants.js';
import ActionMenu from './ActionMenu.jsx';
import LevelDialog from './LevelDialog.jsx';
import BlockedDialog from './BlockedDialog.jsx';
import { ColumnHeader, EmptyState, IconButton } from './ui.jsx';

/** @param {{catalog:object}} props */
export default function LevelsPanel({ catalog }) {
  const { roles, levelList } = catalog;
  const usage = useMemo(() => levelUsage(roles), [roles]);
  const [dialog, setDialog] = useState(null); // { type:'edit', level } | { type:'blocked', ... }
  const move = (id, dir) => useStore.getState().moveLevel(id, dir);

  const handleDelete = async (level) => {
    const using = Object.values(roles).filter(r => r.level === level.id);
    if (using.length > 0) {
      setDialog({
        type: 'blocked',
        title: `Impossible de supprimer « ${level.label} »`,
        message: `${plural(using.length, 'rôle utilise', 'rôles utilisent')} encore ce niveau. Change leur niveau (dans le détail du rôle) puis réessaie.`,
        items: using.map(r => r.label),
      });
      return;
    }
    if (levelList.length <= 1) {
      toast.error('Le catalogue doit contenir au moins un niveau.');
      return;
    }
    const ok = await confirmDialog({
      title: `Supprimer le niveau « ${level.label} » ?`,
      message: 'Aucun rôle ne l\'utilise. Tu pourras annuler avec Ctrl+Z.',
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    const res = useStore.getState().deleteLevel(level.id);
    if (res.ok) toast.success(`Niveau « ${level.label} » supprimé`);
    else toast.error(res.error);
  };

  return (
    <div className="card flex flex-col min-h-0 h-full">
      <ColumnHeader title="Niveaux hiérarchiques" count={levelList.length}>
        <button type="button" onClick={() => setDialog({ type: 'edit', level: null })} className="btn-primary !px-2.5 !py-1.5 text-xs min-h-[36px]">
          <Plus size={14} aria-hidden="true" /> Nouveau niveau
        </button>
      </ColumnHeader>
      <p className="px-3 pt-2 text-xs text-dim">
        L'ordre définit la hiérarchie : <strong className="text-ink">n° 1 = niveau le plus haut</strong> (ex. Bureau), le dernier = le plus bas.
        Le comportement indique au moteur comment évaluer les candidats pour les rôles de ce niveau.
      </p>

      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        {levelList.length === 0 ? (
          <EmptyState icon={Layers3} title="Aucun niveau">Crée un niveau pour pouvoir classer les rôles.</EmptyState>
        ) : (
          <ol className="space-y-1.5" aria-label="Niveaux, du plus haut au plus bas">
            {levelList.map((level, i) => {
              const kind = LEVEL_KINDS.find(k => k.id === level.kind);
              const count = usage[level.id] || 0;
              const pct = Math.round((level.requirement ?? 0) * 100);
              return (
                <li key={level.id} className="rounded-lg border border-line bg-surface p-2">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="w-7 h-7 rounded-lg bg-elevated text-xs font-semibold text-dim flex items-center justify-center shrink-0" aria-label={`Rang ${i + 1}`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-[12rem]">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium text-ink">{level.label}</span>
                        <span className={`badge ${LEVEL_KIND_BADGE[level.kind] || 'badge-neutral'}`}>{kind?.label || level.kind}</span>
                        <span className="text-[11px] text-dim">· {plural(count, 'rôle', 'rôles')}</span>
                      </div>
                      <p className="text-[11px] text-dim mt-0.5">{kind?.description}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[11px] text-dim shrink-0">Disponibilité attendue</span>
                        <div className="flex-1 max-w-[10rem] h-1.5 rounded-full bg-elevated overflow-hidden" role="img" aria-label={`Disponibilité attendue : ${pct} %`}>
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[11px] text-ink tabular-nums">{pct} %</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 ml-auto">
                      <IconButton label={`Monter le niveau ${level.label}`} disabled={i === 0} onClick={() => move(level.id, -1)}>
                        <ArrowUp size={14} aria-hidden="true" />
                      </IconButton>
                      <IconButton label={`Descendre le niveau ${level.label}`} disabled={i === levelList.length - 1} onClick={() => move(level.id, 1)}>
                        <ArrowDown size={14} aria-hidden="true" />
                      </IconButton>
                      <ActionMenu
                        label={`Actions pour le niveau ${level.label}`}
                        items={[
                          { id: 'edit', label: 'Modifier', icon: Pencil, onSelect: () => setDialog({ type: 'edit', level }) },
                          { id: 'delete', label: 'Supprimer', icon: Trash2, danger: true, onSelect: () => handleDelete(level) },
                        ]}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {dialog?.type === 'edit' && <LevelDialog level={dialog.level} onClose={() => setDialog(null)} />}
      {dialog?.type === 'blocked' && (
        <BlockedDialog title={dialog.title} message={dialog.message} items={dialog.items} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}
