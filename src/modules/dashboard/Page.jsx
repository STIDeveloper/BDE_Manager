import { useCallback, useMemo, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { navigate } from '../../core/router.js';
import { DEFAULT_ORGANIZATION } from '../../documents/context.js';
import UpcomingWidget from '../calendar/UpcomingWidget.jsx';
import { resolveLink, sectionAvailable } from '../calendar/sources.js';
import { useDashboardData } from './useDashboardData.js';
import { useDashboardStore } from './store.js';
import { hasFinance, hasMembership } from './sources.js';
import { resolveLayout } from './logic.js';
import {
  ActivityList, CustomizePanel, HealthBanner, KpiGrid, PoleBars, TodoList, TreasuryChart, Welcome,
} from './Widgets.jsx';

// Widgets occupant toute la largeur de la grille.
const WIDE = new Set(['kpis', 'todo']);

export default function DashboardPage() {
  const data = useDashboardData();
  const layout = useDashboardStore(s => s.layout);
  const setLayout = useDashboardStore(s => s.setLayout);
  const resetLayout = useDashboardStore(s => s.resetLayout);
  const [customizing, setCustomizing] = useState(false);
  const { order, hidden } = useMemo(() => resolveLayout(layout?.order, layout?.hidden), [layout]);

  /** Lien d'une action « À traiter » (null si la section n'existe pas). */
  const resolve = useCallback((action) => {
    if (!action) return null;
    if (action.link) return resolveLink({ link: action.link, fallbackLink: action.fallback });
    return sectionAvailable(action.section) ? action : null;
  }, []);

  const org = data.organization || {};
  const orgName = org.shortName || org.name || DEFAULT_ORGANIZATION.name;
  const isNew = data.realMembers.length === 0 && data.eventCount === 0;

  if (isNew) {
    const profileDone = !!(String(org.address || '').trim() && String(org.city || '').trim());
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Welcome steps={[
          { id: 'org', title: 'Le profil de l\'association', desc: 'Nom, adresse, RNA, logo : utilisés dans tous les documents officiels.', cta: profileDone ? 'Modifier' : 'Compléter', done: profileDone, onClick: () => navigate('documents') },
          { id: 'members', title: 'Ajouter les membres', desc: 'Le bureau et les pôles, avec leur rôle et leurs dates de mandat.', cta: 'Ajouter', done: false, onClick: () => navigate('kanban') },
          { id: 'event', title: 'Créer ton premier événement', desc: 'Soirée, réunion, AG… avec inscriptions, tâches et budget.', cta: 'Créer', done: false, onClick: () => navigate('events') },
        ]} />
        <UpcomingWidget limit={5} />
      </div>
    );
  }

  const render = (id) => {
    switch (id) {
      case 'kpis': return <KpiGrid data={data} hasFinance={hasFinance} hasMembership={hasMembership} />;
      case 'todo': return <TodoList items={data.todo} resolve={resolve} />;
      case 'upcoming': return <UpcomingWidget limit={6} />;
      case 'treasury': return <TreasuryChart treasury={data.treasury} available={hasFinance} />;
      case 'poles': return <PoleBars rows={data.poles} poleColor={data.poleColor} total={data.active.length || 1} />;
      case 'activity': return <ActivityList items={data.activity} now={data.today} />;
      default: return null;
    }
  };

  const visible = order.filter(id => !hidden.has(id));
  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <HealthBanner name={data.greetingName} orgName={orgName} year={data.year} health={data.health} />

      <div className="flex justify-end">
        <button type="button" className="btn-ghost text-xs" onClick={() => setCustomizing(c => !c)} aria-expanded={customizing}>
          <SlidersHorizontal size={14} aria-hidden="true" /> Personnaliser
        </button>
      </div>
      {customizing && (
        <CustomizePanel order={order} hidden={hidden} onChange={setLayout} onReset={resetLayout} onClose={() => setCustomizing(false)} />
      )}

      {visible.length === 0 ? (
        <p className="text-sm text-dim text-center py-6">Tous les widgets sont masqués. Utilise « Personnaliser » pour en réafficher.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {visible.map(id => (
            <div key={id} className={WIDE.has(id) ? 'lg:col-span-2' : ''} data-widget={id}>{render(id)}</div>
          ))}
        </div>
      )}
    </div>
  );
}
