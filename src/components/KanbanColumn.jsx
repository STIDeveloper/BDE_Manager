import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import MemberCard from './MemberCard';
import { Download, Plus, MoreVertical, Pencil, Trash2, X, Check } from 'lucide-react';
import { useStore } from '../store';
import { toast } from './ui/toastStore';

export default function KanbanColumn({ column, members, onAddMember, onEditMember }) {
  const { isOver, setNodeRef } = useDroppable({ id: column.id });
  const { updateColumn, deleteColumn } = useStore();
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(column.title);
  const [showMenu, setShowMenu] = useState(false);

  const exportToWhatsApp = () => {
    const text = members.map(m =>
      `*${m.firstName} ${m.lastName}* - ${m.mainRole} (Badges: ${m.badges.join(', ')})`
    ).join('\n');
    const content = `📋 ${column.title}\n\n${text}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Export_${column.title.replace(/\s+/g, '_')}.txt`;
    a.click();
    toast.success('Export téléchargé', column.title);
  };

  const handleRename = () => {
    if (title.trim()) updateColumn(column.id, title.trim());
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (window.confirm(`Supprimer la colonne "${column.title}" ? Les membres associés seront également supprimés.`)) {
      deleteColumn(column.id);
      toast.info('Colonne supprimée', column.title);
    }
  };

  return (
    <div className="flex flex-col w-80 shrink-0 h-[calc(100vh-220px)]">
      <div className={`flex flex-col h-full bg-surface/50 rounded-2xl border transition-all ${
        isOver ? 'border-blue-500 border-2 shadow-lg bg-blue-500/5' : 'border-line'
      }`}>

        {/* Header */}
        <div className="p-4 flex justify-between items-center border-b border-line relative">
          {isEditing ? (
            <div className="flex gap-1 flex-1">
              <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                className="flex-1 bg-elevated border border-line rounded px-2 py-1 text-sm text-ink focus:outline-none focus:border-blue-500" />
              <button onClick={handleRename} className="text-emerald-500 p-1"><Check size={16} /></button>
              <button onClick={() => { setIsEditing(false); setTitle(column.title); }} className="text-red-500 p-1"><X size={16} /></button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="font-bold text-ink truncate">{column.title}</h2>
                <span className="text-xs text-dim bg-elevated px-2 py-0.5 rounded-full shrink-0">{members.length}</span>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={exportToWhatsApp}
                  className="text-dim hover:text-emerald-500 transition-colors p-1" title="Exporter pour WhatsApp">
                  <Download size={15} />
                </button>
                <div className="relative">
                  <button onClick={() => setShowMenu(!showMenu)} className="text-dim hover:text-ink transition-colors p-1">
                    <MoreVertical size={15} />
                  </button>
                  {showMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                      <div className="absolute right-0 top-full mt-1 bg-surface border border-line rounded-lg shadow-xl z-20 min-w-[140px] overflow-hidden">
                        <button onClick={() => { setIsEditing(true); setShowMenu(false); }}
                          className="w-full text-left px-3 py-2 text-sm text-ink hover:bg-elevated flex items-center gap-2">
                          <Pencil size={14} /> Renommer
                        </button>
                        <button onClick={() => { handleDelete(); setShowMenu(false); }}
                          className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 flex items-center gap-2">
                          <Trash2 size={14} /> Supprimer
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Zone de drop — occupe TOUT l'espace restant */}
        <div
          ref={setNodeRef}
          className={`flex-1 overflow-y-auto p-3 flex flex-col gap-2.5 transition-colors rounded-b-2xl ${
            isOver ? 'bg-blue-500/10' : ''
          }`}
        >
          {members.length === 0 && !isOver && (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8 text-dim/60">
              <div className="text-3xl mb-1">📭</div>
              <p className="text-xs">Glisse une carte ici</p>
            </div>
          )}

          {members.length === 0 && isOver && (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8 text-blue-500 animate-pulse">
              <div className="text-3xl mb-1">📥</div>
              <p className="text-xs font-semibold">Déposer ici</p>
            </div>
          )}

          {members.map(member => (
            <MemberCard key={member.id} member={member} onEdit={onEditMember} />
          ))}

          {/* Bouton ajouter */}
          <button onClick={() => onAddMember(column.id)}
            className="w-full border-2 border-dashed border-line hover:border-blue-500/50 hover:bg-blue-500/5 rounded-xl py-3 text-dim hover:text-blue-500 text-sm font-medium transition-all flex items-center justify-center gap-2 mt-1">
            <Plus size={16} /> Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}
