import { useState, useRef, useId } from 'react';
import {
  FileUp, SlidersHorizontal, GitCompare, Network,
  Activity, LayoutDashboard, Bell, Users, PlayCircle, Lock, Settings2,
} from 'lucide-react';
import { useRolesStore } from '../../roleEngine/store.js';
import ImportPanel from './ImportPanel';
import WeightsPanel from './WeightsPanel';
import ScenarioCompare from './ScenarioCompare';
import OrgChartLive from './OrgChartLive';
import StabilityPanel from './StabilityPanel';
import DashboardPanel from './DashboardPanel';
import AlertsPanel from './AlertsPanel';
import ApplyChangesModal from './ApplyChangesModal';
import ConstraintsPanel from './ConstraintsPanel';
import RolesManager from './manager/RolesManager';

// Sous-onglet « Gestion des rôles » : le catalogue (pôles, niveaux, rôles,
// capacités) est éditable sans code. Aussi accessible en plein écran via
// le bouton ⚙ de l'en-tête de l'application.
function RolesManagerPage() {
  return <RolesManager variant="page" />;
}

/**
 * Sous-onglets du moteur. Pour en ajouter un (ex. « Gestion des rôles »),
 * il suffit d'ajouter une entrée :
 *   { id, label, icon, requiresData, Component }
 * `requiresData: true` → désactivé tant qu'aucun CSV n'est importé.
 * Chaque panneau reçoit la prop `onOpenRolesManager` (définie si un onglet
 * d'id ROLES_MANAGER_TAB existe, ou si le parent la fournit).
 */
export const ROLES_MANAGER_TAB = 'roles-manager';

const SUBTABS = [
  { id: ROLES_MANAGER_TAB, label: 'Gestion des rôles', icon: Settings2, requiresData: false, Component: RolesManagerPage },
  { id: 'import',      label: 'Import CSV',   icon: FileUp,            requiresData: false, Component: ImportPanel },
  { id: 'weights',     label: 'Pondération',  icon: SlidersHorizontal, requiresData: true,  Component: WeightsPanel },
  { id: 'constraints', label: 'Contraintes',  icon: Lock,              requiresData: true,  Component: ConstraintsPanel },
  { id: 'compare',     label: 'Comparer',     icon: GitCompare,        requiresData: true,  Component: ScenarioCompare },
  { id: 'orgchart',    label: 'Organigramme', icon: Network,           requiresData: true,  Component: OrgChartLive },
  { id: 'alerts',      label: 'Alertes',      icon: Bell,              requiresData: true,  Component: AlertsPanel },
  { id: 'stability',   label: 'Stabilité',    icon: Activity,          requiresData: true,  Component: StabilityPanel },
  { id: 'dashboard',   label: 'Dashboard',    icon: LayoutDashboard,   requiresData: true,  Component: DashboardPanel },
];

const DISABLED_HINT = 'Importe d\'abord le CSV des réponses (onglet « Import CSV ») pour accéder à cet onglet.';

/**
 * @param {object} props
 * @param {() => void} [props.onOpenRolesManager]  Navigation externe vers « Gestion des rôles »
 */
export default function RolesTab({ onOpenRolesManager }) {
  const [active, setActive] = useState('import');
  const [applyOpen, setApplyOpen] = useState(false);
  const tabRefs = useRef({});
  const baseId = `roles-tabs-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const candidateCount = useRolesStore(s => s.candidates.length);
  const scenarioCount = useRolesStore(s => s.scenarios.length);
  const hasScenario = useRolesStore(s => !!s.scenarios[s.selectedScenarioIndex]);
  const alertCount = useRolesStore(s => s.scenarios[s.selectedScenarioIndex]?.alerts?.length ?? 0);

  const hasData = candidateCount > 0;
  const isDisabled = (t) => t.requiresData && !hasData;
  // Si l'onglet actif devient indisponible (candidats effacés), retour à l'import
  const activeTab = SUBTABS.find(t => t.id === active && !isDisabled(t)) || SUBTABS[0];

  const openRolesManager = SUBTABS.some(t => t.id === ROLES_MANAGER_TAB)
    ? () => setActive(ROLES_MANAGER_TAB)
    : onOpenRolesManager;

  const selectTab = (t, focus = false) => {
    if (isDisabled(t)) return;
    setActive(t.id);
    if (focus) {
      const el = tabRefs.current[t.id];
      el?.focus();
      el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }
  };

  // Navigation clavier du tablist (flèches, Début, Fin) parmi les onglets actifs
  const onTabKeyDown = (e) => {
    const enabled = SUBTABS.filter(t => !isDisabled(t));
    const idx = enabled.findIndex(t => t.id === activeTab.id);
    let next = null;
    if (e.key === 'ArrowRight') next = enabled[(idx + 1) % enabled.length];
    else if (e.key === 'ArrowLeft') next = enabled[(idx - 1 + enabled.length) % enabled.length];
    else if (e.key === 'Home') next = enabled[0];
    else if (e.key === 'End') next = enabled[enabled.length - 1];
    if (!next) return;
    e.preventDefault();
    selectTab(next, true);
  };

  const ActivePanel = activeTab.Component;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-blue-500/10 p-2.5 rounded-xl shrink-0">
            <Users size={20} className="text-blue-500" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">Moteur de rôles intelligent</h2>
            <p className="text-xs text-dim">
              {hasData
                ? `${candidateCount} candidat${candidateCount > 1 ? 's' : ''} · ${scenarioCount} scénarios${alertCount ? ` · ${alertCount} alerte${alertCount > 1 ? 's' : ''}` : ''}`
                : 'Importe le CSV des réponses pour commencer.'}
            </p>
          </div>
        </div>

        {hasScenario && (
          <button
            type="button"
            onClick={() => setApplyOpen(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shadow-sm">
            <PlayCircle size={15} aria-hidden="true" />
            Appliquer au BDE
          </button>
        )}
      </div>

      <div
        role="tablist"
        aria-label="Sections du moteur de rôles"
        onKeyDown={onTabKeyDown}
        className="flex bg-elevated p-0.5 rounded-lg border border-line overflow-x-auto overscroll-x-contain snap-x [scrollbar-width:thin]"
      >
        {SUBTABS.map(t => {
          const Icon = t.icon;
          const isActive = activeTab.id === t.id;
          const disabled = isDisabled(t);
          const showBadge = t.id === 'alerts' && alertCount > 0;

          return (
            <button
              key={t.id}
              ref={(el) => { tabRefs.current[t.id] = el; }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${t.id}`}
              aria-selected={isActive}
              aria-controls={`${baseId}-panel`}
              aria-disabled={disabled || undefined}
              tabIndex={isActive ? 0 : -1}
              title={disabled ? DISABLED_HINT : undefined}
              onClick={() => selectTab(t)}
              className={`snap-start shrink-0 flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
                isActive
                  ? 'bg-surface text-ink shadow-sm'
                  : disabled
                    ? 'text-muted cursor-not-allowed opacity-60'
                    : 'text-dim hover:text-ink'
              }`}>
              <Icon size={13} aria-hidden="true" />
              {t.label}
              {showBadge && (
                <span className="text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5 font-bold min-w-[16px] text-center" aria-label={`${alertCount} alertes`}>
                  {alertCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!hasData && (
        <p className="text-[11px] text-muted -mt-3">{DISABLED_HINT.replace(' pour accéder à cet onglet', ' pour débloquer les autres onglets')}</p>
      )}

      <div role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${activeTab.id}`}>
        <ActivePanel onOpenRolesManager={openRolesManager} />
      </div>

      <ApplyChangesModal isOpen={applyOpen} onClose={() => setApplyOpen(false)} />
    </div>
  );
}
