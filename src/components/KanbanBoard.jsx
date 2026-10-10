import { useMemo, useState } from 'react';
import {
  DndContext, closestCorners, PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors,
} from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { useStore } from '../store';
import { memberRoleLabel } from '../core/useCatalog';
import { memberMatchesFilters } from './members/memberHelpers';
import KanbanColumn from './KanbanColumn';
import MemberFormModal from './MemberFormModal';
import FilterBar from './FilterBar';
import { toast } from './ui/toastStore';

const EMPTY_FILTERS = { search: '', role: '', badge: '', columnId: '' };

/** Onglet « Membres » : filtres + tableau Kanban + formulaire membre. */
export default function KanbanBoard() {
  const columns = useStore(s => s.columns);
  const members = useStore(s => s.members);
  const roles = useStore(s => s.roles);
  const moveMember = useStore(s => s.moveMember);
  const addColumn = useStore(s => s.addColumn);

  const [memberModal, setMemberModal] = useState({ open: false, member: null, columnId: null });
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  // Souris : glisser après 5 px (un clic reste un clic) ; tactile : appui
  // long de 200 ms (le défilement horizontal du tableau reste possible) ;
  // clavier : Espace pour saisir, flèches pour déplacer, Espace pour déposer.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const filteredMembers = useMemo(
    () => members.filter(m => memberMatchesFilters(m, filters, roles)),
    [members, filters, roles]
  );

  const membersByColumn = useMemo(() => {
    const map = {};
    filteredMembers.forEach(m => { (map[m.columnId] ||= []).push(m); });
    return map;
  }, [filteredMembers]);

  const handleDragEnd = ({ active, over }) => {
    if (!over) return;
    if (columns.some(col => col.id === over.id)) moveMember(active.id, over.id);
  };

  const handleAddColumn = () => {
    const title = newColumnTitle.trim();
    if (!title) return;
    addColumn(title);
    setNewColumnTitle('');
    setShowAddColumn(false);
    toast.success('Colonne créée', title);
  };

  const exportGlobal = () => {
    if (members.length === 0) {
      toast.warn('Aucun membre dans le BDE', 'Ajoute des membres avant d\'exporter.');
      return;
    }
    if (filteredMembers.length === 0) {
      toast.warn('Aucun membre à exporter', 'Les filtres actifs ne retournent aucun résultat.');
      return;
    }

    const grouped = new Map();
    columns.forEach(c => grouped.set(c.title, []));
    filteredMembers.forEach(m => {
      const title = columns.find(c => c.id === m.columnId)?.title || 'Sans colonne';
      if (!grouped.has(title)) grouped.set(title, []);
      grouped.get(title).push(m);
    });

    const hasFilters = filters.search || filters.role || filters.badge || filters.columnId;
    let content = `📋 Liste des membres du BDE\n`;
    content += `👥 Total : ${filteredMembers.length} membre${filteredMembers.length > 1 ? 's' : ''}\n`;
    if (hasFilters) content += `🔎 Liste filtrée\n`;
    content += `📅 Export du ${new Date().toLocaleDateString('fr-FR')}\n`;

    grouped.forEach((list, title) => {
      if (list.length === 0) return;
      content += `\n*=== ${title} (${list.length}) ===*\n`;
      list.forEach(m => {
        const role = memberRoleLabel(m, roles);
        content += `• *${m.firstName}${m.lastName ? ' ' + m.lastName : ''}*`;
        if (role) content += ` — ${role}`;
        if (m.badges?.length) content += `\n   🏷️ ${m.badges.join(' • ')}`;
        content += `\n`;
      });
    });
    content += `\n_Généré par BDE Manager_`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Export_BDE_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success(
      `${filteredMembers.length} membre${filteredMembers.length > 1 ? 's' : ''} exporté${filteredMembers.length > 1 ? 's' : ''}`,
      hasFilters ? 'Filtres appliqués' : 'Liste complète'
    );
  };

  return (
    <>
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        resultCount={filteredMembers.length}
        onExportGlobal={exportGlobal}
      />

      {members.length === 0 && (
        <div className="mb-4 rounded-xl border border-dashed border-line bg-surface/60 p-4 text-sm text-dim">
          <strong className="text-ink">Aucun membre pour l'instant.</strong>{' '}
          Ajoute un membre avec le bouton « + » d'une colonne, importe une sauvegarde (bouton
          Importer en haut), ou charge la configuration officielle depuis l'onglet Organisation.
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={handleDragEnd}
        accessibility={{ screenReaderInstructions: { draggable:
          'Pour déplacer une carte : Espace ou Entrée pour la saisir, flèches pour la déplacer, Espace pour la déposer, Échap pour annuler.' } }}
      >
        <div className="flex gap-4 sm:gap-6 overflow-x-auto pb-6 items-start snap-x snap-mandatory sm:snap-none -mx-4 px-4 sm:mx-0 sm:px-0">
          {columns.map(column => (
            <KanbanColumn
              key={column.id}
              column={column}
              members={membersByColumn[column.id] || []}
              onAddMember={(columnId) => setMemberModal({ open: true, member: null, columnId })}
              onEditMember={(member) => setMemberModal({ open: true, member, columnId: member.columnId })}
            />
          ))}
          <div className="w-[85vw] max-w-80 sm:w-80 shrink-0 snap-start">
            {showAddColumn ? (
              <div className="bg-surface border border-line rounded-2xl p-4 space-y-3">
                <label htmlFor="new-column-title" className="text-xs font-semibold text-dim">Nom de la colonne</label>
                <input
                  id="new-column-title"
                  autoFocus
                  value={newColumnTitle}
                  onChange={(e) => setNewColumnTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddColumn();
                    if (e.key === 'Escape') { setShowAddColumn(false); setNewColumnTitle(''); }
                  }}
                  placeholder="Ex. Pôle Créatif"
                  className="w-full bg-elevated border border-line rounded-lg px-3 py-2 text-ink focus:outline-none focus:border-blue-500"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowAddColumn(false); setNewColumnTitle(''); }}
                    className="flex-1 btn-secondary text-sm">
                    Annuler
                  </button>
                  <button type="button" onClick={handleAddColumn} disabled={!newColumnTitle.trim()} className="flex-1 btn-primary text-sm disabled:opacity-50">
                    Créer
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddColumn(true)}
                className="w-full border-2 border-dashed border-line hover:border-line-strong rounded-2xl py-6 text-dim hover:text-ink text-sm font-medium transition-all flex items-center justify-center gap-2">
                <Plus size={18} aria-hidden="true" /> Ajouter une colonne
              </button>
            )}
          </div>
        </div>
      </DndContext>

      <MemberFormModal
        isOpen={memberModal.open}
        onClose={() => setMemberModal({ open: false, member: null, columnId: null })}
        member={memberModal.member}
        defaultColumnId={memberModal.columnId}
      />
    </>
  );
}
