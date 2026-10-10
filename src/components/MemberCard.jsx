import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Pencil, Trash2, StickyNote, GripVertical } from 'lucide-react';
import { useStore } from '../store';

export default function MemberCard({ member, onEdit }) {
  const { deleteMember } = useStore();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: member.id });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: 999,
  } : undefined;

  const handleDelete = (e) => {
    e.stopPropagation();
    if (window.confirm(`Supprimer ${member.firstName} ${member.lastName} ?`)) deleteMember(member.id);
  };

  const handleEdit = (e) => { e.stopPropagation(); onEdit(member); };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`
        group relative bg-surface border border-line rounded-xl
        cursor-grab active:cursor-grabbing transition-shadow
        ${isDragging
          ? 'shadow-2xl ring-2 ring-blue-500/40 rotate-1 scale-[1.02] opacity-95'
          : 'shadow-sm hover:shadow-md hover:border-dim'
        }
      `}
    >
      {/* Poignée visuelle de drag */}
      <div className="absolute top-1/2 -left-0.5 -translate-y-1/2 opacity-0 group-hover:opacity-40 transition-opacity">
        <GripVertical size={12} className="text-dim" />
      </div>

      {/* Actions au survol */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-10">
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handleEdit}
          className="bg-elevated hover:bg-blue-600 text-dim hover:text-white p-1.5 rounded-md transition-colors"
          title="Modifier">
          <Pencil size={12} />
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handleDelete}
          className="bg-elevated hover:bg-red-600 text-dim hover:text-white p-1.5 rounded-md transition-colors"
          title="Supprimer">
          <Trash2 size={12} />
        </button>
      </div>

      {/* Bloc identité */}
      <div className="p-4 pb-2 pr-16">
        <h3 className="font-black text-lg text-ink leading-tight tracking-tight">
          {member.firstName}
        </h3>
        {member.lastName && (
          <p className="text-xs text-dim mt-0.5">{member.lastName}</p>
        )}
      </div>

      {/* Rôle principal */}
      {member.mainRole && (
        <div className="px-4 pb-2">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-md">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {member.mainRole}
          </div>
        </div>
      )}

      {/* Badges */}
      {member.badges && member.badges.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1">
          {member.badges.map((badge, i) => {
            // Détecte le type de badge pour la couleur
            const lower = badge.toLowerCase();
            let colorCls = 'bg-elevated text-dim border-line';
            if (lower.includes('accès') || lower.includes('acces')) {
              colorCls = 'bg-blue-500/10 text-blue-500 border-blue-500/20';
            } else if (lower.includes('respo')) {
              colorCls = 'bg-purple-500/10 text-purple-500 border-purple-500/20';
            } else if (lower.includes('membre com')) {
              colorCls = 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20';
            } else if (lower.includes('membre event')) {
              colorCls = 'bg-pink-500/10 text-pink-500 border-pink-500/20';
            } else if (lower.includes('membre projet')) {
              colorCls = 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20';
            } else if (lower.includes('ancien')) {
              colorCls = 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20';
            } else if (lower.includes('créateur') || lower.includes('createur') || lower.includes('monteur') || lower.includes('graphiste') || lower.includes('dj')) {
              colorCls = 'bg-amber-500/10 text-amber-500 border-amber-500/20';
            }
            return (
              <span key={i}
                className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${colorCls}`}>
                {badge}
              </span>
            );
          })}
        </div>
      )}

      {/* Notes */}
      {member.notes && member.notes.trim() && (
        <div className="mx-4 mb-3 pt-2 border-t border-line flex items-start gap-1.5 text-xs text-dim">
          <StickyNote size={11} className="shrink-0 mt-0.5 text-amber-500" />
          <span className="line-clamp-2 italic">{member.notes}</span>
        </div>
      )}
    </div>
  );
}