import { useState } from 'react';
import { Network, Table, Lightbulb, Users } from 'lucide-react';
import OrgChart from './org/OrgChart';
import GovernanceMatrix from './org/GovernanceMatrix';
import Recommendations from './org/Recommendations';
import LoadBDEBanner from './org/LoadBDEBanner';
import RolesTab from './roles/RolesTab';

const TABS = [
  { id: 'chart',           label: 'Organigramme',       icon: Network },
  { id: 'matrix',          label: 'Gouvernance',        icon: Table },
  { id: 'recommendations', label: 'Recommandations',    icon: Lightbulb },
  { id: 'engine',          label: 'Moteur de rôles',    icon: Users },
];

export default function OrganisationTab() {
  const [active, setActive] = useState('chart');

  return (
    <div className="space-y-4">
      <LoadBDEBanner />

      <div role="tablist" aria-label="Sections Organisation" className="flex bg-elevated p-0.5 rounded-lg border border-line w-fit max-w-full overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon;
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                isActive ? 'bg-surface text-ink shadow-sm' : 'text-dim hover:text-ink'
              }`}>
              <Icon size={13} aria-hidden="true" /> {t.label}
            </button>
          );
        })}
      </div>

      {active === 'chart' && <OrgChart />}
      {active === 'matrix' && <GovernanceMatrix />}
      {active === 'recommendations' && <Recommendations />}
      {active === 'engine' && <RolesTab />}
    </div>
  );
}