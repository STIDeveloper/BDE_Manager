import React, { useState, useMemo, useEffect } from 'react';
import { DndContext, closestCorners } from '@dnd-kit/core';
import { useStore } from './store';
import { needsMigration, migrateMainStore } from './core/migrations.js';
import KanbanColumn from './components/KanbanColumn';
import MemberFormModal from './components/MemberFormModal';
import FilterBar from './components/FilterBar';
import Stats from './components/Stats';
import Vault from './components/Vault';
import DriveManager from './components/DriveManager';
import OrganisationTab from './components/OrganisationTab';
import ThemeToggle from './components/ThemeToggle';
import BackupButtons from './components/BackupButtons';
import UndoButtons from './components/UndoButtons';
import { ToastContainer } from './components/ui/Toast';
import { toast } from './components/ui/toastStore';
import { Lock, LayoutDashboard, Plus, BarChart3, FolderTree, Network } from 'lucide-react';

// Migration automatique au démarrage
if (typeof window !== 'undefined' && !window.__BDE_MIGRATED__) {
  try {
    const raw = localStorage.getItem('bde-storage');
    if (raw) {
      const parsed = JSON.parse(raw);
      const state = parsed?.state;
      if (state && needsMigration(state)) {
        parsed.state = migrateMainStore(state);
        localStorage.setItem('bde-storage', JSON.stringify(parsed));
        console.log('[BDE Migration] Store migré →', parsed.state._migrationVersion);
      }
    }
  } catch (e) {
    console.warn('[BDE Migration] Échec silencieux :', e.message);
  }
  window.__BDE_MIGRATED__ = true;
}

export default function App() {
  const { columns, members, moveMember, addColumn, theme } = useStore();
  const [activeTab, setActiveTab] = useState('kanban');
  const [memberModal, setMemberModal] = useState({ open: false, member: null, columnId: null });
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const [filters, setFilters] = useState({ search: '', role: '', badge: '', columnId: '' });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(theme);
  }, [theme]);

  const filteredMembers = useMemo(() => {
    return members.filter(m => {
      const s = filters.search.toLowerCase();
      const matchSearch = !s ||
        m.firstName.toLowerCase().includes(s) ||
        (m.lastName || '').toLowerCase().includes(s) ||
        (m.mainRole || '').toLowerCase().includes(s) ||
        m.badges.some(b => b.toLowerCase().includes(s)) ||
        (m.notes || '').toLowerCase().includes(s);
      const matchRole = !filters.role || m.mainRole === filters.role;
      const matchBadge = !filters.badge || m.badges.includes(filters.badge);
      const matchColumn = !filters.columnId || m.columnId === filters.columnId;
      return matchSearch && matchRole && matchBadge && matchColumn;
    });
  }, [members, filters]);

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over) return;
    if (columns.some(col => col.id === over.id)) moveMember(active.id, over.id);
  };

  const handleAddColumn = () => {
    if (newColumnTitle.trim()) {
      addColumn(newColumnTitle.trim());
      setNewColumnTitle('');
      setShowAddColumn(false);
    }
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
    const hasUsefulData = filteredMembers.some(m =>
      (m.mainRole && m.mainRole.trim()) || (m.badges && m.badges.length > 0)
    );
    if (!hasUsefulData) {
      toast.warn('Données insuffisantes', 'Les membres exportés n\'ont ni rôle ni badge.');
      return;
    }

    const grouped = {};
    filteredMembers.forEach(m => {
      const col = columns.find(c => c.id === m.columnId);
      const title = col ? col.title : 'Sans pôle';
      (grouped[title] = grouped[title] || []).push(m);
    });

    let content = `📋 Liste des membres du BDE\n`;
    content += `👥 Total : ${filteredMembers.length} membre${filteredMembers.length > 1 ? 's' : ''}\n`;
    const hasFilters = filters.search || filters.role || filters.badge || filters.columnId;
    if (hasFilters) {
      content += `🔎 Filtres actifs :`;
      if (filters.search) content += ` recherche="${filters.search}"`;
      if (filters.role) content += ` rôle="${filters.role}"`;
      if (filters.badge) content += ` badge="${filters.badge}"`;
      content += `\n`;
    }
    content += `📅 Export du ${new Date().toLocaleDateString('fr-FR')}\n\n`;

    Object.entries(grouped).forEach(([title, list]) => {
      content += `\n*=== ${title} (${list.length}) ===*\n`;
      list.forEach(m => {
        content += `• *${m.firstName}${m.lastName ? ' ' + m.lastName : ''}*`;
        if (m.mainRole && m.mainRole.trim()) content += ` — ${m.mainRole}`;
        if (m.badges.length > 0) content += `\n   🏷️ ${m.badges.join(' • ')}`;
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
    URL.revokeObjectURL(url);

    toast.success(
      `${filteredMembers.length} membre${filteredMembers.length > 1 ? 's' : ''} exporté${filteredMembers.length > 1 ? 's' : ''}`,
      hasFilters ? 'Filtres appliqués' : 'Liste complète'
    );
  };

  const tabs = [
    { id: 'kanban',    label: 'Membres',      icon: LayoutDashboard },
    { id: 'stats',     label: 'Stats',        icon: BarChart3 },
    { id: 'org',       label: 'Organisation', icon: Network },
    { id: 'drive',     label: 'Drive',        icon: FolderTree },
    { id: 'sensitive', label: 'Coffre',       icon: Lock },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-base">
      <header className="bg-surface/95 backdrop-blur-md border-b border-line px-4 py-3 sticky top-0 z-40">
        <div className="mx-auto flex justify-between items-center flex-wrap gap-3" style={{ maxWidth: '100%' }}>
          <h1 className="text-[15px] font-bold tracking-tight text-ink flex items-center gap-2.5">
            <span className="bg-blue-600 text-white px-2 py-1 rounded-md text-xs font-bold">BDE</span>
            <span className="font-semibold">Manager</span>
          </h1>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-elevated p-0.5 rounded-lg border border-line">
              {tabs.map(t => {
                const Icon = t.icon;
                const isActive = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                      isActive ? 'bg-surface text-ink shadow-sm' : 'text-dim hover:text-ink'
                    }`}>
                    <Icon size={14} />
                    {t.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1">
              <UndoButtons />
              <BackupButtons />
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 w-full">
        {activeTab === 'kanban' && (
          <>
            <FilterBar
              filters={filters}
              setFilters={setFilters}
              resultCount={filteredMembers.length}
              onExportGlobal={exportGlobal}
            />
            <DndContext collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
              <div className="flex gap-6 overflow-x-auto pb-6 h-full items-start">
                {columns.map(column => (
                  <KanbanColumn
                    key={column.id}
                    column={column}
                    members={filteredMembers.filter(m => m.columnId === column.id)}
                    onAddMember={(columnId) => setMemberModal({ open: true, member: null, columnId })}
                    onEditMember={(member) => setMemberModal({ open: true, member, columnId: member.columnId })}
                  />
                ))}
                <div className="w-80 shrink-0">
                  {showAddColumn ? (
                    <div className="bg-surface border border-line rounded-2xl p-4 space-y-3">
                      <input
                        autoFocus
                        value={newColumnTitle}
                        onChange={(e) => setNewColumnTitle(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddColumn()}
                        placeholder="Nom du pôle..."
                        className="w-full bg-elevated border border-line rounded-lg px-3 py-2 text-ink focus:outline-none focus:border-blue-500"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setShowAddColumn(false); setNewColumnTitle(''); }}
                          className="flex-1 btn-secondary text-sm">
                          Annuler
                        </button>
                        <button onClick={handleAddColumn} className="flex-1 btn-primary text-sm">
                          Créer
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowAddColumn(true)}
                      className="w-full border-2 border-dashed border-line hover:border-line-strong rounded-2xl py-6 text-dim hover:text-ink text-sm font-medium transition-all flex items-center justify-center gap-2">
                      <Plus size={18} /> Ajouter une colonne
                    </button>
                  )}
                </div>
              </div>
            </DndContext>
          </>
        )}

        {activeTab === 'stats' && <Stats />}
        {activeTab === 'org' && <OrganisationTab />}
        {activeTab === 'drive' && <DriveManager />}
        {activeTab === 'sensitive' && <Vault />}
      </main>

      <MemberFormModal
        isOpen={memberModal.open}
        onClose={() => setMemberModal({ open: false, member: null, columnId: null })}
        member={memberModal.member}
        defaultColumnId={memberModal.columnId}
      />
      <ToastContainer />
    </div>
  );
}
