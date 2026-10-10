// Colonne « Rôles » : rôles du pôle sélectionné (ou tous, groupés par pôle).
import {
  ArrowDown, ArrowLeft, ArrowUp, Copy, GripVertical, Pencil, Plus, Trash2, Users, Briefcase,
} from 'lucide-react';
import { useStore } from '../../../store.js';
import { toast } from '../../ui/toastStore';
import { plural, usageOf } from './helpers.js';
import { useDragReorder } from './hooks.js';
import { FOCUS_RING } from './constants.js';
import ActionMenu from './ActionMenu.jsx';
import {
  CapacityStepper, ColumnHeader, EmptyState, IconButton, LevelBadge, PoleDot, RoleFlags,
} from './ui.jsx';

function setCapacity(role, value) {
  const res = useStore.getState().setRoleCapacity(role.id, value);
  if (res && !res.ok) toast.error(res.error);
}

function RoleRow({ role, index, count, level, memberCount, selected, dragProps, dragging, indicator, onOpen, onDuplicate, onDelete }) {
  const move = (dir) => useStore.getState().moveRole(role.id, dir);
  return (
    <li
      {...dragProps}
      className={`relative rounded-lg border bg-surface ${selected ? 'border-blue-500/50 ring-1 ring-blue-500/30' : 'border-line'} ${dragging ? 'opacity-40' : ''}`}
    >
      {indicator && (
        <span aria-hidden="true" className={`absolute left-2 right-2 h-0.5 bg-blue-500 rounded ${indicator === 'before' ? '-top-[4px]' : '-bottom-[4px]'}`} />
      )}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1 p-1.5">
        <span className="hidden md:flex items-center text-dim cursor-grab" title="Glisser pour réordonner" aria-hidden="true">
          <GripVertical size={14} />
        </span>
        <button
          type="button"
          onClick={() => onOpen(role.id)}
          aria-current={selected ? 'true' : undefined}
          className={`flex-1 min-w-[10rem] text-left px-1.5 py-1 min-h-[40px] rounded-md hover:bg-elevated ${FOCUS_RING}`}
        >
          <span className="block text-sm font-medium text-ink truncate">{role.label}</span>
          <span className="flex flex-wrap items-center gap-1.5 mt-0.5">
            <LevelBadge level={level} />
            <RoleFlags role={role} size={12} />
            <span className="inline-flex items-center gap-1 text-[11px] text-dim" title="Membres qui occupent ce rôle">
              <Users size={11} aria-hidden="true" />
              {plural(memberCount, 'membre', 'membres')}
            </span>
          </span>
        </button>
        <div className="flex items-center gap-0.5 ml-auto">
          <CapacityStepper value={role.capacity} roleLabel={role.label} onChange={(v) => setCapacity(role, v)} />
          <IconButton label={`Monter ${role.label}`} disabled={index === 0} onClick={() => move(-1)}>
            <ArrowUp size={14} aria-hidden="true" />
          </IconButton>
          <IconButton label={`Descendre ${role.label}`} disabled={index === count - 1} onClick={() => move(1)}>
            <ArrowDown size={14} aria-hidden="true" />
          </IconButton>
          <ActionMenu
            label={`Actions pour ${role.label}`}
            items={[
              { id: 'edit', label: 'Modifier', icon: Pencil, onSelect: () => onOpen(role.id) },
              { id: 'dup', label: 'Dupliquer', icon: Copy, onSelect: () => onDuplicate(role) },
              { id: 'delete', label: 'Supprimer…', icon: Trash2, danger: true, onSelect: () => onDelete(role) },
            ]}
          />
        </div>
      </div>
    </li>
  );
}

/** Liste réordonnable des rôles d'UN pôle (le glisser-déposer reste interne au pôle). */
function RoleGroup({ roles, levels, usage, selectedRoleId, onOpen, onDuplicate, onDelete, label }) {
  const ids = roles.map(r => r.id);
  const { getItemProps, draggingId, dropIndicator } = useDragReorder(ids, (next) => useStore.getState().reorderRoles(next));
  return (
    <ul className="space-y-1.5" aria-label={label}>
      {roles.map((role, i) => (
        <RoleRow
          key={role.id}
          role={role}
          index={i}
          count={roles.length}
          level={levels[role.level]}
          memberCount={usageOf.members(usage, role.id).length}
          selected={selectedRoleId === role.id}
          dragProps={getItemProps(role.id)}
          dragging={draggingId === role.id}
          indicator={dropIndicator(role.id)}
          onOpen={onOpen}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}

/**
 * @param {{
 *   poleFilter:string, catalog:object, usage:object, selectedRoleId:string|null,
 *   onOpenRole:(id:string)=>void, onCreate:(poleId:string|null)=>void,
 *   onDuplicate:(role:object)=>void, onDelete:(role:object)=>void, onBack?:()=>void,
 * }} props
 */
export default function RolesPanel({ poleFilter, catalog, usage, selectedRoleId, onOpenRole, onCreate, onDuplicate, onDelete, onBack }) {
  const { poles, levels, poleList, rolesByPole } = catalog;
  const pole = poleFilter !== 'all' ? poles[poleFilter] : null;
  const groups = pole ? [pole] : poleList;
  const roleCount = pole ? (rolesByPole[pole.id] || []).length : catalog.roleList.length;
  const shared = { levels, usage, selectedRoleId, onOpen: onOpenRole, onDuplicate, onDelete };

  return (
    <div className="card flex flex-col min-h-0 h-full">
      <ColumnHeader
        title={pole ? `${pole.emoji} ${pole.label}` : 'Tous les rôles'}
        count={roleCount}
        before={onBack && (
          <IconButton label="Retour aux pôles" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" /></IconButton>
        )}
      >
        <button type="button" onClick={() => onCreate(pole?.id || null)} className="btn-primary !px-2.5 !py-1.5 text-xs min-h-[36px]">
          <Plus size={14} aria-hidden="true" /> Nouveau rôle
        </button>
      </ColumnHeader>

      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-4">
        {groups.length === 0 && (
          <EmptyState icon={Briefcase} title="Aucun pôle">Crée d'abord un pôle, puis ajoute-lui des rôles.</EmptyState>
        )}
        {groups.map(g => {
          const roles = rolesByPole[g.id] || [];
          return (
            <section key={g.id} aria-label={pole ? undefined : `Pôle ${g.label}`}>
              {!pole && (
                <h4 className="flex items-center gap-1.5 px-1 mb-1.5 text-xs font-semibold text-dim uppercase tracking-wide">
                  <PoleDot color={g.color} size={8} />
                  <span aria-hidden="true">{g.emoji}</span> {g.label}
                  <span className="font-normal normal-case">· {plural(roles.length, 'rôle', 'rôles')}</span>
                </h4>
              )}
              {roles.length === 0 ? (
                <div className="border border-dashed border-line rounded-lg p-4 text-center">
                  <p className="text-sm text-dim">Aucun rôle dans ce pôle pour l'instant.</p>
                  <button type="button" onClick={() => onCreate(g.id)} className="btn-secondary text-xs mt-2 min-h-[36px]">
                    <Plus size={13} aria-hidden="true" /> Ajouter un rôle ici
                  </button>
                </div>
              ) : (
                <RoleGroup roles={roles} label={`Rôles du pôle ${g.label}`} {...shared} />
              )}
            </section>
          );
        })}
      </div>
      <p className="px-3 py-2 border-t border-line text-[11px] text-dim shrink-0">
        Les −/+ règlent la capacité (nombre de places). Ordre dans le pôle : ↑/↓ ou glisser-déposer à la souris.
      </p>
    </div>
  );
}
