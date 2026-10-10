import { useEffect, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  Download, Plus, MoreVertical, Pencil, Trash2, X, Check, ArrowLeft, ArrowRight,
} from 'lucide-react';
import MemberCard from './MemberCard';
import DeleteColumnDialog from './members/DeleteColumnDialog';
import { useStore } from '../store';
import { toast } from './ui/toastStore';
import { columnWhatsAppText, safeFileName } from './members/memberHelpers';

function downloadText(content, filename) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Révocation différée : certains navigateurs lisent l'URL après le clic.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Menu « ⋮ » d'une colonne : accessible au clavier (flèches, Échap, Tab). */
function ColumnMenu({ title, canMoveLeft, canMoveRight, onRename, onMoveLeft, onMoveRight, onDelete }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  // Focus sur le premier élément à l'ouverture.
  useEffect(() => {
    if (open) menuRef.current?.querySelector('[role="menuitem"]:not([disabled])')?.focus();
  }, [open]);

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  };

  const choose = (fn) => { setOpen(false); fn(); };
  // Déplacement : le focus revient sur le bouton « ⋮ » (la colonne a bougé).
  const chooseKeepFocus = (fn) => { setOpen(false); fn(); requestAnimationFrame(() => buttonRef.current?.focus()); };

  const onMenuKeyDown = (e) => {
    const items = [...(menuRef.current?.querySelectorAll('[role="menuitem"]:not([disabled])') || [])];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); items.at(-1)?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  };

  const itemCls = 'w-full text-left px-3 py-2 text-sm flex items-center gap-2 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions de la colonne ${title}`}
        className="tap text-dim hover:text-ink transition-colors p-1.5 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
      >
        <MoreVertical size={15} aria-hidden="true" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => close(false)} aria-hidden="true" />
          <div
            ref={menuRef}
            role="menu"
            aria-label={`Actions de la colonne ${title}`}
            onKeyDown={onMenuKeyDown}
            className="absolute right-0 top-full mt-1 bg-surface border border-line rounded-lg shadow-xl z-20 min-w-[190px] overflow-hidden py-1"
          >
            <button role="menuitem" type="button" onClick={() => choose(onRename)} className={`${itemCls} text-ink hover:bg-elevated focus:bg-elevated`}>
              <Pencil size={14} aria-hidden="true" /> Renommer
            </button>
            <button role="menuitem" type="button" onClick={() => chooseKeepFocus(onMoveLeft)} disabled={!canMoveLeft} className={`${itemCls} text-ink hover:bg-elevated focus:bg-elevated`}>
              <ArrowLeft size={14} aria-hidden="true" /> Déplacer à gauche
            </button>
            <button role="menuitem" type="button" onClick={() => chooseKeepFocus(onMoveRight)} disabled={!canMoveRight} className={`${itemCls} text-ink hover:bg-elevated focus:bg-elevated`}>
              <ArrowRight size={14} aria-hidden="true" /> Déplacer à droite
            </button>
            <div className="my-1 border-t border-line" role="separator" />
            <button role="menuitem" type="button" onClick={() => choose(onDelete)} className={`${itemCls} text-red-500 hover:bg-red-500/10 focus:bg-red-500/10`}>
              <Trash2 size={14} aria-hidden="true" /> Supprimer…
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function KanbanColumn({ column, members, onAddMember, onEditMember }) {
  const { isOver, setNodeRef } = useDroppable({ id: column.id });
  const updateColumn = useStore(s => s.updateColumn);
  const deleteColumn = useStore(s => s.deleteColumn);
  const moveColumn = useStore(s => s.moveColumn);
  const roles = useStore(s => s.roles);
  const columns = useStore(s => s.columns);
  // Nombre RÉEL de membres de la colonne (la prop `members` est filtrée).
  const totalInColumn = useStore(s => s.members.reduce((n, m) => n + (m.columnId === column.id ? 1 : 0), 0));

  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(column.title);
  const [showDelete, setShowDelete] = useState(false);
  const titleInputId = `col-title-${column.id}`;

  const index = columns.findIndex(c => c.id === column.id);
  const filtered = members.length !== totalInColumn;

  const exportToWhatsApp = () => {
    if (members.length === 0) {
      toast.info('Rien à exporter', `La colonne « ${column.title} » n'affiche aucun membre.`);
      return;
    }
    downloadText(
      columnWhatsAppText(column, members, roles),
      `Export_${safeFileName(column.title, 'colonne')}.txt`
    );
    toast.success('Export téléchargé', filtered ? `${column.title} (liste filtrée)` : column.title);
  };

  const startEditing = () => { setTitle(column.title); setIsEditing(true); };
  const cancelEditing = () => { setIsEditing(false); setTitle(column.title); };

  const handleRename = () => {
    const t = title.trim();
    if (t && t !== column.title) {
      updateColumn(column.id, t);
      toast.success('Colonne renommée', t);
    }
    setIsEditing(false);
  };

  const handleConfirmDelete = (options) => {
    const target = options.moveMembersTo ? columns.find(c => c.id === options.moveMembersTo) : null;
    deleteColumn(column.id, options);
    setShowDelete(false);
    toast.success(
      'Colonne supprimée',
      totalInColumn === 0
        ? `${column.title} — Ctrl+Z pour annuler`
        : target
          ? `${totalInColumn} membre${totalInColumn > 1 ? 's' : ''} déplacé${totalInColumn > 1 ? 's' : ''} vers ${target.title}`
          : `${totalInColumn} membre${totalInColumn > 1 ? 's' : ''} supprimé${totalInColumn > 1 ? 's' : ''} — Ctrl+Z pour annuler`
    );
  };

  return (
    // Largeur : ~une colonne par écran sur mobile (défilement « snap » géré
    // par KanbanBoard). Hauteur : naturelle sur mobile (la page défile),
    // bornée au viewport à partir de md avec un minimum (le header peut
    // passer sur 2 lignes sans écraser la colonne).
    <section
      aria-label={`Colonne ${column.title}`}
      className="flex flex-col w-[85vw] max-w-80 sm:w-80 shrink-0 snap-start min-h-[14rem] md:h-[calc(100dvh-15rem)] md:min-h-[22rem]"
    >
      <div className={`flex flex-col h-full min-h-0 bg-surface/50 rounded-2xl border transition-all ${
        isOver ? 'border-blue-500 border-2 shadow-lg bg-blue-500/5' : 'border-line'
      }`}>

        {/* Header */}
        <div className="p-3 sm:p-4 flex justify-between items-center gap-2 border-b border-line relative shrink-0">
          {isEditing ? (
            <form className="flex gap-1 flex-1 min-w-0" onSubmit={(e) => { e.preventDefault(); handleRename(); }}>
              <label htmlFor={titleInputId} className="sr-only">Nouveau nom de la colonne</label>
              <input
                id={titleInputId}
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); cancelEditing(); } }}
                maxLength={60}
                className="flex-1 min-w-0 bg-elevated border border-line rounded px-2 py-1 text-sm text-ink focus:outline-none focus:border-blue-500"
              />
              <button type="submit" aria-label="Valider le nouveau nom" className="text-emerald-500 p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60">
                <Check size={16} aria-hidden="true" />
              </button>
              <button type="button" onClick={cancelEditing} aria-label="Annuler le renommage" className="text-red-500 p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60">
                <X size={16} aria-hidden="true" />
              </button>
            </form>
          ) : (
            <>
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="font-bold text-ink truncate" title={column.title}>{column.title}</h2>
                <span
                  className="text-xs text-dim bg-elevated px-2 py-0.5 rounded-full shrink-0"
                  title={filtered ? `${members.length} affiché(s) sur ${totalInColumn}` : `${totalInColumn} membre(s)`}
                >
                  {filtered ? `${members.length}/${totalInColumn}` : totalInColumn}
                </span>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button type="button" onClick={exportToWhatsApp}
                  aria-label={`Exporter la colonne ${column.title} pour WhatsApp`}
                  title="Exporter pour WhatsApp"
                  className="tap text-dim hover:text-emerald-500 transition-colors p-1.5 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60">
                  <Download size={15} aria-hidden="true" />
                </button>
                <ColumnMenu
                  title={column.title}
                  canMoveLeft={index > 0}
                  canMoveRight={index !== -1 && index < columns.length - 1}
                  onRename={startEditing}
                  onMoveLeft={() => moveColumn(column.id, -1)}
                  onMoveRight={() => moveColumn(column.id, 1)}
                  onDelete={() => setShowDelete(true)}
                />
              </div>
            </>
          )}
        </div>

        {/* Zone de drop — occupe tout l'espace restant */}
        <div
          ref={setNodeRef}
          className={`flex-1 min-h-[8rem] md:overflow-y-auto p-3 flex flex-col gap-2.5 transition-colors rounded-b-2xl ${
            isOver ? 'bg-blue-500/10' : ''
          }`}
        >
          {members.length === 0 && !isOver && (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8 text-dim/60">
              <div className="text-3xl mb-1" aria-hidden="true">📭</div>
              <p className="text-xs">{filtered ? 'Aucun membre ne correspond aux filtres' : 'Glisse une carte ici'}</p>
            </div>
          )}

          {members.length === 0 && isOver && (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8 text-blue-500 animate-pulse">
              <div className="text-3xl mb-1" aria-hidden="true">📥</div>
              <p className="text-xs font-semibold">Déposer ici</p>
            </div>
          )}

          {members.map(member => (
            <MemberCard key={member.id} member={member} onEdit={onEditMember} />
          ))}

          <button type="button" onClick={() => onAddMember(column.id)}
            aria-label={`Ajouter un membre dans ${column.title}`}
            className="w-full border-2 border-dashed border-line hover:border-blue-500/50 hover:bg-blue-500/5 rounded-xl py-3 text-dim hover:text-blue-500 text-sm font-medium transition-all flex items-center justify-center gap-2 mt-1 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60">
            <Plus size={16} aria-hidden="true" /> Ajouter
          </button>
        </div>
      </div>

      {showDelete && (
        <DeleteColumnDialog
          column={column}
          memberCount={totalInColumn}
          otherColumns={columns.filter(c => c.id !== column.id)}
          onCancel={() => setShowDelete(false)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </section>
  );
}
