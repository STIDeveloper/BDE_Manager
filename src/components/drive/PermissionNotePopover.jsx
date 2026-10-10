import React, { useState, useEffect, useRef } from 'react';
import { StickyNote, X, Trash2, Save } from 'lucide-react';
import { useStore } from '../../store';
import { toast } from '../ui/toastStore';

export default function PermissionNotePopover({ isOpen, onClose, member, folder, anchorRect }) {
  const { permissionNotes, setPermissionNote } = useStore();
  const [note, setNote] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !member || !folder) return;
    const current = permissionNotes[member.id]?.[folder.id] || '';
    setNote(current);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [isOpen, member, folder, permissionNotes]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !member || !folder || !anchorRect) return null;

  const handleSave = () => {
    setPermissionNote(member.id, folder.id, note);
    toast.success(`Note ${note.trim() ? 'enregistrée' : 'supprimée'}`, `${member.firstName} → ${folder.code}`);
    onClose();
  };

  const handleDelete = () => {
    setPermissionNote(member.id, folder.id, '');
    toast.info('Note supprimée', `${member.firstName} → ${folder.code}`);
    onClose();
  };

  const popoverWidth = 340;
  const popoverHeight = 240;
  const margin = 8;

  let left = anchorRect.right + margin;
  let top = anchorRect.top;

  if (left + popoverWidth > window.innerWidth) left = anchorRect.left - popoverWidth - margin;
  if (top + popoverHeight > window.innerHeight) top = Math.max(margin, window.innerHeight - popoverHeight - margin);
  if (top < margin) top = margin;

  const existingNote = permissionNotes[member.id]?.[folder.id];

  return (
    <>
      <div className="fixed inset-0 z-[80]" onClick={onClose} />
      <div
        className="fixed z-[90] bg-surface border border-line rounded-2xl shadow-2xl p-4 w-[340px]"
        style={{ left, top }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="bg-amber-500/10 p-1.5 rounded-lg shrink-0">
              <StickyNote size={14} className="text-amber-500" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-ink truncate">
                {member.firstName} {member.lastName}
              </div>
              <div className="text-[10px] text-dim truncate">
                {folder.code} — {folder.name}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-dim hover:text-ink p-1 shrink-0"><X size={14} /></button>
        </div>

        <div className="text-[10px] text-dim mb-2 italic">
          Note attachée à cette permission spécifique. Utile pour tracer les exceptions, dates limites, validations...
        </div>

        <textarea ref={inputRef} value={note} onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSave(); }
          }}
          placeholder="Ex : Accès temporaire jusqu'au 15/11, à vérifier avec Jade..."
          className="w-full bg-elevated border border-line rounded-lg p-2.5 text-sm text-ink placeholder-dim focus:outline-none focus:border-amber-500 min-h-[90px] resize-none" />

        <div className="flex items-center justify-between gap-2 mt-3">
          <div className="text-[10px] text-dim">
            <kbd className="bg-elevated px-1 rounded font-mono">Ctrl+Enter</kbd> pour sauver
          </div>
          <div className="flex gap-1">
            {existingNote && (
              <button onClick={handleDelete}
                className="text-xs text-dim hover:text-red-500 p-2 rounded-lg border border-line transition-colors"
                title="Supprimer la note">
                <Trash2 size={12} />
              </button>
            )}
            <button onClick={onClose}
              className="text-xs text-dim hover:text-ink px-3 py-1.5 rounded-lg border border-line transition-colors">
              Annuler
            </button>
            <button onClick={handleSave}
              className="text-xs bg-amber-500 hover:bg-amber-600 text-white font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
              <Save size={12} /> Enregistrer
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
