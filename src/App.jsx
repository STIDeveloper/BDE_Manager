import { useEffect, useState, useCallback, useMemo, lazy, Suspense, useId } from 'react';
import {
  Lock, LayoutDashboard, BarChart3, FolderTree, Network, Settings2, FileText, Loader2,
  Home, CalendarDays, PartyPopper, Wallet, IdCard, Repeat, MoreHorizontal, X, ShieldCheck,
  ClipboardList, KanbanSquare,
} from 'lucide-react';
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
import { navigate, useRoute } from './core/router';
import SyncStatusBadge from './backend/SyncStatusBadge';

// Studio documents chargé à la demande (modèles + moteurs de rendu).
const DocumentsStudio = lazy(() => import('./components/documents/DocumentsStudio'));
// Page publique de vérification d'un document (lien du QR code imprimé).
const VerifyPage = lazy(() => import('./components/documents/VerifyPage'));
// Page répondant des formulaires (#/f/<slug>), livrée par le Studio Formulaires.
const publicFormLoader = Object.values(import.meta.glob('./forms/runtime/PublicFormPage.jsx'))[0];
const PublicFormPage = publicFormLoader ? lazy(publicFormLoader) : null;

// Écrans des modules : src/modules/<module>/Page.jsx, découverts
// automatiquement et chargés à la demande. Un module absent n'apparaît pas.
const modulePages = import.meta.glob('./modules/*/Page.jsx');
const MODULE_PAGES = Object.fromEntries(
  Object.entries(modulePages).map(([path, loader]) => [path.split('/')[2], lazy(loader)])
);

// Sections, groupées pour la barre latérale. `module` = écran de module.
const SECTIONS = [
  { group: 'Pilotage', items: [
    { id: 'dashboard', label: 'Accueil', short: 'Accueil', icon: Home, module: 'dashboard' },
    { id: 'calendar', label: 'Agenda', short: 'Agenda', icon: CalendarDays, module: 'calendar' },
    { id: 'tasks', label: 'Tâches', short: 'Tâches', icon: KanbanSquare, module: 'tasks' },
  ] },
  { group: 'Équipe', items: [
    { id: 'kanban', label: 'Membres', short: 'Membres', icon: LayoutDashboard },
    { id: 'membership', label: 'Adhésions', short: 'Adhésions', icon: IdCard, module: 'membership' },
    { id: 'org', label: 'Organisation', short: 'Orga', icon: Network },
    { id: 'handover', label: 'Passations', short: 'Passation', icon: Repeat, module: 'handover' },
  ] },
  { group: 'Activités', items: [
    { id: 'events', label: 'Événements', short: 'Événements', icon: PartyPopper, module: 'events' },
    { id: 'finance', label: 'Trésorerie', short: 'Tréso', icon: Wallet, module: 'finance' },
    { id: 'forms', label: 'Formulaires', short: 'Formulaires', icon: ClipboardList, module: 'forms' },
  ] },
  { group: 'Outils', items: [
    { id: 'documents', label: 'Documents', short: 'Docs', icon: FileText },
    { id: 'drive', label: 'Drive', short: 'Drive', icon: FolderTree },
    { id: 'stats', label: 'Statistiques', short: 'Stats', icon: BarChart3 },
    { id: 'sensitive', label: 'Coffre-fort', short: 'Coffre', icon: Lock },
    { id: 'team', label: 'Équipe & accès', short: 'Accès', icon: ShieldCheck, module: 'team' },
  ] },
];

// Routes publiques, affichées hors de la coque de l'application.
// #/f/<slug> : page répondant d'un formulaire (accès public, sans la coque).
const PUBLIC_SECTIONS = new Set(['verifier', 'f']);

// Sections affichées dans la barre inférieure mobile (le reste : menu « Plus »).
const MOBILE_PRIMARY = ['dashboard', 'kanban', 'calendar', 'documents'];

function Loading({ label = 'Chargement…' }) {
  return (
    <div role="status" className="flex items-center gap-2 text-sm text-dim py-10 justify-center">
      <Loader2 size={16} className="animate-spin" aria-hidden="true" /> {label}
    </div>
  );
}

function AppShell() {
  const theme = useStore(s => s.theme);
  const [rolesManagerOpen, setRolesManagerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const route = useRoute();
  const moreId = useId();

  // Sections disponibles (un module sans écran est masqué).
  const sections = useMemo(() => SECTIONS
    .map(g => ({ ...g, items: g.items.filter(i => !i.module || MODULE_PAGES[i.module]) }))
    .filter(g => g.items.length), []);
  const allItems = useMemo(() => sections.flatMap(g => g.items), [sections]);
  const defaultId = allItems.some(i => i.id === 'dashboard') ? 'dashboard' : 'kanban';
  const active = allItems.find(i => i.id === route.section) || allItems.find(i => i.id === defaultId);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(theme);
    root.style.colorScheme = theme;
  }, [theme]);

  // Ancien lien / URL vide : on normalise vers la section par défaut.
  useEffect(() => {
    // Les routes publiques (ex. #/verifier du QR code) ne sont jamais réécrites.
    if (PUBLIC_SECTIONS.has(route.section)) return;
    if (!allItems.some(i => i.id === route.section)) {
      window.history.replaceState(null, '', `#/${defaultId}`);
    }
  }, [route.section, allItems, defaultId]);

  useEffect(() => { window.scrollTo({ top: 0 }); }, [active.id]);

  const goTo = useCallback((id) => {
    setMoreOpen(false);
    if (id !== route.section) navigate(id);
  }, [route.section]);

  const renderSection = () => {
    if (active.module) {
      const Page = MODULE_PAGES[active.module];
      return (
        <Suspense fallback={<Loading label={`Chargement : ${active.label}…`} />}>
          <Page />
        </Suspense>
      );
    }
    switch (active.id) {
      case 'kanban': return <KanbanBoard />;
      case 'stats': return <Stats />;
      case 'org': return <OrganisationTab />;
      case 'drive': return <DriveManager />;
      case 'sensitive': return <Vault />;
      case 'documents': return <Suspense fallback={<Loading label="Chargement du studio documents…" />}><DocumentsStudio /></Suspense>;
      default: return null;
    }
  };

  const mobilePrimary = MOBILE_PRIMARY.map(id => allItems.find(i => i.id === id)).filter(Boolean);
  const activeInMore = !mobilePrimary.some(i => i.id === active.id);

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
            <span className="text-dim font-medium hidden sm:inline md:hidden">· {active.label}</span>
            <span className="sr-only"> — {active.label}</span>
          </h1>

          <div className="flex items-center gap-1 shrink-0 min-w-0">
            <button
              type="button"
              onClick={() => setRolesManagerOpen(true)}
              aria-label="Gestion des rôles, pôles et niveaux"
              title="Gestion des rôles (pôles, niveaux, capacités)"
              className="hidden sm:inline-flex bg-elevated hover:bg-line border border-line text-ink p-2 rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
            >
              <Settings2 size={16} aria-hidden="true" />
            </button>
            <SyncStatusBadge />
            <UndoButtons />
            {/* Sur mobile, sauvegarde / thème / rôles sont dans le menu « Plus ». */}
            <div className="hidden sm:flex items-center gap-1">
              <BackupButtons />
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Barre latérale (tablette / ordinateur) */}
        <nav aria-label="Sections" className="hidden md:flex flex-col w-52 lg:w-56 shrink-0 border-r border-line bg-surface/60 sticky top-[57px] self-start h-[calc(100dvh-57px)] overflow-y-auto py-3">
          {sections.map(g => (
            <div key={g.group} className="mb-3">
              <p className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{g.group}</p>
              <ul>
                {g.items.map(i => {
                  const Icon = i.icon;
                  const isActive = active.id === i.id;
                  return (
                    <li key={i.id}>
                      <button
                        type="button"
                        onClick={() => goTo(i.id)}
                        aria-current={isActive ? 'page' : undefined}
                        className={`w-[calc(100%-1rem)] mx-2 flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
                          isActive ? 'bg-blue-500/10 text-blue-500 font-semibold' : 'text-dim hover:text-ink hover:bg-elevated'
                        }`}
                      >
                        <Icon size={16} aria-hidden="true" />
                        {i.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <main id="main" tabIndex={-1} className="flex-1 min-w-0 w-full p-4 sm:p-6 pb-24 md:pb-6 focus:outline-none">
          {renderSection()}
        </main>
      </div>

      {/* Barre de navigation inférieure (mobile) */}
      <nav
        aria-label="Sections principales"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur-md border-t border-line pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid" style={{ gridTemplateColumns: `repeat(${mobilePrimary.length + 1}, minmax(0, 1fr))` }}>
          {mobilePrimary.map(t => {
            const Icon = t.icon;
            const isActive = active.id === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => goTo(t.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 min-h-[56px] text-[10px] font-medium transition-colors focus:outline-none focus-visible:bg-elevated ${isActive ? 'text-blue-500' : 'text-dim'}`}>
                <Icon size={20} aria-hidden="true" />
                <span className="truncate max-w-full px-1" aria-hidden="true">{t.short}</span>
                <span className="sr-only">{t.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(o => !o)}
            aria-expanded={moreOpen}
            aria-controls={moreId}
            className={`flex flex-col items-center justify-center gap-0.5 min-h-[56px] text-[10px] font-medium transition-colors focus:outline-none focus-visible:bg-elevated ${activeInMore || moreOpen ? 'text-blue-500' : 'text-dim'}`}>
            <MoreHorizontal size={20} aria-hidden="true" />
            <span aria-hidden="true">{activeInMore ? active.short : 'Plus'}</span>
            <span className="sr-only">Autres sections</span>
          </button>
        </div>
      </nav>

      {/* Menu « Plus » (mobile) */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-[45]" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
          <div
            id={moreId}
            role="dialog"
            aria-label="Toutes les sections"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === 'Escape') setMoreOpen(false); }}
            className="absolute inset-x-0 bottom-0 bg-surface border-t border-line rounded-t-2xl p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] max-h-[80dvh] overflow-y-auto animate-fade-in"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-ink">Toutes les sections</p>
              <button type="button" onClick={() => setMoreOpen(false)} aria-label="Fermer" className="tap p-2 text-dim hover:text-ink rounded-lg">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="mb-4 rounded-xl border border-line bg-elevated/60 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">Outils</p>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => { setMoreOpen(false); setRolesManagerOpen(true); }}
                  className="inline-flex items-center gap-1.5 bg-surface border border-line text-ink text-xs font-medium px-3 py-2 rounded-xl">
                  <Settings2 size={14} aria-hidden="true" /> Gestion des rôles
                </button>
                <BackupButtons />
                <ThemeToggle />
              </div>
            </div>
            {sections.map(g => (
              <div key={g.group} className="mb-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">{g.group}</p>
                <div className="grid grid-cols-3 gap-2">
                  {g.items.map(i => {
                    const Icon = i.icon;
                    const isActive = active.id === i.id;
                    return (
                      <button key={i.id} type="button" onClick={() => goTo(i.id)} aria-current={isActive ? 'page' : undefined}
                        className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-xs font-medium transition-colors ${isActive ? 'border-blue-500/40 bg-blue-500/10 text-blue-500' : 'border-line bg-elevated text-ink'}`}>
                        <Icon size={20} aria-hidden="true" />
                        {i.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {rolesManagerOpen && (
        <RolesManager variant="fullscreen" onClose={() => setRolesManagerOpen(false)} />
      )}

      <ToastContainer />
      <ConfirmHost />
    </div>
  );
}

export default function App() {
  const route = useRoute();
  // Route publique : affichée seule, sans la navigation de l'application.
  if (route.section === 'f' && PublicFormPage) {
    return (
      <Suspense fallback={<Loading label="Chargement du formulaire…" />}>
        <PublicFormPage />
        <ToastContainer />
      </Suspense>
    );
  }
  if (route.section === 'verifier') {
    return (
      <Suspense fallback={<Loading label="Chargement de la vérification…" />}>
        <VerifyPage />
        <ToastContainer />
      </Suspense>
    );
  }
  return <AppShell />;
}
