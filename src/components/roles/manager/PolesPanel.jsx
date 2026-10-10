// Colonne « Pôles » : filtre, ordre (↑/↓ + glisser-déposer), actions.
import { ArrowDown, ArrowUp, GripVertical, Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../../../store.js';
import { plural } from './helpers.js';
import { useDragReorder } from './hooks.js';
import { FOCUS_RING } from './constants.js';
import ActionMenu from './ActionMenu.jsx';
import { ColumnHeader, EmptyState, IconButton, PoleDot } from './ui.jsx';

/**
 * @param {{
 *   poleList:object[], summaries:Record<string,{roleCount:number,capacity:number}>, totals:{roles:number,capacity:number},
 *   selected:string, onSelect:(id:string)=>void, onCreate:()=>void, onEdit:(pole:object)=>void, onDelete:(pole:object)=>void,
 * }} props
 */
export default function PolesPanel({ poleList, summaries, totals, selected, onSelect, onCreate, onEdit, onDelete }) {
  const ids = poleList.map(p => p.id);
  const { getItemProps, draggingId, dropIndicator } = useDragReorder(ids, (next) => useStore.getState().reorderPoles(next));
  const move = (id, dir) => useStore.getState().movePole(id, dir);

  const itemCls = (active) => `w-full flex items-center gap-2.5 text-left px-2.5 py-2 min-h-[48px] rounded-lg ${FOCUS_RING} ${
    active ? 'bg-blue-500/10 text-ink' : 'hover:bg-elevated text-ink'
  }`;

  return (
    <div className="card flex flex-col min-h-0 h-full">
      <ColumnHeader title="Pôles" count={poleList.length}>
        <button type="button" onClick={onCreate} className="btn-primary !px-2.5 !py-1.5 text-xs min-h-[36px]">
          <Plus size={14} aria-hidden="true" /> Nouveau pôle
        </button>
      </ColumnHeader>

      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        <button
          type="button"
          onClick={() => onSelect('all')}
          aria-pressed={selected === 'all'}
          className={`${itemCls(selected === 'all')} mb-1`}
        >
          <span className="w-7 text-center text-lg" aria-hidden="true">🗂️</span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium truncate">Tous les pôles</span>
            <span className="block text-[11px] text-dim">{plural(totals.roles, 'rôle', 'rôles')} · {plural(totals.capacity, 'place', 'places')}</span>
          </span>
        </button>

        {poleList.length === 0 ? (
          <EmptyState icon={Layers} title="Aucun pôle">Crée un premier pôle pour y ranger des rôles.</EmptyState>
        ) : (
          <ul className="space-y-1" aria-label="Liste des pôles">
            {poleList.map((pole, i) => {
              const s = summaries[pole.id] || { roleCount: 0, capacity: 0 };
              const isActive = selected === pole.id;
              const indicator = dropIndicator(pole.id);
              return (
                <li
                  key={pole.id}
                  {...getItemProps(pole.id)}
                  className={`relative rounded-lg border ${isActive ? 'border-blue-500/40' : 'border-transparent'} ${draggingId === pole.id ? 'opacity-40' : ''}`}
                >
                  {indicator && (
                    <span aria-hidden="true" className={`absolute left-2 right-2 h-0.5 bg-blue-500 rounded ${indicator === 'before' ? '-top-[3px]' : '-bottom-[3px]'}`} />
                  )}
                  <div className="flex items-center gap-0.5 pr-1">
                    <span className="hidden md:flex items-center pl-1 text-dim cursor-grab" title="Glisser pour réordonner" aria-hidden="true">
                      <GripVertical size={14} />
                    </span>
                    <button type="button" onClick={() => onSelect(pole.id)} aria-pressed={isActive} className={`${itemCls(isActive)} flex-1 min-w-0 !w-auto`}>
                      <span className="w-7 text-center text-lg shrink-0" aria-hidden="true">{pole.emoji}</span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-1.5">
                          <PoleDot color={pole.color} size={8} />
                          <span className="text-sm font-medium truncate">{pole.label}</span>
                        </span>
                        <span className="block text-[11px] text-dim">
                          {plural(s.roleCount, 'rôle', 'rôles')} · {plural(s.capacity, 'place', 'places')}
                        </span>
                      </span>
                    </button>
                    <ActionMenu
                      label={`Actions pour le pôle ${pole.label}`}
                      items={[
                        { id: 'up', label: 'Monter', icon: ArrowUp, disabled: i === 0, onSelect: () => move(pole.id, -1) },
                        { id: 'down', label: 'Descendre', icon: ArrowDown, disabled: i === poleList.length - 1, onSelect: () => move(pole.id, 1) },
                        { id: 'edit', label: 'Modifier', icon: Pencil, onSelect: () => onEdit(pole) },
                        { id: 'delete', label: 'Supprimer', icon: Trash2, danger: true, onSelect: () => onDelete(pole) },
                      ]}
                    />
                  </div>
                  {/* Choix UX : la colonne est étroite ; les boutons d'ordre et
                      d'édition s'affichent en clair sous le pôle sélectionné
                      (et restent dans le menu « ⋯ » pour les autres). */}
                  {isActive && (
                    <div className="flex items-center gap-0.5 pl-9 pr-1 pb-1">
                      <IconButton label={`Monter le pôle ${pole.label}`} disabled={i === 0} onClick={() => move(pole.id, -1)}>
                        <ArrowUp size={14} aria-hidden="true" />
                      </IconButton>
                      <IconButton label={`Descendre le pôle ${pole.label}`} disabled={i === poleList.length - 1} onClick={() => move(pole.id, 1)}>
                        <ArrowDown size={14} aria-hidden="true" />
                      </IconButton>
                      <IconButton label={`Modifier le pôle ${pole.label}`} onClick={() => onEdit(pole)}>
                        <Pencil size={14} aria-hidden="true" />
                      </IconButton>
                      <IconButton label={`Supprimer le pôle ${pole.label}`} tone="danger" onClick={() => onDelete(pole)}>
                        <Trash2 size={14} aria-hidden="true" />
                      </IconButton>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="px-3 py-2 border-t border-line text-[11px] text-dim shrink-0">
        Ordre : sélectionne un pôle puis ↑/↓ (ou menu ⋯), ou glisse-le à la souris.
      </p>
    </div>
  );
}
