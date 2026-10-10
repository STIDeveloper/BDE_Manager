import { useDraggable } from '@dnd-kit/core';
import { Pencil, Trash2, StickyNote, GripVertical } from 'lucide-react';
import { useStore } from '../store';
import { memberRoleLabel } from '../core/useCatalog';
import { poleColorHex } from '../core/catalog';
import { confirmDialog } from './ui/confirmStore';
import { toast } from './ui/toastStore';
import { memberDisplayName } from './members/memberHelpers';

// Couleur d'un badge selon son libellé (purement visuel).
function badgeColor(badge) {
  const lower = badge.toLowerCase();
  if (lower.includes('accès') || lower.includes('acces')) return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
  if (lower.includes('respo')) return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
  if (lower.includes('membre com')) return 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20';
  if (lower.includes('membre event')) return 'bg-pink-500/10 text-pink-500 border-pink-500/20';
  if (lower.includes('membre projet')) return 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20';
  if (lower.includes('ancien')) return 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20';
  if (['créateur', 'createur', 'monteur', 'graphiste', 'dj'].some(k => lower.includes(k))) {
    return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
  }
  return 'bg-elevated text-dim border-line';
}

// Les boutons internes ne doivent ni démarrer un glisser (souris/tactile)
// ni être interprétés par le KeyboardSensor (Entrée/Espace sur la carte).
const stopDrag = {
  onPointerDown: (e) => e.stopPropagation(),
  onTouchStart: (e) => e.stopPropagation(),
  // Seulement Entrée/Espace (touches d'activation du KeyboardSensor) : les
  // autres raccourcis (Ctrl+Z…) doivent continuer à remonter.
  onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); },
};

export default function MemberCard({ member, onEdit }) {
  const deleteMember = useStore(s => s.deleteMember);
  const roles = useStore(s => s.roles);
  const poles = useStore(s => s.poles);
  const name = memberDisplayName(member);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: member.id,
    attributes: { roleDescription: 'carte membre déplaçable' },
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: 999,
  } : undefined;

  // Rôle : libellé du catalogue, ou texte libre hors catalogue.
  const role = member.mainRole ? roles[member.mainRole] : null;
  const roleLabel = member.mainRole ? memberRoleLabel(member, roles) : '';
  const offCatalog = !!member.mainRole && !role;
  const poleColor = role ? poleColorHex(poles[role.pole]?.color) : null;
  const poleLabel = role ? (poles[role.pole]?.label || '') : '';
  const showLegacyHint = !member.mainRole && !!member.legacyMainRole;

  const handleDelete = async (e) => {
    e.stopPropagation();
    const ok = await confirmDialog({
      title: `Supprimer ${name} ?`,
      message: `${name} sera retiré(e) du BDE.`,
      details: [
        'Ses permissions Drive et les notes associées sont supprimées aussi.',
        'Tu peux annuler avec Ctrl+Z (ou le bouton « Annuler » en haut).',
      ],
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    deleteMember(member.id);
    toast.success('Membre supprimé', `${name} — Ctrl+Z pour annuler`);
  };

  const handleEdit = (e) => { e.stopPropagation(); onEdit(member); };

  const describe = [name, roleLabel && `rôle ${roleLabel}`].filter(Boolean).join(', ');

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      aria-label={describe}
      className={`
        group relative bg-surface border border-line rounded-xl touch-manipulation
        cursor-grab active:cursor-grabbing transition-shadow
        focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-base
        ${isDragging
          ? 'shadow-2xl ring-2 ring-blue-500/40 rotate-1 scale-[1.02] opacity-95'
          : 'shadow-sm hover:shadow-md hover:border-dim'
        }
      `}
    >
      {/* Poignée visuelle de drag */}
      <div aria-hidden="true" className="absolute top-1/2 -left-0.5 -translate-y-1/2 opacity-0 group-hover:opacity-40 group-focus-visible:opacity-60 [@media(hover:none)]:opacity-40 transition-opacity">
        <GripVertical size={12} className="text-dim" />
      </div>

      {/* Actions : au survol, au focus clavier, et toujours visibles sur écran tactile */}
      <div className="absolute top-2 right-2 flex gap-1 z-10 transition-opacity opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
        <button
          type="button"
          {...stopDrag}
          onClick={handleEdit}
          aria-label={`Modifier ${name}`}
          title="Modifier"
          className="tap bg-elevated hover:bg-blue-600 text-dim hover:text-white p-1.5 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <Pencil size={12} aria-hidden="true" />
        </button>
        <button
          type="button"
          {...stopDrag}
          onClick={handleDelete}
          aria-label={`Supprimer ${name}`}
          title="Supprimer"
          className="tap bg-elevated hover:bg-red-600 text-dim hover:text-white p-1.5 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
          <Trash2 size={12} aria-hidden="true" />
        </button>
      </div>

      {/* Bloc identité */}
      <div className="p-4 pb-2 pr-16">
        <h3 className="font-black text-lg text-ink leading-tight tracking-tight break-words">
          {member.firstName}
        </h3>
        {member.lastName && (
          <p className="text-xs text-dim mt-0.5">{member.lastName}</p>
        )}
      </div>

      {/* Rôle principal */}
      {roleLabel && (
        <div className="px-4 pb-2">
          {offCatalog ? (
            <div
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-dashed border-amber-500/40 px-2.5 py-1 rounded-md"
              title="Rôle hors catalogue : modifie le membre pour choisir un rôle du catalogue"
            >
              {roleLabel}
              <span className="font-normal opacity-80">(hors catalogue)</span>
            </div>
          ) : (
            <div
              className="inline-flex items-center gap-1.5 text-xs font-bold text-ink bg-elevated border border-line px-2.5 py-1 rounded-md"
              title={[poleLabel && `Pôle : ${poleLabel}`, member.legacyMainRole && member.legacyMainRole !== roleLabel && `Ancien libellé : ${member.legacyMainRole}`].filter(Boolean).join('\n') || undefined}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: poleColor }} aria-hidden="true" />
              {roleLabel}
            </div>
          )}
        </div>
      )}
      {showLegacyHint && (
        <p className="px-4 pb-2 text-[11px] text-dim italic" title="Rôle d'avant la migration, absent du catalogue actuel">
          ancien : {member.legacyMainRole}
        </p>
      )}

      {/* Badges */}
      {member.badges && member.badges.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1">
          {member.badges.map((badge, i) => (
            <span key={`${badge}-${i}`}
              className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${badgeColor(badge)}`}>
              {badge}
            </span>
          ))}
        </div>
      )}

      {/* Notes */}
      {member.notes && member.notes.trim() && (
        <div className="mx-4 mb-3 pt-2 border-t border-line flex items-start gap-1.5 text-xs text-dim">
          <StickyNote size={11} className="shrink-0 mt-0.5 text-amber-500" aria-hidden="true" />
          <span className="line-clamp-2 italic">{member.notes}</span>
        </div>
      )}
    </div>
  );
}
