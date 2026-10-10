import { useEffect, useState, useCallback } from 'react';
import { Lock, LayoutDashboard, BarChart3, FolderTree, Network, Settings2 } from 'lucide-react';
import { useStore } from './store';
import KanbanBoard from './components/KanbanBoard';
import Stats from './components/Stats';
import Vault from './components/Vault';
import DriveManager from './components/DriveManager';
import OrganisationTab from './components/OrganisationTab';
import ThemeToggle from './components/ThemeToggle';
import BackupButtons from './components/BackupButtons';
import UndoButtons from './components/UndoButtons';
import { ToastContainer } from './components/ui/Toast';
import ConfirmHost from './components/ui/ConfirmHost';
import RolesManager from './components/roles/manager/RolesManager';

const TABS = [
  { id: 'kanban',    label: 'Membres',      icon: LayoutDashboard },
  { id: 'stats',     label: 'Stats',        icon: BarChart3 },
  { id: 'org',       label: 'Organisation', icon: Network },
  { id: 'drive',     label: 'Drive',        icon: FolderTree },
  { id: 'sensitive', label: 'Coffre',       icon: Lock },
];
const TAB_IDS = new Set(TABS.map(t => t.id));

// L'onglet actif est reflété dans l'URL (#/drive…) : le rechargement, le
// bouton Retour et les raccourcis de l'application installée le conservent.
const readTabFromHash = () => {
  const id = window.location.hash.replace(/^#\/?/, '').split('/')[0];
  return TAB_IDS.has(id) ? id : 'kanban';
};

export default function App() {
  const theme = useStore(s => s.theme);
  const [activeTab, setActiveTab] = useState(readTabFromHash);
  const [rolesManagerOpen, setRolesManagerOpen] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(theme);
    root.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    const onHash = () => setActiveTab(readTabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const goTo = useCallback((id) => {
    if (id === activeTab) return;
    window.location.hash = `/${id}`;
    setActiveTab(id);
    window.scrollTo({ top: 0 });
  }, [activeTab]);

  const activeLabel = TABS.find(t => t.id === activeTab)?.label;

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col bg-base">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] btn-primary">
        Aller au contenu
      </a>

      <header className="bg-surface/95 backdrop-blur-md border-b border-line px-4 py-2.5 sticky top-0 z-40 pt-[max(0.625rem,env(safe-area-inset-top))]">
        <div className="flex justify-between items-center gap-3">
          <h1 className="text-[15px] font-bold tracking-tight text-ink flex items-center gap-2.5 shrink-0">
            <span className="bg-blue-600 text-white px-2 py-1 rounded-md text-xs font-bold" aria-hidden="true">BDE</span>
            <span className="font-semibold">Manager</span>
            <span className="sr-only"> — {activeLabel}</span>
          </h1>

          {/* Navigation principale (tablette / ordinateur) */}
          <nav aria-label="Sections" className="hidden md:block min-w-0">
            <div className="flex bg-elevated p-0.5 rounded-lg border border-line overflow-x-auto">
              {TABS.map(t => {
                const Icon = t.icon;
                const isActive = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => goTo(t.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
                      isActive ? 'bg-surface text-ink shadow-sm' : 'text-dim hover:text-ink'
                    }`}>
                    <Icon size={14} aria-hidden="true" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </nav>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setRolesManagerOpen(true)}
              aria-label="Gestion des rôles, pôles et niveaux"
              title="Gestion des rôles (pôles, niveaux, capacités)"
              className="bg-elevated hover:bg-line border border-line text-ink p-2 rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
            >
              <Settings2 size={16} aria-hidden="true" />
            </button>
            <UndoButtons />
            <BackupButtons />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="flex-1 w-full p-4 sm:p-6 pb-24 md:pb-6 focus:outline-none">
        {activeTab === 'kanban' && <KanbanBoard />}
        {activeTab === 'stats' && <Stats />}
        {activeTab === 'org' && <OrganisationTab />}
        {activeTab === 'drive' && <DriveManager />}
        {activeTab === 'sensitive' && <Vault />}
      </main>

      {/* Barre de navigation inférieure (mobile) — usage au pouce, style application */}
      <nav
        aria-label="Sections"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur-md border-t border-line pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-5">
          {TABS.map(t => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => goTo(t.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 min-h-[56px] text-[11px] font-medium transition-colors focus:outline-none focus-visible:bg-elevated ${
                  isActive ? 'text-blue-500' : 'text-dim'
                }`}>
                <Icon size={20} aria-hidden="true" />
                <span className="truncate max-w-full px-1">{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {rolesManagerOpen && (
        <RolesManager variant="fullscreen" onClose={() => setRolesManagerOpen(false)} />
      )}

      <ToastContainer />
      <ConfirmHost />
    </div>
  );
}
