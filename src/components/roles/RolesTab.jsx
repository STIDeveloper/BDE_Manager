import React, { useState } from 'react';
import {
  FileUp, SlidersHorizontal, GitCompare, Network,
  Activity, LayoutDashboard, Bell, Users, PlayCircle, Lock,
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

const SUBTABS = [
  { id: 'import',      label: 'Import CSV',      icon: FileUp },
  { id: 'weights',     label: 'Pondération',     icon: SlidersHorizontal },
  { id: 'constraints', label: 'Contraintes',     icon: Lock },
  { id: 'compare',     label: 'Comparer',        icon: GitCompare },
  { id: 'orgchart',    label: 'Organigramme',    icon: Network },
  { id: 'alerts',      label: 'Alertes',         icon: Bell },
  { id: 'stability',   label: 'Stabilité',       icon: Activity },
  { id: 'dashboard',   label: 'Dashboard',       icon: LayoutDashboard },
];

export default function RolesTab() {
  const [active, setActive] = useState('import');
  const [applyOpen, setApplyOpen] = useState(false);
  const { candidates, scenarios, selectedScenarioIndex, getSelectedScenario } = useRolesStore();

  const selected = getSelectedScenario();
  const alertCount = selected ? selected.alerts.length : 0;
  const hasData = candidates.length > 0;
  const hasScenario = !!selected;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="bg-blue-500/10 p-2.5 rounded-xl">
            <Users size={20} className="text-blue-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-ink">Moteur de rôles intelligent</h2>
            <p className="text-xs text-dim">
              {hasData
                ? `${candidates.length} candidats · ${scenarios.length} scénarios${alertCount ? ` · ${alertCount} alertes` : ''}`
                : 'Importe le CSV des réponses pour commencer.'}
            </p>
          </div>
        </div>

        {hasScenario && (
          <button
            onClick={() => setApplyOpen(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shadow-sm">
            <PlayCircle size={15} />
            Appliquer au BDE
          </button>
        )}
      </div>

      <div className="flex bg-elevated p-0.5 rounded-lg border border-line overflow-x-auto">
        {SUBTABS.map(t => {
          const Icon = t.icon;
          const isActive = active === t.id;
          const showBadge = t.id === 'alerts' && alertCount > 0;
          const disabled = !hasData && t.id !== 'import';

          return (
            <button
              key={t.id}
              onClick={() => !disabled && setActive(t.id)}
              disabled={disabled}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-surface text-ink shadow-sm'
                  : disabled
                    ? 'text-muted cursor-not-allowed'
                    : 'text-dim hover:text-ink'
              }`}>
              <Icon size={13} />
              {t.label}
              {showBadge && (
                <span className="text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5 font-bold min-w-[16px] text-center">
                  {alertCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {active === 'import' && <ImportPanel />}
      {active === 'weights' && <WeightsPanel />}
      {active === 'constraints' && <ConstraintsPanel />}
      {active === 'compare' && <ScenarioCompare />}
      {active === 'orgchart' && <OrgChartLive />}
      {active === 'alerts' && <AlertsPanel />}
      {active === 'stability' && <StabilityPanel />}
      {active === 'dashboard' && <DashboardPanel />}

      <ApplyChangesModal isOpen={applyOpen} onClose={() => setApplyOpen(false)} />
    </div>
  );
}